/**
 * Backward-compat shim — pre-v0.1.1 specialists imported `chat` and
 * `validateKey` from here. The real logic now lives in
 * `@/lib/integrations/providers/`.
 *
 * Prefer importing from `@/lib/integrations/providers` directly in new code.
 */
import "server-only";
import { selectProvider } from "./providers";
import { validateAnthropicKey } from "./providers/anthropic-api";
import type { LLMChatInput, LLMChatResult } from "./providers/types";

export function isConfigured(): boolean {
  // Legacy API-only check. Use `selectedProviderId()` for full multi-provider.
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function validateKey(apiKey: string) {
  return validateAnthropicKey(apiKey);
}

/** Auto-selects the best available provider and runs the chat. */
export async function chat(input: LLMChatInput): Promise<LLMChatResult> {
  const provider = await selectProvider();
  return provider.chat(input);
}
