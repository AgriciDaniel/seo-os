"use client";

/**
 * Tracks the last completion timestamp per specialist id. Consumers use this
 * to fire a bright completion-burst pulse along the specialist's thread
 * within ~1.5 seconds of the success event.
 */

import { useEffect, useState } from "react";
import { subscribeClientJobStream } from "./useActiveAgents";

export function useJobPulses(slug: string): Map<string, number> {
  const [pulses, setPulses] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!slug) return;
    return subscribeClientJobStream(slug, (kind, { specialist }) => {
      if (kind !== "job_succeeded" || !specialist) return;
      setPulses((prev) => {
        const next = new Map(prev);
        next.set(specialist, Date.now());
        return next;
      });
    });
  }, [slug]);

  return pulses;
}
