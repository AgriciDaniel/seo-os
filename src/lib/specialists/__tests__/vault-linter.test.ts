/**
 * Tests for src/lib/specialists/vault-linter.ts.
 *
 * Covers the two cardinal cases:
 *  - A clean fixture vault returns zero error/warn findings.
 *  - A corrupt fixture surfaces every rule we care about:
 *    required-files (missing CODEX), unresolved-placeholder-body,
 *    unresolved-placeholder-filename, dead-wikilink, frontmatter-valid,
 *    manifest-location, banned-pattern.
 *
 * Each test clones a named R21 fixture vault into a tmpdir before mutating
 * it, so the source fixture and `.seo-office/` are never touched.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { cloneFixtureToTmp } from "../../../../tests/helpers/makeFixture.ts";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "vault-linter-test-"));
  originalEnv = process.env.SEO_OFFICE_DATA_DIR;
  process.env.SEO_OFFICE_DATA_DIR = tmpRoot;
});

after(async () => {
  if (originalEnv !== undefined) {
    process.env.SEO_OFFICE_DATA_DIR = originalEnv;
  } else {
    delete process.env.SEO_OFFICE_DATA_DIR;
  }
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */
/* tests                                                                      */
/* -------------------------------------------------------------------------- */

test("lintVault returns clean for the clean-scaffolded fixture", async () => {
  const { lintVault } = await import("../vault-linter.ts");
  const slug = "clean-vault";
  cloneFixtureToTmp("clean-scaffolded", { tmpRoot, slug });

  const report = await lintVault(slug);
  assert.equal(
    report.clean,
    true,
    `expected clean report, got: ${JSON.stringify(report.findings, null, 2)}`,
  );
  assert.equal(report.counts.error, 0);
  assert.equal(report.counts.warn, 0);
  assert.equal(report.score, 100);
});

test("lintVault surfaces every rule from a mutated clean-scaffolded fixture", async () => {
  const { lintVault } = await import("../vault-linter.ts");
  const slug = "corrupt-vault";
  const vault = cloneFixtureToTmp("clean-scaffolded", { tmpRoot, slug });

  // 1. required-files: remove CODEX.md.
  await fsp.rm(path.join(vault, "CODEX.md"));

  // 2. unresolved-placeholder-body: inject `{{niche}}` into hot.md.
  const hotPath = path.join(vault, "wiki", "hot.md");
  const hot = await fsp.readFile(hotPath, "utf8");
  await fsp.writeFile(
    hotPath,
    hot.replace(
      "Clean scaffolded fixture status.",
      "This vault has a literal {{niche}} placeholder.",
    ),
    "utf8",
  );

  // 3. unresolved-placeholder-filename: write a wiki note whose path has `{{c}}`.
  await fsp.mkdir(path.join(vault, "wiki", "entities"), { recursive: true });
  await fsp.writeFile(
    path.join(vault, "wiki", "entities", "{{client_name}}.md"),
    validNote("entity", "Entity"),
    "utf8",
  );

  // 4. dead-wikilink: link to a note that doesn't exist.
  const indexPath = path.join(vault, "wiki", "index.md");
  const index = await fsp.readFile(indexPath, "utf8");
  await fsp.writeFile(
    indexPath,
    `${index}\n\nSee [[A Note That Does Not Exist]]. Avoid claude-code-skill-developm-ent-ai.\n`,
    "utf8",
  );

  // 5. frontmatter-valid: bad `type` value.
  await fsp.writeFile(
    path.join(vault, "wiki", "overview.md"),
    (await fsp.readFile(path.join(vault, "wiki", "overview.md"), "utf8")).replace(
      "type: overview",
      "type: not-a-real-type",
    ),
    "utf8",
  );

  // 6. manifest-location: drop a legacy <vault>/.manifest.json next to the canonical one.
  await fsp.writeFile(
    path.join(vault, ".manifest.json"),
    "{}",
    "utf8",
  );

  const report = await lintVault(slug);
  const rules = new Set(report.findings.map((f) => f.rule));

  assert.equal(rules.has("required-files"), true, "expected required-files");
  assert.equal(
    rules.has("unresolved-placeholder-body"),
    true,
    "expected unresolved-placeholder-body",
  );
  assert.equal(
    rules.has("unresolved-placeholder-filename"),
    true,
    "expected unresolved-placeholder-filename",
  );
  assert.equal(rules.has("dead-wikilink"), true, "expected dead-wikilink");
  assert.equal(rules.has("frontmatter-valid"), true, "expected frontmatter-valid");
  assert.equal(rules.has("manifest-location"), true, "expected manifest-location");
  assert.equal(rules.has("banned-pattern"), true, "expected banned-pattern");
  assert.equal(report.clean, false);
  assert.ok(report.score < 100);
});

test("lintVault treats seeded TODO/TBD text in a clean-scaffolded clone as scaffold debt but readiness failure", async () => {
  const { lintVault } = await import("../vault-linter.ts");
  const slug = "pending-text-vault";
  const vault = cloneFixtureToTmp("clean-scaffolded", { tmpRoot, slug });
  const hotPath = path.join(vault, "wiki", "hot.md");
  const hot = await fsp.readFile(hotPath, "utf8");
  await fsp.writeFile(
    hotPath,
    hot.replace("Clean scaffolded fixture status.", "TBD pending first audit."),
    "utf8",
  );

  const scaffold = await lintVault(slug, { stage: "scaffold" });
  assert.equal(
    scaffold.findings.some(
      (f) => f.rule === "pending-placeholder-text" && f.severity === "info",
    ),
    true,
  );
  assert.equal(scaffold.counts.error, 0);

  const ready = await lintVault(slug, { stage: "ready" });
  assert.equal(
    ready.findings.some(
      (f) => f.rule === "pending-placeholder-text" && f.severity === "error",
    ),
    true,
  );
});

function validNote(type: string, title: string): string {
  return `---
brain_schema: marketing-brain.v1
type: ${type}
title: "${title}"
created: 2026-05-18
updated: 2026-05-18
tags: []
status: active
owner: tester
confidence: high
approval_status: approved
rollback_note: "Restore this mutated fixture from the source fixture."
risk_level: low
---

# ${title}

Body content for ${title}.
`;
}
