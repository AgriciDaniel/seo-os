"use client";

import { useEffect, useRef, useState } from "react";

interface ProgressEvent {
  jobId: string;
  ts: string;
  kind: "log" | "progress" | "result" | "error" | "done";
  progress?: number;
  message: string;
  data?: unknown;
}

type TerminalStatus = "succeeded" | "failed" | "cancelled";

interface Props {
  /** Owning client. Required so the EventSource scopes to this client's
   *  job; without it the server returns 400. */
  slug: string;
  jobId: string;
  onDone?: (lastEvent: ProgressEvent) => void;
}

export default function JobStream({ slug, jobId, onDone }: Props) {
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Stable ref for the callback so the EventSource lifecycle keys ONLY on the
  // values that genuinely identify the stream (slug + jobId). Without this,
  // each parent re-render produced a new `onDone` function identity, the
  // effect dep changed, and React tore down + recreated the EventSource —
  // dropping in-flight events between teardown and reopen, and double-firing
  // the connection on rapid renders. The ref pattern keeps the latest handler
  // available without ever changing the stream subscription's identity.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const es = new EventSource(
      `/api/jobs/${jobId}/events?slug=${encodeURIComponent(slug)}`,
    );
    es.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data) as ProgressEvent;
        setEvents((prev) => [...prev, event]);
        if (typeof event.progress === "number") setProgress(event.progress);
        if (event.kind === "done") {
          const next = terminalStatusFrom(event.data) ?? "succeeded";
          setTerminalStatus(next);
          if (next === "succeeded") setProgress(1);
          onDoneRef.current?.(event);
          es.close();
        }
      } catch {
        /* swallow */
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [slug, jobId]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events.length]);

  const terminalClass =
    terminalStatus === "succeeded"
      ? "text-emerald-400"
      : terminalStatus === "failed"
        ? "text-red-300"
        : terminalStatus === "cancelled"
          ? "text-stone-300"
          : "text-ash";
  const barClass =
    terminalStatus === "succeeded"
      ? "bg-emerald-500"
      : terminalStatus === "failed"
        ? "bg-red-500"
        : terminalStatus === "cancelled"
          ? "bg-stone-500"
          : "bg-gold";
  const terminalLabel =
    terminalStatus === "succeeded"
      ? "complete"
      : terminalStatus ?? `${Math.round(progress * 100)}%`;

  return (
    <div className="border border-graphite bg-abyss/90 backdrop-blur">
      <div className="flex items-center justify-between border-b border-graphite px-3 py-2">
        <span className="label-micro">job · {jobId.slice(0, 8)}</span>
        <span className={`text-[10px] uppercase tracking-wider ${terminalClass}`}>
          {terminalLabel}
        </span>
      </div>
      <div className="h-0.5 w-full bg-graphite">
        <div
          className={`h-full transition-all ${barClass}`}
          style={{ width: `${Math.max(2, progress * 100)}%` }}
        />
      </div>
      <div
        ref={containerRef}
        className="max-h-44 overflow-y-auto px-3 py-2 font-mono text-[10px] leading-5"
      >
        {events.length === 0 ? (
          <p className="text-fg-shadow">waiting for first event…</p>
        ) : (
          events.map((e, i) => (
            <p
              key={i}
              className={
                e.kind === "error"
                  ? "text-red-300"
                  : e.kind === "done"
                  ? terminalStatus === "failed"
                    ? "text-red-300"
                    : terminalStatus === "cancelled"
                      ? "text-stone-300"
                      : "text-emerald-300"
                  : "text-white/80"
              }
            >
              <span className="text-fg-shadow">[{e.ts.slice(11, 19)}]</span> {e.message}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

function terminalStatusFrom(data: unknown): TerminalStatus | null {
  if (!data || typeof data !== "object") return null;
  const value = (data as { terminalStatus?: unknown }).terminalStatus;
  return value === "succeeded" || value === "failed" || value === "cancelled"
    ? value
    : null;
}
