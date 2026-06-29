/**
 * Type-schema tests for src/lib/brain/types.ts.
 *
 * Covers the Phase 0 fidelity changes:
 *  - `"overview"` is a valid NoteType (was missing, causing `wiki/overview.md`
 *    to drop out of the SQLite index).
 *  - `ClientManifest` round-trips with and without the new optional
 *    `niche` / `site_brand` fields (backwards-compat with legacy manifests).
 *  - `ClientSlug` accepts the canonical 60-char max length.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

import {
  ArtifactSchema,
  BrainNoteSchema,
  ClientManifestSchema,
  ClientManifest,
  ClientSlug,
  Frontmatter,
  NoteType,
  SpecialistResultSchema,
  toClientSlug,
} from "../types.ts";

/* -------------------------------------------------------------------------- */
/* NoteType + Frontmatter                                                     */
/* -------------------------------------------------------------------------- */

test("NoteType includes overview", () => {
  // The literal string check is what indexDir() at index-db.ts does
  // before storing the row. Pre-Phase-0 this returned false.
  const parsed = NoteType.safeParse("overview");
  assert.equal(parsed.success, true);
});

test("Frontmatter parses every declared NoteType", () => {
  const base = {
    brain_schema: "marketing-brain.v1" as const,
    title: "test",
    created: "2026-05-13",
    updated: "2026-05-13",
    tags: [],
    status: "active" as const,
  };
  for (const t of NoteType.options) {
    const fm = Frontmatter.safeParse({ ...base, type: t });
    assert.equal(
      fm.success,
      true,
      `Frontmatter rejected NoteType "${t}": ${fm.success ? "" : fm.error.message}`,
    );
  }
});

test("Frontmatter normalises Date values into YYYY-MM-DD strings", () => {
  // YAML parses bare `2026-05-13` as a JS Date. The schema preprocesses to
  // string. Without this, 75/76 vendored notes would fail Zod parse.
  const parsed = Frontmatter.safeParse({
    brain_schema: "marketing-brain.v1",
    type: "meta",
    title: "test",
    created: new Date("2026-05-13T00:00:00Z"),
    updated: new Date("2026-05-13T00:00:00Z"),
    tags: [],
    status: "active",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.created, "2026-05-13");
    assert.equal(parsed.data.updated, "2026-05-13");
  }
});

test("R3 named brain schemas validate notes, artifacts, specialist results, and manifests", () => {
  const note = BrainNoteSchema.parse({
    path: "wiki/hot.md",
    frontmatter: {
      brain_schema: "marketing-brain.v1",
      type: "meta",
      title: "Hot",
      created: "2026-05-18",
      updated: "2026-05-18",
      tags: [],
      status: "active",
      owner: "tester",
      confidence: "high",
      approval_status: "approved",
      rollback_note: "Restore the fixture note.",
      risk_level: "low",
    },
    body: "# Hot\n",
  });
  assert.equal(note.frontmatter.owner, "tester");

  assert.equal(
    BrainNoteSchema.safeParse({
      ...note,
      frontmatter: { ...note.frontmatter, rollback_note: undefined },
    }).success,
    false,
    "BrainNoteSchema must reject notes missing rollback_note/rollback",
  );

  const artifact = ArtifactSchema.parse({
    artifact_path: "wiki/audits/2026-05-18-keywords.md",
    source_paths: ["wiki/sources/DataForSEO Keyword Exports.md"],
    data_sources: ["model_estimate"],
    confidence: "low",
    cost_usd: 0,
  });
  assert.deepEqual(artifact.data_sources, ["model_estimate"]);

  const result = SpecialistResultSchema.parse({
    summary: "Keyword research complete",
    resultPath: "wiki/audits/2026-05-18-keywords.md",
    degraded: true,
    degradationReason: "DataForSEO unavailable",
  });
  assert.equal(result.degraded, true);

  assert.equal(ClientManifestSchema.safeParse({
    schema_version: "1.0",
    vault: "Acme marketing-brain",
    site_under_audit: "https://acme.com",
    manifest_owner: "tester",
    last_updated: "2026-05-18",
    sources: {},
  }).success, true);
});

test("R3 vault I/O throws ZodError for malformed brain notes", async () => {
  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "r3-schema-"));
  const originalEnv = process.env.SEO_OFFICE_DATA_DIR;
  process.env.SEO_OFFICE_DATA_DIR = tmpRoot;
  try {
    const { readNote, writeNote } = await import("../vault-fs.ts");
    const malformed = `---
brain_schema: marketing-brain.v1
type: meta
title: "Bad"
created: 2026-05-18
updated: 2026-05-18
tags: []
status: active
owner: tester
confidence: high
approval_status: approved
risk_level: low
---

# Bad
`;
    await fsp.mkdir(path.join(tmpRoot, "vaults", "bad", "wiki"), {
      recursive: true,
    });
    await fsp.writeFile(
      path.join(tmpRoot, "vaults", "bad", "wiki", "bad.md"),
      malformed,
      "utf8",
    );

    await assert.rejects(
      () => readNote("bad", "wiki/bad.md"),
      (err: unknown) =>
        err instanceof z.ZodError &&
        err.issues.some((issue) => issue.path.join(".") === "frontmatter.rollback_note"),
    );

    await assert.rejects(
      () =>
        writeNote("bad", "wiki/also-bad.md", {
          frontmatter: {
            brain_schema: "marketing-brain.v1",
            type: "meta",
            title: "Also Bad",
            created: "2026-05-18",
            updated: "2026-05-18",
            tags: [],
            status: "active",
            owner: "tester",
            confidence: "high",
            approval_status: "approved",
            risk_level: "low",
          },
          body: "# Also Bad\n",
        }),
      (err: unknown) =>
        err instanceof z.ZodError &&
        err.issues.some((issue) => issue.path.join(".") === "frontmatter.rollback_note"),
    );
  } finally {
    if (originalEnv !== undefined) {
      process.env.SEO_OFFICE_DATA_DIR = originalEnv;
    } else {
      delete process.env.SEO_OFFICE_DATA_DIR;
    }
    await fsp.rm(tmpRoot, { recursive: true, force: true });
  }
});

/* -------------------------------------------------------------------------- */
/* ClientManifest                                                             */
/* -------------------------------------------------------------------------- */

test("ClientManifest round-trips without optional niche/site_brand", () => {
  const m = {
    schema_version: "1.0" as const,
    vault: "Acme marketing-brain",
    site_under_audit: "https://acme.com",
    manifest_owner: "daniel",
    last_updated: "2026-05-13",
    sources: {},
  };
  const parsed = ClientManifest.safeParse(m);
  assert.equal(parsed.success, true);
});

test("ClientManifest accepts and preserves niche + site_brand", () => {
  const parsed = ClientManifest.safeParse({
    schema_version: "1.0",
    vault: "Acme marketing-brain",
    site_under_audit: "https://acme.com",
    manifest_owner: "daniel",
    last_updated: "2026-05-13",
    sources: {},
    niche: "outdoor gear reviews",
    site_brand: "acme.com",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.niche, "outdoor gear reviews");
    assert.equal(parsed.data.site_brand, "acme.com");
  }
});

/* -------------------------------------------------------------------------- */
/* ClientSlug                                                                 */
/* -------------------------------------------------------------------------- */

test("ClientSlug accepts canonical 60-char slugs", () => {
  // 60 chars of `[a-z0-9]` plus dashes; matches canonical marketing-brain
  // which uses `[a-z0-9][a-z0-9-]{1,60}`. Pre-Phase-0 we capped at 40.
  const sixty = "a" + "b".repeat(59);
  const parsed = ClientSlug.safeParse(sixty);
  assert.equal(parsed.success, true);
});

test("ClientSlug rejects slugs longer than 60", () => {
  const sixtyOne = "a" + "b".repeat(60);
  const parsed = ClientSlug.safeParse(sixtyOne);
  assert.equal(parsed.success, false);
});

test("ClientSlug rejects leading/trailing dashes", () => {
  assert.equal(ClientSlug.safeParse("-acme").success, false);
  assert.equal(ClientSlug.safeParse("acme-").success, false);
});

test("toClientSlug derives kebab-case and truncates at 60", () => {
  assert.equal(toClientSlug("Acme Outdoors"), "acme-outdoors");
  // The ASCII apostrophe in `ACME's` is STRIPPED (it's in the regex's
  // first replace pass), so the slug collapses to `acmes-gear-apparel`
  // rather than splitting at the apostrophe.
  assert.equal(toClientSlug("ACME's   Gear & Apparel"), "acmes-gear-apparel");
  assert.equal(toClientSlug("a".repeat(80)).length, 60);
});
