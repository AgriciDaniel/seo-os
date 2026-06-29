"use client";

/**
 * Per-job progress consumer. Mounts an EventSource against
 * `/api/jobs/<jobId>/events` for the lifetime of the job and exposes:
 *
 *   - `progress` — 0..1 fraction from the most recent `progress` event
 *   - `lastLog`  — the most recent `log` line, with a timestamp so the
 *                  consumer can fade it out after ~8 seconds
 *
 * Tears down on `done` (or `error`) so we never leak EventSources when
 * the parent stays mounted across job lifetimes. When the parent renders
 * with a new `jobId`, the previous EventSource is closed before the new
 * one opens.
 *
 * Returns null progress / null log when `jobId` is empty — callers can
 * pass `undefined` to mean "no job here right now" and the hook is a
 * cheap no-op.
 */

import { useEffect, useState } from "react";

export interface JobProgress {
  /** 0..1; null until the first `progress` event lands. */
  progress: number | null;
  /** Most recent `log` line. */
  lastLog: string | null;
  /** Wall-clock ms when `lastLog` was set (used to fade it out). */
  lastLogTs: number | null;
  /** Terminal status once known. */
  terminalStatus: "succeeded" | "failed" | "cancelled" | null;
}

interface JobEventPayload {
  jobId: string;
  ts: string;
  kind: "log" | "progress" | "result" | "error" | "done";
  progress?: number;
  message: string;
  data?: unknown;
}

const EMPTY: JobProgress = {
  progress: null,
  lastLog: null,
  lastLogTs: null,
  terminalStatus: null,
};

function terminalStatusFrom(data: unknown): JobProgress["terminalStatus"] {
  if (!data || typeof data !== "object") return null;
  const value = (data as { terminalStatus?: unknown }).terminalStatus;
  return value === "succeeded" || value === "failed" || value === "cancelled"
    ? value
    : null;
}

export function useJobProgress(
  jobId: string | undefined,
  slug: string,
): JobProgress {
  const [state, setState] = useState<JobProgress>(EMPTY);

  useEffect(() => {
    if (!jobId || !slug) return;
    let es: EventSource | null = null;
    try {
      es = new EventSource(
        `/api/jobs/${encodeURIComponent(jobId)}/events?slug=${encodeURIComponent(slug)}`,
      );
    } catch {
      return;
    }

    const onMessage = (e: MessageEvent) => {
      let payload: JobEventPayload;
      try {
        payload = JSON.parse(e.data) as JobEventPayload;
      } catch {
        return;
      }
      if (payload.kind === "progress" && typeof payload.progress === "number") {
        setState((prev) => ({ ...prev, progress: payload.progress ?? null }));
      } else if (payload.kind === "log") {
        setState((prev) => ({
          ...prev,
          lastLog: payload.message,
          lastLogTs: Date.now(),
        }));
      } else if (payload.kind === "done") {
        const terminalStatus = terminalStatusFrom(payload.data) ?? "succeeded";
        setState((prev) => ({
          ...prev,
          terminalStatus,
          progress: terminalStatus === "succeeded" ? 1 : prev.progress,
        }));
      }
    };

    // The per-job stream uses a single "message" event type by default
    // (the SSE route may have specific event kinds; subscribe to both to
    // be defensive — extras are no-ops thanks to the kind switch).
    es.addEventListener("message", onMessage);
    es.addEventListener("log", onMessage);
    es.addEventListener("progress", onMessage);
    es.addEventListener("done", onMessage);
    es.addEventListener("error", () => {
      /* swallow — the EventSource may auto-reconnect; we don't tear down
       *  on the first transient error. */
    });

    return () => {
      es?.removeEventListener("message", onMessage);
      es?.removeEventListener("log", onMessage);
      es?.removeEventListener("progress", onMessage);
      es?.removeEventListener("done", onMessage);
      es?.close();
    };
  }, [jobId, slug]);

  // When no job is selected, surface the EMPTY constant directly so we
  // never have to setState(EMPTY) from inside the effect.
  if (!jobId) return EMPTY;
  return state;
}
