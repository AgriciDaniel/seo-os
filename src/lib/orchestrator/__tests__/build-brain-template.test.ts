import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "build-brain-template-"));
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

test("Deep Brain sweep includes core parity specialists", async () => {
  const { BUILD_BRAIN_SWEEP } = await import("../task-templates.ts");
  const ids = new Set(BUILD_BRAIN_SWEEP.children.map((child) => child.specialist_id));

  for (const id of [
    "vault-linter",
    "technical-auditor",
    "technical-deep-auditor",
    "schema-validator",
    "page-analyzer",
    "sitemap-architect",
    "hreflang-auditor",
    "drift-monitor",
    "keyword-researcher",
    "content-strategist",
    "topic-clusterer",
    "content-brief-generator",
    "competitor-pages",
    "geo-specialist",
    "image-auditor",
    "backlink-analyst",
    "local-seo",
    "maps-intelligence",
    "ecommerce-analyst",
    "programmatic-strategist",
    "flow-framework",
    "google-suite",
    "google-search-console",
    "google-analytics",
    "phase-gate",
    "beast-planner",
  ]) {
    assert.ok(ids.has(id), id);
  }
});

test("Deep Brain sweep includes phase gates between major stages", async () => {
  const { BUILD_BRAIN_SWEEP } = await import("../task-templates.ts");
  assert.equal(BUILD_BRAIN_SWEEP.children.length, 34);
  const phaseGates = BUILD_BRAIN_SWEEP.children
    .map((child, index) => ({ ...child, index }))
    .filter((child) => child.specialist_id === "phase-gate");

  assert.deepEqual(
    phaseGates.map((gate) => gate.payload?.phase),
    ["intake", "diagnostic", "discovery", "synthesis"],
  );
  assert.deepEqual(
    phaseGates.map((gate) => gate.blocked_on_indices),
    [
      // Intake gate waits on vault-linter (0) ONLY — GSC (1) / GA4 (2) are
      // optional and not read by diagnostics, so they run in parallel rather
      // than blocking the diagnostic wave (max-parallelism re-grouping).
      [0],
      [4, 5, 6, 7, 8, 9, 10, 11, 12],
      // Discovery gate ALSO waits on the diagnostic gate (13): the independent
      // discovery specialists now start early in the diagnostic wave, so this
      // edge keeps synthesis correctly ordered after diagnostics complete.
      [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
      [31],
    ],
  );

  const finalGate = BUILD_BRAIN_SWEEP.children.at(-1);
  assert.equal(finalGate?.specialist_id, "vault-linter");
  assert.deepEqual(finalGate?.blocked_on_indices, [32]);
});

test("Max-parallelism: audit-independent specialists start at the intake gate", async () => {
  const { BUILD_BRAIN_SWEEP } = await import("../task-templates.ts");
  const byId = new Map(
    BUILD_BRAIN_SWEEP.children.map((child, index) => [`${child.specialist_id}:${index}`, child]),
  );
  // These read only page signals / manifest / vault — never the diagnostic
  // audits — so they block on the intake gate (index 3), not diagnostic (13).
  const startEarly = [
    "keyword-researcher",
    "backlink-analyst",
    "image-auditor",
    "brand-strategist",
    "content-strategist",
    "local-seo",
    "maps-intelligence",
    "flow-framework",
  ];
  for (const id of startEarly) {
    const entry = [...byId.entries()].find(([key]) => key.startsWith(`${id}:`));
    assert.ok(entry, `${id} present in sweep`);
    assert.deepEqual(
      entry![1].blocked_on_indices,
      [3],
      `${id} should start in the diagnostic wave (blocked on intake gate 3)`,
    );
  }
});

test("R8 Deep Brain sweep has explicit lint gates before downstream phases", async () => {
  const { BUILD_BRAIN_SWEEP } = await import("../task-templates.ts");
  const children = BUILD_BRAIN_SWEEP.children;
  const lintGates = children
    .map((child, index) => ({ ...child, index }))
    .filter((child) => child.specialist_id === "vault-linter");

  assert.deepEqual(
    lintGates.map((gate) => gate.phase),
    ["intake", "diagnostic", "discovery", "final"],
  );

  const diagnosticLint = lintGates.find((gate) => gate.phase === "diagnostic");
  const diagnosticGate = children.find(
    (child) => child.specialist_id === "phase-gate" && child.phase === "diagnostic",
  );
  assert.equal(diagnosticLint?.index, 12);
  assert.ok(
    diagnosticGate?.blocked_on_indices?.includes(diagnosticLint.index),
    "diagnostic phase gate must wait on the diagnostic vault-linter node",
  );

  const discoveryLint = lintGates.find((gate) => gate.phase === "discovery");
  const discoveryGate = children.find(
    (child) => child.specialist_id === "phase-gate" && child.phase === "discovery",
  );
  assert.equal(discoveryLint?.index, 27);
  assert.ok(
    discoveryGate?.blocked_on_indices?.includes(discoveryLint.index),
    "discovery phase gate must wait on the discovery vault-linter node",
  );
});

test("Deep Brain sweep dependencies only point to earlier tasks", async () => {
  const { BUILD_BRAIN_SWEEP } = await import("../task-templates.ts");

  BUILD_BRAIN_SWEEP.children.forEach((child, index) => {
    for (const dep of child.blocked_on_indices ?? []) {
      assert.ok(dep >= 0, `${child.title} has negative dependency ${dep}`);
      assert.ok(
        dep < index,
        `${child.title} dependency ${dep} must point to an earlier child than ${index}`,
      );
      assert.ok(
        dep < BUILD_BRAIN_SWEEP.children.length,
        `${child.title} dependency ${dep} is outside the sweep`,
      );
    }
  });
});

test("Deep Brain sweep expands per-locale content audits for multi-locale manifests", async () => {
  const { BUILD_BRAIN_SWEEP, instantiateTemplateChildren } = await import(
    "../task-templates.ts"
  );
  const { ClientManifest } = await import("@/lib/brain/types.ts");

  const manifest = ClientManifest.parse({
    schema_version: "1.0",
    vault: "Locale Client marketing-brain",
    site_under_audit: "https://locale.example.com",
    manifest_owner: "tester",
    last_updated: "2026-05-18",
    sources: {},
    locales: [
      {
        code: "en-US",
        location_name: "United States",
        language_name: "English",
        site_url: "https://locale.example.com/en-us/",
      },
      {
        code: "fr-FR",
        location_name: "France",
        language_name: "French",
        site_url: "https://locale.example.com/fr-fr/",
      },
    ],
    measurement_access: [],
    primary_competitors: [],
  });

  const children = instantiateTemplateChildren({
    template: BUILD_BRAIN_SWEEP,
    manifest,
  });

  assert.equal(children.length, BUILD_BRAIN_SWEEP.children.length + 2);

  const hreflang = children.find((child) => child.specialist_id === "hreflang-auditor");
  assert.deepEqual(
    (hreflang?.payload?.declared_locales as Array<{ code?: string }> | undefined)?.map(
      (locale) => locale.code,
    ),
    ["en-US", "fr-FR"],
  );

  const localeAudits = children.filter(
    (child) =>
      child.specialist_id === "content-strategist" &&
      Boolean(child.payload?.target_locale),
  );
  assert.deepEqual(
    localeAudits.map((child) => child.payload?.target_locale).map((locale) =>
      (locale as { code?: string }).code,
    ),
    ["en-US", "fr-FR"],
  );

  const diagnosticGateIdx = children.findIndex(
    (child) => child.specialist_id === "phase-gate" && child.payload?.phase === "diagnostic",
  );
  for (const child of localeAudits) {
    assert.deepEqual(child.blocked_on_indices, [diagnosticGateIdx]);
  }

  const discoveryGateIdx = children.findIndex(
    (child) => child.specialist_id === "phase-gate" && child.payload?.phase === "discovery",
  );
  const discoveryGate = children[discoveryGateIdx];
  const localeAuditIndices = localeAudits.map((audit) => children.indexOf(audit));
  for (const index of localeAuditIndices) {
    assert.ok(
      discoveryGate?.blocked_on_indices?.includes(index),
      `discovery gate should wait for locale child ${index}`,
    );
  }

  children.forEach((child, index) => {
    for (const dep of child.blocked_on_indices ?? []) {
      assert.ok(dep < index, `${child.title} dependency ${dep} must be before ${index}`);
    }
  });
});

test("dispatchPlanTree materializes locale-aware build-brain children", async () => {
  const { scaffoldClient } = await import("@/lib/brain/scaffold.ts");
  const { readManifest, writeManifest } = await import("../client-context.ts");
  const { dispatchPlanTree } = await import("../dispatch.ts");
  const { listChildren } = await import("../task.ts");
  const { getCurrentSweep } = await import("../sweeps.ts");

  await scaffoldClient({
    slug: "locale-client",
    clientName: "Locale Client",
    siteUrl: "https://locale.example.com",
    owner: "tester",
    businessType: "saas",
    niche: "International SEO automation",
    siteBrand: "Locale Client",
    authorByline: "QA",
    monetizationModel: "subscriptions",
    targetPersona: "International SEO operators",
    primaryCompetitors: ["example.com"],
    measurementAccess: [],
  });
  const manifest = await readManifest("locale-client");
  assert.ok(manifest);
  await writeManifest("locale-client", {
    ...manifest,
    locales: [
      {
        code: "en-US",
        location_name: "United States",
        language_name: "English",
        site_url: "https://locale.example.com/en-us/",
      },
      {
        code: "de-DE",
        location_name: "Germany",
        language_name: "German",
        site_url: "https://locale.example.com/de-de/",
      },
    ],
  });

  const result = await dispatchPlanTree({
    clientSlug: "locale-client",
    permissionMode: "plan",
    toolInput: { template_id: "build-brain" },
  });

  const children = listChildren("locale-client", result.rootTaskId);
  const localeAudits = children.filter(
    (child) =>
      child.specialist_id === "content-strategist" &&
      Boolean(child.payload.target_locale),
  );
  assert.equal(children.length, 36);
  assert.equal(localeAudits.length, 2);
  assert.deepEqual(
    localeAudits.map((child) => (child.payload.target_locale as { code?: string }).code),
    ["en-US", "de-DE"],
  );
  assert.equal(result.costPreflight.estimates.length, 36);

  const sweep = await getCurrentSweep("locale-client");
  assert.equal(sweep?.children.length, 36);
  assert.equal(sweep?.cost_preflight?.estimates.length, 36);
  assert.deepEqual(
    sweep?.children
      .filter(
        (child) =>
          child.specialist_id === "content-strategist" &&
          child.title.startsWith("Locale content audit:"),
      )
      .map((child) => child.phase),
    ["discovery", "discovery"],
  );
});

test("Deep Brain sweep feeds GitHub repository context into brand strategy", async () => {
  const { BUILD_BRAIN_SWEEP, instantiateTemplateChildren } = await import(
    "../task-templates.ts"
  );
  const { ClientManifest } = await import("@/lib/brain/types.ts");

  const manifest = ClientManifest.parse({
    schema_version: "1.0",
    vault: "GitHub Client marketing-brain",
    site_under_audit: "https://github-client.example.com",
    manifest_owner: "tester",
    last_updated: "2026-05-18",
    sources: {},
    github_url: "https://github.com/AgriciDaniel/claude-seo",
    measurement_access: [],
    primary_competitors: [],
  });

  const children = instantiateTemplateChildren({
    template: BUILD_BRAIN_SWEEP,
    manifest,
  });
  const brand = children.find((child) => child.specialist_id === "brand-strategist");

  assert.equal(brand?.payload?.github_url, "https://github.com/AgriciDaniel/claude-seo");
  assert.match(brand?.goal ?? "", /README, release, star, and commit signals/);
  assert.equal(children.length, BUILD_BRAIN_SWEEP.children.length);
});

test("Deep Brain sweep phase model preserves duplicate specialist phases", async () => {
  const { BUILD_BRAIN_SWEEP } = await import("../task-templates.ts");
  const { scaffoldClient } = await import("@/lib/brain/scaffold.ts");
  const { createTaskTree } = await import("../task.ts");
  const { getCurrentSweep } = await import("../sweeps.ts");

  await scaffoldClient({
    slug: "phase-client",
    clientName: "Phase Client",
    siteUrl: "https://phase.example.com",
    owner: "tester",
    businessType: "saas",
    niche: "SEO workflow automation",
    siteBrand: "Phase Client",
    authorByline: "QA",
    monetizationModel: "subscriptions",
    targetPersona: "SEO operators",
    primaryCompetitors: ["example.com"],
    measurementAccess: [],
  });

  const tree = createTaskTree({
    client_slug: "phase-client",
    rootTitle: BUILD_BRAIN_SWEEP.rootTitle,
    rootGoal: BUILD_BRAIN_SWEEP.rootGoal,
    permission_mode: "auto",
    request_id: "phase-test",
    kind: BUILD_BRAIN_SWEEP.kind,
    template_id: BUILD_BRAIN_SWEEP.id,
    children: BUILD_BRAIN_SWEEP.children.map((child) => ({
      title: child.title,
      goal: child.goal,
      specialist_id: child.specialist_id,
      payload: child.payload,
      blocked_on_indices: child.blocked_on_indices,
    })),
  });
  assert.equal(tree.children.length, BUILD_BRAIN_SWEEP.children.length);

  const sweep = await getCurrentSweep("phase-client");
  assert.ok(sweep);
  const linterPhases = sweep.children
    .filter((child) => child.specialist_id === "vault-linter")
    .map((child) => child.phase);
  const phaseGatePhases = sweep.children
    .filter((child) => child.specialist_id === "phase-gate")
    .map((child) => child.phase);

  assert.deepEqual(linterPhases, ["intake", "diagnostic", "discovery", "final"]);
  assert.deepEqual(phaseGatePhases, [
    "intake",
    "diagnostic",
    "discovery",
    "synthesis",
  ]);
  assert.equal(sweep.children[0]?.phase, "intake");
  assert.equal(sweep.children.at(-1)?.phase, "final");
});
