/**
 * Specialist chat — talk to a specific specialist after their audit has
 * been written. They speak in their own voice, with their most recent
 * audit loaded as reference.
 */
import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { vaultRoot } from "@/lib/brain/paths";
import { readManifest } from "@/lib/orchestrator/client-context";
import { getSpecialist } from "@/lib/orchestrator/registry";
import { readHot } from "@/lib/orchestrator/working-memory";
import "@/lib/specialists";

const BASE_SYSTEM = `You are speaking as a specialist inside SEO Office. The user is asking you about the most recent audit you wrote (or about the site in general).

## Rules

- Stay in your specialist role.
- Be terse, concrete, evidence-led. Cite specific sections / findings from the audit you wrote.
- Don't promise rankings or traffic. Quote signals from the payload, not from the future.
- If the user asks for something outside your remit, say so and suggest which specialist to ask.
- You cannot run a new audit yourself in this chat — your last audit is your reference. If the user wants a fresh run, suggest they click "Run <your id>" from the desk.
`;

/** Maps each specialist id to the audit-file name fragment it produces. */
const SPECIALIST_AUDIT_TYPE: Record<string, string> = {
  "technical-auditor": "technical",
  "content-strategist": "content",
  "schema-validator": "schema",
  "keyword-researcher": "keywords",
  "brand-strategist": "brand",
  "beast-planner": "beast-plan",
};

export async function buildSpecialistContext(
  slug: string,
  specialistId: string,
): Promise<{ systemPrompt: string; contextSnippet: string }> {
  const spec = getSpecialist(specialistId);
  if (!spec) {
    throw new Error(`unknown specialist: ${specialistId}`);
  }
  const [audit, manifest, hot] = await Promise.all([
    findLatestAudit(slug, specialistId),
    readManifest(slug).catch(() => null),
    readHot(slug).catch(() => null),
  ]);
  const systemPrompt = `${BASE_SYSTEM}\n\n## Your role\n\nYou are the ${spec.name}.\n${spec.description}`;
  const brainContext = [
    "## Brain context to read first",
    manifest
      ? `Client: ${manifest.vault.replace(/ marketing-brain$/, "")}\nSite: ${manifest.site_under_audit}`
      : `Client slug: ${slug}`,
    "",
    "### hot.md",
    hot?.raw?.trim().slice(0, 4000) || "(empty)",
  ].join("\n");
  const auditContext = audit
    ? [
        `## Most recent audit you wrote`,
        ``,
        `File: \`${audit.relativePath}\``,
        ``,
        "```markdown",
        audit.body.slice(0, 8000),
        audit.body.length > 8000 ? "\n... [truncated]" : "",
        "```",
      ].join("\n")
    : `## State\nYou haven't written an audit for this client yet. Tell the user to invoke you from the office.`;
  const contextSnippet = `${brainContext}\n\n${auditContext}`;
  return { systemPrompt, contextSnippet };
}

async function findLatestAudit(
  slug: string,
  specialistId: string,
): Promise<{ relativePath: string; body: string } | null> {
  const typeKey = SPECIALIST_AUDIT_TYPE[specialistId] ?? specialistId;
  // Audits live in wiki/audits/; the BEAST plan lives in wiki/deliverables/.
  const candidates = [
    { dir: "wiki/audits", suffix: `-${typeKey}.md` },
    { dir: "wiki/deliverables", suffix: `-${typeKey}-` }, // beast-plan-<date>
  ];
  for (const c of candidates) {
    const absDir = path.join(vaultRoot(slug), c.dir);
    if (!fs.existsSync(absDir)) continue;
    const entries = (await fsp.readdir(absDir))
      .filter(
        (n) =>
          (n.endsWith(".md") || n.endsWith(`.md`)) &&
          (n.includes(c.suffix) || n.includes(typeKey)),
      )
      .sort()
      .reverse();
    if (entries.length === 0) continue;
    const body = await fsp.readFile(path.join(absDir, entries[0]), "utf8");
    return { relativePath: `${c.dir}/${entries[0]}`, body };
  }
  return null;
}
