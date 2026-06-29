/**
 * Content Brief Generator — assembles a competitive content brief for a single
 * target keyword by pulling the top SERP organic results and asking the LLM
 * to back-engineer structure, depth, and the questions the page must answer.
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

const SYSTEM_PROMPT = `You are the Content Brief Generator inside SEO Office.

You receive a target keyword, location/language context, and a compact JSON payload of the top organic SERP results (rank, title, domain, URL, description) plus any People-Also-Ask questions and related searches the SERP exposed. Your job is to produce a single tight content brief a writer can execute against.

## Output contract

Produce a Markdown brief with exactly these sections, in this order:

1. **Target keyword + intent** — restate the keyword. Classify intent (I/C/T/N) and the *modality* the SERP rewards (listicle, guide, comparison, glossary, tool, etc.) based on the titles you can see.
2. **Search intent fit** — 2-3 sentences on what the user is actually trying to do, evidence-led off the SERP.
3. **Competitive read** — 1 sentence per top-5 result naming what each is doing well; flag any obvious gaps (no result has a comparison table, no result has a real example, etc.).
4. **Required sections** — exact H2 outline. For each H2: a one-line scope and a target word count. Total target word count must sit at the median of the top 5 results (estimate from titles + descriptions if word counts aren't given) — say what number you assumed and why.
5. **Questions to answer** — bullet list, drawn from People-Also-Ask + related searches. Mark which H2 each question belongs under.
6. **Entities + facts to include** — proper nouns, statistics, definitions the writer must cover so the page reads as authoritative.
7. **Internal + external link targets** — what the writer should link to from this page (categories, not specific URLs the writer needs to source).
8. **Title + meta** — propose 2 title tag candidates (under 60 chars) and 1 meta description (under 155 chars).
9. **Recommendations** — exactly 5 numbered actions for the writer/editor, each with title, one-sentence why, effort (S/M/L), impact (S/M/L).

## Voice and constraints

- Be terse, evidence-led. Quote 2-5 word fragments from competitor titles when justifying a structural choice.
- No traffic promises, no ranking guarantees. Briefs describe shape, not outcomes.
- If the SERP is thin (fewer than 5 organic results in the payload), say so and continue with what's there.
- End after the recommendations.`;

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
  id: "content-brief-generator",
  name: "Content Brief Generator",
  description:
    "Builds a competitive content brief with per-section word counts from the live top-10 SERP for a target keyword.",
  desk: "desk.content-brief-generator",
  inputSchema: InputSchema,
  async execute(ctx) {
    const input = ctx.input;
    requireIntegrations(["dataforseo"]);
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    const keyword = input.keyword?.trim() || deriveKeyword(manifest.site_under_audit);
    const { location_name, language_name } = resolveLocale(manifest, input);

    ctx.emit("progress", `Fetching SERP for "${keyword}"…`, { progress: 0.2 });

    const json = await dataforseoPost<{
      items?: Array<{
        type?: string;
        rank_absolute?: number;
        title?: string;
        domain?: string;
        url?: string;
        description?: string;
        items?: Array<{ title?: string; description?: string }>;
      }>;
    }>("/v3/serp/google/organic/live/regular", {
      keyword,
      location_name,
      language_name,
      depth: 10,
    });

    const totalCost = json.cost ?? 0;
    ctx.emit("log", `DataForSEO cost: $${totalCost.toFixed(4)}`);

    const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
    const organic = items
      .filter((i) => i.type === "organic")
      .slice(0, 10)
      .map((i, idx) => ({
        rank: i.rank_absolute ?? idx + 1,
        title: String(i.title ?? ""),
        domain: String(i.domain ?? ""),
        url: String(i.url ?? ""),
        description: String(i.description ?? ""),
      }));
    const paa =
      items
        .find((i) => i.type === "people_also_ask")
        ?.items?.map((q) => String(q.title ?? ""))
        .filter(Boolean) ?? [];
    const related =
      items
        .find((i) => i.type === "related_searches")
        ?.items?.map((q) => String(q.title ?? ""))
        .filter(Boolean) ?? [];

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.55 });

    const payload = {
      site: manifest.site_under_audit,
      keyword,
      location_name,
      language_name,
      organicTop10: organic,
      peopleAlsoAsk: paa.slice(0, 8),
      relatedSearches: related.slice(0, 10),
    };

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 3800,
      temperature: 0.4,
      messages: [
        {
          role: "user",
          content: `Build a content brief. Payload:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        },
      ],
    });

    ctx.emit(
      "log",
      `${provider.id}${result.model ? " · " + result.model : ""}${result.durationMs ? " · " + (result.durationMs / 1000).toFixed(1) + "s" : ""}${result.costUsd != null ? " · $" + result.costUsd.toFixed(4) : ""}`,
    );
    ctx.emit("progress", "Writing brief to vault…", { progress: 0.88 });

    const { relativePath, executionResult } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "deliverables",
        type: `brief-${keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
        frontmatterType: "page-brief",
        title: `Content brief — ${keyword}`,
        body: result.text,
        tags: ["deliverable", "content-brief", "page-brief", "claude-generated"],
        costUsd: totalCost + (result.costUsd ?? 0),
      },
      {
        facts: [
          `Content brief generated for "${keyword}" (${organic.length} organic results sampled).`,
          paa.length > 0
            ? `${paa.length} People-Also-Ask question(s) included in brief.`
            : `No People-Also-Ask block on this SERP.`,
          `DataForSEO cost: $${totalCost.toFixed(4)}.`,
        ],
        threadTitle: `Brief: ${keyword}`,
        threadRationale: "assign writer, confirm word count target, queue for draft",
        statusNote: `Brief on file — assign writer and lock the H2 outline before drafting.`,
      },
    );

    return {
      summary: `Content brief written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      data: { keyword, organicCount: organic.length, dataforseoCostUsd: totalCost },
    };
  },
};

registerSpecialist(spec);
export default spec;
