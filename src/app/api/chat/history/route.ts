import { NextResponse } from "next/server";
import { clearHistory, readHistory } from "@/lib/agents/chat-store";
import { getClient } from "@/lib/brain/index-db";
import { ClientSlug } from "@/lib/brain/types";
import { sameOriginWriteAllowed } from "@/lib/http/same-origin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const target = url.searchParams.get("target");
  // Optional ISO timestamp; returns only turns with ts > since. Used by
  // ChatPanel's live-refresh poll during a sweep so we don't re-ship the
  // whole history every 3 seconds.
  const since = url.searchParams.get("since") ?? undefined;
  if (!slug || !target) {
    return NextResponse.json(
      { ok: false, error: "slug and target are required" },
      { status: 400 },
    );
  }
  const parsedSlug = ClientSlug.safeParse(slug);
  if (!parsedSlug.success || !getClient(parsedSlug.data)) {
    return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
  }
  const turns = await readHistory(parsedSlug.data, target, since ? { since } : undefined);
  return NextResponse.json({ ok: true, turns });
}

/**
 * DELETE /api/chat/history?slug=&target=
 *   → { ok: true, cleared: true }
 *
 * Wipes the per-target JSONL file. Content-addressed attachments are
 * NOT removed — they're keyed by sha256 and may be referenced by other
 * conversations or future turns. The user can clean up unused
 * attachments separately.
 */
export async function DELETE(req: Request) {
  const allowed = sameOriginWriteAllowed(req);
  if (allowed !== true) return allowed;

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const target = url.searchParams.get("target");
  if (!slug || !target) {
    return NextResponse.json(
      { ok: false, error: "slug and target are required" },
      { status: 400 },
    );
  }
  const parsedSlug = ClientSlug.safeParse(slug);
  if (!parsedSlug.success || !getClient(parsedSlug.data)) {
    return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
  }
  await clearHistory(parsedSlug.data, target);
  return NextResponse.json({ ok: true, cleared: true });
}
