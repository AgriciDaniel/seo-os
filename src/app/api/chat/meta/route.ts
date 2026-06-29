/**
 * GET  /api/chat/meta?slug=&target=
 *   → { ok: true, meta: ChatMeta }
 *
 * PUT  /api/chat/meta
 *   body: { clientSlug, target, permission_mode? }
 *   → { ok: true, meta: ChatMeta }
 *
 * Per-conversation metadata: today this is just the active permission_mode
 * (Pillar 4). The chat route reads it before each model call so the
 * Orchestrator's assign_task tool gets the right default. The ChatPanel
 * UI reads + writes through here so the user's pick survives a refresh.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { readChatMeta, writeChatMeta } from "@/lib/agents/chat-meta";
import { getClient } from "@/lib/brain/index-db";
import { ClientSlug } from "@/lib/brain/types";
import { PermissionModeZ } from "@/lib/orchestrator/assignment";
import { sameOriginWriteAllowed } from "@/lib/http/same-origin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
  const meta = await readChatMeta(parsedSlug.data, target);
  return NextResponse.json({ ok: true, meta });
}

const PutBody = z.object({
  clientSlug: z.string().min(1),
  target: z.string().min(1),
  permission_mode: PermissionModeZ.optional(),
  /** Empty string / null resets to the provider default. */
  model: z.union([z.string().max(120), z.null()]).optional(),
  thinking: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  const allowed = sameOriginWriteAllowed(req);
  if (allowed !== true) return allowed;

  const parsed = PutBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.message },
      { status: 400 },
    );
  }
  const parsedSlug = ClientSlug.safeParse(parsed.data.clientSlug);
  if (!parsedSlug.success || !getClient(parsedSlug.data)) {
    return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
  }
  const meta = await writeChatMeta(parsedSlug.data, parsed.data.target, {
    permission_mode: parsed.data.permission_mode,
    model: parsed.data.model,
    thinking: parsed.data.thinking,
  });
  return NextResponse.json({ ok: true, meta });
}
