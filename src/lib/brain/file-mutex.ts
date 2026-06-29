/**
 * Per-(client, relative path) async mutex.
 *
 * Generalised from the per-client write chain in
 * `src/lib/orchestrator/audit-trail.ts`. Any read-modify-write helper
 * that touches a vault file must hold this lock across the read AND the
 * write — otherwise two parallel specialists can each read the same
 * baseline, each merge in their own change, and the second writer
 * silently drops the first writer's work.
 *
 * In-process scope only — matches the rest of the app (single Node
 * process, single vault filesystem). If we ever fan out to multiple
 * worker processes, this needs a filesystem-level lock or a SQLite
 * advisory lock.
 *
 * Failures don't dam the chain: a thrown `fn` releases the lock on the
 * next caller. The composition `previous.then(fn, fn)` deliberately runs
 * `fn` whether the prior call resolved or rejected.
 */
import "server-only";

const chains = new Map<string, Promise<unknown>>();

function chainKey(clientSlug: string, relativePath: string): string {
  // Posix-normalise so a Windows-style relative path doesn't bypass the
  // mutex for the same logical file.
  return `${clientSlug}::${relativePath.replace(/\\/g, "/")}`;
}

/**
 * Serialise `fn` against every other call for the same (client, path).
 * Returns the resolved value of `fn`. Releases the chain whether `fn`
 * resolves or rejects.
 */
export function withFileMutex<T>(
  clientSlug: string,
  relativePath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = chainKey(clientSlug, relativePath);
  const previous = (chains.get(key) ?? Promise.resolve()) as Promise<unknown>;
  const next = previous.then(fn, fn);
  // Swallow rejections on the chain so the next caller can proceed; the
  // caller of `next` still sees the real outcome.
  chains.set(
    key,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

/**
 * Diagnostic-only: how many distinct (client, path) keys currently have a
 * write chain. Used by tests to assert the mutex is being acquired.
 */
export function _activeMutexCount(): number {
  return chains.size;
}
