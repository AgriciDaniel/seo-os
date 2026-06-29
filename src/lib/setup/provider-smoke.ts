import { INTEGRATIONS } from "@/lib/integrations/catalog";
import { testIntegration } from "@/lib/integrations/testers";
import { adcAvailableSync, hasScopeSync, SCOPE } from "@/lib/integrations/gcloud";
import { mergedRuntimeEnv } from "@/lib/setup/env-local";

export type ProviderSmokeStatus = "configured" | "missing" | "passed" | "failed";

export interface ProviderSmokeResult {
  id: string;
  name: string;
  required: boolean;
  configured: boolean;
  status: ProviderSmokeStatus;
  detail: string;
}

export interface ProviderSmokeReport {
  mode: "dry-run" | "live";
  launchReady: boolean;
  requiredIds: string[];
  results: ProviderSmokeResult[];
}

export interface ProviderSmokeOptions {
  live?: boolean;
  providerIds?: string[];
  requiredIds?: string[];
  env?: NodeJS.ProcessEnv;
  gcloud?: {
    adcAvailableSync?: () => boolean;
    hasScopeSync?: (scope: string) => boolean;
  };
}

export const DEFAULT_PROVIDER_SMOKE_IDS = [
  "dataforseo",
  "google",
  "google-cloud",
  "search-console",
  "ga4",
  "bing",
  "firecrawl",
] as const;

export const DEEP_BRAIN_REQUIRED_PROVIDER_IDS = [
  "dataforseo",
  "search-console",
  "ga4",
] as const;

const PROVIDER_NAMES: Record<string, string> = {
  "search-console": "Google Search Console",
  ga4: "Google Analytics 4",
};

export async function runProviderSmoke(
  options: ProviderSmokeOptions = {},
): Promise<ProviderSmokeReport> {
  const live = options.live === true;
  const env = options.env ?? mergedRuntimeEnv();
  const providerIds = options.providerIds ?? [...DEFAULT_PROVIDER_SMOKE_IDS];
  const requiredIds = options.requiredIds ?? [...DEEP_BRAIN_REQUIRED_PROVIDER_IDS];
  const sensitiveValues = sensitiveEnvValues(env);
  const results: ProviderSmokeResult[] = [];

  for (const id of providerIds) {
    const configured = isProviderConfigured(id, {
      env,
      gcloud: options.gcloud,
    });
    const required = requiredIds.includes(id);
    if (!configured) {
      results.push({
        id,
        name: providerDisplayName(id),
        required,
        configured: false,
        status: "missing",
        detail: "not configured",
      });
      continue;
    }

    if (!live) {
      results.push({
        id,
        name: providerDisplayName(id),
        required,
        configured: true,
        status: "configured",
        detail: "configured; live probe not run",
      });
      continue;
    }

    const test = await testIntegration(id, {});
    results.push({
      id,
      name: providerDisplayName(id),
      required,
      configured: true,
      status: test.ok ? "passed" : "failed",
      detail: sanitizeSmokeText(test.ok ? test.detail : test.error, sensitiveValues),
    });
  }

  const launchReady = requiredIds.every((id) => {
    const result = results.find((entry) => entry.id === id);
    if (!result) return false;
    return live ? result.status === "passed" : result.configured;
  });

  return {
    mode: live ? "live" : "dry-run",
    launchReady,
    requiredIds,
    results,
  };
}

export function isProviderConfigured(
  id: string,
  options: Pick<ProviderSmokeOptions, "env" | "gcloud"> = {},
): boolean {
  const env = options.env ?? mergedRuntimeEnv();
  const adcAvailable = options.gcloud?.adcAvailableSync ?? adcAvailableSync;
  const hasScope = options.gcloud?.hasScopeSync ?? hasScopeSync;

  if (id === "google-cloud") return adcAvailable();
  if (id === "search-console") {
    return adcAvailable() && hasScope(SCOPE.searchConsole);
  }
  if (id === "ga4") {
    return adcAvailable() && hasScope(SCOPE.ga4);
  }

  const integration = INTEGRATIONS.find((entry) => entry.id === id);
  return integration ? integration.isConfigured(env) : false;
}

export function providerDisplayName(id: string): string {
  return PROVIDER_NAMES[id] ?? INTEGRATIONS.find((entry) => entry.id === id)?.name ?? id;
}

export function sanitizeSmokeText(
  value: string,
  sensitiveValues: string[] = sensitiveEnvValues(),
): string {
  let out = value;
  for (const secret of sensitiveValues) {
    if (secret.length < 4) continue;
    out = out.split(secret).join("[redacted]");
  }
  return out;
}

function sensitiveEnvValues(env: NodeJS.ProcessEnv = mergedRuntimeEnv()): string[] {
  return INTEGRATIONS.flatMap((integration) =>
    integration.fields.map((field) => env[field.envName]?.trim() ?? ""),
  ).filter(Boolean);
}
