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

const args = process.argv.slice(2);
const help = args.includes("--help") || args.includes("-h");
const live = args.includes("--live");
const json = args.includes("--json");
const strict = args.includes("--strict");
const providersArg = valueFor("--providers");
const requiredArg = valueFor("--required");

if (help) {
  console.log(`Usage: node scripts/smoke-provider-readiness.mjs [--live] [--strict] [--json] [--providers=a,b] [--required=a,b]

Checks whether real-provider readiness is sufficient for a Deep Brain launch gate.

Default mode is a secret-safe dry-run: it reports configured/missing providers
without making network calls. Add --live to run the app's cheapest real API
probes. Add --strict to exit non-zero when required providers are not ready.

Default required providers: dataforseo, search-console, ga4.
`);
  process.exit(0);
}

const { runProviderSmoke } = await import("@/lib/setup/provider-smoke.ts");

const report = await runProviderSmoke({
  live,
  providerIds: csv(providersArg),
  requiredIds: csv(requiredArg),
});

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    `Provider smoke ${report.mode}: ${report.launchReady ? "launch-ready" : "not launch-ready"}`,
  );
  console.log(`Required: ${report.requiredIds.join(", ")}`);
  for (const result of report.results) {
    const marker =
      result.status === "passed" || result.status === "configured"
        ? "+"
        : result.required
          ? "!"
          : "-";
    console.log(
      `${marker} ${result.id.padEnd(16)} ${result.status.padEnd(10)} ${result.detail}`,
    );
  }
  if (!live) {
    console.log("\nNo live API calls were made. Re-run with --live for real-account smoke.");
  }
}

if (strict && !report.launchReady) process.exit(1);

function valueFor(flag) {
  const match = args.find((arg) => arg.startsWith(`${flag}=`));
  return match ? match.slice(flag.length + 1) : undefined;
}

function csv(value) {
  if (!value) return undefined;
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
