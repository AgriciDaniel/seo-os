/**
 * POST /api/clients/[slug]/tasks/[id]/run
 *   → { ok, summary }   where summary = { rootTaskId, dispatched[], alreadyTerminal, unchanged }
 *
 * Kicks off the task-runner against an existing Task subtree. Returns
 * immediately after the initial fan-out — subsequent unblocked leaves
 * dispatch automatically as their dependencies finish (the runner
 * subscribes to job events internally).
 *
 * Safe to call multiple times. Re-runs idempotently re-dispatch only
 * the Tasks still in `planned` state; rows already mid-flight or
 * terminal are left alone (idempotency keyed on `task:<task_id>` in the
 * Assignment + Job request_id).
 *
 * Client isolation: the slug from the URL must match the task's
 * `client_slug`. Mismatch → 404 (never "exists but not yours").
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getClient } from "@/lib/brain/index-db";
import { getTaskForClient } from "@/lib/orchestrator/ownership";
import {
  runTaskTree,
  settleTaskTreeIfTerminal,
} from "@/lib/orchestrator/task-runner";
import { sameOriginWriteAllowed } from "@/lib/http/same-origin";
import "@/lib/specialists"; // populate runtime registry

export const dynamic = "force-dynamic";

const Body = z.object({
  retryFailed: z.boolean().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const allowed = sameOriginWriteAllowed(req);
  if (allowed !== true) return allowed;

  const { slug, id } = await params;
  if (!getClient(slug)) {
    return NextResponse.json(
      { ok: false, error: "client not found" },
      { status: 404 },
    );
  }
  // Ownership guard: refuse to run a task that doesn't belong to the
  // URL's client. Returns null both for "no such task" and "task belongs
  // to another client" — both map to 404 here.
  const task = getTaskForClient(id, slug);
  if (!task) {
    return NextResponse.json(
      { ok: false, error: "task not found" },
      { status: 404 },
    );
  }
  try {
    const body = Body.safeParse(await req.json().catch(() => ({})));
    const summary = await runTaskTree(id, {
      retryFailed: body.success ? body.data.retryFailed === true : false,
    });
    await settleTaskTreeIfTerminal(id);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
