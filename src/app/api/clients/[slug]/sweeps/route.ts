/**
 * POST /api/clients/[slug]/sweeps
 *   Body: { template_id?: string; permission_mode?: PermissionMode }
 *   → { ok, rootTaskId, dispatched, skipped, templateId }
 *
 * The button path for the "Build the brain" CTA on /clients/new — and any
 * future surface that wants to start a sweep without going through the
 * orchestrator chat. Routes through the same `dispatchPlanTree` codepath
 * as the chat tool call so behaviour stays consistent.
 *
 * `template_id` defaults to `"build-brain"` so the simple
 * `POST /api/clients/<slug>/sweeps` with an empty body just works.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getClient } from "@/lib/brain/index-db";
import { dispatchPlanTree } from "@/lib/orchestrator/dispatch";
import { getCurrentSweep } from "@/lib/orchestrator/sweeps";
import { appendTurn } from "@/lib/agents/chat-store";
import { randomUUID } from "node:crypto";
import { sameOriginWriteAllowed } from "@/lib/http/same-origin";
import "@/lib/specialists"; // ensure registry is populated

export const dynamic = "force-dynamic";

const StartSweepBody = z.object({
  template_id: z.literal("build-brain").default("build-brain"),
  permission_mode: z
    .enum(["read_only", "auto", "full_access"])
    .default("auto"),
  /** When set to "button", we also write a synthetic `role: "user"` chat
   *  turn ("build the brain") to the orchestrator thread before dispatch
   *  so the chat shows the prompt as if the user had typed it. The
   *  kickoff narration writes the assistant reply right after.
   *  Omit (default) for tool-call / API-only paths — the chat won't be
   *  pre-populated and the kickoff narration handles all messaging. */
  from: z.enum(["button", "tool", "api"]).optional(),
  /** Force a full rebuild: re-run every child even if its artifact is
   *  already current. Default (false) lets the Secretary skip current work
   *  and refresh only what's stale or missing. */
  force: z.boolean().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const allowed = sameOriginWriteAllowed(req);
  if (allowed !== true) return allowed;

  const { slug } = await params;
  if (!getClient(slug)) {
    return NextResponse.json(
      { ok: false, error: "client not found" },
      { status: 404 },
    );
  }

  // Body is optional; default to build-brain + auto if absent.
  let rawBody: unknown = {};
  try {
    rawBody = await req.json();
  } catch {
    /* empty / non-JSON body — keep defaults */
  }
  const parsed = StartSweepBody.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.message },
      { status: 400 },
    );
  }

  try {
    const summary = await dispatchPlanTree({
      clientSlug: slug,
      permissionMode: parsed.data.permission_mode,
      toolInput: {
        template_id: parsed.data.template_id,
        permission_mode: parsed.data.permission_mode,
        ...(parsed.data.force ? { force: true } : {}),
      },
    });
    // Button path — write the synthetic user turn only after dispatch
    // succeeds. This avoids orphan "build the brain" prompts when a
    // double-click hits an active sweep lock or a preflight check fails.
    if (parsed.data.from === "button") {
      await appendTurn(slug, "orchestrator", {
        id: randomUUID(),
        role: "user",
        content: "build the brain",
        ts: new Date().toISOString(),
        mode: "simple",
      }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, ...summary }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("sweep_already_running:")) {
      const current = await getCurrentSweep(slug).catch(() => null);
      return NextResponse.json(
        {
          ok: true,
          existing: true,
          error: message,
          rootTaskId: current?.root_task_id ?? null,
          sweep: current,
        },
        { status: 202 },
      );
    }
    return NextResponse.json(
      { ok: false, error: message },
      { status: 400 },
    );
  }
}
