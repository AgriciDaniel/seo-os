import "server-only";
import path from "node:path";
import { runPython, type PythonRunResult } from "@/lib/integrations/python";
import { envValue } from "@/lib/setup/env-local";
import { vaultRoot } from "@/lib/brain/paths";

const SCRIPT_DIR = "vendored/marketing-brain/scripts";

export const MARKETING_BRAIN_SCRIPTS = [
  {
    id: "build-keyword-xlsx",
    file: "build_keyword_xlsx.py",
    requirements: [],
  },
  {
    id: "capture-visual-references",
    file: "capture_visual_references.py",
    requirements: [],
  },
  {
    id: "find-competitors",
    file: "find_competitors.py",
    requirements: ["dataforseo"],
  },
  {
    id: "mine-paa-serps",
    file: "mine_paa_serps.py",
    requirements: ["dataforseo"],
  },
  {
    id: "pull-competitor-kw",
    file: "pull_competitor_kw.py",
    requirements: ["dataforseo"],
  },
  {
    id: "render-beast-pdf",
    file: "render_beast_pdf.py",
    requirements: [],
  },
  {
    id: "synthesize-beast-plan",
    file: "synthesize_beast_plan.py",
    requirements: [],
  },
] as const satisfies readonly MarketingBrainScript[];

export type MarketingBrainScriptId = (typeof MARKETING_BRAIN_SCRIPTS)[number]["id"];
export type MarketingBrainRequirement = "dataforseo";

export interface MarketingBrainScript {
  id: string;
  file: string;
  requirements: readonly MarketingBrainRequirement[];
}

export interface MarketingBrainScriptRunOptions {
  args?: string[];
  env?: Record<string, string | undefined>;
  onLine?: (line: string, stream: "stdout" | "stderr") => void;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export type MarketingBrainScriptRunResult =
  | {
      status: "succeeded";
      script: MarketingBrainScript;
      result: PythonRunResult;
    }
  | {
      status: "needs_data";
      script: MarketingBrainScript;
      missing: string[];
      message: string;
    };

export function getMarketingBrainScript(
  id: MarketingBrainScriptId,
): MarketingBrainScript {
  const script = MARKETING_BRAIN_SCRIPTS.find((entry) => entry.id === id);
  if (!script) throw new Error(`unknown Marketing Brain script: ${id}`);
  return script;
}

export function preflightMarketingBrainScript(
  script: MarketingBrainScript,
  env?: Record<string, string | undefined>,
): { ok: true } | { ok: false; missing: string[]; message: string } {
  const missing: string[] = [];

  if (script.requirements.includes("dataforseo")) {
    if (!readEnv("DATAFORSEO_LOGIN", env)) missing.push("DATAFORSEO_LOGIN");
    if (!readEnv("DATAFORSEO_PASSWORD", env)) missing.push("DATAFORSEO_PASSWORD");
  }

  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    missing,
    message:
      `${script.id} needs ${missing.join(" and ")} before it can use live ` +
      "Marketing Brain data generation.",
  };
}

export async function runMarketingBrainScript(
  clientSlug: string,
  id: MarketingBrainScriptId,
  options: MarketingBrainScriptRunOptions = {},
): Promise<MarketingBrainScriptRunResult> {
  const script = getMarketingBrainScript(id);
  const preflight = preflightMarketingBrainScript(script, options.env);
  if (!preflight.ok) {
    return {
      status: "needs_data",
      script,
      missing: preflight.missing,
      message: preflight.message,
    };
  }

  const result = await runPython({
    script: path.posix.join(SCRIPT_DIR, script.file),
    args: ["--vault", vaultRoot(clientSlug), ...(options.args ?? [])],
    env: sanitiseEnv(options.env),
    onStdout: (line) => options.onLine?.(line, "stdout"),
    onStderr: (line) => options.onLine?.(line, "stderr"),
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  });

  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`;
    throw new Error(`${script.id} failed: ${detail.slice(0, 500)}`);
  }

  return {
    status: "succeeded",
    script,
    result,
  };
}

function readEnv(name: string, env?: Record<string, string | undefined>): string | undefined {
  if (env) return env[name];
  return envValue(name);
}

function sanitiseEnv(
  env?: Record<string, string | undefined>,
): Record<string, string> | undefined {
  if (!env) return undefined;
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}
