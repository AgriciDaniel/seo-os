/**
 * Google Analytics 4 specialist — authenticated via gcloud ADC.
 *
 * Auto-discovers the GA4 property matching `manifest.site_under_audit`
 * (default URL match against accountSummaries), then pulls:
 *   1. Sessions / users / engaged sessions / conversions (28d total)
 *   2. Top landing pages (28d)
 *   3. Top traffic sources by sessionDefaultChannelGrouping (28d)
 *   4. Real-time active users
 *
 * Hands the bundle to the LLM provider for synthesis. Writes a Markdown
 * audit to the vault.
 */
import "server-only";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { adcFetchJson } from "@/lib/integrations/google-adc";
import { requireIntegrations } from "./_lib/availability";
import { writeArtifact } from "./_lib/artifact";
import { buildInlineChartBlock, sidecarRef } from "./_lib/structured-output";
import {
  safeParseReportData,
  type Ga4ReportData,
} from "./_lib/report-data";

const SYSTEM_PROMPT = `You are the GA4 specialist inside SEO Office.

You receive a JSON payload with: property metadata, last-28-day totals, top landing pages, top channel groupings, and a real-time snapshot. Quote actual numbers — never invent.

## Output contract

Produce a Markdown report with these sections, in order:

1. **Executive summary** — 3-5 bullets tagged \`[critical|high|medium|low|info]\`. Lead with the biggest week-over-week movement if computable, otherwise the channel with the most concerning conversion rate.
2. **Headline totals (28d)** — sessions, total users, engaged sessions, average engagement time, conversions. Provide the engagement rate and conversion rate as derived percentages.
3. **Top landing pages** — table with top 10 by sessions: landing page, sessions, engaged sessions, conversions. Flag pages with high sessions but engagement rate < 50% as UX-investigation candidates.
4. **Channel breakdown** — table by default channel grouping: sessions, engaged sessions, conversion rate. Identify the channel with the lowest engagement rate and the channel with the highest conversion rate.
5. **Real-time snapshot** — active users right now, top active landing pages.
6. **Recommendations** — exactly 5 numbered actions, each with title, one-sentence why, effort (S/M/L), impact (S/M/L). Sort by impact-per-effort.

## Constraints

- All numbers must come from the payload — don't pad with industry averages or hypothetical benchmarks.
- We have read-only scope; never recommend changes to GA4 configuration itself, only to the site that feeds it.
- If a section returned zero rows say so explicitly.
- End after the recommendations.`;

const InputSchema = z.object({
  /** Override the GA4 property ID (e.g. "properties/123456789"). Auto-discovered when omitted. */
  propertyId: z.string().optional(),
  /** Lookback days. GA4 supports 14 months max; we default to 28d. */
  days: z.number().int().min(1).max(420).default(28),
});
type Input = z.infer<typeof InputSchema>;

/* -------------------------------------------------------------------------- */
/* API types                                                                   */
/* -------------------------------------------------------------------------- */

interface PropertySummary {
  property?: string;
  displayName?: string;
  propertyType?: string;
  parent?: string;
}

interface AccountSummary {
  account?: string;
  displayName?: string;
  propertySummaries?: PropertySummary[];
}

interface ReportRow {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}

interface ReportResponse {
  dimensionHeaders?: Array<{ name?: string }>;
  metricHeaders?: Array<{ name?: string; type?: string }>;
  rows?: ReportRow[];
  rowCount?: number;
  metadata?: { currencyCode?: string; timeZone?: string };
}

interface PropertyMeta {
  name?: string;
  displayName?: string;
  industryCategory?: string;
  timeZone?: string;
  currencyCode?: string;
  createTime?: string;
  parent?: string;
  account?: string;
}

/* -------------------------------------------------------------------------- */
/* discovery                                                                   */
/* -------------------------------------------------------------------------- */

async function listAccountSummaries(): Promise<AccountSummary[]> {
  const j = await adcFetchJson<{ accountSummaries?: AccountSummary[] }>(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
  );
  return j.accountSummaries ?? [];
}

async function fetchPropertyMeta(propertyResourceName: string): Promise<PropertyMeta> {
  return adcFetchJson<PropertyMeta>(
    `https://analyticsadmin.googleapis.com/v1beta/${propertyResourceName}`,
  );
}

async function fetchDataStreamUrls(
  propertyResourceName: string,
): Promise<string[]> {
  const j = await adcFetchJson<{
    dataStreams?: Array<{ webStreamData?: { defaultUri?: string } }>;
  }>(
    `https://analyticsadmin.googleapis.com/v1beta/${propertyResourceName}/dataStreams`,
  );
  return (j.dataStreams ?? [])
    .map((s) => s.webStreamData?.defaultUri ?? "")
    .filter(Boolean);
}

/**
 * Pick the GA4 property whose web data-stream default URL matches the
 * client's site_under_audit. If none match, return the first available
 * property and surface a warning in the report payload.
 */
async function discoverProperty(
  siteUnderAudit: string,
): Promise<{ propertyId: string; matched: boolean; reason?: string } | null> {
  const summaries = await listAccountSummaries();
  const allProps = summaries
    .flatMap((s) => s.propertySummaries ?? [])
    .filter((p) => p.property && p.propertyType !== "PROPERTY_TYPE_SUBPROPERTY");
  if (allProps.length === 0) return null;

  let target: URL | null = null;
  try {
    target = new URL(siteUnderAudit);
  } catch {
    target = null;
  }
  const targetHost = target ? target.host.replace(/^www\./, "") : "";

  // Walk properties, checking data-stream default URIs. This is O(properties)
  // ADC calls; capped at 25 to bound the cost.
  const candidates = allProps.slice(0, 25);
  for (const p of candidates) {
    if (!p.property) continue;
    try {
      const uris = await fetchDataStreamUrls(p.property);
      for (const u of uris) {
        try {
          const host = new URL(u).host.replace(/^www\./, "");
          if (host && targetHost && host === targetHost) {
            return { propertyId: p.property, matched: true };
          }
        } catch {
          // skip malformed URI
        }
      }
    } catch {
      // skip properties we can't enumerate
    }
  }

  const fallback = allProps[0]?.property;
  if (!fallback) return null;
  return {
    propertyId: fallback,
    matched: false,
    reason: `No GA4 property's data stream matched "${siteUnderAudit}". Using "${fallback}" as fallback — set the property ID explicitly to override.`,
  };
}

/* -------------------------------------------------------------------------- */
/* reports                                                                     */
/* -------------------------------------------------------------------------- */

function dateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

async function runReport(
  propertyResourceName: string,
  body: object,
): Promise<ReportResponse> {
  return adcFetchJson<ReportResponse>(
    `https://analyticsdata.googleapis.com/v1beta/${propertyResourceName}:runReport`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

async function runRealtimeReport(
  propertyResourceName: string,
  body: object,
): Promise<ReportResponse> {
  return adcFetchJson<ReportResponse>(
    `https://analyticsdata.googleapis.com/v1beta/${propertyResourceName}:runRealtimeReport`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

/* -------------------------------------------------------------------------- */
/* specialist                                                                  */
/* -------------------------------------------------------------------------- */

const ga4: Specialist<Input> = {
  id: "google-analytics",
  name: "Google Analytics 4",
  description:
    "GA4 traffic, landing pages, channel breakdown, and real-time snapshot, authenticated via gcloud ADC.",
  desk: "desk.ga4",
  inputSchema: InputSchema,
  async execute(ctx) {
    const input = ctx.input;
    requireIntegrations(["ga4"]);
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    let propertyResource = input.propertyId ?? "";
    let propertyMatchReason: string | undefined;
    let propertyMatched = true;

    if (!propertyResource) {
      ctx.emit("progress", "Discovering GA4 property…", { progress: 0.05 });
      const discovery = await discoverProperty(manifest.site_under_audit);
      if (!discovery) {
        throw new Error(
          "No GA4 properties are accessible on this Google account. " +
            "Either grant the signed-in user GA4 access for the property or pass propertyId explicitly.",
        );
      }
      propertyResource = discovery.propertyId;
      propertyMatched = discovery.matched;
      propertyMatchReason = discovery.reason;
    } else if (!propertyResource.startsWith("properties/")) {
      propertyResource = `properties/${propertyResource}`;
    }

    ctx.emit("log", `GA4 property: ${propertyResource}${propertyMatched ? "" : " (fallback)"}`);

    const range = dateRange(input.days);

    ctx.emit("progress", "Pulling totals, landing pages, channels, real-time…", {
      progress: 0.25,
    });

    const [meta, totals, landingPages, channels, realtime] = await Promise.all([
      fetchPropertyMeta(propertyResource).catch(() => ({}) as PropertyMeta),
      runReport(propertyResource, {
        dateRanges: [range],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "engagedSessions" },
          { name: "averageSessionDuration" },
          { name: "conversions" },
        ],
      }),
      runReport(propertyResource, {
        dateRanges: [range],
        dimensions: [{ name: "landingPage" }],
        metrics: [
          { name: "sessions" },
          { name: "engagedSessions" },
          { name: "conversions" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: "10",
      }),
      runReport(propertyResource, {
        dateRanges: [range],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [
          { name: "sessions" },
          { name: "engagedSessions" },
          { name: "conversions" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: "15",
      }),
      runRealtimeReport(propertyResource, {
        dimensions: [{ name: "unifiedScreenName" }],
        metrics: [{ name: "activeUsers" }],
        limit: "10",
      }).catch((err) => ({ warning: err instanceof Error ? err.message : String(err) })),
    ]);

    const totalSessions = Number(totals.rows?.[0]?.metricValues?.[0]?.value ?? "0");
    const totalUsers = Number(totals.rows?.[0]?.metricValues?.[1]?.value ?? "0");
    ctx.emit("log", `28d totals — sessions: ${totalSessions.toLocaleString()}, users: ${totalUsers.toLocaleString()}`);

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.75 });

    const payload = {
      propertyResource,
      propertyMatched,
      propertyMatchReason,
      property: meta,
      lookback: { ...range, days: input.days },
      totals,
      landingPages,
      channels,
      realtime,
    };

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 4000,
      temperature: 0.3,
      messages: [
        {
          role: "user",
          content: `GA4 payload:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        },
      ],
    });

    ctx.emit("progress", "Writing GA4 audit to vault…", { progress: 0.92 });

    // Pull GA4 totals from the metricHeaders/metricValues — field order in
    // the request was: sessions, totalUsers, engagedSessions, avgSessionDuration, conversions.
    const totalsRow = totals.rows?.[0];
    const totalsByName = new Map<string, number>();
    (totals.metricHeaders ?? []).forEach((h, i) => {
      const name = h.name ?? "";
      const raw = totalsRow?.metricValues?.[i]?.value ?? "0";
      const n = Number(raw);
      totalsByName.set(name, Number.isFinite(n) ? Math.max(0, n) : 0);
    });
    const totalsUsers = Math.round(
      totalsByName.get("totalUsers") ??
        totalsByName.get("activeUsers") ??
        totalsByName.get("users") ??
        0,
    );
    const totalsSessions = Math.round(totalsByName.get("sessions") ?? 0);
    const totalsEngaged = Math.round(totalsByName.get("engagedSessions") ?? 0);
    const totalsConversions = Math.round(totalsByName.get("conversions") ?? 0);

    const channelsData = (channels.rows ?? [])
      .slice(0, 15)
      .map((row) => ({
        label: row.dimensionValues?.[0]?.value ?? "(unknown)",
        value: Math.max(0, Number(row.metricValues?.[0]?.value ?? "0") || 0),
      }))
      .filter((c) => c.label.length > 0);

    const landingPagesData = (landingPages.rows ?? [])
      .slice(0, 25)
      .map((row) => ({
        path: row.dimensionValues?.[0]?.value ?? "",
        sessions: Math.max(
          0,
          Math.round(Number(row.metricValues?.[0]?.value ?? "0") || 0),
        ),
      }))
      .filter((p) => p.path.length > 0);

    // realtime may be a ReportResponse or a `{ warning: string }` from the catch.
    const realtimeRows =
      realtime && typeof realtime === "object" && "rows" in realtime
        ? ((realtime as ReportResponse).rows ?? [])
        : [];
    const realtimeUsers = realtimeRows.reduce((acc, row) => {
      const n = Number(row.metricValues?.[0]?.value ?? "0");
      return acc + (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
    }, 0);

    const today = new Date().toISOString().slice(0, 10);
    const candidate: Ga4ReportData = {
      kind: "ga4-report",
      v: 1,
      property_id: propertyResource,
      totals: {
        users: totalsUsers,
        sessions: totalsSessions,
        engaged_sessions: totalsEngaged,
        conversions: totalsConversions,
      },
      channels: channelsData,
      landing_pages: landingPagesData,
      ...(realtimeUsers > 0 ? { realtime_users: realtimeUsers } : {}),
      signals: [],
    };
    const validated = safeParseReportData(candidate);
    const data = validated && validated.kind === "ga4-report" ? validated : null;
    if (data) {
      ctx.emit(
        "log",
        `Structured data parsed: ${data.channels.length} channels, ${data.landing_pages.length} landing pages, totals u=${data.totals.users} s=${data.totals.sessions}`,
      );
    } else {
      ctx.emit("log", "GA4 data failed schema validation — skipping sidecar + report");
    }

    const bodyWithChart = data
      ? `${buildInlineChartBlock({
          type: "donut",
          title: "Sessions by channel",
          ref: sidecarRef(today, "google-analytics"),
          field: "channels",
          data: data.channels,
        })}\n\n${result.text}`
      : result.text;

    const { relativePath, executionResult, reportPath, dataPath } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "google-analytics",
        frontmatterType: "audit",
        title: `GA4 audit — ${manifest.site_under_audit}`,
        body: bodyWithChart,
        tags: ["audit", "ga4", "google", "claude-generated"],
        url: manifest.site_under_audit,
        reportSubtitle: data
          ? `${data.totals.sessions.toLocaleString()} sessions · ${data.totals.users.toLocaleString()} users · ${input.days}d`
          : undefined,
        ...(data ? { data } : {}),
        costUsd: result.costUsd ?? 0,
      },
      {
        facts: [
          `GA4 audit run on ${propertyResource} (${input.days}d).`,
          `Sessions: ${totalSessions.toLocaleString()} · Users: ${totalUsers.toLocaleString()}.`,
          propertyMatched
            ? "Property auto-matched to client site."
            : `Property fallback used — ${propertyMatchReason ?? "no URL match"}.`,
        ],
        threadTitle: "GA4 audit",
        threadRationale:
          "act on the highest-impact recommendation, re-measure in 28d",
        statusNote: `GA4: ${totalSessions.toLocaleString()} sessions / ${totalUsers.toLocaleString()} users in last ${input.days}d.`,
      },
    );

    return {
      summary: reportPath
        ? `GA4 audit written to ${relativePath} (report: ${reportPath})`
        : `GA4 audit written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      ...(reportPath ? { reportPath } : {}),
      ...(dataPath ? { dataPath } : {}),
      data: {
        propertyResource,
        propertyMatched,
        lookbackDays: input.days,
        sessions: totalSessions,
        users: totalUsers,
        ...(data ? { structured: data } : {}),
      },
    };
  },
};

registerSpecialist(ga4);
export default ga4;
