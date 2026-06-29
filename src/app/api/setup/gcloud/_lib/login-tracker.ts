/**
 * Tracks the single in-flight `gcloud auth application-default login` subprocess
 * so the setup page can show "waiting for browser…" without spawning a duplicate.
 *
 * One flow at a time — gcloud's local-loopback OAuth server only binds one
 * port at a time, so concurrent logins would collide anyway.
 */
import "server-only";
import { loginAdc, revokeAdc, type SpawnResult } from "@/lib/integrations/gcloud";

// Matches the URL gcloud prints when it falls back to manual flow.
const OAUTH_URL_RE = /(https:\/\/accounts\.google\.com\/o\/oauth2\/auth\?[^\s"]+)/;

interface InFlight {
  startedAt: number;
  promise: Promise<SpawnResult>;
  /** Set once the subprocess exits. */
  result?: SpawnResult;
  /** OAuth URL gcloud printed (when browser auto-launch failed or when
   *  the user needs to paste it manually). Surfaced via /status so the
   *  setup card can show a clickable fallback. */
  oauthUrl?: string;
  /** AbortController for the subprocess. `.abort()` triggers the
   *  SIGTERM→SIGKILL cascade in spawnCapture so the user can kill a
   *  hung login (e.g. Google's consent screen rejected the OAuth
   *  client and gcloud is now waiting forever on the callback). */
  abortController: AbortController;
}

let inFlight: InFlight | null = null;

export function isLoginInFlight(): boolean {
  return inFlight != null && inFlight.result == null;
}

export function lastLoginResult(): SpawnResult | null {
  return inFlight?.result ?? null;
}

export function currentOauthUrl(): string | null {
  return inFlight?.oauthUrl ?? null;
}

/**
 * Starts an ADC login if one isn't already running. Returns immediately —
 * the caller is responsible for polling status.
 */
export function startLogin(): {
  started: boolean;
  inFlight: boolean;
  startedAt: number;
} {
  if (inFlight && inFlight.result == null) {
    return { started: false, inFlight: true, startedAt: inFlight.startedAt };
  }
  const startedAt = Date.now();
  const abortController = new AbortController();
  // Scrape the OAuth URL from the live subprocess stream so the UI can
  // offer a clickable fallback when gcloud's browser auto-launch fails.
  const captureUrl = (chunk: string) => {
    const m = chunk.match(OAUTH_URL_RE);
    if (m && inFlight) inFlight.oauthUrl = m[1];
  };
  const promise = loginAdc({
    onStdout: captureUrl,
    onStderr: captureUrl,
    signal: abortController.signal,
  })
    .then((r) => {
      if (inFlight) inFlight.result = r;
      // Last-ditch scrape from the full buffer in case the URL straddled
      // a chunk boundary.
      if (inFlight && !inFlight.oauthUrl) {
        const m = (r.stdout + "\n" + r.stderr).match(OAUTH_URL_RE);
        if (m) inFlight.oauthUrl = m[1];
      }
      return r;
    })
    .catch((err) => {
      const result: SpawnResult = {
        exitCode: -1,
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
      };
      if (inFlight) inFlight.result = result;
      return result;
    });
  inFlight = { startedAt, promise, abortController };
  return { started: true, inFlight: true, startedAt };
}

/**
 * Cancel the in-flight login subprocess. Returns `true` if there was
 * a live subprocess to kill, `false` if the slot was already empty.
 * The subprocess gets SIGTERM → SIGKILL via spawnCapture's grace
 * window, and the awaited promise resolves with a non-zero exit so
 * the status endpoint surfaces a "cancelled" lastLoginError.
 */
export function cancelLogin(): boolean {
  if (!inFlight || inFlight.result != null) return false;
  inFlight.abortController.abort();
  return true;
}

/** Best-effort signout that also clears any cached login result. */
export async function performSignout(): Promise<SpawnResult> {
  // If a login is mid-flight, kill it first so we don't leak a zombie
  // gcloud subprocess that would later spam stderr.
  if (inFlight && inFlight.result == null) {
    inFlight.abortController.abort();
  }
  inFlight = null;
  return revokeAdc();
}
