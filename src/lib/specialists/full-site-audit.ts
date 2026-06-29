/**
 * Full Site Audit — orchestrator that delegates to other registered specialists
 * in sequence, then LLM-synthesizes a single executive summary from the
 * artifacts they produced.
 *
 * v1 scope: runs technical-auditor → page-analyzer → schema-validator →
 * content-strategist → sitemap-architect → hreflang-auditor → google-suite
 * (when configured). The "500-page crawl" promised by claude-seo's
 * `seo-audit` is deferred — this audits the homepage + one representative URL.
 */
import "server-only";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import {
  registerSpecialist,
  type Specialist,
  type SpecialistContext,
} from "@/lib/orchestrator/registry";
import { getSpecialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { isAvailable } from "./_lib/availability";
import { writeArtifact } from "./_lib/artifact";
import { optionalIntegrationDegradation } from "./integration-readiness";

const SYSTEM_PROMPT = `You are the Full Site Audit synthesizer inside SEO Office.

You receive a list of sub-specialist results, each with: id, summary, and the relative path of the markdown artifact they wrote. Your job is to fuse them into ONE executive report — not a re-run of each sub-audit.

## Output contract

Produce a Markdown report with these sections, in order:

1. **Health score** — a single 0-100 number, with a one-sentence justification. Be honest; default below 70 unless you see clear positives.
2. **Top 3 blockers** — the most important issues across all sub-audits, with severity tags \`[critical|high|medium|low]\` and which sub-audit surfaced them.
3. **Quick wins** — 3 actions estimated as effort=S with impact ≥ M.
4. **Strategic moves** — 2 longer-arc actions (effort=L) that compound across multiple sub-audits.
5. **Sub-audit index** — bullet list of (id → relative path) for every sub-audit that ran. This is the user's reading guide.

## Constraints

- Do not invent findings. Only summarize what the sub-audits actually reported.
- Quote 2-5 words from sub-audits when you reference them.
- If a sub-audit was skipped (integration missing), note it in the index with "skipped — missing X".
- End after the sub-audit index.`;

const InputSchema = z.object({});
type Input = z.infer<typeof InputSchema>;

/** The set of sub-specialists this orchestrator delegates to, in run order. */
const PIPELINE: Array<{ id: string; required: boolean; gate?: () => boolean }> = [
  { id: "technical-auditor", required: true },
  { id: "page-analyzer", required: true },
  { id: "schema-validator", required: true },
  { id: "content-strategist", required: true },
  { id: "sitemap-architect", required: true },
  { id: "hreflang-auditor", required: true },
  { id: "google-suite", required: false, gate: () => isAvailable("google") },
];

interface SubResult {
  id: string;
  ok: boolean;
  summary: string;
  resultPath?: string;
  error?: string;
}

const fullSiteAudit: Specialist<Input> = {
  id: "full-site-audit",
  name: "Full Site Audit",
  description:
    "Orchestrates technical, page, schema, content, sitemap, hreflang, and Google sub-audits, then synthesizes one executive report.",
  desk: "desk.full-site-audit",
  inputSchema: InputSchema,
  async execute(ctx) {
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    // Run all sub-specialists in parallel — they're independent reads against
    // either the homepage or the manifest, no cross-dependencies. Previously
    // sequential, which cost 3-5 minutes wall-clock; parallel cuts to the
    // slowest single specialist (~30-60s). Logs interleave but each line is
    // already prefixed with `[<id>]` so the stream stays readable.
    ctx.emit("progress", `Running ${PIPELINE.length} sub-audits in parallel…`, {
      progress: 0.1,
    });

    const subResults: SubResult[] = await Promise.all(
      PIPELINE.map(async (step): Promise<SubResult> => {
        if (step.gate && !step.gate()) {
          ctx.emit("log", `Skipping ${step.id} (integration unavailable).`);
          return {
            id: step.id,
            ok: false,
            summary: "skipped — integration unavailable",
            error: "integration unavailable",
          };
        }
        const sub = getSpecialist(step.id);
        if (!sub) {
          ctx.emit("log", `${step.id} is not registered — skipping.`);
          return {
            id: step.id,
            ok: false,
            summary: "skipped — specialist not registered",
            error: "not registered",
          };
        }
        ctx.emit("log", `▸ ${step.id} starting…`);
        const subInput = sub.inputSchema.parse({});
        const subCtx: SpecialistContext<typeof subInput> = {
          ...ctx,
          input: subInput,
          emit: (kind, message, extra) => {
            if (ctx.isCancelled()) return;
            if (kind === "log") ctx.emit("log", `[${step.id}] ${message}`, extra);
          },
        };
        try {
          const r = await sub.execute(subCtx);
          ctx.emit("log", `✓ ${step.id} — ${r.summary}`);
          return {
            id: step.id,
            ok: true,
            summary: r.summary,
            resultPath: r.resultPath,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          ctx.emit("log", `✗ ${step.id} — ${message}`);
          return { id: step.id, ok: false, summary: "failed", error: message };
        }
      }),
    );

    const provider = await selectProvider();
    ctx.emit("progress", `Synthesizing executive report via ${provider.name}…`, {
      progress: 0.88,
    });

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 3500,
      temperature: 0.35,
      messages: [
        {
          role: "user",
          content: `Site: ${manifest.site_under_audit}\n\nSub-audit results:\n\`\`\`json\n${JSON.stringify(subResults, null, 2)}\n\`\`\``,
        },
      ],
    });

    const ok = subResults.filter((r) => r.ok).length;
    const total = subResults.length;
    ctx.emit("progress", "Writing executive audit to vault…", { progress: 0.95 });
    const degradation = optionalIntegrationDegradation("full-site-audit");

    const { relativePath, executionResult } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "full-site",
        frontmatterType: "audit",
        title: `Full site audit — ${manifest.site_under_audit}`,
        body: result.text,
        tags: ["audit", "full-site", "executive", "claude-generated"],
        confidence: degradation.artifact.confidence ?? (ok === total ? "high" : "medium"),
        costUsd: result.costUsd ?? 0,
        ...(degradation.artifact.dataSources
          ? { dataSources: degradation.artifact.dataSources }
          : {}),
      },
      {
        facts: [
          `Full site audit run on ${manifest.site_under_audit} — ${ok}/${total} sub-audits OK.`,
          ...subResults
            .filter((r) => !r.ok)
            .slice(0, 2)
            .map((r) => `${r.id} skipped/failed: ${r.error}.`),
        ],
        threadTitle: "Full site audit",
        threadRationale:
          "executive summary on file — sub-audit artifacts hold the detail",
        statusNote: `Full audit complete (${ok}/${total} sub-audits) — review blockers first.`,
      },
    );

    return {
      summary: `Full audit written to ${relativePath} (${ok}/${total} sub-audits OK)`,
      resultPath: relativePath,
      executionResult,
      data: { subResults },
      ...degradation.result,
    };
  },
};

registerSpecialist(fullSiteAudit);
export default fullSiteAudit;
