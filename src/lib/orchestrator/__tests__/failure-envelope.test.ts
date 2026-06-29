/**
 * Tests for `captureFailureEnvelope` (Phase 3.2).
 *
 * Pure function — snapshots an Error into a structured envelope. We
 * assert the shape and the truncated stack head.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { captureFailureEnvelope } from "../job-queue.ts";

test("captures Error class, message, and a truncated stack head", () => {
  const err = new TypeError("boom");
  const env = captureFailureEnvelope(err);
  assert.equal(env.errorClass, "TypeError");
  assert.equal(env.message, "boom");
  assert.ok(env.capturedAt.length > 0);
  assert.ok(env.stackHead.length > 0);
  assert.ok(env.stackHead.length <= 10);
});

test("falls back gracefully for non-Error throws", () => {
  const env = captureFailureEnvelope("a bare string");
  assert.equal(env.errorClass, "string");
  assert.equal(env.message, "a bare string");
  assert.equal(env.stackHead.length, 0);
});

test("snapshots an ISO timestamp", () => {
  const env = captureFailureEnvelope(new Error("x"));
  // ISO 8601: 2026-05-13T...Z
  assert.match(env.capturedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});
