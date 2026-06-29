import "server-only";

import type { ClientManifest, Frontmatter } from "./types";
import { writeNote } from "./vault-fs";

const PATH_UNSAFE_RE = /[/\\:*?"<>|]/g;

export function vaultMetadataSourceStem(manifest: Pick<ClientManifest, "vault">): string {
  return manifest.vault.replace(PATH_UNSAFE_RE, "-").trim() || "vault-metadata";
}

export function vaultMetadataSourceRelativePath(
  manifest: Pick<ClientManifest, "vault">,
): string {
  return `wiki/sources/${vaultMetadataSourceStem(manifest)}.md`;
}

export function vaultMetadataSourceWikilink(
  manifest: Pick<ClientManifest, "vault">,
): string {
  const stem = vaultMetadataSourceStem(manifest);
  return `[[sources/${stem}|${manifest.vault}]]`;
}

export async function writeVaultMetadataSourceNote(
  clientSlug: string,
  manifest: ClientManifest,
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const relativePath = vaultMetadataSourceRelativePath(manifest);
  const frontmatter: Frontmatter = {
    brain_schema: "marketing-brain.v1",
    type: "source",
    title: manifest.vault,
    created: today,
    updated: today,
    tags: ["source", "vault-metadata", "seo-office"],
    status: "active",
    owner: manifest.manifest_owner,
    confidence: "high",
    approval_status: "approved",
    risk_level: "low",
    business_type: manifest.business_type,
    sources: [manifest.site_under_audit],
    related: ["[[Overview]]", "[[Index]]"],
    aliases: [manifest.vault],
    rollback_note:
      "This source note is scaffold metadata. To roll back, delete this note only after updating artifact source links that point to it.",
  };

  const body = [
    `# ${manifest.vault}`,
    "",
    "Canonical metadata source for this SEO Office vault.",
    "",
    `- Site: ${manifest.site_under_audit}`,
    `- Owner: ${manifest.manifest_owner}`,
    manifest.site_brand ? `- Site brand: ${manifest.site_brand}` : null,
    manifest.business_type ? `- Business type: ${manifest.business_type}` : null,
    manifest.niche ? `- Niche: ${manifest.niche}` : null,
    manifest.target_persona ? `- Target persona: ${manifest.target_persona}` : null,
    manifest.author_byline ? `- Author / expert byline: ${manifest.author_byline}` : null,
    manifest.monetization_model ? `- Monetization model: ${manifest.monetization_model}` : null,
    manifest.primary_competitors.length
      ? `- Primary competitors: ${manifest.primary_competitors.join(", ")}`
      : null,
    manifest.measurement_access.length
      ? `- Measurement access: ${manifest.measurement_access.join(", ")}`
      : "- Measurement access: none confirmed yet",
    manifest.locale?.location_name || manifest.locale?.language_name
      ? `- Market: ${[manifest.locale.location_name, manifest.locale.language_name, manifest.locale.timezone].filter(Boolean).join(" / ")}`
      : null,
    manifest.github_url ? `- GitHub / implementation URL: ${manifest.github_url}` : null,
    `- Scaffolded / last updated: ${manifest.last_updated}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  await writeNote(clientSlug, relativePath, { frontmatter, body });
  return relativePath;
}
