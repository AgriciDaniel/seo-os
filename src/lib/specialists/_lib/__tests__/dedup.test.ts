/**
 * Tests for `findRecentArtifact` (Phase 3.3).
 *
 * Seeds the SQLite index with synthetic note rows at various ages, then
 * asserts the dedup helper returns the most-recent match within the
 * freshness window — and nothing when the window is empty.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpRoot: string;
let originalEnv: string | undefined;

// Each test uses a unique slug to avoid cross-test state. We don't delete
// the index.db between tests because the better-sqlite3 singleton would
// then point at a deleted inode and silently lose writes on Linux.
before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "dedup-"));
  originalEnv = process.env.SEO_OFFICE_DATA_DIR;
  process.env.SEO_OFFICE_DATA_DIR = tmpRoot;
});

after(async () => {
  // Close the SQLite singleton so the temp dir can be cleaned up cleanly.
  const { closeDb } = await import("@/lib/brain/index-db.ts");
  closeDb();
  if (originalEnv !== undefined) {
    process.env.SEO_OFFICE_DATA_DIR = originalEnv;
  } else {
    delete process.env.SEO_OFFICE_DATA_DIR;
  }
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

async function seedNote(
  slug: string,
  relativePath: string,
  daysAgo: number,
): Promise<void> {
  const { getDb } = await import("@/lib/brain/index-db.ts");
  const db = getDb();
  // INSERT OR IGNORE — replacing on the clients row would cascade-delete
  // every prior `notes` row for the same slug (ON DELETE CASCADE), so
  // subsequent seedNote calls would silently destroy earlier seeds.
  db.prepare(
    `INSERT OR IGNORE INTO clients (slug, name, site_url, owner)
     VALUES (?, ?, ?, ?)`,
  ).run(slug, slug, "https://example.com", "tester");
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  const iso = date.toISOString().slice(0, 10);
  db.prepare(
    `INSERT OR REPLACE INTO notes
     (client_slug, path, type, title, status, confidence, approval_status,
      risk_level, owner, business_type, created, updated, tags)
     VALUES (?, ?, 'audit', 'test', 'active', 'medium', 'needs-review',
             'low', 'tester', NULL, ?, ?, '[]')`,
  ).run(slug, relativePath, iso, iso);
}

test("findRecentArtifact returns the most recent match within window", async () => {
  const { findRecentArtifact } = await import("../dedup.ts");
  const { getDb } = await import("@/lib/brain/index-db.ts");
  const slug = `acme-${Math.random().toString(36).slice(2, 10)}`;
  await seedNote(slug, "wiki/audits/recent-technical.md", 3);
  await seedNote(slug, "wiki/audits/old-technical.md", 30);

  // Sanity check: rows actually landed in SQLite (this catches the
  // singleton-points-at-deleted-inode failure mode before we point
  // fingers at the LIKE clause).
  const seen = getDb()
    .prepare("SELECT path, updated FROM notes WHERE client_slug = ?")
    .all(slug);
  assert.equal(seen.length, 2, `seeding failed; rows: ${JSON.stringify(seen)}`);

  const hit = findRecentArtifact(slug, {
    dir: "audits",
    type: "technical",
    withinDays: 7,
  });
  assert.ok(hit, `expected a match; seeded rows: ${JSON.stringify(seen)}`);
  assert.equal(hit?.path, "wiki/audits/recent-technical.md");
});

test("findRecentArtifact returns null when nothing inside the window", async () => {
  const { findRecentArtifact } = await import("../dedup.ts");
  const slug = `acme-${Math.random().toString(36).slice(2, 10)}`;
  await seedNote(slug, "wiki/audits/2026-04-01-technical.md", 60);
  const hit = findRecentArtifact(slug, {
    dir: "audits",
    type: "technical",
    withinDays: 7,
  });
  assert.equal(hit, null);
});

test("findRecentArtifact ignores artifacts of a different type", async () => {
  const { findRecentArtifact } = await import("../dedup.ts");
  const slug = `acme-${Math.random().toString(36).slice(2, 10)}`;
  await seedNote(slug, "wiki/audits/2026-05-13-content.md", 1);
  const hit = findRecentArtifact(slug, {
    dir: "audits",
    type: "technical",
    withinDays: 7,
  });
  assert.equal(hit, null);
});
