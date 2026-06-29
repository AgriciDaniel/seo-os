"use client";

/**
 * Subscribe to the office-local agentic-events bus that
 * `ChatPanel.handleSseFrame` publishes onto. Consumer receives every
 * `ChatEvent` produced by the in-flight agentic chat stream — without
 * having to mount its own fetch reader.
 *
 * The callback fires synchronously when an event arrives. Consumers that
 * need throttling should debounce in their own component; we keep the
 * hook itself pure plumbing.
 */
import { useEffect, useRef } from "react";
import type { ChatEvent } from "@/lib/agents/types";
import { subscribeAgenticEvents } from "@/lib/office/agentic-bus";

export function useAgenticEvents(
  slug: string,
  onEvent: (event: ChatEvent) => void,
): void {
  // Stable ref to the latest callback so subscriptions don't churn when
  // the caller passes a new function identity on every render. Updated
  // inside useEffect so we're not mutating refs during render.
  const ref = useRef(onEvent);
  useEffect(() => {
    ref.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!slug) return;
    return subscribeAgenticEvents(slug, (e) => ref.current(e));
  }, [slug]);
}
