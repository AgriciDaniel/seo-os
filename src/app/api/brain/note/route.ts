/**
 * GET /api/brain/note?slug=<client>&path=<wiki-relative-path>
 *
 * Returns the raw body, parsed frontmatter, and local link context for a
 * single note. Used by the VaultBrowser's slide-over preview.
 */
import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { vaultRoot } from "@/lib/brain/paths";
import { getClient } from "@/lib/brain/index-db";
import { ClientSlug } from "@/lib/brain/types";
import { readNote } from "@/lib/brain/vault-fs";

export const dynamic = "force-dynamic";

interface IndexedNote {
  abs: string;
  path: string;
  relStem: string;
  stem: string;
  title: string;
  aliases: string[];
  frontmatter: Record<string, unknown>;
  content: string;
}

interface LinkRef {
  path: string;
  title: string;
  target: string;
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

function cleanVaultTarget(raw: string): string | null {
  const clean = raw.split("|", 1)[0].split("#", 1)[0].trim();
  if (
    !clean ||
    clean.includes("\0") ||
    path.isAbsolute(clean) ||
    clean.split(/[\\/]/).includes("..")
  ) {
    return null;
  }
  return clean;
}

function withoutMarkdownSuffix(value: string): string {
  return value.toLowerCase().endsWith(".md") ? value.slice(0, -3) : value;
}

function normalizeTarget(value: string): string {
  return withoutMarkdownSuffix(value.replace(/^wiki\//i, "")).toLowerCase();
}

async function buildNoteIndex(
  clientSlug: string,
  wikiRoot: string,
): Promise<IndexedNote[]> {
  const notes: IndexedNote[] = [];
  await walkMarkdown(wikiRoot, wikiRoot, async (abs, rel) => {
    const note = await readNote(clientSlug, `wiki/${rel}`).catch(() => null);
    if (!note) return;
    const data = note.frontmatter;
    const title =
      typeof data.title === "string" && data.title.trim()
        ? data.title.trim()
        : path.basename(rel, ".md");
    const aliases = Array.isArray(data.aliases)
      ? data.aliases.filter((alias): alias is string => typeof alias === "string")
      : [];
    notes.push({
      abs,
      path: `wiki/${rel}`,
      relStem: withoutMarkdownSuffix(rel),
      stem: path.basename(rel, ".md"),
      title,
      aliases,
      frontmatter: data,
      content: note.body,
    });
  });
  return notes;
}

async function walkMarkdown(
  root: string,
  dir: string,
  visit: (abs: string, rel: string) => Promise<void>,
): Promise<void> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "_attachments") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkMarkdown(root, abs, visit);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    await visit(abs, path.relative(root, abs).replaceAll(path.sep, "/"));
  }
}

function resolveNote(notes: IndexedNote[], requested: string): IndexedNote | null {
  const clean = cleanVaultTarget(requested);
  if (!clean) return null;
  const key = normalizeTarget(clean);

  if (key.includes("/")) {
    return notes.find((note) => note.relStem.toLowerCase() === key) ?? null;
  }

  const byStem = notes.find((note) => note.stem.toLowerCase() === key);
  if (byStem) return byStem;

  const byTitle = notes.find((note) => note.title.toLowerCase() === key);
  if (byTitle) return byTitle;

  return (
    notes.find((note) =>
      note.aliases.some((alias) => alias.trim().toLowerCase() === key),
    ) ?? null
  );
}

function collectRawTargets(note: IndexedNote): string[] {
  const targets: string[] = [];
  collectWikilinks(note.content, targets);
  collectFrontmatterLinks(note.frontmatter.related, targets);
  collectFrontmatterLinks(note.frontmatter.sources, targets);
  return targets;
}

function collectFrontmatterLinks(value: unknown, targets: string[]) {
  if (typeof value === "string") {
    collectWikilinks(value, targets);
    return;
  }
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === "string") collectWikilinks(item, targets);
  }
}

function collectWikilinks(value: string, targets: string[]) {
  WIKILINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_RE.exec(value)) !== null) {
    const target = cleanVaultTarget(match[1]);
    if (target) targets.push(target);
  }
}

function linkRef(note: IndexedNote, target: string): LinkRef {
  return { path: note.path, title: note.title, target };
}

function uniqueRefs(refs: LinkRef[]): LinkRef[] {
  const seen = new Set<string>();
  const unique: LinkRef[] = [];
  for (const ref of refs) {
    const key = `${ref.path}\0${ref.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(ref);
  }
  return unique.sort((a, b) => a.title.localeCompare(b.title));
}

function linkContext(notes: IndexedNote[], current: IndexedNote) {
  const outgoing: LinkRef[] = [];
  const unresolved: Array<{ target: string }> = [];
  for (const target of collectRawTargets(current)) {
    const resolved = resolveNote(notes, target);
    if (resolved) {
      if (resolved.path !== current.path) outgoing.push(linkRef(resolved, target));
    } else {
      unresolved.push({ target });
    }
  }

  const backlinks: LinkRef[] = [];
  for (const note of notes) {
    if (note.path === current.path) continue;
    for (const target of collectRawTargets(note)) {
      const resolved = resolveNote(notes, target);
      if (resolved?.path === current.path) backlinks.push(linkRef(note, target));
    }
  }

  return {
    outgoing: uniqueRefs(outgoing),
    backlinks: uniqueRefs(backlinks),
    unresolved: Array.from(new Set(unresolved.map((item) => item.target)))
      .sort((a, b) => a.localeCompare(b))
      .map((target) => ({ target })),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const relativePath = url.searchParams.get("path");
  const parsedSlug = slug ? ClientSlug.safeParse(slug) : null;
  if (!slug || !relativePath) {
    return NextResponse.json(
      { ok: false, error: "slug and path are required" },
      { status: 400 },
    );
  }
  if (!parsedSlug?.success || !getClient(parsedSlug.data)) {
    return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
  }
  if (!cleanVaultTarget(relativePath)) {
    return NextResponse.json(
      { ok: false, error: "only wiki markdown notes can be previewed" },
      { status: 400 },
    );
  }

  // Defend against path-escape: resolve against the vault root and
  // reject anything that lands outside.
  const root = path.resolve(vaultRoot(parsedSlug.data));
  const wikiRoot = path.join(root, "wiki");
  if (!fs.existsSync(wikiRoot)) {
    return NextResponse.json({ ok: false, error: "wiki not found" }, { status: 404 });
  }

  const notes = await buildNoteIndex(parsedSlug.data, wikiRoot);
  const resolved = resolveNote(notes, relativePath);
  if (!resolved) {
    return NextResponse.json({ ok: false, error: "note not found" }, { status: 404 });
  }
  if (!resolved.abs.startsWith(wikiRoot + path.sep)) {
    return NextResponse.json({ ok: false, error: "path outside vault" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    path: resolved.path,
    frontmatter: resolved.frontmatter,
    body: resolved.content,
    links: linkContext(notes, resolved),
  });
}
