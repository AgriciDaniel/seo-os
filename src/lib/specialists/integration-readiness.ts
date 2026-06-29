import "server-only";

import { INTEGRATIONS } from "@/lib/integrations/catalog";
import { adcAvailableSync, hasScopeSync, SCOPE } from "@/lib/integrations/gcloud";
import { isE2EMockSpecialistsEnabled } from "@/lib/orchestrator/e2e-mode";
import { mergedRuntimeEnv } from "@/lib/setup/env-local";
import { SPECIALISTS } from "@/lib/specialists/catalog";

export interface IntegrationSkip {
  specialistId: string;
  missing: string[];
  missingNames: string[];
}

export interface SpecialistIntegrationReadiness {
  total: number;
  ready: number;
  willSkip: number;
  missingIntegrationNames: string[];
  skips: IntegrationSkip[];
}

export interface SpecialistChildLike {
  specialist_id?: string | null;
}

interface ReadinessOptions {
  env?: Record<string, string | undefined>;
  e2eMockSpecialists?: boolean;
}

export function missingRequiredIntegrations(
  specialistId: string,
  options: ReadinessOptions = {},
): string[] {
  const meta = SPECIALISTS.find((s) => s.id === specialistId);
  return missingIntegrationsForSpecialist(
    specialistId,
    meta?.requiredIntegrations ?? meta?.requires ?? [],
    options,
  );
}

export function missingOptionalIntegrations(
  specialistId: string,
  options: ReadinessOptions = {},
): string[] {
  const meta = SPECIALISTS.find((s) => s.id === specialistId);
  return missingIntegrationsForSpecialist(
    specialistId,
    meta?.optionalIntegrations ?? [],
    options,
  );
}

export function optionalIntegrationDegradation(
  specialistId: string,
  options: ReadinessOptions = {},
): {
  missing: string[];
  missingNames: string[];
  artifact: { confidence?: "low"; dataSources?: ["model_estimate"] };
  result: { degraded?: true; degradationReason?: string };
} {
  const missing = missingOptionalIntegrations(specialistId, options);
  if (missing.length === 0) {
    return { missing: [], missingNames: [], artifact: {}, result: {} };
  }
  const missingNames = formatMissingIntegrationNames(missing);
  const reason = `Optional ${missingNames.join(", ")} integration${
    missingNames.length === 1 ? " is" : "s are"
  } unavailable; artifact is stamped as model-estimated low-confidence output.`;
  return {
    missing,
    missingNames,
    artifact: { confidence: "low", dataSources: ["model_estimate"] },
    result: { degraded: true, degradationReason: reason },
  };
}

function missingIntegrationsForSpecialist(
  specialistId: string,
  integrationIds: string[],
  options: ReadinessOptions,
): string[] {
  if (options.e2eMockSpecialists ?? isE2EMockSpecialistsEnabled()) return [];
  if (integrationIds.length === 0) return [];

  const missing: string[] = [];
  const env = (options.env ?? mergedRuntimeEnv()) as NodeJS.ProcessEnv;
  for (const integrationId of integrationIds) {
    if (integrationId === "google-cloud") {
      const hasRequiredScope =
        specialistId === "google-search-console"
          ? hasScopeSync(SCOPE.searchConsole)
          : specialistId === "google-analytics"
            ? hasScopeSync(SCOPE.ga4)
            : adcAvailableSync();
      if (!hasRequiredScope) missing.push(integrationId);
      continue;
    }
    const integration = INTEGRATIONS.find((i) => i.id === integrationId);
    if (!integration || !integration.isConfigured(env)) {
      missing.push(integrationId);
    }
  }
  return missing;
}

export function formatMissingIntegrationNames(missing: string[]): string[] {
  return missing.map((id) => {
    const integration = INTEGRATIONS.find((i) => i.id === id);
    return integration?.name ?? id;
  });
}

export function summarizeSpecialistIntegrationReadiness(
  children: SpecialistChildLike[],
  options: ReadinessOptions = {},
): SpecialistIntegrationReadiness {
  const skips: IntegrationSkip[] = [];
  for (const child of children) {
    const specialistId = child.specialist_id ?? "";
    if (!specialistId) continue;
    const missing = missingRequiredIntegrations(specialistId, options);
    if (missing.length === 0) continue;
    skips.push({
      specialistId,
      missing,
      missingNames: formatMissingIntegrationNames(missing),
    });
  }

  const missingIntegrationNames = Array.from(
    new Set(skips.flatMap((skip) => skip.missingNames)),
  ).sort((a, b) => a.localeCompare(b));

  return {
    total: children.length,
    ready: Math.max(0, children.length - skips.length),
    willSkip: skips.length,
    missingIntegrationNames,
    skips,
  };
}
