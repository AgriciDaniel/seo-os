/**
 * SoftSkipError — sentinel error class that signals "the specialist
 * cannot complete BUT this isn't a system failure". Examples:
 *
 *   - Google Search Console: the user is authenticated and the
 *     integration is configured, but the active client's site is not
 *     in the verified properties list for the signed-in account. The
 *     specialist has done its job — refused to fabricate data — and
 *     this should read as "needs property verification" (yellow ⊘),
 *     not "the system is broken" (red ✗).
 *
 *   - GA4: signed in but no measurement ID for this client.
 *
 * The orchestrator's job-queue catch block uses `err instanceof
 * SoftSkipError` to route the outcome through `markSkipped` (status
 * "cancelled", `result_summary` prefixed `skipped:`) instead of
 * `markFailed`. The TaskFeed surfaces it with the yellow skipped
 * glyph, the StatusBar's HEALTH score skips counting it as a failure,
 * and the next-action card recommends the appropriate fix (add the
 * property, switch account, etc.) rather than "retry the failed
 * specialist".
 *
 * The existing dispatch-time skip path (when `requireIntegrations`
 * detects a missing integration before the specialist runs) writes
 * the same `skipped:` prefix, so the rest of the orchestrator's
 * readiness scoring and chat narration treats both flavors of skip
 * uniformly.
 */
export class SoftSkipError extends Error {
  /**
   * Stable kind tag so consumers can switch on the *category* of skip
   * without parsing the message. Optional — defaults to "soft-skip"
   * when the call site only has a free-form reason.
   */
  readonly kind: string;

  /**
   * Optional short tag suitable for the failure envelope's errorClass
   * field (renders in the Specialist Inbox without parsing). Falls
   * back to "SoftSkipError" when omitted.
   */
  readonly tag: string;

  constructor(message: string, opts: { kind?: string; tag?: string } = {}) {
    super(message);
    this.name = "SoftSkipError";
    this.kind = opts.kind ?? "soft-skip";
    this.tag = opts.tag ?? "SoftSkipError";
  }
}

/** Type guard — `err instanceof SoftSkipError` works across module
 *  boundaries because we export the class itself; this helper exists
 *  for callers that prefer a predicate form. */
export function isSoftSkip(err: unknown): err is SoftSkipError {
  return err instanceof SoftSkipError;
}

/**
 * BlockedError — sibling sentinel for "this specialist refuses to
 * proceed because an UPSTREAM gate failed", as opposed to SoftSkip's
 * "the specialist itself can't run here". The canonical case is
 * phase-gate: when the vault has lint errors or readiness is
 * "blocked", phase-gate writes its review artifact then throws — not
 * because phase-gate broke, but because the user must fix the
 * upstream blocker (lint errors, missing evidence, etc) before the
 * rest of the sweep should continue.
 *
 * The orchestrator's job-queue catch block uses `err instanceof
 * BlockedError` to route the outcome through `markBlocked` (status
 * "cancelled", `result_summary` prefixed `blocked:`), parallel to
 * the soft-skip path. The TaskFeed paints it amber (⊠ BLOCKED)
 * rather than red (✗ FAILED), so the user immediately sees this is
 * a policy enforcement, not a crash.
 *
 * The split between SoftSkipError and BlockedError matters because:
 *   - SoftSkip → "this specialist won't work HERE" (next-action:
 *     change setup, e.g. add the GSC property)
 *   - Blocked  → "upstream artifacts aren't ready yet" (next-action:
 *     fix the upstream blocker, e.g. resolve lint errors)
 * Surface text + click target differ for each case, so a single
 * "graceful failure" class would conflate two distinct fix paths.
 */
export class BlockedError extends Error {
  readonly kind: string;
  readonly tag: string;
  /** Optional path to the artifact that explains the block (e.g. the
   *  phase-gate's own review file). Surfaced by the TaskFeed click
   *  handler so the user can read what's actually wrong. */
  readonly artifactPath?: string;

  constructor(
    message: string,
    opts: { kind?: string; tag?: string; artifactPath?: string } = {},
  ) {
    super(message);
    this.name = "BlockedError";
    this.kind = opts.kind ?? "blocked";
    this.tag = opts.tag ?? "BlockedError";
    this.artifactPath = opts.artifactPath;
  }
}

/** Type guard — symmetric with `isSoftSkip`. */
export function isBlocked(err: unknown): err is BlockedError {
  return err instanceof BlockedError;
}
