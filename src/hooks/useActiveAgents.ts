"use client";

/**
 * Subscribes to the per-client job stream and exposes the set of registered
 * specialist ids that currently have a running job. The scene maps each
 * registered id → its short scene id via `toSceneId()` for lookup.
 *
 * Until `/api/clients/[slug]/jobs/stream` exists, EventSource will fail to
 * open and the hook simply returns an empty Set — the scene degrades to
 * "all desks idle" without crashing.
 *
 * Same module also exposes companion hooks against the same SSE endpoint:
 *
 *   - `useActiveJobIds`   → Map<specialistId, jobId> so a desk can fetch
 *                           its own /api/jobs/<jobId>/events stream and
 *                           render per-check progress.
 *   - `useOrchestratorThinking` → boolean, true while an agentic chat
 *                                  stream is open. The signal is server-
 *                                  emitted from `/api/chat/stream` onto
 *                                  the per-client bus.
 */

import { useEffect, useMemo, useRef, useState } from "react";

export interface JobStreamEvent {
  specialist: string;
  jobId?: string;
  ts?: string;
}

export type JobStreamKind =
  | "job_queued"
  | "job_started"
  | "job_succeeded"
  | "job_failed"
  | "job_cancelled"
  | "orchestrator_thinking_start"
  | "orchestrator_thinking_end";

type JobStreamSubscriber = (kind: JobStreamKind, event: JobStreamEvent) => void;

const STREAM_KINDS: JobStreamKind[] = [
  "job_queued",
  "job_started",
  "job_succeeded",
  "job_failed",
  "job_cancelled",
  "orchestrator_thinking_start",
  "orchestrator_thinking_end",
];

interface LiveJobSnapshot {
  id: string;
  specialist: string;
  status: string;
  created_at?: string;
}

interface AgentsSnapshotResponse {
  ok: boolean;
  live?: {
    jobs?: LiveJobSnapshot[];
  };
}

const ACTIVE_JOB_STATUSES = new Set(["queued", "running"]);
const TERMINAL_JOB_KINDS = new Set<JobStreamKind>([
  "job_succeeded",
  "job_failed",
  "job_cancelled",
]);

interface ActiveJobsState {
  slug: string;
  jobs: Map<string, string>;
}

async function fetchActiveJobSnapshot(
  slug: string,
  signal: AbortSignal,
): Promise<LiveJobSnapshot[]> {
  const response = await fetch(`/api/agents?client=${encodeURIComponent(slug)}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) return [];
  const json = (await response.json()) as AgentsSnapshotResponse;
  const jobs = json.live?.jobs ?? [];
  return jobs
    .filter((job) => job.id && job.specialist && ACTIVE_JOB_STATUSES.has(job.status))
    .reverse();
}

const streams = new Map<
  string,
  {
    es: EventSource;
    listeners: Set<JobStreamSubscriber>;
    dispatchers: Array<[JobStreamKind, (e: MessageEvent) => void]>;
  }
>();

export function subscribeClientJobStream(
  slug: string,
  listener: JobStreamSubscriber,
): () => void {
  if (typeof EventSource === "undefined") return () => undefined;
  let entry = streams.get(slug);
  if (!entry) {
    const listeners = new Set<JobStreamSubscriber>();
    let es: EventSource;
    try {
      es = new EventSource(`/api/clients/${encodeURIComponent(slug)}/jobs/stream`);
    } catch {
      return () => undefined;
    }
    const dispatchers = STREAM_KINDS.map((kind) => {
      const handler = (e: MessageEvent) => {
        let payload: JobStreamEvent;
        try {
          payload = JSON.parse(e.data) as JobStreamEvent;
        } catch {
          return;
        }
        for (const fn of listeners) fn(kind, payload);
      };
      es.addEventListener(kind, handler);
      return [kind, handler] as [JobStreamKind, (e: MessageEvent) => void];
    });
    entry = { es, listeners, dispatchers };
    streams.set(slug, entry);
  }

  entry.listeners.add(listener);
  return () => {
    const current = streams.get(slug);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size > 0) return;
    for (const [kind, handler] of current.dispatchers) {
      current.es.removeEventListener(kind, handler);
    }
    current.es.close();
    streams.delete(slug);
  };
}

export function useActiveAgents(slug: string): Set<string> {
  const [activeJobsState, setActiveJobsState] = useState<ActiveJobsState>({
    slug: "",
    jobs: new Map(),
  });
  const terminalJobIdsRef = useRef<Set<string>>(new Set());

  const active = useMemo(
    () =>
      activeJobsState.slug === slug
        ? new Set(activeJobsState.jobs.values())
        : new Set<string>(),
    [activeJobsState, slug],
  );

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    terminalJobIdsRef.current = new Set();

    const unsubscribe = subscribeClientJobStream(slug, (kind, { specialist, jobId }) => {
      if (!specialist) return;
      if (kind === "job_queued" || kind === "job_started") {
        if (!jobId) return;
        setActiveJobsState((prev) => {
          const current = prev.slug === slug ? prev.jobs : new Map<string, string>();
          if (current.get(jobId) === specialist) return prev.slug === slug ? prev : { slug, jobs: current };
          const next = new Map(current);
          next.set(jobId, specialist);
          return { slug, jobs: next };
        });
        return;
      }
      if (TERMINAL_JOB_KINDS.has(kind)) {
        if (!jobId) return;
        terminalJobIdsRef.current.add(jobId);
        setActiveJobsState((prev) => {
          const current = prev.slug === slug ? prev.jobs : new Map<string, string>();
          if (!current.has(jobId)) return prev.slug === slug ? prev : { slug, jobs: current };
          const next = new Map(current);
          next.delete(jobId);
          return { slug, jobs: next };
        });
      }
    });

    void fetchActiveJobSnapshot(slug, controller.signal)
      .then((jobs) => {
        if (controller.signal.aborted) return;
        setActiveJobsState((prev) => {
          const current = prev.slug === slug ? prev.jobs : new Map<string, string>();
          const next = new Map(current);
          for (const job of jobs) {
            if (terminalJobIdsRef.current.has(job.id)) continue;
            next.set(job.id, job.specialist);
          }
          return { slug, jobs: next };
        });
      })
      .catch(() => undefined);

    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [slug]);

  return active;
}

/**
 * Parallel subscription that holds the jobId for each currently-active
 * specialist. Each `Specialist` desk mounts a per-job EventSource against
 * `/api/jobs/<jobId>/events` once it knows its jobId to surface log + progress.
 *
 * Returns an empty Map until the first queued/running job lands. Cleared on
 * the matching terminal event so per-job EventSources tear down promptly.
 */
export function useActiveJobIds(slug: string): Map<string, string> {
  const [activeJobsState, setActiveJobsState] = useState<ActiveJobsState>({
    slug: "",
    jobs: new Map(),
  });
  const terminalJobIdsRef = useRef<Set<string>>(new Set());

  const byId = useMemo(() => {
    const next = new Map<string, string>();
    if (activeJobsState.slug !== slug) return next;
    for (const [jobId, specialist] of activeJobsState.jobs) {
      next.set(specialist, jobId);
    }
    return next;
  }, [activeJobsState, slug]);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    terminalJobIdsRef.current = new Set();

    const unsubscribe = subscribeClientJobStream(slug, (kind, { specialist, jobId }) => {
      if (kind === "job_queued" || kind === "job_started") {
        if (!specialist || !jobId) return;
        setActiveJobsState((prev) => {
          const current = prev.slug === slug ? prev.jobs : new Map<string, string>();
          if (current.get(jobId) === specialist) return prev.slug === slug ? prev : { slug, jobs: current };
          const next = new Map(current);
          next.set(jobId, specialist);
          return { slug, jobs: next };
        });
        return;
      }
      if (TERMINAL_JOB_KINDS.has(kind)) {
        if (!jobId) return;
        terminalJobIdsRef.current.add(jobId);
        setActiveJobsState((prev) => {
          const current = prev.slug === slug ? prev.jobs : new Map<string, string>();
          if (!current.has(jobId)) return prev.slug === slug ? prev : { slug, jobs: current };
          const next = new Map(current);
          next.delete(jobId);
          return { slug, jobs: next };
        });
      }
    });

    void fetchActiveJobSnapshot(slug, controller.signal)
      .then((jobs) => {
        if (controller.signal.aborted) return;
        setActiveJobsState((prev) => {
          const current = prev.slug === slug ? prev.jobs : new Map<string, string>();
          const next = new Map(current);
          for (const job of jobs) {
            if (terminalJobIdsRef.current.has(job.id)) continue;
            next.set(job.id, job.specialist);
          }
          return { slug, jobs: next };
        });
      })
      .catch(() => undefined);

    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [slug]);

  return byId;
}

/**
 * True while the orchestrator's agentic chat stream is open. Drives the
 * pawn's thinking animation, brain pulse, and beam intensity.
 *
 * A 250 ms tail cushions back-to-back follow-up questions so the pawn
 * doesn't blink off for a single frame when the user fires a second
 * prompt immediately after the first ends.
 */
export function useOrchestratorThinking(slug: string): boolean {
  const [thinking, setThinking] = useState(false);
  const tailRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!slug) return;
    const clearTail = () => {
      if (tailRef.current !== null) {
        clearTimeout(tailRef.current);
        tailRef.current = null;
      }
    };

    const onStart = () => {
      clearTail();
      setThinking(true);
    };
    const onEnd = () => {
      clearTail();
      tailRef.current = setTimeout(() => {
        setThinking(false);
        tailRef.current = null;
      }, 250);
    };

    const unsubscribe = subscribeClientJobStream(slug, (kind) => {
      if (kind === "orchestrator_thinking_start") onStart();
      if (kind === "orchestrator_thinking_end") onEnd();
    });

    return () => {
      unsubscribe();
      clearTail();
    };
  }, [slug]);

  return thinking;
}
