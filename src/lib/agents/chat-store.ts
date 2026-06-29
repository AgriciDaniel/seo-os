/**
 * On-disk chat history. JSONL — one turn per line — under
 * `.seo-office/vaults/<slug>/.chat/<target>.jsonl`.
 *
 * Why a per-target file: keeps conversations with different agents fully
 * isolated and dirt-cheap to read (small files, no scanning).
 *
 * Concurrency: appendTurn() serialises writes per file via an in-process
 * mutex. Node's fs.appendFile is atomic for writes below PIPE_BUF (4096
 * bytes on Linux), but JSON turns with attachments can exceed that —
 * concurrent calls without the mutex risk interleaving and corrupting
 * a JSONL line that future reads will then silently drop.
 */
import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { vaultRoot } from "@/lib/brain/paths";
import { MAX_HISTORY_TURNS, type ChatTurn } from "./types";

function chatDir(slug: string): string {
  return path.join(vaultRoot(slug), ".chat");
}

function chatFile(slug: string, target: string): string {
  // safe filename — strip anything outside [a-z0-9-]
  const safe = target.toLowerCase().replace(/[^a-z0-9-]/g, "_").slice(0, 60);
  return path.join(chatDir(slug), `${safe}.jsonl`);
}

/* -------------------------------------------------------------------------- */
/* per-file mutex                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A chain of promises keyed by file path. Each `appendTurn()` call waits
 * on the previous one for the same file, runs its critical section, and
 * unblocks the next caller. Cross-process protection isn't a concern —
 * SEO Office is a single Node process per user.
 */
const writeChains = new Map<string, Promise<void>>();

function withFileLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const previous = writeChains.get(file) ?? Promise.resolve();
  const next = previous.then(fn, fn); // run regardless of previous failure
  // Keep the failure-swallowed chain in the map so the next caller doesn't
  // inherit a rejected promise.
  writeChains.set(
    file,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

/* -------------------------------------------------------------------------- */
/* read / write                                                                */
/* -------------------------------------------------------------------------- */

export async function readHistory(
  slug: string,
  target: string,
  opts: { since?: string } = {},
): Promise<ChatTurn[]> {
  const file = chatFile(slug, target);
  if (!fs.existsSync(file)) return [];
  const raw = await fsp.readFile(file, "utf8");
  const turns: ChatTurn[] = [];
  // CRLF tolerance: Windows editors save with \r\n; without /\r?\n/ the \r
  // sticks to every JSON line and JSON.parse silently fails.
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const t = JSON.parse(line) as ChatTurn;
      const hasVisibleContent =
        typeof t.content === "string" && t.content.length > 0;
      const hasEventOnlyPayload =
        Array.isArray(t.events) && t.events.length > 0;
      if (
        t.role &&
        typeof t.content === "string" &&
        t.ts &&
        (hasVisibleContent || hasEventOnlyPayload || t.interrupted)
      ) {
        // Back-fill stable ids on legacy turns (pre-v0.1.8) so React keys
        // stay stable even for histories that pre-date the field.
        if (!t.id) t.id = synthesiseLegacyId(t);
        // `since` is a string compare on ISO-8601 timestamps. Lexicographic
        // ordering matches chronological ordering for the canonical UTC
        // shape we always emit ("YYYY-MM-DDTHH:MM:SS.sssZ"), so we can skip
        // the parsing-to-Date step on every line. Strictly greater-than so
        // a caller passing the last-seen turn's ts doesn't get it back.
        if (opts.since && t.ts <= opts.since) continue;
        turns.push(t);
      }
    } catch {
      /* skip malformed */
    }
  }
  return turns;
}

export async function appendTurn(
  slug: string,
  target: string,
  turn: ChatTurn,
): Promise<void> {
  const file = chatFile(slug, target);
  // Every persisted turn gets a stable id — assigned here so route callers
  // don't have to remember.
  const enriched: ChatTurn = turn.id ? turn : { ...turn, id: randomUUID() };
  await withFileLock(file, async () => {
    await fsp.mkdir(chatDir(slug), { recursive: true });
    await fsp.appendFile(file, JSON.stringify(enriched) + "\n", "utf8");
  });
  // Mutate the caller's object so they see the assigned id without an
  // extra read.
  if (!turn.id) (turn as ChatTurn).id = enriched.id;
}

/** Deterministic-ish id for legacy turns that pre-date the `id` field. */
function synthesiseLegacyId(t: ChatTurn): string {
  return `legacy-${t.role}-${t.ts}`;
}

/** Trim the in-memory history we send to the model — cost control. */
export function trimForModel(history: ChatTurn[]): ChatTurn[] {
  if (history.length <= MAX_HISTORY_TURNS) return history;
  return history.slice(-MAX_HISTORY_TURNS);
}

export async function clearHistory(
  slug: string,
  target: string,
): Promise<void> {
  const file = chatFile(slug, target);
  if (fs.existsSync(file)) await fsp.unlink(file);
}
