/**
 * GET /api/brain/file?slug=<client>&path=<vault-relative-path>
 *
 * Streams the RAW bytes of a vault file with a content-type guessed from the
 * extension. Used by the file viewer window for non-markdown formats
 * (`.txt`, `.html`, `.pdf`, `.png`, …). Markdown notes go through
 * `/api/brain/note` instead because that endpoint enriches them with parsed
 * frontmatter + link context.
 *
 * Path safety: `resolveVaultRelative()` rejects absolute paths and `..`
 * escapes; only paths inside `<vault>/` resolve.
 */
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { resolveVaultRelative } from "@/lib/brain/paths";
import { getClient } from "@/lib/brain/index-db";
import { ClientSlug } from "@/lib/brain/types";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  // text family
  ".md": "text/markdown; charset=utf-8",
  ".markdown": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".tsv": "text/tab-separated-values; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  // image family
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  // audio family — Phase B
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  // video family — Phase B
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  // office docs — Phase C (served as binary; client converts in-browser)
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  // archives — Phase D
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".tgz": "application/gzip",
  // misc
  ".epub": "application/epub+zip",
};

// Cap inline preview at 20MB. Larger files still download via the same
// endpoint when the user follows the explicit download link; the cap only
// protects the polymorphic NoteWindow from accidentally trying to render a
// 500MB video buffered in memory.
const MAX_INLINE_BYTES = 20 * 1024 * 1024;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const relativePath = url.searchParams.get("path");
  if (!slug || !relativePath) {
    return NextResponse.json(
      { ok: false, error: "slug and path are required" },
      { status: 400 },
    );
  }
  const parsedSlug = ClientSlug.safeParse(slug);
  if (!parsedSlug.success || !getClient(parsedSlug.data)) {
    return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
  }

  let absolute: string;
  try {
    absolute = resolveVaultRelative(parsedSlug.data, relativePath);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "invalid path" },
      { status: 400 },
    );
  }
  const stat = fs.existsSync(absolute) ? fs.statSync(absolute) : null;
  if (!stat || !stat.isFile()) {
    return NextResponse.json({ ok: false, error: "file not found" }, { status: 404 });
  }

  // The `inline=1` query bypasses the size cap — used by the explicit
  // "download anyway" link inside the viewer's fallback state.
  const force = url.searchParams.get("inline") === "1";
  if (!force && stat.size > MAX_INLINE_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `file is ${(stat.size / 1024 / 1024).toFixed(1)}MB, exceeds ${MAX_INLINE_BYTES / 1024 / 1024}MB inline-preview cap. Append &inline=1 to force.`,
        size: stat.size,
        cap: MAX_INLINE_BYTES,
      },
      { status: 413 },
    );
  }

  const ext = path.extname(absolute).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
  const bytes = fs.readFileSync(absolute);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=5",
      "Content-Disposition": `inline; filename="${path.basename(absolute).replace(/[^A-Za-z0-9._-]/g, "_")}"`,
    },
  });
}
