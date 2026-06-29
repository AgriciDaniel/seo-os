/**
 * Claude CLI provider — spawn `claude --print` and use the user's
 * Claude Pro/Max subscription auth (no API key needed).
 *
 * Trade-offs vs the API provider:
 *   + No per-token bill — covered by the user's Max plan.
 *   - First spawn includes ~50k cached tokens of Claude Code's own
 *     auto-discovered context (skills, MCP servers, CLAUDE.md). Subsequent
 *     spawns reuse the prompt cache (1h ephemeral) but each spawn is a
 *     fresh session, so cache hits depend on Anthropic's server caching.
 *   - Spawning a CLI is slower than a raw API call (~1-2s overhead).
 *   - Tool use is disabled (`--disallowed-tools "*"`); we want raw text.
 */
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { spawnCapture } from "@/lib/integrations/_lib/spawn-capture";
import {
  flattenContentToText,
  type LLMChatInput,
  type LLMChatResult,
  type LLMProvider,
  type ProviderAvailability,
} from "./types";

const BIN = process.env.SEO_OFFICE_CLAUDE_BIN || "claude";

/** Default model aliases — claude CLI accepts "sonnet", "opus", "haiku". */
const DEFAULT_MODEL_SYNTHESIS = "opus";
const DEFAULT_MODEL_ROUTING = "haiku";

export const claudeCliProvider: LLMProvider = {
  id: "claude-cli",
  name: "Claude Pro/Max subscription (via claude CLI)",
  authMode: "subscription",

  async availability(): Promise<ProviderAvailability> {
    const probe = await spawnCapture(BIN, ["--version"], { timeoutMs: 5000 });
    const installed = probe.exitCode === 0;
    const version = installed ? probe.stdout.trim().split(/\s+/)[0] : undefined;

    // Auth check: `claude` keychain credentials live at ~/.claude/.credentials.json
    // or in the OS keychain. We do a heuristic file check first (fast); a real
    // auth test would require an actual API call.
    let authed = false;
    if (installed) {
      const credsPath = path.join(
        process.env.HOME ?? "",
        ".claude",
        ".credentials.json",
      );
      authed = fs.existsSync(credsPath);
    }

    return {
      id: "claude-cli",
      name: "Claude Pro/Max subscription (via claude CLI)",
      authMode: "subscription",
      installed,
      authed,
      version,
      error: installed
        ? authed
          ? undefined
          : "claude CLI installed but no local credentials were detected"
        : probe.stderr || "claude CLI not on PATH",
    };
  },

  async chat(input: LLMChatInput): Promise<LLMChatResult> {
    const model =
      input.model ??
      (input.tier === "synthesis" ? DEFAULT_MODEL_SYNTHESIS : DEFAULT_MODEL_ROUTING);

    // Compose the user message. Feed it through stdin so large/private client
    // context is not exposed through process argv.
    // For multi-turn we serialize messages into a transcript. Multimodal
    // content blocks are flattened to text descriptions — the CLI doesn't
    // accept binary attachments today.
    const transcript = input.messages
      .map((m) => {
        const text = flattenContentToText(m.content);
        return m.role === "user" ? text : `[assistant] ${text}`;
      })
      .join("\n\n");

    const composed = `SYSTEM:\n${input.systemPrompt}\n\nTRANSCRIPT:\n${transcript}`;

    const args = [
      "--print",
      "--output-format",
      "json",
      "--disallowed-tools",
      "*",
      "--no-session-persistence",
      "--model",
      model,
    ];

    const started = Date.now();
    const timeoutMs = input.timeoutMs ?? 5 * 60_000;
    const runOnce = () =>
      spawnCapture(BIN, args, { timeoutMs, input: composed, signal: input.signal });

    let res = await runOnce();
    // Retry ONCE on a transient non-zero exit (e.g. "exited 1" when the CLI is
    // briefly overwhelmed by concurrent sweep specialists). Skip the retry for
    // a user-cancel (killed via signal) or a timeout — neither recovers on a
    // quick re-run — and never retry once the job was aborted.
    if (res.exitCode !== 0 && !res.killed && !res.timedOut && !input.signal?.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      if (!input.signal?.aborted) res = await runOnce();
    }
    const { stdout, stderr, exitCode, timedOut, killed } = res;

    if (exitCode !== 0) {
      const reason = timedOut
        ? `timed out after ${Math.round(timeoutMs / 1000)}s`
        : killed
          ? "was terminated"
          : `exited ${exitCode}`;
      const detail = stderr.trim() ? `: ${stderr.trim().slice(0, 400)}` : "";
      throw new Error(`claude CLI ${reason}${detail}`);
    }

    let parsed: ClaudeCliResult;
    try {
      parsed = JSON.parse(stdout) as ClaudeCliResult;
    } catch {
      throw new Error(`claude CLI returned non-JSON output: ${stdout.slice(0, 400)}`);
    }

    if (parsed.is_error) {
      throw new Error(`claude CLI error: ${parsed.api_error_status ?? "unknown"}`);
    }

    return {
      text: cleanOutputStyleArtifacts(parsed.result?.trim() ?? ""),
      model: pickModelName(parsed) ?? model,
      durationMs: Date.now() - started,
      costUsd: parsed.total_cost_usd,
      usage: {
        inputTokens: parsed.usage?.input_tokens,
        outputTokens: parsed.usage?.output_tokens,
        cacheReadInputTokens: parsed.usage?.cache_read_input_tokens,
        cacheCreationInputTokens: parsed.usage?.cache_creation_input_tokens,
      },
    };
  },
};

/**
 * Strip "explanatory output style" artifacts that the user's global
 * ~/.claude/CLAUDE.md may inject into every claude CLI completion. We're
 * driving claude as a raw LLM, not as a coding assistant — these blocks
 * are noise for downstream consumers (audit reports, the brain index).
 *
 * Examples removed:
 *   `★ Insight ─────...─`
 *   ...educational content...
 *   `─────...─`
 */
export function cleanOutputStyleArtifacts(text: string): string {
  // ★ Insight blocks fenced by backticked horizontal rules
  let out = text.replace(
    /`★\s*Insight[^`]*`[\s\S]*?`[─\-=]{3,}`/g,
    "",
  );
  // also handle un-backticked variants
  out = out.replace(
    /^★\s*Insight[^\n]*\n[\s\S]*?^[─\-=]{20,}\s*$/gm,
    "",
  );
  // collapse runs of 3+ newlines back to a paragraph break
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

/* -------------------------------------------------------------------------- */
/* internals                                                                   */
/* -------------------------------------------------------------------------- */

interface ClaudeCliResult {
  type: string;
  subtype: string;
  is_error: boolean;
  api_error_status: string | null;
  duration_ms: number;
  result: string;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  modelUsage?: Record<string, unknown>;
}

function pickModelName(parsed: ClaudeCliResult): string | undefined {
  const keys = parsed.modelUsage ? Object.keys(parsed.modelUsage) : [];
  return keys[0];
}
