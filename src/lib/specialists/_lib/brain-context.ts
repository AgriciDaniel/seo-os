import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { LLMChatInput } from "@/lib/integrations/providers/types";
import { readManifest } from "@/lib/orchestrator/client-context";
import { readHot } from "@/lib/orchestrator/working-memory";

interface BrainContextStore {
  clientSlug: string;
  jobId?: string;
  specialistId?: string;
  context: string;
}

const storage = new AsyncLocalStorage<BrainContextStore>();

export async function runWithSpecialistBrainContext<T>(
  clientSlug: string,
  fn: () => Promise<T>,
  meta: { jobId?: string; specialistId?: string } = {},
): Promise<T> {
  const context = await buildSpecialistBrainContext(clientSlug);
  return storage.run({ clientSlug, context, ...meta }, fn);
}

export function currentSpecialistBrainContext():
  | { clientSlug: string; jobId?: string; specialistId?: string }
  | null {
  const store = storage.getStore();
  if (!store) return null;
  return {
    clientSlug: store.clientSlug,
    jobId: store.jobId,
    specialistId: store.specialistId,
  };
}

export function applySpecialistBrainContext(input: LLMChatInput): LLMChatInput {
  const store = storage.getStore();
  if (!store || !store.context.trim()) return input;
  if (input.systemPrompt.includes("## SEO Office Brain Context")) return input;

  return {
    ...input,
    systemPrompt: `${input.systemPrompt}\n\n${store.context}`,
  };
}

async function buildSpecialistBrainContext(clientSlug: string): Promise<string> {
  const [manifest, hot] = await Promise.all([
    readManifest(clientSlug).catch(() => null),
    readHot(clientSlug).catch(() => null),
  ]);

  const lines: string[] = [
    "## SEO Office Brain Context",
    "",
    "Read this before acting. Reuse existing evidence, avoid duplicate work, and explicitly call out when a requested task was already completed by another specialist.",
    `Client slug: ${clientSlug}`,
  ];

  if (manifest) {
    lines.push(
      `Site under audit: ${manifest.site_under_audit || "(unknown)"}`,
      `Manifest schema: ${manifest.schema_version}`,
      `Last updated: ${manifest.last_updated}`,
    );
    const sources = Object.entries(manifest.sources ?? {}).slice(-12);
    if (sources.length > 0) {
      lines.push("", "Known source ledger:");
      for (const [name, source] of sources) {
        lines.push(`- ${name}: ${source.path} (${source.retrieved_at})`);
      }
    }
  }

  if (hot) {
    lines.push("", "hot.md working memory:", trimBlock(hot.raw, 2600));
  } else {
    lines.push("", "hot.md working memory: unavailable or not created yet.");
  }

  lines.push(
    "",
    "Operating rule: inspect the brain context first, then produce only the missing or updated work. If prior work is sufficient, summarize it and recommend the next useful step instead of rerunning.",
  );

  return lines.join("\n");
}

function trimBlock(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed || "(empty)";
  return `${trimmed.slice(0, maxChars - 140).trimEnd()}\n\n[brain context truncated; consult the vault paths above for full detail]`;
}
