"use client";

/**
 * Client-side pub/sub for the *agentic* chat stream's events.
 *
 * The flow: `ChatPanel.sendStream` opens an SSE connection to
 * `/api/chat/stream`. As it parses each `event` frame, it calls
 * `publish(slug, event)` on this bus so the 3D office (which has no
 * direct line into the chat reader) can react. `OfficeScene` mounts
 * `useAgenticEvents(slug)` and translates each event into a visual cue:
 *
 *   - `file_read` / `tool_use(name="Read")` → warm pulse on the
 *     orchestrator→brain thread
 *   - `tool_use(name="Bash")` → gold flash on the orchestrator octahedron
 *   - `tool_use(name="assign_task" | "plan_tree")` → dispatch burst on
 *     the named desk(s)
 *   - `todo_update` → tick pulse on the brain blob
 *
 * This is purely additive; nothing breaks if the office isn't mounted
 * (the subscriber set stays empty, publishers no-op).
 */
import type { ChatEvent } from "@/lib/agents/types";

type Listener = (event: ChatEvent) => void;

const listenersBySlug = new Map<string, Set<Listener>>();

export function publishAgenticEvent(slug: string, event: ChatEvent): void {
  const set = listenersBySlug.get(slug);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(event);
    } catch {
      /* never let one slow listener kill the publisher */
    }
  }
}

export function subscribeAgenticEvents(
  slug: string,
  fn: Listener,
): () => void {
  let set = listenersBySlug.get(slug);
  if (!set) {
    set = new Set();
    listenersBySlug.set(slug, set);
  }
  set.add(fn);
  return () => {
    const s = listenersBySlug.get(slug);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) listenersBySlug.delete(slug);
  };
}
