/**
 * Google Search Console specialist — authenticated via gcloud ADC.
 *
 * Pulls four signals for the client's site_under_audit:
 *   1. Sites list (sanity check that the user owns the property)
 *   2. Search Analytics — top queries + top pages, last 28 days
 *   3. Sitemap status
 *   4. URL inspection on the homepage (indexation + mobile + rich results)
 *
 * Hands the bundle to the LLM provider for synthesis. Writes a Markdown
 * audit to the vault with the same shape as google-suite.
 */
import "server-only";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { adcFetchJson } from "@/lib/integrations/google-adc";
import { requireIntegrations } from "./_lib/availability";
import { SoftSkipError } from "./_lib/soft-skip";
import { writeArtifact } from "./_lib/artifact";
import { buildInlineChartBlock, sidecarRef } from "./_lib/structured-output";
import {
  safeParseReportData,
  type SearchConsoleReportData,
} from "./_lib/report-data";

const SYSTEM_PROMPT = `You are the Search Console specialist inside SEO Office.

You receive a JSON payload with: site verification, top queries (28d), top pages (28d), submitted sitemaps, and a homepage URL inspection. Search Console is the ground truth for how Google sees a site — quote actual numbers from it, never invent.

## Output contract

Produce a Markdown report with these sections, in order:

1. **Executive summary** — 3-5 bullets tagged \`[critical|high|medium|low|info]\`. Lead with whichever signal is most actionable (indexation issue > rich-result loss > query opportunity).
2. **Indexation** — verdict from URL inspection. If \`indexStatusResult.verdict\` is anything other than PASS, lead with the exact reason and the user action. Note last crawl + page fetch state.
3. **Top queries (28d)** — table with top 10 queries by clicks: query, clicks, impressions, CTR, position. Flag any query with high impressions + low CTR (CTR < 2% and impressions > 100) as title/meta opportunities.
4. **Top pages (28d)** — table with top 10 pages by clicks: page path, clicks, impressions, CTR. Flag pages with high impressions but position > 10 as ranking opportunities.
5. **Sitemap health** — for each sitemap: path, last submitted, last downloaded, errors, warnings. If a sitemap has errors > 0 lead with that.
6. **Rich results** — list any rich-result types Google detected on the homepage. If none, suggest the most relevant schema type for the page based on signals in the payload.
7. **Recommendations** — exactly 5 numbered actions, each with title, one-sentence why, effort (S/M/L), impact (S/M/L). Sort by impact-per-effort.

## Constraints

- Quote actual numbers from the payload, not generic advice.
- Don't recommend anything that requires write access (e.g. "submit sitemap X") — we have read-only scope.
- If Search Console returned an empty result for a section, say so explicitly; don't pad with speculation.
- End after the recommendations.`;

const InputSchema = z.object({
  /** Override the site URL (defaults to manifest.site_under_audit). */
  siteUrl: z.string().optional(),
  /** Override the URL to inspect (defaults to the site root). */
  urlToInspect: z.string().optional(),
  /** Lookback days. Search Console capped at 16 months; we default to 28d. */
  days: z.number().int().min(1).max(490).default(28),
});
type Input = z.infer<typeof InputSchema>;

/* -------------------------------------------------------------------------- */
/* API calls                                                                   */
/* -------------------------------------------------------------------------- */

interface SiteEntry {
  siteUrl?: string;
  permissionLevel?: string;
}

interface SearchAnalyticsRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

interface SitemapEntry {
  path?: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  errors?: string | number;
  warnings?: string | number;
  contents?: Array<{ type?: string; submitted?: string; indexed?: string }>;
}

interface InspectionResult {
  inspectionResult?: {
    indexStatusResult?: {
      verdict?: string;
      coverageState?: string;
      robotsTxtState?: string;
      indexingState?: string;
      lastCrawlTime?: string;
      pageFetchState?: string;
      googleCanonical?: string;
      userCanonical?: string;
      crawledAs?: string;
    };
    mobileUsabilityResult?: { verdict?: string; issues?: Array<{ issueType?: string; severity?: string; message?: string }> };
    richResultsResult?: { verdict?: string; detectedItems?: Array<{ richResultType?: string }> };
  };
}

async function fetchSites(): Promise<SiteEntry[]> {
  const j = await adcFetchJson<{ siteEntry?: SiteEntry[] }>(
    "https://www.googleapis.com/webmasters/v3/sites",
  );
  return j.siteEntry ?? [];
}

async function fetchAnalytics(
  siteUrl: string,
  days: number,
  dimensions: Array<"query" | "page" | "country" | "device" | "searchAppearance" | "date">,
  rowLimit = 25,
): Promise<SearchAnalyticsRow[]> {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - days);
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);

  const body = {
    startDate: isoDate(start),
    endDate: isoDate(end),
    dimensions,
    rowLimit,
    dataState: "all",
  };
  const j = await adcFetchJson<{ rows?: SearchAnalyticsRow[] }>(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return j.rows ?? [];
}

async function fetchSitemaps(siteUrl: string): Promise<SitemapEntry[]> {
  const j = await adcFetchJson<{ sitemap?: SitemapEntry[] }>(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps`,
  );
  return j.sitemap ?? [];
}

async function fetchInspection(
  siteUrl: string,
  urlToInspect: string,
): Promise<InspectionResult> {
  return adcFetchJson<InspectionResult>(
    "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteUrl,
        inspectionUrl: urlToInspect,
      }),
    },
  );
}

/* -------------------------------------------------------------------------- */
/* utilities                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Search Console accepts both "https://example.com/" (URL-prefix property)
 * and "sc-domain:example.com" (domain property). We try to pick whichever
 * variant the user actually owns.
 */
function resolveSiteUrl(candidate: string, owned: SiteEntry[]): string | null {
  const candidates = ownedCandidates(candidate);
  const ownedUrls = new Set(
    owned
      .filter((s) => s.permissionLevel && s.permissionLevel !== "siteUnverifiedUser")
      .map((s) => s.siteUrl ?? ""),
  );
  for (const c of candidates) {
    if (ownedUrls.has(c)) return c;
  }
  // If nothing matches exactly, return the first owned URL — better to fail
  // explicitly than silently audit the wrong property.
  return null;
}

function ownedCandidates(siteUrl: string): string[] {
  try {
    const u = new URL(siteUrl);
    const origin = `${u.protocol}//${u.host}/`;
    const host = u.host;
    const bare = host.replace(/^www\./, "");
    return [
      origin,
      `https://${host}/`,
      `http://${host}/`,
      `https://www.${bare}/`,
      `http://www.${bare}/`,
      `sc-domain:${bare}`,
      `sc-domain:${host}`,
    ];
  } catch {
    return [siteUrl];
  }
}

/* -------------------------------------------------------------------------- */
/* specialist                                                                  */
/* -------------------------------------------------------------------------- */

const searchConsole: Specialist<Input> = {
  id: "google-search-console",
  name: "Search Console",
  description:
    "Search Console signals authenticated via gcloud ADC: top queries, top pages, sitemap status, URL inspection.",
  desk: "desk.search-console",
  inputSchema: InputSchema,
  async execute(ctx) {
    const input = ctx.input;
    requireIntegrations(["search-console"]);
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    const requestedSite = input.siteUrl ?? manifest.site_under_audit;

    ctx.emit("progress", "Verifying Search Console property…", { progress: 0.05 });
    const sites = await fetchSites();
    const siteUrl = resolveSiteUrl(requestedSite, sites);
    if (!siteUrl) {
      const owned = sites
        .map((s) => s.siteUrl ?? "")
        .filter(Boolean)
        .join(", ");
      // Soft-skip — the integration IS configured (gcloud signed in,
      // sites list fetched successfully) but the active client's site
      // isn't in the verified-properties list for this Google account.
      // That's an ownership-proof gap, not a system failure: the user
      // needs to either add the property in Search Console OR switch
      // to an account that already verified it. Either way, retrying
      // without that action won't help — so we route this through the
      // soft-skip path (yellow ⊘, no HEALTH penalty, next-action card
      // recommends the property-add link instead of "retry").
      throw new SoftSkipError(
        `No verified Search Console property matches "${requestedSite}". ` +
          (owned
            ? `Properties you own: ${owned}. `
            : "You don't have any verified properties on this Google account. ") +
          "Add the property at search.google.com/search-console then retry.",
        { kind: "gsc-property-unverified", tag: "PropertyNotVerified" },
      );
    }

    const urlToInspect =
      input.urlToInspect ??
      (siteUrl.startsWith("sc-domain:")
        ? `https://${siteUrl.replace(/^sc-domain:/, "")}/`
        : siteUrl);

    ctx.emit("progress", "Pulling queries, pages, sitemaps, URL inspection…", {
      progress: 0.2,
    });
    const [queries, pages, sitemaps, inspection, dailyTrend] = await Promise.all([
      fetchAnalytics(siteUrl, input.days, ["query"]),
      fetchAnalytics(siteUrl, input.days, ["page"]),
      fetchSitemaps(siteUrl),
      fetchInspection(siteUrl, urlToInspect),
      fetchAnalytics(siteUrl, input.days, ["date"], 90).catch(() => [] as SearchAnalyticsRow[]),
    ]);

    const indexVerdict =
      inspection.inspectionResult?.indexStatusResult?.verdict ?? "UNKNOWN";
    ctx.emit("log", `Indexation verdict: ${indexVerdict}`);
    ctx.emit("log", `Queries: ${queries.length} · Pages: ${pages.length} · Sitemaps: ${sitemaps.length}`);

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.7 });

    const payload = {
      siteUrl,
      lookbackDays: input.days,
      sitesList: sites.map((s) => ({
        siteUrl: s.siteUrl,
        permissionLevel: s.permissionLevel,
      })),
      topQueries: queries,
      topPages: pages,
      sitemaps,
      inspection,
    };

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 4000,
      temperature: 0.3,
      messages: [
        {
          role: "user",
          content: `Search Console payload:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        },
      ],
    });

    ctx.emit("progress", "Writing Search Console audit to vault…", { progress: 0.92 });
    const totalClicks = queries.reduce((acc, q) => acc + (q.clicks ?? 0), 0);
    const totalImpr = queries.reduce((acc, q) => acc + (q.impressions ?? 0), 0);

    // Assemble typed sidecar payload directly from API responses.
    const today = new Date().toISOString().slice(0, 10);
    const candidate: SearchConsoleReportData = {
      kind: "search-console-report",
      v: 1,
      site_url: siteUrl,
      top_queries: queries
        .slice(0, 25)
        .map((q) => ({
          query: q.keys?.[0] ?? "",
          clicks: Math.max(0, Math.round(q.clicks ?? 0)),
          impressions: Math.max(0, Math.round(q.impressions ?? 0)),
          ctr: Math.max(0, Math.min(1, q.ctr ?? 0)),
          position: Math.max(0, q.position ?? 0),
        }))
        .filter((q) => q.query.length > 0),
      top_pages: pages
        .slice(0, 25)
        .map((p) => ({
          url: p.keys?.[0] ?? "",
          clicks: Math.max(0, Math.round(p.clicks ?? 0)),
          impressions: Math.max(0, Math.round(p.impressions ?? 0)),
        }))
        .filter((p) => p.url.length > 0),
      trend: dailyTrend
        .slice(0, 90)
        .map((row) => ({
          date: row.keys?.[0] ?? "",
          clicks: Math.max(0, Math.round(row.clicks ?? 0)),
        }))
        .filter((row) => row.date.length > 0)
        .sort((a, b) => a.date.localeCompare(b.date)),
      signals: [],
    };
    const validated = safeParseReportData(candidate);
    const data =
      validated && validated.kind === "search-console-report" ? validated : null;
    if (data) {
      ctx.emit(
        "log",
        `Structured data parsed: ${data.top_queries.length} queries, ${data.top_pages.length} pages, ${data.trend.length} trend points`,
      );
    } else {
      ctx.emit("log", "Search Console data failed schema validation — skipping sidecar + report");
    }

    const bodyWithChart = data
      ? `${buildInlineChartBlock({
          type: "bar",
          title: "Top queries by clicks",
          ref: sidecarRef(today, "search-console"),
          field: "top_queries",
          data: data.top_queries
            .slice(0, 10)
            .map((q) => ({ category: q.query, count: q.clicks })),
        })}\n\n${result.text}`
      : result.text;

    const { relativePath, executionResult, reportPath, dataPath } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "search-console",
        frontmatterType: "audit",
        title: `Search Console audit — ${siteUrl}`,
        body: bodyWithChart,
        tags: ["audit", "search-console", "google", "claude-generated"],
        url: urlToInspect,
        reportSubtitle: data
          ? `${data.top_queries.length} queries · ${data.top_pages.length} pages · ${input.days}d lookback`
          : undefined,
        ...(data ? { data } : {}),
        costUsd: result.costUsd ?? 0,
      },
      {
        facts: [
          `Search Console audit run on ${siteUrl} (${input.days}d). Verdict: ${indexVerdict}.`,
          `Top-query totals: ${totalClicks.toLocaleString()} clicks, ${totalImpr.toLocaleString()} impressions across ${queries.length} queries.`,
          `Sitemaps known to Google: ${sitemaps.length}.`,
        ],
        threadTitle: "Search Console audit",
        threadRationale:
          "act on the highest-impact recommendation, re-measure in 28d",
        statusNote: indexVerdict === "PASS"
          ? "Indexation healthy per latest URL inspection."
          : `Indexation verdict: ${indexVerdict} — review report.`,
      },
    );

    return {
      summary: reportPath
        ? `Search Console audit written to ${relativePath} (report: ${reportPath})`
        : `Search Console audit written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      ...(reportPath ? { reportPath } : {}),
      ...(dataPath ? { dataPath } : {}),
      data: {
        siteUrl,
        lookbackDays: input.days,
        indexVerdict,
        topQueryCount: queries.length,
        topPageCount: pages.length,
        sitemapCount: sitemaps.length,
        ...(data ? { structured: data } : {}),
      },
    };
  },
};

registerSpecialist(searchConsole);
export default searchConsole;
