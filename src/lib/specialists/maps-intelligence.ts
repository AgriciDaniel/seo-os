/**
 * Maps Intelligence — light geo-grid rank read on Google Maps for a small
 * set of nearby locations. Useful for a preview of local-pack visibility
 * across a service area without spinning up a full grid-tracker pull.
 */
import "server-only";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { post as dataforseoPost } from "@/lib/integrations/dataforseo";
import { requireIntegrations } from "./_lib/availability";
import { resolveLocale } from "./_lib/locale";
import { apexLabel } from "./_lib/derive";
import { writeArtifact } from "./_lib/artifact";

const SYSTEM_PROMPT = `You are the Maps Intelligence specialist inside SEO Office.

You receive a compact JSON payload with a business name, a primary service term, and Maps SERP snapshots from 2-3 nearby search locations. Your job is to read the geo-grid pattern: where is this business visible in the local 3-pack, where does it fall off, and which competitors dominate which sub-areas.

## Output contract

Produce a Markdown report with exactly these sections, in this order:

1. **Visibility snapshot** — for each sampled location: this business's rank on the Maps SERP for the primary service term. "Not visible in top 20" counts as a finding.
2. **Competitor map** — which competitors hold the local 3-pack across the sampled locations. Identify the 2-3 names that appear most often. Note rating + review count for each when present in the payload.
3. **Geographic drop-off pattern** — does the business's rank fall off cleanly with distance from primary location, or are there pockets of strength/weakness?
4. **Review velocity signal** — review counts of top-ranked competitors vs. this business (use GBP data if included; otherwise infer from Maps SERP rating/votes). High review counts that this business hasn't matched are a moat.
5. **GBP audit gaps suggested by the data** — what likely needs work to close the gap (more reviews? a tighter primary category? service-area expansion in GBP? more photos?). Be specific, not generic.
6. **Recommendations** — exactly 5 numbered actions, each with title, one-sentence why, effort (S/M/L), impact (S/M/L). Sorted by impact-per-effort. Lead with reviews if review-count gap > 50%.

## Voice and constraints

- Terse, evidence-led. Cite the competitor name + rank when justifying a moat call.
- No promises of "moving up the local pack in 30 days".
- If the business doesn't appear at all in the sampled SERPs, name that finding clearly and pivot to category-level read.
- End after the recommendations.`;

const InputSchema = z.object({
  business_name: z.string().optional(),
  service_term: z.string().optional(),
  locations: z.array(z.string()).max(3).optional(),
  language_name: z.string().optional(),
});
type Input = z.infer<typeof InputSchema>;

function deriveBusinessName(siteUrl: string, vault: string): string {
  const v = vault.replace(/ marketing-brain$/i, "").trim();
  if (v && v.toLowerCase() !== "client") return v;
  return apexLabel(siteUrl) || "business";
}

/**
 * Word-boundary match — avoids "acme" matching "acmewidgets". Strips common
 * legal suffixes ("inc", "llc", "ltd") and matches against whole-word tokens
 * in either title.
 */
function nameMatchesTitle(businessName: string, title: string): boolean {
  const normalize = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\b(inc|llc|ltd|co|corp|gmbh)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const businessTokens = normalize(businessName).split(" ").filter((t) => t.length >= 3);
  if (businessTokens.length === 0) return false;
  const titleTokens = new Set(normalize(title).split(" "));
  // Match only if every meaningful business token appears as a whole word
  return businessTokens.every((t) => titleTokens.has(t));
}

const spec: Specialist<Input> = {
  id: "maps-intelligence",
  name: "Maps Intelligence",
  description:
    "Geo-grid Maps rank preview across 2-3 nearby locations plus competitor 3-pack share.",
  desk: "desk.maps-intelligence",
  inputSchema: InputSchema,
  async execute(ctx) {
    const input = ctx.input;
    requireIntegrations(["dataforseo"]);
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    const businessName =
      input.business_name?.trim() ||
      deriveBusinessName(manifest.site_under_audit, manifest.vault);
    const serviceTerm = input.service_term?.trim() || businessName;
    const { location_name: defaultLocation, language_name } = resolveLocale(
      manifest,
      input,
    );
    const locations =
      input.locations && input.locations.length > 0
        ? input.locations.slice(0, 3)
        : [defaultLocation];

    ctx.emit("progress", `Pulling Maps SERP for ${locations.length} location(s)…`, {
      progress: 0.15,
    });

    interface MapsItem {
      rank: number;
      title: string;
      rating: number | null;
      reviewCount: number | null;
      category: string;
    }
    const snapshots: Array<{
      location: string;
      cost: number;
      thisBusinessRank: number | null;
      top10: MapsItem[];
    }> = [];
    let totalCost = 0;

    for (const location_name of locations) {
      const json = await dataforseoPost<{
        items?: Array<{
          type?: string;
          rank_absolute?: number;
          title?: string;
          rating?: { value?: number; votes_count?: number };
          category?: string;
        }>;
      }>("/v3/serp/google/maps/live/advanced", {
        keyword: serviceTerm,
        location_name,
        language_name,
      });
      totalCost += json.cost ?? 0;
      const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
      const top10: MapsItem[] = items.slice(0, 10).map((i, idx) => ({
        rank: i.rank_absolute ?? idx + 1,
        title: String(i.title ?? ""),
        rating: i.rating?.value ?? null,
        reviewCount: i.rating?.votes_count ?? null,
        category: String(i.category ?? ""),
      }));
      const thisBusinessRank =
        top10.find((i) => nameMatchesTitle(businessName, i.title))?.rank ?? null;
      snapshots.push({ location: location_name, cost: json.cost ?? 0, thisBusinessRank, top10 });
    }

    ctx.emit("log", `DataForSEO cost: $${totalCost.toFixed(4)} across ${locations.length} location(s)`);

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.55 });

    const payload = {
      site: manifest.site_under_audit,
      businessName,
      serviceTerm,
      locations,
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
          content: `Read the Maps geo pattern. Payload:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        },
      ],
    });

    ctx.emit(
      "log",
      `${provider.id}${result.model ? " · " + result.model : ""}${result.durationMs ? " · " + (result.durationMs / 1000).toFixed(1) + "s" : ""}${result.costUsd != null ? " · $" + result.costUsd.toFixed(4) : ""}`,
    );
    ctx.emit("progress", "Writing Maps intelligence to vault…", { progress: 0.88 });

    const visible = snapshots.filter((s) => s.thisBusinessRank != null).length;

    const { relativePath, executionResult } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "maps-intelligence",
        frontmatterType: "audit",
        title: `Maps intelligence — ${manifest.site_under_audit}`,
        body: result.text,
        tags: ["audit", "maps", "local-seo", "geo-grid", "claude-generated"],
        costUsd: totalCost + (result.costUsd ?? 0),
      },
      {
        facts: [
          `Maps intelligence sampled ${locations.length} location(s) for "${serviceTerm}".`,
          `"${businessName}" visible in top-10 on ${visible}/${locations.length} sampled location(s).`,
          `DataForSEO cost: $${totalCost.toFixed(4)}.`,
        ],
        threadTitle: "Maps intelligence",
        threadRationale: "decide on review velocity push + GBP category tightening",
        statusNote: "Maps preview on file — review velocity gap is the most common bottleneck; check first.",
      },
    );

    return {
      summary: `Maps intelligence written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      data: { businessName, locationsSampled: locations.length, visibleIn: visible, dataforseoCostUsd: totalCost },
    };
  },
};

registerSpecialist(spec);
export default spec;
