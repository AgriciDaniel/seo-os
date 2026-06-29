/**
 * Read-before-write dedup gate — Phase 3.3.
 *
 * Pre-Phase-3 every specialist run wrote a fresh `wiki/<dir>/<date>-<type>.md`
 * file. Re-running the same specialist on the same day overwrote the
 * previous artifact (idempotent on path); re-running across days
 * produced duplicate audits with no pointer between them. That broke
 * the best-practices kernel's "delete more than you add" cut.
 *
 * `findRecentArtifact()` queries the SQLite mirror for a recent
 * artifact matching (specialist `type`, vault sub-dir, freshness
 * window). Specialists can use it to decide whether to:
 *   (a) return the existing artifact as the result of the current run
 *   (b) write a new note that supersedes the old one (and stamp the
 *       link in frontmatter so the linter can detect chains)
 *   (c) refresh in place (overwrite the existing file)
 *
 * The choice is per-specialist. The helper is just the SQLite query.
 */
import "server-only";
import { getDb } from "@/lib/brain/index-db";
import type { NoteRow } from "@/lib/brain/index-db";

export interface DedupQuery {
  /** Vault subdir under `wiki/`, e.g. "audits" or "deliverables". */
  dir: "audits" | "deliverables" | "keywords";
  /** Specialist artifact slug — matches the file naming convention
   *  `YYYY-MM-DD-<type>.md`. */
  type: string;
  /** How recent to consider "recent" (days). Default 7. */
  withinDays?: number;
}

/**
 * Returns the most recent artifact that matches the query, or null if
 * nothing inside the freshness window. Match strategy:
 *   - same `wiki/<dir>/` prefix
 *   - filename ends with `-<type>.md`
 *   - `updated` within the freshness window
 *
 * Reads SQLite (cheap); never touches disk.
 */
export function findRecentArtifact(
  clientSlug: string,
  query: DedupQuery,
): NoteRow | null {
  const days = query.withinDays ?? 7;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const pathPrefix = `wiki/${query.dir}/`;
  const pathSuffix = `-${query.type}.md`;

  const row = getDb()
    .prepare(
      `SELECT *
       FROM notes
       WHERE client_slug = ?
         AND path LIKE ? || '%' || ?
         AND updated >= ?
       ORDER BY updated DESC
       LIMIT 1`,
    )
    .get(clientSlug, pathPrefix, pathSuffix, cutoffStr) as
    | (NoteRow & { tags: string })
    | undefined;

  if (!row) return null;
  return { ...row, tags: JSON.parse(row.tags) as string[] };
}

/**
 * Render a one-line "supersedes" stamp callers can paste into a
 * frontmatter `supersedes` field when they're knowingly creating a
 * newer artifact alongside an older one. The linter can then walk the
 * chain.
 */
export function supersedesStamp(previous: NoteRow): string {
  return `${previous.path}@${previous.updated}`;
}
