/**
 * Anthropic API provider — direct SDK with the user's API key.
 *
 * Use case: user has an ANTHROPIC_API_KEY (pay-per-token, no subscription).
 * Prompt caching is applied to the system prompt for cost efficiency.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import {
  LLMProviderError,
  type LLMChatInput,
  type LLMChatResult,
  type LLMProvider,
  type LLMToolCall,
  type ProviderAvailability,
} from "./types";
import { envValue } from "@/lib/setup/env-local";
import { appendStructuredLogRow } from "@/lib/brain/structured-log";
import { currentSpecialistBrainContext } from "@/lib/specialists/_lib/brain-context";

const ENV_KEY = "ANTHROPIC_API_KEY";
const ENV_BASE_URL = "ANTHROPIC_BASE_URL";

const DEFAULT_MODEL_SYNTHESIS = "claude-opus-4-7";
const DEFAULT_MODEL_ROUTING = "claude-haiku-4-5-20251001";

let cached: Anthropic | null = null;
let cachedKey = "";
let cachedBaseURL = "";

function getClient(): Anthropic {
  const apiKey = envValue(ENV_KEY);
  const baseURL = envValue(ENV_BASE_URL);
  if (cached && cachedKey === apiKey && cachedBaseURL === baseURL) return cached;
  if (!apiKey) {
    throw new LLMProviderError(`${ENV_KEY} is not set`, "auth", 401);
  }
  cached = new Anthropic({
    apiKey,
    baseURL: baseURL || undefined,
  });
  cachedKey = apiKey;
  cachedBaseURL = baseURL;
  return cached;
}

export const anthropicApiProvider: LLMProvider = {
  id: "anthropic-api",
  name: "Anthropic API key",
  authMode: "api-key",

  async availability(): Promise<ProviderAvailability> {
    const installed = true; // SDK is bundled
    const authed = Boolean(envValue(ENV_KEY));
    return {
      id: "anthropic-api",
      name: "Anthropic API key",
      authMode: "api-key",
      installed,
      authed,
    };
  },

  async chat(input: LLMChatInput): Promise<LLMChatResult> {
    const client = getClient();
    const model =
      input.model ??
      (input.tier === "synthesis"
        ? DEFAULT_MODEL_SYNTHESIS
        : DEFAULT_MODEL_ROUTING);

    // CLAUDE.md mandates prompt-caching on every Anthropic call. We cache:
    //   1. the system prompt (always — same breakpoint as before)
    //   2. the tool definitions (when present — cache_control on the LAST
    //      tool covers everything before it, which is the canonical pattern)
    const tools = input.tools && input.tools.length > 0
      ? input.tools.map((t, i, all) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema as Anthropic.Tool.InputSchema,
          ...(i === all.length - 1
            ? { cache_control: { type: "ephemeral" as const } }
            : {}),
        }))
      : undefined;

    const toolChoice = input.toolChoice
      ? typeof input.toolChoice === "string"
        ? { type: input.toolChoice as "auto" | "any" }
        : { type: "tool" as const, name: input.toolChoice.name }
      : undefined;

    // Hard timeout via AbortController. Default 5 min keeps long synthesis
    // calls alive but cuts off network hangs.
    const controller = new AbortController();
    const timeoutMs = input.timeoutMs ?? 5 * 60_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abortFromCaller = () => controller.abort();
    if (input.signal?.aborted) controller.abort();
    input.signal?.addEventListener("abort", abortFromCaller, { once: true });

    const started = Date.now();
    let res: Anthropic.Message;
    try {
      res = await client.messages.create(
        {
          model,
          max_tokens: input.maxTokens ?? 4096,
          temperature: input.temperature ?? 0.7,
          system: [
            {
              type: "text",
              text: input.systemPrompt,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: input.messages.map((m) => ({
            role: m.role,
            // Anthropic accepts either a plain string OR an array of typed
            // content blocks; our LLMContentBlock shape mirrors the SDK's,
            // so passing through is structurally safe.
            content: m.content as Anthropic.MessageParam["content"],
          })),
          ...(tools ? { tools } : {}),
          ...(toolChoice ? { tool_choice: toolChoice } : {}),
          // Extended thinking — when enabled, Anthropic exposes the
          // model's reasoning trace and produces typically higher-quality
          // synthesis answers. Budget caps the tokens spent on thinking
          // (separate from the response cap above). Requires
          // temperature=1 per the SDK constraint.
          ...(input.thinking?.enabled
            ? {
                thinking: {
                  type: "enabled" as const,
                  budget_tokens: input.thinking.budgetTokens ?? 8192,
                },
                temperature: 1,
              }
            : {}),
        },
        { signal: controller.signal },
      );
    } catch (err) {
      throw mapAnthropicError(err, timeoutMs);
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", abortFromCaller);
    }

    const text = res.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("\n\n")
      .trim();

    const toolCalls: LLMToolCall[] = res.content
      .flatMap((b) =>
        b.type === "tool_use"
          ? [
              {
                id: b.id ?? randomUUID(),
                name: b.name,
                input: (b.input as Record<string, unknown>) ?? {},
              } satisfies LLMToolCall,
            ]
          : [],
      );

    const durationMs = Date.now() - started;
    const usage = {
      inputTokens: res.usage?.input_tokens,
      outputTokens: res.usage?.output_tokens,
      cacheReadInputTokens: res.usage?.cache_read_input_tokens ?? undefined,
      cacheCreationInputTokens:
        res.usage?.cache_creation_input_tokens ?? undefined,
    };
    const costUsd = estimateAnthropicCostUsd(model, usage);
    await recordAnthropicUsage({
      model,
      durationMs,
      costUsd,
      usage,
    });

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: res.stop_reason ?? undefined,
      model,
      durationMs,
      costUsd,
      usage,
    };
  },
};

async function recordAnthropicUsage(input: {
  model: string;
  durationMs: number;
  costUsd: number;
  usage: NonNullable<LLMChatResult["usage"]>;
}): Promise<void> {
  const context = currentSpecialistBrainContext();
  if (!context) return;
  await appendStructuredLogRow(context.clientSlug, {
    type: "llm_call",
    provider: "anthropic-api",
    model: input.model,
    job_id: context.jobId,
    specialist_id: context.specialistId,
    duration_ms: input.durationMs,
    cost_usd: input.costUsd,
    input_tokens: input.usage.inputTokens ?? 0,
    output_tokens: input.usage.outputTokens ?? 0,
    cache_read_input_tokens: input.usage.cacheReadInputTokens ?? 0,
    cache_creation_input_tokens: input.usage.cacheCreationInputTokens ?? 0,
  }).catch(() => undefined);
}

function estimateAnthropicCostUsd(
  model: string,
  usage: NonNullable<LLMChatResult["usage"]>,
): number {
  const rates = anthropicRatesPerMillion(model);
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const cacheRead = usage.cacheReadInputTokens ?? 0;
  const cacheCreation = usage.cacheCreationInputTokens ?? 0;
  const uncachedInput = Math.max(0, input - cacheRead - cacheCreation);
  const cost =
    (uncachedInput * rates.input +
      cacheCreation * rates.cacheCreate +
      cacheRead * rates.cacheRead +
      output * rates.output) /
    1_000_000;
  return Number(cost.toFixed(6));
}

function anthropicRatesPerMillion(model: string): {
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
} {
  const lower = model.toLowerCase();
  const base = lower.includes("opus")
    ? { input: 15, output: 75 }
    : lower.includes("sonnet")
      ? { input: 3, output: 15 }
      : { input: 1, output: 5 };
  return {
    ...base,
    cacheCreate: base.input * 1.25,
    cacheRead: base.input * 0.1,
  };
}

/**
 * Map Anthropic SDK errors into our typed `LLMProviderError` so route
 * handlers can surface the right HTTP status. Anything we don't recognise
 * collapses into `unknown` with status 500.
 */
function mapAnthropicError(err: unknown, timeoutMs: number): LLMProviderError {
  if (err instanceof LLMProviderError) return err;

  // AbortError shape from fetch — name is "AbortError" or DOMException.
  const name = (err as { name?: string } | null)?.name;
  if (name === "AbortError") {
    return new LLMProviderError(
      `Anthropic API call exceeded ${timeoutMs}ms`,
      "timeout",
      504,
    );
  }

  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 500;
    if (status === 401 || status === 403) {
      return new LLMProviderError(err.message, "auth", status);
    }
    if (status === 429) {
      const retry = parseRetryAfter(err.headers);
      return new LLMProviderError(err.message, "rate_limited", 429, retry);
    }
    if (status === 529) {
      return new LLMProviderError(err.message, "overloaded", 503);
    }
    if (status >= 500) {
      return new LLMProviderError(err.message, "upstream_unavailable", 503);
    }
    if (status >= 400) {
      return new LLMProviderError(err.message, "invalid_request", status);
    }
  }

  const message = err instanceof Error ? err.message : String(err);
  return new LLMProviderError(message, "unknown", 500);
}

function parseRetryAfter(headers: unknown): number | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const h = headers as Record<string, string>;
  const raw = h["retry-after"] ?? h["Retry-After"];
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** One-shot key validation for the setup wizard. */
export async function validateAnthropicKey(apiKey: string): Promise<
  | { ok: true; model: string; cost_usd: number }
  | { ok: false; error: string }
> {
  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: DEFAULT_MODEL_ROUTING,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    const inputTokens = res.usage?.input_tokens ?? 0;
    const outputTokens = res.usage?.output_tokens ?? 0;
    const cost = (inputTokens * 1 + outputTokens * 5) / 1_000_000;
    return { ok: true, model: DEFAULT_MODEL_ROUTING, cost_usd: cost };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
