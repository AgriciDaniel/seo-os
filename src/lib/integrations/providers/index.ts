/**
 * Provider registry + selector.
 *
 * Resolution order:
 *   1. `SEO_OFFICE_LLM_PROVIDER` env var if set and available; if it is set
 *      but unavailable, fail closed so the app never silently uses another LLM.
 *   2. Auto-pick the first installed+authed provider, preferring subscription
 *      backends (no per-token bill) over the API key backend
 *
 * Subscription preference order:
 *   claude-cli → codex-cli → gemini-cli → anthropic-api
 */
import "server-only";
import { anthropicApiProvider } from "./anthropic-api";
import { claudeCliProvider } from "./claude-cli";
import { codexCliProvider } from "./codex-cli";
import { geminiCliProvider } from "./gemini-cli";
import type {
  LLMProvider,
  LLMChatInput,
  ProviderAvailability,
  ProviderId,
} from "./types";
import { envValue } from "@/lib/setup/env-local";
import { applySpecialistBrainContext } from "@/lib/specialists/_lib/brain-context";

const ALL: LLMProvider[] = [
  claudeCliProvider,
  codexCliProvider,
  geminiCliProvider,
  anthropicApiProvider,
];

export const providers: Record<ProviderId, LLMProvider> = {
  "claude-cli": claudeCliProvider,
  "codex-cli": codexCliProvider,
  "gemini-cli": geminiCliProvider,
  "anthropic-api": anthropicApiProvider,
};

/** Survey every provider — used by the setup wizard. */
export async function detectAll(): Promise<ProviderAvailability[]> {
  return Promise.all(ALL.map((p) => p.availability()));
}

/** Pick the provider to use right now, given env + availability. */
export async function selectProvider(): Promise<LLMProvider> {
  const preferred = envValue("SEO_OFFICE_LLM_PROVIDER") as ProviderId | "";
  const all = await detectAll();
  const byId = new Map(all.map((a) => [a.id, a] as const));

  if (preferred && providers[preferred]) {
    const av = byId.get(preferred);
    if (av?.installed && av.authed) return withBrainContextProvider(providers[preferred]);
    const reason = !av?.installed
      ? "not installed"
      : !av.authed
        ? "not authenticated"
        : av.error || "unavailable";
    throw new Error(
      `Configured LLM provider ${preferred} is ${reason}. Open /setup to choose or authenticate a provider.`,
    );
  }

  const preferenceOrder: ProviderId[] = [
    "claude-cli",
    "codex-cli",
    "gemini-cli",
    "anthropic-api",
  ];

  for (const id of preferenceOrder) {
    const av = byId.get(id);
    if (av?.installed && av.authed) {
      const available = preferenceOrder.filter((candidate) => {
        const candidateAv = byId.get(candidate);
        return candidateAv?.installed && candidateAv.authed;
      });
      return available.length > 1
        ? fallbackProvider(available)
        : withBrainContextProvider(providers[id]);
    }
  }

  throw new Error(
    "No LLM provider is available. Install claude/codex/gemini CLI and log in, or set ANTHROPIC_API_KEY.",
  );
}

/** Best-effort: returns the selected provider's id without throwing. */
export async function selectedProviderId(): Promise<ProviderId | null> {
  try {
    return (await selectProvider()).id;
  } catch {
    return null;
  }
}

/** Returns the provider the user explicitly saved, without auto-selection. */
export function configuredProviderId(): ProviderId | null {
  const preferred = envValue("SEO_OFFICE_LLM_PROVIDER") as ProviderId | "";
  return preferred && providers[preferred] ? preferred : null;
}

function fallbackProvider(order: ProviderId[]): LLMProvider {
  const primary = providers[order[0]];
  return {
    id: primary.id,
    name: `${primary.name} + fallback`,
    authMode: primary.authMode,
    availability: () => primary.availability(),
    async chat(input) {
      let lastError: unknown;
      for (const id of order) {
        const provider = providers[id];
        try {
          return await provider.chat(applySpecialistBrainContext(input));
        } catch (err) {
          if (input.signal?.aborted) throw err;
          lastError = err;
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error(String(lastError ?? "all LLM providers failed"));
    },
  };
}

function withBrainContextProvider(provider: LLMProvider): LLMProvider {
  return {
    ...provider,
    chat(input: LLMChatInput) {
      return provider.chat(applySpecialistBrainContext(input));
    },
  };
}

export type { LLMProvider, ProviderAvailability, ProviderId };
export type { LLMChatInput, LLMChatResult, LLMMessage } from "./types";
