/**
 * Codex CLI provider — spawn `codex exec` using the user's ChatGPT
 * account or OpenAI API-key auth stored by the Codex CLI.
 *
 * NOTE: codex exec is designed as a coding-agent runner; it inherits any
 * `~/.codex/config.toml`. We pass a sandbox flag to keep it read-only.
 * Tool use cannot be fully disabled the way it can on the claude CLI, so
 * this provider is best suited to "summarise this JSON" type tasks where
 * the model is unlikely to try to write files.
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

const BIN = process.env.SEO_OFFICE_CODEX_BIN || "codex";

export const codexCliProvider: LLMProvider = {
  id: "codex-cli",
  name: "OpenAI Codex (via codex CLI)",
  authMode: "subscription",

  async availability(): Promise<ProviderAvailability> {
    const probe = await spawnCapture(BIN, ["--version"], { timeoutMs: 5000 });
    const installed = probe.exitCode === 0;
    const version = installed ? probe.stdout.trim() : undefined;
    let authed = false;
    if (installed) {
      const authPath = path.join(process.env.HOME ?? "", ".codex", "auth.json");
      const authTomlPath = path.join(
        process.env.HOME ?? "",
        ".codex",
        "auth.toml",
      );
      authed = fs.existsSync(authPath) || fs.existsSync(authTomlPath);
    }
    return {
      id: "codex-cli",
      name: "OpenAI Codex (via codex CLI)",
      authMode: "subscription",
      installed,
      authed,
      version,
      error: installed ? undefined : probe.stderr || "codex CLI not on PATH",
    };
  },

  async chat(input: LLMChatInput): Promise<LLMChatResult> {
    // Codex's exec mode wants a single prompt + (optional) stdin. We weave
    // the system prompt into the prompt arg with a clear delimiter; this is
    // a workaround — codex doesn't accept a separate system message via
    // exec.
    const composed =
      `SYSTEM:\n${input.systemPrompt}\n\nUSER:\n` +
      input.messages
        .map((m) => {
          const text = flattenContentToText(m.content);
          return m.role === "user" ? text : `(prior assistant) ${text}`;
        })
        .join("\n\n");

    const args = ["exec", "-s", "read-only"];
    if (input.model) args.push("-m", input.model);
    args.push("-");

    const started = Date.now();
    const timeoutMs = input.timeoutMs ?? 5 * 60_000;
    const { stdout, stderr, exitCode, timedOut, killed } = await spawnCapture(BIN, args, {
      timeoutMs,
      input: composed,
      signal: input.signal,
    });

    if (exitCode !== 0) {
      const reason = timedOut
        ? `timed out after ${Math.round(timeoutMs / 1000)}s`
        : killed
          ? "was terminated"
          : `exited ${exitCode}`;
      const detail = stderr.trim() ? `: ${stderr.trim().slice(0, 400)}` : "";
      throw new Error(`codex CLI ${reason}${detail}`);
    }

    return {
      text: stdout.trim(),
      durationMs: Date.now() - started,
      model: input.model,
    };
  },
};
