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
const write = args.includes("--write");
const json = args.includes("--json");
const help = args.includes("--help") || args.includes("-h");
const slug = args.find((arg) => !arg.startsWith("-"));

if (help || !slug) {
  console.log(`Usage: node scripts/backfill-client-brain.mjs <client-slug> [--write] [--json]

Backfills dated specialist artifacts into canonical Marketing Brain notes.

Default mode is a dry-run. Add --write to mutate the local vault.
`);
  process.exit(help ? 0 : 1);
}

const { backfillCanonicalBrain } = await import("@/lib/brain/backfill-canonical.ts");

const result = await backfillCanonicalBrain(slug, { write });

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(
    `${write ? "Wrote" : "Dry-run"} canonical backfill for ${result.clientSlug}`,
  );
  for (const change of result.changes) {
    const marker = change.reason === "missing_source" ? "!" : change.changed ? "+" : "=";
    console.log(
      `${marker} ${change.targetPath} [${change.sectionId}] ${change.reason}`,
    );
    for (const source of change.sourcePaths) {
      console.log(`    <- ${source}`);
    }
  }
  if (!write) {
    console.log("\nNo files were changed. Re-run with --write to apply.");
  }
}
