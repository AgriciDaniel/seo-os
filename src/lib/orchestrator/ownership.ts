/**
 * Client-ownership guards.
 *
 * Every id-keyed API route (`/api/jobs/[id]`, `/api/assignments/[id]`, …) must
 * verify that the row actually belongs to the URL's `?slug=` (or the surrounding
 * `[slug]` path segment) before returning data or mutating state. Otherwise a
 * caller who guesses an id can read or cancel another client's row.
 *
 * Storage isolation already exists at the SQL layer — every relevant table has
 * a `client_slug` column and `FK … REFERENCES clients(slug) ON DELETE CASCADE`.
 * This module enforces the same isolation at the API layer.
 *
 * Returns:
 *   - The row, if it exists AND belongs to `slug`.
 *   - `null`, if missing OR owned by a different client.
 *
 * Routes should treat both cases as 404 — never leak "exists but not yours."
 */
import "server-only";

import { getDb } from "@/lib/brain/index-db";
import { getAssignment, type Assignment } from "./assignment";
import { getJob, type JobRecord } from "./job-queue";
import { getTask, type Task } from "./task";

/** Get a Job iff it belongs to `slug`. Returns null on miss-or-mismatch. */
export function getJobForClient(id: string, slug: string): JobRecord | null {
  const job = getJob(id);
  if (!job) return null;
  if (job.client_slug !== slug) return null;
  return job;
}

/** Get an Assignment iff it belongs to `slug`. Returns null on miss-or-mismatch. */
export function getAssignmentForClient(
  id: string,
  slug: string,
): Assignment | null {
  const a = getAssignment(id);
  if (!a) return null;
  if (a.client_slug !== slug) return null;
  return a;
}

/** Get a Task iff it belongs to `slug`. Returns null on miss-or-mismatch. */
export function getTaskForClient(id: string, slug: string): Task | null {
  const t = getTask(id);
  if (!t) return null;
  if (t.client_slug !== slug) return null;
  return t;
}

/**
 * Strict variant — throws an explicit error instead of returning null. Use in
 * non-route callsites (the runner, internal services) where a mismatch is
 * always a bug rather than a 404-able request. Tagged so routes can map to a
 * 403 if the type ever escapes into HTTP-land.
 */
export class CrossClientAccessError extends Error {
  readonly statusHint = 404 as const;
  constructor(kind: "job" | "assignment" | "task", id: string, slug: string) {
    super(`${kind} ${id} does not belong to client ${slug}`);
    this.name = "CrossClientAccessError";
  }
}

export function assertJobOwnedBy(id: string, slug: string): JobRecord {
  const row = getJobForClient(id, slug);
  if (!row) throw new CrossClientAccessError("job", id, slug);
  return row;
}

export function assertAssignmentOwnedBy(id: string, slug: string): Assignment {
  const row = getAssignmentForClient(id, slug);
  if (!row) throw new CrossClientAccessError("assignment", id, slug);
  return row;
}

export function assertTaskOwnedBy(id: string, slug: string): Task {
  const row = getTaskForClient(id, slug);
  if (!row) throw new CrossClientAccessError("task", id, slug);
  return row;
}

/**
 * Reverse-lookup: does this client exist? Useful for routes that take a
 * `?slug=` query param and need to short-circuit on unknown clients before
 * hitting any other table. Cheap (PK lookup) and answers in one round-trip.
 */
export function clientExists(slug: string): boolean {
  const row = getDb()
    .prepare("SELECT 1 FROM clients WHERE slug = ? LIMIT 1")
    .get(slug);
  return row !== undefined;
}
