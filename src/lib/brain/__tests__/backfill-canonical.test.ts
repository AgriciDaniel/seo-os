import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "backfill-canonical-"));
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

test("backfill merges latest dated artifacts into canonical notes and preserves human text", async () => {
  const { scaffoldClient } = await import("@/lib/brain/scaffold.ts");
  const { backfillCanonicalBrain } = await import("@/lib/brain/backfill-canonical.ts");
  const { readRaw, writeNote, writeRaw } = await import("@/lib/brain/vault-fs.ts");

  const client = await scaffoldClient({
    slug: "backfill-fixture",
    clientName: "Backfill Fixture",
    siteUrl: "https://backfill.example.com",
    owner: "tester",
    businessType: "saas",
    niche: "SEO workflow automation",
    siteBrand: "Backfill Fixture",
    authorByline: "QA",
    monetizationModel: "subscriptions",
    targetPersona: "SEO operators",
    primaryCompetitors: ["zapier.com", "make.com"],
    measurementAccess: ["dataforseo"],
  });
  const today = "2026-05-17";

  await writeRaw(
    client.slug,
    "wiki/keywords/Keyword Targets and Page Map.md",
    "# Keyword Targets and Page Map\n\nHUMAN KEEP: manually approved keyword note.\n",
  );
  await writeRaw(
    client.slug,
    "wiki/deliverables/ULTIMATE BEAST Plan.md",
    "# ULTIMATE BEAST Plan\n\nHUMAN KEEP: executive preference remains.\n",
  );

  await writeNote(client.slug, `wiki/audits/${today}-keywords.md`, {
    frontmatter: fm("Keyword research", "audit", today),
    body: [
      "# Keyword research",
      "Primary target: seo automation platform.",
      "Canonical URL decision: keep / as the primary target.",
      "Acceptance criteria: each target has one URL and owner.",
      "Rollback: reopen the decision if Search Console contradicts it.",
      "Keyword evidence. ".repeat(80),
    ].join("\n\n"),
  });
  await writeNote(client.slug, `wiki/audits/${today}-competitor-keywords.md`, {
    frontmatter: fm("Competitor keywords", "audit", today),
    body: [
      "# Competitor keyword research",
      "Zapier and Make overlap on workflow automation, app integration, and automation builder keywords.",
      "Competitor evidence. ".repeat(80),
    ].join("\n\n"),
  });
  await writeNote(client.slug, `wiki/deliverables/${today}-competitor-pages.md`, {
    frontmatter: fm("Competitor pages", "deliverable", today),
    body: [
      "# Competitor pages",
      "Primary competitors: zapier.com, make.com, n8n.io.",
      "Landscape insight: alternatives and comparison pages are the main opportunity.",
      "Competitor page evidence. ".repeat(80),
    ].join("\n\n"),
  });
  await writeNote(client.slug, `wiki/deliverables/${today}-beast-plan.md`, {
    frontmatter: fm("BEAST plan", "deliverable", today),
    body: [
      "# BEAST plan",
      "Executive summary: fix technical foundations, lock keyword mapping, publish comparison content.",
      "Top opportunities: comparison pages, integration pages, workflow automation hub.",
      "30/60/90 plan, first action, acceptance criteria, and rollback notes are present.",
      "BEAST evidence. ".repeat(120),
    ].join("\n\n"),
  });

  const beforeDryRun = await readRaw(
    client.slug,
    "wiki/keywords/Keyword Targets and Page Map.md",
  );
  const dryRun = await backfillCanonicalBrain(client.slug);
  assert.equal(dryRun.write, false);
  assert.equal(
    dryRun.changes.filter((change) => change.changed).length >= 6,
    true,
    "dry-run should report planned canonical changes",
  );
  assert.equal(
    await readRaw(client.slug, "wiki/keywords/Keyword Targets and Page Map.md"),
    beforeDryRun,
    "dry-run must not mutate the vault",
  );

  const written = await backfillCanonicalBrain(client.slug, { write: true });
  assert.equal(written.write, true);
  assert.equal(written.changes.every((change) => change.sourcePaths.length > 0), true);

  const keywordMap = await readRaw(
    client.slug,
    "wiki/keywords/Keyword Targets and Page Map.md",
  );
  assert.ok(keywordMap?.includes("HUMAN KEEP: manually approved keyword note."));
  assert.ok(keywordMap?.includes("<!-- seo-office:keyword-map:start -->"));
  assert.ok(keywordMap?.includes(`wiki/audits/${today}-keywords.md`));
  assert.ok(keywordMap?.includes("seo automation platform"));

  const competitorLandscape = await readRaw(
    client.slug,
    "wiki/sources/Competitor Landscape Cache.md",
  );
  assert.ok(competitorLandscape?.includes("<!-- seo-office:competitor-landscape:start -->"));
  assert.ok(competitorLandscape?.includes("n8n.io"));

  const competitorKeywords = await readRaw(
    client.slug,
    "wiki/sources/Competitor Keyword Research Summary.md",
  );
  assert.ok(competitorKeywords?.includes("<!-- seo-office:competitor-keywords:start -->"));
  assert.ok(competitorKeywords?.includes("workflow automation"));

  const primaryCompetitors = await readRaw(
    client.slug,
    "wiki/entities/Primary Competitors.md",
  );
  assert.ok(primaryCompetitors?.includes("<!-- seo-office:primary-competitors:start -->"));
  assert.ok(primaryCompetitors?.includes("zapier.com"));

  const beastPlan = await readRaw(client.slug, "wiki/deliverables/ULTIMATE BEAST Plan.md");
  assert.ok(beastPlan?.includes("HUMAN KEEP: executive preference remains."));
  assert.ok(beastPlan?.includes("<!-- seo-office:beast-plan:start -->"));
  assert.ok(beastPlan?.includes(`wiki/deliverables/${today}-beast-plan.md`));

  const second = await backfillCanonicalBrain(client.slug, { write: true });
  assert.equal(
    second.changes.every((change) => change.reason === "up_to_date"),
    true,
    "second write run should be idempotent",
  );
});

function fm(
  title: string,
  type: "audit" | "deliverable",
  today: string,
) {
  return {
    brain_schema: "marketing-brain.v1" as const,
    type,
    title,
    created: today,
    updated: today,
    tags: ["test", "backfill"],
    status: "accepted" as const,
    owner: "tester",
    confidence: "high" as const,
    approval_status: "approved" as const,
    risk_level: "low" as const,
    rollback_note: "Delete this test note.",
  };
}
