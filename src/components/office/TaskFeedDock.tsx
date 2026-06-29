"use client";

import { useEffect, useRef, useState } from "react";
import { useSpecialistsStore } from "@/store/specialists";
import { useWindowStore } from "@/store/windows";

/**
 * TaskFeedDock — persistent CLI-style task feed pinned to the bottom-right
 * of the office sidebar (below Files · Vault).
 *
 * As of the UI-consolidation pass, this dock owns THREE concerns that
 * previously lived as separate floating overlays on the canvas:
 *
 *   1. The next-action banner (one-line "what should I do now" pill with
 *      an inline Run button). Replaces the legacy NextActionCard that
 *      floated in the top-right and stacked under the MenuBar nav.
 *   2. The live-job mini-log — last few `[hh:mm:ss] message` lines from
 *      the running specialist. Replaces JobStream's floating box that
 *      sat in the bottom-left over the 3D canvas.
 *   3. The historical task feed — every specialist transition with a
 *      glyph + state label, plus a tally header (running / review /
 *      done / failed).
 *
 * Source-of-truth: zustand `useSpecialistsStore` for live transitions,
 * `initialJobs` for the SSR seed, `activeJob` for the live SSE tail,
 * `nextAction` for the banner. Each is optional so the dock degrades
 * gracefully when a concern isn't applicable.
 */

interface FeedEntry {
  ts: number;
  specialist: string;
  state: string; // "running" | "review" | "failed" | "idle"
  jobId?: string;
}

/**
 * Minimal shape we need from JobRecord — we don't import the full type
 * here to keep this component decoupled from the orchestrator types.
 */
export interface TaskFeedDockJob {
  id: string;
  specialist: string;
  status: string;
  created_at: string;
  finished_at?: string | null;
  /** Optional `message` from the JobRecord — used to disambiguate
   *  `cancelled` rows: the orchestrator's soft-skip path writes
   *  status="cancelled" with a `skipped:` prefix, and the dock
   *  surfaces those as the yellow "skipped" state instead of red
   *  "failed". When absent we fall back to the existing collapse. */
  message?: string | null;
}

interface NextActionBanner {
  id: string;
  severity: "blocking" | "high" | "medium" | "low" | "idle";
  headline: string;
  rationale: string;
  specialistId?: string;
  canRun: boolean;
  onRun?: () => void;
  onDismiss?: () => void;
  disabled?: boolean;
}

interface ActiveJobLog {
  slug: string;
  jobId: string;
  /** Optional callback when the job terminates — wired to the workspace's
   *  refresh path so the dock can react without OfficeWorkspace polling. */
  onDone?: () => void;
}

interface Props {
  /** Historical jobs from the server. Seeded INTO the feed at mount so a
   *  user loading the office mid-sweep (or post-sweep) doesn't see an
   *  empty dock. New transitions arrive via the specialists store. */
  initialJobs?: TaskFeedDockJob[];
  /** Optional next-action banner. Renders ABOVE the tally header when
   *  set. The workspace decides when to surface (e.g. severity high or
   *  blocking + not dismissed). */
  nextAction?: NextActionBanner | null;
  /** Optional live-job log. Renders BELOW the tally header when set.
   *  Same SSE source as the legacy floating JobStream — just hosted
   *  inside the dock now. */
  activeJob?: ActiveJobLog | null;
  /** Active client slug — used to resolve a clicked entry's report
   *  path (artifact lives at `clients/<slug>/jobs/<jobId>`) and to
   *  scope the NoteWindow open. Optional so the dock still renders
   *  in storybook-like contexts without a client. */
  clientSlug?: string;
}

/** Map a JobRecord status to the canonical SpecialistState used by the
 *  store + the glyph/color table. `cancelled` rows whose `message`
 *  starts with `skipped:` route to the "skipped" state, `blocked:`
 *  to "blocked" — same source-of-truth convention the rest of the
 *  orchestrator uses. */
function jobStatusToState(status: string, message?: string | null): string {
  switch (status) {
    case "succeeded":
      return "idle"; // green ✓ DONE
    case "failed":
      return "failed";
    case "cancelled":
      if (message?.startsWith("blocked:")) return "blocked";
      if (message?.startsWith("skipped:")) return "skipped";
      return "failed";
    case "running":
    case "queued":
    case "started":
      return "running";
    default:
      return "idle";
  }
}

/**
 * Parse a timestamp that may come from SQLite (naive "YYYY-MM-DD HH:MM:SS",
 * which is UTC) OR from an SSE event (ISO 8601 with offset/Z). SQLite's
 * CURRENT_TIMESTAMP is UTC but carries no zone, so `new Date()` would parse
 * it as LOCAL — producing a phantom multi-hour offset against SSE event
 * times for any non-UTC user. Treat the naive form as UTC explicitly.
 */
function parseServerTs(s: string | null | undefined): number {
  if (!s) return NaN;
  const naiveUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s);
  return new Date(naiveUtc ? `${s.replace(" ", "T")}Z` : s).getTime();
}

const STATE_GLYPH: Record<string, string> = {
  running: "►",
  // ✓ (not ●) so REVIEW reads as "completed, needs your eyes" — same
  // checkmark as DONE, distinguished only by the blue color below. This
  // keeps it visually apart from the red ✗ FAILED (did not complete).
  review: "✓",
  failed: "✗",
  skipped: "⊘",
  blocked: "⊠",
  idle: "✓",
};

/**
 * Distinct hues for every state. The theme tokens `accent` and `ribbon`
 * happen to be the same hex across every shipped theme (yellow-on-yellow
 * in cosmos), so reading RUNNING and REVIEW from those vars produced a
 * literally identical color. Fixed palette below — chosen so that:
 *   - every state reads as a different hue at a glance
 *   - running stays in the theme's "doing" color (accent)
 *   - the new colors keep the same brightness so the dock doesn't
 *     fight whichever theme is active
 * If a future theme overrides `--state-review`, `--state-skipped`,
 * `--state-progress-fg` the fallback below stops applying. */
const STATE_COLOR: Record<string, string> = {
  running: "var(--state-running, var(--accent))",
  review: "var(--state-review, #7ec8e3)",   // sky blue
  failed: "var(--state-failed, var(--err))",
  skipped: "var(--state-skipped, #a78bfa)", // soft purple
  blocked: "var(--state-blocked, #f59e0b)", // amber — upstream gate failure
  idle: "var(--state-done, var(--ok))",
};

const STATE_LABEL: Record<string, string> = {
  running: "RUNNING",
  review: "REVIEW",
  failed: "FAILED",
  skipped: "SKIPPED",
  blocked: "BLOCKED",
  idle: "DONE",
};

const SEVERITY_ACCENT: Record<NextActionBanner["severity"], string> = {
  blocking: "var(--err)",
  high: "var(--accent)",
  medium: "var(--ribbon)",
  low: "var(--fg-faint)",
  idle: "var(--ok)",
};

const MAX_ENTRIES = 60;
const MAX_LIVE_LINES = 8;

export default function TaskFeedDock({ initialJobs = [], nextAction, activeJob, clientSlug }: Props) {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const lastSeenRef = useRef<Record<string, number>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const openWindow = useWindowStore((s) => s.open);

  /**
   * Click handler for a feed row. Opens the specialist's report in a
   * NoteWindow. Resolution order:
   *   1. specialists store's `lastArtifactPath` (set by the SSE
   *      success path → instant, no fetch needed)
   *   2. fetch /api/clients/<slug>/jobs/<jobId> → read `result_path`
   *      (for entries seeded from initialJobs that haven't streamed yet)
   * If neither resolves, we open the live-job tail in a window (still
   * a useful affordance for running rows).
   */
  async function openEntryReport(entry: FeedEntry) {
    if (!clientSlug) return;
    const storeArtifact =
      useSpecialistsStore.getState().byId[entry.specialist]?.lastArtifactPath;
    let artifactPath = storeArtifact ?? null;
    if (!artifactPath && entry.jobId) {
      try {
        const r = await fetch(
          `/api/clients/${encodeURIComponent(clientSlug)}/jobs/${encodeURIComponent(entry.jobId)}`,
        );
        if (r.ok) {
          const body = (await r.json()) as { job?: { result_path?: string | null } };
          artifactPath = body.job?.result_path ?? null;
        }
      } catch {
        /* swallow — fall through to fallback */
      }
    }
    if (!artifactPath) return;
    openWindow({
      kind: "note",
      title: entry.specialist,
      icon: "📄",
      identityKey: `note:${artifactPath}`,
      contentProps: { clientSlug, path: artifactPath },
      w: 720,
      h: 560,
    });
  }

  // Seed at mount + subscribe to subsequent transitions.
  useEffect(() => {
    // 1. Seed from any jobs the server delivered for SSR — these capture
    //    activity that finished BEFORE the page was mounted.
    const jobSeed: FeedEntry[] = initialJobs.map((j) => ({
      ts: parseServerTs(j.finished_at ?? j.created_at),
      specialist: j.specialist,
      state: jobStatusToState(j.status, j.message),
      jobId: j.id,
    }));
    // 2. Layer in whatever the specialists store already has (it may be
    //    pre-populated by an earlier mount or a fast SSE delivery between
    //    OfficeWorkspace mount and this dock mount).
    const storeSeed: FeedEntry[] = Object.entries(
      useSpecialistsStore.getState().byId,
    ).map(([id, e]) => ({
      ts: e.lastTransitionAt,
      specialist: id,
      state: e.state,
      jobId: e.lastJobId,
    }));
    // De-dupe by (specialist, state, ts-bucket) and sort chronologically.
    const all = [...jobSeed, ...storeSeed]
      .filter((e) => Number.isFinite(e.ts) && e.ts > 0)
      .sort((a, b) => a.ts - b.ts);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries(all.slice(-MAX_ENTRIES));
    for (const e of all) {
      // lastSeen tracks per specialist so the subscription doesn't
      // re-emit transitions we already showed.
      const prev = lastSeenRef.current[e.specialist] ?? 0;
      if (e.ts > prev) lastSeenRef.current[e.specialist] = e.ts;
    }

    const unsub = useSpecialistsStore.subscribe((state) => {
      const next: FeedEntry[] = [];
      for (const [id, entry] of Object.entries(state.byId)) {
        const seenTs = lastSeenRef.current[id] ?? 0;
        if (entry.lastTransitionAt > seenTs) {
          next.push({
            ts: entry.lastTransitionAt,
            specialist: id,
            state: entry.state,
            jobId: entry.lastJobId,
          });
          lastSeenRef.current[id] = entry.lastTransitionAt;
        }
      }
      if (next.length === 0) return;
      setEntries((prev) => [...prev, ...next].slice(-MAX_ENTRIES));
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to the bottom on new entries (latest at the bottom of CLI).
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries.length]);

  // Compute counts per bucket from the LATEST state of each specialist
  // (not the full event log) so a single specialist that went
  // running → review doesn't count twice.
  const latestByName = new Map<string, FeedEntry>();
  for (const e of entries) latestByName.set(e.specialist, e);

  /**
   * Per-row display name. Phase-gate runs four times per sweep with
   * the same specialist_id, so the TaskFeed used to show two
   * identical "phase-gate FAILED" rows whenever two gates failed —
   * useless. The build-brain template always runs the four gates in
   * order: intake → diagnostic → discovery → synthesis, so we can
   * derive a meaningful label from the entry's chronological
   * position. A 30-minute gap between phase-gate entries resets the
   * ordinal (heuristic for "this is a new sweep"). This is a pure
   * UI rename — no schema change in the orchestrator or store.
   */
  const PHASE_GATE_NAMES = [
    "intake-gate",
    "diagnostic-gate",
    "discovery-gate",
    "synthesis-gate",
  ] as const;
  const SWEEP_GAP_MS = 30 * 60 * 1000;
  const phaseGateLabelByKey = new Map<string, string>();
  {
    let ordinal = 0;
    let lastTs = 0;
    for (const e of entries) {
      if (e.specialist !== "phase-gate") continue;
      if (e.ts - lastTs > SWEEP_GAP_MS) ordinal = 0;
      const key = `${e.ts}:${e.jobId ?? ""}`;
      phaseGateLabelByKey.set(
        key,
        ordinal < PHASE_GATE_NAMES.length
          ? PHASE_GATE_NAMES[ordinal]
          : "phase-gate",
      );
      ordinal += 1;
      lastTs = e.ts;
    }
  }
  function displayNameFor(e: FeedEntry): string {
    if (e.specialist !== "phase-gate") return e.specialist;
    return phaseGateLabelByKey.get(`${e.ts}:${e.jobId ?? ""}`) ?? "phase-gate";
  }
  const latest = Array.from(latestByName.values());
  const counts = {
    running: latest.filter((e) => e.state === "running").length,
    review: latest.filter((e) => e.state === "review").length,
    done: latest.filter((e) => e.state === "idle").length,
    skipped: latest.filter((e) => e.state === "skipped").length,
    blocked: latest.filter((e) => e.state === "blocked").length,
    failed: latest.filter((e) => e.state === "failed").length,
  };

  return (
    <section
      className="flex flex-col border-t"
      style={{
        borderColor: "var(--chrome-border)",
        background: "var(--titlebar-bg)",
        fontFamily: "var(--font-ui)",
        // Height lock — without it, a long-running sweep (60+ entries)
        // expands the section unboundedly because the parent grid row
        // is `auto`. Cap at ~45% of viewport so Files · Vault always
        // keeps majority real-estate, and let the inner entries div
        // (overflow-y-auto already) handle the scroll.
        maxHeight: "45vh",
        minHeight: 140,
        flex: "0 1 auto",
        overflow: "hidden",
      }}
    >
      {nextAction && <NextActionRow action={nextAction} />}

      <SweepPhaseStrip slug={clientSlug} />

      <header
        className="flex items-center justify-between gap-2 px-3 py-1.5"
        style={{
          borderBottom: "1px solid var(--chrome-border)",
          color: "var(--fg-muted)",
        }}
      >
        <span
          className="text-[9.5px] uppercase tracking-[0.14em]"
          style={{ color: "var(--fg-faint)" }}
        >
          Task Feed
        </span>
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <Tally color={STATE_COLOR.running} glyph={STATE_GLYPH.running} n={counts.running} label="running" />
          <Tally color={STATE_COLOR.review} glyph={STATE_GLYPH.review} n={counts.review} label="review" />
          <Tally color={STATE_COLOR.idle} glyph={STATE_GLYPH.idle} n={counts.done} label="done" />
          <Tally color={STATE_COLOR.skipped} glyph={STATE_GLYPH.skipped} n={counts.skipped} label="skipped" />
          <Tally color={STATE_COLOR.blocked} glyph={STATE_GLYPH.blocked} n={counts.blocked} label="blocked" />
          <Tally color={STATE_COLOR.failed} glyph={STATE_GLYPH.failed} n={counts.failed} label="failed" />
        </div>
      </header>

      {activeJob && (
        <LiveJobTail
          slug={activeJob.slug}
          jobId={activeJob.jobId}
          onDone={activeJob.onDone}
        />
      )}

      {entries.length === 0 ? (
        <div
          className="px-3 py-3 text-[11px]"
          style={{
            color: "var(--fg-muted)",
            fontFamily: "var(--font-mono, ui-monospace, monospace)",
          }}
        >
          <p>$ waiting for activity…</p>
          <p style={{ color: "var(--fg-faint)" }}>
            # specialists will stream here once a sweep starts.
          </p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-3 py-2"
          style={{
            fontFamily: "var(--font-mono, ui-monospace, monospace)",
            fontSize: 10.5,
            lineHeight: 1.55,
            color: "var(--fg)",
          }}
        >
          {entries.map((e, i) => {
            const time = new Date(e.ts).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            });
            const color = STATE_COLOR[e.state] ?? "var(--fg-muted)";
            const glyph = STATE_GLYPH[e.state] ?? "·";
            const label = STATE_LABEL[e.state] ?? e.state.toUpperCase();
            const displayName = displayNameFor(e);
            // Rows are clickable only when the entry has an outcome
            // worth showing. Running rows still open something useful
            // (the live tail's job-events window) so the click target
            // never feels dead.
            const clickable = Boolean(clientSlug);
            return (
              <button
                key={`${e.specialist}:${e.ts}:${i}`}
                type="button"
                onClick={clickable ? () => void openEntryReport(e) : undefined}
                disabled={!clickable}
                title={
                  clickable
                    ? `Open ${displayName} report`
                    : displayName
                }
                className="row-button flex w-full items-baseline gap-2 whitespace-nowrap text-left"
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "1px 0",
                  cursor: clickable ? "pointer" : "default",
                  fontFamily: "inherit",
                  fontSize: "inherit",
                  color: "inherit",
                }}
              >
                <span style={{ color: "var(--fg-faint)" }}>{time}</span>
                <span
                  style={{
                    color,
                    width: 10,
                    display: "inline-block",
                    textAlign: "center",
                  }}
                >
                  {glyph}
                </span>
                <span style={{ color: "var(--fg)" }} className="truncate">
                  {displayName}
                </span>
                <span
                  style={{
                    color,
                    marginLeft: "auto",
                    fontSize: 9,
                    letterSpacing: "0.1em",
                  }}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* sweep phase progress                                                        */
/* -------------------------------------------------------------------------- */

const SWEEP_PHASES: Array<{ key: string; label: string }> = [
  { key: "intake", label: "Intake" },
  { key: "diagnostic", label: "Diagnostic" },
  { key: "discovery", label: "Discovery" },
  { key: "synthesis", label: "Synthesis" },
];

/** Task statuses that count as a phase child being "done" for the bar. */
const TERMINAL_TASK_STATUS = new Set(["succeeded", "failed", "cancelled", "skipped"]);

interface SweepSnapshotChild {
  phase: string | null;
  status: string;
}
interface SweepSnapshot {
  status: string;
  current_phase: string | null;
  children: SweepSnapshotChild[];
}

/**
 * Compact phase-progress strip shown above the task feed while a sweep is
 * running. Answers the "why is only one agent working?" confusion: it makes
 * the intake → diagnostic → discovery → synthesis pipeline visible with a
 * per-phase done/total bar and the active phase highlighted. Sourced from the
 * same `/sweeps/current` endpoint SweepCard polls — no new server work. Hides
 * itself when there's no running sweep.
 */
function SweepPhaseStrip({ slug }: { slug?: string }) {
  const [sweep, setSweep] = useState<SweepSnapshot | null>(null);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    const load = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const r = await fetch(
          `/api/clients/${encodeURIComponent(slug)}/sweeps/current`,
          { cache: "no-store" },
        );
        if (!r.ok) return;
        const d = (await r.json()) as { sweep?: SweepSnapshot | null };
        if (alive) setSweep(d.sweep ?? null);
      } catch {
        /* transient — keep last snapshot */
      }
    };
    void load();
    const timer = setInterval(load, 3_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [slug]);

  if (!sweep) return null;

  const phases = SWEEP_PHASES.map(({ key, label }) => {
    const inPhase = sweep.children.filter((c) => c.phase === key);
    const done = inPhase.filter((c) => TERMINAL_TASK_STATUS.has(c.status)).length;
    return { key, label, done, total: inPhase.length };
  }).filter((p) => p.total > 0);
  if (phases.length === 0) return null;

  // Surface only while the sweep is in progress — i.e. at least one child is
  // not yet terminal. The ROOT sweep `status` stays "planned" during
  // execution (it only goes terminal at finalize), so gating on
  // status === "running" would wrongly never show the strip.
  const inProgress = sweep.children.some((c) => !TERMINAL_TASK_STATUS.has(c.status));
  if (!inProgress) return null;

  const activeIdx = phases.findIndex((p) => p.key === sweep.current_phase);

  return (
    <div
      style={{
        borderBottom: "1px solid var(--chrome-border)",
        background: "var(--chrome-bg)",
        padding: "6px 12px",
        fontFamily: "var(--font-ui)",
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
        <span
          style={{
            fontSize: 9,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--accent)",
          }}
        >
          Sweep · {phases[activeIdx >= 0 ? activeIdx : 0].label}
        </span>
        <span style={{ fontSize: 9, letterSpacing: "0.12em", color: "var(--fg-faint)" }}>
          phase {(activeIdx >= 0 ? activeIdx : 0) + 1}/{phases.length}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {phases.map((p, i) => {
          const pct = p.total > 0 ? p.done / p.total : 0;
          const isActive = i === activeIdx;
          return (
            <div key={p.key} title={`${p.label}: ${p.done}/${p.total}`} style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 8,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: isActive ? "var(--accent)" : "var(--fg-faint)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  marginBottom: 2,
                }}
              >
                {p.label} {p.done}/{p.total}
              </div>
              <div style={{ height: 3, background: "var(--chrome-border)", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.round(pct * 100)}%`,
                    background: isActive ? "var(--accent)" : "var(--ok)",
                    transition: "width 300ms ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Single-row banner that replaces the legacy NextActionCard floating
 * overlay. Visual hierarchy: severity-colored left border, headline in
 * mono uppercase, rationale truncated to one line, inline Run button
 * when the action has a registered specialist.
 */
function NextActionRow({ action }: { action: NextActionBanner }) {
  const accent = SEVERITY_ACCENT[action.severity] ?? "var(--fg-faint)";
  return (
    <div
      className="flex items-center gap-3 px-3 py-2"
      style={{
        borderBottom: "1px solid var(--chrome-border)",
        borderLeft: `3px solid ${accent}`,
        background: "var(--chrome-bg)",
        fontSize: 11,
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            style={{
              color: accent,
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            NEXT · {action.severity}
          </span>
          <span
            className="truncate"
            style={{
              color: "var(--fg)",
              fontWeight: 600,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              fontSize: 10.5,
            }}
            title={action.headline}
          >
            {action.headline}
          </span>
        </div>
        {action.rationale && (
          <p
            className="truncate"
            style={{ color: "var(--fg-muted)", fontSize: 10.5, marginTop: 2 }}
            title={action.rationale}
          >
            {action.rationale}
          </p>
        )}
      </div>
      {action.canRun && action.specialistId && action.onRun && (
        <button
          onClick={action.onRun}
          disabled={action.disabled}
          title={`Run ${action.specialistId}`}
          style={{
            background: accent,
            color: "var(--accent-fg, #000)",
            border: "none",
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: "4px 10px",
            cursor: action.disabled ? "not-allowed" : "pointer",
            opacity: action.disabled ? 0.5 : 1,
            whiteSpace: "nowrap",
          }}
        >
          Run
        </button>
      )}
      {action.onDismiss && (
        <button
          onClick={action.onDismiss}
          title="Dismiss"
          aria-label="Dismiss next action"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--fg-faint)",
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1,
            padding: 0,
            width: 16,
            height: 16,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

/**
 * Live tail of the active SSE job — last N lines from the running
 * specialist's progress events. Replaces the bottom-left floating
 * JobStream so live state has a single home. Auto-closes its
 * EventSource when the job terminates.
 */
function LiveJobTail({
  slug,
  jobId,
  onDone,
}: {
  slug: string;
  jobId: string;
  onDone?: () => void;
}) {
  interface Line {
    ts: string;
    message: string;
    kind: "log" | "progress" | "result" | "error" | "done";
  }
  const [lines, setLines] = useState<Line[]>([]);
  const [progress, setProgress] = useState(0);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    // Reset on jobId change. The lint rule (set-state-in-effect) flags
    // synchronous setState in an effect — here the resets are correct
    // because `jobId` changing is the only trigger, and a stale tail
    // from the previous job would be worse than a one-frame flicker.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines([]);
     
    setProgress(0);
    const es = new EventSource(
      `/api/jobs/${jobId}/events?slug=${encodeURIComponent(slug)}`,
    );
    es.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data) as {
          ts: string;
          kind: Line["kind"];
          progress?: number;
          message: string;
        };
        setLines((prev) => [...prev, event].slice(-MAX_LIVE_LINES));
        if (typeof event.progress === "number") setProgress(event.progress);
        if (event.kind === "done") {
          onDoneRef.current?.();
          es.close();
        }
      } catch {
        /* swallow */
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [slug, jobId]);

  return (
    <div
      style={{
        borderBottom: "1px solid var(--chrome-border)",
        background: "var(--code-bg, var(--chrome-bg))",
        padding: "6px 12px",
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontSize: 10,
        lineHeight: 1.55,
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ color: "var(--fg-faint)", marginBottom: 4 }}
      >
        <span style={{ letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 9 }}>
          live · {jobId.slice(0, 8)}
        </span>
        <span style={{ color: "var(--accent)" }}>{Math.round(progress * 100)}%</span>
      </div>
      <div
        style={{
          height: 1,
          background: "var(--chrome-border)",
          marginBottom: 4,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "var(--accent)",
            width: `${Math.max(2, progress * 100)}%`,
            transition: "width 200ms ease",
          }}
        />
      </div>
      {lines.length === 0 ? (
        <p style={{ color: "var(--fg-faint)" }}>waiting for first event…</p>
      ) : (
        lines.map((l, i) => (
          <p
            key={i}
            style={{
              color: l.kind === "error" ? "var(--err)" : "var(--fg-muted)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={l.message}
          >
            <span style={{ color: "var(--fg-faint)" }}>[{l.ts.slice(11, 19)}]</span>{" "}
            {l.message}
          </p>
        ))
      )}
    </div>
  );
}

function Tally({
  color,
  glyph,
  n,
  label,
}: {
  color: string;
  glyph: string;
  n: number;
  label: string;
}) {
  if (n === 0) return null;
  return (
    <span
      title={`${n} ${label}`}
      className="inline-flex items-center gap-0.5"
      style={{ color }}
    >
      <span>{glyph}</span>
      <span>{n}</span>
    </span>
  );
}
