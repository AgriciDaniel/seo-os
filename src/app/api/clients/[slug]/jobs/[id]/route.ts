/**
 * GET /api/clients/[slug]/jobs/[id]
 *   → { ok: true, job: JobRecord }
 *   → { ok: false, error } with 404 if not found or wrong client
 *
 * Used by useSpecialistsStream to retrieve result_path after a
 * job_succeeded event fires on the SSE bus (the bus carries no artifact
 * path directly).
 */
import { NextRequest, NextResponse } from "next/server";
import { getJobForClient } from "@/lib/orchestrator/ownership";
import { getClient } from "@/lib/brain/index-db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  if (!getClient(slug)) {
    return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
  }
  const job = getJobForClient(id, slug);
  if (!job) {
    return NextResponse.json({ ok: false, error: "job not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, job });
}
