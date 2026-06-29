/**
 * Content Strategist — assesses content quality against E-E-A-T + AI citation
 * readiness using the visible text from the homepage.
 *
 * Ports the system prompt logic from claude-seo's `seo-content` skill.
 */
import "server-only";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { extractSignals } from "./_lib/fetch-signals";
import { writeArtifact } from "./_lib/artifact";
import { applyStructuredOutput, sidecarRef } from "./_lib/structured-output";

const SYSTEM_PROMPT = `You are the Content Strategist inside SEO Office.

You receive a compact JSON payload representing the **visible content** of a page (title, H1/H2/H3, paragraphs, word count, image counts, internal links). Your job is to score this page on the dimensions Google's Helpful Content + E-E-A-T frameworks weight most, and identify the highest-leverage content fixes.

## Output contract

Produce a Markdown report with exactly these sections, in this order:

1. **Executive summary** — 3-5 bullets with severity tags \`[critical|high|medium|low|info]\`. Lead with the most consequential gap.
2. **Search intent fit** — what query intent does this page seem to target (informational / commercial / transactional / navigational)? Does the heading structure + paragraph density match that intent?
3. **E-E-A-T signals** — Experience (first-hand evidence?), Expertise (credentials, references?), Authoritativeness (citations, links to authorities?), Trust (author byline, last-updated, contact). Cite what you can see; flag what's invisible.
4. **Content depth & uniqueness** — word count vs typical SERP for the apparent intent. Is there obvious thin / boilerplate content? Are H2s answering distinct sub-queries or repeating?
5. **AI citation readiness** — does this page answer questions in a way an AI overview (Google AI Overviews, Perplexity, ChatGPT) would extract cleanly? Look for: question-style headings, summary-first paragraphs, factual claims with sources.
6. **Action plan** — exactly 5 numbered actions, each with: short imperative title, one-sentence why, effort (S/M/L), expected impact (S/M/L). Ordered by impact-per-effort.

After the action plan, append a final section:

7. **Structured findings (machine-readable)** — a single fenced code block tagged \`data\` containing JSON that matches this schema:

\`\`\`data
{
  "kind": "content-audit",
  "v": 1,
  "url": "<the audited URL>",
  "eeat": {
    "experience": <0-100>,
    "expertise": <0-100>,
    "authoritativeness": <0-100>,
    "trust": <0-100>
  },
  "intent_mix": [
    { "label": "<intent label e.g. informational>", "value": <number ≥ 0> }
  ],
  "severity_counts": {
    "high": <integer>,
    "medium": <integer>,
    "low": <integer>
  },
  "signals": [
    { "id": "<kebab-case>", "label": "<short label>", "severity": "high|medium|low|info", "detail": "<one sentence>" }
  ]
}
\`\`\`

\`severity_counts\` must match the totals in the executive summary (the "critical" bucket should be folded into "high"). \`eeat\` scores reflect 0–100 health per axis based ONLY on what the page shows; if you can't judge an axis, score it 50. \`intent_mix\` describes how the page splits across query intents (informational / commercial / transactional / navigational) — values are relative weights, not percentages.

## Voice and constraints

- Be terse, concrete, evidence-led. Quote 2-5 word snippets when you reference body text.
- No traffic / ranking promises.
- If the payload is missing what you'd need (e.g. no paragraphs visible because the page is JS-rendered), say so explicitly and add it under "Need to verify with field data".
- End after the structured findings block — no closing remarks.

The data block is parsed and removed before the note is rendered, so do NOT add commentary inside the fenced block.`;

const TargetLocaleSchema = z.object({
  code: z.string().optional(),
  location_name: z.string().optional(),
  language_name: z.string().optional(),
  site_url: z.string().url().optional(),
  timezone: z.string().optional(),
});
const InputSchema = z.object({
  target_locale: TargetLocaleSchema.optional(),
});
type Input = z.infer<typeof InputSchema>;

const contentStrategist: Specialist<Input> = {
  id: "content-strategist",
  name: "Content Strategist",
  description:
    "Evaluates content quality, E-E-A-T signals, and AI citation readiness from the visible page text.",
  desk: "desk.content-strategist",
  inputSchema: InputSchema,
  async execute(ctx) {
    const input = ctx.input;
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    const targetLocale = input.target_locale;
    const auditUrl = targetLocale?.site_url ?? manifest.site_under_audit;
    const localeLabel = formatLocaleLabel(targetLocale);

    ctx.emit("progress", `Fetching ${auditUrl}…`, { progress: 0.1 });
    const signals = await extractSignals(auditUrl);
    ctx.emit("log", `Visible word count: ${signals.wordCount}, paragraphs: ${signals.paragraphs.length}`);

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.4 });

    const compact = {
      url: signals.url,
      title: signals.title,
      metaDescription: signals.metaDescription,
      h1: signals.h1,
      h2: signals.h2,
      h3: signals.h3,
      wordCount: signals.wordCount,
      paragraphSamples: signals.paragraphs.slice(0, 12),
      visibleTextSample: signals.visibleText.slice(0, 4000),
      imageCount: signals.imageCount,
      imagesMissingAlt: signals.imagesMissingAlt,
      internalLinks: signals.internalLinks,
      externalLinks: signals.externalLinks,
      internalLinkSamples: signals.internalLinkSamples,
      locale: targetLocale ?? manifest.locale ?? null,
    };

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 4096,
      temperature: 0.45,
      messages: [
        {
          role: "user",
          content: `${localeLabel ? `Assess this page's content for the ${localeLabel} locale. Compare localization, translation depth, and cannibalization risk against the primary market when evidence allows.` : "Assess this page's content."} Payload follows.\n\n\`\`\`json\n${JSON.stringify(compact, null, 2)}\n\`\`\``,
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
      expectedKind: "content-audit",
      chartSpec: (d) => ({
        type: "radar",
        title: "E-E-A-T signals",
        ref: sidecarRef(today, "content"),
        field: "eeat",
        data: [
          { label: "Experience", value: d.eeat.experience },
          { label: "Expertise", value: d.eeat.expertise },
          { label: "Authoritativeness", value: d.eeat.authoritativeness },
          { label: "Trust", value: d.eeat.trust },
        ],
      }),
    });
    if (data) {
      ctx.emit(
        "log",
        `Structured findings parsed — ${data.signals.length} signal${data.signals.length === 1 ? "" : "s"}, E-E-A-T trust ${data.eeat.trust}/100`,
      );
    } else {
      ctx.emit("log", "No valid structured findings block — skipping sidecar + HTML report");
    }

    ctx.emit("progress", "Writing content audit to vault…", { progress: 0.85 });

    const { relativePath, executionResult, reportPath, dataPath } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: targetLocale ? `content-${slugifyLocale(targetLocale)}` : "content",
        frontmatterType: "audit",
        title: `Content audit${localeLabel ? ` (${localeLabel})` : ""} — ${auditUrl}`,
        body: bodyWithChart,
        tags: ["audit", "content", "e-e-a-t", "claude-generated"],
        url: auditUrl,
        reportSubtitle: data
          ? `${data.signals.length} signals · trust ${data.eeat.trust}/100`
          : undefined,
        ...(data ? { data } : {}),
        costUsd: result.costUsd ?? 0,
      },
      {
        facts: [
          `Content audit run on ${auditUrl}${localeLabel ? ` for ${localeLabel}` : ""} (${signals.wordCount} words visible).`,
          signals.h1.length === 1
            ? `Single H1: "${signals.h1[0].slice(0, 60)}".`
            : `H1 count: ${signals.h1.length} (ideal: 1).`,
          signals.imagesMissingAlt
            ? `${signals.imagesMissingAlt} of ${signals.imageCount} images missing alt.`
            : `All ${signals.imageCount} images have alt attributes.`,
        ],
        threadTitle: localeLabel ? `Content audit: ${localeLabel}` : "Content audit",
        threadRationale: "review E-E-A-T gaps and prioritise content fixes",
        statusNote:
          "Content audit on file — see action plan to prioritise depth + authority work.",
      },
    );

    return {
      summary: reportPath
        ? `Content audit written to ${relativePath} (report: ${reportPath})`
        : `Content audit written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      ...(reportPath ? { reportPath } : {}),
      ...(dataPath ? { dataPath } : {}),
      data: {
        wordCount: signals.wordCount,
        h1Count: signals.h1.length,
        ...(data ? { structured: data } : {}),
      },
    };
  },
};

registerSpecialist(contentStrategist);

export default contentStrategist;

function formatLocaleLabel(locale: Input["target_locale"]): string {
  if (!locale) return "";
  return [
    locale.code,
    [locale.language_name, locale.location_name].filter(Boolean).join(" / "),
  ]
    .filter(Boolean)
    .join(" · ");
}

function slugifyLocale(locale: Input["target_locale"]): string {
  const label =
    locale?.code ||
    [locale?.language_name, locale?.location_name].filter(Boolean).join("-") ||
    "locale";
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "locale";
}
