/**
 * POST /api/chat/attachments
 *   multipart/form-data with:
 *     - clientSlug: string
 *     - file: File (binary)
 *
 * Returns the AttachmentRecord (sha256, mime, size, preview_url, …) the
 * client can attach to a subsequent /api/chat POST as part of its
 * `attachments` array.
 *
 * Per CLAUDE.md hard rule #2 — files are stored under the vault root,
 * never elsewhere, and the route refuses uploads that don't carry a
 * known clientSlug.
 */
import { NextRequest, NextResponse } from "next/server";

import { getClient } from "@/lib/brain/index-db";
import {
  ALLOWED_MIME,
  MAX_ATTACHMENT_BYTES,
  saveAttachment,
} from "@/lib/agents/attachment-store";
import { sameOriginWriteAllowed } from "@/lib/http/same-origin";

export const dynamic = "force-dynamic";
// Multipart parsing relies on the Node runtime for Buffer support.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const allowed = sameOriginWriteAllowed(req);
  if (allowed !== true) return allowed;

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "expected multipart/form-data",
        error_code: "bad_request",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  const slug = String(form.get("clientSlug") ?? "").trim();
  if (!slug) {
    return NextResponse.json(
      { ok: false, error: "clientSlug is required", error_code: "bad_request" },
      { status: 400 },
    );
  }
  if (!getClient(slug)) {
    return NextResponse.json(
      { ok: false, error: "client not found", error_code: "not_found" },
      { status: 404 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "file is required", error_code: "bad_request" },
      { status: 400 },
    );
  }

  // Some browsers (and most drag-drop sources) tag files with the generic
  // `application/octet-stream` or an empty string — particularly common
  // for .md, .csv, and webp files. Infer from the extension when the
  // browser's MIME isn't in our allowlist before refusing.
  let mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(mime)) {
    const fromExt = inferMimeFromFilename(file.name);
    if (fromExt) mime = fromExt;
  }
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      {
        ok: false,
        error: `unsupported mime type: ${mime}`,
        error_code: "unsupported_media_type",
        allowed: [...ALLOWED_MIME],
      },
      { status: 415 },
    );
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `file too large: ${file.size} bytes`,
        error_code: "payload_too_large",
        max_bytes: MAX_ATTACHMENT_BYTES,
      },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const record = await saveAttachment(slug, buf, mime, file.name);
  return NextResponse.json({ ok: true, attachment: record });
}

/** Map a filename's extension to a MIME the allowlist recognises. Returns
 *  null when there's no extension or no mapping — caller falls through
 *  to the 415 rejection path. */
function inferMimeFromFilename(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "pdf":
      return "application/pdf";
    case "txt":
      return "text/plain";
    case "md":
    case "markdown":
      return "text/markdown";
    case "csv":
      return "text/csv";
    default:
      return null;
  }
}
