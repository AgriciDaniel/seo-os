import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enqueue, listJobs } from "@/lib/orchestrator/job-queue";
import { getClient } from "@/lib/brain/index-db";
import { sameOriginWriteAllowed } from "@/lib/http/same-origin";
import "@/lib/specialists"; // ensure registry is populated

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!getClient(slug)) {
    return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
  }
  return NextResponse.json({ jobs: listJobs(slug, 30) });
}

const EnqueueBody = z.object({
  specialist: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
  /** Optional idempotency key. Repeated POSTs with the same (slug,
   *  request_id) collapse onto the existing row instead of spawning a
   *  duplicate runner. */
  request_id: z.string().min(1).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const allowed = sameOriginWriteAllowed(req);
  if (allowed !== true) return allowed;

  const { slug } = await params;
  if (!getClient(slug)) {
    return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
  }
  const parsed = EnqueueBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }
  const job = await enqueue({
    client_slug: slug,
    specialist: parsed.data.specialist,
    payload: parsed.data.payload,
    request_id: parsed.data.request_id,
  });
  return NextResponse.json({ ok: true, job }, { status: 202 });
}
