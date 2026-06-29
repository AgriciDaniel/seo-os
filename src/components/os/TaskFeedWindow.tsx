"use client";

import { useEffect, useRef, useState } from "react";
import { useSpecialistsStore } from "@/store/specialists";

/**
 * TaskFeedWindow — CLI-style live feed of specialist transitions.
 *
 * Subscribes to `useSpecialistsStore` and appends a line each time a
 * specialist transitions (running / review / failed / idle). The window
 * lives in the bottom-right by default and auto-opens when a sweep goes
 * live so the user always has a glance-able stream of what the office is
 * doing without having to read the orchestrator chat.
 */

interface FeedEntry {
  ts: number;
  specialist: string;
  state: string;
  jobId?: string;
}

export interface TaskFeedWindowProps {
  /** Optional cap on entries kept in the buffer (defaults to 200). */
  maxEntries?: number;
}

const STATE_GLYPH: Record<string, string> = {
  running: "►",
  review: "●",
  failed: "✗",
  idle: "✓",
};

const STATE_COLOR: Record<string, string> = {
  running: "var(--accent)",
  review: "var(--ribbon)",
  failed: "var(--err)",
  idle: "var(--ok)",
};

const STATE_LABEL: Record<string, string> = {
  running: "RUNNING",
  review: "REVIEW",
  failed: "FAILED",
  idle: "DONE",
};

export function TaskFeedWindow({ maxEntries = 200 }: TaskFeedWindowProps) {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSeenRef = useRef<Record<string, number>>({});

  // Seed: capture whatever is already in the store at mount time. The store
  // is plain zustand and may already hold transitions emitted before this
  // window was opened (e.g. office loaded mid-sweep).
  useEffect(() => {
    const initial = useSpecialistsStore.getState().byId;
    const seed: FeedEntry[] = Object.entries(initial).map(([id, entry]) => ({
      ts: entry.lastTransitionAt,
      specialist: id,
      state: entry.state,
      jobId: entry.lastJobId,
    }));
    seed.sort((a, b) => a.ts - b.ts);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries(seed.slice(-maxEntries));
    for (const e of seed) lastSeenRef.current[e.specialist] = e.ts;

    // Live subscription — append on each new transition.
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
      setEntries((prev) => [...prev, ...next].slice(-maxEntries));
    });
    return () => unsub();
  }, [maxEntries]);

  // Auto-scroll to the bottom on new entries.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div
        style={{
          height: "100%",
          padding: 16,
          color: "var(--fg-muted)",
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
          fontSize: 11.5,
          background: "var(--panel-bg)",
        }}
      >
        $ waiting for activity…
        <br />
        <span style={{ color: "var(--fg-faint)" }}>
          # specialists will stream here once a sweep starts.
        </span>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      style={{
        height: "100%",
        overflowY: "auto",
        padding: "10px 14px",
        background: "var(--panel-bg)",
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontSize: 11.5,
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
        return (
          <div
            key={`${e.specialist}:${e.ts}:${i}`}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: "var(--fg-faint)" }}>{time}</span>
            <span
              style={{
                color,
                width: 12,
                display: "inline-block",
                textAlign: "center",
              }}
            >
              {glyph}
            </span>
            <span style={{ color: "var(--fg)", flex: "0 0 auto" }}>
              {e.specialist}
            </span>
            <span
              style={{
                color,
                marginLeft: "auto",
                fontSize: 10,
                letterSpacing: "0.1em",
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
