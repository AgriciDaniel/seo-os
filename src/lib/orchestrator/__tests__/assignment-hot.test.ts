import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "assignment-hot-"));
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

test("terminal specialist hot mirror records completed_at and artifact path", async () => {
  const { getDb } = await import("@/lib/brain/index-db.ts");
  const { scaffoldClient } = await import("@/lib/brain/scaffold.ts");
  const { readRaw } = await import("@/lib/brain/vault-fs.ts");
  const {
    createAssignment,
    linkJob,
    updateStatus,
  } = await import("@/lib/orchestrator/assignment.ts");

  const client = await scaffoldClient({
    slug: "assignment-hot-client",
    clientName: "Assignment Hot Client",
    siteUrl: "https://assignment-hot.example.com",
    owner: "tester",
    businessType: "saas",
    niche: "assignment traceability",
    siteBrand: "Assignment Hot",
    authorByline: "QA",
    monetizationModel: "subscriptions",
    targetPersona: "operators validating specialist handoff",
    primaryCompetitors: ["competitor.example"],
    measurementAccess: [],
  });
  const assignment = createAssignment({
    client_slug: client.slug,
    specialist_id: "keyword-researcher",
    parent_message_id: null,
    title: "Keyword map",
    brief: "Build the keyword map.",
    payload: {},
    permission_mode: "auto",
    request_id: "assignment-hot-test",
  });
  const jobId = "job-assignment-hot";
  getDb()
    .prepare(
      `INSERT INTO jobs (
         id, client_slug, specialist, status, progress, message, result_path
       )
       VALUES (?, ?, ?, 'succeeded', 1, 'done', ?)`,
    )
    .run(
      jobId,
      client.slug,
      "keyword-researcher",
      "wiki/keywords/2026-05-17-keywords.md",
    );

  const linked = linkJob(assignment.id, jobId);
  assert.ok(linked);
  const terminal = updateStatus(linked.id, "succeeded", "keyword map complete");
  assert.ok(terminal);
  assert.equal(terminal.completed_at, terminal.updated_at);

  const hot = await waitForHot(
    () => readRaw(client.slug, "wiki/specialists/keyword-researcher/hot.md"),
    /\*\*Status\*\*: `succeeded`/,
  );
  assert.ok(hot);
  assert.match(hot, /\*\*Status\*\*: `succeeded`/);
  assert.match(hot, /\*\*Terminal status\*\*: `succeeded`/);
  assert.match(hot, new RegExp(`\\*\\*Completed at\\*\\*: \`${terminal.completed_at}\``));
  assert.match(
    hot,
    /\*\*Artifact path\*\*: `wiki\/keywords\/2026-05-17-keywords\.md`/,
  );
});

test("assignment hot mirror updates automatically for running, failed, and skipped transitions", async () => {
  const { scaffoldClient } = await import("@/lib/brain/scaffold.ts");
  const { readRaw } = await import("@/lib/brain/vault-fs.ts");
  const {
    createAssignment,
    getAssignment,
    updateStatus,
  } = await import("@/lib/orchestrator/assignment.ts");

  const client = await scaffoldClient({
    slug: "assignment-skipped-client",
    clientName: "Assignment Skipped Client",
    siteUrl: "https://assignment-skipped.example.com",
    owner: "tester",
    businessType: "saas",
    niche: "assignment traceability",
    siteBrand: "Assignment Skipped",
    authorByline: "QA",
    monetizationModel: "subscriptions",
    targetPersona: "operators validating skipped specialists",
    primaryCompetitors: ["competitor.example"],
    measurementAccess: [],
  });
  const assignment = createAssignment({
    client_slug: client.slug,
    specialist_id: "keyword-researcher",
    parent_message_id: null,
    title: "Keyword map",
    brief: "Build the keyword map.",
    payload: {},
    permission_mode: "auto",
    request_id: "assignment-skipped-test",
  });
  const running = updateStatus(assignment.id, "running");
  assert.ok(running);
  assert.ok(running.started_at);
  assert.equal(getAssignment(assignment.id)?.started_at, running.started_at);
  const runningHot = await waitForHot(
    () => readRaw(client.slug, "wiki/specialists/keyword-researcher/hot.md"),
    /\*\*Status\*\*: `running`/,
  );
  assert.match(runningHot, /\*\*Status\*\*: `running`/);
  assert.match(
    runningHot,
    new RegExp(`\\*\\*Started at\\*\\*: \`${running.started_at}\``),
  );

  const failed = updateStatus(
    assignment.id,
    "failed",
    "provider timeout while fetching keyword data",
  );
  assert.ok(failed);
  assert.ok(failed.failed_at);
  assert.equal(getAssignment(assignment.id)?.failed_at, failed.failed_at);
  const failedHot = await waitForHot(
    () => readRaw(client.slug, "wiki/specialists/keyword-researcher/hot.md"),
    /\*\*Status\*\*: `failed`/,
  );
  assert.match(failedHot, /\*\*Terminal status\*\*: `failed`/);
  assert.match(
    failedHot,
    new RegExp(`\\*\\*Failed at\\*\\*: \`${failed.failed_at}\``),
  );
  assert.match(failedHot, /\*\*Last message\*\*: provider timeout/);

  const skippedAssignment = createAssignment({
    client_slug: client.slug,
    specialist_id: "keyword-researcher",
    parent_message_id: null,
    title: "Skipped keyword map",
    brief: "Skip the keyword map.",
    payload: {},
    permission_mode: "auto",
    request_id: "assignment-skipped-terminal-test",
  });
  const terminal = updateStatus(
    skippedAssignment.id,
    "cancelled",
    "skipped: requires DataForSEO (not configured)",
  );
  assert.ok(terminal);
  assert.equal(terminal.skip_reason, "requires DataForSEO (not configured)");

  const hot = await waitForHot(
    () => readRaw(client.slug, "wiki/specialists/keyword-researcher/hot.md"),
    /\*\*Terminal status\*\*: `skipped`/,
  );
  assert.ok(hot);
  assert.match(hot, /\*\*Status\*\*: `cancelled`/);
  assert.match(hot, /\*\*Terminal status\*\*: `skipped`/);
  assert.match(
    hot,
    /\*\*Skip reason\*\*: requires DataForSEO \(not configured\)/,
  );
});

async function waitForHot(
  read: () => Promise<string | null>,
  pattern: RegExp,
): Promise<string> {
  const deadline = Date.now() + 1000;
  let latest = "";
  while (Date.now() < deadline) {
    latest = (await read()) ?? "";
    if (pattern.test(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.match(latest, pattern);
  return latest;
}
