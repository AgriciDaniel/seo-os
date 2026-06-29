/**
 * GET /api/setup/gcloud/status
 *
 * Composite status the setup card needs to render:
 *   - is gcloud installed
 *   - are ADC creds present + valid
 *   - which scopes were granted
 *   - whether scopes came from the ADC file or the live access token
 *   - is a login flow currently in flight
 *   - which APIs (search console, ga4) are unlocked by the granted scopes
 */
import { NextResponse } from "next/server";
import {
  byoOauthClientAvailable,
  byoOauthClientPath,
  detectGcloud,
  getAuthStatus,
  SCOPE,
  adcAvailableSync,
} from "@/lib/integrations/gcloud";
import {
  currentOauthUrl,
  isLoginInFlight,
  lastLoginResult,
} from "@/app/api/setup/gcloud/_lib/login-tracker";
import { invalidateAdcCache } from "@/lib/integrations/google-adc";

export const dynamic = "force-dynamic";

/**
 * Normalise Node's `process.platform` enum to user-friendly OS labels.
 * This is a local-first app — the server is the user's machine, so
 * `process.platform` is canonical here in a way it never is in
 * conventional web apps. The "other" bucket covers FreeBSD, OpenBSD,
 * SunOS, and AIX (rare but real for some self-hosters).
 */
function detectPlatform(): "linux" | "macos" | "windows" | "other" {
  switch (process.platform) {
    case "linux":
      return "linux";
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    default:
      return "other";
  }
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "setup endpoints are disabled in production builds" },
      { status: 403 },
    );
  }

  const detect = await detectGcloud();
  if (!detect.installed) {
    return NextResponse.json({
      installed: false,
      error: detect.error,
      adcValid: false,
      loginInFlight: isLoginInFlight(),
      scopes: [],
      apis: { searchConsole: false, ga4: false },
      byoOauthClient: {
        configured: byoOauthClientPath() != null,
        present: byoOauthClientAvailable(),
        path: byoOauthClientPath(),
      },
      platform: detectPlatform(),
    });
  }

  const auth = await getAuthStatus();
  const inFlight = isLoginInFlight();
  const last = lastLoginResult();

  // If a login completed successfully after our last poll, clear the cached
  // access token so the next specialist call uses the fresh creds.
  if (last && last.exitCode === 0 && adcAvailableSync()) {
    invalidateAdcCache();
  }

  return NextResponse.json({
    installed: true,
    version: detect.version,
    path: detect.path,
    account: auth.account,
    quotaProject: auth.quotaProject,
    adcValid: auth.adcValid,
    scopes: auth.scopes,
    scopeSource: auth.scopeSource,
    loginInFlight: inFlight,
    loginUrl: inFlight ? currentOauthUrl() : null,
    lastLoginError:
      last && last.exitCode !== 0
        ? (last.stderr.trim() || `exit ${last.exitCode}`).slice(0, 400)
        : null,
    apis: {
      searchConsole:
        auth.adcValid &&
        (auth.scopeSource === "unknown" || auth.scopes.includes(SCOPE.searchConsole)),
      ga4:
        auth.adcValid &&
        (auth.scopeSource === "unknown" || auth.scopes.includes(SCOPE.ga4)),
    },
    byoOauthClient: {
      configured: byoOauthClientPath() != null,
      present: byoOauthClientAvailable(),
      path: byoOauthClientPath(),
    },
    platform: detectPlatform(),
  });
}
