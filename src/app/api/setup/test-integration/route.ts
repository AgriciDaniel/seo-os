/**
 * POST /api/setup/test-integration
 *
 * Body: { id: string, values?: Record<envName, string> }
 *
 * Makes one cheap free-tier call against the integration's API to verify
 * the credentials work. Values from `values` (the unsaved form state) take
 * precedence over process.env so the user can paste-and-test before saving.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { testIntegration } from "@/lib/integrations/testers";
import { sameOriginSetupWriteAllowed } from "@/lib/http/same-origin";

const Body = z.object({
  id: z.string(),
  values: z.record(z.string(), z.string()).optional(),
});

export const dynamic = "force-dynamic";

function setupError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function POST(req: NextRequest) {
  const allowed = sameOriginSetupWriteAllowed(req);
  if (allowed !== true) return allowed;

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.message },
      { status: 400 },
    );
  }
  const { id, values = {} } = parsed.data;
  try {
    const result = await testIntegration(id, values);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: setupError(err) },
      { status: 500 },
    );
  }
}
