/**
 * POST /api/setup/gcloud/cancel
 *
 * Kills the in-flight `gcloud auth application-default login` subprocess.
 *
 * Why this is useful: when Google's OAuth consent screen rejects the
 * grant ("This app is blocked" — typically because gcloud's default
 * OAuth client is blocked from sensitive scopes for the user's account),
 * the gcloud subprocess sits on its local-loopback callback server
 * waiting for a redirect that will never arrive. Without a cancel hook
 * the user has to wait 5 minutes for LOGIN_TIMEOUT_MS to fire or
 * restart the dev server — both poor UX.
 *
 * Calling abort triggers spawnCapture's SIGTERM → SIGKILL cascade, the
 * subprocess exits with a non-zero code, and the next /status poll
 * surfaces "cancelled" via lastLoginError so the UI can flip back to
 * "needs sign-in".
 */
import { NextResponse } from "next/server";
import { cancelLogin } from "@/app/api/setup/gcloud/_lib/login-tracker";
import { sameOriginSetupWriteAllowed } from "@/lib/http/same-origin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const allowed = sameOriginSetupWriteAllowed(req);
  if (allowed !== true) return allowed;

  const cancelled = cancelLogin();
  return NextResponse.json({ ok: true, cancelled });
}
