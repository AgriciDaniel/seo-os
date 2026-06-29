import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "specialist-result-"));
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

test("R5 normalizer maps compatibility specialist results into the final envelope", async () => {
  const { getDb } = await import("@/lib/brain/index-db.ts");
  const { writeNote } = await import("@/lib/brain/vault-fs.ts");
  const { normalizeSpecialistResult } = await import("../specialist-result.ts");
  const slug = "r5-result-success";
  await fsp.mkdir(path.join(tmpRoot, "vaults", slug, "wiki", "audits"), {
    recursive: true,
  });
  getDb()
    .prepare("INSERT INTO clients (slug, name, site_url, owner) VALUES (?, ?, ?, ?)")
    .run(slug, slug, "https://example.com", "tester");

  await writeNote(slug, "wiki/audits/2026-05-18-technical.md", {
    frontmatter: {
      brain_schema: "marketing-brain.v1",
      type: "audit",
      title: "Technical Audit",
      created: "2026-05-18",
      updated: "2026-05-18",
      tags: ["audit"],
      status: "active",
      owner: "tester",
      confidence: "high",
      approval_status: "needs-review",
      rollback_note: "delete the fixture artifact",
      risk_level: "low",
      sources: ["wiki/sources/Crawl Export.md"],
      data_sources: ["live_api"],
      cost_usd: 0.25,
    },
    body: "Technical audit body.",
  });

  const envelope = await normalizeSpecialistResult({
    clientSlug: slug,
    durationMs: 1234.7,
    result: {
      summary: "technical complete",
      resultPath: "wiki/audits/2026-05-18-technical.md",
      dataPath: "wiki/audits/2026-05-18-technical.data.json",
      reportPath: "reports/2026-05-18-technical.html",
      evidence: [
        {
          claim: "Crawl export was parsed.",
          provenance: "cached",
          source_paths: ["wiki/sources/Crawl Export.md"],
          confidence: "high",
          cost_usd: 0.01,
        },
      ],
    },
  });

  assert.equal(envelope.status, "succeeded");
  assert.equal(envelope.artifact_path, "wiki/audits/2026-05-18-technical.md");
  assert.equal(envelope.data_artifact_path, "wiki/audits/2026-05-18-technical.data.json");
  assert.deepEqual(envelope.source_paths, ["wiki/sources/Crawl Export.md"]);
  assert.deepEqual(envelope.data_sources, ["live_api", "cached"]);
  assert.equal(envelope.confidence, "high");
  assert.equal(envelope.cost_usd, 0.25);
  assert.equal(envelope.duration_ms, 1235);
  assert.deepEqual(envelope.side_effects.wrote, [
    "wiki/audits/2026-05-18-technical.md",
    "wiki/audits/2026-05-18-technical.data.json",
    "reports/2026-05-18-technical.html",
  ]);
  assert.deepEqual(envelope.side_effects.appended, [
    "wiki/hot.md",
    "wiki/log.md",
    "wiki/meta/evidence-ledger.jsonl",
  ]);
});

test("R5 normalizer marks degraded or unreadable artifacts as partial", async () => {
  const { normalizeSpecialistResult } = await import("../specialist-result.ts");
  const envelope = await normalizeSpecialistResult({
    clientSlug: "missing-client",
    durationMs: 10,
    result: {
      summary: "degraded output",
      resultPath: "wiki/audits/missing.md",
      degraded: true,
      degradationReason: "optional provider missing",
    },
  });

  assert.equal(envelope.status, "partial");
  assert.equal(envelope.confidence, "low");
  assert.deepEqual(envelope.source_paths, []);
  assert.deepEqual(envelope.data_sources, []);
});

test("R5 helpers produce validated failed and skipped envelopes", async () => {
  const {
    failedSpecialistExecutionResult,
    skippedSpecialistExecutionResult,
  } = await import("../specialist-result.ts");

  const failed = failedSpecialistExecutionResult({
    message: "provider timeout",
    durationMs: 42,
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.error?.message, "provider timeout");
  assert.equal(failed.error?.recoverable, true);

  const skipped = skippedSpecialistExecutionResult({
    reason: "requires DataForSEO",
  });
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.skip_reason, "requires DataForSEO");
  assert.equal(skipped.confidence, "low");
});

test("R5 native execution envelopes still receive queue duration and evidence side-effects", async () => {
  const { normalizeSpecialistResult } = await import("../specialist-result.ts");
  const envelope = await normalizeSpecialistResult({
    clientSlug: "native-envelope",
    durationMs: 88.6,
    result: {
      summary: "native result",
      resultPath: "wiki/audits/native.md",
      degraded: true,
      executionResult: {
        status: "succeeded",
        artifact_path: "wiki/audits/native.md",
        source_paths: ["wiki/sources/native.md"],
        data_sources: ["manual"],
        confidence: "medium",
        duration_ms: 0,
        side_effects: {
          wrote: ["wiki/audits/native.md"],
          appended: ["wiki/hot.md", "wiki/log.md"],
        },
      },
      evidence: [
        {
          claim: "Native result included evidence.",
          provenance: "cached",
          source_paths: ["wiki/sources/evidence.md"],
          confidence: "high",
          cost_usd: 0,
        },
      ],
    },
  });

  assert.equal(envelope.status, "partial");
  assert.equal(envelope.confidence, "low");
  assert.equal(envelope.duration_ms, 89);
  assert.deepEqual(envelope.source_paths, [
    "wiki/sources/native.md",
    "wiki/sources/evidence.md",
  ]);
  assert.deepEqual(envelope.data_sources, ["manual", "cached"]);
  assert.deepEqual(envelope.side_effects.appended, [
    "wiki/hot.md",
    "wiki/log.md",
    "wiki/meta/evidence-ledger.jsonl",
  ]);
});

test("R5 job queue persists a native specialist execution envelope before success", async () => {
  const { z } = await import("zod");
  const { scaffoldClient } = await import("@/lib/brain/scaffold.ts");
  const { getDb } = await import("@/lib/brain/index-db.ts");
  const { writeArtifact } = await import("@/lib/specialists/_lib/artifact.ts");
  const { registerSpecialist } = await import("../registry.ts");
  const { enqueue, getJob } = await import("../job-queue.ts");
  const { SpecialistExecutionResultSchema } = await import("@/lib/brain/types.ts");

  const client = await scaffoldClient({
    slug: "r5-envelope-job",
    clientName: "R5 Envelope Job",
    siteUrl: "https://r5-envelope.example.com",
    owner: "tester",
    businessType: "saas",
    niche: "R5 contract validation",
    siteBrand: "R5 Envelope",
    authorByline: "QA",
    monetizationModel: "subscriptions",
    targetPersona: "operators validating result envelopes",
    primaryCompetitors: ["competitor.example"],
    measurementAccess: [],
  });

  registerSpecialist({
    id: "r5-envelope-probe",
    name: "R5 Envelope Probe",
    description: "Writes a local artifact so the queue can persist an R5 envelope.",
    desk: "desk.r5-envelope-probe",
    inputSchema: z.object({}),
    async execute(ctx) {
      const artifact = await writeArtifact(
        ctx.clientSlug,
        ctx.manifest,
        {
          dir: "audits",
          type: "r5-envelope",
          frontmatterType: "audit",
          title: "R5 Envelope Probe",
          body: "## Result\n\nR5 envelope probe artifact.",
          confidence: "high",
          dataSources: ["manual"],
          costUsd: 0.01,
        },
        {
          facts: ["R5 envelope probe wrote an artifact."],
          threadTitle: "R5 envelope probe",
          threadRationale: "verify normalized result persistence",
          statusNote: "R5 envelope probe complete.",
        },
      );
      return {
        summary: "r5 envelope probe complete",
        resultPath: artifact.relativePath,
        executionResult: SpecialistExecutionResultSchema.parse({
          status: "partial",
          artifact_path: artifact.relativePath,
          data_artifact_path: artifact.dataPath,
          source_paths: ["wiki/sources/native-r5.md"],
          data_sources: ["manual"],
          confidence: "low",
          cost_usd: 0.02,
          duration_ms: 17,
          side_effects: {
            wrote: [artifact.relativePath],
            appended: ["wiki/hot.md"],
          },
        }),
      };
    },
  });

  const job = await enqueue({
    client_slug: client.slug,
    specialist: "r5-envelope-probe",
    payload: {},
    request_id: "r5-envelope-probe-run",
  });
  const terminal = await waitForTerminalJob(getJob, job.id);
  assert.equal(terminal.status, "succeeded");

  const row = getDb()
    .prepare("SELECT result_envelope FROM jobs WHERE id = ?")
    .get(job.id) as { result_envelope: string | null };
  assert.ok(row.result_envelope);
  const envelope = SpecialistExecutionResultSchema.parse(
    JSON.parse(row.result_envelope),
  );
  assert.equal(envelope.status, "partial");
  assert.match(envelope.artifact_path ?? "", /^wiki\/audits\/\d{4}-\d{2}-\d{2}-r5-envelope/);
  assert.equal(envelope.confidence, "low");
  assert.deepEqual(envelope.source_paths, ["wiki/sources/native-r5.md"]);
  assert.deepEqual(envelope.data_sources, ["manual"]);
  assert.equal(envelope.cost_usd, 0.02);
  assert.ok(envelope.duration_ms >= 0);
  assert.deepEqual(envelope.side_effects.wrote, [envelope.artifact_path]);
  assert.deepEqual(envelope.side_effects.appended, ["wiki/hot.md"]);
});

async function waitForTerminalJob(
  getJob: (id: string) => { status: string; message: string | null } | null,
  jobId: string,
): Promise<{ status: string; message: string | null }> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const job = getJob(jobId);
    if (
      job &&
      ["succeeded", "failed", "cancelled"].includes(job.status)
    ) {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const job = getJob(jobId);
  throw new Error(`job ${jobId} did not finish: ${job?.status ?? "missing"}`);
}
