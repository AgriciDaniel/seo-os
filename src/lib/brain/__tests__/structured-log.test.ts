import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "structured-log-test-"));
  originalEnv = process.env.SEO_OFFICE_DATA_DIR;
  process.env.SEO_OFFICE_DATA_DIR = tmpRoot;
});

after(async () => {
  const { closeDb } = await import("@/lib/brain/index-db.ts");
  closeDb();
  if (originalEnv !== undefined) {
    process.env.SEO_OFFICE_DATA_DIR = originalEnv;
  } else {
    delete process.env.SEO_OFFICE_DATA_DIR;
  }
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

test("structured log appends prompt-cache metrics to wiki/log.json", async () => {
  const { cloneFixtureToTmp } = await import("../../../../tests/helpers/makeFixture.ts");
  const { reindexClient } = await import("@/lib/brain/index-db.ts");
  const {
    STRUCTURED_LOG_RELATIVE,
    appendStructuredLogRow,
    readStructuredLog,
    summarizePromptCache,
  } = await import("@/lib/brain/structured-log.ts");
  const { readRaw } = await import("@/lib/brain/vault-fs.ts");

  const slug = "structured-log-client";
  cloneFixtureToTmp("clean-scaffolded", { tmpRoot, slug });
  await reindexClient(slug);

  await appendStructuredLogRow(slug, {
    type: "llm_call",
    provider: "anthropic-api",
    model: "claude-haiku-4-5-20251001",
    job_id: "job-1",
    specialist_id: "technical-auditor",
    duration_ms: 1234,
    cost_usd: 0.001234,
    input_tokens: 100,
    output_tokens: 20,
    cache_read_input_tokens: 80,
    cache_creation_input_tokens: 20,
  });

  const raw = await readRaw(slug, STRUCTURED_LOG_RELATIVE);
  assert.match(raw ?? "", /"cache_read_input_tokens": 80/);

  const rows = await readStructuredLog(slug);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].specialist_id, "technical-auditor");
  const summary = summarizePromptCache(rows);
  assert.equal(summary.cacheHitRate, 0.8);
  assert.equal(summary.cacheReadInputTokens, 80);
  assert.equal(summary.cacheCreationInputTokens, 20);

  const { officeOperationalStatus } = await import("@/lib/office/operational-status.ts");
  const status = await officeOperationalStatus(slug);
  assert.equal(status.cacheHitRate, 0.8);
  assert.equal(status.cacheReadInputTokens, 80);
  assert.equal(status.cacheCreationInputTokens, 20);
  assert.ok(status.brainHealth.score >= 95);
  assert.equal(status.highRiskReviewCount, 0);
  assert.equal(status.lastSweep, null);
});
