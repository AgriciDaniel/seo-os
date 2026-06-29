/**
 * DataForSEO HTTP client. Node port of marketing-brain's `_dfs_client.py`.
 *
 * - HTTP Basic Auth (login + password from env)
 * - JSON POST to api.dataforseo.com
 * - Returns parsed JSON + actual cost (DataForSEO reports cost per response)
 * - Fail-fast on missing creds: throws early instead of making an unauth'd call.
 */
import "server-only";
import { envValue } from "@/lib/setup/env-local";

const BASE_URL = "https://api.dataforseo.com";

export function isConfigured(): boolean {
  return Boolean(envValue("DATAFORSEO_LOGIN") && envValue("DATAFORSEO_PASSWORD"));
}

function authHeader(): string {
  const login = envValue("DATAFORSEO_LOGIN");
  const password = envValue("DATAFORSEO_PASSWORD");
  if (!login || !password) {
    throw new Error(
      "DataForSEO is not configured — set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in .env.local",
    );
  }
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

export interface DataForSEOResponse<T = unknown> {
  /** Total cost charged by DataForSEO for this response. */
  cost: number;
  /** Status code from DataForSEO (their own — 200xx means OK). */
  status_code: number;
  status_message: string;
  tasks: Array<{
    id: string;
    status_code: number;
    status_message: string;
    result: T[] | null;
  }>;
}

/**
 * POST to a DataForSEO endpoint. `path` is the path after the host, e.g.
 * `/v3/serp/google/organic/live/regular`. The payload should be the list of
 * task objects DataForSEO expects (this client wraps in an array if not).
 */
export async function post<T = unknown>(
  path: string,
  payload: unknown,
): Promise<DataForSEOResponse<T>> {
  const body = Array.isArray(payload) ? payload : [payload];
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DataForSEO ${path} → HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as DataForSEOResponse<T>;
  if (json.status_code >= 40000) {
    throw new Error(`DataForSEO ${path} → ${json.status_code}: ${json.status_message}`);
  }
  return json;
}

/**
 * Convenience for the most common shape: organic SERP for a single keyword.
 */
export async function organicSerp(
  keyword: string,
  options: {
    location_name?: string;
    language_name?: string;
    depth?: number;
  } = {},
): Promise<DataForSEOResponse> {
  return post("/v3/serp/google/organic/live/regular", {
    keyword,
    location_name: options.location_name ?? "United States",
    language_name: options.language_name ?? "English",
    depth: options.depth ?? 50,
  });
}
