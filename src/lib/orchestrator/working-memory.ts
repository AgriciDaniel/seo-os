/**
 * `hot.md` reader / writer — the brain's working-memory cache.
 *
 * Per marketing-brain convention: `hot.md` is OVERWRITTEN IN PLACE every
 * session. It contains ~500 words of "what's recent" so the next session
 * can pick up cold. Never append to it. Read the previous version BEFORE
 * overwriting so context isn't lost.
 */
import "server-only";
import { readRaw, writeRaw } from "@/lib/brain/vault-fs";
import { hotPath } from "@/lib/brain/paths";
import matter from "gray-matter";

export interface ActiveThread {
  title: string;
  rationale: string;
  /** Optional wiki-relative target path. When present, hot.md renders the
   * thread as an alias wikilink to the real artifact instead of creating a
   * label-only dead wikilink. */
  target?: string;
}

export interface HotContent {
  lastUpdated: string;
  keyRecentFacts: string[];
  recentChanges: string[];
  activeThreads: ActiveThread[];
  statusNote: string;
  /** Verbatim body for callers who need the raw markdown. */
  raw: string;
}

const HOT_RELATIVE = "wiki/hot.md";

export async function readHot(clientSlug: string): Promise<HotContent | null> {
  const raw = await readRaw(clientSlug, HOT_RELATIVE);
  if (raw == null) return null;
  return parseHot(raw);
}

/**
 * Updates the caller wants applied to hot.md. The merge against the
 * previous content happens INSIDE the mutex so two parallel callers can't
 * each compute their merged-content from the same stale baseline.
 *
 * History — pre-Phase-1 the caller pre-merged in `artifact.ts` and passed
 * the merged `HotContent` to `writeHot`. The mutex serialised the writes
 * (no torn file) but not the *reads* — second writer overwrote with stale
 * facts, silently dropping the first writer's contribution. This shape
 * fixes that race by giving `writeHot` only the diff.
 */
export interface HotUpdate {
  /** YYYY-MM-DD; goes into the Last-Updated section. */
  lastUpdated: string;
  /** New facts to prepend. Capped at 5 in the merged output. */
  newFacts: string[];
  /** One-line summary of what just changed. Prepended to Recent Changes,
   *  which is capped at 4. */
  newChange: string;
  /** The active thread the latest specialist created. Prepended; capped
   *  at 5. Omit to leave threads alone. */
  newThread?: ActiveThread;
  /** Replaces the Status Note section verbatim. */
  statusNote: string;
}

// Per-client async mutex for hot.md writes. Required because Phase-1
// orchestrator fan-out lets 10 specialists finish in parallel and each
// calls writeHot via writeArtifact. Without serialisation the
// read-modify-write race shreds the file.
const hotMutex = new Map<string, Promise<void>>();

/**
 * Apply a `HotUpdate` to hot.md. The read-merge-write sequence runs
 * entirely inside the per-client mutex so parallel callers compose
 * correctly: caller A's facts are visible to caller B's merge.
 */
export async function writeHot(
  clientSlug: string,
  update: HotUpdate,
): Promise<void> {
  const previous = hotMutex.get(clientSlug) ?? Promise.resolve();
  const next = previous.then(() => doWriteHot(clientSlug, update));
  hotMutex.set(
    clientSlug,
    next.catch(() => undefined),
  );
  return next;
}

async function doWriteHot(
  clientSlug: string,
  update: HotUpdate,
): Promise<void> {
  // Read INSIDE the mutex — this is the critical correctness fix vs the
  // pre-Phase-1 version that took a pre-merged HotContent.
  const existing = (await readRaw(clientSlug, HOT_RELATIVE)) ?? "";
  const parsed = matter(existing || "---\n---\n");
  const previousHot = existing ? parseHot(existing) : null;
  const merged: Omit<HotContent, "raw"> = {
    lastUpdated: update.lastUpdated,
    keyRecentFacts: [
      ...update.newFacts,
      ...(previousHot?.keyRecentFacts ?? []),
    ].slice(0, 5),
    recentChanges: [
      update.newChange,
      ...(previousHot?.recentChanges ?? []),
    ].slice(0, 4),
    activeThreads: update.newThread
      ? [update.newThread, ...(previousHot?.activeThreads ?? [])].slice(0, 5)
      : (previousHot?.activeThreads ?? []),
    statusNote: update.statusNote,
  };
  const today = new Date().toISOString().slice(0, 10);
  const fm = {
    ...parsed.data,
    brain_schema: "marketing-brain.v1",
    type: "meta",
    title: "Hot",
    tags: ["hot-cache", "marketing-brain"],
    status: "active",
    created: parsed.data.created ?? today,
    owner: parsed.data.owner ?? "orchestrator",
    confidence: parsed.data.confidence ?? "high",
    approval_status: parsed.data.approval_status ?? "approved",
    rollback_note:
      parsed.data.rollback_note ??
      "hot.md is overwritten working memory. Rebuild it from log.md and latest specialist artifacts if needed.",
    risk_level: parsed.data.risk_level ?? "low",
    updated: today,
    updated_in_session: today,
  };
  const body = renderHot(merged);
  await writeRaw(clientSlug, HOT_RELATIVE, matter.stringify(body, fm));
}

/* -------------------------------------------------------------------------- */
/* parse                                                                       */
/* -------------------------------------------------------------------------- */

function parseHot(raw: string): HotContent {
  const parsed = matter(raw);
  const body = parsed.content;
  return {
    raw: body,
    lastUpdated: extractSection(body, "Last Updated").trim(),
    keyRecentFacts: extractBullets(body, "Key Recent Facts"),
    recentChanges: extractBullets(body, "Recent Changes"),
    activeThreads: extractThreads(body),
    statusNote: extractSection(body, "Status Note").trim(),
  };
}

function extractSection(body: string, heading: string): string {
  // JS regex has no \Z; we substitute "$(?![\s\S])" for end-of-string OR
  // use a sentinel sweep. Simplest: match next ## OR end of string.
  const re = new RegExp(
    `^##\\s+${escapeRegex(heading)}\\s*$([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`,
    "m",
  );
  const match = body.match(re);
  return match ? match[1].trim() : "";
}

function extractBullets(body: string, heading: string): string[] {
  const section = extractSection(body, heading);
  if (!section) return [];
  return section
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- ") || l.startsWith("* "))
    .map((l) => l.replace(/^[-*]\s+/, ""));
}

function extractThreads(body: string): ActiveThread[] {
  const section = extractSection(body, "Active Threads");
  if (!section) return [];
  const threads: ActiveThread[] = [];
  // Allows: "1. [[Name]] — desc", "1. **[[Name]]** — desc",
  // "1. *[[Name]]* - desc", "- [[Name]] — desc"
  const re = /^(?:\d+\.|[-*])\s*\*{0,2}\[\[([^\]|#]+?)(?:\|([^\]#]+))?(?:#[^\]]*)?\]\]\*{0,2}\s*(?:—|–|-)\s*(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section))) {
    const target = m[1].trim();
    const alias = m[2]?.trim();
    threads.push({
      title: alias || target,
      rationale: m[3].trim(),
      ...(alias ? { target } : {}),
    });
  }
  return threads;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* -------------------------------------------------------------------------- */
/* render                                                                      */
/* -------------------------------------------------------------------------- */

function renderHot(c: Omit<HotContent, "raw">): string {
  const facts = c.keyRecentFacts.length
    ? c.keyRecentFacts.map((f) => `- ${f}`).join("\n")
    : "- (none yet)";
  const changes = c.recentChanges.length
    ? c.recentChanges.map((f) => `- ${f}`).join("\n")
    : "- (none yet)";
  const threads = c.activeThreads.length
    ? c.activeThreads
        .map((t, i) => {
          const target = t.target ? wikilinkTarget(t.target) : t.title;
          const label = t.target ? `|${t.title}` : "";
          return `${i + 1}. [[${target}${label}]] — ${t.rationale}`;
        })
        .join("\n")
    : "1. (no active threads)";
  return `# Hot

## Last Updated
${c.lastUpdated}

## Key Recent Facts
${facts}

## Recent Changes
${changes}

## Active Threads
${threads}

## Status Note
${c.statusNote || "(no status notes yet)"}
`;
}

/** Convenience: re-render hot.md so that `hotPath()` is available for callers. */
export { hotPath };

function wikilinkTarget(target: string): string {
  return target
    .replace(/^wiki\//, "")
    .replace(/\.md$/i, "")
    .trim();
}
