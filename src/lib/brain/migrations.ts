/**
 * Frontmatter schema migration ladder — Phase 4.1.
 *
 * Pre-Phase-4 every note carried a hard-pinned `brain_schema:
 * marketing-brain.v1`. A breaking schema bump (renamed field, removed
 * enum value, restructured rollback) would have failed Zod parse on
 * every existing note in every existing vault — silently dropping them
 * from the SQLite index.
 *
 * This module ships the infrastructure for non-breaking schema growth:
 *  - `LATEST_SCHEMA` advertises the current version string.
 *  - `migrations[]` is an ordered list of `from → to` transforms.
 *  - `migrateFrontmatter()` walks the ladder until the note reaches
 *    `LATEST_SCHEMA`, returning the upgraded record.
 *
 * v1 is the only published schema today, so the ladder is empty. The
 * surface is here so a future `marketing-brain.v2` can land without a
 * cross-vault crisis.
 */
import "server-only";

export const LATEST_SCHEMA = "marketing-brain.v1";

export interface Migration {
  from: string;
  to: string;
  /** Transform a parsed frontmatter object. Must return a new object
   *  whose `brain_schema` matches `to`. May mutate other fields. */
  up: (note: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Ordered list. Each entry runs only if `note.brain_schema === from`.
 * After the transform we re-test `note.brain_schema`; if it still isn't
 * `LATEST_SCHEMA`, the next migration in the chain is considered.
 *
 * Append new entries at the END so older notes walk through every step.
 */
export const migrations: Migration[] = [
  // No published migrations yet — v1 is the current head.
];

/**
 * Walk `note.brain_schema` up to `LATEST_SCHEMA`. Returns the migrated
 * record. If no path exists (note is from a future version we don't
 * know about, or its schema label is unrecognised), returns the note
 * unchanged — the caller's Zod parse will surface the mismatch.
 */
export function migrateFrontmatter(
  note: Record<string, unknown>,
): Record<string, unknown> {
  let current = note;
  let guard = 0;
  while (
    current.brain_schema !== LATEST_SCHEMA &&
    guard < migrations.length + 1
  ) {
    const step = migrations.find((m) => m.from === current.brain_schema);
    if (!step) break;
    current = step.up(current);
    guard++;
  }
  return current;
}
