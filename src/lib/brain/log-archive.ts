/**
 * `wiki/log.md` archival — Phase-2 growth control.
 *
 * Pre-Phase-2 the log was append-only and grew forever. A multi-year
 * vault could carry tens of MB of historical entries that nothing ever
 * compacted. This module ships a conservative, opt-out archiver that
 * runs once on DB boot.
 *
 * Trigger thresholds (any of):
 *   - file size > LOG_SIZE_LIMIT_BYTES (default 256 KB)
 *   - more than LOG_AGE_MAX_MONTHS months of entries on file (default 18)
 *
 * Archive behaviour:
 *   - the oldest 50% of entries (by their `## YYYY-MM-DD …` heading) are
 *     moved into `wiki/log-archive/YYYY-MM.md`, split on the month
 *     boundary of each entry.
 *   - the archive files carry valid frontmatter (`type: meta`,
 *     `status: archived`) so the linter and SQLite index pick them up.
 *   - the source `log.md` is rewritten with the most-recent half plus
 *     its existing intro/frontmatter.
 *   - if the file's frontmatter has `archive_disabled: true`, no-op.
 *
 * Safety: holds the per-client log mutex (the same one `audit-trail.ts`
 * uses) so concurrent appendLogEntry calls can't race the archive.
 * Atomic writes via `writeRaw`. On any failure we leave log.md alone.
 */
import "server-only";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { readRaw, writeRaw, fileExists } from "./vault-fs";
import { withFileMutex } from "./file-mutex";
import { vaultsRoot } from "./paths";

const LOG_RELATIVE = "wiki/log.md";
const ARCHIVE_DIR_RELATIVE = "wiki/log-archive";

// Defaults are deliberately conservative — most vaults will never hit
// either threshold for years. Both can be overridden by passing custom
// limits to `archiveLogIfLarge()` directly (useful for tests).
const DEFAULT_SIZE_LIMIT_BYTES = 256 * 1024;
const DEFAULT_AGE_MAX_MONTHS = 18;

const ENTRY_HEADING_RE = /^##\s+(\d{4})-(\d{2})-(\d{2})\s+—\s+(.+?)$/m;
const ENTRY_SPLIT_RE = /^##\s+\d{4}-\d{2}-\d{2}\s+—\s+/gm;

export interface ArchiveOptions {
  sizeLimitBytes?: number;
  ageMaxMonths?: number;
}

export interface ArchiveResult {
  archived: boolean;
  reason: string;
  archiveFiles: string[];
  entriesArchived: number;
  entriesKept: number;
}

/**
 * Run archive triage on every vault under `.seo-office/vaults/`. Called
 * once on DB boot alongside `runJobRecovery`. Errors are non-fatal.
 */
export async function archiveAllLogsIfLarge(
  options: ArchiveOptions = {},
): Promise<void> {
  const root = vaultsRoot();
  if (!fs.existsSync(root)) return;
  try {
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      try {
        await archiveLogIfLarge(entry.name, options);
      } catch {
        /* per-client failures don't dam other vaults */
      }
    }
  } catch {
    /* archive sweep is best-effort */
  }
}

/**
 * Conditionally archive a single vault's log.md. Returns a structured
 * result so callers/tests can assert on outcomes.
 */
export async function archiveLogIfLarge(
  clientSlug: string,
  options: ArchiveOptions = {},
): Promise<ArchiveResult> {
  const sizeLimit = options.sizeLimitBytes ?? DEFAULT_SIZE_LIMIT_BYTES;
  const ageLimit = options.ageMaxMonths ?? DEFAULT_AGE_MAX_MONTHS;

  return withFileMutex(clientSlug, LOG_RELATIVE, async () => {
    if (!(await fileExists(clientSlug, LOG_RELATIVE))) {
      return idle("log.md missing");
    }

    const raw = (await readRaw(clientSlug, LOG_RELATIVE)) ?? "";
    if (raw.length === 0) return idle("log.md empty");

    const parsed = matter(raw);
    if (parsed.data?.archive_disabled === true) {
      return idle("archive_disabled: true");
    }

    const sizeOk = raw.length >= sizeLimit;
    const ageOk = exceedsAgeLimit(parsed.content, ageLimit);
    if (!sizeOk && !ageOk) {
      return idle(
        `under thresholds (size=${raw.length} < ${sizeLimit}, ageMonths<${ageLimit})`,
      );
    }

    const entries = splitEntries(parsed.content);
    if (entries.length < 4) {
      // Not worth archiving a tiny log — too few entries to halve.
      return idle("fewer than 4 entries");
    }
    // Take the oldest 50%. Entries are newest-first by convention, so
    // the oldest half is the back half.
    const halfIndex = Math.ceil(entries.length / 2);
    const kept = entries.slice(0, halfIndex);
    const oldest = entries.slice(halfIndex);

    // Group archived entries by YYYY-MM and write one file per month.
    const byMonth = new Map<string, ParsedEntry[]>();
    for (const e of oldest) {
      const key = `${e.year}-${e.month}`;
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(e);
    }

    const archiveFiles: string[] = [];
    for (const [month, group] of byMonth) {
      const filename = `${month}.md`;
      const rel = path.posix.join(ARCHIVE_DIR_RELATIVE, filename);
      const existing = (await readRaw(clientSlug, rel)) ?? "";
      const existingParsed = matter(existing || "---\n---\n");
      const today = new Date().toISOString().slice(0, 10);
      const fm = {
        brain_schema: "marketing-brain.v1",
        type: "meta",
        title: `Log archive ${month}`,
        tags: ["log", "archive", "marketing-brain"],
        status: "archived",
        created: existingParsed.data.created ?? today,
        owner: existingParsed.data.owner ?? "orchestrator",
        confidence: existingParsed.data.confidence ?? "high",
        approval_status: existingParsed.data.approval_status ?? "approved",
        rollback_note:
          existingParsed.data.rollback_note ??
          "Log archives are derived from log.md compaction. Restore from backup or append corrections to log.md.",
        risk_level: existingParsed.data.risk_level ?? "low",
        ...existingParsed.data,
        updated: today,
      };
      const groupBody = group.map((g) => g.raw).join("\n\n");
      const body = existing
        ? `${existingParsed.content.trimEnd()}\n\n${groupBody}\n`
        : `# Log archive ${month}\n\n${groupBody}\n`;
      await writeRaw(clientSlug, rel, matter.stringify(body, fm));
      archiveFiles.push(rel);
    }

    // Rewrite log.md with kept entries.
    const intro =
      "**Convention**: append-only. **Newest entries at the TOP.** Never edit or delete past entries.";
    const keptBody = kept.map((k) => k.raw).join("\n\n");
    const newBody = [
      "# Log",
      "",
      intro,
      "",
      "---",
      "",
      keptBody,
    ]
      .join("\n")
      .trimEnd();
    const newFm = {
      ...parsed.data,
      updated: new Date().toISOString().slice(0, 10),
    };
    await writeRaw(
      clientSlug,
      LOG_RELATIVE,
      matter.stringify(newBody + "\n", newFm),
    );

    return {
      archived: true,
      reason: `${sizeOk ? "size-threshold" : ""}${sizeOk && ageOk ? "+" : ""}${ageOk ? "age-threshold" : ""}`,
      archiveFiles,
      entriesArchived: oldest.length,
      entriesKept: kept.length,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

interface ParsedEntry {
  raw: string;
  year: string;
  month: string;
  day: string;
  title: string;
}

/** Split a log body into entries. Each entry starts at a `## YYYY-MM-DD … ` heading. */
function splitEntries(body: string): ParsedEntry[] {
  const indices: number[] = [];
  let m: RegExpExecArray | null;
  ENTRY_SPLIT_RE.lastIndex = 0;
  while ((m = ENTRY_SPLIT_RE.exec(body)) !== null) {
    indices.push(m.index);
  }
  if (indices.length === 0) return [];
  const entries: ParsedEntry[] = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1] : body.length;
    const raw = body.slice(start, end).trimEnd();
    const head = raw.match(ENTRY_HEADING_RE);
    if (!head) continue;
    entries.push({
      raw,
      year: head[1],
      month: head[2],
      day: head[3],
      title: head[4].trim(),
    });
  }
  return entries;
}

function exceedsAgeLimit(body: string, ageMaxMonths: number): boolean {
  ENTRY_HEADING_RE.lastIndex = 0;
  const m = body.match(ENTRY_HEADING_RE);
  if (!m) return false;
  // Find the OLDEST entry — entries are newest-first, so we walk to the
  // last heading.
  const entries = splitEntries(body);
  if (entries.length === 0) return false;
  const oldest = entries[entries.length - 1];
  const oldestDate = new Date(`${oldest.year}-${oldest.month}-${oldest.day}T00:00:00Z`);
  const now = new Date();
  const months =
    (now.getUTCFullYear() - oldestDate.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - oldestDate.getUTCMonth());
  return months >= ageMaxMonths;
}

function idle(reason: string): ArchiveResult {
  return {
    archived: false,
    reason,
    archiveFiles: [],
    entriesArchived: 0,
    entriesKept: 0,
  };
}
