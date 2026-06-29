/**
 * State machine: read a client's vault state, return the next recommended action.
 *
 * Adapted from marketing-brain's `guide_next_action.py`. Re-pointed for
 * SEO Office's specialist flow:
 *
 *   1. no vault          → "scaffold the vault"
 *   2. no manifest       → "scaffold the vault"  (defensive — should already exist)
 *   3. no technical audit → "run Technical Auditor"
 *   4. no content audit   → "run Content Strategist"
 *   5. no schema check    → "run Schema Validator"
 *   6. no keyword research → "run Keyword Researcher"
 *   7. no BEAST plan      → "run BEAST Planner"
 *   8. all mature         → "no urgent action — pick anything"
 */
import "server-only";
import fs from "node:fs";
import path from "node:path";
import {
  ensureManifestMigrated,
  hotPath,
  manifestPath,
  vaultRoot,
} from "@/lib/brain/paths";
import { getDb } from "@/lib/brain/index-db";
import { INTEGRATIONS } from "@/lib/integrations/catalog";
import { adcAvailableSync, hasScopeSync, SCOPE } from "@/lib/integrations/gcloud";
import { mergedRuntimeEnv } from "@/lib/setup/env-local";
import { lintVault } from "@/lib/specialists/vault-linter";
import { readHot } from "./working-memory";

export interface NextAction {
  /** Stable ID — UI uses this to pick a specialist or scaffolder. */
  id:
    | "scaffold-vault"
    | "run-technical-auditor"
    | "run-content-strategist"
    | "run-schema-validator"
    | "run-keyword-researcher"
    | "run-beast-planner"
    | "run-vault-linter"
    | "retry-failed-specialist"
    | "connect-data-sources"
    | "wait-for-specialist"
    | "specialist-coming-soon"
    | "idle";
  /** Human-readable headline for the dashboard card. */
  headline: string;
  /** Two-sentence rationale shown under the headline. */
  rationale: string;
  /** Optional specialist ID for click-through. */
  specialistId?: string;
  /** Severity → influences dashboard styling. */
  severity: "blocking" | "high" | "medium" | "low" | "idle";
}

export type MilestoneState =
  | "missing"
  | "stale"
  | "low-confidence"
  | "complete";

export async function nextActionFor(
  clientSlug: string,
  options: { registeredSpecialists?: Set<string> } = {},
): Promise<NextAction> {
  const registered = options.registeredSpecialists;
  const isAvailable = (id: string) => !registered || registered.has(id);

  if (!fs.existsSync(vaultRoot(clientSlug))) {
    return {
      id: "scaffold-vault",
      headline: "Scaffold the vault",
      rationale:
        "This client has no vault on disk. Create one before any specialist can run.",
      severity: "blocking",
    };
  }

  // Migrate legacy `<vault>/.manifest.json` → `<vault>/.raw/.manifest.json`
  // before checking existence. Idempotent.
  ensureManifestMigrated(clientSlug);
  if (!fs.existsSync(manifestPath(clientSlug))) {
    return {
      id: "scaffold-vault",
      headline: "Re-scaffold the vault",
      rationale:
        "Vault directory exists but the manifest is missing. The client metadata is incomplete.",
      severity: "blocking",
    };
  }

  const failedSweepChild = latestFailedSweepChild(clientSlug);
  if (failedSweepChild) {
    return {
      id: "retry-failed-specialist",
      specialistId: failedSweepChild.specialist_id,
      headline: `Retry ${failedSweepChild.title || failedSweepChild.specialist_id}`,
      rationale:
        `${failedSweepChild.specialist_id} failed in the latest Deep Brain sweep. Retry it before trusting the brain as complete.${
          failedSweepChild.result_summary ? ` Last result: ${failedSweepChild.result_summary}` : ""
        }`,
      severity: "high",
    };
  }

  const health = await lintVault(clientSlug);
  if (health.counts.error > 0 || health.score < 95) {
    const first = health.findings[0];
    return {
      id: "run-vault-linter",
      specialistId: "vault-linter",
      headline:
        health.counts.error > 0 ? "Repair brain structure" : "Review brain health",
      rationale: first
        ? `Vault health is ${health.score}/100 with ${health.counts.error} errors and ${health.counts.warn} warnings. First finding: ${first.rule} in ${first.file || "vault"} — ${first.message}`
        : `Vault health is ${health.score}/100. Run the vault linter before trusting downstream recommendations.`,
      severity: health.counts.error > 0 ? "blocking" : "high",
    };
  }

  // Detect "Day 0 measurement access" blocker from hot.md — port of the
  // marketing-brain Day 0 gate. We only honor the gate when measurement
  // access is genuinely missing; once Google ADC has been set up OR any
  // data-source integration has been configured, the gate is satisfied
  // and we move on. Without this, every freshly-scaffolded client vault
  // surfaces "Connect data sources" forever even after the user has
  // wired up Search Console / GA4 / DataForSEO globally.
  if (!measurementAccessSatisfied()) {
    const hot = await readHot(clientSlug).catch(() => null);
    if (hot) {
      const blockingThread = hot.activeThreads.find((t) =>
        /Day 0|Measurement|Access/i.test(t.title),
      );
      if (blockingThread) {
        return {
          id: "connect-data-sources",
          headline: blockingThread.title,
          rationale: blockingThread.rationale,
          severity: "blocking",
        };
      }
    }
  }

  // Walk the milestone ladder. Each rung points at a specialist; if the
  // milestone is unmet AND the specialist exists in the registry, that's
  // the active suggestion. If the milestone is unmet but the specialist
  // isn't built yet, surface a "coming soon" card instead so we never
  // queue a job we can't run.
  //
  // Phase-3.4: each milestone returns a structured status — `missing`,
  // `stale` (older than the freshness window), `low-confidence` (still
  // seed/low after a run), or `complete`. Anything but `complete`
  // recommends running the specialist again, with a rationale that
  // names the specific gap.
  const milestones: Array<{
    state: () => MilestoneState;
    id: NextAction["id"];
    specialistId: string;
    headline: string;
    rationale: string;
    severity: NextAction["severity"];
  }> = [
    {
      state: () => auditMilestoneStatus(clientSlug, "audit", "technical"),
      id: "run-technical-auditor",
      specialistId: "technical-auditor",
      headline: "Run Technical SEO audit",
      rationale:
        "No technical audit on file. Crawl, index, security, and Core Web Vitals come first — they gate everything downstream.",
      severity: "high",
    },
    {
      state: () => auditMilestoneStatus(clientSlug, "audit", "content"),
      id: "run-content-strategist",
      specialistId: "content-strategist",
      headline: "Run Content audit",
      rationale:
        "Technical fundamentals look covered, but content quality (E-E-A-T, depth, freshness) hasn't been assessed yet.",
      severity: "medium",
    },
    {
      state: () => auditMilestoneStatus(clientSlug, "audit", "schema"),
      id: "run-schema-validator",
      specialistId: "schema-validator",
      headline: "Validate schema markup",
      rationale:
        "Run the schema validator to confirm JSON-LD is well-formed and matches Google's parser.",
      severity: "medium",
    },
    {
      state: () => keywordWorkbookStatus(clientSlug),
      id: "run-keyword-researcher",
      specialistId: "keyword-researcher",
      headline: "Build keyword workbook",
      rationale:
        "No keyword XLSX on disk. Pull DataForSEO competitor rankings + dedup to get an opportunity-scored target list.",
      severity: "medium",
    },
    {
      state: () => beastPlanStatus(clientSlug),
      id: "run-beast-planner",
      specialistId: "beast-planner",
      headline: "Compose BEAST plan",
      rationale:
        "Audits + keywords are in place. The BEAST planner synthesises a 30/60/90-day execution plan grounded in the vault evidence.",
      severity: "medium",
    },
  ];

  for (const m of milestones) {
    const state = m.state();
    if (state === "complete") continue;
    const liveStatus = liveSpecialistStatus(clientSlug, m.specialistId);
    if (liveStatus) {
      return {
        id: "wait-for-specialist",
        headline: `${m.headline} already ${liveStatus}`,
        rationale:
          `${m.specialistId} is ${liveStatus} for this client. Wait for that run to finish before dispatching another copy of the same milestone.`,
        severity: "low",
      };
    }
    if (!isAvailable(m.specialistId)) {
      // milestone is unmet but the specialist isn't shipped yet
      return {
        id: "specialist-coming-soon",
        headline: `${m.headline.replace(/^Run\s+/, "")} — coming in v0.2`,
        rationale: `${m.rationale} The ${m.specialistId} specialist isn't wired up yet, so this card is informational.`,
        severity: "low",
      };
    }
    // Phase-3.4: refine the headline + rationale when the gap is
    // "stale" or "low-confidence" rather than "missing". Same specialist,
    // different ask.
    const refined = refineForState(state, m.headline, m.rationale);
    return {
      id: m.id,
      specialistId: m.specialistId,
      headline: refined.headline,
      rationale: refined.rationale,
      severity: m.severity,
    };
  }

  return {
    id: "idle",
    headline: "All caught up",
    rationale:
      "Every milestone is in place. Pick a deliverable to refine, or wait for new measurement data.",
    severity: "idle",
  };
}

/** Convenience for callers that don't want to import the registry directly. */
export async function nextActionForWithRegistry(
  clientSlug: string,
): Promise<NextAction> {
  // Lazy-import to avoid a circular dep at module-load time.
  const { listSpecialists } = await import("./registry");
  await import("@/lib/specialists"); // populate registry
  const registered = new Set(listSpecialists().map((s) => s.id));
  return nextActionFor(clientSlug, { registeredSpecialists: registered });
}

/* -------------------------------------------------------------------------- */
/* helpers — disk-only checks (no SQLite, intentionally cheap)                */
/* -------------------------------------------------------------------------- */

/**
 * Phase-3.4 / R13 — milestone freshness gates. A milestone is `complete`
 * only when there's a matching artifact AND its explicit `expires_on`
 * frontmatter has not passed AND its confidence is at least `medium`.
 * Legacy notes without `expires_on` remain complete for backwards
 * compatibility; new `writeArtifact()` notes always carry the field.
 */
function refineForState(
  state: MilestoneState,
  baseHeadline: string,
  baseRationale: string,
): { headline: string; rationale: string } {
  switch (state) {
    case "missing":
      return { headline: baseHeadline, rationale: baseRationale };
    case "stale":
      return {
        headline: `${baseHeadline} (refresh expired artifact)`,
        rationale: `${baseRationale} The previous artifact is past its \`expires_on\` date; rerun to refresh evidence before any downstream work depends on it.`,
      };
    case "low-confidence":
      return {
        headline: `${baseHeadline} (re-run for higher confidence)`,
        rationale: `${baseRationale} A previous run wrote an audit but its confidence is still seed/low; re-run with more evidence before treating it as decisive.`,
      };
    case "complete":
      return { headline: baseHeadline, rationale: baseRationale };
  }
}

/**
 * Query SQLite for a recent `audit`-typed note whose path matches the
 * `<wiki/audits/.../-<kind>.md>` shape used by `writeArtifact`. Falls
 * back to a disk scan when SQLite doesn't have a row yet (matches the
 * pre-Phase-3 behaviour so newly-scaffolded vaults still surface gaps).
 */
function auditMilestoneStatus(
  slug: string,
  type: "audit",
  kind: string,
): MilestoneState {
  try {
    const row = getDb()
      .prepare(
        `SELECT confidence, updated, expires_on
         FROM notes
         WHERE client_slug = ?
           AND type = ?
           AND path LIKE ?
         ORDER BY updated DESC, expires_on DESC
         LIMIT 1`,
      )
      .get(slug, type, `wiki/audits/%-${kind}%.md`) as
      | { confidence: string | null; updated: string; expires_on: string | null }
      | undefined;
    if (row) return classifyMilestoneRow(row);
  } catch {
    /* SQLite empty / unavailable — fall through to disk scan */
  }
  return diskAuditMilestoneStatus(slug, kind);
}

function diskAuditMilestoneStatus(slug: string, kind: string): MilestoneState {
  const auditsDir = path.join(vaultRoot(slug), "wiki", "audits");
  if (!fs.existsSync(auditsDir)) return "missing";
  const entries = fs.readdirSync(auditsDir);
  const matched = entries.find((name) =>
    name.toLowerCase().includes(kind) && name.endsWith(".md"),
  );
  return matched ? "complete" : "missing";
}

function classifyMilestoneRow(row: {
  confidence: string | null;
  updated: string;
  expires_on?: string | null;
}): MilestoneState {
  // Low confidence wins over staleness — better to re-run than refresh.
  if (row.confidence === "seed" || row.confidence === "low") {
    return "low-confidence";
  }
  if (row.expires_on && row.expires_on < todayDate()) return "stale";
  return "complete";
}

function keywordWorkbookStatus(slug: string): MilestoneState {
  try {
    const row = getDb()
      .prepare(
        `SELECT confidence, updated, expires_on
         FROM notes
         WHERE client_slug = ?
           AND path LIKE ?
         ORDER BY updated DESC, expires_on DESC
         LIMIT 1`,
      )
      .get(slug, "wiki/audits/%keyword%.md") as
      | { confidence: string | null; updated: string; expires_on: string | null }
      | undefined;
    if (row) return classifyMilestoneRow(row);
  } catch {
    /* fall through */
  }
  // Keyword workbook today is a flexible artifact — XLSX, CSV, or a
  // keyword-named markdown/report file. Raw disk fallback can prove
  // presence but not freshness because it avoids parsing frontmatter.
  const root = vaultRoot(slug);
  const keywordDir = path.join(root, "wiki", "keywords");
  if (fs.existsSync(keywordDir)) {
    const entries = fs.readdirSync(keywordDir);
    if (entries.some((n) => /\.(xlsx|csv|md)$/i.test(n))) return "complete";
  }
  const auditsDir = path.join(root, "wiki", "audits");
  if (fs.existsSync(auditsDir)) {
    const entries = fs.readdirSync(auditsDir);
    if (entries.some((n) => /keyword/i.test(n) && n.endsWith(".md"))) {
      return "complete";
    }
  }
  const reportsDir = path.join(root, "reports");
  if (fs.existsSync(reportsDir)) {
    const entries = fs.readdirSync(reportsDir);
    if (entries.some((n) => /keyword/i.test(n) && n.endsWith(".html"))) {
      return "complete";
    }
  }
  return "missing";
}

function beastPlanStatus(slug: string): MilestoneState {
  try {
    const row = getDb()
      .prepare(
        `SELECT confidence, updated, expires_on
         FROM notes
         WHERE client_slug = ?
           AND type = 'deliverable'
           AND path LIKE 'wiki/deliverables/%-beast%.md'
         ORDER BY updated DESC, expires_on DESC
         LIMIT 1`,
      )
      .get(slug) as
      | { confidence: string | null; updated: string; expires_on: string | null }
      | undefined;
    if (row) return classifyMilestoneRow(row);
  } catch {
    /* fall through */
  }
  const dir = path.join(vaultRoot(slug), "wiki", "deliverables");
  if (!fs.existsSync(dir)) return "missing";
  const hit = fs
    .readdirSync(dir)
    .some((n) => /beast/i.test(n) && n.endsWith(".md"));
  return hit ? "complete" : "missing";
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function liveSpecialistStatus(
  clientSlug: string,
  specialistId: string,
): "queued" | "running" | null {
  try {
    const db = getDb();
    const job = db
      .prepare(
        `SELECT status FROM jobs
         WHERE client_slug = ? AND specialist = ? AND status IN ('queued','running')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(clientSlug, specialistId) as { status: "queued" | "running" } | undefined;
    if (job) return job.status;

    const task = db
      .prepare(
        `SELECT status FROM tasks
         WHERE client_slug = ? AND specialist_id = ? AND status IN ('planned','blocked','queued','running')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(clientSlug, specialistId) as
      | { status: "planned" | "blocked" | "queued" | "running" }
      | undefined;
    if (!task) return null;
    return task.status === "running" ? "running" : "queued";
  } catch {
    return null;
  }
}

function latestFailedSweepChild(clientSlug: string): {
  specialist_id: string;
  title: string;
  result_summary: string | null;
} | null {
  try {
    const db = getDb();
    const root = db
      .prepare(
        `SELECT id
         FROM tasks
         WHERE client_slug = ? AND kind = 'sweep' AND parent_task_id IS NULL
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(clientSlug) as { id: string } | undefined;
    if (!root) return null;
    const child = db
      .prepare(
        `SELECT specialist_id, title, result_summary
         FROM tasks
         WHERE client_slug = ?
           AND parent_task_id = ?
           AND status = 'failed'
           AND specialist_id IS NOT NULL
         ORDER BY updated_at DESC LIMIT 1`,
      )
      .get(clientSlug, root.id) as
      | { specialist_id: string; title: string; result_summary: string | null }
      | undefined;
    return child ?? null;
  } catch {
    return null;
  }
}

/**
 * The Day 0 gate clears once the user has any working data source — either
 * gcloud ADC (covers Search Console + GA4) or any configured integration
 * key in `.env.local` (DataForSEO, Bing, Firecrawl, etc.). Without this
 * gate, the freshly-scaffolded `[[Day 0 Measurement Access Gate]]` thread
 * in every client's `hot.md` keeps surfacing the "Connect data sources"
 * blocking card even after the user has set everything up.
 */
function measurementAccessSatisfied(): boolean {
  // gcloud ADC with a useful scope → measurement access is on.
  if (adcAvailableSync()) {
    if (
      hasScopeSync(SCOPE.searchConsole) ||
      hasScopeSync(SCOPE.ga4)
    ) {
      return true;
    }
  }
  // Only data-producing integrations qualify. LLM/image-generation keys
  // should not clear the Day 0 measurement gate.
  const env = mergedRuntimeEnv();
  for (const id of ["dataforseo", "google", "bing"]) {
    const integration = INTEGRATIONS.find((i) => i.id === id);
    if (integration?.isConfigured(env)) return true;
  }
  return false;
}

export { hotPath };
