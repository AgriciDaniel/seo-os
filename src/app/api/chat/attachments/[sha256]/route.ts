/**
 * GET /api/chat/attachments/[sha256]?slug=<clientSlug>[&download=1]
 *
 * Streams a single attachment back with its correct Content-Type. With
 * ?download=1 we set Content-Disposition: attachment so the browser
 * triggers a download instead of inlining.
 *
 * The sha256 path segment is validated against /^[0-9a-f]{64}$/ inside
 * the storage helper, so traversal attempts (`../foo`) are rejected
 * before any filesystem call.
 */
import { NextRequest, NextResponse } from "next/server";

import { getClient } from "@/lib/brain/index-db";
import { readAttachment } from "@/lib/agents/attachment-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sha256: string }> },
) {
  const { sha256 } = await params;
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json(
      { ok: false, error: "slug query param is required" },
      { status: 400 },
    );
  }
  if (!getClient(slug)) {
    return NextResponse.json(
      { ok: false, error: "client not found" },
      { status: 404 },
    );
  }

  const result = await readAttachment(slug, sha256);
  if (!result) {
    return NextResponse.json(
      { ok: false, error: "attachment not found" },
      { status: 404 },
    );
  }

  const wantsDownload = url.searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": result.record.mime,
    "Content-Length": String(result.record.size),
    // Content-addressed → safe to cache aggressively. The sha256 in the
    // URL is its own version pin.
    "Cache-Control": "private, max-age=31536000, immutable",
  };
  if (wantsDownload) {
    headers["Content-Disposition"] = `attachment; filename="${result.record.filename}"`;
  }
  return new NextResponse(new Uint8Array(result.buffer), { headers });
}
