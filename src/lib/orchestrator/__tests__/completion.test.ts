import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tmpRoot: string;
let originalDataDir: string | undefined;
const SLUG = "completion-client";

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "completion-"));
  originalDataDir = process.env.SEO_OFFICE_DATA_DIR;
  process.env.SEO_OFFICE_DATA_DIR = tmpRoot;

  const { scaffoldClient } = await import("@/lib/brain/scaffold.ts");
  await scaffoldClient({
    slug: SLUG,
    clientName: "Completion Client",
    siteUrl: "https://completion.example.com",
    owner: "tester",
    businessType: "saas",
    niche: "freshness gate",
    siteBrand: "Completion",
    authorByline: "QA",
    monetizationModel: "subscriptions",
    targetPersona: "operators",
    primaryCompetitors: ["rival.example"],
    measurementAccess: [],
  });
});

after(async () => {
  const { closeDb } = await import("@/lib/brain/index-db.ts");
  closeDb();
  if (originalDataDir !== undefined) process.env.SEO_OFFICE_DATA_DIR = originalDataDir;
  else delete process.env.SEO_OFFICE_DATA_DIR;
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

/** Insert a succeeded job that wrote `resultPath`, plus the indexed note it
 *  produced with the given freshness signals. Returns the specialist id. */
async function seedArtifact(opts: {
  specialist: string;
  resultPath: string;
  confidence: string | null;
  expiresOn: string | null;
}): Promise<void> {
  const { getDb } = await import("@/lib/brain/index-db.ts");
  const db = getDb();
  db.prepare(
    `INSERT INTO jobs (id, client_slug, specialist, status, progress, message, finished_at, result_path)
     VALUES (?, ?, ?, 'succeeded', 1, 'done', datetime('now'), ?)`,
  ).run(`job-${opts.specialist}`, SLUG, opts.specialist, opts.resultPath);
  db.prepare(
    `INSERT INTO notes (client_slug, path, type, title, status, confidence, created, updated, expires_on)
     VALUES (?, ?, 'audit', ?, 'active', ?, datetime('now'), datetime('now'), ?)`,
  ).run(SLUG, opts.resultPath, opts.specialist, opts.confidence, opts.expiresOn);
}

test("missing when the specialist has no succeeded artifact", async () => {
  const { specialistArtifactStatus } = await import("@/lib/orchestrator/completion.ts");
  assert.equal(specialistArtifactStatus(SLUG, "never-ran"), "missing");
});

test("current when a confident, unexpired artifact exists", async () => {
  await seedArtifact({
    specialist: "fresh-spec",
    resultPath: "wiki/audits/fresh-spec.md",
    confidence: "high",
    expiresOn: null,
  });
  const { specialistArtifactStatus } = await import("@/lib/orchestrator/completion.ts");
  assert.equal(specialistArtifactStatus(SLUG, "fresh-spec"), "current");
});

test("stale when the artifact's expiry is in the past", async () => {
  await seedArtifact({
    specialist: "expired-spec",
    resultPath: "wiki/audits/expired-spec.md",
    confidence: "high",
    expiresOn: "2000-01-01",
  });
  const { specialistArtifactStatus } = await import("@/lib/orchestrator/completion.ts");
  assert.equal(specialistArtifactStatus(SLUG, "expired-spec"), "stale");
});

test("stale when confidence is low even if unexpired", async () => {
  await seedArtifact({
    specialist: "lowconf-spec",
    resultPath: "wiki/audits/lowconf-spec.md",
    confidence: "low",
    expiresOn: null,
  });
  const { specialistArtifactStatus } = await import("@/lib/orchestrator/completion.ts");
  assert.equal(specialistArtifactStatus(SLUG, "lowconf-spec"), "stale");
});

test("stale when a succeeded job wrote an artifact the index has not captured", async () => {
  const { getDb } = await import("@/lib/brain/index-db.ts");
  getDb()
    .prepare(
      `INSERT INTO jobs (id, client_slug, specialist, status, progress, message, finished_at, result_path)
       VALUES (?, ?, ?, 'succeeded', 1, 'done', datetime('now'), ?)`,
    )
    .run("job-unindexed", SLUG, "unindexed-spec", "wiki/audits/unindexed-spec.md");
  const { specialistArtifactStatus } = await import("@/lib/orchestrator/completion.ts");
  assert.equal(specialistArtifactStatus(SLUG, "unindexed-spec"), "stale");
});
