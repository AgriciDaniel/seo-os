/**
 * End-to-end smoke test for the full Phase 0 + Phase 2 scaffold pipeline.
 *
 * Goal: prove that a fresh `scaffoldClient()` produces a vault where
 * EVERYTHING the user expects on day one is in place — no stale
 * template tokens, no missing meta files, manifest at the canonical
 * `.raw/.manifest.json`, overview reflects the niche, and the linter
 * reports zero errors. This is the "everything covered from the first
 * run" contract.
 *
 * Uses the real vendored template (`vendored/marketing-brain/`) — slow
 * relative to unit tests but worth the coverage: it's the only place
 * that exercises the full slot dictionary, path substitution, manifest
 * relocation, overview regen, index regen, and linter as one pipeline.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "scaffold-smoke-"));
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

test("scaffold rejects missing or blank live-template slot inputs", async () => {
  const { scaffoldClient } = await import("../scaffold.ts");
  const validInput = {
    slug: "invalid-scaffold-input",
    clientName: "Invalid Scaffold Input",
    siteUrl: "https://invalid-scaffold-input.example.com",
    owner: "tester",
    businessType: "affiliate-content",
    niche: "input validation",
    siteBrand: "Invalid Brand",
    authorByline: "QA",
    monetizationModel: "Affiliate revenue",
    targetPersona: "operators checking scaffold validation",
    primaryCompetitors: ["competitor.example"],
    measurementAccess: ["dataforseo"],
  };

  const missingSiteBrand = { ...validInput };
  delete (missingSiteBrand as Partial<typeof validInput>).siteBrand;
  await assert.rejects(
    () => scaffoldClient(missingSiteBrand as never),
    (err) => err instanceof Error && err.name === "ZodError",
  );

  await assert.rejects(
    () =>
      scaffoldClient({
        ...validInput,
        slug: "blank-scaffold-slot",
        siteBrand: "   ",
      }),
    (err) => err instanceof Error && err.name === "ZodError",
  );

  assert.equal(
    fs.existsSync(path.join(tmpRoot, "vaults", "invalid-scaffold-input")),
    false,
    "invalid scaffold input must fail before creating a vault",
  );
  assert.equal(
    fs.existsSync(path.join(tmpRoot, "vaults", "blank-scaffold-slot")),
    false,
    "blank scaffold slot input must fail before creating a vault",
  );
});

test("fresh scaffold produces a complete, lint-clean vault from day one", async () => {
  const { scaffoldClient } = await import("../scaffold.ts");
  const { manifestPath } = await import("../paths.ts");
  const { ClientManifest } = await import("../types.ts");
  const { lintVault } = await import(
    "@/lib/specialists/vault-linter.ts"
  );

  const slug = "smoke-test";
  const result = await scaffoldClient({
    slug,
    clientName: "Smoke Test",
    siteUrl: "https://example.com",
    owner: "tester",
    businessType: "affiliate-content",
    niche: "outdoor gear",
    siteBrand: "Smoke Gear",
    authorByline: "Smoke Tester",
    monetizationModel: "Affiliate revenue",
    targetPersona: "Outdoor buyers comparing durable gear",
    primaryCompetitors: ["competitor.example", "gear.example"],
    measurementAccess: ["google-search-console", "dataforseo"],
    locale: {
      location_name: "United States",
      language_name: "English",
      timezone: "America/New_York",
    },
  });
  assert.equal(result.slug, slug);

  const vaultDir = path.join(tmpRoot, "vaults", slug);

  // Manifest is at the canonical .raw/.manifest.json (not <vault>/.manifest.json).
  assert.equal(
    fs.existsSync(manifestPath(slug)),
    true,
    "manifest must live at .raw/.manifest.json",
  );
  assert.equal(
    fs.existsSync(path.join(vaultDir, ".manifest.json")),
    false,
    "legacy <vault>/.manifest.json must not exist for fresh scaffolds",
  );

  const manifestRaw = await fsp.readFile(manifestPath(slug), "utf8");
  const manifest = ClientManifest.parse(JSON.parse(manifestRaw));
  assert.deepEqual(
    manifest.sources,
    {},
    "fresh scaffold must initialize the canonical source ledger as an empty record",
  );
  assert.equal(manifest.niche, "outdoor gear");
  assert.equal(manifest.site_brand, "Smoke Gear");
  assert.equal(manifest.business_type, "affiliate-content");
  assert.equal(manifest.author_byline, "Smoke Tester");
  assert.equal(manifest.monetization_model, "Affiliate revenue");
  assert.equal(manifest.target_persona, "Outdoor buyers comparing durable gear");
  assert.deepEqual(manifest.primary_competitors, [
    "competitor.example",
    "gear.example",
  ]);
  assert.deepEqual(manifest.measurement_access, [
    "google-search-console",
    "dataforseo",
  ]);
  assert.equal(manifest.marketing_brain_version, "0.1.5");
  assert.equal(
    fs.existsSync(
      path.join(vaultDir, "wiki", "sources", "Smoke Test marketing-brain.md"),
    ),
    true,
    "scaffold must create the canonical vault metadata source note artifacts cite",
  );

  // Filename token substitution — these would be `{{client_name}}.md` etc.
  // pre-Phase-0 and break every wikilink that targets them.
  assert.equal(
    fs.existsSync(path.join(vaultDir, "wiki", "entities", "Smoke Test.md")),
    true,
    "wiki/entities/{{client_name}}.md must have been substituted to the client name",
  );
  assert.equal(
    fs.existsSync(path.join(vaultDir, "wiki", "entities", "Smoke Gear.md")),
    true,
    "wiki/entities/{{site_brand}}.md must have been substituted to the supplied brand",
  );
  assert.equal(
    fs.existsSync(
      path.join(
        vaultDir,
        "wiki",
        "concepts",
        "E-E-A-T for affiliate-content.md",
      ),
    ),
    true,
    "wiki/concepts/E-E-A-T for {{site_type}}.md must have been substituted",
  );
  assert.equal(
    fs.existsSync(
      path.join(
        vaultDir,
        "wiki",
        "questions",
        "Open Questions for Smoke Test.md",
      ),
    ),
    true,
    "wiki/questions/Open Questions for {{client_name}}.md must have been substituted",
  );

  // overview.md reflects the manifest (Phase 2.3).
  const overview = await fsp.readFile(
    path.join(vaultDir, "wiki", "overview.md"),
    "utf8",
  );
  assert.equal(
    overview.includes("Smoke Test"),
    true,
    "overview must include client name",
  );
  assert.equal(
    overview.includes("outdoor gear"),
    true,
    "overview must include niche",
  );

  // index.md was regenerated against the actual file set (Phase 2.1) —
  // no leftover `{{token}}` placeholders from the template.
  const index = await fsp.readFile(
    path.join(vaultDir, "wiki", "index.md"),
    "utf8",
  );
  assert.equal(
    /\{\{[a-zA-Z0-9_.-]+\}\}/.test(index),
    false,
    "index.md must not contain any literal {{tokens}}",
  );

  const today = new Date().toISOString().slice(0, 10);
  const hot = matter(await fsp.readFile(path.join(vaultDir, "wiki", "hot.md"), "utf8"));
  assert.equal(
    normalizeYamlDate(hot.data.created),
    today,
    "hot.md created date must be scaffold day",
  );
  assert.equal(
    normalizeYamlDate(hot.data.updated),
    today,
    "hot.md updated date must be scaffold day",
  );

  // Body content too — `grep -r '{{' wiki/` must come up empty across
  // the entire wiki tree (Phase 0).
  const grepRoot = path.join(vaultDir, "wiki");
  const stragglers = await findTokens(grepRoot);
  assert.deepEqual(
    stragglers,
    [],
    `unsubstituted tokens linger:\n${stragglers.join("\n")}`,
  );
  const templateStragglers = await findTokens(path.join(vaultDir, "_templates"));
  assert.deepEqual(
    templateStragglers,
    [],
    `unsubstituted template tokens linger:\n${templateStragglers.join("\n")}`,
  );

  const missingFrontmatter = await findMissingRequiredFrontmatter(grepRoot);
  assert.deepEqual(
    missingFrontmatter,
    [],
    `required frontmatter missing:\n${missingFrontmatter.join("\n")}`,
  );

  const codex = await fsp.readFile(path.join(vaultDir, "CODEX.md"), "utf8");
  assert.equal(
    codex.includes("## Auxiliary File Lifecycle"),
    true,
    "CODEX.md must document vault-root auxiliary file lifecycle policy",
  );

  // Scaffold-stage linter clean on day one (Phase 0.5). The scaffold
  // normalizes seed unknowns to explicit pending-language so ready-mode
  // lint can reserve TODO/TBD/FILL IN for real production failures.
  const report = await lintVault(slug, { stage: "scaffold" });
  assert.equal(report.score, 100, "fresh scaffold should score 100/100");
  // Dead wikilinks are an acceptable warning for the vendored template
  // (some templated wikilinks reference notes that don't exist until a
  // specialist fills them). The CRITICAL gates are: no errors, no
  // unresolved placeholders, manifest at canonical path.
  const errors = report.findings.filter((f) => f.severity === "error");
  assert.deepEqual(
    errors.map((e) => `${e.rule} ${e.file}`),
    [],
    `vault has lint errors on first run:\n${errors
      .map((e) => `  ${e.rule} ${e.file}: ${e.message}`)
      .join("\n")}`,
  );
  const placeholderFindings = report.findings.filter((f) =>
    f.rule.startsWith("unresolved-placeholder"),
  );
  assert.equal(placeholderFindings.length, 0);

  const readyReport = await lintVault(slug, { stage: "ready" });
  assert.equal(
    readyReport.findings.some((f) => f.rule === "pending-placeholder-text"),
    false,
    "fresh scaffold must not contain banned placeholder prose",
  );
  const pendingWords = await findPendingWords(grepRoot);
  assert.deepEqual(
    pendingWords,
    [],
    `banned placeholder prose lingered:\n${pendingWords.join("\n")}`,
  );
});

/** Recursively walk a tree and return relative paths of files that
 *  contain `{{...}}` literal placeholders. */
async function findTokens(root: string): Promise<string[]> {
  const hits: string[] = [];
  await walk(root, "", hits);
  return hits;
}

async function walk(root: string, prefix: string, out: string[]): Promise<void> {
  const abs = path.join(root, prefix);
  const entries = await fsp.readdir(abs, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "_attachments") continue;
    const rel = path.posix.join(prefix.split(path.sep).join("/"), entry.name);
    if (entry.isDirectory()) {
      await walk(root, path.join(prefix, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      const body = await fsp.readFile(path.join(abs, entry.name), "utf8");
      if (/\{\{[a-zA-Z0-9_.-]+\}\}/.test(body)) {
        out.push(rel);
      }
    }
  }
}

async function findPendingWords(root: string): Promise<string[]> {
  const hits: string[] = [];
  await walkPending(root, "", hits);
  return hits;
}

async function walkPending(
  root: string,
  prefix: string,
  out: string[],
): Promise<void> {
  const abs = path.join(root, prefix);
  const entries = await fsp.readdir(abs, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "_attachments") continue;
    const rel = path.posix.join(prefix.split(path.sep).join("/"), entry.name);
    if (entry.isDirectory()) {
      await walkPending(root, path.join(prefix, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      const body = await fsp.readFile(path.join(abs, entry.name), "utf8");
      if (/\b(TODO|TBD|FILL\s+IN|Lorem ipsum)\b/i.test(body)) {
        out.push(rel);
      }
    }
  }
}

async function findMissingRequiredFrontmatter(root: string): Promise<string[]> {
  const hits: string[] = [];
  await walkFrontmatter(root, "", hits);
  return hits;
}

function normalizeYamlDate(value: unknown): unknown {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

async function walkFrontmatter(
  root: string,
  prefix: string,
  out: string[],
): Promise<void> {
  const abs = path.join(root, prefix);
  const entries = await fsp.readdir(abs, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "_attachments") continue;
    const rel = path.posix.join(prefix.split(path.sep).join("/"), entry.name);
    if (entry.isDirectory()) {
      await walkFrontmatter(root, path.join(prefix, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      const parsed = matter(await fsp.readFile(path.join(abs, entry.name), "utf8"));
      const data = parsed.data as Record<string, unknown>;
      const required = [
        "brain_schema",
        "owner",
        "confidence",
        "approval_status",
        "risk_level",
      ];
      for (const key of required) {
        if (!(key in data)) out.push(`${rel}: ${key}`);
      }
      if (!("rollback_note" in data) && !("rollback" in data)) {
        out.push(`${rel}: rollback_note|rollback`);
      }
    }
  }
}
