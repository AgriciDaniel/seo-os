#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");

if (process.env.SEO_OFFICE_TS_SCRIPT_HOOK !== "1") {
  const hook = path.join(repoRoot, "scripts", "test-resolve-hook.mjs");
  const child = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      hook,
      __filename,
      ...process.argv.slice(2),
    ],
    {
      cwd: repoRoot,
      env: { ...process.env, SEO_OFFICE_TS_SCRIPT_HOOK: "1" },
      stdio: "inherit",
    },
  );
  process.exit(child.status ?? 1);
}

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const help = args.includes("--help") || args.includes("-h");
const json = args.includes("--json");
const keep = args.includes("--keep");
const rows = Number(valueFor("--rows") ?? 180);

if (help) {
  console.log(`Usage: node scripts/smoke-marketing-brain-scripts.mjs [--json] [--keep] [--rows=180]

Runs an offline, temp-vault smoke test for vendored Marketing Brain Python
scripts. It creates realistic DataForSEO-shaped fixture files, exercises the
keyword workbook, visual capture, BEAST plan synthesis, and HTML report paths,
then removes the temp data root unless --keep is provided.
`);
  process.exit(0);
}

const { runMarketingBrainScriptSmoke } = await import(
  "@/lib/marketing-brain/script-smoke.ts"
);

const report = await runMarketingBrainScriptSmoke({
  keywordRows: Number.isFinite(rows) && rows > 0 ? rows : 180,
  keepDataRoot: keep,
});

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Marketing Brain script smoke: ${report.ok ? "passed" : "failed"}`);
  console.log(`Data root: ${report.dataRoot}${report.cleanedUp ? " (removed)" : ""}`);
  for (const step of report.steps) {
    const marker = step.status === "passed" ? "+" : "!";
    console.log(`${marker} ${step.id.padEnd(28)} ${step.detail}`);
  }
  if (Object.keys(report.outputs).length > 0) {
    console.log(`\nValidated outputs${report.cleanedUp ? " before cleanup" : ""}:`);
    for (const [key, value] of Object.entries(report.outputs)) {
      console.log(`- ${key}: ${value}`);
    }
  }
}

if (!report.ok) process.exit(1);

function valueFor(flag) {
  const match = args.find((arg) => arg.startsWith(`${flag}=`));
  return match ? match.slice(flag.length + 1) : undefined;
}
