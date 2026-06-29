/**
 * Render `wiki/index.md` from the live note set.
 *
 * The vendored marketing-brain template ships an `index.md` whose body
 * is a hand-curated section list grouping every wiki note by type. After
 * the renderer fills the scaffold, that file goes STALE the moment a
 * specialist (or the user) adds a note — and pre-Phase-2 no code touched
 * it ever again.
 *
 * `renderIndex()` and `rebuildIndex()` close that gap. The body is
 * regenerated from the SQLite `notes` table (which the artifact write
 * pipeline keeps in sync via `reindexNoteRow`). The frontmatter and the
 * fixed "Start Here" section are preserved verbatim from the previous
 * file so user-added wikilinks/aliases survive the rebuild.
 */
import "server-only";
import matter from "gray-matter";
import { readRaw, writeRaw } from "./vault-fs";
import { withFileMutex } from "./file-mutex";
import {
  listNotesByType,
  type NoteRow,
} from "./index-db";
import type { NoteType } from "./types";

const INDEX_RELATIVE = "wiki/index.md";

/**
 * Canonical section order from `vendored/marketing-brain/template-brain/
 * wiki/index.md`. Section heading → list of NoteTypes that populate it.
 * Some sections aggregate multiple types (e.g. "Meta" = `meta` notes
 * minus the four meta files we handle separately).
 */
const SECTIONS: Array<{
  heading: string;
  types: NoteType[];
  filter?: (note: NoteRow) => boolean;
}> = [
  { heading: "Sources", types: ["source"] },
  { heading: "Audits", types: ["audit"] },
  { heading: "Entities", types: ["entity", "stakeholder"] },
  { heading: "Concepts", types: ["concept"] },
  { heading: "Page Templates", types: ["page-brief"] },
  { heading: "Flows", types: ["flow"] },
  { heading: "Decisions", types: ["decision"] },
  { heading: "Keywords", types: ["keyword-strategy"] },
  { heading: "Deliverables", types: ["deliverable"] },
  { heading: "Business-Type Overlays", types: ["business-type-overlay"] },
  { heading: "Questions", types: ["question"] },
  // Meta excludes the four canonical meta files that already appear in
  // Start Here so we don't list them twice.
  {
    heading: "Meta",
    types: ["meta", "overview"],
    filter: (note) =>
      !META_HOMES.has(note.path.replace(/^wiki\//, "").toLowerCase()),
  },
];

const META_HOMES = new Set([
  "hot.md",
  "log.md",
  "index.md",
  "overview.md",
]);

/** Static Start Here block, mirroring the canonical template. The
 *  wikilinks here are aspirational — Obsidian renders them as bold text
 *  whether or not the target exists, and the linter flags missing ones
 *  separately. */
const START_HERE_BLOCK = `## Start Here

- [[Overview]]
- [[Hot]]
- [[Log]]
- [[Start Here]]
- [[Day 0 Measurement Access Gate]]
`;

/**
 * Pure render: turn a list of notes into the index body. Frontmatter is
 * the caller's responsibility — pass it through `matter.stringify` after.
 */
export function renderIndex(notes: NoteRow[]): string {
  const byType = new Map<string, NoteRow[]>();
  for (const note of notes) {
    if (!byType.has(note.type)) byType.set(note.type, []);
    byType.get(note.type)!.push(note);
  }
  const lines: string[] = ["# Index", "", START_HERE_BLOCK];

  for (const section of SECTIONS) {
    const matches: NoteRow[] = [];
    for (const t of section.types) {
      const rows = byType.get(t) ?? [];
      for (const row of rows) {
        if (section.filter && !section.filter(row)) continue;
        matches.push(row);
      }
    }
    if (matches.length === 0) continue;
    matches.sort((a, b) => a.title.localeCompare(b.title));
    lines.push(`## ${section.heading}`, "");
    for (const m of matches) {
      lines.push(`- ${wikilinkForNote(m)}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

function wikilinkForNote(note: NoteRow): string {
  const target = note.path
    .replace(/^wiki\//, "")
    .replace(/\.md$/i, "");
  const targetLabel = target.split("/").pop() ?? target;
  if (targetLabel === note.title) return `[[${target}]]`;
  return `[[${target}|${note.title}]]`;
}

/**
 * Rebuild `wiki/index.md` from the SQLite mirror.
 *
 * Preserves the existing frontmatter (so user-added `aliases`, `related`,
 * etc. survive) and replaces the body with the auto-generated section
 * list. Holds the per-path mutex across read+write so a parallel
 * specialist's reindex hook can't race with this rebuild.
 *
 * Non-fatal on failure — index.md is a derived view; if rebuild fails
 * the underlying notes still exist on disk and in SQLite.
 */
export async function rebuildIndex(clientSlug: string): Promise<void> {
  return withFileMutex(clientSlug, INDEX_RELATIVE, async () => {
    try {
      // Collect every note we care about for the index. We could query
      // a single `SELECT * FROM notes` but that adds a dependency on
      // a new helper; cycling through SECTIONS keeps the source of
      // truth (which types render where) in this file.
      const seen = new Set<string>();
      const all: NoteRow[] = [];
      for (const section of SECTIONS) {
        for (const t of section.types) {
          for (const row of listNotesByType(clientSlug, t)) {
            const key = `${row.client_slug}::${row.path}`;
            if (seen.has(key)) continue;
            seen.add(key);
            all.push(row);
          }
        }
      }

      const existing = (await readRaw(clientSlug, INDEX_RELATIVE)) ?? "";
      const parsed = matter(existing || "---\n---\n");
      const today = new Date().toISOString().slice(0, 10);
      const fm = {
        brain_schema: "marketing-brain.v1",
        type: "meta",
        title: "Index",
        tags: ["index", "marketing-brain"],
        status: "active",
        created: parsed.data.created ?? today,
        owner: parsed.data.owner ?? "seo-office",
        confidence: parsed.data.confidence ?? "high",
        approval_status: parsed.data.approval_status ?? "approved",
        rollback_note:
          parsed.data.rollback_note ??
          "Derived from the SQLite note index. Rebuild index.md from the current vault index to roll back manual edits.",
        risk_level: parsed.data.risk_level ?? "low",
        ...parsed.data,
        updated: today,
      };
      const body = renderIndex(all);
      await writeRaw(clientSlug, INDEX_RELATIVE, matter.stringify(body, fm));
    } catch {
      // Derived view — never crash a specialist run on rebuild failure.
    }
  });
}
