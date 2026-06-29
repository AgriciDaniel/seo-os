/**
 * SQLite index over the on-disk vault.
 *
 * The vault on disk is the source of truth. This index is a derived,
 * cheap-to-rebuild query surface that powers the dashboard ("3 clients,
 * 2 audits overdue, 5 low-confidence claims to review").
 *
 * Rebuilds are idempotent and fast: walk every client vault, parse
 * frontmatter, upsert into the `notes` table.
 */
import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import Database, { type Database as Db } from "better-sqlite3";
import matter from "gray-matter";
import {
  dataRoot,
  ensureManifestMigrated,
  indexDbPath,
  manifestPath,
  vaultsRoot,
} from "./paths";
import { Frontmatter, ClientManifest } from "./types";
import { migrateFrontmatter } from "./migrations";
// Cycle note: recovery.ts imports getDb() back. ESM resolves this lazily —
// `runJobRecovery` is only referenced inside the function body below, not at
// top level, so by the time it actually runs both modules are fully loaded.
import { runJobRecovery } from "@/lib/orchestrator/recovery";
import { archiveAllLogsIfLarge } from "./log-archive";

let cached: Db | null = null;

/** Lazy singleton — opens (and migrates) the DB on first access.
 *
 * Also runs the orchestration-v2 recovery hook the first time this process
 * touches the DB: any job left in `status='running'` from a previous
 * process gets transitioned to `failed` with `orphaned by restart`. This
 * keeps the assignment inbox honest after `pnpm dev` reloads.
 */
export function getDb(): Db {
  if (cached) return cached;
  fs.mkdirSync(dataRoot(), { recursive: true });
  const db = new Database(indexDbPath());
  // R4 multi-tenant/concurrency requirement: WAL lets one writer proceed
  // while UI/API readers keep serving client-scoped data from the index.
  db.pragma("journal_mode = WAL");
  // Default is 1000 frames; setting it explicitly prevents `*.db-wal`
  // from ballooning across long-running dev sessions. SQLite still does
  // an automatic checkpoint on close, but in dev we rarely close
  // gracefully — explicit autocheckpoint keeps the WAL bounded.
  db.pragma("wal_autocheckpoint = 1000");
  db.pragma("foreign_keys = ON");
  migrate(db);
  cached = db;
  // Sweep orphaned `running` jobs from the previous process. Errors here
  // are non-fatal: a fresh DB has zero rows, and we'd rather start than
  // crash on a half-corrupt index.
  try {
    runJobRecovery();
  } catch {
    /* recovery hook unavailable; non-fatal */
  }
  // Phase-2: archive oversized log.md files once per process boot.
  // Fire-and-forget; we don't await — a slow archive shouldn't dam every
  // subsequent SQLite open. The archive helper holds its own per-client
  // mutex so a concurrent appendLogEntry can't race the rewrite.
  void archiveAllLogsIfLarge().catch(() => undefined);
  return db;
}

/** Close the singleton — useful for tests. */
export function closeDb(): void {
  if (cached) {
    cached.close();
    cached = null;
  }
}

/* -------------------------------------------------------------------------- */
/* schema                                                                      */
/* -------------------------------------------------------------------------- */

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      slug             TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      site_url         TEXT NOT NULL,
      business_type    TEXT,
      owner            TEXT NOT NULL,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notes (
      client_slug      TEXT NOT NULL,
      path             TEXT NOT NULL,
      type             TEXT NOT NULL,
      title            TEXT NOT NULL,
      status           TEXT NOT NULL,
      confidence       TEXT,
      approval_status  TEXT,
      risk_level       TEXT,
      owner            TEXT,
      business_type    TEXT,
      created          TEXT NOT NULL,
      updated          TEXT NOT NULL,
      expires_on       TEXT,
      tags             TEXT NOT NULL DEFAULT '[]',
      indexed_at       TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (client_slug, path),
      FOREIGN KEY (client_slug) REFERENCES clients(slug) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_notes_type      ON notes(client_slug, type);
    CREATE INDEX IF NOT EXISTS idx_notes_status    ON notes(client_slug, status);
    CREATE INDEX IF NOT EXISTS idx_notes_updated   ON notes(client_slug, updated);

    CREATE TABLE IF NOT EXISTS jobs (
      id               TEXT PRIMARY KEY,
      client_slug      TEXT NOT NULL,
      specialist       TEXT NOT NULL,
      status           TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
      progress         REAL NOT NULL DEFAULT 0,
      message          TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      started_at       TEXT,
      finished_at      TEXT,
      result_path      TEXT,
      FOREIGN KEY (client_slug) REFERENCES clients(slug) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_client     ON jobs(client_slug);
    CREATE INDEX IF NOT EXISTS idx_jobs_status     ON jobs(status);
  `);

  addColumnIfMissing(db, "notes", "expires_on", "TEXT");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notes_expires_on
      ON notes(client_slug, expires_on);
  `);

  // jobs.request_id is added via ALTER below (additive migration) so
  // existing rows survive the upgrade with NULL request_ids — that's fine,
  // the UNIQUE index only enforces uniqueness for non-NULL values in SQLite.
  addColumnIfMissing(db, "jobs", "request_id", "TEXT");
  // Phase 3.2: structured failure envelope captured when a specialist
  // throws. Stored as TEXT (JSON) so the Specialist Inbox can render the
  // error class, message, stack head, and any partial writes without
  // re-parsing freeform strings. NULL for jobs that succeeded.
  addColumnIfMissing(db, "jobs", "failure_envelope", "TEXT");
  // R5: normalized specialist execution envelope. Stored as JSON so
  // orchestrator/UI code can read status, confidence, sources, cost,
  // duration, and side effects without re-scanning the vault.
  addColumnIfMissing(db, "jobs", "result_envelope", "TEXT");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_request_id
      ON jobs(client_slug, request_id) WHERE request_id IS NOT NULL;

    -- Orchestration v2: the typed Assignment envelope. One row per
    -- Orchestrator → Specialist dispatch. The job_id link is set lazily
    -- (an Assignment can be "proposed" or "blocked" without a job yet) and
    -- nulls out cleanly on job deletion via ON DELETE SET NULL.
    CREATE TABLE IF NOT EXISTS assignments (
      id                TEXT PRIMARY KEY,
      client_slug       TEXT NOT NULL,
      specialist_id     TEXT NOT NULL,
      parent_message_id TEXT,
      title             TEXT NOT NULL,
      brief             TEXT NOT NULL,
      payload_json      TEXT NOT NULL DEFAULT '{}',
      permission_mode   TEXT NOT NULL CHECK (permission_mode IN ('plan','read_only','auto','full_access')),
      status            TEXT NOT NULL CHECK (status IN ('proposed','queued','running','blocked','succeeded','failed','cancelled')),
      request_id        TEXT NOT NULL,
      job_id            TEXT,
      message           TEXT,
      started_at        TEXT,
      completed_at      TEXT,
      failed_at         TEXT,
      skip_reason       TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_slug) REFERENCES clients(slug) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
    );

    -- Idempotency: same (client, request_id) returns the same row.
    CREATE UNIQUE INDEX IF NOT EXISTS uq_assignments_request_id
      ON assignments(client_slug, request_id);

    CREATE INDEX IF NOT EXISTS idx_assignments_specialist
      ON assignments(client_slug, specialist_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_assignments_status
      ON assignments(client_slug, status);

    CREATE TABLE IF NOT EXISTS sweep_locks (
      client_slug TEXT NOT NULL,
      sweep_type  TEXT NOT NULL,
      token       TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      acquired_at INTEGER NOT NULL,
      holder_pid  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL,
      PRIMARY KEY (client_slug, sweep_type),
      FOREIGN KEY (client_slug) REFERENCES clients(slug) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sweep_locks_expires
      ON sweep_locks(expires_at);
  `);
  addColumnIfMissing(db, "assignments", "started_at", "TEXT");
  addColumnIfMissing(db, "assignments", "completed_at", "TEXT");
  addColumnIfMissing(db, "assignments", "failed_at", "TEXT");
  addColumnIfMissing(db, "assignments", "skip_reason", "TEXT");
  addColumnIfMissing(db, "sweep_locks", "acquired_at", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "sweep_locks", "holder_pid", "INTEGER NOT NULL DEFAULT 0");
}

/** Add a column to a table only if it doesn't already exist. SQLite has no
 *  IF NOT EXISTS clause for ALTER TABLE — we have to introspect first. */
function addColumnIfMissing(db: Db, table: string, column: string, defn: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${defn}`);
}

/* -------------------------------------------------------------------------- */
/* clients                                                                     */
/* -------------------------------------------------------------------------- */

export interface ClientRow {
  slug: string;
  name: string;
  site_url: string;
  business_type: string | null;
  owner: string;
  created_at: string;
  updated_at: string;
}

export function listClients(): ClientRow[] {
  return getDb()
    .prepare(
      "SELECT slug, name, site_url, business_type, owner, created_at, updated_at FROM clients ORDER BY updated_at DESC",
    )
    .all() as ClientRow[];
}

export function getClient(slug: string): ClientRow | undefined {
  return getDb()
    .prepare(
      "SELECT slug, name, site_url, business_type, owner, created_at, updated_at FROM clients WHERE slug = ?",
    )
    .get(slug) as ClientRow | undefined;
}

export interface SweepLockRow {
  client_slug: string;
  sweep_type: string;
  token: string;
  created_at: number;
  acquired_at: number;
  holder_pid: number;
  expires_at: number;
}

export function acquireSweepLock(
  clientSlug: string,
  sweepType: string,
  token: string,
  ttlMs = 1000 * 60 * 60 * 6,
): { acquired: true; lock: SweepLockRow } | { acquired: false; lock: SweepLockRow } {
  const now = Date.now();
  const db = getDb();
  db.prepare("DELETE FROM sweep_locks WHERE expires_at < ?").run(now);
  try {
    db.prepare(
      `INSERT INTO sweep_locks (client_slug, sweep_type, token, created_at, acquired_at, holder_pid, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(clientSlug, sweepType, token, now, now, process.pid, now + ttlMs);
  } catch {
    const lock = db
      .prepare(
        `SELECT client_slug, sweep_type, token, created_at, acquired_at, holder_pid, expires_at
         FROM sweep_locks WHERE client_slug = ? AND sweep_type = ?`,
      )
      .get(clientSlug, sweepType) as SweepLockRow | undefined;
    if (lock) return { acquired: false, lock };
    throw new Error(`sweep lock conflict for ${clientSlug}:${sweepType}`);
  }
  const lock = db
    .prepare(
      `SELECT client_slug, sweep_type, token, created_at, acquired_at, holder_pid, expires_at
       FROM sweep_locks WHERE client_slug = ? AND sweep_type = ?`,
    )
    .get(clientSlug, sweepType) as SweepLockRow;
  return { acquired: true, lock };
}

export function releaseSweepLock(
  clientSlug: string,
  sweepType: string,
  token?: string,
): void {
  const db = getDb();
  if (token) {
    db.prepare(
      "DELETE FROM sweep_locks WHERE client_slug = ? AND sweep_type = ? AND token = ?",
    ).run(clientSlug, sweepType, token);
    return;
  }
  db.prepare("DELETE FROM sweep_locks WHERE client_slug = ? AND sweep_type = ?").run(
    clientSlug,
    sweepType,
  );
}

export function getSweepLock(
  clientSlug: string,
  sweepType: string,
): SweepLockRow | null {
  const now = Date.now();
  const db = getDb();
  db.prepare("DELETE FROM sweep_locks WHERE expires_at < ?").run(now);
  return (
    (db
      .prepare(
        `SELECT client_slug, sweep_type, token, created_at, acquired_at, holder_pid, expires_at
         FROM sweep_locks WHERE client_slug = ? AND sweep_type = ?`,
      )
      .get(clientSlug, sweepType) as SweepLockRow | undefined) ?? null
  );
}

export function upsertClient(input: {
  slug: string;
  name: string;
  site_url: string;
  business_type?: string | null;
  owner: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO clients (slug, name, site_url, business_type, owner, updated_at)
       VALUES (@slug, @name, @site_url, @business_type, @owner, datetime('now'))
       ON CONFLICT(slug) DO UPDATE SET
         name = excluded.name,
         site_url = excluded.site_url,
         business_type = excluded.business_type,
         owner = excluded.owner,
         updated_at = datetime('now')`,
    )
    .run({
      slug: input.slug,
      name: input.name,
      site_url: input.site_url,
      business_type: input.business_type ?? null,
      owner: input.owner,
    });
}

export function deleteClient(slug: string): void {
  getDb().prepare("DELETE FROM clients WHERE slug = ?").run(slug);
}

/* -------------------------------------------------------------------------- */
/* notes                                                                       */
/* -------------------------------------------------------------------------- */

export interface NoteRow {
  client_slug: string;
  path: string;
  type: string;
  title: string;
  status: string;
  confidence: string | null;
  approval_status: string | null;
  risk_level: string | null;
  owner: string | null;
  business_type: string | null;
  created: string;
  updated: string;
  expires_on: string | null;
  tags: string[];
}

export function listNotesByType(slug: string, type: string): NoteRow[] {
  const rows = getDb()
    .prepare("SELECT * FROM notes WHERE client_slug = ? AND type = ? ORDER BY updated DESC")
    .all(slug, type) as Array<NoteRow & { tags: string }>;
  return rows.map((r) => ({ ...r, tags: JSON.parse(r.tags) as string[] }));
}

export function listLowConfidenceNotes(slug: string): NoteRow[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM notes WHERE client_slug = ? AND confidence IN ('seed','low') ORDER BY updated DESC",
    )
    .all(slug) as Array<NoteRow & { tags: string }>;
  return rows.map((r) => ({ ...r, tags: JSON.parse(r.tags) as string[] }));
}

function upsertNoteRow(row: Omit<NoteRow, "tags"> & { tags: string }): void {
  getDb()
    .prepare(
      `INSERT INTO notes (client_slug, path, type, title, status, confidence, approval_status, risk_level, owner, business_type, created, updated, expires_on, tags, indexed_at)
       VALUES (@client_slug, @path, @type, @title, @status, @confidence, @approval_status, @risk_level, @owner, @business_type, @created, @updated, @expires_on, @tags, datetime('now'))
       ON CONFLICT(client_slug, path) DO UPDATE SET
         type = excluded.type,
         title = excluded.title,
         status = excluded.status,
         confidence = excluded.confidence,
         approval_status = excluded.approval_status,
         risk_level = excluded.risk_level,
         owner = excluded.owner,
         business_type = excluded.business_type,
         created = excluded.created,
         updated = excluded.updated,
         expires_on = excluded.expires_on,
         tags = excluded.tags,
         indexed_at = datetime('now')`,
    )
    .run(row);
}

/* -------------------------------------------------------------------------- */
/* rebuild                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Walk every client vault on disk and re-index. Cheap (<1s for typical vaults)
 * because we only parse frontmatter.
 */
export async function reindexAll(): Promise<{ clients: number; notes: number }> {
  if (!fs.existsSync(vaultsRoot())) {
    return { clients: 0, notes: 0 };
  }
  const slugs = (await fsp.readdir(vaultsRoot(), { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);
  let totalNotes = 0;
  for (const slug of slugs) {
    totalNotes += await reindexClient(slug);
  }
  return { clients: slugs.length, notes: totalNotes };
}

/** Re-index a single client's vault. Also refreshes the client row from manifest. */
export async function reindexClient(slug: string): Promise<number> {
  // Migrate legacy `<vault>/.manifest.json` → `<vault>/.raw/.manifest.json`
  // on the first reindex post-deploy. Idempotent; no-op once moved.
  ensureManifestMigrated(slug);
  const manifestFile = manifestPath(slug);
  if (!fs.existsSync(manifestFile)) return 0;
  const manifestRaw = await fsp.readFile(manifestFile, "utf8");
  let manifest: ClientManifest;
  try {
    manifest = ClientManifest.parse(JSON.parse(manifestRaw));
  } catch {
    return 0;
  }
  upsertClient({
    slug,
    name: manifest.vault.replace(/ marketing-brain$/, ""),
    site_url: manifest.site_under_audit,
    business_type: manifest.business_type ?? null,
    owner: manifest.manifest_owner,
  });

  const wikiRoot = path.join(vaultsRoot(), slug, "wiki");
  if (!fs.existsSync(wikiRoot)) return 0;

  // wipe existing rows for this client (idempotent rebuild)
  getDb().prepare("DELETE FROM notes WHERE client_slug = ?").run(slug);

  const count = { n: 0 };
  await indexDir(wikiRoot, wikiRoot, slug, count);
  return count.n;
}

/**
 * Re-index a single note row from disk. Phase-1 addition: lets
 * `writeArtifact()` keep the SQLite mirror in sync with disk without
 * paying for a full `reindexClient()` walk. Path is vault-relative
 * (e.g. `wiki/audits/2026-05-13-technical.md`).
 *
 * Returns true on successful upsert, false when the file is missing or
 * its frontmatter doesn't validate (same drop-silently semantics as the
 * full reindex loop — we never crash on a bad note).
 */
export async function reindexNoteRow(
  clientSlug: string,
  relativePath: string,
): Promise<boolean> {
  const absolute = path.join(vaultsRoot(), clientSlug, relativePath);
  if (!fs.existsSync(absolute)) return false;
  try {
    const raw = await fsp.readFile(absolute, "utf8");
    const parsed = matter(raw);
    // Phase-4.1: migrate first so older-schema notes upgrade to the
    // current shape before Zod validation. No-op while v1 is head.
    const migrated = migrateFrontmatter(parsed.data as Record<string, unknown>);
    const fm = Frontmatter.safeParse(migrated);
    if (!fm.success) return false;
    upsertNoteRow({
      client_slug: clientSlug,
      path: relativePath,
      type: fm.data.type,
      title: fm.data.title,
      status: fm.data.status,
      confidence: fm.data.confidence ?? null,
      approval_status: fm.data.approval_status ?? null,
      risk_level: fm.data.risk_level ?? null,
      owner: fm.data.owner ?? null,
      business_type: fm.data.business_type ?? null,
      created: fm.data.created,
      updated: fm.data.updated,
      expires_on: fm.data.expires_on ?? null,
      tags: JSON.stringify(fm.data.tags),
    });
    return true;
  } catch {
    return false;
  }
}

async function indexDir(
  wikiRoot: string,
  dir: string,
  slug: string,
  count: { n: number },
): Promise<void> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "_attachments") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await indexDir(wikiRoot, abs, slug, count);
      continue;
    }
    if (!entry.name.endsWith(".md")) continue;
    try {
      const raw = await fsp.readFile(abs, "utf8");
      const parsed = matter(raw);
      // Phase-4.1: migrate first so older-schema notes upgrade to the
      // current shape before Zod validation.
      const migrated = migrateFrontmatter(
        parsed.data as Record<string, unknown>,
      );
      const fm = Frontmatter.safeParse(migrated);
      if (!fm.success) continue; // skip notes with invalid frontmatter
      const rel = path.relative(wikiRoot, abs);
      upsertNoteRow({
        client_slug: slug,
        path: `wiki/${rel}`,
        type: fm.data.type,
        title: fm.data.title,
        status: fm.data.status,
        confidence: fm.data.confidence ?? null,
        approval_status: fm.data.approval_status ?? null,
        risk_level: fm.data.risk_level ?? null,
        owner: fm.data.owner ?? null,
        business_type: fm.data.business_type ?? null,
        created: fm.data.created,
        updated: fm.data.updated,
        expires_on: fm.data.expires_on ?? null,
        tags: JSON.stringify(fm.data.tags),
      });
      count.n++;
    } catch {
      // skip unreadable / malformed files
    }
  }
}
