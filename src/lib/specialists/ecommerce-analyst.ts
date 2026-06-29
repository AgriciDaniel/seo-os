/**
 * E-commerce SEO Analyst — pulls product-intent SERPs to evaluate Shopping
 * placement, marketplace dominance, and product-schema opportunity for an
 * e-commerce site.
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

const SYSTEM_PROMPT = `You are the E-commerce SEO Analyst inside SEO Office.

You receive a compact JSON payload describing a site's product space and SERP snapshots for 2-3 product-intent queries ("buy <product>", "best <product>", a category term). The SERPs include organic results, Shopping/PLA blocks, marketplace placement, and any review snippet evidence. Your job is to assess where the site can compete and what schema/product-page hygiene is missing.

## Output contract

Produce a Markdown report with exactly these sections, in this order:

1. **SERP shape per query** — for each query: how much SERP real estate goes to Shopping vs. organic vs. marketplaces (Amazon, Walmart, Etsy). Which players appear repeatedly?
2. **Where this site can win** — explicit verdict per query: organic-viable / Shopping-required / marketplace-only. Evidence-led.
3. **Product schema audit (signals)** — based on rich-result presence on competitors, list the schema types this site likely needs: \`Product\`, \`Offer\`, \`AggregateRating\`, \`Review\`, \`BreadcrumbList\`, \`FAQPage\`. Mark each as critical / nice-to-have.
4. **Marketplace strategy** — when a marketplace dominates (e.g. Amazon owns 6/10), say so and propose a marketplace listing posture (own marketplace SKUs vs. only sell direct) without overpromising.
5. **Shopping feed readiness** — what's needed before launching a Merchant Center feed (clean GTINs, sized/weighted variants, structured prices, return policy schema).
6. **Recommendations** — exactly 5 numbered actions, each with title, one-sentence why, effort (S/M/L), impact (S/M/L). Sorted by impact-per-effort.

## Voice and constraints

- Terse, evidence-led. Quote actual SERP domains when claiming "marketplace dominates".
- No traffic/revenue promises. Schema fixes don't guarantee rich snippets.
- If a query returns no Shopping block, say so explicitly.
- End after the recommendations.`;

const InputSchema = z.object({
  products: z.array(z.string()).max(3).optional(),
  category: z.string().optional(),
  location_name: z.string().optional(),
  language_name: z.string().optional(),
});
type Input = z.infer<typeof InputSchema>;

function deriveProduct(siteUrl: string): string {
  return brandLabel(siteUrl) || "product";
}

const spec: Specialist<Input> = {
  id: "ecommerce-analyst",
  name: "E-commerce SEO",
  description:
    "Audits product schema, Shopping placement, and marketplace intel from live product-intent SERPs.",
  desk: "desk.ecommerce-analyst",
  inputSchema: InputSchema,
  async execute(ctx) {
    const input = ctx.input;
    requireIntegrations(["dataforseo"]);
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    const base =
      input.category?.trim() ||
      manifest.business_type?.trim() ||
      deriveProduct(manifest.site_under_audit);
    const products =
      input.products && input.products.length > 0
        ? input.products.slice(0, 3)
        : [`buy ${base}`, `best ${base}`, base];
    const { location_name, language_name } = resolveLocale(manifest, input);

    ctx.emit("progress", `Pulling SERP for ${products.length} product query(s)…`, {
      progress: 0.15,
    });

    const snapshots: Array<{
      query: string;
      cost: number;
      itemTypeCounts: Record<string, number>;
      organicTop: Array<{ rank: number; title: string; domain: string }>;
      shoppingCount: number;
    }> = [];
    let totalCost = 0;
    for (const keyword of products) {
      const json = await dataforseoPost<{
        items?: Array<{
          type?: string;
          rank_absolute?: number;
          title?: string;
          domain?: string;
        }>;
      }>("/v3/serp/google/organic/live/regular", {
        keyword,
        location_name,
        language_name,
        depth: 10,
      });
      totalCost += json.cost ?? 0;
      const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
      const itemTypeCounts: Record<string, number> = {};
      for (const i of items) {
        const t = i.type ?? "unknown";
        itemTypeCounts[t] = (itemTypeCounts[t] ?? 0) + 1;
      }
      const organicTop = items
        .filter((i) => i.type === "organic")
        .slice(0, 10)
        .map((i, idx) => ({
          rank: i.rank_absolute ?? idx + 1,
          title: String(i.title ?? ""),
          domain: String(i.domain ?? ""),
        }));
      const shoppingCount =
        (itemTypeCounts.shopping ?? 0) +
        (itemTypeCounts.google_shopping ?? 0) +
        (itemTypeCounts.product ?? 0);
      snapshots.push({ query: keyword, cost: json.cost ?? 0, itemTypeCounts, organicTop, shoppingCount });
    }

    ctx.emit("log", `DataForSEO cost: $${totalCost.toFixed(4)} across ${products.length} SERP(s)`);

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.55 });

    const payload = {
      site: manifest.site_under_audit,
      category: base,
      location_name,
      language_name,
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
          content: `Assess e-commerce SEO posture. Payload:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        },
      ],
    });

    ctx.emit(
      "log",
      `${provider.id}${result.model ? " · " + result.model : ""}${result.durationMs ? " · " + (result.durationMs / 1000).toFixed(1) + "s" : ""}${result.costUsd != null ? " · $" + result.costUsd.toFixed(4) : ""}`,
    );
    ctx.emit("progress", "Writing e-commerce audit to vault…", { progress: 0.88 });

    const { relativePath, executionResult } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "ecommerce",
        frontmatterType: "audit",
        title: `E-commerce SEO audit — ${manifest.site_under_audit}`,
        body: result.text,
        tags: ["audit", "ecommerce", "shopping", "product-schema", "claude-generated"],
        costUsd: totalCost + (result.costUsd ?? 0),
      },
      {
        facts: [
          `E-commerce audit sampled ${products.length} product-intent SERP(s).`,
          `Category: "${base}".`,
          `DataForSEO cost: $${totalCost.toFixed(4)}.`,
        ],
        threadTitle: "E-commerce SEO",
        threadRationale: "decide on Shopping feed scope + product schema rollout",
        statusNote: "E-commerce audit on file — decide marketplace vs. organic posture before scoping schema work.",
      },
    );

    return {
      summary: `E-commerce audit written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      data: { category: base, productQueries: products, dataforseoCostUsd: totalCost },
    };
  },
};

registerSpecialist(spec);
export default spec;
