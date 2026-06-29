/**
 * GET  /api/setup/gcloud/projects        — list user's GCP projects
 * POST /api/setup/gcloud/projects        — { projectId } sets the ADC quota project
 *
 * GA4 and other Analytics APIs charge their quota against this project, so
 * the user needs at least one for non-trivial usage. Search Console does
 * not require one for read-only calls.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listProjects, setQuotaProject } from "@/lib/integrations/gcloud";
import { sameOriginSetupWriteAllowed } from "@/lib/http/same-origin";

export const dynamic = "force-dynamic";

const Body = z.object({ projectId: z.string().min(1).max(80) });

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({ ok: true, projects });
}

export async function POST(req: NextRequest) {
  const allowed = sameOriginSetupWriteAllowed(req);
  if (allowed !== true) return allowed;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.message },
      { status: 400 },
    );
  }
  const result = await setQuotaProject(parsed.data.projectId);
  if (result.exitCode !== 0) {
    return NextResponse.json(
      {
        ok: false,
        error: result.stderr.trim() || `gcloud exited ${result.exitCode}`,
      },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, projectId: parsed.data.projectId });
}
