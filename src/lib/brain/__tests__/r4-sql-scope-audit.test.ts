import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_ROOTS = ["src/app", "src/lib"];
const TENANT_TABLES = ["notes", "jobs", "assignments", "tasks", "sweep_locks"];

const REVIEWED_UNSCOPED_SQL: Array<{
  file: string;
  match: RegExp;
  reason: string;
}> = [
  {
    file: "src/lib/brain/index-db.ts",
    match: /DELETE FROM sweep_locks WHERE expires_at < \?/i,
    reason: "global stale-lock cleanup; not reading or mutating a live client row",
  },
  {
    file: "src/lib/orchestrator/assignment.ts",
    match: /SELECT \* FROM assignments WHERE id = \?/i,
    reason: "id-keyed internal lookup; API routes must use ownership guards",
  },
  {
    file: "src/lib/orchestrator/assignment.ts",
    match: /SELECT \* FROM assignments WHERE job_id = \?/i,
    reason: "job-id internal lifecycle lookup after job ownership is known",
  },
  {
    file: "src/lib/orchestrator/assignment.ts",
    match: /UPDATE assignments\s+SET job_id = \?, updated_at = datetime\('now'\)\s+WHERE id = \?/i,
    reason: "internal assignment/job link by opaque id during same dispatch",
  },
  {
    file: "src/lib/orchestrator/assignment.ts",
    match: /SELECT result_path FROM jobs WHERE id = \?/i,
    reason: "terminal mirror lookup by linked job id only",
  },
  {
    file: "src/lib/orchestrator/task.ts",
    match: /UPDATE tasks\s+SET blocked_on_json = \?,\s+status\s+= CASE WHEN \? = '\[\]' THEN 'planned' ELSE 'blocked' END,\s+updated_at\s+= datetime\('now'\)\s+WHERE id = \?/i,
    reason: "second pass over tasks just inserted in the same task tree",
  },
  {
    file: "src/lib/orchestrator/task.ts",
    match: /SELECT \* FROM tasks WHERE id = \?/i,
    reason: "id-keyed internal lookup; traversal immediately re-enters client-scoped child queries",
  },
  {
    file: "src/lib/orchestrator/task.ts",
    match: /UPDATE tasks\s+SET status\s+= \?,[\s\S]*WHERE id = \?/i,
    reason: "internal task transition by opaque id from task runner state",
  },
  {
    file: "src/lib/orchestrator/job-queue.ts",
    match: /SELECT \* FROM jobs WHERE id = \?/i,
    reason: "worker lifecycle lookup by generated job id",
  },
  {
    file: "src/lib/orchestrator/job-queue.ts",
    match: /SELECT permission_mode FROM assignments WHERE job_id = \? LIMIT 1/i,
    reason: "job execution lookup by linked job id",
  },
  {
    file: "src/lib/orchestrator/job-queue.ts",
    match: /UPDATE jobs\s+SET status = 'running'[\s\S]*WHERE id = \? AND status = 'queued'/i,
    reason: "worker transition for the job id it just dequeued",
  },
  {
    file: "src/lib/orchestrator/job-queue.ts",
    match: /UPDATE jobs\s+SET status = 'succeeded'[\s\S]*WHERE id = \? AND status = 'running'/i,
    reason: "worker terminal transition for the job id it owns",
  },
  {
    file: "src/lib/orchestrator/job-queue.ts",
    match: /UPDATE jobs\s+SET status = 'failed'[\s\S]*WHERE id = \? AND status IN \('queued','running'\)/i,
    reason: "worker failure transition for the job id it owns",
  },
  {
    file: "src/lib/orchestrator/job-queue.ts",
    match: /UPDATE jobs\s+SET status = 'cancelled',\s+finished_at = datetime\('now'\),\s+message = \?\s+WHERE id = \? AND status IN \('queued','running'\)/i,
    reason: "worker soft-skip + blocked transitions for the job id it owns (markSkipped + markBlocked share SQL shape; SoftSkipError + BlockedError paths)",
  },
  {
    file: "src/lib/orchestrator/job-queue.ts",
    match: /UPDATE tasks\s+SET status = \?,[\s\S]*SELECT id FROM assignments WHERE job_id = \? LIMIT 1[\s\S]*AND status IN \('queued','running','planned','blocked'\)/i,
    reason: "job lifecycle mirrors to task through the unique linked assignment",
  },
  {
    file: "src/lib/orchestrator/job-queue.ts",
    match: /UPDATE jobs SET progress = \?, message = COALESCE\(\?, message\) WHERE id = \?/i,
    reason: "progress update for the currently running job id",
  },
  {
    file: "src/lib/orchestrator/recovery.ts",
    match: /SELECT id, client_slug, specialist\s+FROM jobs\s+WHERE status = 'running'/i,
    reason: "process-wide orphan recovery intentionally sweeps every stale running job",
  },
  {
    file: "src/lib/orchestrator/recovery.ts",
    match: /UPDATE jobs\s+SET status = 'failed', finished_at = datetime\('now'\), message = \?\s+WHERE id = \? AND status = 'running'/i,
    reason: "paired with process-wide orphan recovery selection",
  },
  {
    file: "src/lib/orchestrator/recovery.ts",
    match: /SELECT id FROM assignments WHERE job_id = \? AND status IN \('queued','running','blocked'\)/i,
    reason: "orphan recovery follows a stale job id selected with client_slug",
  },
  {
    file: "src/lib/orchestrator/recovery.ts",
    match: /UPDATE assignments\s+SET status = 'failed', message = \?, updated_at = datetime\('now'\)\s+WHERE id = \?/i,
    reason: "orphan recovery updates the assignment selected from the stale job id",
  },
  {
    file: "src/lib/orchestrator/recovery.ts",
    match: /UPDATE tasks\s+SET status = 'failed',[\s\S]*WHERE assignment_id = \?[\s\S]*AND status IN \('queued','running','planned','blocked'\)/i,
    reason: "orphan recovery mirrors failure to task through selected assignment id",
  },
  {
    file: "src/app/api/agents/route.ts",
    match: /DYNAMIC_PREPARE:sql|DYNAMIC_PREPARE:jobsSql/i,
    reason: "operator-wide agent HUD intentionally supports cross-client view unless filtered",
  },
  {
    file: "src/app/api/agents/route.ts",
    match: /SELECT 1 FROM tasks LIMIT 1/i,
    reason: "existence probe only; returns no tenant data and degrades when task table is absent",
  },
];

test("R4 tenant-table SQL is client-scoped or explicitly reviewed", async () => {
  const files = await productionSourceFiles();
  const statements = files.flatMap(extractPreparedStatements);
  const violations = statements.filter(isUnscopedTenantStatement);
  const unreviewed = violations.filter((statement) => !reviewFor(statement));

  assert.deepEqual(
    unreviewed.map((statement) => `${statement.file}: ${statement.sql}`),
    [],
  );

  const staleReviews = REVIEWED_UNSCOPED_SQL.filter(
    (review) =>
      !violations.some(
        (statement) => statement.file === review.file && review.match.test(statement.sql),
      ),
  );
  assert.deepEqual(
    staleReviews.map((review) => `${review.file}: ${review.reason}`),
    [],
  );
});

interface PreparedStatement {
  file: string;
  sql: string;
}

async function productionSourceFiles(): Promise<string[]> {
  const out: string[] = [];
  for (const root of SCAN_ROOTS) {
    await walk(path.join(ROOT, root), out);
  }
  return out
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => !file.includes(`${path.sep}__tests__${path.sep}`))
    .filter((file) => !file.endsWith(".d.ts"))
    .map((file) => path.relative(ROOT, file).replace(/\\/g, "/"))
    .sort();
}

async function walk(dir: string, out: string[]): Promise<void> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute, out);
    } else {
      out.push(absolute);
    }
  }
}

function extractPreparedStatements(file: string): PreparedStatement[] {
  const absolute = path.join(ROOT, file);
  const source = fsRead(absolute);
  const statements: PreparedStatement[] = [];

  const literalRe = /\.prepare\(\s*([`"'])([\s\S]*?)\1\s*,?\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = literalRe.exec(source))) {
    statements.push({ file, sql: normalizeSql(match[2]) });
  }

  const dynamicRe = /\.prepare\(\s*([A-Za-z_$][\w$]*)\s*\)/g;
  while ((match = dynamicRe.exec(source))) {
    statements.push({ file, sql: `DYNAMIC_PREPARE:${match[1]}` });
  }

  return statements;
}

function fsRead(absolute: string): string {
  return fs.readFileSync(absolute, "utf8");
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function isUnscopedTenantStatement(statement: PreparedStatement): boolean {
  const sql = statement.sql;
  if (sql.startsWith("DYNAMIC_PREPARE:")) return true;
  if (/^INSERT\b/i.test(sql)) return false;
  if (!/\b(SELECT|UPDATE|DELETE)\b/i.test(sql)) return false;
  if (!TENANT_TABLES.some((table) => new RegExp(`\\b${table}\\b`, "i").test(sql))) {
    return false;
  }
  if (/\bclient_slug\s*=\s*\?/i.test(sql)) return false;
  if (/\bclient_slug\s+IN\s*\(/i.test(sql)) return false;
  return true;
}

function reviewFor(statement: PreparedStatement) {
  return REVIEWED_UNSCOPED_SQL.find(
    (review) => review.file === statement.file && review.match.test(statement.sql),
  );
}
