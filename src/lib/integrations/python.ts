/**
 * Bridge to vendored Python scripts.
 *
 * The orchestrator runs claude-seo / marketing-brain Python scripts via
 * `child_process.spawn`. Stdout streams back as line-buffered events the
 * specialist can re-publish through `ctx.emit()`; stderr is logged and
 * collected for the final error message.
 *
 * No interpreter is bundled — the user is expected to have Python 3.11+
 * on their PATH (the install.sh verifies this).
 */
import "server-only";
import { spawn } from "node:child_process";
import path from "node:path";

const PYTHON_BIN = process.env.SEO_OFFICE_PYTHON || "python3";

export interface PythonRunOptions {
  /** Script path relative to project root (e.g. vendored/claude-seo/scripts/fetch_page.py). */
  script: string;
  /** Positional + flag args passed verbatim. */
  args?: string[];
  /** Environment variables overlaid on top of `process.env`. */
  env?: Record<string, string>;
  /** Called for each stdout line as it arrives. */
  onStdout?: (line: string) => void;
  /** Called for each stderr line as it arrives. */
  onStderr?: (line: string) => void;
  /** Hard timeout in ms. Default: no timeout. */
  timeoutMs?: number;
  /** Optional cancellation signal. Aborting kills the child process. */
  signal?: AbortSignal;
}

export interface PythonRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

export async function runPython(
  options: PythonRunOptions,
): Promise<PythonRunResult> {
  const scriptAbs = path.isAbsolute(options.script)
    ? options.script
    : path.join(/*turbopackIgnore: true*/ process.cwd(), options.script);
  const args = [scriptAbs, ...(options.args ?? [])];

  return new Promise<PythonRunResult>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error("Python script cancelled before start"));
      return;
    }

    const child = spawn(PYTHON_BIN, args, {
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stdoutBuf = "";
    let stderrBuf = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      stdoutBuf += chunk;
      let idx;
      while ((idx = stdoutBuf.indexOf("\n")) !== -1) {
        const line = stdoutBuf.slice(0, idx);
        stdoutBuf = stdoutBuf.slice(idx + 1);
        options.onStdout?.(line);
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      stderrBuf += chunk;
      let idx;
      while ((idx = stderrBuf.indexOf("\n")) !== -1) {
        const line = stderrBuf.slice(0, idx);
        stderrBuf = stderrBuf.slice(idx + 1);
        options.onStderr?.(line);
      }
    });

    let timer: NodeJS.Timeout | null = null;
    let timedOut = false;
    if (options.timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, options.timeoutMs);
    }

    const onAbort = () => {
      child.kill("SIGKILL");
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      reject(err);
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (options.signal?.aborted) {
        reject(new Error("Python script cancelled"));
        return;
      }
      // flush partial lines
      if (stdoutBuf) options.onStdout?.(stdoutBuf);
      if (stderrBuf) options.onStderr?.(stderrBuf);
      if (timedOut) {
        const suffix = `Python script timed out after ${options.timeoutMs}ms`;
        resolve({
          exitCode: 124,
          stdout,
          stderr: stderr ? `${stderr.trimEnd()}\n${suffix}\n` : `${suffix}\n`,
          timedOut: true,
        });
        return;
      }
      resolve({ exitCode: code ?? 0, stdout, stderr });
    });
  });
}

/**
 * Lightweight "is Python available?" check — used by the setup wizard.
 * Spawns `python3 -c "<print version>"` directly so it doesn't go through
 * the file-path path in runPython().
 */
export async function detectPython(): Promise<
  { ok: true; version: string } | { ok: false; error: string }
> {
  return new Promise((resolve) => {
    const child = spawn(
      PYTHON_BIN,
      ["-c", 'import sys; print(".".join(str(v) for v in sys.version_info[:3]))'],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString("utf8")));
    child.stderr.on("data", (b) => (stderr += b.toString("utf8")));
    child.on("error", (err) =>
      resolve({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    );
    child.on("close", (code) => {
      if (code !== 0) {
        resolve({ ok: false, error: stderr.trim() || `exit ${code ?? "?"}` });
        return;
      }
      resolve({ ok: true, version: stdout.trim() });
    });
    setTimeout(() => child.kill("SIGKILL"), 5000);
  });
}
