/**
 * Write API keys to `.env.local` (the user's local file).
 *
 * Security model: local-first single-user. The user owns this filesystem.
 * Still, we strictly whitelist which keys can be written so an attacker
 * who somehow reached this endpoint can't drop arbitrary env vars.
 *
 * Restart behaviour: Next.js 16 dev hot-reloads `.env.local` (server
 * `loadEnvConfig({ forceReload: true })`), and every integration credential
 * in this codebase is read lazily inside request handlers — so credential
 * changes take effect on the next request, no restart needed. Binary-path
 * overrides (`SEO_OFFICE_CLAUDE_BIN`, `*_CODEX_BIN`, `*_GEMINI_BIN`,
 * `SEO_OFFICE_PYTHON`, `SEO_OFFICE_GCLOUD_BIN`) are captured at module
 * top-level, so changing those is the only case that genuinely needs a
 * restart.
 * The response flags this precisely.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { INTEGRATION_ENV_NAMES } from "@/lib/integrations/catalog";
import { writeEnvLocal } from "@/lib/setup/env-local";
import { sameOriginSetupWriteAllowed } from "@/lib/http/same-origin";

// LLM-provider + housekeeping envs aren't part of the integrations catalog,
// so we list them here. Integration env vars are derived from the catalog
// (single source of truth — add to the catalog and they're auto-whitelisted).
const ALLOWED_KEYS = new Set<string>([
  "SEO_OFFICE_LLM_PROVIDER",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "SEO_OFFICE_DATA_DIR",
  "SEO_OFFICE_CLAUDE_BIN",
  "SEO_OFFICE_CODEX_BIN",
  "SEO_OFFICE_GEMINI_BIN",
  "SEO_OFFICE_PYTHON",
  "SEO_OFFICE_GCLOUD_BIN",
  "SEO_OFFICE_GCLOUD_CLIENT_ID_FILE",
  "GOOGLE_APPLICATION_CREDENTIALS",
  ...INTEGRATION_ENV_NAMES,
]);

// Subset of ALLOWED_KEYS that are captured at module top-level somewhere
// in the codebase. Changing one of these means the running process still
// holds the old value; everything else is read lazily per request.
const CACHED_AT_STARTUP = new Set<string>([
  "SEO_OFFICE_CLAUDE_BIN",
  "SEO_OFFICE_CODEX_BIN",
  "SEO_OFFICE_GEMINI_BIN",
  "SEO_OFFICE_PYTHON",
  "SEO_OFFICE_GCLOUD_BIN",
]);

const Body = z.record(z.string(), z.string());

export const dynamic = "force-dynamic";

function setupError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function POST(req: NextRequest) {
  const allowed = sameOriginSetupWriteAllowed(req);
  if (allowed !== true) return allowed;

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }

  const incoming = parsed.data;
  const rejected: string[] = [];
  const accepted: Record<string, string> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (!ALLOWED_KEYS.has(k)) {
      rejected.push(k);
      continue;
    }
    accepted[k] = v;
  }

  let writeResult: Awaited<ReturnType<typeof writeEnvLocal>>;
  try {
    writeResult = await writeEnvLocal(accepted);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `failed to write .env.local: ${setupError(err)}` },
      { status: 500 },
    );
  }

  const restartRequired = Object.keys(accepted).some((k) =>
    CACHED_AT_STARTUP.has(k),
  );

  return NextResponse.json({
    ok: true,
    written: Object.keys(accepted),
    rejected,
    restartRequired,
    path: writeResult.path,
  });
}
