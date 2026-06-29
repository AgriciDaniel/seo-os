/**
 * Render `wiki/overview.md` from the canonical `ClientManifest`.
 *
 * Like `index.md`, `overview.md` was template-only pre-Phase-2 — the
 * vendored renderer wrote it once with slot-filled placeholders and
 * never touched it again. Any change to niche, business type, or owner
 * stayed invisible to anyone reading the overview.
 *
 * `rebuildOverview()` is called only when the manifest changes
 * (scaffold, rescaffold, future "edit client" flows) — not on every
 * specialist write. The body is intentionally thin: pointers, not data.
 */
import "server-only";
import matter from "gray-matter";
import { readRaw, writeRaw } from "./vault-fs";
import { withFileMutex } from "./file-mutex";
import type { ClientManifest } from "./types";

const OVERVIEW_RELATIVE = "wiki/overview.md";

/**
 * Pure render: build the overview body from a manifest snapshot. Pure
 * for testability; callers persist via `writeRaw`.
 */
export function renderOverview(manifest: ClientManifest): string {
  const name = manifest.vault.replace(/ marketing-brain$/, "");
  const lines: Array<string | null> = [
    `# Overview`,
    "",
    `**Client**: ${name}`,
    `**Site under audit**: <${manifest.site_under_audit}>`,
    manifest.business_type
      ? `**Business type**: \`${manifest.business_type}\``
      : null,
    manifest.niche ? `**Niche**: ${manifest.niche}` : null,
    manifest.site_brand ? `**Site brand**: ${manifest.site_brand}` : null,
    manifest.target_persona ? `**Target persona**: ${manifest.target_persona}` : null,
    manifest.author_byline ? `**Author / expert byline**: ${manifest.author_byline}` : null,
    manifest.monetization_model
      ? `**Monetization model**: ${manifest.monetization_model}`
      : null,
    manifest.primary_competitors.length
      ? `**Primary competitors**: ${manifest.primary_competitors.join(", ")}`
      : null,
    manifest.measurement_access.length
      ? `**Measurement access confirmed**: ${manifest.measurement_access.join(", ")}`
      : `**Measurement access confirmed**: none yet`,
    manifest.locale?.location_name || manifest.locale?.language_name
      ? `**Market**: ${[
          manifest.locale.location_name,
          manifest.locale.language_name,
          manifest.locale.timezone,
        ]
          .filter(Boolean)
          .join(" / ")}`
      : null,
    manifest.github_url ? `**Implementation URL**: <${manifest.github_url}>` : null,
    `**Owner**: ${manifest.manifest_owner}`,
    `**Manifest last updated**: ${manifest.last_updated}`,
    "",
    "## Where to read next",
    "",
    "1. [[Hot]] — what's recent and what's blocking.",
    "2. [[Index]] — section-grouped navigation across every note.",
    "3. [[Start Here]] — onboarding checklist + Day-0 measurement gate.",
    "",
    "## What this vault is",
    "",
    "A marketing-brain vault scaffolded by SEO Office. Every claim downstream of",
    "Day 0 ([[Day 0 Measurement Access Gate]]) is hypothesis until baselines",
    "land. Read [[shipping-rules]] before any implementation- or",
    "publication-impacting decision.",
    "",
    "## Source ledger",
    "",
    `${Object.keys(manifest.sources).length} source${Object.keys(manifest.sources).length === 1 ? "" : "s"} recorded in \`.raw/.manifest.json\`.`,
  ];
  return lines.filter((l): l is string => l !== null).join("\n").trimEnd() + "\n";
}

/**
 * Rebuild `wiki/overview.md` against the current manifest. Idempotent;
 * never throws — overview is a derived view.
 */
export async function rebuildOverview(
  clientSlug: string,
  manifest: ClientManifest,
): Promise<void> {
  return withFileMutex(clientSlug, OVERVIEW_RELATIVE, async () => {
    try {
      const existing = (await readRaw(clientSlug, OVERVIEW_RELATIVE)) ?? "";
      const parsed = matter(existing || "---\n---\n");
      const today = new Date().toISOString().slice(0, 10);
      const fm = {
        brain_schema: "marketing-brain.v1",
        type: "overview",
        title: "Overview",
        tags: ["overview", "marketing-brain"],
        status: "active",
        created: parsed.data.created ?? today,
        owner: manifest.manifest_owner,
        confidence: "high",
        approval_status: "approved",
        rollback_note:
          "Derived from .raw/.manifest.json. Rebuild overview.md from the manifest to roll back manual edits.",
        risk_level: "low",
        ...parsed.data,
        updated: today,
      };
      const body = renderOverview(manifest);
      await writeRaw(clientSlug, OVERVIEW_RELATIVE, matter.stringify(body, fm));
    } catch {
      /* derived view — never crash on rebuild failure */
    }
  });
}
