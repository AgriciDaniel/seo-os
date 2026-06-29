/**
 * GET    /api/assignments/[id]?slug=<client>    → { ok, assignment }
 * DELETE /api/assignments/[id]?slug=<client>    → cancel the assignment + linked job
 *
 * The `?slug=` query is required for client isolation: without it, a caller
 * who knows an assignment id could read or cancel another client's row.
 * `getAssignmentForClient()` returns null both for "missing" and "owned by
 * another client" — both map to 404 so we never leak "exists but not yours."
 */
import { NextRequest, NextResponse } from "next/server";

import {
  mirrorAssignmentToVault,
  updateStatus,
} from "@/lib/orchestrator/assignment";
import { cancelJob } from "@/lib/orchestrator/job-queue";
import { getAssignmentForClient } from "@/lib/orchestrator/ownership";
import { sameOriginWriteAllowed } from "@/lib/http/same-origin";

export const dynamic = "force-dynamic";

function requireSlug(req: NextRequest): string | NextResponse {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) {
    return NextResponse.json(
      { ok: false, error: "slug query param is required" },
      { status: 400 },
    );
  }
  return slug;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const slugOrError = requireSlug(req);
  if (slugOrError instanceof NextResponse) return slugOrError;
  const { id } = await params;
  const assignment = getAssignmentForClient(id, slugOrError);
  if (!assignment) {
    return NextResponse.json(
      { ok: false, error: "assignment not found" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, assignment });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const allowed = sameOriginWriteAllowed(req);
  if (allowed !== true) return allowed;

  const slugOrError = requireSlug(req);
  if (slugOrError instanceof NextResponse) return slugOrError;
  const slug = slugOrError;
  const { id } = await params;
  const assignment = getAssignmentForClient(id, slug);
  if (!assignment) {
    return NextResponse.json(
      { ok: false, error: "assignment not found" },
      { status: 404 },
    );
  }

  // If a job is running, cancel it first so the runner stops streaming
  // events before we mutate the assignment row. cancelJob takes the slug
  // so it can't be misused to cancel another client's job.
  if (assignment.job_id) {
    try {
      cancelJob(assignment.job_id, slug);
    } catch {
      /* best-effort */
    }
  }

  const updated =
    updateStatus(id, "cancelled", "cancelled by user") ?? assignment;
  await mirrorAssignmentToVault(updated);
  return NextResponse.json({ ok: true, assignment: updated });
}
