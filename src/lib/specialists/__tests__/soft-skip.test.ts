import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BlockedError,
  SoftSkipError,
  isBlocked,
  isSoftSkip,
} from "../_lib/soft-skip";

test("SoftSkipError instances are recognized via instanceof", () => {
  const err = new SoftSkipError("nope");
  assert.ok(err instanceof SoftSkipError);
  assert.ok(err instanceof Error);
  assert.equal(err.name, "SoftSkipError");
  assert.equal(err.message, "nope");
  assert.equal(err.kind, "soft-skip");
  assert.equal(err.tag, "SoftSkipError");
});

test("SoftSkipError supports kind + tag override", () => {
  const err = new SoftSkipError("property not verified", {
    kind: "gsc-property-unverified",
    tag: "PropertyNotVerified",
  });
  assert.equal(err.kind, "gsc-property-unverified");
  assert.equal(err.tag, "PropertyNotVerified");
});

test("isSoftSkip discriminates soft-skip from generic errors", () => {
  assert.equal(isSoftSkip(new SoftSkipError("x")), true);
  assert.equal(isSoftSkip(new Error("regular failure")), false);
  assert.equal(isSoftSkip(new TypeError("type error")), false);
  assert.equal(isSoftSkip("string"), false);
  assert.equal(isSoftSkip(null), false);
  assert.equal(isSoftSkip(undefined), false);
});

test("SoftSkipError preserves the message verbatim for the catch handler", () => {
  // The job-queue catch block reads `err.message` directly and writes
  // it (prefixed with "skipped:") into the job row's `message` column.
  // The TaskFeedDock then matches on the prefix to surface the yellow
  // SKIPPED state. Round-trip integrity matters.
  const reason =
    'No verified Search Console property matches "https://21collagen.ro". ' +
    "Properties you own: sc-domain:agricidaniel.com.";
  const err = new SoftSkipError(reason, { kind: "gsc-property-unverified" });
  assert.equal(err.message, reason);
  // The dock's check: `message.startsWith("skipped:")` after the catch
  // block has prepended the prefix.
  const stored = `skipped: ${err.message}`;
  assert.ok(stored.startsWith("skipped:"));
});

test("BlockedError instances are recognized via instanceof", () => {
  const err = new BlockedError("phase gate blocked");
  assert.ok(err instanceof BlockedError);
  assert.ok(err instanceof Error);
  assert.equal(err.name, "BlockedError");
  assert.equal(err.message, "phase gate blocked");
  assert.equal(err.kind, "blocked");
  assert.equal(err.tag, "BlockedError");
  assert.equal(err.artifactPath, undefined);
});

test("BlockedError supports kind + tag + artifactPath overrides", () => {
  const err = new BlockedError("intake gate blocked: lint errors", {
    kind: "phase-gate-lint-errors",
    tag: "PhaseGateBlocked",
    artifactPath: "wiki/reviews/2026-05-19-intake-gate.md",
  });
  assert.equal(err.kind, "phase-gate-lint-errors");
  assert.equal(err.tag, "PhaseGateBlocked");
  assert.equal(err.artifactPath, "wiki/reviews/2026-05-19-intake-gate.md");
});

test("isBlocked discriminates blocked from soft-skip and generic errors", () => {
  assert.equal(isBlocked(new BlockedError("x")), true);
  assert.equal(isBlocked(new SoftSkipError("y")), false);
  assert.equal(isBlocked(new Error("regular failure")), false);
  assert.equal(isBlocked("string"), false);
  assert.equal(isBlocked(null), false);
});

test("BlockedError vs SoftSkipError are distinct types (no cross-detection)", () => {
  // The split matters because the orchestrator routes them through
  // different markX() helpers (markBlocked writes "blocked:" prefix,
  // markSkipped writes "skipped:") and the UI paints them as
  // different states (amber BLOCKED vs purple SKIPPED). A single
  // class would conflate the two distinct fix paths.
  const skip = new SoftSkipError("s");
  const block = new BlockedError("b");
  assert.equal(isSoftSkip(skip), true);
  assert.equal(isSoftSkip(block), false);
  assert.equal(isBlocked(skip), false);
  assert.equal(isBlocked(block), true);
});

test("BlockedError message round-trips through the catch handler prefix", () => {
  const reason =
    "Intake phase gate blocked: readiness blocked 0/100, lint 0/100 with 5 error(s).";
  const err = new BlockedError(reason, {
    artifactPath: "wiki/reviews/2026-05-19-intake-gate.md",
  });
  const stored = `blocked: ${err.message}`;
  assert.ok(stored.startsWith("blocked:"));
  // The TaskFeed disambiguation reads the prefix to route to the
  // "blocked" state in jobStatusToState.
  assert.notEqual(stored.startsWith("skipped:"), true);
});
