/**
 * POST /api/assignments/[id]/approve?slug=<client>
 *
 * Transitions a `proposed` Assignment into the live job queue. Used by
 * the Specialist Inbox UI when the user clicks Approve on a Plan-mode
 * dispatch. Idempotent on retries (subsequent calls find the assignment
 * already linked to a job and return that instead of double-enqueueing).
 *
 * `?slug=` is required: without it, anyone who knows an assignment id
 * could approve and execute another client's job. We treat unknown
 * (id, slug) pairs as 404, same as the GET/DELETE routes.
 */
import { NextRequest, NextResponse } from "next/server";

import {
  linkJob,
  mirrorAssignmentToVault,
  updateStatus,
} from "@/lib/orchestrator/assignment";
import { enqueue, getJob } from "@/lib/orchestrator/job-queue";
import { getAssignmentForClient } from "@/lib/orchestrator/ownership";
import { sameOriginWriteAllowed } from "@/lib/http/same-origin";
import "@/lib/specialists"; // ensure runtime registry is populated

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const allowed = sameOriginWriteAllowed(req);
  if (allowed !== true) return allowed;

  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) {
    return NextResponse.json(
      { ok: false, error: "slug query param is required" },
      { status: 400 },
    );
  }
  const { id } = await params;
  const assignment = getAssignmentForClient(id, slug);
  if (!assignment) {
    return NextResponse.json(
      { ok: false, error: "assignment not found" },
      { status: 404 },
    );
  }

  // Already approved + queued? Return the current state — the UI may be
  // retrying after a network blip and we don't want a duplicate job.
  if (assignment.job_id) {
    const job = getJob(assignment.job_id);
    return NextResponse.json({ ok: true, assignment, job });
  }

  // Only `proposed` and `blocked` assignments can be approved. Terminal
  // statuses (succeeded/failed/cancelled) and live ones (queued/running)
  // reject loudly so the UI can show a useful error.
  if (assignment.status !== "proposed" && assignment.status !== "blocked") {
    return NextResponse.json(
      {
        ok: false,
        error: `cannot approve assignment in status '${assignment.status}'`,
      },
      { status: 409 },
    );
  }

  const queued = updateStatus(id, "queued") ?? assignment;
  await mirrorAssignmentToVault(queued);

  const job = await enqueue({
    client_slug: assignment.client_slug,
    specialist: assignment.specialist_id,
    payload: assignment.payload,
    // Idempotency: reuse the assignment's request_id so a duplicated POST
    // collapses onto the same job row.
    request_id: assignment.request_id,
  });

  const linked = linkJob(id, job.id) ?? queued;
  await mirrorAssignmentToVault(linked);

  return NextResponse.json({ ok: true, assignment: linked, job });
}
