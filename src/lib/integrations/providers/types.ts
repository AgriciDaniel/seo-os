/**
 * Provider abstraction: one interface, many backends.
 *
 * Backends so far:
 *   - anthropic-api      direct @anthropic-ai/sdk with a per-token API key
 *   - claude-cli         spawn `claude --print` (uses your Claude Pro/Max sub)
 *   - codex-cli          spawn `codex exec`     (uses your ChatGPT Plus/Pro sub)
 *   - gemini-cli         spawn `gemini -p`      (uses your Google AI Pro sub)
 *
 * Specialists call the abstract `LLMProvider.chat()` — they never know or
 * care which backend resolved the request.
 */
import "server-only";

export type ProviderId =
  | "anthropic-api"
  | "claude-cli"
  | "codex-cli"
  | "gemini-cli";

export type AuthMode = "api-key" | "subscription";

/**
 * Multimodal content. The Anthropic SDK is the only provider that fully
 * honours these today; CLI providers receive them but flatten to text
 * (with attachments described, not embedded) before invoking their
 * backend.
 */
export type LLMContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    }
  | {
      type: "document";
      source: { type: "base64"; media_type: string; data: string };
    };

export interface LLMMessage {
  role: "user" | "assistant";
  /** Either a plain string (legacy) or a sequence of typed content blocks
   *  (multimodal). Providers must accept both shapes. */
  content: string | LLMContentBlock[];
}

/**
 * Tool definition. Mirrors Anthropic's `Anthropic.Tool` shape so the
 * anthropic-api provider can pass it through verbatim. Subscription CLI
 * providers don't support structured tool use yet and will receive these
 * but ignore them — callers must always handle the case where the model
 * returns plain text instead of a tool call.
 */
export interface LLMTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export interface LLMToolCall {
  /** Echoes Anthropic's `id` so the caller can match tool_result blocks
   *  back to the originating tool_use. Synthesised UUIDs for non-SDK
   *  providers that lack a native id. */
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type LLMToolChoice = "auto" | "any" | { name: string };

/**
 * Flatten multimodal content into plain text for providers that don't
 * natively support content blocks. Attachments become bracketed
 * placeholders so the model knows there's an asset even if it can't
 * inspect it. Used by the CLI providers (claude-cli, codex-cli,
 * gemini-cli) and by any caller that wants a transcript-grade string.
 */
export function flattenContentToText(content: string | LLMContentBlock[]): string {
  if (typeof content === "string") return content;
  return content
    .map((b) => {
      if (b.type === "text") return b.text;
      if (b.type === "image") {
        return `[image attached: ${b.source.media_type}, ${b.source.data.length} base64 chars]`;
      }
      if (b.type === "document") {
        return `[document attached: ${b.source.media_type}, ${b.source.data.length} base64 chars]`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

export interface LLMChatInput {
  /** "synthesis" → smartest model, "routing" → cheapest model. */
  tier: "synthesis" | "routing";
  /** Optional explicit model override (e.g. "sonnet", "opus", "gpt-5"). */
  model?: string;
  systemPrompt: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Hard timeout in ms. Default: 5 minutes. */
  timeoutMs?: number;
  /** Abort signal from a running job or request. Providers should stop
   *  subprocesses / HTTP calls promptly when it fires. */
  signal?: AbortSignal;
  /** Tool definitions made available to the model. Native tool-use is only
   *  honoured by the anthropic-api provider today; others ignore. */
  tools?: LLMTool[];
  /** Tool-choice hint when `tools` is non-empty. Default: "auto". */
  toolChoice?: LLMToolChoice;
  /** Extended thinking config (Anthropic-only). When `enabled` is true,
   *  the SDK call sends a `thinking` parameter with the given budget;
   *  CLI providers ignore. `budgetTokens` defaults to 8192. */
  thinking?: { enabled: boolean; budgetTokens?: number };
}

export interface LLMChatResult {
  /** The model's text response, concatenated. May be empty if the model
   *  chose to respond purely with a tool call. */
  text: string;
  /** Structured tool calls extracted from the response, in document order.
   *  Empty when the model didn't use a tool. */
  toolCalls?: LLMToolCall[];
  /** Best-effort `stop_reason` from the underlying SDK. Subscription
   *  providers may omit. */
  stopReason?: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | string;
  /** Best-effort cost in USD (real for api-key, theoretical for subscription). */
  costUsd?: number;
  /** Token counts when known. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  };
  /** Which model actually answered. */
  model?: string;
  /** Wall-clock duration of the call. */
  durationMs?: number;
}

/* -------------------------------------------------------------------------- */
/* errors                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Typed error surface so route handlers can map provider failures to
 * accurate HTTP status codes (429 on rate-limit, 503 on upstream, etc.).
 * Providers should throw one of these; callers may unwrap with instanceof.
 */
export class LLMProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "rate_limited"
      | "upstream_unavailable"
      | "timeout"
      | "auth"
      | "invalid_request"
      | "overloaded"
      | "unknown",
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "LLMProviderError";
  }
}

export interface ProviderAvailability {
  id: ProviderId;
  /** Human-readable name for the wizard. */
  name: string;
  /** Auth model. */
  authMode: AuthMode;
  /** Is the CLI/SDK present on this machine? */
  installed: boolean;
  /** Is auth working (key set or CLI logged in)? */
  authed: boolean;
  /** Version string if known. */
  version?: string;
  /** Reason it's unavailable, when applicable. */
  error?: string;
}

export interface LLMProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly authMode: AuthMode;

  /** Cheap "are you ready?" check — should return in under a second. */
  availability(): Promise<ProviderAvailability>;

  /** Do the actual chat call. Throws on hard failure. */
  chat(input: LLMChatInput): Promise<LLMChatResult>;
}
