/**
 * Per-integration "is this key valid?" probes.
 *
 * Each probe hits the cheapest possible *free* endpoint that requires
 * authentication, so we get a definitive yes/no within a few seconds and
 * surface a useful detail (account balance, credit count, model count)
 * on success.
 *
 * Server-only. Called from /api/setup/test-integration.
 */

export type TestResult =
  | { ok: true; detail: string }
  | { ok: false; error: string };

const TIMEOUT_MS = 12000;

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

function networkError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "AbortError") return `timed out after ${TIMEOUT_MS / 1000}s`;
    return err.message;
  }
  return String(err);
}

/* -------------------------------------------------------------------------- */
/* DataForSEO — POST /v3/appendix/user_data returns account balance           */
/* -------------------------------------------------------------------------- */

export async function testDataForSEO(
  login: string,
  password: string,
): Promise<TestResult> {
  if (!login || !password) {
    return { ok: false, error: "login and password both required" };
  }
  const basic = Buffer.from(`${login}:${password}`).toString("base64");
  try {
    // user_data is a GET endpoint (not POST). Returns account info + balance.
    const r = await fetchWithTimeout(
      "https://api.dataforseo.com/v3/appendix/user_data",
      { headers: { Authorization: `Basic ${basic}` } },
    );
    if (r.status === 401 || r.status === 403) {
      return { ok: false, error: "invalid credentials" };
    }
    if (!r.ok) {
      return { ok: false, error: `HTTP ${r.status}` };
    }
    const j = (await r.json().catch(() => null)) as {
      status_code?: number;
      status_message?: string;
      tasks?: Array<{
        status_code?: number;
        status_message?: string;
        result?: Array<{
          login?: string;
          money?: { total?: number; balance?: number };
        }>;
      }>;
    } | null;

    // Top-level error trumps everything (e.g. account locked, billing issue)
    if (j && typeof j.status_code === "number" && j.status_code !== 20000) {
      // 20100 codes and similar are non-fatal warnings — anything else is an
      // honest failure
      if (j.status_code >= 40000) {
        return { ok: false, error: j.status_message ?? `status ${j.status_code}` };
      }
    }

    // Try to pull a balance out of the result for a useful success message.
    const task = j?.tasks?.[0];
    const result = task?.result?.[0];
    const money = result?.money;
    const balance = money?.balance ?? money?.total;
    if (typeof balance === "number") {
      return { ok: true, detail: `$${balance.toFixed(2)} balance` };
    }
    // HTTP 200 with valid auth is itself a success signal, even if the
    // response shape doesn't include money fields on this plan.
    return { ok: true, detail: result?.login ? `account ${result.login}` : "account ok" };
  } catch (err) {
    return { ok: false, error: networkError(err) };
  }
}

/* -------------------------------------------------------------------------- */
/* Google API — POST CrUX record query (free, fast, requires valid key)        */
/* -------------------------------------------------------------------------- */

export async function testGoogle(key: string): Promise<TestResult> {
  if (!key) return { ok: false, error: "missing key" };
  try {
    const r = await fetchWithTimeout(
      `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: "https://www.google.com" }),
      },
    );
    if (r.status === 200) {
      return { ok: true, detail: "CrUX + PageSpeed reachable" };
    }
    const j = (await r.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    const msg = j?.error?.message ?? "";
    if (r.status === 403 && /api key/i.test(msg)) {
      return { ok: false, error: "API key not valid" };
    }
    if (r.status === 400 && /api key/i.test(msg)) {
      return { ok: false, error: "API key not valid" };
    }
    // CrUX may legitimately return 404 ("chrome-ux-report not found") for an
    // origin without enough field data — that still proves the key is valid.
    if (r.status === 404) {
      return { ok: true, detail: "CrUX reachable (no data for test origin)" };
    }
    return { ok: false, error: msg || `HTTP ${r.status}` };
  } catch (err) {
    return { ok: false, error: networkError(err) };
  }
}

/* -------------------------------------------------------------------------- */
/* Google AI Studio (Gemini) — GET /v1beta/models lists available models       */
/* -------------------------------------------------------------------------- */

export async function testGoogleAI(key: string): Promise<TestResult> {
  if (!key) return { ok: false, error: "missing key" };
  try {
    const r = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
    );
    if (r.status === 200) {
      const j = (await r.json().catch(() => null)) as
        | { models?: unknown[] }
        | null;
      const n = Array.isArray(j?.models) ? j.models.length : 0;
      return { ok: true, detail: `${n} models available` };
    }
    if (r.status === 400 || r.status === 403) {
      return { ok: false, error: "API key not valid" };
    }
    return { ok: false, error: `HTTP ${r.status}` };
  } catch (err) {
    return { ok: false, error: networkError(err) };
  }
}

/* -------------------------------------------------------------------------- */
/* Google Cloud (ADC) — fetch user info via the bearer token from gcloud       */
/* -------------------------------------------------------------------------- */

export async function testGoogleCloud(): Promise<TestResult> {
  const { adcAvailableSync } = await import("./gcloud");
  if (!adcAvailableSync()) {
    return { ok: false, error: "no ADC credentials — sign in first" };
  }
  try {
    const { adcFetch } = await import("./google-adc");
    const r = await adcFetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
    );
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return { ok: false, error: `HTTP ${r.status}${body ? `: ${body.slice(0, 120)}` : ""}` };
    }
    const j = (await r.json().catch(() => null)) as
      | { email?: string }
      | null;
    return {
      ok: true,
      detail: j?.email ? `signed in as ${j.email}` : "ADC token works",
    };
  } catch (err) {
    return { ok: false, error: networkError(err) };
  }
}

/* -------------------------------------------------------------------------- */
/* Google Search Console — GET /webmasters/v3/sites lists verified properties  */
/* -------------------------------------------------------------------------- */

export async function testSearchConsole(): Promise<TestResult> {
  const { adcAvailableSync, hasScopeSync, SCOPE } = await import("./gcloud");
  if (!adcAvailableSync()) {
    return { ok: false, error: "sign in with Google Cloud first" };
  }
  if (!hasScopeSync(SCOPE.searchConsole)) {
    return {
      ok: false,
      error: "webmasters.readonly scope not granted — re-run sign-in",
    };
  }
  try {
    const { adcFetch } = await import("./google-adc");
    const r = await adcFetch(
      "https://www.googleapis.com/webmasters/v3/sites",
    );
    if (!r.ok) {
      return { ok: false, error: `HTTP ${r.status}` };
    }
    const j = (await r.json().catch(() => null)) as
      | { siteEntry?: unknown[] }
      | null;
    const n = Array.isArray(j?.siteEntry) ? j.siteEntry.length : 0;
    return { ok: true, detail: `${n} verified property/properties` };
  } catch (err) {
    return { ok: false, error: networkError(err) };
  }
}

/* -------------------------------------------------------------------------- */
/* GA4 — GET accountSummaries lists accessible GA4 properties                  */
/* -------------------------------------------------------------------------- */

export async function testGA4(): Promise<TestResult> {
  const { adcAvailableSync, hasScopeSync, SCOPE } = await import("./gcloud");
  if (!adcAvailableSync()) {
    return { ok: false, error: "sign in with Google Cloud first" };
  }
  if (!hasScopeSync(SCOPE.ga4)) {
    return {
      ok: false,
      error: "analytics.readonly scope not granted — re-run sign-in",
    };
  }
  try {
    const { adcFetch } = await import("./google-adc");
    const r = await adcFetch(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
    );
    if (!r.ok) {
      return { ok: false, error: `HTTP ${r.status}` };
    }
    const j = (await r.json().catch(() => null)) as
      | { accountSummaries?: Array<{ propertySummaries?: unknown[] }> }
      | null;
    const props = (j?.accountSummaries ?? []).reduce(
      (acc, a) => acc + (Array.isArray(a.propertySummaries) ? a.propertySummaries.length : 0),
      0,
    );
    return { ok: true, detail: `${props} GA4 property/properties accessible` };
  } catch (err) {
    return { ok: false, error: networkError(err) };
  }
}

/* -------------------------------------------------------------------------- */
/* Bing Webmaster — GET /GetUserSites lists verified sites                     */
/* -------------------------------------------------------------------------- */

export async function testBing(key: string): Promise<TestResult> {
  if (!key) return { ok: false, error: "missing key" };
  try {
    const r = await fetchWithTimeout(
      `https://ssl.bing.com/webmaster/api.svc/json/GetUserSites?apikey=${encodeURIComponent(key)}`,
    );
    if (r.status === 401 || r.status === 403) {
      return { ok: false, error: "invalid API key" };
    }
    if (r.status === 200) {
      const j = (await r.json().catch(() => null)) as
        | { d?: unknown[] }
        | null;
      const n = Array.isArray(j?.d) ? j.d.length : 0;
      return { ok: true, detail: `${n} verified site(s)` };
    }
    return { ok: false, error: `HTTP ${r.status}` };
  } catch (err) {
    return { ok: false, error: networkError(err) };
  }
}

/* -------------------------------------------------------------------------- */
/* Firecrawl — GET /v1/team/credit-usage                                       */
/* -------------------------------------------------------------------------- */

export async function testFirecrawl(key: string): Promise<TestResult> {
  if (!key) return { ok: false, error: "missing key" };
  try {
    const r = await fetchWithTimeout(
      "https://api.firecrawl.dev/v1/team/credit-usage",
      { headers: { Authorization: `Bearer ${key}` } },
    );
    if (r.status === 401 || r.status === 403) {
      return { ok: false, error: "invalid API key" };
    }
    if (r.status === 200) {
      const j = (await r.json().catch(() => null)) as
        | { data?: { remaining_credits?: number }; remaining_credits?: number }
        | null;
      const remaining = j?.data?.remaining_credits ?? j?.remaining_credits;
      return {
        ok: true,
        detail:
          typeof remaining === "number"
            ? `${remaining.toLocaleString()} credits remaining`
            : "Firecrawl API reachable",
      };
    }
    return { ok: false, error: `HTTP ${r.status}` };
  } catch (err) {
    return { ok: false, error: networkError(err) };
  }
}

/* -------------------------------------------------------------------------- */
/* dispatch                                                                    */
/* -------------------------------------------------------------------------- */

export async function testIntegration(
  id: string,
  values: Record<string, string>,
): Promise<TestResult> {
  const { envValueFrom } = await import("@/lib/setup/env-local");
  const get = (name: string): string => {
    return envValueFrom(name, values);
  };

  switch (id) {
    case "dataforseo":
      return testDataForSEO(get("DATAFORSEO_LOGIN"), get("DATAFORSEO_PASSWORD"));
    case "google":
      return testGoogle(get("GOOGLE_API_KEY"));
    case "google-ai":
      return testGoogleAI(get("GOOGLE_AI_API_KEY"));
    case "google-cloud":
      return testGoogleCloud();
    case "search-console":
      return testSearchConsole();
    case "ga4":
      return testGA4();
    case "bing":
      return testBing(get("BING_WEBMASTER_API_KEY"));
    case "firecrawl":
      return testFirecrawl(get("FIRECRAWL_API_KEY"));
    default:
      return { ok: false, error: `unknown integration: ${id}` };
  }
}
