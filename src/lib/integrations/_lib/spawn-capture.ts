/**
 * Shared subprocess spawn + capture + abort util.
 *
 * Three callers in tree:
 *   - `providers/claude-cli.ts` — synchronous `claude --print` for the
 *     LLMProvider contract. Buffered output, no streaming.
 *   - `gcloud.ts` — `gcloud` REST helpers (auth tokens, project lookup).
 *     Buffered output, no streaming.
 *   - `claude-code-agent.ts` — `claude --print --output-format stream-json`
 *     for the agentic chat backend. Streaming via `onStdout`, plus
 *     SIGTERM→SIGKILL cascade on abort.
 *
 * Why this exists at all (kernel rule "no abstraction without three real
 * callers"): three real callers were all duplicating
 * spawn-+-buffer-+-timeout-+-kill logic. Pulled them together so the
 * cascade and exit-code semantics live in one place. Each caller still
 * keeps its own domain logic (NDJSON parsing, version probing, ADC token
 * extraction) — only the process-management layer is shared.
 */
import "server-only";

import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";

/** Default SIGTERM→SIGKILL grace window. Matches what the agent wrapper
 *  used pre-refactor; long enough for `claude` to flush its result line
 *  on graceful termination, short enough that aborts feel instant. */
const DEFAULT_SIGKILL_GRACE_MS = 2000;

export interface SpawnCaptureOpts {
  /** Working directory. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Env override. Inherits `process.env` if omitted; if provided, the
   *  helper merges over `process.env` so partial overrides work. */
  env?: NodeJS.ProcessEnv;
  /** If set, written to stdin and stdin is closed (lets `--print`-style
   *  CLIs read the prompt without exposing it via argv). */
  input?: string;
  /** Wall-clock timeout in ms. Triggers SIGKILL (not SIGTERM) so a hung
   *  child doesn't waste the grace window. */
  timeoutMs?: number;
  /** Abort triggers SIGTERM, then SIGKILL after the grace window. */
  signal?: AbortSignal;
  /** Override the SIGTERM→SIGKILL grace window. */
  sigkillGraceMs?: number;
  /** Streaming hook: each stdout chunk (decoded utf8) is passed through.
   *  Output is ALSO buffered into the resolved result, so non-streaming
   *  callers don't have to opt in to capture. */
  onStdout?: (chunk: string) => void;
  /** Mirror of onStdout for stderr. */
  onStderr?: (chunk: string) => void;
}

export interface SpawnCaptureResult {
  stdout: string;
  stderr: string;
  /** -1 if the child errored before exit (`error` event fired). */
  exitCode: number;
  /** True if the timeout fired and SIGKILL was sent. */
  timedOut: boolean;
  /** True if the abort signal fired. Subsumes timedOut when abort was
   *  the cause; check timedOut separately to distinguish. */
  killed: boolean;
  /** Reference to the spawned process. Exposed so streaming callers
   *  (the agent wrapper) can hook additional listeners between spawn
   *  and resolve — though most callers should not need this. */
  child: ChildProcessWithoutNullStreams;
}

/**
 * Spawn a child process, capture stdout/stderr, return the result.
 *
 * The shape supports both buffered callers (caller awaits the promise,
 * reads `stdout`) and streaming callers (caller passes `onStdout` and
 * processes chunks live; the promise still resolves at exit).
 *
 * Never throws — failure modes are encoded in the result fields
 * (exitCode=-1, stderr containing the error message). Callers branch on
 * the fields they care about.
 */
export function spawnCapture(
  bin: string,
  args: string[],
  opts: SpawnCaptureOpts = {},
): Promise<SpawnCaptureResult> {
  const sigkillGraceMs = opts.sigkillGraceMs ?? DEFAULT_SIGKILL_GRACE_MS;
  const hasInput = typeof opts.input === "string";
  const stdio: ["pipe" | "ignore", "pipe", "pipe"] = [
    hasInput ? "pipe" : "ignore",
    "pipe",
    "pipe",
  ];

  return new Promise<SpawnCaptureResult>((resolve) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(bin, args, {
        cwd: opts.cwd,
        env: opts.env ? { ...process.env, ...opts.env } : process.env,
        stdio,
      }) as ChildProcessWithoutNullStreams;
    } catch (err) {
      // spawn() throws synchronously on bad bin path / EACCES / etc.
      // Map to the same shape as a runtime 'error' event so callers
      // have one branch instead of two.
      resolve({
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        exitCode: -1,
        timedOut: false,
        killed: false,
        // Cast — there's no live child, but the shape needs it. Callers
        // that touch `result.child` after a spawn failure are wrong
        // regardless; this matches what the pre-refactor sites did
        // (they had no equivalent path at all).
        child: undefined as unknown as ChildProcessWithoutNullStreams,
      });
      return;
    }

    let stdoutBuf = "";
    let stderrBuf = "";
    let timedOut = false;
    let killed = false;
    let timeoutHandle: NodeJS.Timeout | null = null;
    let sigkillHandle: NodeJS.Timeout | null = null;
    let settled = false;

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuf += chunk;
      if (opts.onStdout) opts.onStdout(chunk);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderrBuf += chunk;
      if (opts.onStderr) opts.onStderr(chunk);
    });

    if (hasInput) {
      // Pipe the prompt; close stdin so `--print` knows EOF arrived.
      try {
        child.stdin.end(opts.input, "utf8");
      } catch {
        // Race: child died before stdin opened. Falls through — the
        // 'error' or 'close' handler resolves the promise.
      }
    }

    const settle = (
      partial: Pick<SpawnCaptureResult, "exitCode"> &
        Partial<Pick<SpawnCaptureResult, "stderr">>,
    ): void => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (sigkillHandle) clearTimeout(sigkillHandle);
      resolve({
        stdout: stdoutBuf,
        stderr: partial.stderr ?? stderrBuf,
        exitCode: partial.exitCode,
        timedOut,
        killed,
        child,
      });
    };

    if (typeof opts.timeoutMs === "number" && opts.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        killed = true;
        try {
          child.kill("SIGKILL");
        } catch {
          /* already dead */
        }
      }, opts.timeoutMs);
    }

    if (opts.signal) {
      const onAbort = (): void => {
        killed = true;
        try {
          child.kill("SIGTERM");
        } catch {
          /* already dead */
        }
        sigkillHandle = setTimeout(() => {
          if (!settled && !child.killed) {
            try {
              child.kill("SIGKILL");
            } catch {
              /* ignore */
            }
          }
        }, sigkillGraceMs);
      };
      if (opts.signal.aborted) {
        onAbort();
      } else {
        opts.signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    child.on("error", (err) => {
      settle({
        exitCode: -1,
        stderr: stderrBuf || (err instanceof Error ? err.message : String(err)),
      });
    });

    child.on("close", (code) => {
      settle({ exitCode: code ?? -1 });
    });
  });
}
