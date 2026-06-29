import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "next-action-test-"));
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

test("nextActionFor reports lint blockers instead of idle", async () => {
  const { nextActionFor } = await import("../next-action.ts");
  const slug = await scaffoldFixture("next-action-lint-blocked");
  const hot = path.join(tmpRoot, "vaults", slug, "wiki", "hot.md");
  await fsp.writeFile(
    hot,
    note("meta", "Hot", "This note contains a literal {{niche}} placeholder."),
    "utf8",
  );

  const action = await nextActionFor(slug, {
    registeredSpecialists: new Set(["vault-linter", "technical-auditor"]),
  });
  assert.equal(action.id, "run-vault-linter");
  assert.equal(action.severity, "blocking");
});

test("nextActionFor uses explicit non-idle states before all gates hold", async () => {
  const { nextActionFor } = await import("../next-action.ts");
  const slug = await scaffoldFixture("next-action-coming-soon");
  await clearHotThreads(slug);

  const action = await nextActionFor(slug, {
    registeredSpecialists: new Set(["vault-linter"]),
  });
  assert.equal(action.id, "specialist-coming-soon");
  assert.notEqual(action.id, "idle");
});

test("nextActionFor surfaces the latest failed sweep specialist before milestone work", async () => {
  const { nextActionFor } = await import("../next-action.ts");
  const { createTaskTree, updateTaskStatus } = await import(
    "@/lib/orchestrator/task.ts"
  );
  const slug = await scaffoldFixture("next-action-failed-sweep");
  await clearHotThreads(slug);

  const { children } = createTaskTree({
    client_slug: slug,
    rootTitle: "Build the brain",
    rootGoal: "verify failed specialist next action",
    permission_mode: "auto",
    request_id: "next-action-failed-sweep",
    kind: "sweep",
    template_id: "build-brain",
    children: [
      {
        title: "Page analysis",
        goal: "fail",
        specialist_id: "page-analyzer",
      },
      {
        title: "Sitemap audit",
        goal: "ok",
        specialist_id: "sitemap-architect",
      },
    ],
  });
  updateTaskStatus(children[0].id, "failed", {
    result_summary: "E2E injected failure for page-analyzer",
  });
  updateTaskStatus(children[1].id, "succeeded", {
    result_summary: "sitemap complete",
  });

  const action = await nextActionFor(slug, {
    registeredSpecialists: new Set(["page-analyzer", "sitemap-architect"]),
  });
  assert.equal(action.id, "retry-failed-specialist");
  assert.equal(action.specialistId, "page-analyzer");
  assert.equal(action.severity, "high");
  assert.match(action.rationale, /E2E injected failure/);
});

test("nextActionFor returns idle only after lint and milestone gates hold", async () => {
  const { nextActionFor } = await import("../next-action.ts");
  const slug = await scaffoldFixture("next-action-all-clear");
  await clearHotThreads(slug);
  await writeCompleteMilestones(slug);

  const action = await nextActionFor(slug, {
    registeredSpecialists: new Set([
      "vault-linter",
      "technical-auditor",
      "content-strategist",
      "schema-validator",
      "keyword-researcher",
      "beast-planner",
    ]),
  });
  assert.equal(action.id, "idle");
  assert.equal(action.severity, "idle");
});

test("nextActionFor recommends a rerun when a milestone artifact is expired", async () => {
  const { nextActionFor } = await import("../next-action.ts");
  const { writeNote } = await import("@/lib/brain/vault-fs.ts");
  const { reindexNoteRow } = await import("@/lib/brain/index-db.ts");
  const slug = await scaffoldFixture("next-action-expired-keywords");
  await clearHotThreads(slug);
  await writeCompleteMilestones(slug);
  await writeNote(slug, "wiki/audits/2026-01-01-keywords.md", {
    frontmatter: {
      brain_schema: "marketing-brain.v1",
      type: "audit",
      title: "Expired Keyword Audit",
      created: "2026-01-01",
      updated: "2026-01-01",
      expires_on: "2026-01-01",
      tags: ["audit", "keywords"],
      status: "active",
      owner: "tester",
      confidence: "high",
      approval_status: "approved",
      rollback_note: "fixture note can be recreated by the test",
      risk_level: "low",
    },
    body: "Expired keyword audit fixture.",
  });
  assert.equal(await reindexNoteRow(slug, "wiki/audits/2026-01-01-keywords.md"), true);

  const action = await nextActionFor(slug, {
    registeredSpecialists: new Set([
      "vault-linter",
      "technical-auditor",
      "content-strategist",
      "schema-validator",
      "keyword-researcher",
      "beast-planner",
    ]),
  });
  assert.equal(action.id, "run-keyword-researcher");
  assert.match(action.headline, /refresh expired artifact/i);
  assert.notEqual(action.id, "idle");
});

async function scaffoldFixture(slug: string): Promise<string> {
  const { cloneFixtureToTmp } = await import("../../../../tests/helpers/makeFixture.ts");
  const { reindexClient } = await import("@/lib/brain/index-db.ts");
  cloneFixtureToTmp("clean-scaffolded", { tmpRoot, slug });
  await reindexClient(slug);
  return slug;
}

async function clearHotThreads(slug: string): Promise<void> {
  await fsp.writeFile(
    path.join(tmpRoot, "vaults", slug, "wiki", "hot.md"),
    note(
      "meta",
      "Hot",
      [
        "# Hot",
        "",
        "## Last Updated",
        "2026-05-17",
        "",
        "## Key Recent Facts",
        "- Fixture brain is ready for next-action evaluation.",
        "",
        "## Recent Changes",
        "- Test removed blocking hot threads.",
        "",
        "## Active Threads",
        "1. (no active threads)",
        "",
        "## Status Note",
        "Fixture hot cache is clear.",
      ].join("\n"),
    ),
    "utf8",
  );
}

async function writeCompleteMilestones(slug: string): Promise<void> {
  const root = path.join(tmpRoot, "vaults", slug);
  await fsp.mkdir(path.join(root, "wiki", "audits"), { recursive: true });
  await fsp.mkdir(path.join(root, "wiki", "keywords"), { recursive: true });
  await fsp.mkdir(path.join(root, "wiki", "deliverables"), { recursive: true });
  await fsp.writeFile(
    path.join(root, "wiki", "audits", "2026-05-17-technical.md"),
    note("audit", "Technical Audit", "Technical audit is complete."),
    "utf8",
  );
  await fsp.writeFile(
    path.join(root, "wiki", "audits", "2026-05-17-content.md"),
    note("audit", "Content Audit", "Content audit is complete."),
    "utf8",
  );
  await fsp.writeFile(
    path.join(root, "wiki", "audits", "2026-05-17-schema.md"),
    note("audit", "Schema Audit", "Schema audit is complete."),
    "utf8",
  );
  await fsp.writeFile(
    path.join(root, "wiki", "keywords", "Keyword Workbook.md"),
    note("concept", "Keyword Workbook", "Keyword workbook is complete."),
    "utf8",
  );
  await fsp.writeFile(
    path.join(root, "wiki", "deliverables", "2026-05-17-beast-plan.md"),
    note("deliverable", "BEAST Plan", "BEAST plan is complete."),
    "utf8",
  );
}

function note(type: string, title: string, body: string): string {
  return `---
brain_schema: marketing-brain.v1
type: ${type}
title: "${title}"
created: 2026-05-17
updated: 2026-05-17
tags: []
status: active
owner: tester
confidence: high
approval_status: approved
rollback_note: "fixture note can be recreated by the test"
risk_level: low
---

${body}
`;
}
