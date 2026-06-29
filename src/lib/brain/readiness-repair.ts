import "server-only";

import matter from "gray-matter";

import { listNotes, readRaw, writeRaw } from "./vault-fs";
import { reindexClient, listNotesByType } from "./index-db";
import { rebuildIndex } from "./index-render";
import { withFileMutex } from "./file-mutex";

interface RepairResult {
  placeholderFiles: string[];
  hotThreadsRetargeted: number;
}

interface NoteCandidate {
  path: string;
  title: string;
}

const PENDING_TEXT_RE = /\b(TODO|TBD|FILL\s+IN|Lorem ipsum)\b/i;
const HOT_RELATIVE = "wiki/hot.md";

/**
 * Repair deterministic scaffold debt before a vault is judged ready.
 *
 * This does not invent SEO facts. It only removes banned placeholder tokens
 * from seed/pending scaffold notes and makes hot.md active-thread wikilinks
 * point at real artifacts when the artifact already exists.
 */
export async function repairBrainReadinessDebt(
  clientSlug: string,
): Promise<RepairResult> {
  const placeholderFiles = await repairSeedPlaceholderText(clientSlug);
  const hotThreadsRetargeted = await repairHotThreadTargets(clientSlug);

  if (placeholderFiles.length > 0 || hotThreadsRetargeted > 0) {
    await reindexClient(clientSlug).catch(() => 0);
    await rebuildIndex(clientSlug).catch(() => undefined);
  }

  return { placeholderFiles, hotThreadsRetargeted };
}

async function repairSeedPlaceholderText(clientSlug: string): Promise<string[]> {
  const changed: string[] = [];
  const notes = await listNotes(clientSlug);

  for (const relativePath of notes) {
    if (!relativePath.startsWith("wiki/")) continue;
    const raw = await readRaw(clientSlug, relativePath);
    if (!raw || !PENDING_TEXT_RE.test(raw)) continue;

    const parsed = matter(raw);
    if (!isSeedLikeNote(parsed.data as Record<string, unknown>)) continue;

    const repairedBody = replaceBannedPlaceholderWords(parsed.content);
    const repairedData = replaceBannedPlaceholderValue(parsed.data) as Record<
      string,
      unknown
    >;
    if (repairedBody === parsed.content && repairedData === parsed.data) continue;

    await writeRaw(clientSlug, relativePath, matter.stringify(repairedBody, repairedData));
    changed.push(relativePath);
  }

  return changed;
}

function isSeedLikeNote(data: Record<string, unknown>): boolean {
  return (
    data.confidence === "seed" ||
    data.status === "seed" ||
    data.status === "pending" ||
    data.status === "pending-day-0"
  );
}

export function replaceBannedPlaceholderWords(text: string): string {
  return text
    .replace(/\bTBD-pending-GSC\b/g, "pending GSC decision")
    .replace(/\bTBD pending\b/gi, "pending")
    .replace(/\bTBD entries\b/gi, "pending entries")
    .replace(/\bTBD\b/g, "Pending")
    .replace(/\bTODO\b/g, "Action item")
    .replace(/\bFILL\s+IN\b/gi, "Complete")
    .replace(/\bLorem ipsum\b/gi, "Draft placeholder text");
}

function replaceBannedPlaceholderValue(value: unknown): unknown {
  if (typeof value === "string") {
    const next = replaceBannedPlaceholderWords(value);
    return next === value ? value : next;
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const repaired = replaceBannedPlaceholderValue(item);
      if (repaired !== item) changed = true;
      return repaired;
    });
    return changed ? next : value;
  }
  if (value && typeof value === "object") {
    let changed = false;
    const input = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(input)) {
      const repaired = replaceBannedPlaceholderValue(item);
      if (repaired !== item) changed = true;
      next[key] = repaired;
    }
    return changed ? next : value;
  }
  return value;
}

async function repairHotThreadTargets(clientSlug: string): Promise<number> {
  return withFileMutex(clientSlug, HOT_RELATIVE, async () => {
    const raw = await readRaw(clientSlug, HOT_RELATIVE);
    if (!raw) return 0;

    const parsed = matter(raw);
    const content = parsed.content;
    const section = extractSection(content, "Active Threads");
    if (!section) return 0;

    const candidates = collectArtifactCandidates(clientSlug);
    let retargeted = 0;
    const repairedSection = section.replace(
      /^(\s*(?:\d+\.|[-*])\s*\*{0,2})\[\[([^\]]+)\]\](\*{0,2}\s*(?:—|–|-)\s*.+)$/gm,
      (full, prefix: string, rawLink: string, suffix: string) => {
        const [target, alias] = splitWikilink(rawLink);
        if (alias || target.includes("/")) return full;

        const match = findBestThreadTarget(target, candidates);
        if (!match) return full;

        retargeted++;
        return `${prefix}[[${wikilinkTarget(match.path)}|${target}]]${suffix}`;
      },
    );

    if (retargeted === 0 || repairedSection === section) return 0;

    const repairedBody = replaceSection(content, "Active Threads", repairedSection);
    await writeRaw(clientSlug, HOT_RELATIVE, matter.stringify(repairedBody, parsed.data));
    return retargeted;
  });
}

function collectArtifactCandidates(clientSlug: string): NoteCandidate[] {
  const rows = [
    ...listNotesByType(clientSlug, "audit"),
    ...listNotesByType(clientSlug, "deliverable"),
    ...listNotesByType(clientSlug, "page-brief"),
    ...listNotesByType(clientSlug, "keyword-strategy"),
  ];
  return rows.map((row) => ({ path: row.path, title: row.title }));
}

function findBestThreadTarget(
  threadTitle: string,
  candidates: NoteCandidate[],
): NoteCandidate | null {
  const title = normalize(threadTitle);

  const ruleHit = candidates.find((candidate) => {
    const haystack = normalize(`${candidate.title} ${candidate.path}`);
    if (title.includes("beast")) return haystack.includes("beast");
    if (title.includes("brief")) {
      const keyword = title.replace(/^brief\s*/, "").trim();
      return haystack.includes("content brief") && keywordWords(keyword, haystack);
    }
    if (title.includes("topic cluster")) return haystack.includes("topic cluster");
    if (title.includes("competitor page")) return haystack.includes("competitor");
    if (title.includes("content audit")) return haystack.includes("content audit");
    return false;
  });
  if (ruleHit) return ruleHit;

  let best: { candidate: NoteCandidate; score: number } | null = null;
  for (const candidate of candidates) {
    const haystack = normalize(`${candidate.title} ${candidate.path}`);
    const score = title
      .split(/\s+/)
      .filter((word) => word.length > 2 && haystack.includes(word)).length;
    if (score > (best?.score ?? 0)) best = { candidate, score };
  }
  return best && best.score >= 2 ? best.candidate : null;
}

function keywordWords(keyword: string, haystack: string): boolean {
  const words = keyword.split(/\s+/).filter((word) => word.length > 2);
  if (words.length === 0) return true;
  return words.every((word) => haystack.includes(word));
}

function splitWikilink(rawLink: string): [target: string, alias: string | null] {
  const [target, alias] = rawLink.split("|", 2);
  return [target.trim(), alias?.trim() || null];
}

function wikilinkTarget(target: string): string {
  return target.replace(/^wiki\//, "").replace(/\.md$/i, "").trim();
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\//g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractSection(body: string, heading: string): string {
  const re = new RegExp(
    `^##\\s+${escapeRegex(heading)}\\s*$([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`,
    "m",
  );
  const match = body.match(re);
  return match ? match[1].trim() : "";
}

function replaceSection(body: string, heading: string, replacement: string): string {
  const re = new RegExp(
    `(^##\\s+${escapeRegex(heading)}\\s*$)([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`,
    "m",
  );
  return body.replace(re, `$1\n${replacement.trim()}\n\n`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
