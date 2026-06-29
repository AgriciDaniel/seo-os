/**
 * Tests for the schema migration ladder (Phase 4.1).
 *
 * The published ladder is empty (v1 is head). We validate the LADDER
 * MECHANICS by registering a synthetic v0→v1 migration and asserting
 * that `migrateFrontmatter` walks it to head. This protects the
 * infrastructure now; the real migration work lands when v2 ships.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LATEST_SCHEMA,
  migrateFrontmatter,
  migrations,
} from "../migrations.ts";

test("LATEST_SCHEMA reflects the current head", () => {
  assert.equal(LATEST_SCHEMA, "marketing-brain.v1");
});

test("migrateFrontmatter is a no-op when already at head", () => {
  const note = {
    brain_schema: "marketing-brain.v1",
    type: "meta",
    title: "Hot",
  };
  const out = migrateFrontmatter(note);
  assert.deepEqual(out, note);
});

test("migrateFrontmatter walks the registered ladder", () => {
  // Register a synthetic migration. We can't mutate the exported
  // `migrations` array in production without consequences, but the
  // test sandbox lets us add then remove. The ladder is intentionally
  // empty at v1 so this also serves as documentation for how future
  // migrations should be shaped.
  migrations.push({
    from: "marketing-brain.v0",
    to: "marketing-brain.v1",
    up: (note) => ({ ...note, brain_schema: "marketing-brain.v1" }),
  });
  try {
    const out = migrateFrontmatter({
      brain_schema: "marketing-brain.v0",
      type: "meta",
      title: "Old",
    });
    assert.equal(out.brain_schema, "marketing-brain.v1");
    assert.equal(out.title, "Old");
  } finally {
    migrations.pop();
  }
});

test("migrateFrontmatter leaves unknown future schemas unchanged", () => {
  // The caller's Zod parse will surface the mismatch — the ladder
  // itself shouldn't crash on an unrecognised schema label.
  const note = { brain_schema: "marketing-brain.v99", title: "future" };
  const out = migrateFrontmatter(note);
  assert.equal(out.brain_schema, "marketing-brain.v99");
});
