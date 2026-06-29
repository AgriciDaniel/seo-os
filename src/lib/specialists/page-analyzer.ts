/**
 * Page Analyzer — deep single-URL SEO analysis.
 *
 * Defaults to the manifest's site_under_audit but accepts any URL via input.
 * Ports the logic from claude-seo's `seo-page` skill.
 */
import "server-only";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { extractSignals } from "./_lib/fetch-signals";
import { writeArtifact } from "./_lib/artifact";
import { applyStructuredOutput, sidecarRef } from "./_lib/structured-output";

const SYSTEM_PROMPT = `You are the Page Analyzer inside SEO Office.

You receive an exhaustive JSON payload describing a single page: meta tags, headings, body samples, hreflangs, JSON-LD blocks, OG/Twitter tags, link counts, image counts, script/style budget, response headers. Your job is to deliver a deep on-page SEO review across all surfaces in one pass.

## Output contract

Produce a Markdown report with exactly these sections, in order:

1. **Executive summary** — 3-5 bullets tagged \`[critical|high|medium|low|info]\`.
2. **Meta layer** — title (length, brand suffix, keyword fit), meta description (length, intent fit), canonical (self-ref OK?), robots, viewport.
3. **Heading structure** — H1 count (must be 1), H2/H3 hierarchy, keyword coverage in headings.
4. **Body content** — word count vs intent norm, paragraph density, internal vs external link ratio. Pull 2-5 word quotes from the payload.
5. **Structured data** — JSON-LD blocks present, parse errors, missing-but-eligible schema types based on what the page seems to be.
6. **Social** — OG and Twitter Card completeness.
7. **Technical signals** — image alt coverage, script blocking budget, preload count, HTTPS + HSTS posture.
8. **Recommendations** — exactly 7 numbered actions, each with title, one-sentence why, effort (S/M/L), impact (S/M/L). Sorted by impact-per-effort.

After the recommendations, append a final section:

9. **Structured findings (machine-readable)** — a single fenced code block tagged \`data\` containing JSON that matches this schema:

\`\`\`data
{
  "kind": "page-analysis",
  "v": 1,
  "url": "<the analyzed URL>",
  "severity_counts": {
    "high": <integer>,
    "medium": <integer>,
    "low": <integer>,
    "info": <integer>
  },
  "signals": [
    { "id": "<kebab-case>", "label": "<short label>", "severity": "high|medium|low|info", "detail": "<one sentence>" }
  ]
}
\`\`\`

The data block is parsed and removed before the note is rendered, so do NOT add commentary inside the fenced block. \`severity_counts\` must match the totals across all sections; \`signals\` lists at most 80 items.

## Constraints

- Be terse, concrete, evidence-led. Quote actual values from the payload.
- No traffic/ranking promises.
- Do NOT include a closing summary, sign-off, or call to action — the report ends after the structured findings block.`;

const InputSchema = z.object({
  url: z.string().url().optional(),
});
type Input = z.infer<typeof InputSchema>;

const pageAnalyzer: Specialist<Input> = {
  id: "page-analyzer",
  name: "Page Analyzer",
  description:
    "Deep single-page SEO analysis covering on-page elements, content quality, technical meta, schema, images, and performance.",
  desk: "desk.page-analyzer",
  inputSchema: InputSchema,
  async execute(ctx) {
    const input = ctx.input;
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    const targetUrl = input.url ?? manifest.site_under_audit;
    ctx.emit("progress", `Fetching ${targetUrl}…`, { progress: 0.15 });
    const signals = await extractSignals(targetUrl);
    ctx.emit(
      "log",
      `HTTP ${signals.status}, ${signals.wordCount} words, ${signals.jsonLd.length} JSON-LD block(s).`,
    );

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.45 });

    const payload = {
      url: signals.url,
      status: signals.status,
      contentType: signals.contentType,
      title: signals.title,
      metaDescription: signals.metaDescription,
      canonical: signals.canonical,
      robotsMeta: signals.robotsMeta,
      viewport: signals.viewport,
      h1: signals.h1,
      h2: signals.h2,
      h3: signals.h3,
      wordCount: signals.wordCount,
      paragraphSamples: signals.paragraphs.slice(0, 10),
      hreflangs: signals.hreflangs,
      jsonLd: signals.jsonLd.map((j) => ({ type: j.type, hasParseError: Boolean(j.parseError) })),
      ogTags: signals.ogTags,
      twitterTags: signals.twitterTags,
      internalLinks: signals.internalLinks,
      externalLinks: signals.externalLinks,
      imageCount: signals.imageCount,
      imagesMissingAlt: signals.imagesMissingAlt,
      preloadCount: signals.preloadCount,
      asyncScripts: signals.asyncScripts,
      deferScripts: signals.deferScripts,
      blockingScripts: signals.blockingScripts,
      stylesheetCount: signals.stylesheetCount,
      isHttps: signals.isHttps,
      hsts: signals.hstsHeader != null,
      warnings: signals.warnings,
    };

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 4096,
      temperature: 0.4,
      messages: [
        {
          role: "user",
          content: `Page payload:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        },
      ],
    });

    const today = new Date().toISOString().slice(0, 10);
    const { data, body: bodyWithChart } = applyStructuredOutput({
      rawText: result.text,
      expectedKind: "page-analysis",
      chartSpec: () => ({
        type: "severity",
        title: "Severity by check",
        ref: sidecarRef(today, "page"),
        field: "severity_counts",
      }),
    });
    if (data) {
      ctx.emit(
        "log",
        `Structured findings parsed — ${data.signals.length} signal${data.signals.length === 1 ? "" : "s"}, severity counts ${JSON.stringify(data.severity_counts)}`,
      );
    } else {
      ctx.emit("log", "No valid structured findings block — skipping sidecar + HTML report");
    }

    ctx.emit("progress", "Writing page audit to vault…", { progress: 0.85 });
    const { relativePath, executionResult, reportPath, dataPath } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "page",
        frontmatterType: "audit",
        title: `Page audit — ${signals.url}`,
        body: bodyWithChart,
        tags: ["audit", "page", "on-page", "claude-generated"],
        url: signals.url,
        reportSubtitle: data
          ? `${data.signals.length} signals · ${data.severity_counts.high} high / ${data.severity_counts.medium} medium / ${data.severity_counts.low} low`
          : undefined,
        ...(data ? { data } : {}),
        costUsd: result.costUsd ?? 0,
      },
      {
        facts: [
          `Page audit run on ${signals.url} (HTTP ${signals.status}, ${signals.wordCount} words).`,
          signals.h1.length === 1
            ? `H1 OK: "${signals.h1[0].slice(0, 50)}".`
            : `H1 count: ${signals.h1.length} (ideal: 1).`,
        ],
        threadTitle: "Page audit",
        threadRationale: "single-page deep dive — promote top recommendations to roadmap",
        statusNote: "Page audit on file.",
      },
    );

    return {
      summary: reportPath
        ? `Page audit written to ${relativePath} (report: ${reportPath})`
        : `Page audit written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      ...(reportPath ? { reportPath } : {}),
      ...(dataPath ? { dataPath } : {}),
      data: {
        url: signals.url,
        wordCount: signals.wordCount,
        ...(data ? { structured: data } : {}),
      },
    };
  },
};

registerSpecialist(pageAnalyzer);
export default pageAnalyzer;
