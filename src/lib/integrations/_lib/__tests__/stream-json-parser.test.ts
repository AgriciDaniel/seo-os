/**
 * Unit tests for the Claude Code stream-json parser.
 *
 * Runs against Node 24's built-in `node:test` + type stripping — no
 * vitest, no tsx, no transpile step. Invoke with:
 *
 *   pnpm exec node --test src/lib/integrations/_lib/__tests__/stream-json-parser.test.ts
 *
 * The parser is intentionally a leaf module — its only runtime import
 * is `server-only` (a no-op outside React server components) and the
 * test only touches the pure layer-1 tokenizer + layer-2 translator.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// Explicit ".ts" extension is required by Node 24's `--test` loader,
// and now also accepted by tsc via `allowImportingTsExtensions` in
// tsconfig.json. One path, no shim.
import {
  makeNdjsonBuf,
  parseStreamJsonChunk,
  flushNdjsonBuf,
  makeTranslatorState,
  translateLineToEvents,
  type StreamJsonLine,
} from "../stream-json-parser.ts";

/* -------------------------------------------------------------------------- */
/* layer 1 — NDJSON tokenizer                                                  */
/* -------------------------------------------------------------------------- */

test("empty buffer + empty chunk yields nothing", () => {
  const buf = makeNdjsonBuf();
  const lines = [...parseStreamJsonChunk(buf, "")];
  assert.equal(lines.length, 0);
});

test("single complete line yields one parsed object", () => {
  const buf = makeNdjsonBuf();
  const lines = [...parseStreamJsonChunk(buf, `{"type":"system","subtype":"init"}\n`)];
  assert.equal(lines.length, 1);
  assert.equal(lines[0].type, "system");
});

test("partial line completes across two chunks", () => {
  const buf = makeNdjsonBuf();
  const first = [...parseStreamJsonChunk(buf, `{"type":"system"`)];
  assert.equal(first.length, 0);
  const second = [...parseStreamJsonChunk(buf, `,"subtype":"init"}\n`)];
  assert.equal(second.length, 1);
  assert.equal(second[0].type, "system");
});

test("multiple lines in one chunk preserve order", () => {
  const buf = makeNdjsonBuf();
  const chunk =
    `{"type":"system","subtype":"init"}\n` +
    `{"type":"result","subtype":"success"}\n`;
  const lines = [...parseStreamJsonChunk(buf, chunk)];
  assert.equal(lines.length, 2);
  assert.equal(lines[0].type, "system");
  assert.equal(lines[1].type, "result");
});

test("malformed JSON in the middle is skipped, surroundings parsed", () => {
  const buf = makeNdjsonBuf();
  const chunk =
    `{"type":"system","subtype":"init"}\n` +
    `not-json-here\n` +
    `{"type":"result","subtype":"success"}\n`;
  const lines = [...parseStreamJsonChunk(buf, chunk)];
  assert.equal(lines.length, 2);
  assert.equal(lines[0].type, "system");
  assert.equal(lines[1].type, "result");
});

test("unknown type passes through (no throw)", () => {
  const buf = makeNdjsonBuf();
  const lines = [...parseStreamJsonChunk(buf, `{"type":"some_future_type","x":1}\n`)];
  assert.equal(lines.length, 1);
  assert.equal(lines[0].type, "some_future_type");
});

test("flushNdjsonBuf emits trailing non-newline content", () => {
  const buf = makeNdjsonBuf();
  // Push something without trailing newline — consume the generator
  // so the buffer keeps the unfinished line. Bind the spread to an
  // unused name so the test runner's lint config doesn't flag the
  // expression statement.
  const _drained = [...parseStreamJsonChunk(buf, `{"type":"result","subtype":"success"}`)];
  void _drained;
  const flushed = [...flushNdjsonBuf(buf)];
  assert.equal(flushed.length, 1);
  assert.equal(flushed[0].type, "result");
  // buffer should be cleared
  assert.equal([...flushNdjsonBuf(buf)].length, 0);
});

/* -------------------------------------------------------------------------- */
/* layer 2 — translator (non-partials path)                                    */
/* -------------------------------------------------------------------------- */

test("system{subtype:init} captures session id", () => {
  const state = makeTranslatorState();
  const line: StreamJsonLine = {
    type: "system",
    subtype: "init",
    session_id: "abc-123",
  };
  translateLineToEvents(line, state);
  assert.equal(state.sessionId, "abc-123");
});

test("assistant text block produces textDelta only", () => {
  const state = makeTranslatorState();
  const line: StreamJsonLine = {
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Hello" }],
    },
  };
  const out = translateLineToEvents(line, state);
  assert.equal(out.textDelta, "Hello");
  assert.equal(out.events.length, 0);
});

test("assistant with empty thinking is filtered (no flicker)", () => {
  const state = makeTranslatorState();
  const line: StreamJsonLine = {
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "thinking", thinking: "   " }],
    },
  };
  const out = translateLineToEvents(line, state);
  assert.equal(out.events.length, 0);
});

test("assistant with non-empty thinking emits a thinking event", () => {
  const state = makeTranslatorState();
  const line: StreamJsonLine = {
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "thinking", thinking: "Reasoning about X." }],
    },
  };
  const out = translateLineToEvents(line, state);
  assert.equal(out.events.length, 1);
  assert.equal(out.events[0].kind, "thinking");
});

test("tool_use named Read maps to file_read with path", () => {
  const state = makeTranslatorState();
  const line: StreamJsonLine = {
    type: "assistant",
    message: {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu_1",
          name: "Read",
          input: { file_path: "/tmp/a.md" },
        },
      ],
    },
  };
  const out = translateLineToEvents(line, state);
  assert.equal(out.events.length, 1);
  const ev = out.events[0];
  assert.equal(ev.kind, "file_read");
  // ChatEvent for file_read has `path` — narrow with the discriminant.
  if (ev.kind === "file_read") {
    assert.equal(ev.path, "/tmp/a.md");
  }
});

test("tool_use TodoWrite emits todo_update", () => {
  const state = makeTranslatorState();
  const line: StreamJsonLine = {
    type: "assistant",
    message: {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "tu_2",
          name: "TodoWrite",
          input: {
            todos: [
              { content: "do it", status: "pending" },
              { content: "doing it", status: "in_progress" },
            ],
          },
        },
      ],
    },
  };
  const out = translateLineToEvents(line, state);
  assert.equal(out.events.length, 1);
  assert.equal(out.events[0].kind, "todo_update");
});

test("user tool_result resolves name via state.toolNames map", () => {
  const state = makeTranslatorState();
  // First, emit a tool_use to populate toolNames.
  translateLineToEvents(
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "tool_use", id: "tu_3", name: "Bash", input: { command: "ls" } },
        ],
      },
    },
    state,
  );
  // Now the matching tool_result lands on a user line.
  const out = translateLineToEvents(
    {
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu_3",
            content: "file1\nfile2",
          },
        ],
      },
    },
    state,
  );
  assert.equal(out.events.length, 1);
  const ev = out.events[0];
  assert.equal(ev.kind, "tool_result");
  if (ev.kind === "tool_result") {
    assert.equal(ev.name, "Bash");
    assert.equal(ev.output, "file1\nfile2");
  }
});

test("result subtype success populates result.success=true", () => {
  const state = makeTranslatorState();
  const out = translateLineToEvents(
    {
      type: "result",
      subtype: "success",
      duration_ms: 1234,
      total_cost_usd: 0.045,
      session_id: "sess-1",
    },
    state,
  );
  assert.ok(out.result);
  assert.equal(out.result!.success, true);
  assert.equal(out.result!.durationMs, 1234);
  assert.equal(out.result!.costUsd, 0.045);
});

/* -------------------------------------------------------------------------- */
/* layer 2 — partial-message path (Slice 4)                                    */
/* -------------------------------------------------------------------------- */

test("stream_event text_delta streams as textDelta", () => {
  const state = makeTranslatorState();
  // First open the text block.
  translateLineToEvents(
    {
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
    } as StreamJsonLine,
    state,
  );
  // Then deliver a delta.
  const out = translateLineToEvents(
    {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "hi" },
      },
    } as StreamJsonLine,
    state,
  );
  assert.equal(out.textDelta, "hi");
  assert.equal(state.usingPartials, true);
});

test("partial tool_use accumulates input_json_delta and emits on stop", () => {
  const state = makeTranslatorState();
  translateLineToEvents(
    {
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "tu_p", name: "Read" },
      },
    } as StreamJsonLine,
    state,
  );
  translateLineToEvents(
    {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: `{"file_path"` },
      },
    } as StreamJsonLine,
    state,
  );
  translateLineToEvents(
    {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: `:"/etc/hosts"}` },
      },
    } as StreamJsonLine,
    state,
  );
  const out = translateLineToEvents(
    {
      type: "stream_event",
      event: { type: "content_block_stop", index: 0 },
    } as StreamJsonLine,
    state,
  );
  assert.equal(out.events.length, 1);
  const ev = out.events[0];
  assert.equal(ev.kind, "file_read");
  if (ev.kind === "file_read") {
    assert.equal(ev.path, "/etc/hosts");
  }
});

test("assembled assistant message is deduped when partials were used", () => {
  const state = makeTranslatorState();
  // Start a text block via partials (claims index 0).
  translateLineToEvents(
    {
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
    } as StreamJsonLine,
    state,
  );
  // Now the assembled assistant message arrives (this happens before
  // content_block_stop in Claude Code's real stream).
  const out = translateLineToEvents(
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hello world" }],
      },
    },
    state,
  );
  // The dedup contract: when usingPartials is true and the index is
  // claimed, the assembled block is skipped to avoid a duplicate.
  assert.equal(out.textDelta, undefined);
  assert.equal(out.events.length, 0);
});

test("message_start clears prior emittedIndices for the next message", () => {
  const state = makeTranslatorState();
  // Simulate one prior message having streamed.
  state.usingPartials = true;
  state.emittedIndices.add(0);
  state.emittedIndices.add(1);
  translateLineToEvents(
    {
      type: "stream_event",
      event: { type: "message_start" },
    } as StreamJsonLine,
    state,
  );
  assert.equal(state.emittedIndices.size, 0);
});
