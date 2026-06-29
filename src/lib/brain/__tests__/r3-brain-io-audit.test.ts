import { test } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import path from "node:path";

const SRC_ROOT = path.resolve(process.cwd(), "src");

const EXPLICIT_ANY_PATTERNS = [
  /\bas\s+any\b/,
  /:\s*any\b/,
  /Record\s*<\s*[^,>]+,\s*any\s*>/,
  /Array\s*<\s*any\s*>/,
  /<\s*any\s*>/,
];

const RAW_BRAIN_IO_PATTERNS = [
  /\breadRaw\s*\(/,
  /\bwriteRaw\s*\(/,
  /from\s+["']gray-matter["']/,
  /\bmatter\s*\(/,
];

/**
 * R3 allows raw vault access only where the file is not a schemaful brain note
 * boundary, or where the caller is explicitly preserving existing markdown
 * frontmatter/body text. Everything else should use readNote()/writeNote().
 */
const REVIEWED_RAW_BRAIN_IO = new Map<string, string>([
  [
    "src/lib/brain/backfill-canonical.ts",
    "merges generated sections into existing human-authored markdown before final note validation",
  ],
  [
    "src/lib/brain/brain-review.ts",
    "JSON Brain Review summary sidecar (wiki/meta/brain-review.json), not a markdown brain note",
  ],
  [
    "src/lib/brain/canonical-writer.ts",
    "thin wrapper around canonical markdown section replacement",
  ],
  [
    "src/lib/brain/evidence-ledger.ts",
    "NDJSON evidence ledger, not a markdown brain note",
  ],
  [
    "src/lib/brain/index-db.ts",
    "read-only indexer parses frontmatter and validates with Frontmatter.safeParse()",
  ],
  [
    "src/lib/brain/index-render.ts",
    "rewrites managed index.md while preserving existing frontmatter fields",
  ],
  [
    "src/lib/brain/log-archive.ts",
    "archives append-only log.md text while preserving archive frontmatter",
  ],
  [
    "src/lib/brain/overview-render.ts",
    "rewrites managed overview.md while preserving existing frontmatter fields",
  ],
  [
    "src/lib/brain/readiness-repair.ts",
    "repairs known readiness debt in existing markdown while preserving note text",
  ],
  [
    "src/lib/brain/readiness.ts",
    "read-only readiness analysis strips frontmatter from existing notes",
  ],
  [
    "src/lib/brain/scaffold.ts",
    "parses repaired business-type overlay markdown before passing it through writeNote() validation",
  ],
  [
    "src/lib/brain/structured-log.ts",
    "JSON structured log sidecar, not a markdown brain note",
  ],
  [
    "src/lib/brain/vault-fs.ts",
    "the validated note I/O boundary and raw primitive implementation",
  ],
  [
    "src/lib/orchestrator/audit-trail.ts",
    "append-only log.md writer that preserves existing log frontmatter",
  ],
  [
    "src/lib/orchestrator/client-context.ts",
    ".raw/.manifest.json sidecar writer, not a markdown brain note",
  ],
  [
    "src/lib/orchestrator/job-queue.ts",
    "E2E fixture sidecars and deterministic fixture note scrubber",
  ],
  [
    "src/lib/orchestrator/working-memory.ts",
    "hot.md working-memory cache parser/writer that preserves existing frontmatter",
  ],
  [
    "src/lib/specialists/_lib/artifact.ts",
    "writes validated artifacts via writeNote(); raw writes are report/data sidecars",
  ],
  [
    "src/lib/specialists/brand-strategist.ts",
    "writes GitHub repository metadata JSON under .raw/",
  ],
  [
    "src/lib/specialists/vault-linter.ts",
    "read-only linter scans raw markdown and validates frontmatter separately",
  ],
]);

test("R3 production source has no explicit any-typed brain I/O escape hatches", async () => {
  const files = await listSourceFiles(SRC_ROOT);
  const offenders: string[] = [];
  for (const file of files) {
    const source = await fsp.readFile(file, "utf8");
    const relative = toRepoPath(file);
    for (const pattern of EXPLICIT_ANY_PATTERNS) {
      if (pattern.test(stripComments(source))) {
        offenders.push(`${relative}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `R3 forbids explicit any in production src; use unknown + zod/schema parsing instead.\n${offenders.join("\n")}`,
  );
});

test("R3 raw brain I/O call sites are reviewed and documented", async () => {
  const files = await listSourceFiles(SRC_ROOT);
  const rawUsers: string[] = [];
  for (const file of files) {
    const source = await fsp.readFile(file, "utf8");
    if (!RAW_BRAIN_IO_PATTERNS.some((pattern) => pattern.test(source))) continue;
    rawUsers.push(toRepoPath(file));
  }

  const unreviewed = rawUsers.filter((file) => !REVIEWED_RAW_BRAIN_IO.has(file));
  const staleReviews = [...REVIEWED_RAW_BRAIN_IO.keys()].filter(
    (file) => !rawUsers.includes(file),
  );

  assert.deepEqual(
    unreviewed,
    [],
    `R3 raw brain I/O must be reviewed. Prefer readNote()/writeNote() unless this is raw text/JSON/sidecar handling.\n${unreviewed.join("\n")}`,
  );
  assert.deepEqual(
    staleReviews,
    [],
    `R3 raw brain I/O review allowlist has stale entries.\n${staleReviews.join("\n")}`,
  );
});

async function listSourceFiles(root: string): Promise<string[]> {
  const entries = await fsp.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      files.push(...(await listSourceFiles(absolute)));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) files.push(absolute);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function toRepoPath(file: string): string {
  return path.relative(process.cwd(), file).split(path.sep).join("/");
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}
