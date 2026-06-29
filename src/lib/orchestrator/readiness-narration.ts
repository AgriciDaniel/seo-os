import type { BrainReadinessReport, BrainSuggestion } from "@/lib/brain/readiness-types";

export function renderReadinessChatSummary(readiness: BrainReadinessReport): string {
  const statusLine =
    readiness.status === "deep_ready"
      ? "Your SEO brain is ready for review."
      : readiness.status === "needs_data"
        ? "Your SEO brain is useful, but it still needs live data before I would call it complete."
        : readiness.status === "partial_brain"
          ? "Your SEO brain is partially built; retry the failed specialist before relying on it as complete."
        : readiness.status === "blocked"
          ? "Your SEO brain is blocked and needs repair before it should guide ranking work."
          : "Your SEO brain is a solid draft, but it is not deep-ready yet.";

  const missing =
    readiness.missingDataSources.length > 0
      ? `${readiness.missingDataSources.length} missing data source${
          readiness.missingDataSources.length === 1 ? "" : "s"
        }`
      : "no missing core data sources";
  const blockerCount = readiness.blockers.length;
  const gapCount = readiness.gaps.length;

  return [
    `✓ **${statusLine}**`,
    "",
    `Readiness: **${readiness.status.replace("_", " ")}** · ${readiness.score}/100.`,
    `I found ${readiness.opportunitiesFound} priority signal${
      readiness.opportunitiesFound === 1 ? "" : "s"
    }, ${blockerCount} blocker${blockerCount === 1 ? "" : "s"}, ${gapCount} gap${
      gapCount === 1 ? "" : "s"
    }, and ${missing}.`,
    readiness.firstAction ? `Start with: **${readiness.firstAction}**.` : "",
    readiness.reviewPath ? `The human-readable review is at \`${readiness.reviewPath}\`.` : "",
    "",
    renderSuggestionFence(readiness.suggestions),
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderSuggestionFence(suggestions: BrainSuggestion[]): string {
  if (suggestions.length === 0) return "";
  return [
    "```seo-suggestions",
    JSON.stringify(suggestions, null, 2),
    "```",
  ].join("\n");
}
