/**
 * POST /api/chat/stream
 *
 * The "agentic" chat backend: spawns `claude` (Claude Code) with
 * `--output-format stream-json` and pipes the parsed events to the
 * browser as a typed Server-Sent Events stream.
 *
 * Body:
 *   { clientSlug, target, message, permissionMode?, model?, userTurnId?, assistantTurnId? }
 *
 * SSE event kinds (matches `AgentStreamItem` from `claude-code-agent.ts`):
 *   - session    : { sessionId }                    — captured once per stream
 *   - text_delta : { delta }                         — append to assistant content
 *   - event      : { event: ChatEvent }              — tool_use / thinking / todo / ...
 *   - stderr     : { chunk }                         — debug
 *   - done       : { success, interrupted, meta }    — final
 *   - error      : { message }
 *
 * Client side reads via `fetch()` + `response.body.getReader()` since
 * EventSource is GET-only. The body shape mirrors standard SSE so a
 * future GET variant could swap in without changing the wire format.
 *
 * Persistence: the route accumulates the assistant turn server-side
 * (content + events[]). On `done` (or on abort) it writes ONE
 * `ChatTurn` to the chat-store JSONL with `mode: "agentic"`.
 */
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";

import { getClient } from "@/lib/brain/index-db";
import { appendTurn, readHistory } from "@/lib/agents/chat-store";
import { readChatMeta, writeChatMeta } from "@/lib/agents/chat-meta";
import type { ChatEvent, ChatTurn } from "@/lib/agents/types";
import { MAX_HISTORY_TURNS, MAX_MESSAGE_BYTES } from "@/lib/agents/types";
import {
  buildOrchestratorContext,
  ORCHESTRATOR_SYSTEM_PROMPT,
} from "@/lib/agents/orchestrator";
import { buildSpecialistContext } from "@/lib/agents/specialist-chat";
import {
  MAX_ATTACHMENTS_PER_TURN,
  readAttachmentRecord,
} from "@/lib/agents/attachment-store";
import { vaultRoot } from "@/lib/brain/paths";
import { PermissionModeZ } from "@/lib/orchestrator/assignment";
import { emitClientEvent } from "@/lib/orchestrator/events";
import {
  runClaudeCodeAgent,
  type AgentStreamItem,
  type AgenticPermissionMode,
} from "@/lib/integrations/claude-code-agent";
import { selectProvider, type LLMMessage } from "@/lib/integrations/providers";
import { attemptDispatchFromText } from "@/lib/orchestrator/dispatch";
import { sameOriginWriteAllowed } from "@/lib/http/same-origin";

export const dynamic = "force-dynamic";
// We're spawning a subprocess that emits NDJSON for as long as the model
// keeps working. The dev-server default 5s response timeout would kill
// long agentic turns, so we explicitly opt out.
export const maxDuration = 600;

const Body = z.object({
  clientSlug: z.string().min(1),
  target: z.string().min(1),
  message: z.string().min(1).max(MAX_MESSAGE_BYTES),
  permissionMode: PermissionModeZ.default("auto"),
  model: z.string().max(120).optional(),
  /** SHA-256 ids of previously-uploaded attachments to surface to the
   *  agent. Inlined as `Read this file` hints in the system prompt so
   *  Claude Code can decide whether to open them via its native Read
   *  tool — the wire protocol doesn't support binary inlining yet. */
  attachments: z
    .array(
      z.object({
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .max(MAX_ATTACHMENTS_PER_TURN)
    .default([]),
  userTurnId: z.string().max(160).optional(),
  assistantTurnId: z.string().max(160).optional(),
});

export async function POST(req: NextRequest) {
  const allowed = sameOriginWriteAllowed(req);
  if (allowed !== true) return allowed;

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return jsonError(parsed.error.message, 400);
  }
  const {
    clientSlug,
    target,
    message,
    permissionMode,
    model,
    attachments,
    userTurnId,
    assistantTurnId,
  } = parsed.data;

  if (!getClient(clientSlug)) {
    return jsonError("client not found", 404);
  }

  // Build either the orchestrator context (canonical agentic chat) or a
  // specialist context (one specialist's persona + their most recent
  // audit). Both flow through the same Claude Code subprocess; only the
  // appended system prompt differs.
  let systemPromptPersona: string;
  let contextSnippet: string;
  try {
    if (target === "orchestrator") {
      systemPromptPersona = ORCHESTRATOR_SYSTEM_PROMPT;
      contextSnippet = await buildOrchestratorContext(clientSlug);
    } else {
      const specCtx = await buildSpecialistContext(clientSlug, target);
      systemPromptPersona = specCtx.systemPrompt;
      contextSnippet = specCtx.contextSnippet;
    }
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 400);
  }

  const priorTurns = await readHistory(clientSlug, target).catch(() => []);

  // Resolve attachment absolute paths so the agent can open them via
  // its native Read tool. The wire protocol doesn't support binary
  // inlining yet — we just point the model at the file on disk.
  const attachmentHints: string[] = [];
  const userAttachments: NonNullable<ChatTurn["attachments"]> = [];
  if (attachments.length > 0) {
    const root = path.resolve(vaultRoot(clientSlug), ".chat", "attachments");
    for (const att of attachments) {
      const record = await readAttachmentRecord(clientSlug, att.sha256);
      if (!record) continue;
      const ext = record.mime.split("/").pop() ?? "bin";
      const abs = path.join(root, `${att.sha256}.${ext}`);
      attachmentHints.push(
        `- ${record.filename} (${record.mime}, ${record.size} bytes) → ${abs}`,
      );
      userAttachments.push({
        sha256: record.sha256,
        filename: record.filename,
        mime: record.mime,
        size: record.size,
        preview_url: record.preview_url,
      });
    }
  }

  // Read the persisted session id so we can `--resume` it on this turn.
  const meta = await readChatMeta(clientSlug, target);
  const resumeId = meta.agentic_session_id;
  const resolvedModel = model ?? meta.model;
  let provider;
  try {
    provider = await selectProvider();
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 503);
  }
  // Persist the user turn only after provider selection succeeds. Otherwise
  // setup/configuration errors create orphan user prompts with no assistant
  // response in history.
  const userTurn: ChatTurn = {
    id: safeClientTurnId(userTurnId),
    role: "user",
    content: message,
    ts: new Date().toISOString(),
    mode: "agentic",
    ...(userAttachments.length > 0 ? { attachments: userAttachments } : {}),
  };
  await appendTurn(clientSlug, target, userTurn);
  const fallbackMessages: LLMMessage[] = [
    ...priorTurns
      .slice(-MAX_HISTORY_TURNS)
      .filter((t) => t.content.trim().length > 0)
      .map((t) => ({
        role: t.role,
        content: t.content,
      })),
    { role: "user", content: message },
  ];
  const attachmentSection = attachmentHints.length
    ? [
        "## Attachments the user attached to this turn",
        "",
        "These files are saved to disk under the client's vault. Use the",
        "Read tool to open any you need to answer the question.",
        "",
        ...attachmentHints,
      ].join("\n")
    : "";

  // Assemble the append-system-prompt that injects our persona +
  // state snapshot (+ optional attachments block) into Claude Code's
  // default system prompt. Persona before snapshot so the snapshot is
  // the freshest thing in context.
  const appendSystemPrompt = [
    systemPromptPersona,
    "",
    "---",
    "",
    contextSnippet,
    ...(attachmentSection ? ["", "---", "", attachmentSection] : []),
  ].join("\n");

  const encoder = new TextEncoder();
  // Server-side accumulator that becomes the final persisted ChatTurn.
  const accumulated: {
    content: string;
    events: ChatEvent[];
    interrupted: boolean;
    sessionId?: string;
    meta: ChatTurn["meta"];
  } = {
    content: "",
    events: [],
    interrupted: false,
    meta: {},
  };

  // The single "Stop" affordance is the client closing the stream. The
  // request's AbortSignal fires when that happens; we pass it to the
  // agent wrapper which SIGTERMs the subprocess.
  const ac = new AbortController();
  req.signal.addEventListener("abort", () => ac.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(kind: AgentStreamItem["kind"], payload: unknown): void {
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${kind}\ndata: ${JSON.stringify(payload)}\n\n`,
            ),
          );
        } catch {
          /* stream closed mid-write — abort already in motion */
        }
      }

      let finalDonePayload: Record<string, unknown> | null = null;

      // Initial comment so the browser sees the response start
      // immediately (avoids a 5–10s "still pending" feel under some
      // proxies). Same trick as /jobs/stream.
      controller.enqueue(encoder.encode(`: connected\n\n`));

      // Emit "the orchestrator is thinking" onto the per-client bus so
      // the 3D office can pulse the pawn + brain while the LLM is mid-
      // call. Only fires for the orchestrator target — specialist chats
      // get their own desk-lighting via job_started elsewhere.
      const agenticTurnId = `agentic-${randomUUID()}`;
      const emitsThinking = target === "orchestrator";
      let thinkingEnded = false;
      function endThinking(): void {
        if (thinkingEnded || !emitsThinking) return;
        thinkingEnded = true;
        try {
          emitClientEvent(
            clientSlug,
            "orchestrator_thinking_end",
            agenticTurnId,
            "orchestrator",
          );
        } catch {
          /* never let a bus issue break the stream */
        }
      }
      if (emitsThinking) {
        try {
          emitClientEvent(
            clientSlug,
            "orchestrator_thinking_start",
            agenticTurnId,
            "orchestrator",
          );
        } catch {
          /* additive — bus failure must not break the response */
        }
      }
      // Cover the abort path — when the client closes the stream
      // mid-flight, we need to end-fire before the SIGTERM cascade so
      // the office doesn't latch the pawn animation on.
      req.signal.addEventListener("abort", endThinking, { once: true });

      try {
        if (provider.id === "claude-cli") {
          for await (const item of runClaudeCodeAgent({
            prompt: message,
            resumeSessionId: resumeId,
            permissionMode: permissionMode as AgenticPermissionMode,
            model: resolvedModel,
            appendSystemPrompt,
            // Subprocess jail — bound the spawned `claude` to this client's
            // vault only. Translates to one or more `--add-dir <abs path>`
            // CLI flags inside buildArgs(). Without this, `full_access`
            // mode (--permission-mode bypassPermissions) grants the model
            // unrestricted Bash + filesystem on the user's machine; with
            // it, even bypass-mode operations can only touch the client
            // vault root. Defense-in-depth for project hard rule #1
            // (".seo-office/ is sacred user data") + the multi-tenant
            // model — a runaway specialist can't escape its own client.
            addDirs: [vaultRoot(clientSlug)],
            signal: ac.signal,
          })) {
            switch (item.kind) {
              case "session":
                accumulated.sessionId = item.sessionId;
                send("session", { sessionId: item.sessionId });
                break;
              case "text_delta":
                accumulated.content += item.delta;
                send("text_delta", { delta: item.delta });
                break;
              case "event":
                accumulated.events.push(item.event);
                send("event", { event: item.event });
                break;
              case "stderr":
                // Don't pollute the chat with every line of stderr — keep
                // it for the network panel only.
                send("stderr", { chunk: item.chunk });
                break;
              case "done":
                accumulated.interrupted = item.interrupted;
                accumulated.meta = {
                  ...accumulated.meta,
                  ...(item.durationMs !== undefined
                    ? { durationMs: item.durationMs }
                    : {}),
                  ...(item.costUsd !== undefined ? { costUsd: item.costUsd } : {}),
                  ...(item.usage?.input_tokens !== undefined
                    ? { inputTokens: item.usage.input_tokens }
                    : {}),
                  ...(item.usage?.output_tokens !== undefined
                    ? { outputTokens: item.usage.output_tokens }
                    : {}),
                  ...(item.usage?.cache_read_input_tokens !== undefined
                    ? { cacheReadInputTokens: item.usage.cache_read_input_tokens }
                    : {}),
                  ...(item.usage?.cache_creation_input_tokens !== undefined
                    ? {
                        cacheCreationInputTokens:
                          item.usage.cache_creation_input_tokens,
                      }
                    : {}),
                  ...(item.sessionId ? { sessionId: item.sessionId } : {}),
                  ...(resolvedModel ? { model: resolvedModel } : {}),
                };
                finalDonePayload = {
                  success: item.success,
                  interrupted: item.interrupted,
                  exitCode: item.exitCode,
                  meta: accumulated.meta,
                };
                break;
              case "error":
                send("error", { message: item.message });
                break;
            }
          }
        } else {
          const result = await provider.chat({
            tier: "synthesis",
            model: resolvedModel,
            systemPrompt: appendSystemPrompt,
            messages: fallbackMessages,
            timeoutMs: 5 * 60_000,
            thinking: { enabled: Boolean(meta.thinking) },
          });
          accumulated.content = result.text;
          accumulated.meta = {
            ...accumulated.meta,
            model: result.model ?? provider.id,
            ...(result.durationMs !== undefined
              ? { durationMs: result.durationMs }
              : {}),
            ...(result.costUsd !== undefined ? { costUsd: result.costUsd } : {}),
            ...(result.usage?.inputTokens !== undefined
              ? { inputTokens: result.usage.inputTokens }
              : {}),
            ...(result.usage?.outputTokens !== undefined
              ? { outputTokens: result.usage.outputTokens }
              : {}),
            ...(result.usage?.cacheReadInputTokens !== undefined
              ? { cacheReadInputTokens: result.usage.cacheReadInputTokens }
              : {}),
            ...(result.usage?.cacheCreationInputTokens !== undefined
              ? { cacheCreationInputTokens: result.usage.cacheCreationInputTokens }
              : {}),
          };
          if (result.text) send("text_delta", { delta: result.text });
          finalDonePayload = {
            success: true,
            interrupted: false,
            meta: accumulated.meta,
          };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!accumulated.content.trim()) {
          accumulated.content = `_Error: ${message}_`;
        }
        finalDonePayload = {
          success: false,
          interrupted: ac.signal.aborted,
          meta: accumulated.meta,
        };
        send("error", {
          message,
        });
      }

      // End-fire the thinking event whether the stream completed
      // cleanly, errored, or was aborted.
      endThinking();

      if (
        target === "orchestrator" &&
        !accumulated.interrupted &&
        accumulated.content.trim()
      ) {
        try {
          const dispatched = await attemptDispatchFromText(accumulated.content, {
            clientSlug,
            permissionMode,
            userMessage: message,
          });
          if (dispatched.kind) {
            accumulated.content =
              dispatched.cleanedText.trim() || dispatchFallbackText(dispatched);
            const dispatchEvent: ChatEvent = {
              kind: "tool_result",
              name: "orchestrator_dispatch",
              output: dispatchEventSummary(dispatched),
            };
            accumulated.events.push(dispatchEvent);
            send("event", { event: dispatchEvent });
          } else {
            accumulated.content = dispatched.cleanedText;
          }
        } catch (err) {
          const dispatchEvent: ChatEvent = {
            kind: "tool_result",
            name: "orchestrator_dispatch",
            error: true,
            output: err instanceof Error ? err.message : String(err),
          };
          accumulated.events.push(dispatchEvent);
          send("event", { event: dispatchEvent });
        }
      }

      // Persist the assistant turn — even on interrupt / error, write
      // what we accumulated so the user can see the partial work.
      const assistantTurn: ChatTurn = {
        id: safeClientTurnId(assistantTurnId) ?? randomUUID(),
        role: "assistant",
        content: accumulated.content,
        ts: new Date().toISOString(),
        mode: "agentic",
        ...(accumulated.events.length > 0
          ? { events: accumulated.events }
          : {}),
        ...(accumulated.interrupted ? { interrupted: true } : {}),
        ...(accumulated.meta && Object.keys(accumulated.meta).length > 0
          ? { meta: accumulated.meta }
          : {}),
      };
      try {
        await appendTurn(clientSlug, target, assistantTurn);
      } catch {
        /* persistence failed — we still emitted the stream */
      }

      // Roll forward the session id so the next agentic turn resumes
      // the same Claude Code conversation.
      if (accumulated.sessionId && accumulated.sessionId !== resumeId) {
        try {
          await writeChatMeta(clientSlug, target, {
            agentic_session_id: accumulated.sessionId,
          });
        } catch {
          /* best-effort */
        }
      }

      send("done", {
        ...(finalDonePayload ?? {
          success: !accumulated.interrupted,
          interrupted: accumulated.interrupted,
        }),
        content: accumulated.content,
        meta: accumulated.meta,
      });

      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeClientTurnId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  if (!/^[A-Za-z0-9:_-]{1,160}$/.test(id)) return undefined;
  return id;
}

function dispatchFallbackText(
  dispatched: Awaited<ReturnType<typeof attemptDispatchFromText>>,
): string {
  if (dispatched.kind === "plan_tree") return "Spawning specialist agents.";
  if (dispatched.kind === "assign_task") return "Assigned the specialist task.";
  if (dispatched.kind === "legacy") return "Started the proposed specialist task.";
  return "";
}

function dispatchEventSummary(
  dispatched: Awaited<ReturnType<typeof attemptDispatchFromText>>,
): string {
  if (dispatched.kind === "plan_tree" && dispatched.plan) {
    const parts = [
      `plan_tree`,
      `root: ${dispatched.plan.rootTaskId}`,
      `spawning: ${dispatched.plan.dispatched}`,
      `skipped: ${dispatched.plan.skipped}`,
    ];
    if (dispatched.plan.templateId) parts.push(`template: ${dispatched.plan.templateId}`);
    return parts.join("\n");
  }
  if (
    (dispatched.kind === "assign_task" || dispatched.kind === "legacy") &&
    dispatched.assignment
  ) {
    return [
      dispatched.kind,
      `assignment: ${dispatched.assignment.id}`,
      `specialist: ${dispatched.assignment.specialist_id}`,
      `status: ${dispatched.assignment.status}`,
    ].join("\n");
  }
  return dispatched.kind ?? "no dispatch";
}
