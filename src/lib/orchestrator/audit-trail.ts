/**
 * `log.md` — append-only audit trail. Newest entries at the TOP.
 *
 * Per marketing-brain CODEX: never edit or delete past entries. Corrections
 * are new entries that supersede.
 *
 * Concurrency: log.md is a shared sink. The parallel task runner can fire
 * multiple specialists at once, and each will call `appendLogEntry` when
 * its artefact lands. Without a mutex, two read-modify-writes could race
 * and lose the older entry. We serialise per (clientSlug) via an in-
 * process promise chain — cheap, no external deps, single-node-process
 * scope which matches the rest of the app.
 */
import "server-only";
import { readRaw, writeRaw } from "@/lib/brain/vault-fs";
import matter from "gray-matter";

const LOG_RELATIVE = "wiki/log.md";

export interface LogEntry {
  /** YYYY-MM-DD */
  date: string;
  title: string;
  body: string;
}

/* -------------------------------------------------------------------------- */
/* per-client append mutex                                                     */
/* -------------------------------------------------------------------------- */

const writeChains = new Map<string, Promise<void>>();

function withClientLock<T>(clientSlug: string, fn: () => Promise<T>): Promise<T> {
  const previous = writeChains.get(clientSlug) ?? Promise.resolve();
  // Keep going whether the previous call succeeded or threw — failures
  // shouldn't dam the chain forever.
  const next = previous.then(fn, fn);
  writeChains.set(
    clientSlug,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

/**
 * Append a new log entry at the TOP of log.md (after the frontmatter + intro).
 * Creates the file with sensible defaults if it doesn't exist.
 */
export async function appendLogEntry(
  clientSlug: string,
  entry: Omit<LogEntry, "date"> & { date?: string },
): Promise<void> {
  return withClientLock(clientSlug, () => appendLogEntryInner(clientSlug, entry));
}

async function appendLogEntryInner(
  clientSlug: string,
  entry: Omit<LogEntry, "date"> & { date?: string },
): Promise<void> {
  const date = entry.date ?? new Date().toISOString().slice(0, 10);
  const existing = (await readRaw(clientSlug, LOG_RELATIVE)) ?? defaultLog();
  const parsed = matter(existing);
  const intro = "**Convention**: append-only. **Newest entries at the TOP.** Never edit or delete past entries.\n\n---";
  const newEntry = `## ${date} — ${entry.title}\n\n${entry.body.trim()}`;

  let body: string;
  if (parsed.content.includes(intro)) {
    body = parsed.content.replace(intro, `${intro}\n\n${newEntry}`);
  } else {
    // No recognised intro — just prepend below the title (if any) or at the top.
    body = parsed.content.replace(
      /^(#\s+Log\s*$)/m,
      `$1\n\n${intro}\n\n${newEntry}`,
    );
    if (body === parsed.content) {
      body = `# Log\n\n${intro}\n\n${newEntry}\n\n${parsed.content.trimStart()}`;
    }
  }

  const fm = {
    brain_schema: "marketing-brain.v1",
    type: "meta",
    title: "Log",
    tags: ["log", "marketing-brain"],
    status: "active",
    created: parsed.data.created ?? date,
    owner: parsed.data.owner ?? "orchestrator",
    confidence: parsed.data.confidence ?? "high",
    approval_status: parsed.data.approval_status ?? "approved",
    rollback_note:
      parsed.data.rollback_note ??
      "log.md is append-only. Rollback means appending a corrective entry, not editing history.",
    risk_level: parsed.data.risk_level ?? "low",
    ...parsed.data,
    updated: date,
  };

  await writeRaw(clientSlug, LOG_RELATIVE, matter.stringify(body, fm));
}

/** Parse all entries in log.md, newest first (the order on disk). */
export async function readLog(clientSlug: string): Promise<LogEntry[]> {
  const raw = await readRaw(clientSlug, LOG_RELATIVE);
  if (raw == null) return [];
  const body = matter(raw).content;
  const re = /^##\s+(\d{4}-\d{2}-\d{2})\s+—\s+(.+?)$([\s\S]*?)(?=^##\s+\d{4}-\d{2}-\d{2}|(?![\s\S]))/gm;
  const entries: LogEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    entries.push({
      date: m[1],
      title: m[2].trim(),
      body: m[3].trim(),
    });
  }
  return entries;
}

function defaultLog(): string {
  return `---
brain_schema: marketing-brain.v1
type: meta
title: Log
tags: [log, marketing-brain]
status: active
owner: orchestrator
confidence: high
approval_status: approved
rollback_note: "log.md is append-only. Rollback means appending a corrective entry, not editing history."
risk_level: low
created: ${new Date().toISOString().slice(0, 10)}
updated: ${new Date().toISOString().slice(0, 10)}
---

# Log

**Convention**: append-only. **Newest entries at the TOP.** Never edit or delete past entries.

---
`;
}
