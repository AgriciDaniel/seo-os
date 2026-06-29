import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SpecialistContext } from "@/lib/orchestrator/registry";

let tmpRoot: string;
let originalDataDir: string | undefined;
let originalE2EMock: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "specialist-context-"));
  originalDataDir = process.env.SEO_OFFICE_DATA_DIR;
  originalE2EMock = process.env.SEO_OFFICE_E2E_MOCK_SPECIALISTS;
  process.env.SEO_OFFICE_DATA_DIR = tmpRoot;
  delete process.env.SEO_OFFICE_E2E_MOCK_SPECIALISTS;
});

after(async () => {
  const { closeDb } = await import("@/lib/brain/index-db.ts");
  closeDb();
  if (originalDataDir !== undefined) {
    process.env.SEO_OFFICE_DATA_DIR = originalDataDir;
  } else {
    delete process.env.SEO_OFFICE_DATA_DIR;
  }
  if (originalE2EMock !== undefined) {
    process.env.SEO_OFFICE_E2E_MOCK_SPECIALISTS = originalE2EMock;
  } else {
    delete process.env.SEO_OFFICE_E2E_MOCK_SPECIALISTS;
  }
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

test("job queue passes parsed input and expanded specialist context into ctx-first execute()", async () => {
  const { z } = await import("zod");
  const { scaffoldClient } = await import("@/lib/brain/scaffold.ts");
  const { registerSpecialist } = await import(
    "@/lib/orchestrator/registry.ts"
  );
  const { cancelJob, enqueue, getJob } = await import(
    "@/lib/orchestrator/job-queue.ts"
  );

  const client = await scaffoldClient({
    slug: "specialist-context-client",
    clientName: "Specialist Context Client",
    siteUrl: "https://context.example.com",
    owner: "tester",
    businessType: "saas",
    niche: "context contract validation",
    siteBrand: "Context Contract",
    authorByline: "QA",
    monetizationModel: "subscriptions",
    targetPersona: "operators validating specialist handoff",
    primaryCompetitors: ["competitor.example"],
    measurementAccess: [],
  });

  let captured: SpecialistContext | null = null;
  registerSpecialist({
    id: "context-probe",
    name: "Context Probe",
    description: "Captures the runtime specialist context for contract tests.",
    desk: "desk.context-probe",
    inputSchema: z.object({ mode: z.literal("probe") }),
    async execute(ctx) {
      captured = ctx;
      await new Promise<void>((resolve) => {
        if (ctx.signal.aborted) {
          resolve();
          return;
        }
        ctx.signal.addEventListener("abort", () => resolve(), { once: true });
      });
      return { summary: "context ok" };
    },
  });

  const job = await enqueue({
    client_slug: client.slug,
    specialist: "context-probe",
    payload: { mode: "probe" },
    request_id: "context-run",
  });
  const ctx = await waitForContext(() => captured);

  assert.equal(ctx.jobId, job.id);
  assert.equal(ctx.clientSlug, client.slug);
  assert.deepEqual(ctx.input, { mode: "probe" });
  assert.equal(ctx.manifest.site_under_audit, "https://context.example.com");
  assert.equal(path.relative(tmpRoot, ctx.vaultRoot), path.join("vaults", client.slug));
  assert.equal(fs.existsSync(ctx.vaultRoot), true);
  assert.deepEqual(ctx.priorArtifacts, []);
  assert.equal(Array.isArray(ctx.integrations.configured), true);
  assert.deepEqual(ctx.integrations.missing, []);
  assert.deepEqual(ctx.budget, {});
  assert.equal(ctx.permissionMode, "auto");
  assert.equal(ctx.runId, "context-run");
  assert.equal(ctx.signal.aborted, false);
  assert.equal(ctx.isCancelled(), false);
  assert.equal(typeof ctx.emit, "function");

  assert.equal(cancelJob(job.id, client.slug), true);
  const terminal = await waitForTerminalJob(getJob, job.id);
  assert.equal(terminal.status, "cancelled");
});

async function waitForContext(
  getContext: () => SpecialistContext | null,
): Promise<SpecialistContext> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const ctx = getContext();
    if (ctx) return ctx;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("specialist context was not captured before timeout");
}

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
