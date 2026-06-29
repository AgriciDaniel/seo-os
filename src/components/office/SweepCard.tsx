"use client";

/**
 * SweepCard — top-right office overlay that takes over the NextActionCard
 * slot whenever a sweep is running (or recently finished) for the active
 * client. Single source of "what's happening with the brain right now."
 *
 * Polls /api/clients/<slug>/sweeps/current every 3s — same cadence as the
 * LiveAgentsHud — and renders one of four shapes:
 *
 *   - running   : phase label, progress count, latest active specialist
 *   - succeeded : "Brain built · view the result" with a vault link
 *   - partial   : "Brain built with N specialists skipped" + vault link
 *   - failed    : "Sweep failed: <reason> · retry?" + retry button
 *
 * Re-keyed on `clientSlug` so switching clients in the global Nav picker
 * immediately re-targets the poll. Stops polling once the sweep is in a
 * terminal state for >5 minutes (the user has had a chance to see it).
 */

import { useEffect, useMemo, useRef, useState } from "react";

type Status =
  | "planned"
  | "blocked"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

type Phase = "intake" | "diagnostic" | "discovery" | "synthesis" | "final";
type ReadinessStatus =
  | "draft"
  | "needs_data"
  | "partial_brain"
  | "deep_ready"
  | "blocked";

interface ChildSummary {
  task_id: string;
  specialist_id: string;
  title: string;
  status: Status;
  phase: Phase | null;
  result_summary: string | null;
  skipped: boolean;
}

interface SweepView {
  root_task_id: string;
  client_slug: string;
  template_id: string | null;
  title: string;
  status: Status;
  created_at: string;
  updated_at: string;
  readiness_status?: ReadinessStatus | null;
  totals: {
    all: number;
    succeeded: number;
    failed: number;
    cancelled: number;
    skipped: number;
    running: number;
    queued: number;
    planned_or_blocked: number;
  };
  current_phase: Phase | null;
  children: ChildSummary[];
  final_summary?: string | null;
  cost_preflight?: {
    dataforseo_usd: number;
    anthropic_usd: number;
    duration_ms: number;
    total_usd: number;
    month_to_date_usd: number;
    projected_month_total_usd: number;
    monthly_cost_cap_usd: number | null;
    over_cap: boolean;
  } | null;
}

interface Props {
  clientSlug: string;
  /** Called when the user dismisses a *terminal* sweep card. Hides the
   *  SweepCard for this sweep_id; the next sweep starts a fresh card. */
  onDismiss?: (sweepId: string) => void;
  /** When true, the parent has chosen not to render this card. Used by
   *  OfficeWorkspace to remember a "succeeded + dismissed" sweep across
   *  re-mounts of this component. */
  dismissedSweepId?: string | null;
  /** Called whenever the rendered presence changes — `true` when this
   *  card will paint something, `false` when it will return null. Lets
   *  the parent hide a NextActionCard that would otherwise stack on top
   *  of the sweep card. Idempotent: parent should compare to last value. */
  onPresenceChange?: (present: boolean) => void;
  onViewBrain?: () => void;
  onPlanNext?: () => void;
  onTerminal?: () => void;
  onLiveChange?: (live: boolean) => void;
  onFocusSpecialist?: (specialistId: string) => void;
}

const POLL_INTERVAL_MS = 3000;
const IDLE_POLL_INTERVAL_MS = 15000;
const TERMINAL: Status[] = ["succeeded", "failed", "cancelled"];

export default function SweepCard({
  clientSlug,
  onDismiss,
  dismissedSweepId,
  onPresenceChange,
  onViewBrain,
  onPlanNext,
  onTerminal,
  onLiveChange,
  onFocusSpecialist,
}: Props) {
  const [sweep, setSweep] = useState<SweepView | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const terminalNotifiedRef = useRef<string | null>(null);
  const sweepStatus = sweep?.status ?? null;
  const hasSweep = sweep !== null;
  const dismissed = !!sweep && dismissedSweepId === sweep.root_task_id;

  // Notify the parent each time the rendered presence changes. Effect re-fires
  // when the sweep value transitions in/out of null OR when `dismissed` flips.
  useEffect(() => {
    if (!onPresenceChange) return;
    const willRender = !!sweep && !dismissed;
    onPresenceChange(willRender);
  }, [sweep, dismissed, onPresenceChange]);

  useEffect(() => {
    if (!onLiveChange) return;
    const live = !!sweep && !dismissed && !TERMINAL.includes(sweep.status);
    onLiveChange(live);
  }, [sweep, dismissed, onLiveChange]);

  // Poll the current-sweep endpoint. Re-fire on clientSlug change so
  // switching clients in the Nav re-targets immediately.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(
          `/api/clients/${encodeURIComponent(clientSlug)}/sweeps/current`,
          { cache: "no-store" },
        );
        if (!r.ok) return;
        const json = (await r.json()) as { ok: boolean; sweep: SweepView | null };
        if (!cancelled) setSweep(json.sweep ?? null);
      } catch {
        /* network blip — keep last value */
      }
    }
    void load();
    const iv = setInterval(
      load,
      hasSweep && (!sweepStatus || !TERMINAL.includes(sweepStatus))
        ? POLL_INTERVAL_MS
        : IDLE_POLL_INTERVAL_MS,
    );
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [clientSlug, sweepStatus, hasSweep, reloadKey]);

  const currentPhase = sweep?.current_phase;
  const phaseLabel = useMemo(() => {
    if (!currentPhase) return null;
    const idx = (["intake", "diagnostic", "discovery", "synthesis", "final"] as Phase[]).indexOf(
      currentPhase,
    );
    const name = currentPhase === "final" ? "Final gate" : currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1);
    return `Phase ${idx + 1} of 5 · ${name}`;
  }, [currentPhase]);

  const activeNow = useMemo(() => {
    if (!sweep) return null;
    return (
      sweep.children.find((c) => c.status === "running") ??
      sweep.children.find((c) => c.status === "queued") ??
      null
    );
  }, [sweep]);

  const terminalSweepId =
    sweep && TERMINAL.includes(sweep.status) ? sweep.root_task_id : null;
  useEffect(() => {
    if (!terminalSweepId || !onTerminal) return;
    if (terminalNotifiedRef.current === terminalSweepId) return;
    terminalNotifiedRef.current = terminalSweepId;
    onTerminal();
  }, [terminalSweepId, onTerminal]);

  // Hide card if there's no sweep at all, OR the parent flagged it dismissed.
  if (!sweep || dismissed) return null;

  const sweepId = sweep.root_task_id;
  const isTerminal = TERMINAL.includes(sweep.status);
  const hasOutput = sweep.totals.succeeded > 0 || sweep.totals.skipped > 0;
  const partial =
    isTerminal &&
    (sweep.totals.failed > 0 ||
      sweep.totals.skipped > 0 ||
      sweep.totals.cancelled > 0);
  const canRetryFailed =
    isTerminal && (sweep.totals.failed > 0 || sweep.totals.cancelled > 0);
  const completed =
    sweep.totals.succeeded + sweep.totals.failed +
    sweep.totals.cancelled + sweep.totals.skipped;
  const progressPct =
    sweep.totals.all > 0 ? Math.round((completed / sweep.totals.all) * 100) : 0;
  const runningNow = sweep.totals.running;
  const queuedNow = sweep.totals.queued;
  const spawningNow = queuedNow + runningNow;
  const reviewingNow =
    !isTerminal &&
    sweep.totals.all > 0 &&
    completed === sweep.totals.all &&
    spawningNow === 0;
  const spawningAgents = !isTerminal && completed === 0 && spawningNow > 0;
  const activeVerb = activeNow?.status === "queued" ? "spawning" : "working";
  const nonTerminalTitle = reviewingNow
    ? "Reviewing outputs"
    : spawningAgents
      ? "Spawning agents"
      : runningNow > 0
        ? "Agents working"
        : "Building the brain";
  const terminalTitle =
    sweep.readiness_status === "partial_brain"
      ? "Deep Brain partially built"
      : partial && hasOutput
        ? "Deep Brain needs review"
        : sweep.status === "succeeded" &&
            sweep.totals.skipped === 0 &&
            sweep.totals.failed === 0
          ? "Deep Brain reviewed"
          : sweep.status === "succeeded"
            ? `Deep Brain reviewed · ${sweep.totals.skipped} skipped`
            : sweep.status === "failed"
              ? "Sweep failed"
              : "Sweep cancelled";

  // Color accent on the border per state.
  const accent =
    sweep.status === "failed"
      ? "border-red-500/60"
      : sweep.status === "succeeded"
        ? "border-emerald-500/60"
        : sweep.status === "cancelled"
          ? "border-graphite"
          : "border-gold";

  async function onRetry() {
    const rootTaskId = sweep?.root_task_id;
    if (retrying || !rootTaskId) return;
    setRetrying(true);
    try {
      await fetch(
        `/api/clients/${encodeURIComponent(clientSlug)}/tasks/${encodeURIComponent(
          rootTaskId,
        )}/run`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ retryFailed: true }),
        },
      );
      setReloadKey((key) => key + 1);
    } catch {
      /* ignored — the next poll will surface the new sweep or stay stale */
    } finally {
      setRetrying(false);
    }
  }

  function handleDismiss() {
    if (isTerminal) onDismiss?.(sweepId);
  }

  function handlePlanNext() {
    if (isTerminal) onDismiss?.(sweepId);
    onPlanNext?.();
  }

  return (
    <div
      className={`pointer-events-auto relative max-w-sm border ${accent} bg-abyss/85 px-4 py-3 pr-9 backdrop-blur`}
    >
      {isTerminal && onDismiss && (
        <button
          type="button"
          onClick={handleDismiss}
          title="Dismiss"
          aria-label="Dismiss sweep card"
          className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center text-[14px] leading-none text-ash transition-colors hover:bg-graphite/40 hover:text-white"
        >
          ×
        </button>
      )}

      <p className="label-micro">
        sweep
        {isTerminal && ` · ${sweep.status}`}
        {!isTerminal && phaseLabel && ` · ${phaseLabel.toLowerCase()}`}
      </p>

      <p className="mt-1 text-[14px] font-medium uppercase tracking-tight text-white">
        {isTerminal ? terminalTitle : nonTerminalTitle}
      </p>

      {/* Progress line */}
      <p className="mt-1 text-[11px] leading-relaxed text-ash">
        {completed} of {sweep.totals.all} specialists{" "}
        {isTerminal || reviewingNow ? "done" : "complete"}
        {reviewingNow && <span className="text-sky-200"> · final review</span>}
        {!isTerminal && runningNow > 0 && (
          <span className="text-orange-200"> · {runningNow} working</span>
        )}
        {!isTerminal && queuedNow > 0 && (
          <span className="text-amber-200"> · {queuedNow} spawning</span>
        )}
        {sweep.totals.skipped > 0 && (
          <span className="text-fg-shadow"> · {sweep.totals.skipped} skipped</span>
        )}
        {sweep.totals.failed > 0 && (
          <span className="text-red-300"> · {sweep.totals.failed} failed</span>
        )}
      </p>

      {sweep.cost_preflight && (
        <p className="mt-1 text-[10px] leading-relaxed text-fg-shadow">
          est. ${sweep.cost_preflight.total_usd.toFixed(2)} · month{" "}
          ${sweep.cost_preflight.projected_month_total_usd.toFixed(2)}
          {sweep.cost_preflight.monthly_cost_cap_usd != null &&
            ` / $${sweep.cost_preflight.monthly_cost_cap_usd.toFixed(2)} cap`}
        </p>
      )}

      {/* Thin progress bar */}
      <div className="mt-2 h-1 w-full overflow-hidden bg-graphite/40">
        <div
          className={`h-full transition-[width] duration-500 ${
            sweep.status === "failed"
              ? "bg-red-400"
              : isTerminal
                ? "bg-emerald-400"
                : "bg-gold"
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Ticker for currently active specialist (only while running) */}
      {!isTerminal && activeNow && (
        <button
          type="button"
          onClick={() => onFocusSpecialist?.(activeNow.specialist_id)}
          className="mt-2 block max-w-full truncate font-mono text-[10px] text-orange-200 underline-offset-2 transition-colors hover:text-gold hover:underline"
          title={`Open ${activeNow.specialist_id}`}
        >
          ↳ {activeVerb} {activeNow.specialist_id}
        </button>
      )}

      {/* Terminal CTAs — keep the sweep from becoming a dead end. */}
      {isTerminal && sweep.status !== "failed" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={onViewBrain} className="btn-cta">
            View the brain
          </button>
          <button
            type="button"
            onClick={handlePlanNext}
            className="border border-graphite bg-abyss px-3 py-2 text-[11px] uppercase tracking-wider text-ash transition-colors hover:border-gold hover:text-gold"
          >
            Review suggestions
          </button>
          {canRetryFailed && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="border border-red-500/60 bg-red-950/30 px-3 py-2 text-[11px] uppercase tracking-wider text-red-200 transition-colors hover:bg-red-900/40"
            >
              {retrying ? "Retrying..." : "Retry failed"}
            </button>
          )}
        </div>
      )}

      {/* Failed CTA — retry */}
      {sweep.status === "failed" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {hasOutput && (
            <>
              <button type="button" onClick={onViewBrain} className="btn-cta">
                View the brain
              </button>
              <button
                type="button"
                onClick={handlePlanNext}
                className="border border-graphite bg-abyss px-3 py-2 text-[11px] uppercase tracking-wider text-ash transition-colors hover:border-gold hover:text-gold"
              >
                Review suggestions
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className={hasOutput ? "border border-red-500/60 bg-red-950/30 px-3 py-2 text-[11px] uppercase tracking-wider text-red-200 transition-colors hover:bg-red-900/40" : "btn-cta"}
          >
            {retrying ? "Retrying..." : hasOutput ? "Retry failed" : "Retry sweep"}
          </button>
        </div>
      )}
    </div>
  );
}
