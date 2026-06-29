import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "seo-office-finalize-"));
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

test("finalizeBrainSweep emits partial_brain when any child specialist failed", async () => {
  const { createTaskTree, updateTaskStatus } = await import(
    "@/lib/orchestrator/task.ts"
  );
  const { finalizeBrainSweep } = await import(
    "@/lib/orchestrator/finalize-sweep.ts"
  );
  const { readNote } = await import("@/lib/brain/vault-fs.ts");
  const { readLog } = await import("@/lib/orchestrator/audit-trail.ts");

  const client = await fixtureClient("partial-sweep", {
    measurementAccess: ["search-console"],
  });
  const beforeLog = await readLog(client.slug);

  const { root, children } = createTaskTree({
    client_slug: client.slug,
    rootTitle: "Build the brain",
    rootGoal: "verify partial finalization",
    permission_mode: "auto",
    request_id: "partial-sweep-test",
    kind: "sweep",
    template_id: "build-brain",
    children: [
      {
        title: "Technical SEO audit",
        goal: "ok",
        specialist_id: "technical-auditor",
      },
      {
        title: "Competitor pages",
        goal: "fail",
        specialist_id: "competitor-pages",
      },
    ],
  });

  updateTaskStatus(children[0].id, "succeeded", {
    result_summary: "technical audit complete",
  });
  updateTaskStatus(children[1].id, "failed", {
    result_summary: "competitor API failed",
  });

  const readiness = await finalizeBrainSweep(client.slug, root.id);
  const afterLog = await readLog(client.slug);
  assert.equal(readiness?.status, "partial_brain");
  assert.equal(readiness?.firstAction, "Retry competitor-pages");
  assert.match(readiness?.blockers.join("\n") ?? "", /competitor API failed/);
  assert.equal(
    afterLog.length,
    beforeLog.length + 1,
    "finalization must append exactly one sweep log entry",
  );
  assert.match(afterLog[0]?.title ?? "", /brain sweep review/);

  const today = new Date().toISOString().slice(0, 10);
  const review = await readNote(
    client.slug,
    `wiki/reviews/${today}-brain-sweep-${root.id.slice(0, 8)}.md`,
  );
  assert.equal(review?.frontmatter.approval_status, "needs-review");
  assert.equal(review?.frontmatter.status, "needed");
  assert.ok(review?.frontmatter.tags?.includes("readiness:partial_brain"));
  assert.match(review?.body ?? "", /1\/2 succeeded/);
  assert.match(review?.body ?? "", /Status:\*\* partial_brain|status:\*\* partial_brain/i);
  assert.match(review?.body ?? "", /Retry competitor-pages/i);
});

test("finalizeBrainSweep returns needs_data instead of throwing for skipped integrations", async () => {
  const { createTaskTree, updateTaskStatus } = await import(
    "@/lib/orchestrator/task.ts"
  );
  const { finalizeBrainSweep } = await import(
    "@/lib/orchestrator/finalize-sweep.ts"
  );
  const { readNote } = await import("@/lib/brain/vault-fs.ts");

  const client = await fixtureClient("needs-data-sweep", {
    measurementAccess: [],
  });

  const { root, children } = createTaskTree({
    client_slug: client.slug,
    rootTitle: "Build the brain",
    rootGoal: "verify needs-data finalization",
    permission_mode: "auto",
    request_id: "needs-data-sweep-test",
    kind: "sweep",
    template_id: "build-brain",
    children: [
      {
        title: "Technical SEO audit",
        goal: "ok",
        specialist_id: "technical-auditor",
      },
      {
        title: "Keyword opportunity scan",
        goal: "skip",
        specialist_id: "keyword-researcher",
      },
    ],
  });

  updateTaskStatus(children[0].id, "succeeded", {
    result_summary: "technical audit complete",
  });
  updateTaskStatus(children[1].id, "cancelled", {
    result_summary: "skipped: requires DataForSEO (not configured)",
  });

  const readiness = await finalizeBrainSweep(client.slug, root.id);
  assert.equal(readiness?.status, "needs_data");

  const today = new Date().toISOString().slice(0, 10);
  const review = await readNote(
    client.slug,
    `wiki/reviews/${today}-brain-sweep-${root.id.slice(0, 8)}.md`,
  );
  assert.equal(review?.frontmatter.approval_status, "needs-review");
  assert.match(review?.body ?? "", /Status:\*\* needs_data|status:\*\* needs_data/i);
  assert.match(review?.body ?? "", /1 skipped/);
});

test("finalizeBrainSweep carries evidence ledger cost into manifest source rows", async () => {
  const { appendEvidence } = await import("@/lib/brain/evidence-ledger.ts");
  const { vaultRoot } = await import("@/lib/brain/paths.ts");
  const { readManifest } = await import("@/lib/orchestrator/client-context.ts");
  const { createTaskTree, updateTaskStatus } = await import(
    "@/lib/orchestrator/task.ts"
  );
  const { finalizeBrainSweep } = await import(
    "@/lib/orchestrator/finalize-sweep.ts"
  );
  const { readNote, writeNote } = await import("@/lib/brain/vault-fs.ts");

  const client = await fixtureClient("costed-source-sweep", {
    measurementAccess: ["dataforseo"],
  });

  const today = new Date().toISOString().slice(0, 10);
  const hot = await readNote(client.slug, "wiki/hot.md");
  assert.ok(hot);
  await writeNote(client.slug, "wiki/hot.md", {
    frontmatter: {
      ...hot.frontmatter,
      updated: "2026-01-01",
    },
    body: hot.body,
  });

  const sourcePath = "wiki/sources/DataForSEO Keyword Exports.md";
  await writeNote(client.slug, sourcePath, {
    frontmatter: {
      brain_schema: "marketing-brain.v1",
      type: "source",
      title: "DataForSEO Keyword Exports",
      created: today,
      updated: today,
      tags: ["dataforseo"],
      status: "active",
      owner: "tester",
      confidence: "high",
      approval_status: "approved",
      rollback_note: "Delete this test source note.",
      risk_level: "low",
    },
    body: "# DataForSEO Keyword Exports\n\nLive keyword export fixture.",
  });

  const { root, children } = createTaskTree({
    client_slug: client.slug,
    rootTitle: "Build the brain",
    rootGoal: "verify manifest source cost propagation",
    permission_mode: "auto",
    request_id: "costed-source-sweep-test",
    kind: "sweep",
    template_id: "build-brain",
    children: [
      {
        title: "Keyword opportunity scan",
        goal: "ok",
        specialist_id: "keyword-researcher",
      },
    ],
  });

  await appendEvidence(client.slug, {
    job_id: "job-costed-keywords",
    specialist_id: "keyword-researcher",
    claim: "Keyword export came from a live paid DataForSEO lookup.",
    provenance: "live_api",
    source_paths: [sourcePath],
    confidence: "high",
    cost_usd: 0.42,
  });
  updateTaskStatus(children[0].id, "succeeded", {
    result_summary: "keyword export complete",
    result_path: sourcePath,
  });
  const rawDir = path.join(vaultRoot(client.slug), ".raw", "sources", "retention");
  await fsp.mkdir(rawDir, { recursive: true });
  const oldRaw = path.join(rawDir, "old-fetch.json");
  const freshRaw = path.join(rawDir, "fresh-fetch.json");
  await fsp.writeFile(oldRaw, "{}", "utf8");
  await fsp.writeFile(freshRaw, "{}", "utf8");
  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  await fsp.utimes(oldRaw, oldDate, oldDate);

  await finalizeBrainSweep(client.slug, root.id);
  const hotAfter = await readNote(client.slug, "wiki/hot.md");
  assert.equal(
    hotAfter?.frontmatter.updated,
    today,
    "finalization must bump wiki/hot.md updated date",
  );
  const manifest = await readManifest(client.slug);
  const source = Object.values(manifest?.sources ?? {}).find(
    (entry) => entry.path === sourcePath,
  );

  assert.ok(source, "expected finalized task source in manifest");
  assert.equal(source.cost_usd, 0.42);
  assert.equal(fs.existsSync(oldRaw), false, "old .raw cache entries should be purged");
  assert.equal(fs.existsSync(freshRaw), true, "fresh .raw cache entries should remain");
  assert.equal(
    fs.existsSync(path.join(vaultRoot(client.slug), ".raw", ".manifest.json")),
    true,
    "raw retention must never remove .raw/.manifest.json",
  );
});

async function fixtureClient(
  slug: string,
  overrides: { measurementAccess?: string[] } = {},
): Promise<{ slug: string }> {
  const { cloneFixtureToTmp } = await import("../../../../tests/helpers/makeFixture.ts");
  const { readManifest, writeManifest } = await import("../client-context.ts");
  const { reindexClient } = await import("@/lib/brain/index-db.ts");
  cloneFixtureToTmp("clean-scaffolded", { tmpRoot, slug });
  const manifest = await readManifest(slug);
  assert.ok(manifest);
  await writeManifest(slug, {
    ...manifest,
    vault: `${slug} marketing-brain`,
    site_under_audit: `https://${slug}.example.com`,
    manifest_owner: "tester",
    business_type: "saas",
    niche: "orchestration QA",
    site_brand: slug,
    author_byline: "QA",
    monetization_model: "subscriptions",
    target_persona: "operators testing sweep finalization",
    primary_competitors: ["competitor.example"],
    measurement_access: overrides.measurementAccess ?? [],
  });
  await reindexClient(slug);
  return { slug };
}
