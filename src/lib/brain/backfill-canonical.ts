import "server-only";

import path from "node:path";
import matter from "gray-matter";

import { mergeCanonicalSection } from "./canonical-writer";
import type { Frontmatter, NoteType } from "./types";
import { reindexClient } from "./index-db";
import { listNotes, readRaw, writeNote, writeRaw } from "./vault-fs";

export interface BackfillCanonicalOptions {
  write?: boolean;
}

export interface BackfillChange {
  targetPath: string;
  sectionId: string;
  sourcePaths: string[];
  changed: boolean;
  reason: "updated" | "up_to_date" | "missing_source";
}

export interface BackfillCanonicalResult {
  clientSlug: string;
  write: boolean;
  changes: BackfillChange[];
}

interface BackfillTarget {
  targetPath: string;
  title: string;
  type: NoteType;
  sectionId: string;
  sourcePatterns: RegExp[];
  heading: string;
  summary: string;
}

const TARGETS: BackfillTarget[] = [
  {
    targetPath: "wiki/keywords/Keyword Targets and Page Map.md",
    title: "Keyword Targets and Page Map",
    type: "keyword-strategy",
    sectionId: "keyword-map",
    sourcePatterns: [/keyword/i],
    heading: "Backfilled keyword target map",
    summary:
      "Merged the latest dated keyword artifact into the canonical keyword target map so future specialists can reuse one stable source of truth.",
  },
  {
    targetPath: "wiki/decisions/Keyword to URL Map.md",
    title: "Keyword to URL Map",
    type: "decision",
    sectionId: "keyword-url-decisions",
    sourcePatterns: [/keyword/i, /url-map/i],
    heading: "Backfilled keyword-to-URL decisions",
    summary:
      "Merged dated keyword evidence into the canonical URL decision ledger. Treat these rows as the baseline for briefs, internal links, and implementation tasks.",
  },
  {
    targetPath: "wiki/sources/Competitor Landscape Cache.md",
    title: "Competitor Landscape Cache",
    type: "source",
    sectionId: "competitor-landscape",
    sourcePatterns: [/competitor/i, /competitive/i],
    heading: "Backfilled competitor landscape",
    summary:
      "Merged the latest dated competitor artifact into the canonical landscape cache so competitor analysis is not stranded in one-off reports.",
  },
  {
    targetPath: "wiki/sources/Competitor Keyword Research Summary.md",
    title: "Competitor Keyword Research Summary",
    type: "source",
    sectionId: "competitor-keywords",
    sourcePatterns: [/competitor.*keyword/i, /keyword.*competitor/i],
    heading: "Backfilled competitor keyword summary",
    summary:
      "Merged competitor keyword evidence into the canonical summary used by keyword, cluster, and BEAST planning specialists.",
  },
  {
    targetPath: "wiki/entities/Primary Competitors.md",
    title: "Primary Competitors",
    type: "entity",
    sectionId: "primary-competitors",
    sourcePatterns: [/competitor/i, /competitive/i],
    heading: "Backfilled primary competitor entities",
    summary:
      "Merged known competitor evidence into the canonical competitor entity note. Use this as the starting point before adding new competitors.",
  },
  {
    targetPath: "wiki/deliverables/ULTIMATE BEAST Plan.md",
    title: "ULTIMATE BEAST Plan",
    type: "deliverable",
    sectionId: "beast-plan",
    sourcePatterns: [/beast/i, /roadmap/i, /implementation/i],
    heading: "Backfilled BEAST plan",
    summary:
      "Merged the latest dated BEAST or roadmap deliverable into the canonical plan so the final strategy is easy to find and review.",
  },
];

export async function backfillCanonicalBrain(
  clientSlug: string,
  options: BackfillCanonicalOptions = {},
): Promise<BackfillCanonicalResult> {
  const write = options.write === true;
  const notes = await listNotes(clientSlug);
  const changes: BackfillChange[] = [];

  for (const target of TARGETS) {
    const sources = selectSources(notes, target);
    if (sources.length === 0) {
      changes.push({
        targetPath: target.targetPath,
        sectionId: target.sectionId,
        sourcePaths: [],
        changed: false,
        reason: "missing_source",
      });
      continue;
    }

    const generated = await renderBackfillSection(clientSlug, target, sources);
    const current = await ensureTargetRaw(clientSlug, target, write);
    const merged = mergeCanonicalSection(current, target.sectionId, generated);
    const changed = normalize(current) !== normalize(merged);

    if (write && changed) {
      await writeRaw(clientSlug, target.targetPath, merged);
    }

    changes.push({
      targetPath: target.targetPath,
      sectionId: target.sectionId,
      sourcePaths: sources,
      changed,
      reason: changed ? "updated" : "up_to_date",
    });
  }

  if (write && changes.some((change) => change.changed)) {
    await reindexClient(clientSlug).catch(() => undefined);
  }

  return { clientSlug, write, changes };
}

function selectSources(notes: string[], target: BackfillTarget): string[] {
  const candidates = notes
    .filter((note) => note !== target.targetPath)
    .filter((note) => isDatedArtifact(note))
    .filter((note) => target.sourcePatterns.some((pattern) => pattern.test(note)))
    .sort(compareArtifactFreshness);

  if (candidates.length === 0) return [];
  const latestDate = artifactDate(candidates[0]);
  return candidates.filter((note) => artifactDate(note) === latestDate).slice(0, 3);
}

async function renderBackfillSection(
  clientSlug: string,
  target: BackfillTarget,
  sourcePaths: string[],
): Promise<string> {
  const sourceBlocks: string[] = [];
  for (const sourcePath of sourcePaths) {
    const raw = (await readRaw(clientSlug, sourcePath)) ?? "";
    const parsed = matter(raw);
    const content = parsed.content.trim() || raw.trim();
    sourceBlocks.push(
      [
        `### ${path.basename(sourcePath, ".md")}`,
        "",
        `Source path: \`${sourcePath}\``,
        "",
        excerptMarkdown(content),
      ].join("\n"),
    );
  }

  return [
    `## ${target.heading}`,
    "",
    target.summary,
    "",
    `Backfilled from source date: ${artifactDate(sourcePaths[0] ?? "")}`,
    "",
    "Source artifacts:",
    ...sourcePaths.map((sourcePath) => `- \`${sourcePath}\``),
    "",
    ...sourceBlocks,
  ].join("\n");
}

async function ensureTargetRaw(
  clientSlug: string,
  target: BackfillTarget,
  write: boolean,
): Promise<string> {
  const current = await readRaw(clientSlug, target.targetPath);
  if (current !== null) return current;

  const today = new Date().toISOString().slice(0, 10);
  const frontmatter: Frontmatter = {
    brain_schema: "marketing-brain.v1",
    type: target.type,
    title: target.title,
    created: today,
    updated: today,
    tags: ["seo-office", "canonical", "backfilled"],
    status: "active",
    owner: "seo-office",
    confidence: "medium",
    approval_status: "needs-review",
    risk_level: "medium",
    rollback_note:
      "Delete this canonical note or replace the managed seo-office section with the previous version.",
  };
  const body = `# ${target.title}\n\nCanonical Marketing Brain note created by SEO Office backfill.`;
  const serialized = matter.stringify(body, frontmatter);
  if (write) {
    await writeNote(clientSlug, target.targetPath, { frontmatter, body });
  }
  return serialized;
}

function isDatedArtifact(note: string): boolean {
  const base = path.basename(note);
  if (!/^\d{4}-\d{2}-\d{2}-.+\.md$/i.test(base)) return false;
  return (
    note.startsWith("wiki/audits/") ||
    note.startsWith("wiki/deliverables/") ||
    note.startsWith("wiki/keywords/") ||
    note.startsWith("wiki/sources/") ||
    note.startsWith("wiki/reviews/")
  );
}

function compareArtifactFreshness(a: string, b: string): number {
  return artifactDate(b).localeCompare(artifactDate(a)) || b.localeCompare(a);
}

function artifactDate(note: string): string {
  return path.basename(note).slice(0, 10);
}

function excerptMarkdown(content: string): string {
  const cleaned = content
    .replace(/<!--\s*seo-office:[\w-]+:(start|end)\s*-->/g, "")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const excerpt = words.slice(0, 450).join(" ");
  return excerpt.length > 0 ? excerpt : "_No text content found in source artifact._";
}

function normalize(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}
