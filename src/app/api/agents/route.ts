/**
 * GET /api/agents
 *   → { ok, live, clients }
 *
 * Live roll-up powering the in-office Live Agents HUD. Returns every
 * Task in queued/running/blocked, every Job in queued/running, and
 * every Assignment in proposed/queued/running/blocked, joined to
 * `client_slug` so the HUD can group cross-client when the user
 * toggles "all clients" mode.
 *
 * Query params:
 *   ?client=<slug>   restrict all three queries to a single client.
 *                    The HUD passes this by default so the user only
 *                    sees what's running for their selected client.
 *
 * No `recent` payload — the right-pane "recent jobs" footer in
 * OfficeWorkspace already shows terminal history for the active
 * client, and history doesn't belong in two places.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getDb, listClients } from "@/lib/brain/index-db";

export const dynamic = "force-dynamic";

interface LiveTaskRow {
  id: string;
  client_slug: string;
  title: string;
  status: string;
  specialist_id: string | null;
  parent_task_id: string | null;
  created_at: string;
  updated_at: string;
}
interface LiveJobRow {
  id: string;
  client_slug: string;
  specialist: string;
  status: string;
  message: string | null;
  started_at: string | null;
  created_at: string;
}
interface LiveAssignmentRow {
  id: string;
  client_slug: string;
  specialist_id: string;
  title: string;
  status: string;
  permission_mode: string;
  job_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET(request: NextRequest) {
  const db = getDb();
  const clientFilter = request.nextUrl.searchParams.get("client");

  // Ensure the tasks table exists — first hit on a fresh DB lazily
  // creates it. Wrapped in a try so the agents endpoint serves even
  // before any Task has been written.
  try {
    db.prepare("SELECT 1 FROM tasks LIMIT 1").all();
  } catch {
    /* table not yet created; live.tasks will simply be empty */
  }

  let liveTasks: LiveTaskRow[] = [];
  try {
    const sql = `SELECT id, client_slug, title, status, specialist_id, parent_task_id,
                        created_at, updated_at
                 FROM tasks
                 WHERE status IN ('planned','queued','running','blocked')
                   ${clientFilter ? "AND client_slug = ?" : ""}
                 ORDER BY updated_at DESC`;
    const stmt = db.prepare(sql);
    liveTasks = (clientFilter ? stmt.all(clientFilter) : stmt.all()) as LiveTaskRow[];
  } catch {
    liveTasks = [];
  }

  const jobsSql = `SELECT id, client_slug, specialist, status, message, started_at, created_at
                   FROM jobs
                   WHERE status IN ('queued','running')
                     ${clientFilter ? "AND client_slug = ?" : ""}
                   ORDER BY created_at DESC`;
  const jobsStmt = db.prepare(jobsSql);
  const liveJobs = (clientFilter ? jobsStmt.all(clientFilter) : jobsStmt.all()) as LiveJobRow[];

  let liveAssignments: LiveAssignmentRow[] = [];
  try {
    const sql = `SELECT id, client_slug, specialist_id, title, status, permission_mode,
                        job_id, created_at, updated_at
                 FROM assignments
                 WHERE status IN ('proposed','queued','running','blocked')
                   ${clientFilter ? "AND client_slug = ?" : ""}
                 ORDER BY updated_at DESC`;
    const stmt = db.prepare(sql);
    liveAssignments = (clientFilter ? stmt.all(clientFilter) : stmt.all()) as LiveAssignmentRow[];
  } catch {
    liveAssignments = [];
  }

  // Client metadata for grouping in "all clients" mode. Cheap (SQLite
  // read) and lets the HUD render pretty names instead of slugs.
  const clients = listClients().map((c) => ({
    slug: c.slug,
    name: c.name,
    site_url: c.site_url,
  }));

  return NextResponse.json({
    ok: true,
    live: {
      tasks: liveTasks,
      jobs: liveJobs,
      assignments: liveAssignments,
    },
    clients,
  });
}
