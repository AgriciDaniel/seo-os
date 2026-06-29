"use client";

/**
 * DOM overlay rendered on top of the office canvas. Latches when >=3
 * specialist `job_queued`/`job_started` events arrive within a 2-second window -
 * the unmistakable signature of a `plan_tree` fan-out — and shows
 * "N/M done" as the leaves complete.
 *
 * Purely heuristic. We just observe the
 * existing per-client SSE bus. When the active set drains, the badge
 * fades out and the latch resets for the next fan-out.
 */
import { useEffect, useState } from "react";
import { subscribeClientJobStream } from "@/hooks/useActiveAgents";

/** How long after the first queued/started job we keep collecting siblings
 *  before deciding "this is a real fan-out, latch the M". */
const LATCH_WINDOW_MS = 2_000;
/** Don't show the badge for tiny fan-outs (one or two parallel jobs feel
 *  fine without a counter). 3+ is when the user needs the bird's-eye view. */
const MIN_BATCH_SIZE = 3;

interface FanoutState {
  /** Total leaves in the current batch. Latched after LATCH_WINDOW_MS. */
  total: number;
  /** Job ids currently in flight from this batch. */
  active: Set<string>;
  /** When the first queued/started job of this batch arrived. */
  startedAt: number;
}

export function FanoutBadge({ clientSlug }: { clientSlug: string }) {
  const [batch, setBatch] = useState<FanoutState | null>(null);
  // Snapshot of `total - active.size` at the moment a finish lands — we
  // hold the badge visible for ~1.2s after the last desk completes so
  // the "10/10 done" celebration is readable.
  const [terminalFreeze, setTerminalFreeze] = useState<{
    total: number;
    done: number;
  } | null>(null);

  useEffect(() => {
    if (!clientSlug) return;
    return subscribeClientJobStream(clientSlug, (kind, payload) => {
      const specialist = payload.specialist;
      if (!specialist) return;
      const jobKey = payload.jobId ?? specialist;
      if (kind === "job_queued" || kind === "job_started") {
        setBatch((prev) => {
          const now = Date.now();
          if (!prev) {
            return {
              total: 1,
              active: new Set([jobKey]),
              startedAt: now,
            };
          }
          if (prev.active.has(jobKey)) return prev;
          const withinLatchWindow = now - prev.startedAt < LATCH_WINDOW_MS;
          if (withinLatchWindow) {
            return {
              total: prev.total + 1,
              active: new Set([...prev.active, jobKey]),
              startedAt: prev.startedAt,
            };
          }
          // Outside the window — a new batch is starting; the prior one
          // already drained (or stalled). Reset and start counting again.
          return {
            total: 1,
            active: new Set([jobKey]),
            startedAt: now,
          };
        });
        setTerminalFreeze(null);
        return;
      }
      if (
        kind !== "job_succeeded" &&
        kind !== "job_failed" &&
        kind !== "job_cancelled"
      ) return;
      setBatch((prev) => {
        if (!prev || !prev.active.has(jobKey)) return prev;
        const nextActive = new Set(prev.active);
        nextActive.delete(jobKey);
        if (nextActive.size === 0) {
          // Last leaf landed — flip into a "celebration" freeze for ~1.2s
          // so the user sees N/N before the badge disappears.
          setTerminalFreeze({ total: prev.total, done: prev.total });
          return null;
        }
        return { ...prev, active: nextActive };
      });
    });
  }, [clientSlug]);

  useEffect(() => {
    if (!terminalFreeze) return;
    const t = setTimeout(() => setTerminalFreeze(null), 1200);
    return () => clearTimeout(t);
  }, [terminalFreeze]);

  // Show the badge when the current batch is at least MIN_BATCH_SIZE, or
  // during the terminal freeze.
  const total = terminalFreeze?.total ?? batch?.total ?? 0;
  const done = terminalFreeze
    ? terminalFreeze.done
    : batch
      ? batch.total - batch.active.size
      : 0;
  const visible = total >= MIN_BATCH_SIZE;
  if (!visible) return null;

  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-10 select-none border border-gold/40 bg-abyss/85 px-3 py-2 text-xs uppercase tracking-[0.18em] text-gold backdrop-blur">
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-gold" />
        <span>
          {done}/{total} done
        </span>
      </div>
      <div className="mt-1.5 h-1 w-32 overflow-hidden bg-graphite">
        <div
          className="h-full bg-gold transition-[width] duration-500 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
}
