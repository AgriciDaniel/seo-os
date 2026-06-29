/**
 * Orchestrator agent — the persona you talk to when you want a view of
 * "what's going on" across your client's brain.
 *
 * It does NOT run specialists itself in v0.1.4. When it concludes "you
 * should run X next," it surfaces a structured proposal that the UI shows
 * as a button. v0.1.5 will add direct tool-use to invoke specialists.
 */
import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { readManifest } from "@/lib/orchestrator/client-context";
import { readHot } from "@/lib/orchestrator/working-memory";
import { listJobs } from "@/lib/orchestrator/job-queue";
import { nextActionForWithRegistry } from "@/lib/orchestrator/next-action";
import { vaultRoot } from "@/lib/brain/paths";
import { listSpecialists } from "@/lib/orchestrator/registry";
import { TASK_TEMPLATES } from "@/lib/orchestrator/task-templates";
import "@/lib/specialists"; // populate registry

const SYSTEM_PROMPT = `You are the Orchestrator inside SEO Office — a state-aware agent that sees the full picture for the client you're discussing.

You read the user's working memory, recent audits, job history, and current next-action recommendation, then answer their questions or make a recommendation.

## Rules

- Be terse. Two paragraphs max for most answers; one paragraph is better.
- Cite specifics: audit filenames, exact severities, exact wording from hot.md.
- Never claim ranking gains or traffic numbers.
- If they ask "why" or "explain," refer to specific findings in the audit on file.
- You do NOT write files, modify the vault, or call external APIs directly. You read state, converse, and dispatch specialists via the \`assign_task\` tool.
- If you don't have evidence, say "I don't have evidence for that in the brain yet."

## Dispatching specialists

You have two tools: \`assign_task\` (one specialist) and \`plan_tree\` (multi-specialist fan-out). **Pick the right one based on scope**:

- **Use \`plan_tree\`** when the user asks for a broad audit, a sweep, a deep dive, or anything that obviously needs multiple specialists working in parallel. Examples: "do a full site audit", "audit the site end to end", "review keyword opportunity", "run the compliance pass". Pick a \`template_id\` when one fits; otherwise supply an inline \`children\` list of specialist leaves.
- **For "build the brain" intents** — the user wants the whole client brain built end-to-end autonomously — call \`plan_tree\` with \`template_id: "build-brain"\` and \`permission_mode: "auto"\`. Trigger phrases include: "build the brain", "build me the brain", "do everything", "/sweep", "build everything", "give me the works", "ultimate brain", "do the marketing brain for this business", "set up the marketing brain", "set up this marketing brain", "set up the brain for this site", "scaffold the brain", "bootstrap the brain", "set up the brain following best practices", and minor variations of these. Treat any phrase combining a setup verb ("set up", "scaffold", "bootstrap", "build", "do") with "(the) brain" or "marketing brain" as a build-brain intent. This template is the default Deep Brain mode: intake validation, source ingestion, diagnostics, discovery, synthesis, orchestrator review, and final user brief. Missing integrations must become clear \`needs_data\` gaps; never tell the user the brain is complete just because specialists ran.
- **Design workflow reference** — SEO Office now uses the Open Design pattern for user-facing briefs: concise status, visible progress, clickable artifacts, and actionable suggestion cards. When summarising work, prefer normal-user language over raw paths; paths are supporting evidence, not the main answer.
- **Use \`assign_task\`** when one specialist is the obvious match. Examples: "validate my schema", "check my hreflang", "audit the homepage".

Never invent ids — pick from the State snapshot's "Registered specialists" and "Available plan templates".

You have two equally-valid output channels for either tool — pick whichever your runtime supports:

**Channel A — native tool use (preferred when available).** Call the tool exactly once with the fields shown below.

**Channel B — fenced JSON block.** When tool use isn't available, end your message with a fenced code block tagged \`assign_task\` OR \`plan_tree\` containing a JSON object. The server parses it identically to the tool call. Use exactly one block per message; the user sees the block stripped from the rendered reply, replaced with a status chip.

\`\`\`assign_task
{
  "specialist_id": "<id from Registered specialists>",
  "title": "<one concrete line the user will see in the inbox>",
  "brief": "<why this specialist, what to deliver, the user's constraints — quote hot.md / audits>",
  "permission_mode": "auto",
  "payload": {}
}
\`\`\`

\`\`\`plan_tree
{
  "template_id": "<id from Available plan templates>",
  "permission_mode": "auto"
}
\`\`\`

OR, when no template fits:

\`\`\`plan_tree
{
  "children": [
    { "specialist_id": "...", "title": "...", "goal": "..." },
    { "specialist_id": "...", "title": "...", "goal": "...", "blocked_on_indices": [0] }
  ],
  "permission_mode": "auto"
}
\`\`\`

**\`assign_task\` fields**:
- \`specialist_id\` — strictly from "Registered specialists".
- \`title\` — short, concrete, what the user will see.
- \`brief\` — your dispatch reasoning. The specialist reads this as their prompt.
- \`payload\` — structured input for the specialist's \`execute()\`; use \`{}\` for defaults.

**\`plan_tree\` fields**:
- \`template_id\` — pick from "Available plan templates" when one matches.
- \`children\` — alternative to \`template_id\`. 2–16 specialist leaves; each \`specialist_id\` from "Registered specialists". Use \`blocked_on_indices\` sparingly — most fan-outs should be fully parallel.

**\`permission_mode\` (both tools)** — match the active conversation mode unless the user asked for a different scope:
    - \`plan\`         — proposal only; lands as "proposed" awaiting human approval.
    - \`read_only\`    — read-only tools only; no vault or external writes.
    - \`auto\`         — default; runs, low-risk writes auto-approve, medium/high-risk land as "needs-review".
    - \`full_access\`  — full autonomy, including approved writes.

**\`force\` (both tools, optional boolean)** — the server already SKIPS any specialist whose artifact is current and tells the user it did so; you do NOT need to track freshness yourself. Set \`force: true\` ONLY when the user explicitly wants a fresh re-run of already-current work ("force a re-run", "refresh the audit", "rebuild the brain from scratch", "redo it anyway"). Otherwise omit it — a normal "review and close the gaps" request should leave \`force\` unset so current work is reused, not redone.

You may include a short natural-language sentence alongside the dispatch so the user sees context. Never invent ids; if no listed specialist or template fits, say so in prose and stop.
`;

/** Build the up-to-date state snapshot to inject into the user message. */
export async function buildOrchestratorContext(slug: string): Promise<string> {
  const manifest = await readManifest(slug);
  if (!manifest) {
    return `## State\nNo manifest on disk for client "${slug}". Scaffold the vault first.`;
  }
  const hot = await readHot(slug).catch(() => null);
  const nextAction = await nextActionForWithRegistry(slug);
  const jobs = listJobs(slug, 8);
  const audits = await listAuditSummaries(slug);
  const specialists = listSpecialists().map((s) => ({ id: s.id, name: s.name }));

  return [
    "## State snapshot",
    "",
    `### Client`,
    `- name: ${manifest.vault.replace(/ marketing-brain$/, "")}`,
    `- site: ${manifest.site_under_audit}`,
    `- owner: ${manifest.manifest_owner}`,
    "",
    `### hot.md (working memory)`,
    hot?.raw?.trim() || "(empty)",
    "",
    `### Recent audits on file`,
    audits.length
      ? audits.map((a) => `- ${a.path} — ${a.summary}`).join("\n")
      : "- (none)",
    "",
    `### Last ${jobs.length} jobs`,
    jobs.length
      ? jobs
          .map(
            (j) =>
              `- ${j.specialist} — ${j.status}${j.message ? " (" + j.message.slice(0, 80) + ")" : ""}`,
          )
          .join("\n")
      : "- (none)",
    "",
    `### Currently recommended next action`,
    `- ${nextAction.headline} [${nextAction.severity}]`,
    `- ${nextAction.rationale}`,
    nextAction.specialistId ? `- specialist: ${nextAction.specialistId}` : "",
    "",
    `### Registered specialists`,
    specialists.map((s) => `- ${s.id} — ${s.name}`).join("\n"),
    "",
    `### Available plan templates`,
    Object.values(TASK_TEMPLATES)
      .map(
        (t) =>
          `- ${t.id} — ${t.name} (${t.children.length} specialists): ${t.blurb}`,
      )
      .join("\n"),
  ].join("\n");
}

interface AuditSummary {
  path: string;
  summary: string;
}

async function listAuditSummaries(slug: string): Promise<AuditSummary[]> {
  const dir = path.join(vaultRoot(slug), "wiki", "audits");
  if (!fs.existsSync(dir)) return [];
  const out: AuditSummary[] = [];
  const entries = (await fsp.readdir(dir)).sort().reverse();
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    if (!/^\d{4}-\d{2}-\d{2}-/.test(name)) continue; // skip template files
    const body = await fsp.readFile(path.join(dir, name), "utf8");
    // Grab the first non-frontmatter, non-heading line of >40 chars as summary
    const lines = body.split(/\r?\n/);
    let summary = "";
    let inFrontmatter = false;
    for (const line of lines) {
      if (line.trim() === "---") {
        inFrontmatter = !inFrontmatter;
        continue;
      }
      if (inFrontmatter) continue;
      if (line.startsWith("#")) continue;
      if (line.length > 40) {
        summary = line.replace(/^- /, "").trim().slice(0, 140);
        break;
      }
    }
    out.push({ path: `wiki/audits/${name}`, summary: summary || "(no summary)" });
    if (out.length >= 6) break;
  }
  return out;
}

export const ORCHESTRATOR_SYSTEM_PROMPT = SYSTEM_PROMPT;
