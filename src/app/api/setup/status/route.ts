import { NextResponse } from "next/server";
import {
  configuredProviderId,
  detectAll,
  selectedProviderId,
} from "@/lib/integrations/providers";
import { detectPython } from "@/lib/integrations/python-detect";
import { INTEGRATIONS } from "@/lib/integrations/catalog";
import { mergedRuntimeEnv } from "@/lib/setup/env-local";
import { adcAvailableSync } from "@/lib/integrations/gcloud";

export const dynamic = "force-dynamic";

export async function GET() {
  const [providers, python] = await Promise.all([
    detectAll(),
    detectPython(),
  ]);
  const selected = await selectedProviderId();
  const configured = configuredProviderId();
  const env = mergedRuntimeEnv();

  // Generic per-integration status map. The UI iterates INTEGRATIONS and
  // looks up `integrations[id].configured` — adding a new integration in the
  // catalog requires zero changes here.
  const integrations: Record<string, { configured: boolean }> = {};
  for (const i of INTEGRATIONS) {
    integrations[i.id] = {
      configured:
        i.id === "google-cloud" ? adcAvailableSync() : i.isConfigured(env),
    };
  }

  return NextResponse.json({
    providers,
    selectedProvider: selected,
    configuredProvider: configured,
    integrations,
    python: python.ok
      ? { ok: true, version: python.version }
      : { ok: false, error: python.error },
    // Legacy fields preserved for any other consumers. New code reads
    // `integrations[<id>].configured`.
    anthropic: {
      configured: providers.find((p) => p.id === "anthropic-api")?.authed ?? false,
    },
    dataforseo: integrations.dataforseo,
    google: integrations.google,
  });
}
