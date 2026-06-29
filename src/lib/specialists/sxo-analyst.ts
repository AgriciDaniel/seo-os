/**
 * SXO Analyst — Search Experience Optimization. Reads the SERP backwards:
 * what does Google reward for a target keyword, what persona does that imply,
 * what UX pattern matches, and where does the current page fall short.
 */
import "server-only";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { post as dataforseoPost } from "@/lib/integrations/dataforseo";
import { requireIntegrations } from "./_lib/availability";
import { resolveLocale } from "./_lib/locale";
import { brandLabel } from "./_lib/derive";
import { writeArtifact } from "./_lib/artifact";
import { applyStructuredOutput } from "./_lib/structured-output";

const SYSTEM_PROMPT = `You are the SXO (Search Experience Optimization) Analyst inside SEO Office.

You receive a compact JSON payload with a target keyword, SERP feature mix (organic, AI Overview, People-Also-Ask, video, image pack, local pack), and the top organic results' titles + descriptions. Your job is to read the SERP backwards: infer the persona Google has decided wins this query, identify the UX pattern that satisfies them, and propose how this site should compete on experience — not just ranking.

## Output contract

Produce a Markdown report with exactly these sections, in this order:

1. **SERP feature read** — which features are present, which are missing. What that mix says about user intent and Google's confidence in the answer.
2. **Inferred persona** — 2-3 sentences describing the searcher Google thinks it's serving: who they are, what they've already tried, what they want next.
3. **Persona scoring** — score the top-3 organic results on how well each satisfies that persona, 1-10 each, with one-line evidence per score. Show which experience pattern is winning (long-form guide / interactive tool / matrix / video-first / list of options).
4. **Experience gap** — name the experience element top results have that an average competitor doesn't (a calculator, a comparison table, a free template, a video walkthrough, a step-numbered guide). One concrete element this site should consider adding.
5. **Page anatomy template** — the structural shape this site's page should adopt to satisfy the persona: hero, sections, interactive element, supporting evidence, CTA. Be specific.
6. **Recommendations** — exactly 5 numbered actions, each with title, one-sentence why, effort (S/M/L), impact (S/M/L). Sorted by impact-per-effort.

After the recommendations, append a final section:

7. **Structured findings (machine-readable)** — a single fenced code block tagged \`data\` containing JSON that matches this schema:

\`\`\`data
{
  "kind": "sxo-scoring",
  "v": 1,
  "personas": [
    { "name": "<short persona label>", "score": <0-100>, "gaps": ["<short gap>", "..."] }
  ],
  "signals": [
    { "id": "<kebab-case>", "label": "<short label>", "severity": "high|medium|low|info", "detail": "<one sentence>" }
  ]
}
\`\`\`

The data block is parsed and removed before the note is rendered, so do NOT add commentary inside the fenced block. \`personas\` should list at most 8 personas (typically the inferred persona plus the top-3 organic competitors scored against it). \`score\` is 0–100 reflecting how well each satisfies the inferred persona; \`gaps\` lists short, concrete missing elements (max 20).

## Voice and constraints

- Terse, evidence-led. Quote SERP titles when justifying a persona inference.
- No traffic promises, no "we'll outrank position 1" claims.
- If the top results are all aged listicles with no real experience element, say so — that's a wedge.
- Do NOT include a closing summary, sign-off, or call to action — the report ends after the structured findings block.`;

const InputSchema = z.object({
  keyword: z.string().optional(),
  location_name: z.string().optional(),
  language_name: z.string().optional(),
});
type Input = z.infer<typeof InputSchema>;

function deriveKeyword(siteUrl: string): string {
  const brand = brandLabel(siteUrl);
  return brand ? `${brand} guide` : "buyer guide";
}

const spec: Specialist<Input> = {
  id: "sxo-analyst",
  name: "SXO Analyst",
  description:
    "Reads the SERP backwards to infer persona, score top results, and propose the experience pattern this site should adopt.",
  desk: "desk.sxo-analyst",
  inputSchema: InputSchema,
  async execute(ctx) {
    const input = ctx.input;
    requireIntegrations(["dataforseo"]);
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    const keyword = input.keyword?.trim() || deriveKeyword(manifest.site_under_audit);
    const { location_name, language_name } = resolveLocale(manifest, input);

    // SERP-depth=10 is enough — SXO reads the TOP, not the long tail.
    ctx.emit("progress", `Fetching SERP (advanced) for "${keyword}"…`, { progress: 0.2 });

    const json = await dataforseoPost<{
      items?: Array<{
        type?: string;
        rank_absolute?: number;
        title?: string;
        domain?: string;
        url?: string;
        description?: string;
      }>;
    }>("/v3/serp/google/organic/live/advanced", {
      keyword,
      location_name,
      language_name,
      depth: 10,
    });

    const totalCost = json.cost ?? 0;
    ctx.emit("log", `DataForSEO cost: $${totalCost.toFixed(4)} (depth 10)`);

    const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
    const featureCounts: Record<string, number> = {};
    for (const i of items) {
      const t = i.type ?? "unknown";
      featureCounts[t] = (featureCounts[t] ?? 0) + 1;
    }
    const organicTop = items
      .filter((i) => i.type === "organic")
      .slice(0, 5)
      .map((i, idx) => ({
        rank: i.rank_absolute ?? idx + 1,
        title: String(i.title ?? ""),
        domain: String(i.domain ?? ""),
        url: String(i.url ?? ""),
        description: String(i.description ?? ""),
      }));

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.55 });

    const payload = {
      site: manifest.site_under_audit,
      keyword,
      location_name,
      language_name,
      serpFeatureCounts: featureCounts,
      organicTop5: organicTop,
    };

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 3500,
      temperature: 0.45,
      messages: [
        {
          role: "user",
          content: `Read this SERP backwards. Payload:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        },
      ],
    });

    ctx.emit(
      "log",
      `${provider.id}${result.model ? " · " + result.model : ""}${result.durationMs ? " · " + (result.durationMs / 1000).toFixed(1) + "s" : ""}${result.costUsd != null ? " · $" + result.costUsd.toFixed(4) : ""}`,
    );

    const { data, body: bodyWithChart } = applyStructuredOutput({
      rawText: result.text,
      expectedKind: "sxo-scoring",
      chartSpec: (data) => ({
        type: "bar",
        title: "Persona experience scores",
        data: data.personas.map((p) => ({
          category: p.name,
          count: Math.round(p.score),
        })),
      }),
    });
    if (data) {
      ctx.emit(
        "log",
        `Structured findings parsed — ${data.personas.length} persona${data.personas.length === 1 ? "" : "s"}, ${data.signals.length} signal${data.signals.length === 1 ? "" : "s"}`,
      );
    } else {
      ctx.emit("log", "No valid structured findings block — skipping sidecar + HTML report");
    }

    ctx.emit("progress", "Writing SXO audit to vault…", { progress: 0.88 });

    const { relativePath, executionResult, reportPath, dataPath } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "sxo",
        frontmatterType: "audit",
        title: `SXO audit — ${keyword}`,
        body: bodyWithChart,
        tags: ["audit", "sxo", "experience", "serp-analysis", "claude-generated"],
        url: manifest.site_under_audit,
        reportSubtitle: data
          ? `${data.personas.length} persona${data.personas.length === 1 ? "" : "s"} scored · ${data.signals.length} signal${data.signals.length === 1 ? "" : "s"}`
          : undefined,
        ...(data ? { data } : {}),
        costUsd: totalCost + (result.costUsd ?? 0),
      },
      {
        facts: [
          `SXO audit on target keyword "${keyword}".`,
          `SERP feature mix: ${Object.entries(featureCounts)
            .map(([k, v]) => `${k}:${v}`)
            .join(", ")}.`,
          `DataForSEO cost: $${totalCost.toFixed(4)}.`,
        ],
        threadTitle: "SXO review",
        threadRationale: "decide on the experience element to add to the target page",
        statusNote: "SXO audit on file — pick the experience element to build before the next page revision.",
      },
    );

    return {
      summary: reportPath
        ? `SXO audit written to ${relativePath} (report: ${reportPath})`
        : `SXO audit written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      ...(reportPath ? { reportPath } : {}),
      ...(dataPath ? { dataPath } : {}),
      data: {
        keyword,
        featureCounts,
        dataforseoCostUsd: totalCost,
        ...(data ? { structured: data } : {}),
      },
    };
  },
};

registerSpecialist(spec);
export default spec;
