/**
 * Local SEO — audits Google Business Profile signals, NAP consistency cues,
 * citation surface, and local schema readiness using live Maps + GBP data
 * for the manifest's business name.
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
import {
  applyStructuredOutput,
  sidecarRef,
} from "./_lib/structured-output";

const SYSTEM_PROMPT = `You are the Local SEO specialist inside SEO Office.

You receive a compact JSON payload describing a local business (name, site, location) plus live data: a Google Business Profile snapshot (rating, reviews, categories, hours, attributes if present) and the top Maps results for the business's primary service-term query. Your job is to audit local readiness and surface the highest-leverage moves.

## Output contract

Produce a Markdown report with exactly these sections, in this order:

1. **GBP snapshot** — quick read: rating, review count, primary + secondary categories, hours completeness, photo signals. Flag anything visibly missing.
2. **NAP consistency cues** — the payload won't fully resolve citations, but call out anything inconsistent within it (phone format, address format, name variants in titles vs. GBP).
3. **Maps SERP read** — for the primary service query, who's in the local pack? Where does this business sit (in pack / below pack / not visible)?
4. **Categories + attributes** — is the primary category narrow enough? Are competitors using a tighter or broader category? Which attributes (women-owned, online appointments, wheelchair accessible, etc.) commonly appear in the niche but are missing here?
5. **Local schema readiness** — types this site should have on the home/contact page: \`LocalBusiness\` (or a tighter subtype like \`Plumber\`, \`Dentist\`, \`Restaurant\`), \`PostalAddress\`, \`GeoCoordinates\`, \`OpeningHoursSpecification\`, \`AggregateRating\`. Mark each critical / nice-to-have.
6. **Citation surface** — top 5 directories that matter for this niche/geo (chamber of commerce, BBB, Yelp, niche-specific) — be concrete, not generic.
7. **Recommendations** — exactly 5 numbered actions, each with title, one-sentence why, effort (S/M/L), impact (S/M/L). Sorted by impact-per-effort.

After the recommendations, append a final section:

8. **Structured findings (machine-readable)** — a single fenced code block tagged \`data\` containing JSON that matches this schema:

\`\`\`data
{
  "kind": "local-presence",
  "v": 1,
  "gbp_completeness": <0-100>,
  "nap_signals": [
    { "name": "<directory or surface, e.g. 'GBP', 'site footer', 'Yelp'>", "status": "match|mismatch|missing" }
  ],
  "signals": [
    { "id": "<kebab-case>", "label": "<short label>", "severity": "high|medium|low|info", "detail": "<one sentence>" }
  ]
}
\`\`\`

The data block is parsed and removed before the note is rendered, so do NOT add commentary inside the fenced block. \`gbp_completeness\` is a 0–100 score reflecting how complete the GBP record is based on what fields are populated (categories, hours, photos, attributes, description, services, etc.). \`nap_signals\` may contain at most 40 entries. If GBP data isn't returned, score completeness 0 and emit a single missing-NAP signal.

## Voice and constraints

- Terse, evidence-led. Quote actual GBP fields when calling something out.
- No traffic promises, no "rank #1 in local pack" claims.
- If GBP data isn't returned for the business name, say so and pivot to category-level Maps observations.
- Do NOT include a closing summary, sign-off, or call to action — the report ends after the structured findings block.`;

const InputSchema = z.object({
  business_name: z.string().optional(),
  service_term: z.string().optional(),
  location_name: z.string().optional(),
  language_name: z.string().optional(),
});
type Input = z.infer<typeof InputSchema>;

function deriveBusinessName(siteUrl: string, vault: string): string {
  const v = vault.replace(/ marketing-brain$/i, "").trim();
  if (v && v.toLowerCase() !== "client") return v;
  return apexLabel(siteUrl) || "business";
}

const spec: Specialist<Input> = {
  id: "local-seo",
  name: "Local SEO",
  description:
    "Audits GBP, NAP cues, local schema, and citation surface for a single-location or service-area business.",
  desk: "desk.local-seo",
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
    const { location_name, language_name } = resolveLocale(manifest, input);

    ctx.emit("progress", `Looking up GBP for "${businessName}"…`, { progress: 0.15 });

    let totalCost = 0;

    // 1) GBP info lookup (cheap).
    const gbp = await dataforseoPost<{
      items?: Array<Record<string, unknown>>;
    }>("/v3/business_data/google/my_business_info/live", {
      keyword: businessName,
      location_name,
      language_name,
    });
    totalCost += gbp.cost ?? 0;
    const gbpItem = gbp.tasks?.[0]?.result?.[0]?.items?.[0] ?? null;

    ctx.emit("progress", `Pulling Maps SERP for "${serviceTerm}"…`, { progress: 0.4 });

    // 2) Maps result for the primary service term.
    const maps = await dataforseoPost<{
      items?: Array<{
        type?: string;
        rank_absolute?: number;
        title?: string;
        rating?: { value?: number; votes_count?: number };
        category?: string;
        domain?: string;
      }>;
    }>("/v3/serp/google/maps/live/advanced", {
      keyword: serviceTerm,
      location_name,
      language_name,
    });
    totalCost += maps.cost ?? 0;
    const mapsItems = maps.tasks?.[0]?.result?.[0]?.items ?? [];
    const localPack = mapsItems
      .slice(0, 10)
      .map((i, idx) => ({
        rank: i.rank_absolute ?? idx + 1,
        title: String(i.title ?? ""),
        rating: i.rating?.value ?? null,
        reviewCount: i.rating?.votes_count ?? null,
        category: String(i.category ?? ""),
        domain: String(i.domain ?? ""),
      }));

    ctx.emit("log", `DataForSEO cost: $${totalCost.toFixed(4)} (GBP + Maps)`);

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.6 });

    const payload = {
      site: manifest.site_under_audit,
      businessName,
      serviceTerm,
      location_name,
      language_name,
      gbp: gbpItem,
      mapsTop10: localPack,
    };

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 3500,
      temperature: 0.4,
      messages: [
        {
          role: "user",
          content: `Audit local SEO posture. Payload:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        },
      ],
    });

    ctx.emit(
      "log",
      `${provider.id}${result.model ? " · " + result.model : ""}${result.durationMs ? " · " + (result.durationMs / 1000).toFixed(1) + "s" : ""}${result.costUsd != null ? " · $" + result.costUsd.toFixed(4) : ""}`,
    );

    const today = new Date().toISOString().slice(0, 10);
    const { data, body: bodyWithChart } = applyStructuredOutput({
      rawText: result.text,
      expectedKind: "local-presence",
      chartSpec: (d) => ({
        type: "donut",
        title: "GBP completeness",
        ref: sidecarRef(today, "local"),
        data: [
          { label: "Complete", value: d.gbp_completeness },
          { label: "Remaining", value: 100 - d.gbp_completeness },
        ],
      }),
    });
    if (data) {
      ctx.emit(
        "log",
        `Structured findings parsed — GBP completeness ${data.gbp_completeness}/100, ${data.nap_signals.length} NAP signal${data.nap_signals.length === 1 ? "" : "s"}, ${data.signals.length} signal${data.signals.length === 1 ? "" : "s"}`,
      );
    } else {
      ctx.emit("log", "No valid structured findings block — skipping sidecar + HTML report");
    }

    ctx.emit("progress", "Writing local SEO audit to vault…", { progress: 0.88 });

    const { relativePath, executionResult, reportPath, dataPath } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "local",
        frontmatterType: "audit",
        title: `Local SEO audit — ${manifest.site_under_audit}`,
        body: bodyWithChart,
        tags: ["audit", "local-seo", "gbp", "claude-generated"],
        url: manifest.site_under_audit,
        reportSubtitle: data
          ? `GBP completeness ${data.gbp_completeness}/100 · ${data.nap_signals.length} NAP signal${data.nap_signals.length === 1 ? "" : "s"}`
          : undefined,
        ...(data ? { data } : {}),
        costUsd: totalCost + (result.costUsd ?? 0),
      },
      {
        facts: [
          `Local SEO audit for "${businessName}" (service term: "${serviceTerm}").`,
          gbpItem ? `GBP record resolved.` : `GBP record not resolved by name lookup — relying on Maps SERP only.`,
          `DataForSEO cost: $${totalCost.toFixed(4)}.`,
        ],
        threadTitle: "Local SEO",
        threadRationale: "claim GBP fixes, decide on schema rollout, prioritise top 3 citations",
        statusNote: "Local audit on file — start with GBP completeness before citation work.",
      },
    );

    return {
      summary: reportPath
        ? `Local SEO audit written to ${relativePath} (report: ${reportPath})`
        : `Local SEO audit written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      ...(reportPath ? { reportPath } : {}),
      ...(dataPath ? { dataPath } : {}),
      data: {
        businessName,
        gbpResolved: Boolean(gbpItem),
        mapsCount: localPack.length,
        dataforseoCostUsd: totalCost,
        ...(data ? { structured: data } : {}),
      },
    };
  },
};

registerSpecialist(spec);
export default spec;
