"use client";

import { useSpecialistsStore } from "@/store/specialists";
import { useWindowStore } from "@/store/windows";

interface StatusBarProps {
  health?: number;
  cost?: string;
  cachePct?: number;
  cacheHits?: string;
  integrations?: string;
  lastSweep?: string;
  reviewCount?: number;
  activeAgents?: number;
  /** Active client slug. When set, HEALTH and REVIEW cells become
   *  clickable links that open the latest vault-lint report and the
   *  latest brain-sweep readiness review in NoteWindows. */
  clientSlug?: string;
}

/**
 * HEALTH band → label + color. Drives the row's right-side hint AND
 * the score's text color so the user can tell "0 ERRORS" (red) from
 * "100 CLEAN" (green) at a glance. The old hardcoded "clean" hint
 * was the source of the impossible-looking "0 CLEAN" reading.
 */
function healthBand(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "clean", color: "var(--ok)" };
  if (score >= 50) return { label: "watch", color: "var(--accent)" };
  if (score > 0) return { label: "blocked", color: "var(--state-skipped, #a78bfa)" };
  return { label: "errors", color: "var(--err)" };
}

function reviewBand(count: number): { label: string; color: string } {
  if (count === 0) return { label: "clear", color: "var(--ok)" };
  if (count <= 2) return { label: "awaiting", color: "var(--accent)" };
  return { label: "awaiting", color: "var(--err)" };
}

export function StatusBar({
  health = 100,
  cost = "—",
  cachePct,
  cacheHits = "—",
  integrations = "—",
  lastSweep = "—",
  reviewCount = 0,
  activeAgents = 0,
  clientSlug,
}: StatusBarProps) {
  const openWindow = useWindowStore((s) => s.open);

  /**
   * Open the latest vault-lint report. Resolution order:
   *   1. specialists store's `lastArtifactPath` for vault-linter
   *      (instant — set by the SSE success path)
   *   2. fall back to opening the canonical vault Index so the user
   *      at least lands somewhere navigable.
   */
  function openVaultLintReport() {
    if (!clientSlug) return;
    const artifactPath =
      useSpecialistsStore.getState().byId["vault-linter"]?.lastArtifactPath ??
      "wiki/index.md";
    openWindow({
      kind: "note",
      title: "Vault Lint Report",
      icon: "🩺",
      identityKey: `note:${artifactPath}`,
      contentProps: { clientSlug, path: artifactPath },
      w: 720,
      h: 560,
    });
  }

  /**
   * Open the latest brain-sweep readiness review. The sweep readiness
   * artifact paths live alongside vault-linter; we resolve via the
   * phase-gate specialist's last artifact (the final phase-gate
   * writes the readiness review). Falls back to wiki/reviews/ so the
   * user lands on the reviews folder rather than a dead click.
   */
  function openLatestReview() {
    if (!clientSlug) return;
    const artifactPath =
      useSpecialistsStore.getState().byId["phase-gate"]?.lastArtifactPath ??
      "wiki/reviews/";
    openWindow({
      kind: "note",
      title: "Latest Review",
      icon: "📋",
      identityKey: `note:${artifactPath}`,
      contentProps: { clientSlug, path: artifactPath },
      w: 720,
      h: 560,
    });
  }

  const hb = healthBand(health);
  const rb = reviewBand(reviewCount);
  const clickable = Boolean(clientSlug);

  return (
    <div
      className="flex items-center gap-5 px-4"
      style={{
        height: 32,
        background: "var(--chrome-bg)",
        borderTop: "1px solid var(--chrome-border)",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.06em",
        color: "var(--fg-muted)",
        textTransform: "uppercase",
      }}
    >
      <Cell
        label="HEALTH"
        value={String(health)}
        valueColor={hb.color}
        hint={hb.label}
        onClick={clickable ? openVaultLintReport : undefined}
        title={clickable ? "Open vault lint report" : undefined}
      />
      <Cell label="COST" value={cost} />
      {cachePct !== undefined && (
        <Cell label="CACHE" value={`${cachePct}%`} hint={cacheHits} />
      )}
      <Cell label="INTEGR" value={integrations} valueColor="var(--ok)" hint="ready" />
      <Cell label="LAST SWEEP" value={lastSweep} />
      <Cell
        label="REVIEW"
        value={String(reviewCount)}
        valueColor={rb.color}
        hint={rb.label}
        onClick={clickable ? openLatestReview : undefined}
        title={clickable ? "Open latest review" : undefined}
      />
      <div className="ml-auto flex items-center gap-2" style={{ color: "var(--ok)" }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "var(--ok)",
          animation: "pulse 2.4s ease-in-out infinite",
        }} />
        live · {activeAgents} active agent{activeAgents === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  valueColor,
  hint,
  onClick,
  title,
}: {
  label: string;
  value: string;
  valueColor?: string;
  hint?: string;
  onClick?: () => void;
  title?: string;
}) {
  const isInteractive = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isInteractive}
      title={title}
      className="flex items-baseline gap-1.5"
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        fontFamily: "inherit",
        fontSize: "inherit",
        letterSpacing: "inherit",
        textTransform: "inherit",
        color: "inherit",
        cursor: isInteractive ? "pointer" : "default",
      }}
    >
      <span style={{ color: "var(--fg-faint)" }}>{label}</span>
      <span
        style={{
          color: valueColor ?? "var(--fg)",
          fontWeight: 600,
          textDecoration: isInteractive ? "underline" : "none",
          textDecorationStyle: "dotted",
          textUnderlineOffset: 3,
        }}
      >
        {value}
      </span>
      {hint && <span style={{ color: "var(--fg-faint)" }}>{hint}</span>}
    </button>
  );
}
