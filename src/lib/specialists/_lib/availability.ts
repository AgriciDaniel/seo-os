/**
 * Graceful-degradation helper for specialists that need external integrations.
 *
 * Every specialist that requires DataForSEO / Google / Moz / etc. calls
 * `requireIntegrations([...])` at the top of its `execute()`. If anything is
 * missing, it throws a single human-readable error naming the env vars and
 * pointing at /setup. The orchestrator surfaces the error as a job failure
 * event — no crash, no half-written artifacts.
 */
import "server-only";
import { isConfigured as dataforseoConfigured } from "@/lib/integrations/dataforseo";
import { adcAvailableSync, hasScopeSync, SCOPE } from "@/lib/integrations/gcloud";
import { envValue } from "@/lib/setup/env-local";

export type RequiredIntegration =
  | "dataforseo"
  | "google"
  | "google-ai"
  | "google-cloud"
  | "search-console"
  | "ga4"
  | "bing"
  | "firecrawl";

const checks: Record<RequiredIntegration, () => boolean> = {
  dataforseo: dataforseoConfigured,
  google: () => Boolean(envValue("GOOGLE_API_KEY")),
  "google-ai": () => Boolean(envValue("GOOGLE_AI_API_KEY")),
  "google-cloud": adcAvailableSync,
  // Per-scope gates — the user may have ADC creds but not the scope a
  // specific specialist needs.
  "search-console": () => adcAvailableSync() && hasScopeSync(SCOPE.searchConsole),
  ga4: () => adcAvailableSync() && hasScopeSync(SCOPE.ga4),
  bing: () => Boolean(envValue("BING_WEBMASTER_API_KEY")),
  firecrawl: () => Boolean(envValue("FIRECRAWL_API_KEY")),
};

const labels: Record<RequiredIntegration, string> = {
  dataforseo: "DataForSEO (DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD)",
  google: "Google API key (GOOGLE_API_KEY)",
  "google-ai": "Google AI Studio key (GOOGLE_AI_API_KEY)",
  "google-cloud":
    "Google Cloud sign-in (run `gcloud auth application-default login` or use /setup)",
  "search-console":
    "Google Search Console access (re-run gcloud sign-in with the webmasters.readonly scope)",
  ga4: "Google Analytics 4 access (re-run gcloud sign-in with the analytics.readonly scope)",
  bing: "Bing Webmaster key (BING_WEBMASTER_API_KEY)",
  firecrawl: "Firecrawl key (FIRECRAWL_API_KEY)",
};

export function isAvailable(id: RequiredIntegration): boolean {
  return checks[id]();
}

/** Throws a single error listing every missing integration. No-op if all set. */
export function requireIntegrations(ids: RequiredIntegration[]): void {
  const missing = ids.filter((id) => !checks[id]());
  if (missing.length === 0) return;
  const list = missing.map((id) => labels[id]).join(", ");
  throw new Error(
    `Missing ${missing.length === 1 ? "integration" : "integrations"}: ${list}. ` +
      `Open /setup to add ${missing.length === 1 ? "it" : "them"}.`,
  );
}
