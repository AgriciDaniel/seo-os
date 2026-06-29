/**
 * GET /api/clients/[slug]/reports/<…>
 *
 * Serve a per-client HTML report from `.seo-office/vaults/<slug>/reports/`.
 * Returns `text/html` for `.html`, `application/json` for `.json` sidecars,
 * 404 for anything else.
 *
 * Hard rule (AGENTS.md #1): the resolved path must stay inside the client's
 * reports directory. We path-resolve then check the prefix; any traversal
 * attempt (`../../`) collapses to 404 rather than leaking files.
 */
import { NextRequest, NextResponse } from "next/server";
import fsp from "node:fs/promises";
import path from "node:path";

import { getClient } from "@/lib/brain/index-db";
import { vaultRoot } from "@/lib/brain/paths";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; path: string[] }> },
) {
  const { slug, path: parts } = await params;
  if (!getClient(slug)) {
    return new NextResponse("not found", { status: 404 });
  }

  // The dynamic segment is `reports/[...path]`, so `parts` should be the path
  // *under* `reports/`. Older chat turns and user-copied URLs sometimes
  // contain `/reports/reports/<file>`; tolerate one duplicate leading segment
  // so historical links do not 404.
  const requestedParts = parts[0] === "reports" ? parts.slice(1) : parts;
  if (requestedParts.length === 0) {
    return new NextResponse("not found", { status: 404 });
  }

  // Construct the absolute path under the vault's reports dir and assert
  // containment.
  const reportsDir = path.resolve(vaultRoot(slug), "reports");
  const requested = path.resolve(reportsDir, ...requestedParts);
  if (
    requested !== reportsDir &&
    !requested.startsWith(reportsDir + path.sep)
  ) {
    return new NextResponse("not found", { status: 404 });
  }

  const ext = path.extname(requested).toLowerCase();
  if (ext !== ".html" && ext !== ".json") {
    return new NextResponse("not found", { status: 404 });
  }

  let body: string;
  try {
    body = await fsp.readFile(requested, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return new NextResponse("not found", { status: 404 });
    }
    return new NextResponse("read failed", { status: 500 });
  }

  if (ext === ".html") {
    body = injectReportChrome(body, slug);
  }
  const contentType =
    ext === ".html"
      ? "text/html; charset=utf-8"
      : ext === ".json"
        ? "application/json; charset=utf-8"
        : "text/plain; charset=utf-8";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      // Report files are local-first artefacts; deny embedding by third
      // parties and X-Frame access from outside the office app.
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...(ext === ".html"
        ? {
            "Content-Security-Policy":
              "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
          }
        : {}),
    },
  });
}

function injectReportChrome(html: string, slug: string): string {
  const safeSlug = encodeURIComponent(slug);
  const officeHref = `/office?client=${safeSlug}#chat`;
  const vaultHref = `/office?client=${safeSlug}#vault`;
  const emptyGa4Report =
    /GA4 audit/i.test(html) && /0 sessions\s*·\s*0 users/i.test(html);
  const emptyBacklinkReport =
    /Backlink audit/i.test(html) &&
    (/40204 Access denied/i.test(html) ||
      (/DR distribution/i.test(html) && /\(no data\)/i.test(html)));
  const emptyDataReport = emptyGa4Report || emptyBacklinkReport;
  const style = `
<style>
  .seo-office-report-nav {
    position: sticky;
    top: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: -32px -24px 28px;
    padding: 12px 24px;
    border-bottom: 1px solid #27272a;
    background: rgba(10, 10, 13, 0.96);
    backdrop-filter: blur(12px);
  }
  .seo-office-report-nav__brand {
    color: #facc15;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .seo-office-report-nav__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .seo-office-report-nav a {
    border: 1px solid #3f3f46;
    color: #e5e7eb;
    padding: 6px 10px;
    text-decoration: none;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 10px;
  }
  .seo-office-report-nav a:hover {
    border-color: #facc15;
    color: #facc15;
  }
  body {
    max-width: 1120px;
  }
  .charts {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr)) !important;
  }
  .seo-office-empty-data > section.charts,
  .seo-office-empty-data .chart-card.inline {
    display: none !important;
  }
  .seo-office-report-warning {
    margin: 0 0 24px;
    border: 1px solid rgba(250, 204, 21, 0.5);
    border-left-width: 3px;
    border-radius: 6px;
    background: rgba(250, 204, 21, 0.08);
    padding: 16px 18px;
    color: #a1a1aa;
  }
  .seo-office-report-warning__label {
    color: #facc15;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .seo-office-report-warning strong {
    display: block;
    margin: 4px 0 6px;
    color: #f4f4f5;
    font-size: 16px;
  }
  .chart-card > svg {
    width: 100% !important;
    max-width: 760px !important;
    margin: 0 auto !important;
  }
  svg text {
    font-size: 13px !important;
  }
  svg text[font-weight="600"],
  svg text[font-weight="700"] {
    font-size: 15px !important;
  }
  @media print {
    .seo-office-report-nav { display: none; }
  }
</style>`;
  // `target="_top"` is load-bearing here. The report HTML is served into
  // an <iframe> inside ArtifactSlideOver. Without _top, clicking these
  // links navigates the IFRAME to /office?... which renders the entire
  // SEO Office UI nested inside the slide-over (visible bug: stacked
  // office views). With _top, the click escapes the iframe and the
  // parent route changes — the slide-over closes naturally because the
  // parent's `openArtifact` state resets on route change.
  const nav = `
  <nav class="seo-office-report-nav" aria-label="SEO Office report navigation">
    <div class="seo-office-report-nav__brand">SEO Office · Local Report</div>
    <div class="seo-office-report-nav__actions">
      <a href="${officeHref}" target="_top">Back to chat</a>
      <a href="${vaultHref}" target="_top">Open vault</a>
    </div>
  </nav>`;
  const warning = emptyGa4Report
    ? `
  <section class="seo-office-report-warning">
    <div class="seo-office-report-warning__label">Data unavailable</div>
    <strong>GA4 returned no usable traffic rows</strong>
    <div>The report file loaded correctly, but the source data is empty or mismatched. Read the detailed report below; it explains the GA4 property/tagging issue before any chart should be trusted.</div>
  </section>`
    : emptyBacklinkReport
      ? `
  <section class="seo-office-report-warning">
    <div class="seo-office-report-warning__label">Data unavailable</div>
    <strong>No backlink rows were available</strong>
    <div>The report file loaded correctly, but the backlink provider returned no chartable rows. The detailed findings point to provider access/subscription or fallback gaps, so this should not be read as a clean link profile.</div>
  </section>`
    : "";

  const withStyle = html.includes("</head>")
    ? html.replace("</head>", `${style}\n</head>`)
    : `${style}\n${html}`;
  if (/<body\b[^>]*>/i.test(withStyle)) {
    return withStyle.replace(/<body\b([^>]*)>/i, (_match, attrs: string) => {
      const nextAttrs = emptyDataReport
        ? addBodyClass(attrs, "seo-office-empty-data")
        : attrs;
      return `<body${nextAttrs}>\n${nav}${warning}`;
    });
  }
  return `${nav}${warning}\n${withStyle}`;
}

function addBodyClass(attrs: string, className: string): string {
  if (/\sclass=(["'])/i.test(attrs)) {
    return attrs.replace(/\sclass=(["'])(.*?)\1/i, (_m, quote: string, value: string) => {
      const classes = new Set(value.split(/\s+/).filter(Boolean));
      classes.add(className);
      return ` class=${quote}${Array.from(classes).join(" ")}${quote}`;
    });
  }
  return `${attrs} class="${className}"`;
}
