/**
 * Gemini CLI provider — spawn `gemini -p` using the user's Google AI Pro
 * (or Workspace) auth.
 *
 * Same shape as the other CLI providers. Gemini CLI supports --output-format
 * json which gives us structured output similar to claude CLI.
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

const BIN = process.env.SEO_OFFICE_GEMINI_BIN || "gemini";

export const geminiCliProvider: LLMProvider = {
  id: "gemini-cli",
  name: "Google AI Pro subscription (via gemini CLI)",
  authMode: "subscription",

  async availability(): Promise<ProviderAvailability> {
    const probe = await spawnCapture(BIN, ["--version"], { timeoutMs: 5000 });
    const installed = probe.exitCode === 0;
    const version = installed ? probe.stdout.trim() : undefined;
    let authed = false;
    if (installed) {
      // Gemini CLI keeps credentials under ~/.gemini/oauth_creds.json or similar.
      const candidates = [
        path.join(process.env.HOME ?? "", ".gemini", "oauth_creds.json"),
        path.join(process.env.HOME ?? "", ".gemini", "creds.json"),
        path.join(process.env.HOME ?? "", ".config", "gemini", "auth.json"),
      ];
      authed = candidates.some((p) => fs.existsSync(p));
    }
    return {
      id: "gemini-cli",
      name: "Google AI Pro subscription (via gemini CLI)",
      authMode: "subscription",
      installed,
      authed,
      version,
      error: installed
        ? authed
          ? undefined
          : "gemini CLI installed but no local credentials were detected"
        : probe.stderr || "gemini CLI not on PATH",
    };
  },

  async chat(input: LLMChatInput): Promise<LLMChatResult> {
    const composed =
      `SYSTEM:\n${input.systemPrompt}\n\nUSER:\n` +
      input.messages
        .map((m) => {
          const text = flattenContentToText(m.content);
          return m.role === "user" ? text : `(prior assistant) ${text}`;
        })
        .join("\n\n");

    const args = [
      "-p",
      "Use the instructions and transcript provided on stdin.",
      "--output-format",
      "json",
      "--approval-mode",
      "plan", // read-only
    ];
    if (input.model) args.push("-m", input.model);

    const started = Date.now();
    const { stdout, stderr, exitCode } = await spawnCapture(BIN, args, {
      timeoutMs: input.timeoutMs ?? 5 * 60_000,
      input: composed,
      signal: input.signal,
    });

    if (exitCode !== 0) {
      throw new Error(`gemini CLI exited ${exitCode}: ${stderr.slice(0, 400)}`);
    }

    // Gemini --output-format json output shape is similar but not identical
    // to claude. We try JSON first, fall back to raw text.
    let text = "";
    try {
      const parsed = JSON.parse(stdout) as { response?: string; text?: string };
      text = (parsed.response ?? parsed.text ?? stdout).trim();
    } catch {
      text = stdout.trim();
    }

    return {
      text,
      durationMs: Date.now() - started,
      model: input.model,
    };
  },
};
