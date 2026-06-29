/**
 * Tests for log archival (Phase 2.4).
 *
 * The archive helper splits log.md when it exceeds size or age
 * thresholds. We seed a synthetic large log with 18 monthly entries,
 * run `archiveLogIfLarge` with a small size limit, and assert:
 *  - the oldest 50% lands in `wiki/log-archive/YYYY-MM.md` files
 *    (one per month) with valid frontmatter
 *  - the source `log.md` shrinks and retains the most-recent entries
 *  - `archive_disabled: true` opts out
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpRoot: string;
let originalEnv: string | undefined;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "log-archive-"));
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

beforeEach(async () => {
  const vaults = path.join(tmpRoot, "vaults");
  if (fs.existsSync(vaults)) await fsp.rm(vaults, { recursive: true });
  await fsp.mkdir(vaults, { recursive: true });
});

function buildLogWithMonths(n: number): string {
  const entries: string[] = [];
  // Newest first, walking back month by month
  for (let i = 0; i < n; i++) {
    const monthOffset = i;
    const month = String(((12 - (monthOffset % 12)) || 12)).padStart(2, "0");
    const year = 2026 - Math.floor((monthOffset + 11) / 12);
    entries.push(`## ${year}-${month}-15 — entry ${i}\n\nbody for entry ${i}.`);
  }
  const body = entries.join("\n\n");
  return `---
brain_schema: marketing-brain.v1
type: meta
title: Log
created: 2024-01-01
updated: 2026-05-13
tags: [log, marketing-brain]
status: active
---

# Log

**Convention**: append-only. **Newest entries at the TOP.** Never edit or delete past entries.

---

${body}
`;
}

test("archiveLogIfLarge splits oldest 50% into monthly archive files", async () => {
  const { archiveLogIfLarge } = await import("../log-archive.ts");
  const slug = "growing-log";
  const vault = path.join(tmpRoot, "vaults", slug);
  await fsp.mkdir(path.join(vault, "wiki"), { recursive: true });
  await fsp.writeFile(
    path.join(vault, "wiki", "log.md"),
    buildLogWithMonths(18),
    "utf8",
  );

  // Force the size threshold low so the test fires deterministically.
  const result = await archiveLogIfLarge(slug, { sizeLimitBytes: 100 });
  assert.equal(result.archived, true, `expected archived=true; ${result.reason}`);
  assert.equal(result.entriesArchived + result.entriesKept, 18);
  assert.ok(result.entriesArchived > 0);
  assert.ok(result.archiveFiles.length > 0);

  // Each archive file lives at wiki/log-archive/YYYY-MM.md and has valid
  // frontmatter (`type: meta`, `status: archived`).
  for (const rel of result.archiveFiles) {
    const archiveContent = await fsp.readFile(
      path.join(vault, rel),
      "utf8",
    );
    assert.equal(archiveContent.startsWith("---\n"), true);
    assert.equal(archiveContent.includes("status: archived"), true);
    assert.equal(archiveContent.includes("type: meta"), true);
  }

  // log.md shrunk and retains the most-recent half.
  const remaining = await fsp.readFile(
    path.join(vault, "wiki", "log.md"),
    "utf8",
  );
  assert.equal(remaining.includes("entry 0"), true, "most-recent must remain");
  // Some old entries should be gone from log.md.
  assert.equal(
    remaining.includes("entry 17"),
    false,
    "oldest entry must have moved to archive",
  );
});

test("archiveLogIfLarge respects archive_disabled frontmatter flag", async () => {
  const { archiveLogIfLarge } = await import("../log-archive.ts");
  const slug = "opted-out";
  const vault = path.join(tmpRoot, "vaults", slug);
  await fsp.mkdir(path.join(vault, "wiki"), { recursive: true });
  const body = buildLogWithMonths(18).replace(
    "created: 2024-01-01",
    "created: 2024-01-01\narchive_disabled: true",
  );
  await fsp.writeFile(path.join(vault, "wiki", "log.md"), body, "utf8");

  const result = await archiveLogIfLarge(slug, { sizeLimitBytes: 100 });
  assert.equal(result.archived, false);
  assert.equal(result.reason, "archive_disabled: true");
});

test("archiveLogIfLarge is idle when under thresholds", async () => {
  const { archiveLogIfLarge } = await import("../log-archive.ts");
  const slug = "small-log";
  const vault = path.join(tmpRoot, "vaults", slug);
  await fsp.mkdir(path.join(vault, "wiki"), { recursive: true });
  await fsp.writeFile(
    path.join(vault, "wiki", "log.md"),
    buildLogWithMonths(3),
    "utf8",
  );

  // Big size limit, no age trigger possible from a 3-month log.
  const result = await archiveLogIfLarge(slug, {
    sizeLimitBytes: 10 * 1024 * 1024,
    ageMaxMonths: 60,
  });
  assert.equal(result.archived, false);
});
