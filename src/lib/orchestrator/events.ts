/**
 * In-process pub/sub for job progress events.
 *
 * The orchestrator publishes events; API SSE routes subscribe. Both live in
 * the same Node process (single-user local app) so a simple EventTarget-backed
 * bus is plenty — no Redis, no IPC.
 *
 * Listener key is the composite `${slug}::${jobId}` so a subscriber on
 * client A's job can never receive events from client B's job — even if
 * the two clients somehow ended up sharing an id (UUIDs make this
 * vanishingly rare in practice, but the composite key turns a vanishing
 * risk into an impossible one).
 */
import "server-only";

export interface ProgressEvent {
  /** Job ID this event belongs to. */
  jobId: string;
  /** ISO timestamp. */
  ts: string;
  /** Severity / kind. */
  kind: "log" | "progress" | "result" | "error" | "done";
  /** 0-1 progress fraction (optional, for "progress" events). */
  progress?: number;
  /** Free-text payload — usually shown verbatim in the UI. */
  message: string;
  /** Structured payload, when relevant. */
  data?: unknown;
}

export type TerminalStatus = "succeeded" | "failed" | "cancelled";

type Listener = (event: ProgressEvent) => void;

/** Build the composite listener key. Centralised so we never typo it. */
function keyOf(slug: string, jobId: string): string {
  return `${slug}::${jobId}`;
}

const listeners = new Map<string, Set<Listener>>();

export function publish(slug: string, event: ProgressEvent): void {
  const set = listeners.get(keyOf(slug, event.jobId));
  if (!set) return;
  for (const fn of set) {
    try {
      fn(event);
    } catch {
      // never let a slow subscriber kill the publisher
    }
  }
}

export function subscribe(
  slug: string,
  jobId: string,
  fn: Listener,
): () => void {
  const key = keyOf(slug, jobId);
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  return () => {
    const s = listeners.get(key);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) listeners.delete(key);
  };
}

export function emit(
  slug: string,
  jobId: string,
  kind: ProgressEvent["kind"],
  message: string,
  extra: { progress?: number; data?: unknown } = {},
): void {
  publish(slug, {
    jobId,
    ts: new Date().toISOString(),
    kind,
    message,
    ...extra,
  });
}

/* -------------------------------------------------------------------------- */
/* per-client (slug) lifecycle bus                                             */
/* -------------------------------------------------------------------------- */

/**
 * Typed job-lifecycle events the 3D office consumes. Distinct from the
 * per-job ProgressEvent stream above: per-job is for the live ticker showing
 * log lines; this bus is for "which agents are queued or running right now".
 * `job-queue.ts` publishes the job_* events. `orchestrator_thinking_*` are
 * published by the agentic chat stream so the office can light the
 * orchestrator pawn while the LLM is mid-call. Specialist field is the
 * literal `"orchestrator"`; jobId is a synthetic `agentic-<uuid>` so existing
 * consumers don't choke on undefined.
 */
export type ClientEventKind =
  | "job_queued"
  | "job_started"
  | "job_succeeded"
  | "job_failed"
  // `job_skipped` is distinct from `job_cancelled`: a skip is a
  // graceful no-op (specialist refused on principle — see SoftSkipError);
  // a cancel is user-initiated termination. The orchestrator and the UI
  // treat skips as success-adjacent for HEALTH scoring and as "needs
  // user action" for the next-action card.
  | "job_skipped"
  // `job_blocked` signals that the specialist refused to proceed
  // because an UPSTREAM gate failed (vault lint errors, missing
  // evidence, etc) — see BlockedError. Distinct from skipped because
  // the fix target is upstream artifacts, not this specialist's
  // setup. TaskFeed renders this as amber ⊠ BLOCKED (not red ✗
  // FAILED) so the user can tell at a glance this is policy
  // enforcement, not a crash.
  | "job_blocked"
  | "job_cancelled"
  | "orchestrator_thinking_start"
  | "orchestrator_thinking_end";

export interface ClientEvent {
  kind: ClientEventKind;
  jobId: string;
  specialist: string;
  ts: string;
}

type ClientListener = (event: ClientEvent) => void;

const clientListeners = new Map<string, Set<ClientListener>>();

export function publishClientEvent(slug: string, event: ClientEvent): void {
  const set = clientListeners.get(slug);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(event);
    } catch {
      /* never let a slow subscriber kill the publisher */
    }
  }
}

export function subscribeClient(slug: string, fn: ClientListener): () => void {
  let set = clientListeners.get(slug);
  if (!set) {
    set = new Set();
    clientListeners.set(slug, set);
  }
  set.add(fn);
  return () => {
    const s = clientListeners.get(slug);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) clientListeners.delete(slug);
  };
}

export function emitClientEvent(
  slug: string,
  kind: ClientEventKind,
  jobId: string,
  specialist: string,
): void {
  publishClientEvent(slug, {
    kind,
    jobId,
    specialist,
    ts: new Date().toISOString(),
  });
}
