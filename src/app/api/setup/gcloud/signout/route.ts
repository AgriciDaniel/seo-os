/**
 * POST /api/setup/gcloud/signout
 *
 * Revokes ADC credentials via `gcloud auth application-default revoke`.
 * Also clears the in-process token cache so the next specialist call
 * surfaces a 401 cleanly.
 */
import { NextResponse } from "next/server";
import { performSignout } from "@/app/api/setup/gcloud/_lib/login-tracker";
import { invalidateAdcCache } from "@/lib/integrations/google-adc";
import { sameOriginSetupWriteAllowed } from "@/lib/http/same-origin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const allowed = sameOriginSetupWriteAllowed(req);
  if (allowed !== true) return allowed;

  const r = await performSignout();
  invalidateAdcCache();
  if (r.exitCode !== 0) {
    return NextResponse.json(
      {
        ok: false,
        error: r.stderr.trim() || `gcloud exited ${r.exitCode}`,
      },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
