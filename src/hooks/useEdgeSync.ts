"use client";

import { useEffect } from "react";
import { useConnectionsStore } from "@/store/connections";

interface Payload {
  jobId: string;
  specialist: string;
  ts: string;
}

const SPECIALIST_KEYS = (specialist: string) => [
  `remote-desktop:${specialist}`,
  `chat:${specialist}`,
];

export function useEdgeSync(clientSlug: string | undefined): void {
  const ensureEdge = useConnectionsStore((s) => s.ensureEdge);
  const pulse = useConnectionsStore((s) => s.pulse);

  useEffect(() => {
    if (!clientSlug) return;
    const es = new EventSource(
      `/api/clients/${encodeURIComponent(clientSlug)}/jobs/stream`,
    );

    function parse(ev: MessageEvent): Payload | null {
      try {
        const data = JSON.parse(ev.data as string) as Payload;
        if (
          typeof data.specialist === "string" &&
          typeof data.jobId === "string"
        )
          return data;
      } catch {
        /* ignore malformed SSE payloads */
      }
      return null;
    }

    function onDelegated(ev: MessageEvent) {
      const p = parse(ev);
      if (!p) return;
      // Two possible specialist identity keys; create both, EdgeLayer renders
      // whichever has a live window.
      for (const toKey of SPECIALIST_KEYS(p.specialist)) {
        const id = ensureEdge("chat:orchestrator", toKey, "delegation");
        pulse(id, "forward", "ok");
      }
    }

    function onSucceeded(ev: MessageEvent) {
      const p = parse(ev);
      if (!p) return;
      for (const toKey of SPECIALIST_KEYS(p.specialist)) {
        const id = ensureEdge("chat:orchestrator", toKey, "delegation");
        pulse(id, "reverse", "ok");
      }
    }

    function onFailed(ev: MessageEvent) {
      const p = parse(ev);
      if (!p) return;
      for (const toKey of SPECIALIST_KEYS(p.specialist)) {
        const id = ensureEdge("chat:orchestrator", toKey, "delegation");
        pulse(id, "reverse", "err");
      }
    }

    es.addEventListener("job_queued", onDelegated);
    es.addEventListener("job_started", onDelegated);
    es.addEventListener("job_succeeded", onSucceeded);
    es.addEventListener("job_failed", onFailed);
    es.addEventListener("job_cancelled", onFailed);

    // Periodic prune — drop edges with no activity in 60s
    const pruneTimer = setInterval(
      () => useConnectionsStore.getState().pruneIdle(60_000),
      10_000,
    );

    return () => {
      es.removeEventListener("job_queued", onDelegated);
      es.removeEventListener("job_started", onDelegated);
      es.removeEventListener("job_succeeded", onSucceeded);
      es.removeEventListener("job_failed", onFailed);
      es.removeEventListener("job_cancelled", onFailed);
      es.close();
      clearInterval(pruneTimer);
    };
  }, [clientSlug, ensureEdge, pulse]);
}
