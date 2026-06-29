/**
 * Self-contained HTML report generator.
 *
 * `renderHtmlReport(data, prose, meta)` returns a complete `<!DOCTYPE html>`
 * document. No external CSS, no JS, no fonts — fully portable, prints
 * cleanly, opens in any browser tab. The dark theme matches the office
 * palette so the experience is continuous when the user clicks "Open
 * Report ↗" from the inbox.
 *
 * Pattern is borrowed from `vendored/claude-seo/scripts/drift_report.py`
 * which proved this format works.
 */
import "server-only";

import {
  barChartSvg,
  donutChartSvg,
  radarChartSvg,
  severityHistogramSvg,
  sparklineSvg,
  CHART_PALETTE,
} from "@/lib/reports/svg-charts";
import type { ReportData, Severity, Signal } from "@/lib/specialists/_lib/report-data";

export interface ReportMeta {
  title: string;
  subtitle?: string;
  /** ISO date string for the generated-on stamp. */
  date: string;
  clientName?: string;
  url?: string;
}

export function renderHtmlReport(
  data: ReportData,
  prose: string,
  meta: ReportMeta,
): string {
  const css = baseCss();
  const emptyState = renderEmptyDataCallout(data);
  const charts = renderCharts(data);
  const signalsTable = renderSignalsTable(data);
  const proseHtml = renderProseAsHtml(prose);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>${escapeHtml(meta.title)} — SEO Office</title>
  <style>${css}</style>
</head>
<body>
  <header class="report-header">
    <div class="header-tag">SEO Office · ${escapeHtml(data.kind)} report</div>
    <h1>${escapeHtml(meta.title)}</h1>
    ${meta.subtitle ? `<p class="subtitle">${escapeHtml(meta.subtitle)}</p>` : ""}
    <div class="header-meta">
      ${meta.clientName ? `<span><span class="dim">Client</span> · ${escapeHtml(meta.clientName)}</span>` : ""}
      ${meta.url ? `<span><span class="dim">URL</span> · <a href="${escapeHtml(meta.url)}" rel="noopener noreferrer">${escapeHtml(meta.url)}</a></span>` : ""}
      <span><span class="dim">Generated</span> · ${escapeHtml(meta.date)}</span>
    </div>
  </header>

  ${emptyState}

  ${charts ? `<section class="charts">${charts}</section>` : ""}

  ${signalsTable ? `<section class="signals"><h2>Findings</h2>${signalsTable}</section>` : ""}

  <section class="prose">
    <h2>Detailed report</h2>
    ${proseHtml}
  </section>

  <footer class="report-footer">
    <p>Rendered locally by SEO Office · No external resources loaded.</p>
  </footer>
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/* charts per kind                                                             */
/* -------------------------------------------------------------------------- */

function renderCharts(data: ReportData): string {
  switch (data.kind) {
    case "technical-audit": {
      const radar = radarChartSvg({
        title: "Technical health",
        data: [
          { label: "Crawl", value: data.scores.crawl ?? 0 },
          { label: "Index", value: data.scores.index ?? 0 },
          { label: "Mobile", value: data.scores.mobile ?? 0 },
          { label: "CWV", value: data.scores.cwv ?? 0 },
          { label: "Schema", value: data.scores.schema ?? 0 },
        ],
      });
      const sev = severityHistogramSvg(data.severity_counts);
      return chartGrid([sev, radar]);
    }
    case "content-audit": {
      const radar = radarChartSvg({
        title: "E-E-A-T signals",
        data: [
          { label: "Experience", value: data.eeat.experience },
          { label: "Expertise", value: data.eeat.expertise },
          { label: "Authority", value: data.eeat.authoritativeness },
          { label: "Trust", value: data.eeat.trust },
        ],
        fill: CHART_PALETTE.emerald,
      });
      const intent = donutChartSvg({
        title: "Search intent mix",
        data: data.intent_mix,
      });
      const sev = severityHistogramSvg({ ...data.severity_counts });
      return chartGrid([radar, intent, sev]);
    }
    case "keyword-research": {
      const top = barChartSvg({
        title: "Top keywords by monthly volume",
        data: data.top_keywords.slice(0, 12).map((k) => ({
          category: k.keyword,
          count: k.volume,
        })),
        height: 320,
      });
      const intent = donutChartSvg({
        title: "Intent mix",
        data: data.intent_mix,
      });
      return chartGrid([top, intent]);
    }
    case "schema-validation": {
      const valid = barChartSvg({
        title: "Schema entities — valid vs invalid",
        data: data.entities.flatMap((e) => [
          { category: `${e.type} ✓`, count: e.valid },
          { category: `${e.type} ✗`, count: e.invalid },
        ]),
        colorByCategory: data.entities.reduce<Record<string, string>>(
          (acc, e) => ({
            ...acc,
            [`${e.type} ✓`]: CHART_PALETTE.low,
            [`${e.type} ✗`]: CHART_PALETTE.high,
          }),
          {},
        ),
      });
      return chartGrid([valid]);
    }
    case "backlinks": {
      if (data.dr_distribution.length === 0 && data.top_domains.length === 0) {
        return "";
      }
      const dr = barChartSvg({
        title: "DR distribution",
        data: data.dr_distribution.map((b) => ({
          category: b.bin,
          count: b.count,
        })),
      });
      const top = barChartSvg({
        title: "Top referring domains",
        data: data.top_domains.slice(0, 10).map((d) => ({
          category: d.domain,
          count: d.links,
        })),
      });
      return chartGrid([dr, top]);
    }
    case "local-presence": {
      // GBP completeness as a 2-slice donut (filled vs remaining of 100).
      // Easier to read at a glance than a horizontal-bar "gauge" and reuses
      // the donut primitive we already have.
      const gauge = donutChartSvg({
        title: "GBP completeness",
        data: [
          { label: "Complete", value: data.gbp_completeness },
          { label: "Remaining", value: Math.max(0, 100 - data.gbp_completeness) },
        ],
      });
      // Aggregate NAP signals into a 3-bar consistency chart so the user
      // sees citation health at a glance even when nap_signals[] is long.
      const buckets = { match: 0, mismatch: 0, missing: 0 };
      for (const sig of data.nap_signals) buckets[sig.status]++;
      const nap = barChartSvg({
        title: "NAP consistency across citations",
        data: [
          { category: "match", count: buckets.match },
          { category: "mismatch", count: buckets.mismatch },
          { category: "missing", count: buckets.missing },
        ],
        colorByCategory: {
          match: CHART_PALETTE.low,
          mismatch: CHART_PALETTE.high,
          missing: CHART_PALETTE.medium,
        },
      });
      return chartGrid([gauge, nap]);
    }
    case "page-speed": {
      // Three side-by-side bar charts (one per Core Web Vital), each
      // comparing mobile vs desktop. Mixing the scales (LCP ms, INP ms,
      // CLS unitless) on one chart would compress CLS into nothing.
      const lcp = barChartSvg({
        title: "Largest Contentful Paint (ms)",
        data: [
          { category: "mobile", count: Math.round(data.cwv.mobile.lcp_ms) },
          { category: "desktop", count: Math.round(data.cwv.desktop.lcp_ms) },
        ],
      });
      const inp = barChartSvg({
        title: "Interaction to Next Paint (ms)",
        data: [
          { category: "mobile", count: Math.round(data.cwv.mobile.inp_ms) },
          { category: "desktop", count: Math.round(data.cwv.desktop.inp_ms) },
        ],
      });
      // CLS is a 0–1 ratio. Scale by 1000 so the bar primitive (integer
      // counts) can render it meaningfully; the label still shows the
      // unscaled value via the title.
      const cls = barChartSvg({
        title: "Cumulative Layout Shift (×1000)",
        data: [
          { category: "mobile", count: Math.round(data.cwv.mobile.cls * 1000) },
          { category: "desktop", count: Math.round(data.cwv.desktop.cls * 1000) },
        ],
      });
      const charts = [lcp, inp, cls];
      if (typeof data.lighthouse_score === "number") {
        charts.unshift(
          donutChartSvg({
            title: "Lighthouse score",
            data: [
              { label: "Score", value: data.lighthouse_score },
              { label: "Gap", value: Math.max(0, 100 - data.lighthouse_score) },
            ],
          }),
        );
      }
      return chartGrid(charts);
    }
    case "sxo-scoring": {
      const personas = barChartSvg({
        title: "Persona experience scores",
        data: data.personas.map((p) => ({
          category: p.name,
          count: Math.round(p.score),
        })),
      });
      return chartGrid([personas]);
    }
    case "page-analysis": {
      return chartGrid([severityHistogramSvg(data.severity_counts)]);
    }
    case "sitemap-validation": {
      const templates = barChartSvg({
        title: "Entries per template",
        data: data.templates.map((t) => ({
          category: t.name,
          count: t.count,
        })),
      });
      // Gate results as a 2-bar pass/fail bin.
      const passCount = data.gate_results.filter((g) => g.pass).length;
      const failCount = data.gate_results.length - passCount;
      const gates = barChartSvg({
        title: "Quality gates",
        data: [
          { category: "pass", count: passCount },
          { category: "fail", count: failCount },
        ],
        colorByCategory: {
          pass: CHART_PALETTE.low,
          fail: CHART_PALETTE.high,
        },
      });
      return chartGrid([templates, gates]);
    }
    case "search-console-report": {
      const queries = barChartSvg({
        title: "Top queries by clicks",
        data: data.top_queries.slice(0, 10).map((q) => ({
          category: q.query,
          count: q.clicks,
        })),
        height: 320,
      });
      const pages = barChartSvg({
        title: "Top pages by clicks",
        data: data.top_pages.slice(0, 10).map((p) => ({
          category: shortUrl(p.url),
          count: p.clicks,
        })),
        height: 320,
      });
      const trend = sparklineSvg({
        title: "Daily clicks (28d)",
        values: data.trend.map((t) => t.clicks),
        height: 120,
      });
      return chartGrid([queries, pages, trend]);
    }
    case "ga4-report": {
      const hasTrafficData =
        data.totals.sessions > 0 ||
        data.totals.users > 0 ||
        data.channels.length > 0 ||
        data.landing_pages.length > 0 ||
        (data.realtime_users ?? 0) > 0;
      const kpiStrip = renderGa4KpiStrip(data);
      if (!hasTrafficData) return kpiStrip;
      const channels = donutChartSvg({
        title: "Sessions by channel",
        data: data.channels,
      });
      const landings = barChartSvg({
        title: "Top landing pages by sessions",
        data: data.landing_pages.slice(0, 10).map((p) => ({
          category: shortUrl(p.path),
          count: p.sessions,
        })),
        height: 320,
      });
      return `${kpiStrip}${chartGrid([channels, landings])}`;
    }
    default:
      return "";
  }
}

function renderEmptyDataCallout(data: ReportData): string {
  if (data.kind === "ga4-report") {
    const hasTrafficData =
      data.totals.sessions > 0 ||
      data.totals.users > 0 ||
      data.channels.length > 0 ||
      data.landing_pages.length > 0 ||
      (data.realtime_users ?? 0) > 0;
    if (!hasTrafficData) {
      return `<section class="report-callout report-callout-warn">
        <p class="callout-label">Data unavailable</p>
        <h2>GA4 returned no usable traffic rows</h2>
        <p>The report is not empty because rendering failed. GA4 responded with zero sessions, zero users, no channel rows, and no landing-page rows. Read the detailed report first; it explains the property/tagging issue and what to fix before trusting this source.</p>
      </section>`;
    }
  }
  if (data.kind === "search-console-report") {
    const hasSearchData =
      data.top_queries.length > 0 ||
      data.top_pages.length > 0 ||
      data.trend.some((point) => point.clicks > 0);
    if (!hasSearchData) {
      return `<section class="report-callout report-callout-warn">
        <p class="callout-label">Data unavailable</p>
        <h2>Search Console returned no query or page rows</h2>
        <p>The report is showing an access or measurement state, not a charting failure. Confirm the property, permissions, and date range before treating this source as evidence.</p>
      </section>`;
    }
  }
  if (data.kind === "backlinks") {
    if (data.dr_distribution.length === 0 && data.top_domains.length === 0) {
      return `<section class="report-callout report-callout-warn">
        <p class="callout-label">Data unavailable</p>
        <h2>No backlink rows were available</h2>
        <p>The backlink renderer is not broken. The provider returned no chartable backlink rows, usually because the Backlinks API is not enabled, the subscription is missing, or the fallback source did not provide an export. Read the findings before treating this as a clean link profile.</p>
      </section>`;
    }
  }
  return "";
}

/**
 * Short URL/path label for x-axis ticks — keeps GSC top-pages and GA4
 * landing-pages readable when paths are long. Strip the origin and
 * trailing slashes; cap at 28 chars with an ellipsis.
 */
function shortUrl(s: string): string {
  let out = s.replace(/^https?:\/\/[^/]+/, "");
  if (out === "" || out === "/") out = "/";
  if (out.length > 28) out = out.slice(0, 25) + "…";
  return out;
}

/**
 * GA4 KPI strip — four totals as styled HTML cards. We keep this in
 * HTML (not SVG) so the user can copy the numbers easily and so the
 * card grid reuses `.chart-card` styling already in baseCss.
 */
function renderGa4KpiStrip(data: {
  totals: {
    users: number;
    sessions: number;
    engaged_sessions: number;
    conversions: number;
  };
  realtime_users?: number;
}): string {
  const items: Array<[string, number]> = [
    ["Users", data.totals.users],
    ["Sessions", data.totals.sessions],
    ["Engaged", data.totals.engaged_sessions],
    ["Conversions", data.totals.conversions],
  ];
  if (typeof data.realtime_users === "number") {
    items.push(["Realtime", data.realtime_users]);
  }
  const cards = items
    .map(
      ([label, value]) => `
    <div class="chart-card kpi">
      <div class="kpi-label">${escapeHtml(label)}</div>
      <div class="kpi-value">${value.toLocaleString("en-US")}</div>
    </div>`,
    )
    .join("");
  return `<div class="kpi-strip">${cards}</div>`;
}

function chartGrid(charts: string[]): string {
  return charts.map((c) => `<div class="chart-card">${c}</div>`).join("");
}

/* -------------------------------------------------------------------------- */
/* signals table                                                               */
/* -------------------------------------------------------------------------- */

function renderSignalsTable(data: ReportData): string {
  let signals: Signal[] = [];
  if ("signals" in data && Array.isArray(data.signals)) {
    signals = data.signals;
  }
  if (signals.length === 0) return "";
  const rows = signals
    .map(
      (s) => `
    <tr class="sev-${s.severity}">
      <td><span class="pill sev-${s.severity}">${escapeHtml(s.severity)}</span></td>
      <td>${escapeHtml(s.label)}</td>
      <td>${s.detail ? escapeHtml(s.detail) : ""}</td>
    </tr>`,
    )
    .join("");
  return `<table class="signals-table"><thead><tr><th>Severity</th><th>Finding</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* -------------------------------------------------------------------------- */
/* prose                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Minimal markdown → HTML for the report body. We deliberately avoid
 * pulling react-markdown server-side; the prose set is small and uniform
 * across specialists. Handles: headings, paragraphs, lists, inline `code`,
 * bold/italic, and fenced ` ```chart ``` ` blocks (which become inline SVG).
 *
 * For anything fancier, the user can open the markdown directly in the
 * vault slide-over.
 */
function renderProseAsHtml(prose: string): string {
  const lines = prose.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // fenced chart block — embed SVG inline
    if (/^```chart\s*$/i.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      try {
        const spec = JSON.parse(buf.join("\n")) as Record<string, unknown>;
        out.push(`<div class="chart-card inline">${renderInlineChartFromSpec(spec)}</div>`);
      } catch {
        out.push(
          `<pre class="block-code"><code>${escapeHtml(buf.join("\n"))}</code></pre>`,
        );
      }
      continue;
    }
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      out.push(
        `<pre class="block-code"><code>${escapeHtml(buf.join("\n"))}</code></pre>`,
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = Math.min(4, h[1].length);
      out.push(`<h${level + 1}>${renderInline(h[2])}</h${level + 1}>`);
      i++;
      continue;
    }
    if (isMarkdownTableAt(lines, i)) {
      const parsed = parseMarkdownTable(lines, i);
      out.push(parsed.html);
      i = parsed.nextIndex;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      out.push(`<ul>${items.map((it) => `<li>${renderInline(it)}</li>`).join("")}</ul>`);
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    // paragraph: gather contiguous non-blank lines
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#|```|\s*[-*]\s+)/.test(lines[i]) &&
      !isMarkdownTableAt(lines, i)
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${renderInline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

function isMarkdownTableAt(lines: string[], index: number): boolean {
  const header = lines[index];
  const separator = lines[index + 1];
  if (!header || !separator) return false;
  if (!header.includes("|")) return false;
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(separator);
}

function parseMarkdownTable(
  lines: string[],
  startIndex: number,
): { html: string; nextIndex: number } {
  const headers = splitMarkdownTableRow(lines[startIndex]);
  let i = startIndex + 2; // skip separator
  const rows: string[][] = [];
  while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
    rows.push(splitMarkdownTableRow(lines[i]));
    i++;
  }

  const head = headers
    .map((h) => `<th>${renderInline(h)}</th>`)
    .join("");
  const body = rows
    .map((row) => {
      const cells = headers.map((_, idx) => `<td>${renderInline(row[idx] ?? "")}</td>`);
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");
  return {
    html: `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
    nextIndex: i,
  };
}

function splitMarkdownTableRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  return row.split("|").map((cell) => cell.trim());
}

function renderInline(s: string): string {
  // Escape first, then re-introduce markdown emphasis as HTML.
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  return out;
}

function renderInlineChartFromSpec(spec: Record<string, unknown>): string {
  const type = String(spec.type ?? "");
  if (type === "bar") {
    return barChartSvg({
      title: typeof spec.title === "string" ? spec.title : undefined,
      data: Array.isArray(spec.data)
        ? (spec.data as Array<Record<string, unknown>>).map((d) => ({
            category: String(d.category ?? d.label ?? ""),
            count: Number(d.count ?? d.value ?? 0),
          }))
        : [],
    });
  }
  if (type === "donut") {
    return donutChartSvg({
      title: typeof spec.title === "string" ? spec.title : undefined,
      data: Array.isArray(spec.data)
        ? (spec.data as Array<Record<string, unknown>>).map((d) => ({
            label: String(d.label ?? d.category ?? ""),
            value: Number(d.value ?? d.count ?? 0),
          }))
        : [],
    });
  }
  if (type === "radar") {
    return radarChartSvg({
      title: typeof spec.title === "string" ? spec.title : undefined,
      data: Array.isArray(spec.data)
        ? (spec.data as Array<Record<string, unknown>>).map((d) => ({
            label: String(d.label ?? ""),
            value: Number(d.value ?? 0),
          }))
        : [],
    });
  }
  if (type === "severity") {
    const counts = (spec.data as { high?: number; medium?: number; low?: number; info?: number }) ?? {};
    return severityHistogramSvg({
      high: Number(counts.high ?? 0),
      medium: Number(counts.medium ?? 0),
      low: Number(counts.low ?? 0),
      info: Number(counts.info ?? 0),
    });
  }
  return `<pre class="block-code"><code>${escapeHtml(JSON.stringify(spec, null, 2))}</code></pre>`;
}

/* -------------------------------------------------------------------------- */
/* CSS                                                                         */
/* -------------------------------------------------------------------------- */

function baseCss(): string {
  return `
:root {
  color-scheme: dark;
  --bg: ${CHART_PALETTE.bg};
  --card: ${CHART_PALETTE.card};
  --grid: ${CHART_PALETTE.grid};
  --text: ${CHART_PALETTE.text};
  --muted: ${CHART_PALETTE.muted};
  --gold: ${CHART_PALETTE.accent};
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.55;
}
body {
  max-width: 1120px;
  margin: 0 auto;
  padding: 32px 24px 80px;
}
.report-header {
  border-bottom: 1px solid var(--grid);
  padding-bottom: 20px;
  margin-bottom: 28px;
}
.header-tag {
  color: var(--gold);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin-bottom: 6px;
}
.report-header h1 {
  font-size: 28px;
  margin: 0 0 8px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.subtitle {
  color: var(--muted);
  margin: 4px 0 14px;
  font-size: 14px;
}
.header-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  font-size: 12px;
  color: var(--text);
}
.header-meta .dim { color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; font-size: 10px; }
.header-meta a { color: var(--gold); text-decoration: underline; text-decoration-color: rgba(250,204,21,0.4); }
section { margin-bottom: 36px; }
h2 {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--text);
  margin: 0 0 14px;
}
.charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
  gap: 16px;
}
.report-callout {
  border: 1px solid rgba(250, 204, 21, 0.5);
  border-left-width: 3px;
  border-radius: 6px;
  background: rgba(250, 204, 21, 0.08);
  padding: 16px 18px;
}
.report-callout h2 {
  margin: 4px 0 6px;
  font-size: 16px;
  letter-spacing: 0;
  text-transform: none;
  color: var(--text);
}
.report-callout p {
  margin: 0;
  color: var(--muted);
}
.report-callout .callout-label {
  color: var(--gold);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.chart-card {
  background: var(--card);
  border: 1px solid var(--grid);
  border-radius: 6px;
  padding: 14px;
}
.chart-card > svg {
  margin: 0 auto;
}
.chart-card.inline { max-width: 720px; margin: 18px 0; }
.kpi-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin-bottom: 16px; }
.chart-card.kpi { padding: 16px 18px; }
.kpi-label { color: var(--muted); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 6px; }
.kpi-value { font-size: 22px; font-weight: 600; color: var(--text); letter-spacing: -0.01em; }
.signals-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.signals-table th {
  text-align: left;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted);
  padding: 8px 10px;
  border-bottom: 1px solid var(--grid);
  background: var(--card);
}
.signals-table td {
  padding: 10px;
  border-bottom: 1px solid var(--grid);
  vertical-align: top;
}
.pill {
  display: inline-block;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 9999px;
  border: 1px solid currentColor;
}
.pill.sev-high { color: ${CHART_PALETTE.high}; }
.pill.sev-medium { color: ${CHART_PALETTE.medium}; }
.pill.sev-low { color: ${CHART_PALETTE.low}; }
.pill.sev-info { color: ${CHART_PALETTE.info}; }
.prose h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); margin-top: 24px; margin-bottom: 8px; }
.prose h4 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-top: 18px; margin-bottom: 6px; }
.prose p { margin: 10px 0; }
.prose ul { margin: 8px 0 12px; padding-left: 20px; }
.prose li { margin: 4px 0; }
.table-wrap {
  width: 100%;
  overflow-x: auto;
  margin: 14px 0 18px;
  border: 1px solid var(--grid);
  border-radius: 6px;
}
.prose table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
  font-size: 12px;
  line-height: 1.45;
}
.prose th {
  background: rgba(39,39,42,0.5);
  color: var(--muted);
  text-align: left;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 9px 10px;
  border-bottom: 1px solid var(--grid);
  vertical-align: bottom;
}
.prose td {
  color: var(--text);
  padding: 10px;
  border-bottom: 1px solid var(--grid);
  vertical-align: top;
}
.prose tr:last-child td { border-bottom: 0; }
.prose code { background: var(--card); padding: 1px 6px; border-radius: 3px; color: var(--gold); font-size: 12px; font-family: ui-monospace, "JetBrains Mono", monospace; border: 1px solid var(--grid); }
.block-code { background: var(--card); border: 1px solid var(--grid); border-radius: 4px; padding: 12px; overflow-x: auto; font-size: 12px; }
.block-code code { background: transparent; border: 0; padding: 0; color: var(--text); }
.report-footer { margin-top: 64px; padding-top: 20px; border-top: 1px solid var(--grid); color: var(--muted); font-size: 11px; text-align: center; }
@media print {
  body { background: #fff; color: #111; }
  .chart-card { background: #fafafa; border-color: #ddd; }
  .signals-table th { background: #f5f5f5; color: #333; }
}
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Re-export for typing convenience.
export type { Severity };
