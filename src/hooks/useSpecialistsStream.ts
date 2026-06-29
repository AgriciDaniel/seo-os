"use client";

import { useEffect } from "react";
import {
  useSpecialistsStore,
  type SpecialistStateInput,
} from "@/store/specialists";

interface JobRecord {
  id: string;
  specialist: string;
  status: string;
  message: string | null;
  result_path: string | null;
}

/** Reconciliation interval. Short enough that a missed SSE terminal
 *  event self-heals before the user reaches for refresh, long enough
 *  not to hammer the synchronous SQLite-backed `/jobs` endpoint. */
const RECONCILE_INTERVAL_MS = 5000;

/** Map a JobRecord (status + message) to the store input + whether it is
 *  terminal. This MIRRORS the typed SSE handlers below (job_succeeded →
 *  "succeeded", job_cancelled+`skipped:` → "skipped", etc) — the SSE bus
 *  is the store's source of truth; the reconcile poll is the safety net
 *  that replays whatever the bus dropped. Keep the two in lockstep. */
export function jobToStoreInput(
  status: string,
  message: string | null,
): { input: SpecialistStateInput; terminal: boolean } {
  switch (status) {
    case "succeeded":
      return { input: "succeeded", terminal: true };
    case "failed":
      return { input: "failed", terminal: true };
    case "cancelled":
      if (message?.startsWith("blocked:")) return { input: "blocked", terminal: true };
      if (message?.startsWith("skipped:")) return { input: "skipped", terminal: true };
      return { input: "failed", terminal: true };
    default: // queued | running
      return { input: "running", terminal: false };
  }
}

/** Open an EventSource on the per-client jobs stream and translate
 *  events into specialistsStore mutations. Cleans up on slug change /
 *  unmount. Idempotent: re-mount is safe.
 *
 *  Event shape (server emits as TYPED events):
 *    event: job_queued | job_started | job_succeeded | job_failed | job_cancelled
 *    data: { kind, jobId, specialist, ts }
 *
 *  artifact_path is NOT on the bus — we fetch the job record on
 *  job_succeeded to retrieve result_path. */
export function useSpecialistsStream(clientSlug: string | undefined): void {
  const setState = useSpecialistsStore((s) => s.setState);

  useEffect(() => {
    if (!clientSlug) return;
    const es = new EventSource(
      `/api/clients/${encodeURIComponent(clientSlug)}/jobs/stream`,
    );

    function parse(ev: MessageEvent): { jobId: string; specialist: string } | null {
      try {
        const data = JSON.parse(ev.data as string);
        if (typeof data.specialist === "string" && typeof data.jobId === "string") {
          return { jobId: data.jobId, specialist: data.specialist };
        }
      } catch {
        /* ignore */
      }
      return null;
    }

    function onQueued(ev: MessageEvent) {
      const p = parse(ev);
      if (!p) return;
      setState(p.specialist, "running", { jobId: p.jobId });
    }
    function onStarted(ev: MessageEvent) {
      const p = parse(ev);
      if (!p) return;
      setState(p.specialist, "running", { jobId: p.jobId });
    }
    function onFailed(ev: MessageEvent) {
      const p = parse(ev);
      if (!p) return;
      setState(p.specialist, "failed", { jobId: p.jobId });
    }
    function onCancelled(ev: MessageEvent) {
      const p = parse(ev);
      if (!p) return;
      setState(p.specialist, "failed", { jobId: p.jobId });
    }
    function onSkipped(ev: MessageEvent) {
      const p = parse(ev);
      if (!p) return;
      // Distinct from "failed" so the TaskFeed glyph + tally + HEALTH
      // calc can treat skipped uniformly with the dispatch-time skip
      // path (graceful no-op, no failure penalty).
      setState(p.specialist, "skipped", { jobId: p.jobId });
    }
    function onBlocked(ev: MessageEvent) {
      const p = parse(ev);
      if (!p) return;
      // Upstream blocker (phase-gate detected vault lint errors,
      // readiness=blocked, etc). Renders as amber ⊠ BLOCKED in the
      // TaskFeed — distinct from red ✗ FAILED so the user can tell
      // policy enforcement from a crash.
      setState(p.specialist, "blocked", { jobId: p.jobId });
    }
    async function onSucceeded(ev: MessageEvent) {
      const p = parse(ev);
      if (!p) return;
      // Fetch the JobRecord to get result_path (the bus doesn't carry it).
      try {
        const r = await fetch(
          `/api/clients/${encodeURIComponent(clientSlug!)}/jobs/${encodeURIComponent(p.jobId)}`,
        );
        if (r.ok) {
          const body = (await r.json()) as { job?: JobRecord };
          const artifactPath = body.job?.result_path ?? undefined;
          setState(p.specialist, "succeeded", { jobId: p.jobId, artifactPath });
          return;
        }
      } catch {
        /* fall through to bare succeeded */
      }
      setState(p.specialist, "succeeded", { jobId: p.jobId });
    }

    es.addEventListener("job_queued", onQueued);
    es.addEventListener("job_started", onStarted);
    es.addEventListener("job_succeeded", onSucceeded);
    es.addEventListener("job_failed", onFailed);
    es.addEventListener("job_cancelled", onCancelled);
    es.addEventListener("job_skipped", onSkipped);
    es.addEventListener("job_blocked", onBlocked);

    // Reconciliation poll — the safety net for dropped SSE deltas. Under a
    // saturated sweep the bus can miss a terminal event, leaving a desk
    // stuck on RUNNING (green) and its Task Feed row never closing out;
    // refreshing "fixed" it because SSR re-seeds from the DB. This replays
    // that correction live: for each specialist's LATEST job, if the store
    // still says "running" but the job is terminal, push the real terminal
    // state. We ONLY correct running→terminal — a genuinely-running job
    // reports `running` here (terminal=false), so we can never false-cancel
    // live work, and we never seed brand-new rows (which would re-emit
    // historical jobs every tick). Correcting the store self-heals BOTH the
    // desks and the Task Feed, since the feed subscribes to the store.
    async function reconcile() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const r = await fetch(
          `/api/clients/${encodeURIComponent(clientSlug!)}/jobs`,
          { cache: "no-store" },
        );
        if (!r.ok) return;
        const body = (await r.json()) as { jobs?: JobRecord[] };
        const jobs = body.jobs ?? [];
        const store = useSpecialistsStore.getState();
        const seen = new Set<string>();
        for (const job of jobs) {
          // jobs arrive created_at DESC → first row per specialist is latest.
          if (seen.has(job.specialist)) continue;
          seen.add(job.specialist);
          const { input, terminal } = jobToStoreInput(job.status, job.message);
          if (!terminal) continue;
          if (store.byId[job.specialist]?.state !== "running") continue;
          store.setState(job.specialist, input, {
            jobId: job.id,
            artifactPath: job.result_path ?? undefined,
          });
        }
      } catch {
        /* transient — next tick retries */
      }
    }
    const reconcileTimer = setInterval(reconcile, RECONCILE_INTERVAL_MS);

    return () => {
      clearInterval(reconcileTimer);
      es.removeEventListener("job_queued", onQueued);
      es.removeEventListener("job_started", onStarted);
      es.removeEventListener("job_succeeded", onSucceeded);
      es.removeEventListener("job_failed", onFailed);
      es.removeEventListener("job_cancelled", onCancelled);
      es.removeEventListener("job_skipped", onSkipped);
      es.removeEventListener("job_blocked", onBlocked);
      es.close();
      // Clear specialist state when leaving this client. The store is a
      // single GLOBAL map (not per-client), so without this the prior
      // client's rows bleed into the next client's Task Feed and
      // "Agents Working" panel. This runs in cleanup — i.e. BEFORE the next
      // client's components mount and seed from the store — which is the
      // correct ordering (React runs child seed-effects before parent
      // effects, so resetting at mount-time would be too late). The next
      // client's history still arrives via initialJobs (SSR) + a fresh stream.
      useSpecialistsStore.getState().reset();
    };
  }, [clientSlug, setState]);
}
