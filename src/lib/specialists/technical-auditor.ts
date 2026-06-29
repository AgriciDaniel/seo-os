/**
 * Technical SEO Auditor.
 *
 * Fetches the client's homepage, extracts indexability / performance /
 * schema / link signals via the shared `extractSignals()` helper, then asks
 * the active LLM provider to produce a 7-section technical audit.
 *
 * Phase-2 upgrade: the LLM also emits a structured `data` block matching
 * `TechnicalAuditDataZ`. We parse + validate it, write a `.data.json`
 * sidecar, render a polished HTML report next to the markdown, and inject
 * an inline severity chart at the top of the markdown so the vault
 * slide-over renders rich visuals instead of plain bullets.
 */
import "server-only";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { extractSignals } from "./_lib/fetch-signals";
import { writeArtifact } from "./_lib/artifact";
import {
  applyStructuredOutput,
  sidecarRef,
} from "./_lib/structured-output";
import { optionalIntegrationDegradation } from "./integration-readiness";

const SYSTEM_PROMPT = `You are the Technical SEO Auditor inside SEO Office, a local-first SEO agency tool.

You receive a compact JSON payload of signals extracted from a client's website. Your job is to produce a concise, evidence-based technical SEO audit in Markdown that a non-technical operator can act on.

## Output contract

Produce a Markdown report with exactly these sections, in this order:

1. **Executive summary** — 3-5 bullets, each with a severity tag in square brackets: \`[high]\`, \`[medium]\`, \`[low]\`, \`[info]\`. Lead with the most consequential issue.
2. **Indexability** — robots meta, canonical, noindex/nofollow signals, sitemap presence, hreflang sanity.
3. **Performance signals** — what's visible from the HTML (preloads, async/defer, image weight indicators, font loading strategy). Note that field CWV is not yet available; flag this and request it.
4. **Security & delivery** — HTTPS, HSTS hints, mixed content risk, server headers when present.
5. **Structured data** — JSON-LD present? Types? Obvious validation issues (missing required fields per schema.org type).
6. **Crawl & navigation** — primary navigation, internal link density, orphaned-page risk signals from a single page (e.g. nav is JS-rendered).
7. **Action plan** — exactly 5 numbered actions, each with: short imperative title, one-sentence why, effort estimate (S/M/L), expected impact (S/M/L). Order by impact-per-effort.

After the action plan, append a final section:

8. **Structured findings (machine-readable)** — a single fenced code block tagged \`data\` containing JSON that matches this schema:

\`\`\`data
{
  "kind": "technical-audit",
  "v": 1,
  "url": "<the audited URL>",
  "scores": {
    "crawl": <0-100>,
    "index": <0-100>,
    "mobile": <0-100>,
    "cwv": <0-100>,
    "schema": <0-100>
  },
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

The data block is parsed and removed before the note is rendered, so do NOT add commentary inside the fenced block. \`severity_counts\` must match the totals in the executive summary. \`scores\` reflect health 0–100 per category based ONLY on what the signals show; if you can't judge a category, score it 50.

## Voice and constraints

- Be terse and concrete. Cite the exact signal you read.
- Never claim a future ranking, traffic increase, or "guaranteed" outcome.
- If a signal is missing from the payload, say so — do not invent.
- If something requires Playwright, PageSpeed, or GSC access, list it under "Need to verify with field data" inside the relevant section.
- Do NOT include a closing summary, sign-off, or call to action — the report ends after the structured findings block.`;

const InputSchema = z.object({});
type Input = z.infer<typeof InputSchema>;

const technicalAuditor: Specialist<Input> = {
  id: "technical-auditor",
  name: "Technical SEO Auditor",
  description:
    "Crawls the client's homepage, extracts indexability/perf/schema signals, and writes a structured technical audit.",
  desk: "desk.technical-auditor",
  inputSchema: InputSchema,
  async execute(ctx) {
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) {
      throw new Error(`no manifest for client "${ctx.clientSlug}" — scaffold the vault first`);
    }

    ctx.emit("progress", `Fetching ${manifest.site_under_audit}…`, { progress: 0.1 });
    const signals = await extractSignals(manifest.site_under_audit);
    ctx.emit("log", `Fetched ${signals.contentLength} bytes from ${signals.url} (HTTP ${signals.status})`);

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.4 });

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 4096,
      temperature: 0.4,
      messages: [
        {
          role: "user",
          content: `Audit this page. Signals JSON follows.\n\n\`\`\`json\n${JSON.stringify(signals, null, 2)}\n\`\`\``,
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
      expectedKind: "technical-audit",
      chartSpec: () => ({
        type: "severity",
        title: "Severity by check",
        ref: sidecarRef(today, "technical"),
        field: "severity_counts",
      }),
    });
    if (data) {
      ctx.emit("log", `Structured findings parsed — ${data.signals.length} signal${data.signals.length === 1 ? "" : "s"}, severity counts ${JSON.stringify(data.severity_counts)}`);
    } else {
      ctx.emit("log", "No valid structured findings block — skipping sidecar + HTML report");
    }

    ctx.emit("progress", "Writing audit to vault…", { progress: 0.85 });
    const degradation = optionalIntegrationDegradation("technical-auditor");

    const { relativePath, executionResult, reportPath, dataPath } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "technical",
        frontmatterType: "audit",
        title: `Technical SEO audit — ${manifest.site_under_audit}`,
        body: bodyWithChart,
        tags: ["audit", "technical-seo", "claude-generated"],
        url: manifest.site_under_audit,
        reportSubtitle: data
          ? `${data.signals.length} signals captured · ${data.severity_counts.high} high / ${data.severity_counts.medium} medium / ${data.severity_counts.low} low`
          : undefined,
        ...(data ? { data } : {}),
        costUsd: result.costUsd ?? 0,
        ...degradation.artifact,
      },
      {
        facts: [
          `Technical audit run on ${manifest.site_under_audit} (${signals.contentLength}B, HTTP ${signals.status}).`,
          signals.title ? `Page title: "${signals.title}".` : `Page title: MISSING.`,
          signals.canonical ? `Canonical: ${signals.canonical}` : `Canonical: MISSING.`,
        ],
        threadTitle: "Technical SEO audit",
        threadRationale: "review the new audit and approve actions",
        statusNote:
          "First technical audit on file — review action plan, then run content + schema specialists.",
      },
    );

    return {
      summary: reportPath
        ? `Technical audit written to ${relativePath} (report: ${reportPath})`
        : `Technical audit written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      ...(reportPath ? { reportPath } : {}),
      ...(dataPath ? { dataPath } : {}),
      data: {
        signals: {
          title: signals.title,
          status: signals.status,
          jsonLd: signals.jsonLd.length,
        },
        ...(data ? { structured: data } : {}),
      },
      ...degradation.result,
    };
  },
};

registerSpecialist(technicalAuditor);

export default technicalAuditor;
