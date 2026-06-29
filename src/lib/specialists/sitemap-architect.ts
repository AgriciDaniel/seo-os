/**
 * Sitemap Architect — fetches /sitemap.xml, parses structure, and LLM-synthesizes
 * a coverage + freshness + structure report.
 *
 * Ports the logic from claude-seo's `seo-sitemap` skill.
 */
import "server-only";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { writeArtifact } from "./_lib/artifact";
import { applyStructuredOutput } from "./_lib/structured-output";

const SYSTEM_PROMPT = `You are the Sitemap Architect inside SEO Office.

You receive a compact JSON payload describing a site's XML sitemap (or sitemap index): URL counts, lastmod freshness distribution, hostname diversity, structural shape (flat vs index-of-sitemaps), and any parse warnings.

## Output contract

Produce a Markdown report with exactly these sections, in order:

1. **Executive summary** — 3-5 bullets tagged \`[critical|high|medium|low|info]\`. Lead with the most consequential issue (missing sitemap, stale lastmod, index without children, etc.).
2. **Structure** — flat vs index, child sitemap count, total URL count, hostname split. Flag anomalies: cross-domain URLs, mixed protocols, sitemap >50k URLs (must split).
3. **Freshness** — distribution of \`lastmod\` (this week / month / quarter / older / missing). Stale sitemaps signal indexing inefficiency.
4. **URL quality** — sample 10 URLs from the payload. Flag duplicate trailing slashes, query strings, capitalized paths, hash fragments, port numbers.
5. **Recommendations** — exactly 5 numbered actions, each with title, one-sentence why, effort (S/M/L), impact (S/M/L). Sorted by impact-per-effort.

After the recommendations, append a final section:

6. **Structured findings (machine-readable)** — a single fenced code block tagged \`data\` containing JSON that matches this schema:

\`\`\`data
{
  "kind": "sitemap-validation",
  "v": 1,
  "templates": [
    { "name": "<template label, e.g. 'product', 'blog', 'category'>", "count": <integer> }
  ],
  "gate_results": [
    { "name": "<gate label, e.g. 'under-50k-urls'>", "pass": true, "note": "<optional one-sentence note>" }
  ],
  "signals": [
    { "id": "<kebab-case>", "label": "<short label>", "severity": "high|medium|low|info", "detail": "<one sentence>" }
  ]
}
\`\`\`

The data block is parsed and removed before the note is rendered, so do NOT add commentary inside the fenced block. \`templates\` lists at most 20 URL groupings inferred from the URL samples (by path prefix or pattern); \`gate_results\` lists the structural/freshness checks the sitemap should pass (size, lastmod presence, no cross-host, etc.).

## Constraints

- Be terse and evidence-led. Quote actual URLs/numbers from the payload when you reference them.
- If the sitemap couldn't be fetched, name the HTTP status and propose how to recover. Skip downstream sections that have no data.
- Do NOT include a closing summary, sign-off, or call to action — the report ends after the structured findings block.`;

const InputSchema = z.object({});
type Input = z.infer<typeof InputSchema>;

interface SitemapSummary {
  url: string;
  status: number;
  shape: "flat" | "index" | "unknown";
  urlCount: number;
  childSitemapCount: number;
  hostnames: string[];
  freshness: {
    pastWeek: number;
    pastMonth: number;
    pastQuarter: number;
    older: number;
    missing: number;
  };
  urlSamples: string[];
  warnings: string[];
}

async function fetchSitemap(siteUrl: string): Promise<SitemapSummary> {
  const base = new URL(siteUrl);
  const sitemapUrl = new URL("/sitemap.xml", base).toString();
  const warnings: string[] = [];

  const res = await fetch(sitemapUrl, {
    headers: { "User-Agent": "SEOOfficeBot/0.1 (+local)" },
    redirect: "follow",
  });
  if (!res.ok) {
    return {
      url: sitemapUrl,
      status: res.status,
      shape: "unknown",
      urlCount: 0,
      childSitemapCount: 0,
      hostnames: [],
      freshness: { pastWeek: 0, pastMonth: 0, pastQuarter: 0, older: 0, missing: 0 },
      urlSamples: [],
      warnings: [`HTTP ${res.status} fetching ${sitemapUrl}`],
    };
  }
  const xml = await res.text();

  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const childCount = isIndex ? (xml.match(/<sitemap>/gi) ?? []).length : 0;
  const locMatches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());
  const lastmodMatches = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/gi)].map((m) =>
    m[1].trim(),
  );

  const now = Date.now();
  const WEEK = 7 * 86400_000;
  const MONTH = 30 * 86400_000;
  const QUARTER = 90 * 86400_000;
  const freshness = { pastWeek: 0, pastMonth: 0, pastQuarter: 0, older: 0, missing: 0 };
  const urlsWithLastmod = isIndex ? lastmodMatches.length : Math.min(locMatches.length, lastmodMatches.length);
  freshness.missing = Math.max(0, locMatches.length - urlsWithLastmod);
  for (const lm of lastmodMatches) {
    const ts = Date.parse(lm);
    if (Number.isNaN(ts)) {
      warnings.push(`unparseable lastmod: ${lm}`);
      continue;
    }
    const age = now - ts;
    if (age < WEEK) freshness.pastWeek++;
    else if (age < MONTH) freshness.pastMonth++;
    else if (age < QUARTER) freshness.pastQuarter++;
    else freshness.older++;
  }

  const hostnames = Array.from(
    new Set(
      locMatches
        .map((u) => {
          try {
            return new URL(u).hostname;
          } catch {
            return "";
          }
        })
        .filter(Boolean),
    ),
  ).slice(0, 8);

  if (locMatches.length === 0) warnings.push("no <loc> entries found");
  if (locMatches.length > 50_000)
    warnings.push("sitemap exceeds 50k URLs — must split per protocol");

  return {
    url: sitemapUrl,
    status: res.status,
    shape: isIndex ? "index" : "flat",
    urlCount: locMatches.length,
    childSitemapCount: childCount,
    hostnames,
    freshness,
    urlSamples: locMatches.slice(0, 12),
    warnings,
  };
}

const sitemapArchitect: Specialist<Input> = {
  id: "sitemap-architect",
  name: "Sitemap Architect",
  description:
    "Validates existing XML sitemaps or generates from industry templates with quality gates.",
  desk: "desk.sitemap-architect",
  inputSchema: InputSchema,
  async execute(ctx) {
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    ctx.emit("progress", `Fetching ${manifest.site_under_audit}/sitemap.xml…`, {
      progress: 0.1,
    });
    const summary = await fetchSitemap(manifest.site_under_audit);
    ctx.emit(
      "log",
      `${summary.shape} sitemap, ${summary.urlCount} URL${summary.urlCount === 1 ? "" : "s"}, ${summary.warnings.length} warning${summary.warnings.length === 1 ? "" : "s"}`,
    );

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.5 });

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 3072,
      temperature: 0.3,
      messages: [
        {
          role: "user",
          content: `Sitemap audit payload:\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\``,
        },
      ],
    });

    const { data, body: bodyWithChart } = applyStructuredOutput({
      rawText: result.text,
      expectedKind: "sitemap-validation",
      chartSpec: (data) => ({
        type: "bar",
        title: "Entries per template",
        data: data.templates.map((t) => ({
          category: t.name,
          count: t.count,
        })),
      }),
    });
    if (data) {
      const passing = data.gate_results.filter((g) => g.pass).length;
      ctx.emit(
        "log",
        `Structured findings parsed — ${data.templates.length} template${data.templates.length === 1 ? "" : "s"}, ${passing}/${data.gate_results.length} gates passing, ${data.signals.length} signal${data.signals.length === 1 ? "" : "s"}`,
      );
    } else {
      ctx.emit("log", "No valid structured findings block — skipping sidecar + HTML report");
    }

    ctx.emit("progress", "Writing sitemap audit to vault…", { progress: 0.85 });
    const { relativePath, executionResult, reportPath, dataPath } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "sitemap",
        frontmatterType: "audit",
        title: `Sitemap audit — ${manifest.site_under_audit}`,
        body: bodyWithChart,
        tags: ["audit", "sitemap", "indexing", "claude-generated"],
        url: manifest.site_under_audit,
        reportSubtitle: data
          ? `${data.templates.length} template${data.templates.length === 1 ? "" : "s"} · ${data.gate_results.filter((g) => g.pass).length}/${data.gate_results.length} gates passing`
          : undefined,
        ...(data ? { data } : {}),
        costUsd: result.costUsd ?? 0,
      },
      {
        facts: [
          `Sitemap audit run on ${summary.url} (${summary.urlCount} URLs, shape: ${summary.shape}).`,
          `Freshness: ${summary.freshness.pastWeek} this week, ${summary.freshness.older} older than 90d, ${summary.freshness.missing} missing lastmod.`,
        ],
        threadTitle: "Sitemap audit",
        threadRationale: "fix freshness + structure gaps before next crawl cycle",
        statusNote: `Sitemap on file — see recommendations to bring coverage + freshness up.`,
      },
    );

    return {
      summary: reportPath
        ? `Sitemap audit written to ${relativePath} (report: ${reportPath})`
        : `Sitemap audit written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      ...(reportPath ? { reportPath } : {}),
      ...(dataPath ? { dataPath } : {}),
      data: {
        urlCount: summary.urlCount,
        shape: summary.shape,
        ...(data ? { structured: data } : {}),
      },
    };
  },
};

registerSpecialist(sitemapArchitect);
export default sitemapArchitect;
