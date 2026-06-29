/**
 * GET /api/clients/[slug]/specialists/[id]/assignments
 *   → { ok, assignments: Assignment[] }
 *
 * The Specialist Inbox UI calls this on mount to populate the assignment
 * list. Newest first, capped at 50 rows by default. Filter by status
 * with `?status=proposed,queued,running` (comma-separated).
 */
import { NextRequest, NextResponse } from "next/server";

import { getClient } from "@/lib/brain/index-db";
import {
  AssignmentStatusZ,
  listForSpecialist,
  type AssignmentStatus,
} from "@/lib/orchestrator/assignment";
import { getTask } from "@/lib/orchestrator/task";
import { readNote } from "@/lib/brain/vault-fs";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  if (!getClient(slug)) {
    return NextResponse.json(
      { ok: false, error: "client not found" },
      { status: 404 },
    );
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  let statuses: AssignmentStatus[] | undefined;
  if (statusParam) {
    const parsed = statusParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => AssignmentStatusZ.safeParse(s))
      .filter((r) => r.success)
      .map((r) => (r as { success: true; data: AssignmentStatus }).data);
    if (parsed.length > 0) statuses = parsed;
  }

  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Math.min(Math.max(Number.parseInt(limitRaw, 10) || 50, 1), 200) : 50;

  const assignments = listForSpecialist(slug, id, { statuses, limit });

  // Enrich each assignment with the matching Task's result paths so the
  // Specialist Inbox can render "Open output" / "Open report" affordances
  // without a second round-trip. Assignments dispatched via the task-runner
  // carry `request_id` as `task:<task.id>`; retries append
  // `:retry:<run.id>`. Legacy single-shot assignments return unchanged.
  const enriched = await Promise.all(assignments.map(async (a) => {
    const m = /^task:([0-9a-f-]{36})(?::retry:[0-9a-f-]{36})?$/i.exec(
      a.request_id,
    );
    if (!m) return a;
    const task = getTask(m[1]);
    if (!task) return a;
    const artifactMeta = task.result_path
      ? await artifactMetadata(slug, task.result_path)
      : null;
    return {
      ...a,
      result_path: task.result_path,
      result_report_path: task.result_report_path,
      result_data_path: task.result_data_path,
      artifact: artifactMeta,
    };
  }));

  return NextResponse.json({ ok: true, assignments: enriched });
}

async function artifactMetadata(clientSlug: string, resultPath: string) {
  try {
    const note = await readNote(clientSlug, resultPath);
    if (!note) return null;
    return {
      title: note.frontmatter.title,
      confidence: note.frontmatter.confidence ?? null,
      approval_status: note.frontmatter.approval_status ?? null,
      risk_level: note.frontmatter.risk_level ?? null,
      data_sources: note.frontmatter.data_sources ?? null,
    };
  } catch {
    return null;
  }
}
