/**
 * GET  /api/clients/[slug]/tasks
 *   → { ok, tasks }  — all top-level Tasks (newest first), each as a Task row.
 *
 * POST /api/clients/[slug]/tasks
 *   body: CreateTaskInput shape (sans client_slug + request_id, both filled in)
 *   → { ok, task }
 *
 * The Tasks store is a tree; this endpoint creates a single node. Callers
 * planning a multi-step Task call this once per node, passing the
 * already-known IDs of dependencies in `blocked_on`.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { getClient } from "@/lib/brain/index-db";
import {
  CreateTaskInputZ,
  createTask,
  listChildren,
  mirrorTaskTreeToVault,
} from "@/lib/orchestrator/task";
import { sameOriginWriteAllowed } from "@/lib/http/same-origin";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!getClient(slug)) {
    return NextResponse.json(
      { ok: false, error: "client not found" },
      { status: 404 },
    );
  }
  const tasks = listChildren(slug, null);
  return NextResponse.json({ ok: true, tasks });
}

const PostBody = CreateTaskInputZ.partial({
  client_slug: true,
  request_id: true,
  parent_task_id: true,
  parent_message_id: true,
  specialist_id: true,
  payload: true,
  blocked_on: true,
}).extend({
  title: z.string().min(1).max(160),
  goal: z.string().min(1).max(4000),
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
  const parsed = PostBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.message },
      { status: 400 },
    );
  }
  const task = createTask({
    client_slug: slug,
    parent_task_id: parsed.data.parent_task_id ?? null,
    parent_message_id: parsed.data.parent_message_id ?? null,
    title: parsed.data.title,
    goal: parsed.data.goal,
    specialist_id: parsed.data.specialist_id ?? null,
    payload: parsed.data.payload ?? {},
    blocked_on: parsed.data.blocked_on ?? [],
    permission_mode: parsed.data.permission_mode,
    request_id: parsed.data.request_id ?? randomUUID(),
    kind: null,
    template_id: null,
  });
  // Mirror the root of the tree (or the task itself if it's a leaf) so
  // there's a markdown trace in the vault from the first node. Mirror
  // failures are non-fatal — the task row still exists.
  try {
    await mirrorTaskTreeToVault(parsed.data.parent_task_id ?? task.id);
  } catch {
    /* mirror failures non-fatal */
  }
  return NextResponse.json({ ok: true, task }, { status: 201 });
}
