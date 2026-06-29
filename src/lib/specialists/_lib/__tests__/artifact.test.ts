import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpRoot: string;
let originalEnv: string | undefined;
const TODAY = new Date().toISOString().slice(0, 10);

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "artifact-test-"));
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

test("writeArtifact preserves same-day rerun artifacts instead of overwriting", async () => {
  const { writeArtifact } = await import("../artifact.ts");
  const { addDays } = await import("../freshness.ts");
  const { getDb } = await import("@/lib/brain/index-db.ts");
  const slug = `artifact-rerun-${Math.random().toString(36).slice(2, 8)}`;
  await fsp.mkdir(path.join(tmpRoot, "vaults", slug, "wiki"), { recursive: true });
  getDb()
    .prepare(
      `INSERT INTO clients (slug, name, site_url, owner)
       VALUES (?, ?, ?, ?)`,
    )
    .run(slug, slug, "https://example.com", "tester");

  const manifest = {
    schema_version: "1.0" as const,
    vault: `${slug} marketing-brain`,
    site_under_audit: "https://example.com",
    manifest_owner: "tester",
    last_updated: TODAY,
    sources: {},
    measurement_access: [],
    primary_competitors: [],
  };
  const input = {
    dir: "audits" as const,
    type: "technical",
    frontmatterType: "audit" as const,
    title: "Technical Audit",
    body: "## Summary\n\nTechnical audit body.",
    costUsd: 0.1234567,
    data: {
      kind: "technical-audit" as const,
      v: 1 as const,
      scores: {
        crawl: 90,
        index: 85,
        mobile: 80,
        cwv: 75,
        schema: 88,
      },
      severity_counts: { high: 0, medium: 1, low: 2, info: 0 },
      signals: [{ id: "crawl", label: "Crawlable", severity: "low" as const }],
    },
  };
  const hotUpdate = {
    facts: ["Technical audit written."],
    threadTitle: "Technical audit",
    threadRationale: "review same-day rerun behavior",
    statusNote: "Artifact test.",
  };

  const first = await writeArtifact(slug, manifest, input, hotUpdate);
  const second = await writeArtifact(slug, manifest, input, hotUpdate);

  assert.equal(first.relativePath, `wiki/audits/${TODAY}-technical.md`);
  assert.equal(first.executionResult.status, "succeeded");
  assert.equal(first.executionResult.artifact_path, first.relativePath);
  assert.equal(first.executionResult.data_artifact_path, first.dataPath);
  assert.deepEqual(first.executionResult.data_sources, []);
  assert.equal(first.executionResult.confidence, "medium");
  assert.equal(first.executionResult.cost_usd, 0.123457);
  assert.ok(first.executionResult.side_effects.wrote.includes(first.relativePath));
  assert.ok(first.executionResult.side_effects.appended.includes("wiki/hot.md"));
  assert.match(
    second.relativePath,
    new RegExp(`^wiki/audits/${TODAY}-technical\\.[a-f0-9]{8}\\.md$`),
  );
  assert.notEqual(second.relativePath, first.relativePath);
  const { readNote } = await import("@/lib/brain/vault-fs.ts");
  const firstNote = await readNote(slug, first.relativePath);
  assert.equal(firstNote?.frontmatter.cost_usd, 0.123457);
  assert.equal(firstNote?.frontmatter.expires_on, addDays(TODAY, 30));
  assert.equal(
    fs.existsSync(path.join(tmpRoot, "vaults", slug, first.relativePath)),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(tmpRoot, "vaults", slug, second.relativePath)),
    true,
  );
  assert.match(
    second.dataPath ?? "",
    new RegExp(`^wiki/audits/${TODAY}-technical\\.[a-f0-9]{8}\\.data\\.json$`),
  );
  assert.match(
    second.reportPath ?? "",
    new RegExp(`^reports/${TODAY}-technical\\.[a-f0-9]{8}\\.html$`),
  );

  const index = await fsp.readFile(
    path.join(tmpRoot, "vaults", slug, "wiki", "index.md"),
    "utf8",
  );
  assert.equal(index.includes(`[[audits/${TODAY}-technical|Technical Audit]]`), true);
  assert.equal(
    index.includes(
      `[[${second.relativePath.replace(/^wiki\//, "").replace(/\.md$/, "")}|Technical Audit]]`,
    ),
    true,
  );

  const log = await fsp.readFile(
    path.join(tmpRoot, "vaults", slug, "wiki", "log.md"),
    "utf8",
  );
  assert.equal((log.match(/technical specialist completed/g) ?? []).length, 2);
});

test("writeArtifact sends high-risk deliverables to needs-review", async () => {
  const { writeArtifact } = await import("../artifact.ts");
  const { getDb } = await import("@/lib/brain/index-db.ts");
  const { readNote } = await import("@/lib/brain/vault-fs.ts");
  const slug = `artifact-risk-${Math.random().toString(36).slice(2, 8)}`;
  await fsp.mkdir(path.join(tmpRoot, "vaults", slug, "wiki"), { recursive: true });
  getDb()
    .prepare(
      `INSERT INTO clients (slug, name, site_url, owner)
       VALUES (?, ?, ?, ?)`,
    )
    .run(slug, slug, "https://example.com", "tester");

  const manifest = {
    schema_version: "1.0" as const,
    vault: `${slug} marketing-brain`,
    site_under_audit: "https://example.com",
    manifest_owner: "tester",
    last_updated: TODAY,
    sources: {},
    measurement_access: [],
    primary_competitors: [],
  };
  const artifact = await writeArtifact(
    slug,
    manifest,
    {
      dir: "deliverables",
      type: "risk-gate",
      frontmatterType: "deliverable",
      title: "Risk Gate",
      body: "## Recommendation\n\nHigh-risk change.",
      risk: "high",
    },
    {
      facts: ["High-risk deliverable written."],
      threadTitle: "Risk gate",
      threadRationale: "review high-risk approval status",
      statusNote: "Risk gate test.",
    },
  );

  const note = await readNote(slug, artifact.relativePath);
  assert.equal(note?.frontmatter.risk_level, "high");
  assert.equal(note?.frontmatter.approval_status, "needs-review");
});

test("writeArtifact records optional-integration degraded-mode frontmatter", async () => {
  const { writeArtifact } = await import("../artifact.ts");
  const { optionalIntegrationDegradation } = await import(
    "@/lib/specialists/integration-readiness.ts"
  );
  const { getDb } = await import("@/lib/brain/index-db.ts");
  const { readNote } = await import("@/lib/brain/vault-fs.ts");
  const slug = `artifact-degraded-${Math.random().toString(36).slice(2, 8)}`;
  await fsp.mkdir(path.join(tmpRoot, "vaults", slug, "wiki"), { recursive: true });
  getDb()
    .prepare(
      `INSERT INTO clients (slug, name, site_url, owner)
       VALUES (?, ?, ?, ?)`,
    )
    .run(slug, slug, "https://example.com", "tester");

  const manifest = {
    schema_version: "1.0" as const,
    vault: `${slug} marketing-brain`,
    site_under_audit: "https://example.com",
    manifest_owner: "tester",
    last_updated: TODAY,
    sources: {},
    measurement_access: [],
    primary_competitors: [],
  };
  const degradation = optionalIntegrationDegradation("image-auditor", {
    env: {},
    e2eMockSpecialists: false,
  });
  assert.deepEqual(degradation.artifact, {
    confidence: "low",
    dataSources: ["model_estimate"],
  });

  const artifact = await writeArtifact(
    slug,
    manifest,
    {
      dir: "audits",
      type: "images",
      frontmatterType: "audit",
      title: "Image Audit",
      body: "## Findings\n\nImage SERP context unavailable.",
      ...degradation.artifact,
    },
    {
      facts: ["Image audit written in degraded mode."],
      threadTitle: "Image audit",
      threadRationale: "review degraded-mode metadata",
      statusNote: "Image audit degraded-mode test.",
    },
  );

  const note = await readNote(slug, artifact.relativePath);
  assert.equal(note?.frontmatter.confidence, "low");
  assert.deepEqual(note?.frontmatter.data_sources, ["model_estimate"]);
});
