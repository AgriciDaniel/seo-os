/**
 * Parser for the Claude Code CLI's `--output-format stream-json` output.
 *
 * Two layers, deliberately separated so each is unit-testable:
 *
 *   1. `parseStreamJsonChunk(buf, chunk)` — pure NDJSON tokenizer. Takes
 *      a buffer object and a string chunk, yields parsed JSON lines. Skips
 *      malformed lines (never throws). Tolerates partial lines across
 *      chunk boundaries.
 *
 *   2. `translateLineToEvents(line, ctx)` — maps a parsed stream-json
 *      object into ChatEvent[] + side-channel info (text deltas, session
 *      id, terminal summary). The `ctx` carries per-stream state needed
 *      to pair tool_use → tool_result by id.
 *
 * Forward-compatibility: unknown `type`/`subtype` values are silently
 * ignored (no events emitted, no error thrown) so the parser survives
 * future Claude Code minor revisions.
 */
import "server-only";

import type { ChatEvent } from "@/lib/agents/types";

/* -------------------------------------------------------------------------- */
/* raw line shape                                                              */
/* -------------------------------------------------------------------------- */

/** One Claude Code content block. Mirrors the Anthropic Messages API
 *  block taxonomy with the additions the CLI emits (thinking). */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature?: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export interface StreamUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/** Anthropic streaming SSE event shapes, as wrapped in Claude Code's
 *  `stream_event` lines when `--include-partial-messages` is on. */
export type AnthropicStreamEvent =
  | { type: "message_start"; message?: { id?: string; usage?: StreamUsage } }
  | {
      type: "content_block_start";
      index: number;
      content_block:
        | { type: "text"; text?: string }
        | { type: "thinking"; thinking?: string }
        | { type: "tool_use"; id: string; name: string; input?: Record<string, unknown> };
    }
  | {
      type: "content_block_delta";
      index: number;
      delta:
        | { type: "text_delta"; text: string }
        | { type: "thinking_delta"; thinking: string }
        | { type: "input_json_delta"; partial_json: string }
        | { type: "signature_delta"; signature: string };
    }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta?: { stop_reason?: string }; usage?: StreamUsage }
  | { type: "message_stop" };

/** What one NDJSON line can look like. The `type: string` catch-all
 *  keeps the parser forward-compatible with new event kinds. */
export type StreamJsonLine =
  | {
      type: "system";
      subtype?: string;
      session_id?: string;
      cwd?: string;
      tools?: string[];
      [k: string]: unknown;
    }
  | {
      type: "assistant";
      message: {
        id?: string;
        role: "assistant";
        content: ContentBlock[];
        stop_reason?: string;
        usage?: StreamUsage;
      };
      session_id?: string;
    }
  | {
      type: "user";
      message: {
        role: "user";
        content: Array<{
          type: string;
          tool_use_id?: string;
          content?: string | Array<{ type: string; text?: string }>;
          is_error?: boolean;
        }>;
      };
    }
  | {
      type: "result";
      subtype?: "success" | "error" | "error_during_execution" | string;
      duration_ms?: number;
      total_cost_usd?: number;
      session_id?: string;
      usage?: StreamUsage;
      result?: string;
      is_error?: boolean;
    }
  | {
      type: "stream_event";
      event: AnthropicStreamEvent;
      session_id?: string;
      [k: string]: unknown;
    }
  | { type: string; [k: string]: unknown };

/* -------------------------------------------------------------------------- */
/* layer 1 — NDJSON tokenizer                                                  */
/* -------------------------------------------------------------------------- */

/** Mutable buffer object the caller threads across chunk pushes. Using an
 *  object instead of a closure keeps the function pure and testable. */
export interface NdjsonBuf {
  current: string;
}

export function makeNdjsonBuf(): NdjsonBuf {
  return { current: "" };
}

/**
 * Push a chunk into the buffer and yield each complete line as a parsed
 * JSON object. Malformed lines are dropped silently (never throw — the
 * stream must survive a single bad line). Trailing partial line stays
 * in the buffer for the next call.
 */
export function* parseStreamJsonChunk(
  buf: NdjsonBuf,
  chunk: string,
): Generator<StreamJsonLine> {
  buf.current += chunk;
  for (
    let idx = buf.current.indexOf("\n");
    idx >= 0;
    idx = buf.current.indexOf("\n")
  ) {
    const line = buf.current.slice(0, idx).trim();
    buf.current = buf.current.slice(idx + 1);
    if (!line) continue;
    try {
      yield JSON.parse(line) as StreamJsonLine;
    } catch {
      // Bad line — keep scanning the rest of the buffer. Real cases:
      // ANSI escape sequences leaking through, partial JSON from a
      // killed subprocess, version-mismatch debug output. Logging
      // here would spam; the stream continues so the user still sees
      // whatever the next lines bring.
    }
  }
}

/** Flush any trailing non-newline-terminated content as a final line.
 *  Call once when the subprocess closes its stdout. */
export function* flushNdjsonBuf(buf: NdjsonBuf): Generator<StreamJsonLine> {
  const rem = buf.current.trim();
  buf.current = "";
  if (!rem) return;
  try {
    yield JSON.parse(rem) as StreamJsonLine;
  } catch {
    /* swallow — same logic as above */
  }
}

/* -------------------------------------------------------------------------- */
/* layer 2 — translator                                                        */
/* -------------------------------------------------------------------------- */

/** Per-block state while we're streaming partial messages. Each
 *  content block (text / thinking / tool_use) lives at a stable index
 *  for the lifetime of one assistant message. We accumulate deltas
 *  here and emit a final ChatEvent on `content_block_stop`. */
export interface PartialBlockState {
  type: "text" | "thinking" | "tool_use" | "other";
  /** For tool_use: the buffered JSON-fragment string we'll JSON.parse on stop. */
  jsonBuf: string;
  /** For tool_use: id and name copied from content_block_start so the
   *  emitted event matches what the non-partial path would produce. */
  toolId?: string;
  toolName?: string;
  /** For thinking: accumulated text. We emit a single `thinking` event
   *  on stop (not per-delta) so the renderer doesn't see a flicker of
   *  empty cards. */
  thinkingBuf: string;
}

/** Per-stream state the translator needs across lines.
 *  Threaded by the caller so the parser stays pure. */
export interface TranslatorState {
  /** Map of tool_use id → tool name, so when a `tool_result` lands on a
   *  later `user` line we can label it. */
  toolNames: Map<string, string>;
  /** Captured at `system{subtype:"init"}` — used for `--resume <id>` on
   *  the next turn. */
  sessionId: string | null;
  /** Set when we've seen at least one `stream_event` line — flips the
   *  full-`assistant` message path into dedup mode so we don't emit the
   *  same content block twice. */
  usingPartials: boolean;
  /** Per-content-block accumulators, keyed by `index` from the partial
   *  events. Lifetime: from `content_block_start` to `content_block_stop`.
   *  We delete on stop so the map doesn't grow across long sessions. */
  partials: Map<number, PartialBlockState>;
  /** Indices we've already emitted via partials — when the assembled
   *  `assistant` message arrives at message_stop we use this to skip
   *  re-emitting the same blocks. Cleared on each new `message_start`. */
  emittedIndices: Set<number>;
}

export function makeTranslatorState(): TranslatorState {
  return {
    toolNames: new Map(),
    sessionId: null,
    usingPartials: false,
    partials: new Map(),
    emittedIndices: new Set(),
  };
}

export interface TranslatedLine {
  /** Zero or more ChatEvents to emit on the SSE wire and accumulate
   *  onto the pending ChatTurn. */
  events: ChatEvent[];
  /** Text to append to the assistant turn's `content` string. Sourced
   *  from `text` content blocks. */
  textDelta?: string;
  /** Final summary, present only on `type: "result"`. */
  result?: {
    success: boolean;
    durationMs?: number;
    costUsd?: number;
    sessionId?: string;
    usage?: StreamUsage;
  };
}

/** Convert one parsed stream-json line into events + side-channel info.
 *  Mutates `state` (records session id, tool names). */
export function translateLineToEvents(
  line: StreamJsonLine,
  state: TranslatorState,
): TranslatedLine {
  switch (line.type) {
    case "system": {
      const sys = line as Extract<StreamJsonLine, { type: "system" }>;
      if (sys.subtype === "init" && typeof sys.session_id === "string") {
        state.sessionId = sys.session_id;
      }
      return { events: [] };
    }

    case "assistant": {
      const msg = (line as Extract<StreamJsonLine, { type: "assistant" }>).message;
      if (!msg || !Array.isArray(msg.content)) return { events: [] };
      const events: ChatEvent[] = [];
      let textDelta = "";
      // When partials were used for this message, the assembled
      // `assistant` line that arrives at message_stop is a duplicate of
      // everything we already streamed. Walk content with an index so we
      // can suppress blocks we've already emitted.
      const dedup = state.usingPartials;
      for (let i = 0; i < msg.content.length; i++) {
        if (dedup && state.emittedIndices.has(i)) continue;
        const block = msg.content[i];
        if (block.type === "text" && typeof block.text === "string") {
          textDelta += block.text;
        } else if (block.type === "thinking" && typeof block.thinking === "string") {
          // Skip empty thinking blocks — Claude Code sometimes emits a
          // placeholder block with no content when it decides not to
          // surface its reasoning. Rendering an empty "Thought" card
          // adds clutter for no signal.
          if (block.thinking.trim()) {
            events.push({ kind: "thinking", text: block.thinking });
          }
        } else if (block.type === "tool_use") {
          state.toolNames.set(block.id, block.name);
          events.push(mapToolUseToChatEvent(block.name, block.input ?? {}, block.id));
        }
      }
      return {
        events,
        ...(textDelta ? { textDelta } : {}),
      };
    }

    case "stream_event": {
      const wrapper = line as Extract<StreamJsonLine, { type: "stream_event" }>;
      state.usingPartials = true;
      return translateStreamEvent(wrapper.event, state);
    }

    case "user": {
      const msg = (line as Extract<StreamJsonLine, { type: "user" }>).message;
      if (!msg || !Array.isArray(msg.content)) return { events: [] };
      const events: ChatEvent[] = [];
      for (const block of msg.content) {
        if (block.type !== "tool_result") continue;
        const id = block.tool_use_id ?? "";
        const name = state.toolNames.get(id) ?? "tool";
        const output = flattenToolResult(block.content);
        events.push({
          kind: "tool_result",
          name,
          tool_use_id: id,
          output: output || undefined,
          error: block.is_error === true,
        });
      }
      return { events };
    }

    case "result": {
      const r = line as Extract<StreamJsonLine, { type: "result" }>;
      return {
        events: [],
        result: {
          success: r.subtype === "success" && r.is_error !== true,
          durationMs: typeof r.duration_ms === "number" ? r.duration_ms : undefined,
          costUsd:
            typeof r.total_cost_usd === "number" ? r.total_cost_usd : undefined,
          sessionId:
            typeof r.session_id === "string" ? r.session_id : state.sessionId ?? undefined,
          usage: r.usage,
        },
      };
    }

    default:
      return { events: [] };
  }
}

/* -------------------------------------------------------------------------- */
/* partial-message translator                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Convert one Anthropic streaming event (wrapped in a Claude Code
 * `stream_event` line) into events + textDelta. Mutates `state.partials`
 * to track per-block accumulators and `state.emittedIndices` so the
 * full-`assistant` line that arrives at message_stop doesn't re-emit
 * the same blocks.
 *
 * Design choice: text streams immediately as `textDelta` (the visible
 * win). Thinking and tool_use accumulate and emit one event each on
 * `content_block_stop` — there's no UX value to streaming inside a
 * tool_use card because the input JSON isn't useful until complete,
 * and an "open thinking" card with empty text just causes flicker.
 */
function translateStreamEvent(
  event: AnthropicStreamEvent,
  state: TranslatorState,
): TranslatedLine {
  switch (event.type) {
    case "message_start":
      state.emittedIndices.clear();
      state.partials.clear();
      return { events: [] };

    case "content_block_start": {
      const cb = event.content_block;
      // Claim the index for the partials path immediately — the
      // assembled `assistant` message arrives BEFORE `content_block_stop`
      // (verified in raw Claude Code NDJSON), so we can't wait until stop
      // to mark it claimed. The dedup check in the `assistant` case reads
      // `emittedIndices` to decide whether to skip a block.
      state.emittedIndices.add(event.index);
      if (cb.type === "text") {
        state.partials.set(event.index, {
          type: "text",
          jsonBuf: "",
          thinkingBuf: "",
        });
      } else if (cb.type === "thinking") {
        state.partials.set(event.index, {
          type: "thinking",
          jsonBuf: "",
          thinkingBuf: cb.thinking ?? "",
        });
      } else if (cb.type === "tool_use") {
        state.partials.set(event.index, {
          type: "tool_use",
          jsonBuf: "",
          toolId: cb.id,
          toolName: cb.name,
          thinkingBuf: "",
        });
      } else {
        state.partials.set(event.index, {
          type: "other",
          jsonBuf: "",
          thinkingBuf: "",
        });
      }
      return { events: [] };
    }

    case "content_block_delta": {
      const slot = state.partials.get(event.index);
      if (!slot) return { events: [] };
      const d = event.delta;
      if (d.type === "text_delta" && slot.type === "text") {
        return { events: [], textDelta: d.text };
      }
      if (d.type === "thinking_delta" && slot.type === "thinking") {
        slot.thinkingBuf += d.thinking;
        return { events: [] };
      }
      if (d.type === "input_json_delta" && slot.type === "tool_use") {
        slot.jsonBuf += d.partial_json;
        return { events: [] };
      }
      // signature_delta and unknown delta types are silently ignored.
      return { events: [] };
    }

    case "content_block_stop": {
      const slot = state.partials.get(event.index);
      if (!slot) return { events: [] };
      state.partials.delete(event.index);
      // Note: emittedIndices was already populated in content_block_start
      // — the dedup contract is "we claimed it the moment it started",
      // not "we finished emitting it". Keeps the dedup race-free even
      // when the assembled assistant line arrives before stop.
      const events: ChatEvent[] = [];
      if (slot.type === "thinking") {
        if (slot.thinkingBuf.trim()) {
          events.push({ kind: "thinking", text: slot.thinkingBuf });
        }
      } else if (slot.type === "tool_use" && slot.toolId && slot.toolName) {
        let input: Record<string, unknown> = {};
        if (slot.jsonBuf.trim()) {
          try {
            input = JSON.parse(slot.jsonBuf) as Record<string, unknown>;
          } catch {
            // Partial JSON arrived malformed (rare — Anthropic
            // streams well-formed fragments). Emit the event with
            // empty input rather than losing the tool call entirely.
            input = {};
          }
        }
        state.toolNames.set(slot.toolId, slot.toolName);
        events.push(mapToolUseToChatEvent(slot.toolName, input, slot.toolId));
      }
      return { events };
    }

    case "message_delta":
    case "message_stop":
    default:
      return { events: [] };
  }
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Map a Claude Code tool_use call onto our richer ChatEvent kinds when
 * we recognise the tool name, falling back to a generic `tool_use` card
 * for anything else (custom tools, MCP tools).
 */
function mapToolUseToChatEvent(
  name: string,
  input: Record<string, unknown>,
  id: string,
): ChatEvent {
  if (name === "TodoWrite" && Array.isArray(input.todos)) {
    return {
      kind: "todo_update",
      todos: (input.todos as Array<Record<string, unknown>>).map((t) => ({
        content: String(t.content ?? ""),
        activeForm: t.activeForm ? String(t.activeForm) : undefined,
        status:
          t.status === "completed" || t.status === "in_progress"
            ? t.status
            : "pending",
      })),
    };
  }
  if (name === "Read") {
    const path = String(input.file_path ?? input.path ?? "?");
    let range: string | undefined;
    if (typeof input.offset === "number" || typeof input.limit === "number") {
      const start = Number(input.offset ?? 1);
      const len = Number(input.limit ?? 0);
      range = len > 0 ? `L${start}–${start + len}` : `from L${start}`;
    }
    return { kind: "file_read", path, id, ...(range ? { range } : {}) };
  }
  if (name === "Edit" || name === "Write" || name === "NotebookEdit") {
    return {
      kind: "file_edit",
      path: String(input.file_path ?? input.path ?? input.notebook_path ?? "?"),
      summary: name,
      id,
    };
  }
  if (name === "Bash") {
    return {
      kind: "bash",
      command: String(input.command ?? ""),
      id,
    };
  }
  return { kind: "tool_use", name, input, id };
}

/** Coerce a Claude Code tool_result content shape into a flat string. */
function flattenToolResult(
  content: string | Array<{ type: string; text?: string }> | undefined,
): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .map((c) => (typeof c.text === "string" ? c.text : ""))
    .filter(Boolean)
    .join("\n");
}
