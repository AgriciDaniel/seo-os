/**
 * Application Default Credentials (ADC) bearer-token helper.
 *
 * Pattern: gcloud handles the OAuth dance; we ask it for a fresh access
 * token whenever a specialist needs one. Tokens live ~60 minutes — we
 * cache for 55 minutes in-process to avoid spawning gcloud on every call.
 *
 * `withAdcToken` is the recommended entry point: it transparently retries
 * once on 401, invalidating the cache so the next call re-spawns gcloud.
 * Specialists never see token rotation directly.
 */
import "server-only";
import { printAccessToken } from "./gcloud";

interface TokenCache {
  token: string;
  expiresAt: number;
}

let cache: TokenCache | null = null;

const TTL_MS = 55 * 60 * 1_000; // 55 minutes

export function invalidateAdcCache(): void {
  cache = null;
}

export async function getAdcAccessToken(): Promise<string> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.token;
  const token = await printAccessToken();
  cache = { token, expiresAt: now + TTL_MS };
  return token;
}

/**
 * Run `fn` with a fresh access token. If `fn` reports a 401, invalidate the
 * cache and try once more — this covers tokens that were revoked mid-flight
 * or rotated by gcloud due to scope changes.
 *
 * `fn` should throw an Error with a message containing "401" (or call
 * `invalidateAdcCache()` itself) to opt into the retry. The default Fetch
 * usage below already does this.
 */
export async function withAdcToken<T>(
  fn: (token: string) => Promise<T>,
): Promise<T> {
  const token = await getAdcAccessToken();
  try {
    return await fn(token);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/\b401\b/.test(msg)) {
      invalidateAdcCache();
      const fresh = await getAdcAccessToken();
      return fn(fresh);
    }
    throw err;
  }
}

/**
 * Thin fetch wrapper that adds the ADC bearer header and surfaces non-2xx
 * responses as Errors whose message includes the status code (so withAdcToken
 * can detect 401 and retry).
 */
export async function adcFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  return withAdcToken(async (token) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    const res = await fetch(url, { ...init, headers });
    if (res.status === 401) {
      // Read body so it isn't dangling, then throw to trigger one retry.
      const body = await res.text().catch(() => "");
      throw new Error(`ADC fetch returned 401${body ? `: ${body.slice(0, 200)}` : ""}`);
    }
    return res;
  });
}

/**
 * Convenience JSON helper: throws on non-2xx with a useful error message.
 * Use this from specialists that just want the parsed body.
 */
export async function adcFetchJson<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await adcFetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${init.method ?? "GET"} ${url} → HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
    );
  }
  return (await res.json()) as T;
}
