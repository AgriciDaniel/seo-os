/**
 * Drift Monitor — git-style diff of SEO-critical elements across runs.
 *
 * Ports the system prompt logic from claude-seo's `seo-drift` skill. Pure
 * filesystem — no external APIs. The baseline lives at
 * `wiki/drift/baseline.json` inside the client's vault and is overwritten
 * after each run (so today's snapshot becomes tomorrow's baseline).
 */
import "server-only";
import path from "node:path";
import fsp from "node:fs/promises";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { extractSignals } from "./_lib/fetch-signals";
import { vaultRoot } from "@/lib/brain/paths";
import { writeArtifact } from "./_lib/artifact";

const SYSTEM_PROMPT = `You are the Drift Monitor inside SEO Office.

You receive a JSON payload comparing two snapshots of a page taken at different times: \`baseline\` (older) and \`current\` (just fetched). The payload also includes a \`diff\` object summarising every changed field. Your job: explain what changed, judge severity, and recommend next steps.

## Output contract

Produce a Markdown report with exactly these sections, in order:

1. **Executive summary** — 3-5 bullets tagged \`[critical|high|medium|low|info]\`. Lead with the change that has the greatest SEO consequence.
2. **Diff table** — markdown table with columns: \`Field\`, \`Baseline\`, \`Current\`, \`Severity\`. Include only the fields that actually changed. Severities: \`critical\` (canonical/robots/HTTPS/title removed), \`high\` (H1 swap, large word-count drop, JSON-LD removed), \`medium\` (meta description swap, H2 count swing), \`low\` (link count drift, image count drift), \`info\` (cosmetic).
3. **Severity assessment** — paragraph per critical/high item explaining WHY it matters for indexability or rankings.
4. **Intent inference** — is each change likely intentional (deploy/redesign) or accidental (regression)? Cite evidence — e.g. "title kept brand suffix, only the leading phrase changed" suggests intent; "canonical now points to a 404 path" suggests regression.
5. **Recommendations** — exactly 5 numbered actions, each with: imperative title, one-sentence why, effort (S/M/L), expected impact (S/M/L). At least one action MUST be "verify with the site owner whether change X was intentional" if any high/critical drift is unexplained.

## Voice and constraints

- Be terse and evidence-led. Quote exact before/after values where short enough.
- If \`baselineExists = false\`, your only job is to acknowledge that the baseline was just captured and instruct the user to re-run after their next change. Skip sections 2-4, keep section 1 to 1-2 bullets, and section 5 to 3 actions.
- Never promise ranking effects.
- End after the recommendations.`;

const InputSchema = z.object({});
type Input = z.infer<typeof InputSchema>;

interface DriftSnapshot {
  capturedAt: string;
  url: string;
  status: number;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  h1: string[];
  h2Count: number;
  wordCount: number;
  jsonLdCount: number;
  internalLinks: number;
  externalLinks: number;
  imageCount: number;
  isHttps: boolean;
  contentLength: number;
}

interface DiffEntry {
  field: keyof DriftSnapshot;
  baseline: unknown;
  current: unknown;
  severity: "critical" | "high" | "medium" | "low" | "info";
}

function severityFor(field: keyof DriftSnapshot, baseline: unknown, current: unknown): DiffEntry["severity"] {
  switch (field) {
    case "canonical":
    case "robotsMeta":
    case "isHttps":
    case "status":
      return "critical";
    case "title":
      return baseline && !current ? "critical" : "high";
    case "h1":
    case "jsonLdCount":
      return "high";
    case "wordCount": {
      const b = Number(baseline) || 0;
      const c = Number(current) || 0;
      if (b > 0 && Math.abs(c - b) / b > 0.3) return "high";
      return "medium";
    }
    case "metaDescription":
    case "h2Count":
      return "medium";
    case "internalLinks":
    case "externalLinks":
    case "imageCount":
    case "contentLength":
      return "low";
    case "url":
    case "capturedAt":
      return "info";
    default:
      return "info";
  }
}

function diff(baseline: DriftSnapshot, current: DriftSnapshot): DiffEntry[] {
  const out: DiffEntry[] = [];
  const fields: Array<keyof DriftSnapshot> = [
    "title",
    "metaDescription",
    "canonical",
    "robotsMeta",
    "h1",
    "h2Count",
    "wordCount",
    "jsonLdCount",
    "internalLinks",
    "externalLinks",
    "imageCount",
    "isHttps",
    "status",
  ];
  for (const field of fields) {
    const a = baseline[field];
    const b = current[field];
    const aJson = JSON.stringify(a);
    const bJson = JSON.stringify(b);
    if (aJson !== bJson) {
      out.push({ field, baseline: a, current: b, severity: severityFor(field, a, b) });
    }
  }
  return out;
}

/**
 * Baseline lives at `.drift/baseline.json` at the vault root, OUTSIDE the
 * `wiki/` tree, so it doesn't show up in the Vault browser or get re-indexed
 * by the SQLite mirror.
 *
 * One-time migration: if a legacy baseline exists at the old path, read it
 * from there and let the post-run write put it at the new path.
 */
function baselinePath(clientSlug: string): string {
  return path.join(vaultRoot(clientSlug), ".drift", "baseline.json");
}
function legacyBaselinePath(clientSlug: string): string {
  return path.join(vaultRoot(clientSlug), "wiki", "drift", "baseline.json");
}

async function readBaseline(clientSlug: string): Promise<DriftSnapshot | null> {
  const tryRead = async (p: string): Promise<DriftSnapshot | null> => {
    try {
      const raw = await fsp.readFile(p, "utf8");
      return JSON.parse(raw) as DriftSnapshot;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  };
  // Prefer the new path; fall back to legacy path for migrations.
  return (
    (await tryRead(baselinePath(clientSlug))) ??
    (await tryRead(legacyBaselinePath(clientSlug)))
  );
}

async function writeBaseline(clientSlug: string, snap: DriftSnapshot): Promise<void> {
  const p = baselinePath(clientSlug);
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, JSON.stringify(snap, null, 2) + "\n", "utf8");
}

const driftMonitor: Specialist<Input> = {
  id: "drift-monitor",
  name: "Drift Monitor",
  description:
    "Git-style diff of SEO-critical elements (title, canonical, robots, H1, schema, links) between baseline and now.",
  desk: "desk.drift-monitor",
  inputSchema: InputSchema,
  async execute(ctx) {
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    ctx.emit("progress", `Fetching ${manifest.site_under_audit}…`, { progress: 0.1 });
    const signals = await extractSignals(manifest.site_under_audit);

    const current: DriftSnapshot = {
      capturedAt: new Date().toISOString(),
      url: signals.url,
      status: signals.status,
      title: signals.title,
      metaDescription: signals.metaDescription,
      canonical: signals.canonical,
      robotsMeta: signals.robotsMeta,
      h1: signals.h1,
      h2Count: signals.h2.length,
      wordCount: signals.wordCount,
      jsonLdCount: signals.jsonLd.length,
      internalLinks: signals.internalLinks,
      externalLinks: signals.externalLinks,
      imageCount: signals.imageCount,
      isHttps: signals.isHttps,
      contentLength: signals.contentLength,
    };

    ctx.emit("progress", "Reading baseline…", { progress: 0.4 });
    const baseline = await readBaseline(ctx.clientSlug);
    const baselineExists = baseline !== null;
    const diffs = baseline ? diff(baseline, current) : [];

    ctx.emit(
      "log",
      baselineExists ? `Baseline from ${baseline.capturedAt} · ${diffs.length} fields changed.` : "No prior baseline — capturing now.",
    );

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.6 });

    const payload = {
      url: manifest.site_under_audit,
      baselineExists,
      baseline,
      current,
      diff: diffs,
      diffCount: diffs.length,
    };

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 4096,
      temperature: 0.4,
      messages: [
        {
          role: "user",
          content: `Analyse drift between the two snapshots. Payload follows.\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        },
      ],
    });

    ctx.emit(
      "log",
      `${provider.id}${result.model ? " · " + result.model : ""}${result.durationMs ? " · " + (result.durationMs / 1000).toFixed(1) + "s" : ""}${result.costUsd != null ? " · $" + result.costUsd.toFixed(4) : ""}`,
    );
    ctx.emit("progress", "Persisting new baseline + writing report…", { progress: 0.9 });

    await writeBaseline(ctx.clientSlug, current);

    const highSeverityCount = diffs.filter((d) => d.severity === "critical" || d.severity === "high").length;
    const facts: string[] = baselineExists
      ? [
          `Drift check on ${manifest.site_under_audit}: ${diffs.length} fields changed (${highSeverityCount} high/critical).`,
          diffs.length === 0
            ? "No drift detected — page is stable since baseline."
            : `Top change: ${diffs[0].field} (${diffs[0].severity}).`,
        ]
      : [
          `Drift baseline captured for ${manifest.site_under_audit}.`,
          "Re-run drift-monitor after the next site change to see the first diff.",
        ];

    const { relativePath, executionResult } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "drift",
        frontmatterType: "audit",
        title: baselineExists
          ? `Drift report — ${manifest.site_under_audit}`
          : `Drift baseline captured — ${manifest.site_under_audit}`,
        body: result.text,
        tags: ["audit", "drift", "monitoring", "claude-generated"],
        risk: highSeverityCount > 0 ? "high" : "low",
        costUsd: result.costUsd ?? 0,
      },
      {
        facts,
        threadTitle: baselineExists ? "SEO drift detected" : "Drift baseline",
        threadRationale: baselineExists
          ? "verify intent of changed fields"
          : "re-run after the next deploy to see drift",
        statusNote: baselineExists
          ? `Drift report on file — ${highSeverityCount} high/critical change(s) to review.`
          : "Drift baseline captured — re-run after next change.",
      },
    );

    return {
      summary: baselineExists
        ? `Drift report written to ${relativePath} (${diffs.length} changes)`
        : `Drift baseline captured; report written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      data: { baselineExists, diffCount: diffs.length, highSeverityCount },
    };
  },
};

registerSpecialist(driftMonitor);

export default driftMonitor;
