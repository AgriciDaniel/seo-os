/**
 * POST /api/setup/gcloud/login
 *
 * Kicks off `gcloud auth application-default login`. The subprocess opens
 * the user's browser, runs a local-loopback OAuth callback server, and
 * writes ADC creds when the user authorizes. We return 202 immediately —
 * the UI polls /api/setup/gcloud/status until adcValid flips to true.
 */
import { NextResponse } from "next/server";
import { startLogin } from "@/app/api/setup/gcloud/_lib/login-tracker";
import { sameOriginSetupWriteAllowed } from "@/lib/http/same-origin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const allowed = sameOriginSetupWriteAllowed(req);
  if (allowed !== true) return allowed;

  const state = startLogin();
  return NextResponse.json(
    {
      ok: true,
      ...state,
      message: state.started
        ? "Browser opened. Authorize the OAuth consent screen to finish sign-in."
        : "A login is already in progress. Watch for the browser tab.",
    },
    { status: 202 },
  );
}
