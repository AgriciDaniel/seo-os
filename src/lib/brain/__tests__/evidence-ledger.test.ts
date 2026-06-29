import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "evidence-ledger-"));
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

test("evidence ledger appends validated source-backed claims", async () => {
  const { scaffoldClient } = await import("@/lib/brain/scaffold.ts");
  const { appendEvidence, readEvidenceLedger, EVIDENCE_LEDGER_PATH } =
    await import("@/lib/brain/evidence-ledger.ts");
  const { readRaw } = await import("@/lib/brain/vault-fs.ts");

  const client = await scaffoldClient({
    slug: "ledger-client",
    clientName: "Ledger Client",
    siteUrl: "https://ledger.example.com",
    owner: "tester",
    businessType: "saas",
    niche: "SEO workflow automation",
    siteBrand: "Ledger Client",
    authorByline: "QA",
    monetizationModel: "subscriptions",
    targetPersona: "SEO operators",
    primaryCompetitors: ["example.com"],
    measurementAccess: ["dataforseo"],
  });

  await appendEvidence(client.slug, {
    job_id: "job-1",
    specialist_id: "keyword-researcher",
    claim: "Keyword workbook uses live DataForSEO volumes.",
    provenance: "live_api",
    source_paths: ["wiki/sources/DataForSEO Keyword Exports.md"],
    confidence: "high",
    cost_usd: 0.01,
    captured_at: "2026-05-16T00:00:00.000Z",
  });
  await appendEvidence(client.slug, {
    job_id: "job-2",
    specialist_id: "content-strategist",
    claim: "Content audit reused existing source notes.",
    provenance: "cached",
    source_paths: ["wiki/sources/Competitor Landscape Cache.md"],
    confidence: "medium",
    cost_usd: 0,
    captured_at: "2026-05-16T00:01:00.000Z",
  });

  const entries = await readEvidenceLedger(client.slug);
  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.job_id, "job-1");
  assert.equal(entries[1]?.specialist_id, "content-strategist");
  assert.equal(entries[0]?.source_paths[0], "wiki/sources/DataForSEO Keyword Exports.md");

  const raw = await readRaw(client.slug, EVIDENCE_LEDGER_PATH);
  assert.equal(raw?.trim().split("\n").length, 2);
});

test("evidence ledger rejects claims without source paths", async () => {
  const { appendEvidence } = await import("@/lib/brain/evidence-ledger.ts");

  await assert.rejects(
    () =>
      appendEvidence("ledger-client", {
        job_id: "job-3",
        specialist_id: "keyword-researcher",
        claim: "Unbacked claim.",
        provenance: "model_estimate",
        source_paths: [],
        confidence: "low",
        cost_usd: 0,
      }),
    /source_paths/,
  );
});
