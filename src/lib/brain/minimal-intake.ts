/**
 * Minimal-intake expansion.
 *
 * The simplified `/clients/new` form sends just a site URL (and optionally a
 * display name / owner / business type). The scaffold pipeline still requires
 * the full marketing-brain.v1 slot set (`niche`, `siteBrand`, `authorByline`,
 * `monetizationModel`, `targetPersona`, …), so this helper derives sensible
 * placeholders from the hostname before validation.
 *
 * DataForSEO and the discovery specialists overwrite these placeholders during
 * the first sweep — they're explicit "auto-discover" tokens, not boilerplate,
 * so the user can see which fields are still pending.
 */
import "server-only";
import {
  ClientInputSchema,
  MinimalClientInputSchema,
  type ClientInput,
  type MinimalClientInput,
} from "./types";

/** Hostname without leading `www.` or trailing slash. */
function hostname(siteUrl: string): string {
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, "");
  } catch {
    return siteUrl;
  }
}

/** "rankenstein.pro" → "Rankenstein"; "claude-seo.md" → "Claude Seo". */
function brandFromHost(host: string): string {
  const base = host.split(".")[0] ?? host;
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    || host;
}

/**
 * Expand a minimal intake payload into a full `ClientInput`, ready for
 * scaffolding. Throws via Zod if the minimal payload itself is malformed
 * (e.g. invalid URL).
 */
export function expandMinimalClientInput(payload: unknown): ClientInput {
  const minimal: MinimalClientInput = MinimalClientInputSchema.parse(payload);
  const host = hostname(minimal.siteUrl);
  const brand = brandFromHost(host);
  const full = {
    clientName: minimal.clientName?.trim() || brand,
    siteUrl: minimal.siteUrl,
    siteBrand: brand,
    owner: minimal.owner?.trim() || "owner",
    // "unknown" silently skips `applyBusinessTypeOverlay` (overlay file
    // missing → no-op). Discovery specialists set this for real later.
    businessType: minimal.businessType?.trim() || "unknown",
    niche: `Auto-discover from ${host}`,
    authorByline: `${brand} editorial team`,
    monetizationModel: "To be discovered",
    targetPersona: `Default audience for ${brand} — refine after first research sweep.`,
    primaryCompetitors: [],
    measurementAccess: [],
  };
  return ClientInputSchema.parse(full);
}

/**
 * Decide whether a payload looks like a minimal-intake submission vs. the
 * legacy full payload. Minimal payloads omit at least one of the strict
 * `ClientInput` required fields (most commonly `niche` or `targetPersona`).
 */
export function looksMinimal(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.siteUrl === "string" &&
    (typeof p.niche !== "string" ||
      typeof p.targetPersona !== "string" ||
      typeof p.authorByline !== "string" ||
      typeof p.monetizationModel !== "string")
  );
}
