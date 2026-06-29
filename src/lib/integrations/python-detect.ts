import "server-only";

import { spawn } from "node:child_process";

const PYTHON_BIN = process.env.SEO_OFFICE_PYTHON || "python3";
const VERSION_SNIPPET =
  'import sys; print(".".join(str(v) for v in sys.version_info[:3]))';

/**
 * Lightweight "is Python available?" check for setup. Kept separate from
 * python.ts so the setup status route does not trace dynamic script paths.
 */
export async function detectPython(): Promise<
  { ok: true; version: string } | { ok: false; error: string }
> {
  return new Promise((resolve) => {
    const child = spawn(
      "sh",
      ["-lc", `${shellQuote(PYTHON_BIN)} -c ${shellQuote(VERSION_SNIPPET)}`],
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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
