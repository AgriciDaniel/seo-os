/**
 * Conversational layer — talking to the orchestrator or to a specialist.
 *
 * Each conversation is keyed by (clientSlug, target). `target` is either
 * the literal "orchestrator" or a registered specialist id like
 * "technical-auditor". Histories are persisted on disk per (slug, target)
 * tuple in `.seo-office/vaults/<slug>/.chat/<target>.jsonl`.
 *
 * Pure types + constants only — NO `"server-only"` import. Both the SSE
 * route on the server and the EventLine renderer on the client import
 * `ChatEvent` from here so the wire shape stays in lockstep.
 */

export type AgentTarget = "orchestrator" | (string & { __agent?: never });

/** Reference to a content-addressed attachment. The binary lives on disk
 *  under .chat/attachments/<sha256>.<ext>; this is the pointer carried on
 *  the turn. The chat route resolves sha256 → base64 before invoking the
 *  Anthropic SDK, so renderers only ever see metadata. */
export interface AttachmentRef {
  /** sha256 — same as `id`. */
  sha256: string;
  /** Original (sanitised) filename. */
  filename: string;
  /** MIME type. */
  mime: string;
  /** Bytes on disk. */
  size: number;
  /** Convenience URL for the renderer; matches the route at
   *  /api/chat/attachments/<sha256>?slug=<slug>. */
  preview_url?: string;
}

/**
 * Structured timeline event attached to an assistant turn. Renders as a
 * collapsible block above the message body. Populated by the agentic
 * chat backend (`/api/chat/stream`) when Claude Code emits stream-json
 * events; left empty by the simple `/api/chat` endpoint.
 *
 * Keeping this in the shared types module so the SSE route on the
 * server and the EventLine renderer on the client speak the same union.
 */
export type ChatEvent =
  | { kind: "tool_use"; name: string; input?: Record<string, unknown>; id?: string }
  | { kind: "tool_result"; name: string; output?: string; error?: boolean; tool_use_id?: string }
  | { kind: "file_read"; path: string; range?: string; id?: string }
  | { kind: "file_edit"; path: string; summary?: string; id?: string }
  | {
      kind: "bash";
      command: string;
      stdout?: string;
      stderr?: string;
      exitCode?: number;
      id?: string;
    }
  /** A Claude Code "thinking" content block — the model's internal
   *  reasoning. Rendered as a collapsed "Thought for Ns" box. */
  | { kind: "thinking"; text: string; durationMs?: number }
  /** A TodoWrite tool call from Claude Code. Rendered as a live
   *  checklist that updates in place when the same turn emits another
   *  TodoWrite (the renderer keys by index, so later todos overwrite
   *  earlier ones for the same turn). */
  | {
      kind: "todo_update";
      todos: Array<{
        content: string;
        activeForm?: string;
        status: "pending" | "in_progress" | "completed";
      }>;
    };

export type ChatMode = "simple" | "agentic";

export interface ChatTurn {
  /** Stable id — drives React key stability in the renderer and survives
   *  re-renders / re-orderings. Optional on the type because legacy turns
   *  persisted before v0.1.8 don't have one; chat-store back-fills on read. */
  id?: string;
  role: "user" | "assistant";
  content: string;
  ts: string;
  /** Attachments uploaded with this turn. User turns only; assistants
   *  may reference these but don't create new ones in v0.1.8. */
  attachments?: AttachmentRef[];
  /** Sidecar timeline events (tool calls, thinking, todos, etc.).
   *  Populated only by the agentic backend. */
  events?: ChatEvent[];
  /** Which backend produced this turn. Drives "agentic" badges on
   *  replay. Absent on legacy turns; treat as `"simple"`. */
  mode?: ChatMode;
  /** True if the agentic stream was stopped before the model finished.
   *  The renderer uses this to surface a "stopped" pill on the turn. */
  interrupted?: boolean;
  /** Reported by the model when the turn completes. */
  meta?: {
    model?: string;
    durationMs?: number;
    costUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
    /** Claude Code session id for `--resume` on the next turn. */
    sessionId?: string;
  };
}

/** Max turns we replay into the model on each request (cost cap). */
export const MAX_HISTORY_TURNS = 16;

/** Hard upper bound on user message bytes before the chat route rejects. */
export const MAX_MESSAGE_BYTES = 32_768;
