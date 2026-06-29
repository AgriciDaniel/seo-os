/**
 * GET /api/brain/graph?slug=<client>
 *
 * Returns a knowledge graph derived from the vault: every note is a node,
 * every wikilink in a note's `related` frontmatter field is a directed
 * edge. Powers the right-pane Graph tab.
 *
 * Edge resolution: wikilinks are by title. If two notes share a title
 * (rare in our schema), the edge points at the first match. Dangling links
 * (no matching note) are dropped — the UI only renders edges that resolve.
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

interface Node {
  id: string;          // relative path
  title: string;
  type: string;
  status: string;
  confidence: string | null;
}

interface Edge {
  source: string;
  target: string;
  kind: "related" | "sources";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ ok: false, error: "slug is required" }, { status: 400 });
  }
  const parsedSlug = ClientSlug.safeParse(slug);
  if (!parsedSlug.success || !getClient(parsedSlug.data)) {
    return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
  }

  const wikiRoot = path.join(vaultRoot(parsedSlug.data), "wiki");
  if (!fs.existsSync(wikiRoot)) {
    return NextResponse.json({ ok: true, nodes: [], edges: [] });
  }

  const nodes: Node[] = [];
  const titleToId = new Map<string, string>();
  const rawRelations: Array<{ from: string; to: string; kind: Edge["kind"] }> = [];

  await walk(wikiRoot, wikiRoot, async (rel) => {
    const note = await readNote(parsedSlug.data, `wiki/${rel}`).catch(() => null);
    if (!note) return;
    const fm = note.frontmatter;
    if (!fm.title || !fm.type || !fm.status) return;
    const id = `wiki/${rel}`;
    nodes.push({
      id,
      title: fm.title,
      type: fm.type,
      status: fm.status,
      confidence: fm.confidence ?? null,
    });
    titleToId.set(fm.title, id);
    for (const link of fm.related ?? []) {
      const t = extractWikilinkTitle(link);
      if (t) rawRelations.push({ from: id, to: t, kind: "related" });
    }
    for (const link of fm.sources ?? []) {
      const t = extractWikilinkTitle(link);
      if (t) rawRelations.push({ from: id, to: t, kind: "sources" });
    }
  });

  const edges: Edge[] = [];
  for (const r of rawRelations) {
    const target = titleToId.get(r.to);
    if (target && target !== r.from) {
      edges.push({ source: r.from, target, kind: r.kind });
    }
  }

  return NextResponse.json({ ok: true, nodes, edges });
}

async function walk(
  root: string,
  dir: string,
  visit: (rel: string) => Promise<void>,
): Promise<void> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "_attachments") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(root, abs, visit);
      continue;
    }
    if (!entry.name.endsWith(".md")) continue;
    try {
      await visit(path.relative(root, abs).replaceAll(path.sep, "/"));
    } catch {
      /* ignore */
    }
  }
}

function extractWikilinkTitle(link: string): string | null {
  // Accepts "[[Title]]", "[[Title|alias]]", "[[Title#anchor]]"
  const m = link.match(/\[\[([^\]|#]+?)(?:[|#][^\]]*)?\]\]/);
  return m ? m[1].trim() : null;
}
