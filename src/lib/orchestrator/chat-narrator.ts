/**
 * Chat narrator — write orchestrator-authored messages to the chat history
 * mid-sweep. The single source of truth for "the chat tells the story."
 *
 * Why this exists:
 *   A sweep dispatches N specialists in parallel; each can finish minutes
 *   apart. Without narration, the orchestrator chat stays empty for the
 *   entire run and the user has no idea anything is happening. This helper
 *   writes structured assistant turns to the per-client orchestrator chat
 *   history (`.chat/orchestrator.jsonl`) as events occur:
 *     - Kickoff:      called once by `dispatchPlanTree` when a sweep starts.
 *     - Per-step:     called by the task-runner on each terminal job event,
 *                     gated on `hasLiveSweep` so non-sweep jobs stay silent.
 *     - Final wrap:   called by `rollupTerminalStatus` when the sweep root
 *                     transitions to a terminal state.
 *
 * Architectural choice: this is a plain function, NOT a self-registering
 * subscriber. The two writers (dispatch + task-runner) already have direct
 * access to the data they need (root Task, child Task, sweep summary), so
 * a pub/sub subscription would add indirection without benefit. The
 * narrator just appends — order, gating, and de-dupe are the callers'
 * concerns.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import { appendTurn, readHistory } from "@/lib/agents/chat-store";
import type { ChatTurn } from "@/lib/agents/types";

const ORCHESTRATOR_TARGET = "orchestrator";

interface NarrateOpts {
  /** Stable id to write on the turn — used by callers that want idempotent
   *  writes (e.g. kickoff:<rootTaskId>). When set, we skip the write if the
   *  history already contains a turn with this id. Without it, we generate
   *  a fresh UUID like any other turn. */
  id?: string;
  /** When true, also write a synthetic `role: "user"` turn BEFORE this
   *  assistant turn. Used by the "Build the brain" button so the chat
   *  shows what the user "said" before the orchestrator replies. */
  userPrefix?: string;
}

/**
 * Append an orchestrator-authored assistant turn to the chat history.
 *
 * Idempotent when `opts.id` is provided: if a turn with that id already
 * exists, the write is silently skipped. This protects against re-runs
 * (e.g. dev server restart, double-click on the Build the brain button)
 * from doubling up the kickoff or final-summary messages.
 */
/**
 * Per-client serialization for narration writes. The de-dupe below is a
 * read-check-append; without serializing, two specialists finishing
 * near-simultaneously (common now that sweeps fan out widely) both read the
 * history before either appends, both pass the de-dupe, and both write —
 * producing duplicate `step:<task>:<job>` turns and a React duplicate-key
 * warning in the chat. Chaining per client makes check-then-append atomic.
 * Narration is fire-and-forget, so the added ordering is invisible to callers.
 */
const narrationLockByClient = new Map<string, Promise<void>>();

export function narrateToChat(
  clientSlug: string,
  body: string,
  opts: NarrateOpts = {},
): Promise<void> {
  const prev = narrationLockByClient.get(clientSlug) ?? Promise.resolve();
  const next = prev.then(() => narrateToChatLocked(clientSlug, body, opts));
  // Swallow rejections in the stored chain so one failed narration doesn't
  // break the next; the returned `next` still rejects for the caller.
  narrationLockByClient.set(
    clientSlug,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

async function narrateToChatLocked(
  clientSlug: string,
  body: string,
  opts: NarrateOpts,
): Promise<void> {
  // Idempotency check — short-circuit before touching the file system.
  // Reading the whole history each time is cheap (it's a small JSONL file)
  // and avoids needing a separate index just for narration de-dupe.
  if (opts.id) {
    const existing = await readHistory(clientSlug, ORCHESTRATOR_TARGET).catch(
      () => [] as ChatTurn[],
    );
    if (existing.some((t) => t.id === opts.id)) return;
  }

  // Optional synthetic user turn — used by the "Build the brain" button
  // path so the chat shows the prompt as if the user had typed it.
  if (opts.userPrefix) {
    const userTurn: ChatTurn = {
      id: randomUUID(),
      role: "user",
      content: opts.userPrefix,
      ts: new Date().toISOString(),
      mode: "simple",
    };
    await appendTurn(clientSlug, ORCHESTRATOR_TARGET, userTurn);
  }

  const turn: ChatTurn = {
    id: opts.id ?? randomUUID(),
    role: "assistant",
    content: body,
    ts: new Date().toISOString(),
    mode: "agentic",
  };
  await appendTurn(clientSlug, ORCHESTRATOR_TARGET, turn);
}

/**
 * Read the most recent assistant turn for the orchestrator chat. Used by
 * the kickoff path to detect "did the LLM just write a planning reply?" —
 * we suppress the synthetic kickoff in that case to avoid two
 * back-to-back kickoff messages.
 */
export async function getLatestAssistantTurn(
  clientSlug: string,
): Promise<ChatTurn | null> {
  const turns = await readHistory(clientSlug, ORCHESTRATOR_TARGET).catch(
    () => [] as ChatTurn[],
  );
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === "assistant") return turns[i];
  }
  return null;
}
