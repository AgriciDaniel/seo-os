import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "brain-readiness-"));
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

test("readiness returns needs_data when live measurement sources are missing", async () => {
  const { evaluateBrainReadiness } = await import("@/lib/brain/readiness.ts");

  const client = await fixtureClient("missing-data", { measurementAccess: [] });

  const report = await evaluateBrainReadiness(client.slug, {
    dataAccessOverride: "missing",
    lintScore: 100,
    lintErrors: 0,
  });

  assert.equal(report.status, "needs_data");
  assert.ok(report.missingDataSources.includes("DataForSEO"));
  assert.match(report.suggestions[0]?.title ?? "", /connect measurement data/i);
});

test("fixture data access is scoped to the client's declared measurement access", async () => {
  const { evaluateBrainReadiness } = await import("@/lib/brain/readiness.ts");

  const originalFixture = process.env.SEO_OFFICE_E2E_DEEP_BRAIN_FIXTURE;
  process.env.SEO_OFFICE_E2E_DEEP_BRAIN_FIXTURE = "1";
  try {
    const client = await fixtureClient("fixture-no-access", {
      measurementAccess: [],
    });

    const report = await evaluateBrainReadiness(client.slug, {
      lintScore: 100,
      lintErrors: 0,
    });

    assert.equal(report.status, "needs_data");
    assert.deepEqual(report.missingDataSources, [
      "Search Console",
      "GA4",
      "DataForSEO",
    ]);
  } finally {
    if (originalFixture === undefined) {
      delete process.env.SEO_OFFICE_E2E_DEEP_BRAIN_FIXTURE;
    } else {
      process.env.SEO_OFFICE_E2E_DEEP_BRAIN_FIXTURE = originalFixture;
    }
  }
});

test("readiness only becomes deep_ready after structure, evidence, synthesis, reports, and data are present", async () => {
  const { evaluateBrainReadiness } = await import("@/lib/brain/readiness.ts");

  const { client, reviewPath, children } = await populateDeepReadyFixture("deep-ready", {
    withEvidenceLedger: true,
  });

  const report = await evaluateBrainReadiness(client.slug, {
    children: children as never,
    dataAccessOverride: "present",
    lintScore: 100,
    lintErrors: 0,
    reviewPath,
  });

  assert.equal(report.status, "deep_ready");
  assert.ok(report.score >= 92, `expected score >= 92, got ${report.score}`);
  assert.ok(report.dimensions.some((d) => d.key === "evidence_quality"));
  assert.ok(report.dimensions.some((d) => d.key === "canonical_note_depth"));
  assert.ok(report.dimensions.some((d) => d.key === "source_specificity"));
  assert.ok(report.dimensions.some((d) => d.key === "actionability"));
  assert.ok(report.dimensions.some((d) => d.key === "integration_completeness"));
  const reviewSuggestion = report.suggestions.find((s) => /review/i.test(s.title));
  assert.ok(reviewSuggestion);
  assert.equal(
    reviewSuggestion.cta.type === "open_note" ? reviewSuggestion.cta.path : "",
    reviewPath,
  );
});

test("readiness stays draft when the evidence ledger is missing", async () => {
  const { evaluateBrainReadiness } = await import("@/lib/brain/readiness.ts");

  const { client, reviewPath, children } = await populateDeepReadyFixture(
    "missing-ledger",
    { withEvidenceLedger: false },
  );

  const report = await evaluateBrainReadiness(client.slug, {
    children: children as never,
    dataAccessOverride: "present",
    lintScore: 100,
    lintErrors: 0,
    reviewPath,
  });

  assert.equal(report.status, "draft");
  assert.ok(
    report.gaps.some((gap) => /evidence ledger/i.test(gap)),
    `expected evidence ledger gap, got ${report.gaps.join(" | ")}`,
  );
});

test("readiness stays draft when canonical managed sections are too shallow", async () => {
  const { updateCanonicalNote } = await import("@/lib/brain/canonical-writer.ts");
  const { evaluateBrainReadiness } = await import("@/lib/brain/readiness.ts");

  const { client, reviewPath, children } = await populateDeepReadyFixture(
    "shallow-canonical",
    { withEvidenceLedger: true },
  );
  await updateCanonicalNote(
    client.slug,
    "wiki/sources/DataForSEO Keyword Exports.md",
    "dataforseo-keywords",
    "A short placeholder-like keyword note.",
  );

  const report = await evaluateBrainReadiness(client.slug, {
    children: children as never,
    dataAccessOverride: "present",
    lintScore: 100,
    lintErrors: 0,
    reviewPath,
  });

  assert.equal(report.status, "draft");
  assert.ok(
    report.gaps.some((gap) => /too shallow/i.test(gap)),
    `expected shallow canonical gap, got ${report.gaps.join(" | ")}`,
  );
});

test("readiness stays draft when only dated reports exist without canonical updates", async () => {
  const { writeNote, writeRaw } = await import("@/lib/brain/vault-fs.ts");
  const { appendEvidence } = await import("@/lib/brain/evidence-ledger.ts");
  const { evaluateBrainReadiness } = await import("@/lib/brain/readiness.ts");

  const client = await fixtureClient("dated-only", {
    measurementAccess: ["dataforseo", "google-search-console"],
  });
  const today = new Date().toISOString().slice(0, 10);
  await writeNote(client.slug, `wiki/deliverables/${today}-beast-plan.md`, {
    frontmatter: fm("Dated BEAST plan", "deliverable", today),
    body: deepPlanBody(),
  });
  await writeNote(client.slug, `wiki/reviews/${today}-brain-sweep-dated.md`, {
    frontmatter: fm("Brain sweep review", "meta", today),
    body: finalReviewBody(),
  });
  for (const name of ["technical", "keywords", "sxo"]) {
    await writeRaw(client.slug, `reports/${today}-${name}.html`, "<html><body>report</body></html>");
  }
  for (let i = 0; i < 10; i++) {
    await appendEvidence(client.slug, {
      job_id: `job-${i}`,
      specialist_id: `specialist-${i}`,
      claim: `Fixture evidence claim ${i}.`,
      provenance: i % 2 === 0 ? "live_api" : "cached",
      source_paths: [`wiki/sources/source-family-${i % 4}/source-${i}.md`],
      confidence: "high",
      cost_usd: 0,
    });
  }

  const children = succeededChildren(client.slug, 21);
  const report = await evaluateBrainReadiness(client.slug, {
    children: children as never,
    dataAccessOverride: "present",
    lintScore: 100,
    lintErrors: 0,
    reviewPath: `wiki/reviews/${today}-brain-sweep-dated.md`,
  });

  assert.equal(report.status, "draft");
  assert.ok(
    report.gaps.some((gap) => /canonical brain note/i.test(gap)),
    `expected canonical gap, got ${report.gaps.join(" | ")}`,
  );
});

async function populateDeepReadyFixture(
  slug: string,
  options: { withEvidenceLedger: boolean },
) {
  const { writeNote, writeRaw } = await import("@/lib/brain/vault-fs.ts");
  const { updateCanonicalNote } = await import("@/lib/brain/canonical-writer.ts");
  const { appendEvidence } = await import("@/lib/brain/evidence-ledger.ts");

  const client = await fixtureClient(slug, {
    measurementAccess: ["dataforseo", "google-search-console"],
  });
  const today = new Date().toISOString().slice(0, 10);

  for (let i = 1; i <= 6; i++) {
    await writeNote(client.slug, `wiki/sources/source-${i}.md`, {
      frontmatter: fm(`Source ${i}`, "source", today),
      body: `# Source ${i}\n\n${richSection(`Evidence-backed source note ${i}`)}`,
    });
  }

  await writeNote(client.slug, "wiki/keywords/Keyword Targets and Page Map.md", {
    frontmatter: fm("Keyword Targets and Page Map", "keyword-strategy", today),
    body: `# Keyword Targets and Page Map\n\nOne canonical URL per query.\n\n<!-- seo-office:keyword-map:start -->\n${richSection("The keyword map uses deterministic fixture data to assign one page to each priority query.")}\n\n| Keyword | URL | Source |\n| --- | --- | --- |\n| seo automation | / | [[DataForSEO Keyword Exports]] |\n<!-- seo-office:keyword-map:end -->`,
  });

  await writeNote(client.slug, "wiki/sources/DataForSEO Keyword Exports.md", {
    frontmatter: fm("DataForSEO Keyword Exports", "source", today),
    body: "# DataForSEO Keyword Exports\n\nClean fixture note ready for managed keyword evidence.",
  });

  await updateCanonicalNote(
    client.slug,
    "wiki/sources/Competitor Landscape Cache.md",
    "competitor-landscape",
    richSection("Tier 1 competitors: zapier.com and make.com. Source: manual fixture."),
  );
  await updateCanonicalNote(
    client.slug,
    "wiki/sources/Competitor Keyword Research Summary.md",
    "competitor-keywords",
    richSection("Shared competitor keyword coverage exists for workflow automation terms."),
  );
  await updateCanonicalNote(
    client.slug,
    "wiki/sources/DataForSEO Keyword Exports.md",
    "dataforseo-keywords",
    `${richSection("Keyword exports were collected from deterministic live_api fixture rows.")}\n\n| Keyword | Volume | Provenance |\n| --- | ---: | --- |\n| seo automation | 1200 | live_api fixture |`,
  );
  await updateCanonicalNote(
    client.slug,
    "wiki/sources/PAA Mining Digest.md",
    "paa-digest",
    `${richSection("People also ask questions were grouped by workflow intent and buying stage.")}\n\n- What is SEO automation?\n- How do agencies build SEO workflows?`,
  );
  await updateCanonicalNote(
    client.slug,
    "wiki/entities/Primary Competitors.md",
    "primary-competitors",
    `${richSection("Primary competitors represent automation platforms with overlapping SEO demand.")}\n\n- [[zapier.com]]\n- [[make.com]]`,
  );
  await updateCanonicalNote(
    client.slug,
    "wiki/keywords/Keyword Cannibalization Ledger.md",
    "keyword-cannibalization",
    richSection("No fixture cannibalization conflicts found across the selected target pages."),
  );
  await updateCanonicalNote(
    client.slug,
    "wiki/decisions/Keyword to URL Map.md",
    "keyword-url-decisions",
    `${richSection("Keyword to URL decisions lock one canonical page per search intent.")}\n\n| Keyword | Canonical URL | Decision |\n| --- | --- | --- |\n| seo automation | / | keep homepage as target |`,
  );
  await updateCanonicalNote(
    client.slug,
    "wiki/deliverables/ULTIMATE BEAST Plan.md",
    "beast-plan",
    deepPlanBody(),
  );

  await writeNote(client.slug, `wiki/reviews/${today}-brain-sweep-deep.md`, {
    frontmatter: fm("Brain sweep review", "meta", today),
    body: finalReviewBody(),
  });

  await writeNote(client.slug, `wiki/deliverables/${today}-beast-plan.md`, {
    frontmatter: fm("BEAST plan", "deliverable", today),
    body: deepPlanBody(),
  });

  for (const name of ["technical", "keywords", "sxo"]) {
    await writeRaw(client.slug, `reports/${today}-${name}.html`, "<html><body>report</body></html>");
  }

  if (options.withEvidenceLedger) {
    for (let i = 0; i < 12; i++) {
      await appendEvidence(client.slug, {
        job_id: `job-${i}`,
        specialist_id: `specialist-${i}`,
        claim: `Fixture evidence claim ${i} ties source family ${i % 4} to a recommendation.`,
        provenance: i % 3 === 0 ? "live_api" : i % 3 === 1 ? "cached" : "manual",
        source_paths: [`wiki/sources/source-family-${i % 4}/source-${i}.md`],
        confidence: i % 5 === 0 ? "medium" : "high",
        cost_usd: 0,
      });
    }
  }

  return {
    client,
    today,
    reviewPath: `wiki/reviews/${today}-brain-sweep-deep.md`,
    children: succeededChildren(client.slug, 21),
  };
}

function succeededChildren(clientSlug: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `task-${i}`,
    client_slug: clientSlug,
    status: "succeeded",
    specialist_id: `specialist-${i}`,
  }));
}

async function fixtureClient(
  slug: string,
  overrides: { measurementAccess?: string[] } = {},
): Promise<{ slug: string }> {
  const { cloneFixtureToTmp } = await import("../../../../tests/helpers/makeFixture.ts");
  const { readManifest, writeManifest } = await import(
    "@/lib/orchestrator/client-context.ts"
  );
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
    niche: "SEO workflow automation",
    site_brand: slug,
    author_byline: "QA",
    monetization_model: "subscriptions",
    target_persona: "SEO operators",
    primary_competitors: ["zapier.com", "make.com"],
    measurement_access: overrides.measurementAccess ?? [],
  });
  await reindexClient(slug);
  return { slug };
}

function fm(
  title: string,
  type: "source" | "keyword-strategy" | "meta" | "deliverable",
  today: string,
) {
  return {
    brain_schema: "marketing-brain.v1" as const,
    type,
    title,
    created: today,
    updated: today,
    tags: ["test"],
    status: "accepted" as const,
    owner: "tester",
    confidence: "high" as const,
    approval_status: "approved" as const,
    risk_level: "low" as const,
    rollback_note: "Delete this test note.",
  };
}

function deepPlanBody(): string {
  const sections = [
    "# BEAST plan",
    "## Executive summary",
    "This plan turns the SEO brain into a focused execution system.",
    "## Top opportunities",
    "Opportunity one is technical cleanup. Opportunity two is keyword mapping. Opportunity three is content expansion.",
    "## Risks",
    "The main risk is acting without data. The second risk is duplicate pages.",
    "## 30 day plan",
    "Fix indexation, page speed, canonical signals, and the first content brief.",
    "## 60 day plan",
    "Publish the comparison cluster, improve internal links, and refresh source notes.",
    "## 90 day plan",
    "Scale the winning templates, review rankings, and update priorities.",
    "## First action",
    "Lock the keyword-to-URL map.",
    "## Acceptance criteria",
    "Every target has a URL, owner, source, and next action.",
    "## Rollback notes",
    "Move disputed recommendations back to needs-review and preserve the prior note.",
  ];
  return [...sections, "Detailed rationale. ".repeat(1500)].join("\n\n");
}

function finalReviewBody(): string {
  return [
    "# Brain sweep review",
    "## Top opportunities",
    "The highest priority opportunities are technical cleanup, keyword mapping, and content expansion.",
    "## Blockers",
    "No launch blockers remain in this deterministic fixture.",
    "## First action",
    "Lock the keyword-to-URL map before publishing new briefs.",
    "## Acceptance criteria",
    "Every target has a canonical URL, owner, source, evidence claim, and next action.",
    "## Rollback notes",
    "Move disputed recommendations back to needs-review and preserve prior decisions.",
    "Human summary. ".repeat(80),
  ].join("\n\n");
}

function richSection(seed: string): string {
  return [
    seed,
    "This fixture section names the client, source family, search intent, evidence provenance, ranking implication, decision owner, acceptance criteria, and rollback path so the readiness evaluator can distinguish useful client-specific content from a thin seed placeholder.",
    "The recommendation is tied to the current site, competitor overlap, measurement context, and canonical destination page rather than a generic template. It records what changed, why it matters, how confidence was earned, and what the next specialist should reuse instead of rediscovering.",
    "Evidence detail. ".repeat(35),
  ].join("\n\n");
}
