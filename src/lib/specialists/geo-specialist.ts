/**
 * GEO Specialist — Generative Engine Optimization. Assesses visibility in
 * Google AI Overviews, ChatGPT browsing, and Perplexity by checking AI
 * Overview presence on a small set of question-shaped queries plus the
 * supporting organic SERP.
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

const SYSTEM_PROMPT = `You are the GEO Specialist (Generative Engine Optimization) inside SEO Office.

You receive a compact JSON payload describing a site and a small set of question-shaped queries with AI Overview presence + organic top results. Your job is to evaluate the site's readiness to be cited by generative engines (Google AI Overviews, ChatGPT search, Perplexity) and recommend the highest-leverage moves.

## Output contract

Produce a Markdown report with exactly these sections, in this order:

1. **AI Overview presence read** — for each sampled query: does an AI Overview appear? Which domains are cited inside it? Is this site cited?
2. **Citation pattern** — what kind of source AIs are quoting here (publishers, primary research, brand sites, forums). Why that pattern probably exists for this niche.
3. **Site citation-readiness** — concrete checklist the site must pass to be cite-worthy: question-shaped H2s, summary-first paragraphs (the "answer in the first 60 words"), declarative facts with named sources, stable canonical URLs, schema (\`FAQPage\`, \`Article\`, \`HowTo\` where appropriate).
4. **Perplexity + ChatGPT angle** — what differs from Google AI Overviews here. Perplexity weights recency + concrete URLs; ChatGPT browsing favours authoritative + clean structure.
5. **Risks** — pages most likely to be cannibalised by AI Overviews (informational, low-commercial-intent). Pages safe from cannibalisation (transactional, branded).
6. **Recommendations** — exactly 5 numbered actions, each with title, one-sentence why, effort (S/M/L), impact (S/M/L). Sorted by impact-per-effort.

## Voice and constraints

- Terse, evidence-led. Name the domain cited in the AI Overview when justifying a citation pattern.
- No traffic promises. AI search dynamics shift weekly.
- If no AI Overview appears for any sampled query, say so — that's a finding, not a gap.
- End after the recommendations.`;

const InputSchema = z.object({
  queries: z.array(z.string()).max(3).optional(),
  location_name: z.string().optional(),
  language_name: z.string().optional(),
});
type Input = z.infer<typeof InputSchema>;

function deriveQueries(siteUrl: string): string[] {
  const topic = brandLabel(siteUrl) || "site";
  return [`what is ${topic}`, `how does ${topic} work`, `best ${topic} for beginners`];
}

const spec: Specialist<Input> = {
  id: "geo-specialist",
  name: "GEO Specialist",
  description:
    "Audits AI Overview presence and generative-engine citation readiness (ChatGPT, Perplexity, Google AI Overviews).",
  desk: "desk.geo-specialist",
  inputSchema: InputSchema,
  async execute(ctx) {
    const input = ctx.input;
    requireIntegrations(["dataforseo"]);
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    const queries =
      input.queries && input.queries.length > 0
        ? input.queries.slice(0, 3)
        : deriveQueries(manifest.site_under_audit);
    const { location_name, language_name } = resolveLocale(manifest, input);

    ctx.emit("progress", `Pulling AI Overview + SERP for ${queries.length} query(s)…`, {
      progress: 0.15,
    });

    const snapshots: Array<{
      query: string;
      aiOverviewPresent: boolean;
      aiOverviewCitedDomains: string[];
      organicTop: Array<{ rank: number; title: string; domain: string }>;
      cost: number;
    }> = [];
    let totalCost = 0;

    for (const keyword of queries) {
      const json = await dataforseoPost<{
        items?: Array<{
          type?: string;
          rank_absolute?: number;
          title?: string;
          domain?: string;
          references?: Array<{ domain?: string; url?: string }>;
          items?: Array<{ domain?: string; url?: string; references?: Array<{ domain?: string }> }>;
        }>;
      }>("/v3/serp/google/organic/live/advanced", {
        keyword,
        location_name,
        language_name,
        depth: 10,
      });
      totalCost += json.cost ?? 0;
      const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
      const aiBlock = items.find((i) => i.type === "ai_overview");
      const refs =
        aiBlock?.references?.map((r) => String(r.domain ?? "")).filter(Boolean) ??
        aiBlock?.items?.flatMap((i) => i.references?.map((r) => String(r.domain ?? "")) ?? []) ??
        [];
      const organicTop = items
        .filter((i) => i.type === "organic")
        .slice(0, 8)
        .map((i, idx) => ({
          rank: i.rank_absolute ?? idx + 1,
          title: String(i.title ?? ""),
          domain: String(i.domain ?? ""),
        }));
      snapshots.push({
        query: keyword,
        aiOverviewPresent: Boolean(aiBlock),
        aiOverviewCitedDomains: Array.from(new Set(refs.filter(Boolean))).slice(0, 8),
        organicTop,
        cost: json.cost ?? 0,
      });
    }

    ctx.emit("log", `DataForSEO cost: $${totalCost.toFixed(4)} across ${queries.length} SERP(s)`);

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.55 });

    const payload = {
      site: manifest.site_under_audit,
      location_name,
      language_name,
      snapshots,
    };

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 3500,
      temperature: 0.4,
      messages: [
        {
          role: "user",
          content: `Assess generative-engine readiness. Payload:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        },
      ],
    });

    ctx.emit(
      "log",
      `${provider.id}${result.model ? " · " + result.model : ""}${result.durationMs ? " · " + (result.durationMs / 1000).toFixed(1) + "s" : ""}${result.costUsd != null ? " · $" + result.costUsd.toFixed(4) : ""}`,
    );
    ctx.emit("progress", "Writing GEO audit to vault…", { progress: 0.88 });

    const aiPresentCount = snapshots.filter((s) => s.aiOverviewPresent).length;

    const { relativePath, executionResult } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "geo",
        frontmatterType: "audit",
        title: `GEO audit — ${manifest.site_under_audit}`,
        body: result.text,
        tags: ["audit", "geo", "ai-overviews", "perplexity", "claude-generated"],
        costUsd: totalCost + (result.costUsd ?? 0),
      },
      {
        facts: [
          `GEO audit sampled ${queries.length} question-shaped queries.`,
          `AI Overviews appeared on ${aiPresentCount}/${queries.length} queries.`,
          `DataForSEO cost: $${totalCost.toFixed(4)}.`,
        ],
        threadTitle: "GEO citation readiness",
        threadRationale: "lock the answer-first paragraph pattern + FAQPage schema rollout",
        statusNote: "GEO audit on file — apply answer-first pattern to top informational pages first.",
      },
    );

    return {
      summary: `GEO audit written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      data: { queries, aiPresentCount, dataforseoCostUsd: totalCost },
    };
  },
};

registerSpecialist(spec);
export default spec;
