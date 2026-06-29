import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SpecialistContext } from "@/lib/orchestrator/registry";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "phase-gate-test-"));
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

test("phase-gate writes a read-only checkpoint artifact with evidence", async () => {
  await import("@/lib/specialists/phase-gate.ts");
  const { scaffoldClient } = await import("@/lib/brain/scaffold.ts");
  const { getSpecialist } = await import("@/lib/orchestrator/registry.ts");
  const { vaultRoot } = await import("@/lib/brain/paths.ts");

  await scaffoldClient({
    slug: "phase-gate-client",
    clientName: "Phase Gate Client",
    siteUrl: "https://phase-gate.example.com",
    owner: "tester",
    businessType: "saas",
    niche: "workflow QA",
    siteBrand: "Phase Gate Client",
    authorByline: "QA",
    monetizationModel: "subscriptions",
    targetPersona: "SEO operators",
    primaryCompetitors: ["competitor.example"],
    measurementAccess: [],
  });

  const specialist = getSpecialist("phase-gate");
  assert.ok(specialist);
  const result = await specialist.execute(
    await testContext("phase-gate-client", "phase-gate-job", {
      phase: "diagnostic",
      label: "Diagnostic",
    }),
  );

  assert.match(result.summary, /Diagnostic gate recorded/);
  assert.ok(result.resultPath);
  assert.equal(result.executionResult?.artifact_path, result.resultPath);
  assert.equal(result.executionResult?.status, "partial");
  assert.deepEqual(result.executionResult?.data_sources, ["cached"]);
  assert.ok(result.evidence?.length);
  assert.equal(result.evidence?.[0]?.provenance, "cached");

  const artifact = await fsp.readFile(
    path.join(vaultRoot("phase-gate-client"), result.resultPath),
    "utf8",
  );
  assert.match(artifact, /# Diagnostic Phase Gate/);
  assert.match(artifact, /## Readiness Dimensions/);
  assert.match(artifact, /## Rollback/);
});

test("phase-gate fails when the phase has hard lint blockers", async () => {
  await import("@/lib/specialists/phase-gate.ts");
  const { scaffoldClient } = await import("@/lib/brain/scaffold.ts");
  const { getSpecialist } = await import("@/lib/orchestrator/registry.ts");
  const { vaultRoot } = await import("@/lib/brain/paths.ts");

  await scaffoldClient({
    slug: "phase-gate-blocked",
    clientName: "Phase Gate Blocked",
    siteUrl: "https://phase-gate-blocked.example.com",
    owner: "tester",
    businessType: "saas",
    niche: "workflow QA",
    siteBrand: "Phase Gate Blocked",
    authorByline: "QA",
    monetizationModel: "subscriptions",
    targetPersona: "SEO operators",
    primaryCompetitors: ["competitor.example"],
    measurementAccess: [],
  });
  await fsp.rm(path.join(vaultRoot("phase-gate-blocked"), "CODEX.md"));

  const specialist = getSpecialist("phase-gate");
  assert.ok(specialist);

  await assert.rejects(
    async () =>
      specialist.execute(
        await testContext("phase-gate-blocked", "phase-gate-blocked-job", {
          phase: "diagnostic",
          label: "Diagnostic",
        }),
      ),
    /Diagnostic phase gate blocked/,
  );
});

async function testContext(
  clientSlug: string,
  jobId: string,
  input: unknown,
): Promise<SpecialistContext> {
  const { readManifest } = await import("@/lib/orchestrator/client-context.ts");
  const { vaultRoot } = await import("@/lib/brain/paths.ts");
  const manifest = await readManifest(clientSlug);
  assert.ok(manifest);
  const controller = new AbortController();
  return {
    jobId,
    clientSlug,
    input,
    manifest,
    vaultRoot: vaultRoot(clientSlug),
    priorArtifacts: [],
    integrations: { configured: [], missing: [] },
    signal: controller.signal,
    budget: {},
    permissionMode: "auto",
    runId: jobId,
    isCancelled: () => false,
    emit: () => undefined,
  };
}
