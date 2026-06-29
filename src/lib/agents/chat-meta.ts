/**
 * Per-conversation chat metadata — the small set of state the user
 * controls per (clientSlug, target) but which doesn't belong on every
 * individual turn.
 *
 * Fields:
 *   permission_mode  Plan / Read / Auto / Full (Pillar 4).
 *   model            Optional model id override. Empty/undefined means
 *                    "use the provider's default for the tier". Accepts
 *                    Anthropic model aliases ("opus", "sonnet", "haiku")
 *                    or full ids ("claude-opus-4-7"); the provider does
 *                    the resolution.
 *   thinking         When true, the chat route asks Anthropic to expose
 *                    extended thinking. Ignored by CLI providers.
 *
 * Storage shape: one JSON file per target at
 *   .seo-office/vaults/<slug>/.chat/<target>.meta.json
 *
 * The atomic write helper in vault-fs guarantees crash-safety. Reads
 * fall back to defaults on missing files or invalid JSON so the
 * UI never blocks on a meta-fetch failure.
 */
import "server-only";

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { vaultRoot } from "@/lib/brain/paths";
import { PermissionModeZ, type PermissionMode } from "@/lib/orchestrator/assignment";

export const ChatMetaZ = z.object({
  permission_mode: PermissionModeZ.default("auto"),
  /** Free-form model id (alias or canonical). Empty string == "default". */
  model: z.string().max(120).optional(),
  /** Extended thinking toggle. Honoured by the Anthropic SDK; CLI providers ignore. */
  thinking: z.boolean().default(false),
  /** Persisted Claude Code session id for the agentic backend. When set,
   *  the next agentic turn passes `--resume <id>` so Claude Code's own
   *  session store carries working memory across turns. Cleared on
   *  history reset. */
  agentic_session_id: z.string().max(120).optional(),
  updated_at: z.string().optional(),
});
export type ChatMeta = z.infer<typeof ChatMetaZ>;

const DEFAULT_META: ChatMeta = { permission_mode: "auto", thinking: false };

function chatDir(slug: string): string {
  return path.join(vaultRoot(slug), ".chat");
}

function metaFile(slug: string, target: string): string {
  const safe = target.toLowerCase().replace(/[^a-z0-9-]/g, "_").slice(0, 60);
  return path.join(chatDir(slug), `${safe}.meta.json`);
}

export async function readChatMeta(slug: string, target: string): Promise<ChatMeta> {
  const file = metaFile(slug, target);
  if (!fs.existsSync(file)) return DEFAULT_META;
  try {
    const raw = await fsp.readFile(file, "utf8");
    const parsed = ChatMetaZ.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_META;
  } catch {
    return DEFAULT_META;
  }
}

export async function writeChatMeta(
  slug: string,
  target: string,
  patch: {
    permission_mode?: PermissionMode;
    model?: string | null;
    thinking?: boolean;
    agentic_session_id?: string | null;
  },
): Promise<ChatMeta> {
  const file = metaFile(slug, target);
  const existing = await readChatMeta(slug, target);
  // Empty-string or null model resets to the provider default — that's
  // what the "Default (recommended)" pick in the UI sends.
  const nextModel =
    patch.model === undefined
      ? existing.model
      : patch.model === null || patch.model === ""
        ? undefined
        : patch.model;
  // Same null-resets-to-undefined treatment for the agentic session id so
  // callers can clear it without juggling explicit deletes.
  const nextSession =
    patch.agentic_session_id === undefined
      ? existing.agentic_session_id
      : patch.agentic_session_id === null || patch.agentic_session_id === ""
        ? undefined
        : patch.agentic_session_id;
  const merged: ChatMeta = {
    permission_mode: patch.permission_mode ?? existing.permission_mode,
    thinking: patch.thinking ?? existing.thinking,
    ...(nextModel ? { model: nextModel } : {}),
    ...(nextSession ? { agentic_session_id: nextSession } : {}),
    updated_at: new Date().toISOString(),
  };
  await fsp.mkdir(chatDir(slug), { recursive: true });
  // Same write-temp-then-rename trick used by vault-fs.writeNote — keeps
  // the file readable even if the process is killed mid-write.
  const tmp = `${file}.tmp.${process.pid}`;
  await fsp.writeFile(tmp, JSON.stringify(merged, null, 2), "utf8");
  await fsp.rename(tmp, file);
  return merged;
}
