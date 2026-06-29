/**
 * Competitor Pages — proposes "X vs Y", "alternatives to X", and feature-matrix
 * page concepts based on what's actually ranking for competitor-comparison
 * queries in the site's space.
 */
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { vaultRoot } from "@/lib/brain/paths";
import { readManifest } from "@/lib/orchestrator/client-context";
import {
  registerSpecialist,
  type Specialist,
  type SpecialistContext,
} from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { post as dataforseoPost } from "@/lib/integrations/dataforseo";
import { runMarketingBrainScript } from "@/lib/marketing-brain/scripts";
import { requireIntegrations } from "./_lib/availability";
import { resolveLocale } from "./_lib/locale";
import { brandLabel } from "./_lib/derive";
import { writeArtifact } from "./_lib/artifact";
import { updateCanonicalNote } from "@/lib/brain/canonical-writer";

const SYSTEM_PROMPT = `You are the Competitor Pages strategist inside SEO Office.

You receive a compact JSON payload describing a site and SERP snapshots for 2-3 competitor-comparison queries ("alternatives to <brand>", "<brand> vs <brand>"). Your job is to propose competitor-comparison content this site should build — pages that intercept commercial-investigation intent.

## Output contract

Produce a Markdown report with exactly these sections, in this order:

1. **Comparison landscape** — 2-3 sentences naming who the site competes with and what types of comparison pages dominate these SERPs (listicles, vs-pages, alternatives roundups, feature matrices).
2. **Recommended pages** — table of 6-10 rows. Columns: \`Page title\`, \`Type (vs / alternatives / matrix / listicle)\`, \`Primary keyword\`, \`Intent (C/T)\`, \`Estimated effort (S/M/L)\`, \`Why this fits\`. Lead with highest impact-per-effort.
3. **Page structure template** — for each page TYPE you recommended, give a tight H2 outline (5-8 H2s) plus the table/comparison-matrix shape that page must include.
4. **Tone + positioning** — how this site should frame itself relative to competitors without being slanderous, dishonest, or non-compliant. Concrete examples ("show the gap, don't hide it" > "we're better").
5. **Disclosure + compliance** — required language for ranking-style pages (affiliate disclosure, "as of <date>" dating, alternatives-to-X trademark posture).
6. **Recommendations** — exactly 5 numbered actions, each with title, one-sentence why, effort (S/M/L), impact (S/M/L). Sorted by impact-per-effort.

## Voice and constraints

- Terse, evidence-led. Quote SERP titles when justifying a page recommendation.
- No traffic or ranking promises.
- Never recommend trademark-infringing or deceptive page titles. If a competitor-bidding tactic feels grey-area, flag it.
- If the SERPs are dominated by review sites the user can't out-rank cheaply, say so.
- End after the recommendations.`;

const InputSchema = z.object({
  competitors: z.array(z.string()).max(3).optional(),
  category: z.string().optional(),
  location_name: z.string().optional(),
  language_name: z.string().optional(),
});
type Input = z.infer<typeof InputSchema>;

function deriveBrand(siteUrl: string): string {
  return brandLabel(siteUrl);
}

const spec: Specialist<Input> = {
  id: "competitor-pages",
  name: "Competitor Pages",
  description:
    'Generates "X vs Y", alternatives-to-X, and feature-matrix page concepts from live competitor SERPs.',
  desk: "desk.competitor-pages",
  inputSchema: InputSchema,
  async execute(ctx) {
    const input = ctx.input;
    requireIntegrations(["dataforseo"]);
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    const brand = deriveBrand(manifest.site_under_audit);
    // Category default must NOT be the brand — that produces SERP queries like
    // "acmeoutdoors alternatives" which returns brand-named results instead of
    // a category competitive map. Prefer manifest.business_type, then a
    // generic noun, never the brand.
    // "unknown" is the minimal-intake placeholder — treat it as NO category.
    const businessType = manifest.business_type?.trim();
    const resolvedCategory =
      input.category?.trim() ||
      (businessType && businessType !== "unknown" ? businessType : "");
    const competitors = input.competitors?.slice(0, 3) ?? [];
    const { location_name, language_name } = resolveLocale(manifest, input);

    // Guard: never run SERP queries with an unresolved category. Without this,
    // a minimal-intake client (business_type still "unknown") produced literal
    // "unknown alternatives" / "best unknown" queries that returned dictionary
    // and movie results tagged as live_api evidence. Degrade cleanly so the
    // orchestrator review flags it (needs-follow-up) instead of poisoning the
    // brain with confidently-wrong competitor data.
    if (!resolvedCategory && competitors.length === 0) {
      const reason =
        `business_type is unresolved ("${manifest.business_type ?? "unset"}") and no ` +
        `category/competitors were provided — skipped the competitor SERP to avoid ` +
        `garbage "unknown alternatives" queries. Resolve business_type (or pass a ` +
        `category) and re-run.`;
      ctx.emit("log", `skipping competitor SERP: ${reason}`);
      const skip = await writeArtifact(
        ctx.clientSlug,
        manifest,
        {
          dir: "deliverables",
          type: "competitor-pages",
          frontmatterType: "deliverable",
          title: `Competitor comparison pages — ${manifest.site_under_audit}`,
          body: [
            "## Competitor pages — skipped (degraded)",
            "",
            reason,
            "",
            "No SERP queries ran, so no competitor evidence was written. Querying with an " +
              "unresolved business type returns irrelevant results (dictionaries, movies) that " +
              "would pollute the brain, so this specialist degraded instead.",
          ].join("\n"),
          tags: ["deliverable", "competitor-pages", "degraded"],
          confidence: "low",
          risk: "low",
        },
        {
          facts: ["Competitor-pages skipped: business_type unresolved."],
          threadTitle: "Competitor pages skipped",
          threadRationale: "resolve business_type or provide a category, then re-run",
          statusNote: "Competitor pages skipped — business_type unresolved.",
        },
      );
      return {
        summary: `Competitor pages skipped — ${reason}`,
        resultPath: skip.relativePath,
        executionResult: skip.executionResult,
        degraded: true,
        degradationReason: reason,
      };
    }

    const category = resolvedCategory || "products";

    // Build 2-3 cheap comparison queries.
    const queries = [
      `${category} alternatives`,
      `best ${category}`,
      ...(competitors.length > 0 ? [`${brand} vs ${competitors[0]}`] : []),
    ].slice(0, 3);

    const bridge = await runCompetitorMarketingBrainBridge(
      ctx,
      manifest.site_under_audit,
      queries,
    );

    ctx.emit("progress", `Pulling SERP for ${queries.length} comparison query(s)…`, {
      progress: 0.15,
    });

    const snapshots: Array<{
      query: string;
      cost: number;
      topResults: Array<{ rank: number; title: string; domain: string; description: string }>;
    }> = [];
    let totalCost = 0;
    for (const keyword of queries) {
      const json = await dataforseoPost<{
        items?: Array<{
          type?: string;
          rank_absolute?: number;
          title?: string;
          domain?: string;
          description?: string;
        }>;
      }>("/v3/serp/google/organic/live/regular", {
        keyword,
        location_name,
        language_name,
        depth: 10,
      });
      totalCost += json.cost ?? 0;
      const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
      const topResults = items
        .filter((i) => i.type === "organic")
        .slice(0, 10)
        .map((i, idx) => ({
          rank: i.rank_absolute ?? idx + 1,
          title: String(i.title ?? ""),
          domain: String(i.domain ?? ""),
          description: String(i.description ?? ""),
        }));
      snapshots.push({ query: keyword, cost: json.cost ?? 0, topResults });
    }

    ctx.emit("log", `DataForSEO cost: $${totalCost.toFixed(4)} across ${queries.length} SERP(s)`);

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.55 });

    const payload = {
      site: manifest.site_under_audit,
      brand,
      category,
      competitorsKnown: competitors,
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
          content: `Recommend competitor-comparison pages. Payload:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        },
      ],
    });

    ctx.emit(
      "log",
      `${provider.id}${result.model ? " · " + result.model : ""}${result.durationMs ? " · " + (result.durationMs / 1000).toFixed(1) + "s" : ""}${result.costUsd != null ? " · $" + result.costUsd.toFixed(4) : ""}`,
    );
    ctx.emit("progress", "Writing competitor-pages plan to vault…", { progress: 0.88 });

    const { relativePath, executionResult } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "deliverables",
        type: "competitor-pages",
        frontmatterType: "deliverable",
        title: `Competitor comparison pages — ${manifest.site_under_audit}`,
        body: result.text,
        tags: ["deliverable", "competitor-pages", "commercial-intent", "claude-generated"],
        costUsd: totalCost + (result.costUsd ?? 0),
      },
      {
        facts: [
          `Competitor-pages plan generated from ${queries.length} comparison SERP(s).`,
          `Brand derived as "${brand}"; category: "${category}".`,
          `DataForSEO cost: $${totalCost.toFixed(4)}.`,
        ],
        threadTitle: "Competitor pages",
        threadRationale: "pick the first 2 vs/alternatives pages to commission",
        statusNote: "Competitor-pages plan on file — pick the first 2 pages to commission briefs for.",
      },
    );

    const artifactLink = toWikiLink(relativePath);
    const landscapeRows = snapshots.flatMap((snapshot) =>
      snapshot.topResults.slice(0, 5).map((result) => ({
        query: snapshot.query,
        rank: result.rank,
        title: result.title,
        domain: result.domain,
      })),
    );
    const landscapeTable = [
      "| Query | Rank | Result | Domain |",
      "| --- | ---: | --- | --- |",
      ...landscapeRows.map(
        (row) =>
          `| ${escapeTable(row.query)} | ${row.rank} | ${escapeTable(row.title)} | ${escapeTable(row.domain)} |`,
      ),
    ].join("\n");
    const domains = [
      ...new Set(
        landscapeRows
          .map((row) => row.domain)
          .filter((domain) => domain && domain !== manifest.site_under_audit),
      ),
    ].slice(0, 12);

    await updateCanonicalNote(
      ctx.clientSlug,
      "wiki/sources/Competitor Landscape Cache.md",
      "competitor-landscape",
      [
        `Generated from ${queries.length} DataForSEO comparison SERP queries.`,
        bridge.artifactPaths.length
          ? `Marketing Brain competitor raw artifacts: ${bridge.artifactPaths.map((artifact) => `\`${artifact}\``).join(", ")}.`
          : `Marketing Brain competitor bridge did not produce raw artifacts: ${bridge.message ?? "no script output"}.`,
        "",
        landscapeTable,
        "",
        `Evidence: [[${artifactLink}]].`,
      ].join("\n"),
    );
    await updateCanonicalNote(
      ctx.clientSlug,
      "wiki/sources/Competitor Keyword Research Summary.md",
      "competitor-keywords",
      [
        "Comparison-query set used by the competitor-pages specialist.",
        "",
        ...queries.map((query) => `- ${query}`),
        "",
        ...(bridge.artifactPaths.length
          ? [
              "Marketing Brain raw exports:",
              ...bridge.artifactPaths.map((artifact) => `- ${artifact}`),
              "",
            ]
          : []),
        "",
        `Evidence: [[${artifactLink}]].`,
      ].join("\n"),
    );
    await updateCanonicalNote(
      ctx.clientSlug,
      "wiki/entities/Primary Competitors.md",
      "primary-competitors",
      [
        "Primary competitor domains observed in comparison SERPs.",
        "",
        ...(domains.length ? domains.map((domain) => `- ${domain}`) : ["- No competitor domains observed."]),
        "",
        `Evidence: [[${artifactLink}]].`,
      ].join("\n"),
    );

    return {
      summary: `Competitor pages plan written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      data: {
        brand,
        category,
        queries,
        dataforseoCostUsd: totalCost,
        marketingBrainBridge: bridge,
      },
      evidence: [
        {
          claim: bridge.completed
            ? `Competitor landscape was generated from live DataForSEO SERPs and Marketing Brain competitor keyword exports.`
            : `Competitor landscape was generated from ${queries.length} live DataForSEO SERP query(s); deeper Marketing Brain competitor keyword export is pending.`,
          provenance: "live_api",
          source_paths: [
            relativePath,
            "wiki/sources/Competitor Landscape Cache.md",
            "wiki/sources/Competitor Keyword Research Summary.md",
            "wiki/entities/Primary Competitors.md",
            ...bridge.artifactPaths,
          ],
          confidence: bridge.completed ? "high" : "medium",
          cost_usd: totalCost + (result.costUsd ?? 0),
        },
      ],
      degraded: !bridge.completed,
      ...(!bridge.completed
        ? {
            degradationReason:
              bridge.message ??
              "Marketing Brain competitor keyword export did not complete.",
          }
        : {}),
    };
  },
};

registerSpecialist(spec);
export default spec;

function toWikiLink(relativePath: string): string {
  return relativePath.replace(/^wiki\//, "").replace(/\.md$/, "");
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, "/").replace(/\n/g, " ").trim();
}

async function runCompetitorMarketingBrainBridge(
  ctx: SpecialistContext<Input>,
  siteUrl: string,
  seedQueries: string[],
): Promise<{ completed: boolean; artifactPaths: string[]; message?: string }> {
  const artifactPaths: string[] = [];
  try {
    ctx.emit("progress", "Running Marketing Brain competitor discovery…", {
      progress: 0.08,
    });
    const find = await runMarketingBrainScript(ctx.clientSlug, "find-competitors", {
      signal: ctx.signal,
      timeoutMs: 180_000,
      args: [
        "--site",
        siteUrl,
        "--seed-keywords",
        seedQueries.join(", "),
        "--top",
        "8",
        "--depth",
        "10",
        "--total-cap",
        "1.00",
      ],
      onLine: (line, stream) => ctx.emit("log", `[marketing-brain:${stream}] ${line}`),
    });
    if (find.status === "needs_data") {
      return { completed: false, artifactPaths, message: find.message };
    }
    artifactPaths.push(...latestRawDataForSeoFiles(ctx.clientSlug, /^competitors-\d{4}-\d{2}-\d{2}\.json$/));

    ctx.emit("progress", "Pulling Marketing Brain competitor keyword exports…", {
      progress: 0.12,
    });
    const pull = await runMarketingBrainScript(ctx.clientSlug, "pull-competitor-kw", {
      signal: ctx.signal,
      timeoutMs: 240_000,
      args: [
        "--site",
        siteUrl,
        "--limit-per-comp",
        "250",
        "--max-pages-per-comp",
        "1",
        "--total-cap",
        "2.00",
      ],
      onLine: (line, stream) => ctx.emit("log", `[marketing-brain:${stream}] ${line}`),
    });
    if (pull.status === "needs_data") {
      return { completed: false, artifactPaths, message: pull.message };
    }
    artifactPaths.push(
      ...latestRawDataForSeoFiles(
        ctx.clientSlug,
        /^(competitor-kw-|competitor-kw-summary-|site-ranked-keywords-).*\d{4}-\d{2}-\d{2}\.json$/,
      ),
    );

    return {
      completed: artifactPaths.length > 0,
      artifactPaths: [...new Set(artifactPaths)],
    };
  } catch (err) {
    return {
      completed: false,
      artifactPaths: [...new Set(artifactPaths)],
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function latestRawDataForSeoFiles(clientSlug: string, pattern: RegExp): string[] {
  const rawDir = path.join(vaultRoot(clientSlug), ".raw", "sources", "dataforseo");
  if (!fs.existsSync(rawDir)) return [];
  return fs
    .readdirSync(rawDir)
    .filter((name) => pattern.test(name))
    .sort()
    .map((name) => `.raw/sources/dataforseo/${name}`);
}
