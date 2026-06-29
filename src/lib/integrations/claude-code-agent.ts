/**
 * Claude Code agent subprocess wrapper.
 *
 * Spawns the `claude` CLI in `--print --output-format stream-json` mode,
 * parses its NDJSON output via `stream-json-parser.ts`, and yields a
 * tagged-union async iterator of typed events the SSE route can pipe
 * onto the wire.
 *
 * Lifecycle:
 *   1. Caller invokes `runClaudeCodeAgent(opts)` → returns an
 *      `AsyncIterable<AgentStreamItem>`.
 *   2. Caller `for await`s the iterator. The subprocess spawns on
 *      first await.
 *   3. On AbortSignal abort, the wrapper sends SIGTERM, waits 2s, then
 *      SIGKILL. Iterator returns gracefully with a final
 *      `{ kind: "done", success: false, interrupted: true }`.
 *   4. On natural exit, the final `{ type: "result" }` line yields a
 *      `{ kind: "done", success, meta }` and the iterator completes.
 *
 * Why a new file instead of touching `claude-cli.ts`:
 *   `claude-cli.ts` implements the synchronous `LLMProvider.chat()`
 *   contract used by all ~27 specialists. This file is the *agent*
 *   backend — streaming, multi-turn, tool-bearing. They share zero
 *   semantics. A future refactor can pull `spawnCapture()` into a
 *   shared util; out of scope here. See plan file for details.
 */
import "server-only";

import type { ChatEvent } from "@/lib/agents/types";
import { spawnCapture } from "./_lib/spawn-capture";
import {
  flushNdjsonBuf,
  makeNdjsonBuf,
  makeTranslatorState,
  parseStreamJsonChunk,
  translateLineToEvents,
  type StreamUsage,
} from "./_lib/stream-json-parser";

export type AgenticPermissionMode =
  | "plan"
  | "read_only"
  | "auto"
  | "full_access";

export interface ClaudeCodeAgentOpts {
  /** The user's message for this turn. */
  prompt: string;
  /** Optional Claude Code session id to resume. New session if omitted. */
  resumeSessionId?: string;
  /** Working dir for the subprocess. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Our 4-mode permission model; mapped to `--permission-mode` + tool gates. */
  permissionMode: AgenticPermissionMode;
  /** Model id (e.g. `claude-opus-4-7`, `claude-sonnet-4-6`, or `""` for default). */
  model?: string;
  /** Appended to Claude Code's default system prompt — used to inject
   *  the SEO Office orchestrator context (client, hot.md, recent
   *  audits, registered specialists, plan templates). */
  appendSystemPrompt?: string;
  /** Optional `--add-dir` entries so the agent can read outside `cwd`
   *  (e.g. when cwd is a client vault and we also want the agent to
   *  see the project source). Empty by default. */
  addDirs?: string[];
  /** AbortSignal that terminates the subprocess on abort. */
  signal?: AbortSignal;
  /** Override the resolved `claude` binary path. Defaults to `claude`
   *  on PATH. Useful for tests; production should leave unset. */
  bin?: string;
}

/** Tagged-union events the SSE route streams onward. */
export type AgentStreamItem =
  | { kind: "session"; sessionId: string }
  | { kind: "event"; event: ChatEvent }
  | { kind: "text_delta"; delta: string }
  | { kind: "stderr"; chunk: string }
  | {
      kind: "done";
      success: boolean;
      interrupted: boolean;
      sessionId?: string;
      durationMs?: number;
      costUsd?: number;
      usage?: StreamUsage;
      exitCode: number | null;
    }
  | { kind: "error"; message: string };

const SIGKILL_GRACE_MS = 2000;

/**
 * Run one agent turn. Returns an async iterator of typed events.
 * The subprocess is spawned lazily on the first `next()` so callers
 * can wire abort + listeners before any work happens.
 */
export function runClaudeCodeAgent(
  opts: ClaudeCodeAgentOpts,
): AsyncIterable<AgentStreamItem> {
  return {
    [Symbol.asyncIterator]: () => createIterator(opts),
  };
}

/* -------------------------------------------------------------------------- */
/* internals                                                                   */
/* -------------------------------------------------------------------------- */

function createIterator(
  opts: ClaudeCodeAgentOpts,
): AsyncIterator<AgentStreamItem> {
  const queue: AgentStreamItem[] = [];
  let waiter: ((v: IteratorResult<AgentStreamItem>) => void) | null = null;
  let closed = false;
  let interrupted = false;

  // Local controller. Triggered by either the caller's signal aborting
  // or `iterator.return()` being called (when the SSE response closes).
  // Forwarding both into one controller lets `spawnCapture` own the
  // SIGTERM→SIGKILL cascade in one place.
  const ac = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) ac.abort();
    else opts.signal.addEventListener("abort", () => ac.abort(), { once: true });
  }
  ac.signal.addEventListener(
    "abort",
    () => {
      interrupted = true;
      push({ kind: "stderr", chunk: "agent: client aborted\n" });
    },
    { once: true },
  );

  function push(item: AgentStreamItem): void {
    if (closed) return;
    if (waiter) {
      const w = waiter;
      waiter = null;
      w({ value: item, done: false });
    } else {
      queue.push(item);
    }
  }

  function close(): void {
    if (closed) return;
    closed = true;
    if (waiter) {
      const w = waiter;
      waiter = null;
      w({ value: undefined, done: true });
    }
  }

  function start(): void {
    const bin = opts.bin ?? "claude";
    const args = buildArgs(opts);

    // Parser state — threaded across both live stdout chunks and the
    // trailing-partial flush at close.
    const buf = makeNdjsonBuf();
    const state = makeTranslatorState();
    let captured: Extract<AgentStreamItem, { kind: "done" }> | null = null;
    // Session id is captured by the translator on the `system{subtype:init}`
    // line. Push it onto the stream the instant it changes — saves a
    // round-trip vs. waiting for the terminal `result` event, which is
    // what the route uses to write `agentic_session_id` to chat-meta
    // before the next turn fires.
    let lastSession: string | null = null;
    function pushSessionIfChanged(): void {
      if (state.sessionId && state.sessionId !== lastSession) {
        lastSession = state.sessionId;
        push({ kind: "session", sessionId: state.sessionId });
      }
    }

    function processLine(line: ReturnType<typeof parseStreamJsonChunk> extends Generator<infer L> ? L : never, exitCode: number | null): void {
      const translated = translateLineToEvents(line, state);
      pushSessionIfChanged();
      if (translated.textDelta) {
        push({ kind: "text_delta", delta: translated.textDelta });
      }
      for (const ev of translated.events) {
        push({ kind: "event", event: ev });
      }
      if (translated.result) {
        captured = {
          kind: "done",
          success: translated.result.success,
          interrupted: false,
          sessionId: translated.result.sessionId,
          durationMs: translated.result.durationMs,
          costUsd: translated.result.costUsd,
          usage: translated.result.usage,
          exitCode,
        };
      }
    }

    spawnCapture("env", ["--", bin, ...args], {
      ...(opts.cwd ? { cwd: opts.cwd } : {}),
      input: opts.prompt,
      signal: ac.signal,
      sigkillGraceMs: SIGKILL_GRACE_MS,
      onStdout: (chunk) => {
        try {
          for (const line of parseStreamJsonChunk(buf, chunk)) {
            processLine(line, null);
          }
        } catch (err) {
          push({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      },
      onStderr: (chunk) => {
        push({ kind: "stderr", chunk });
      },
    }).then((result) => {
      // Flush trailing partial line (if any) — same processing as
      // live chunks but with the final exit code in the captured event.
      try {
        for (const line of flushNdjsonBuf(buf)) {
          processLine(line, result.exitCode);
        }
      } catch {
        /* ignore — same logic as the live path's catch */
      }
      pushSessionIfChanged();

      // Synchronous spawn failure surfaces here too — spawnCapture maps
      // both to exitCode -1 with the error message in stderr. Preserve
      // the legacy "error event then done event" sequence so the SSE
      // route can distinguish failure mode from interrupt.
      if (result.exitCode === -1 && !captured && result.stderr) {
        push({ kind: "error", message: result.stderr });
      }

      if (!captured) {
        captured = {
          kind: "done",
          success: result.exitCode === 0 && !interrupted,
          interrupted,
          sessionId: state.sessionId ?? undefined,
          exitCode: result.exitCode,
        };
      } else {
        captured = { ...captured, exitCode: result.exitCode, interrupted };
      }
      push(captured);
      close();
    });
  }

  let started = false;
  return {
    async next(): Promise<IteratorResult<AgentStreamItem>> {
      if (!started) {
        started = true;
        start();
      }
      if (queue.length > 0) {
        const item = queue.shift()!;
        return { value: item, done: false };
      }
      if (closed) return { value: undefined, done: true };
      return new Promise<IteratorResult<AgentStreamItem>>((resolve) => {
        waiter = resolve;
      });
    },
    async return(): Promise<IteratorResult<AgentStreamItem>> {
      // Trigger our local controller — spawnCapture forwards SIGTERM
      // and escalates to SIGKILL after `SIGKILL_GRACE_MS`. The interrupt
      // listener on `ac.signal` also flips `interrupted` so the final
      // `done` event carries the right flag.
      ac.abort();
      close();
      return { value: undefined, done: true };
    },
  };
}

/* -------------------------------------------------------------------------- */
/* CLI arg builder                                                             */
/* -------------------------------------------------------------------------- */

function buildArgs(opts: ClaudeCodeAgentOpts): string[] {
  const args: string[] = [
    "--print",
    "--output-format",
    "stream-json",
    "--verbose",
    // Stream content-block deltas live so the user sees text grow
    // token-by-token instead of one block appearing at message_stop.
    // The parser handles the `stream_event` wrapper and dedups the
    // final assembled assistant message.
    "--include-partial-messages",
    "--input-format",
    "text",
  ];

  // Permission-mode mapping. Our 4-mode model → Claude Code flags.
  switch (opts.permissionMode) {
    case "plan":
      args.push("--permission-mode", "plan");
      break;
    case "read_only":
      args.push("--permission-mode", "plan");
      args.push("--disallowed-tools", "Edit", "Write", "Bash", "NotebookEdit");
      break;
    case "auto":
      args.push("--permission-mode", "acceptEdits");
      break;
    case "full_access":
      args.push("--permission-mode", "bypassPermissions");
      break;
  }

  if (opts.resumeSessionId) {
    args.push("--resume", opts.resumeSessionId);
  }

  if (opts.model && opts.model !== "") {
    args.push("--model", opts.model);
  }

  if (opts.appendSystemPrompt && opts.appendSystemPrompt.trim()) {
    args.push("--append-system-prompt", opts.appendSystemPrompt);
  }

  for (const dir of opts.addDirs ?? []) {
    args.push("--add-dir", dir);
  }

  // Note: NO trailing positional prompt arg — the prompt arrives on stdin
  // because some prompts are larger than POSIX argv allows and writing
  // them on stdin keeps shells out of the picture entirely. `--print`
  // reads stdin as the user's message when no positional prompt is given.

  return args;
}
