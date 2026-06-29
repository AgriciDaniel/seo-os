/**
 * Locale resolver for every DataForSEO-backed specialist.
 *
 * Precedence: explicit input override → manifest.locale → US/English default.
 *
 * Specialists used to hardcode `"United States" / "English"`, which produced
 * wrong-market SERP data for non-US clients. The resolver centralizes the
 * fallback and lets us evolve the default policy in one place.
 */
import "server-only";
import type { ClientManifest } from "@/lib/brain/types";

export interface ResolvedLocale {
  location_name: string;
  language_name: string;
}

export interface LocaleOverride {
  location_name?: string;
  language_name?: string;
}

export function resolveLocale(
  manifest: ClientManifest,
  override?: LocaleOverride,
): ResolvedLocale {
  return {
    location_name:
      override?.location_name?.trim() ||
      manifest.locale?.location_name?.trim() ||
      "United States",
    language_name:
      override?.language_name?.trim() ||
      manifest.locale?.language_name?.trim() ||
      "English",
  };
}
