/**
 * Topic Clusterer — derives hub-and-spoke topic architecture from SERP overlap.
 *
 * Pulls a small SERP sample for 1-3 seed keywords derived from the site, then
 * asks the LLM to propose hub topics, spokes, and the internal-linking shape
 * that a small site can actually execute on.
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

const SYSTEM_PROMPT = `You are the Topic Clusterer inside SEO Office.

You receive a compact JSON payload describing a site (URL, apparent topical scope) and SERP snapshots for 1-3 seed keywords (top organic results, titles, domains). Your job is to propose a hub-and-spoke topic architecture that uses SERP overlap as the primary clustering signal.

## Output contract

Produce a Markdown report with exactly these sections, in this order:

1. **Topical scope** — 1-2 sentences naming the territory you can defend, given the seeds and what their SERPs reveal.
2. **SERP overlap read** — what domains keep reappearing across the seeds? Which seeds genuinely share intent vs. which are surface-similar but compete on different SERPs? Cite the seed keyword each time.
3. **Hub topics** — 3-5 hubs. For each: hub title, the user question it answers, why SERP evidence justifies it as a hub (not a spoke).
4. **Spokes per hub** — for each hub, 4-8 spoke titles with one-line intent + the parent hub they link up to.
5. **Internal-linking shape** — exact rules: spokes link up to hub, hub links down to all spokes, sibling spokes link laterally only when SERP overlap > 40% (estimate).
6. **Recommendations** — exactly 5 numbered actions, each with title, one-sentence why, effort (S/M/L), impact (S/M/L). Ordered by impact-per-effort.

## Voice and constraints

- Be terse, evidence-led, no fluff. Quote actual SERP titles or domains when justifying a cluster.
- No traffic promises, no ranking guarantees.
- If SERP coverage is too thin (e.g. only 1 seed returned useful results), say so and flag what's needed to firm up the plan.
- End after the recommendations.`;

const InputSchema = z.object({
  seeds: z.array(z.string()).max(3).optional(),
  location_name: z.string().optional(),
  language_name: z.string().optional(),
});
type Input = z.infer<typeof InputSchema>;

interface SerpSnapshot {
  keyword: string;
  cost: number;
  topResults: Array<{ rank: number; title: string; domain: string; url: string }>;
}

function deriveSeed(siteUrl: string): string {
  return brandLabel(siteUrl) || "best products";
}

const spec: Specialist<Input> = {
  id: "topic-clusterer",
  name: "Topic Clusterer",
  description:
    "Proposes hub-and-spoke topic architecture using live SERP overlap for 1-3 seed keywords.",
  desk: "desk.topic-clusterer",
  inputSchema: InputSchema,
  async execute(ctx) {
    const input = ctx.input;
    requireIntegrations(["dataforseo"]);
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    const seeds =
      input.seeds && input.seeds.length > 0
        ? input.seeds.slice(0, 3)
        : [deriveSeed(manifest.site_under_audit)];
    const { location_name, language_name } = resolveLocale(manifest, input);

    ctx.emit("progress", `Pulling SERP for ${seeds.length} seed(s)…`, { progress: 0.15 });

    const snapshots: SerpSnapshot[] = [];
    let totalCost = 0;
    for (const keyword of seeds) {
      const json = await dataforseoPost<{
        items?: Array<{ type?: string; rank_absolute?: number; title?: string; domain?: string; url?: string }>;
      }>("/v3/serp/google/organic/live/regular", {
        keyword,
        location_name,
        language_name,
        depth: 10,
      });
      totalCost += json.cost ?? 0;
      const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
      const topResults = items
        .filter((i) => i.type === "organic" && i.title && i.domain && i.url)
        .slice(0, 10)
        .map((i, idx) => ({
          rank: i.rank_absolute ?? idx + 1,
          title: String(i.title),
          domain: String(i.domain),
          url: String(i.url),
        }));
      snapshots.push({ keyword, cost: json.cost ?? 0, topResults });
    }

    ctx.emit("log", `DataForSEO cost: $${totalCost.toFixed(4)} across ${seeds.length} SERP(s)`);

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.55 });

    const payload = {
      site: manifest.site_under_audit,
      location_name,
      language_name,
      seeds,
      serpSnapshots: snapshots,
    };

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 3500,
      temperature: 0.4,
      messages: [
        {
          role: "user",
          content: `Propose hub-and-spoke clusters for this site. Payload:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        },
      ],
    });

    ctx.emit(
      "log",
      `${provider.id}${result.model ? " · " + result.model : ""}${result.durationMs ? " · " + (result.durationMs / 1000).toFixed(1) + "s" : ""}${result.costUsd != null ? " · $" + result.costUsd.toFixed(4) : ""}`,
    );
    ctx.emit("progress", "Writing cluster plan to vault…", { progress: 0.88 });

    const { relativePath, executionResult } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "deliverables",
        type: "topic-clusters",
        frontmatterType: "deliverable",
        title: `Topic clusters — ${manifest.site_under_audit}`,
        body: result.text,
        tags: ["deliverable", "topic-clusters", "architecture", "claude-generated"],
        costUsd: totalCost + (result.costUsd ?? 0),
      },
      {
        facts: [
          `Topic clusterer ran on ${seeds.length} seed(s): ${seeds.join(", ")}.`,
          `SERP sample cost: $${totalCost.toFixed(4)} (depth 10).`,
        ],
        threadTitle: "Topic cluster review",
        threadRationale: "validate hubs and pick the first 1-2 to build out",
        statusNote: "Cluster plan on file — pick the first hub to build before commissioning briefs.",
      },
    );

    return {
      summary: `Topic clusters written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      data: { seeds, dataforseoCostUsd: totalCost },
    };
  },
};

registerSpecialist(spec);
export default spec;
