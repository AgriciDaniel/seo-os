/**
 * The Secretary — completion / freshness gate.
 *
 * Answers one question for the dispatch layer: *has this specialist already
 * produced a CURRENT artifact for this client?* The orchestrator's agentic
 * loop (and a re-run of the build-brain sweep) otherwise re-dispatches work
 * that was already done in the first run — the user's exact complaint
 * ("most of the things done were supposed to be done in the first run").
 *
 * Source of truth = the latest SUCCEEDED job's `result_path`, classified
 * against the indexed note's confidence + expiry. This is deliberately
 * specialist-agnostic: we don't maintain a per-specialist path map (which
 * would drift); we trust the job ledger + the note index that `writeArtifact`
 * already populates.
 *
 * Note on degraded runs: a specialist that succeeded-but-degraded (e.g.
 * DataForSEO returned 401 for a SERP scope) still wrote an artifact, so it
 * reads as `current` here. That is intentional — re-running it blindly would
 * not recover the missing data source; that gap is surfaced by readiness as
 * a needs-data signal, not papered over by a redundant LLM pass.
 *
 * Fail-open: if the index is unavailable we return `missing` so the
 * specialist runs. Never trap the user behind a broken index.
 */
import "server-only";
import { getDb } from "@/lib/brain/index-db";

export type ArtifactFreshness = "current" | "stale" | "missing";

/**
 * Specialists that are pure VERIFICATION passes — their whole point is to
 * re-check the current state, so "you already have a current review" is never
 * a reason to skip them. The Secretary exempts these from the freshness gate.
 */
const FRESHNESS_EXEMPT = new Set<string>(["brain-reviewer"]);

/** True when `specialistId` should bypass the freshness skip entirely. */
export function isFreshnessExempt(specialistId: string): boolean {
  return FRESHNESS_EXEMPT.has(specialistId);
}

interface NoteFreshnessRow {
  confidence: string | null;
  expires_on: string | null;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Classify a brain note's freshness from its frontmatter signals. Mirrors
 * next-action.ts `classifyMilestoneRow` — the orchestrator's single freshness
 * convention: low/seed confidence or a past expiry means a refresh is worth
 * it; everything else is current.
 */
function classifyNote(row: NoteFreshnessRow): ArtifactFreshness {
  if (row.confidence === "seed" || row.confidence === "low") return "stale";
  if (row.expires_on && row.expires_on < todayDate()) return "stale";
  return "current";
}

/**
 * Has `specialistId` already produced a current artifact for `clientSlug`?
 *
 *   - `missing` — no succeeded job has written an artifact yet (run it).
 *   - `stale`   — an artifact exists but is low-confidence / past expiry, or
 *                 the note isn't indexed yet so freshness can't be vouched
 *                 for (allow a refresh rather than asserting "current").
 *   - `current` — a fresh, confident artifact exists (skip unless forced).
 */
export function specialistArtifactStatus(
  clientSlug: string,
  specialistId: string,
): ArtifactFreshness {
  try {
    const db = getDb();
    const job = db
      .prepare(
        `SELECT result_path FROM jobs
         WHERE client_slug = ? AND specialist = ?
           AND status = 'succeeded' AND result_path IS NOT NULL
         ORDER BY finished_at DESC, created_at DESC
         LIMIT 1`,
      )
      .get(clientSlug, specialistId) as { result_path: string | null } | undefined;
    if (!job?.result_path) return "missing";

    const note = db
      .prepare(
        `SELECT confidence, expires_on FROM notes
         WHERE client_slug = ? AND path = ?
         LIMIT 1`,
      )
      .get(clientSlug, job.result_path) as NoteFreshnessRow | undefined;
    // Job succeeded + wrote an artifact, but the note isn't in the index yet:
    // it exists, but we can't classify freshness — call it stale (allow a
    // refresh) rather than over-skipping on an unverifiable "current".
    if (!note) return "stale";
    return classifyNote(note);
  } catch {
    return "missing";
  }
}
