/**
 * Google Suite — PageSpeed Insights + CrUX field data for the homepage.
 *
 * v1 scope: API-key-only Google APIs (PSI, CrUX). Search Console + GA4
 * require an OAuth consent flow and are deferred to a later milestone.
 *
 * Ports the API-key portions of claude-seo's `seo-google` skill.
 */
import "server-only";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { requireIntegrations } from "./_lib/availability";
import { writeArtifact } from "./_lib/artifact";
import {
  applyStructuredOutput,
  sidecarRef,
} from "./_lib/structured-output";
import { envValue } from "@/lib/setup/env-local";

const SYSTEM_PROMPT = `You are the Google Suite specialist inside SEO Office.

You receive a JSON payload combining PageSpeed Insights (lab data) and Chrome UX Report (field data) for a single origin/URL. Field data is what Google actually ranks on — quote it; lab is a useful supplement.

## Output contract

Produce a Markdown report with these sections, in order:

1. **Executive summary** — 3-5 bullets tagged \`[critical|high|medium|low|info]\`. Lead with whichever Core Web Vital is failing field data (>=75th percentile threshold).
2. **Field data (CrUX)** — for each of LCP, INP, CLS: 75th-percentile value, "good/needs-improvement/poor" verdict, density distribution if present. If no field data is available, say so and explain why (low traffic / new origin).
3. **Lab data (PageSpeed)** — Lighthouse Performance score, opportunities list (top 5 by estimated savings), diagnostics list (top 3).
4. **Lab vs field divergence** — if lab says one thing and field says another, flag it. Field always wins for ranking; lab is for diagnosing fixes.
5. **Recommendations** — exactly 5 numbered actions, each with title, one-sentence why, effort (S/M/L), impact (S/M/L). Sorted by impact-per-effort.

After the recommendations, append a final section:

6. **Structured findings (machine-readable)** — a single fenced code block tagged \`data\` containing JSON that matches this schema:

\`\`\`data
{
  "kind": "page-speed",
  "v": 1,
  "url": "<the audited URL>",
  "cwv": {
    "mobile":  { "lcp_ms": <number ≥ 0>, "inp_ms": <number ≥ 0>, "cls": <number ≥ 0> },
    "desktop": { "lcp_ms": <number ≥ 0>, "inp_ms": <number ≥ 0>, "cls": <number ≥ 0> }
  },
  "lighthouse_score": <0-100, optional>,
  "signals": [
    { "id": "<kebab-case>", "label": "<short label>", "severity": "high|medium|low|info", "detail": "<one sentence>" }
  ]
}
\`\`\`

The data block is parsed and removed before the note is rendered, so do NOT add commentary inside the fenced block. \`cwv\` values are 75th-percentile readings: prefer CrUX field data when present, otherwise fall back to PSI lab values. LCP/INP are milliseconds; CLS is unitless. If a value isn't available, emit 0 and add a signal explaining the gap. \`lighthouse_score\` should reflect mobile when both are present.

## Constraints

- Quote actual numbers from the payload, not generic "improve LCP" advice.
- Don't claim ranking impact for lab improvements that field data doesn't reflect.
- Do NOT include a closing summary, sign-off, or call to action — the report ends after the structured findings block.

## Note about Search Console & GA4

These require OAuth (not just an API key) and are not wired in v1. Don't mention them in the recommendations.`;

const InputSchema = z.object({});
type Input = z.infer<typeof InputSchema>;

interface PSISummary {
  status: number;
  performanceScore: number | null;
  audits: Array<{ id: string; title: string; displayValue?: string; score: number | null }>;
  warnings: string[];
}

interface CruxSummary {
  status: number;
  hasFieldData: boolean;
  metrics: Record<string, { percentile?: number; category?: string }>;
  warnings: string[];
}

async function fetchPSI(
  url: string,
  key: string,
  strategy: "mobile" | "desktop",
): Promise<PSISummary> {
  const psiUrl =
    `https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed` +
    `?url=${encodeURIComponent(url)}&key=${encodeURIComponent(key)}` +
    `&strategy=${strategy}&category=performance`;
  const res = await fetch(psiUrl);
  if (!res.ok) {
    return {
      status: res.status,
      performanceScore: null,
      audits: [],
      warnings: [`PSI ${strategy} HTTP ${res.status}`],
    };
  }
  const j = (await res.json()) as {
    lighthouseResult?: {
      categories?: { performance?: { score?: number } };
      audits?: Record<
        string,
        { id?: string; title?: string; displayValue?: string; score?: number | null }
      >;
    };
  };
  const score = j.lighthouseResult?.categories?.performance?.score ?? null;
  const auditMap = j.lighthouseResult?.audits ?? {};
  const audits = Object.entries(auditMap)
    .filter(([, a]) => a.score !== null && a.score !== 1)
    .slice(0, 10)
    .map(([id, a]) => ({
      id,
      title: a.title ?? id,
      displayValue: a.displayValue,
      score: a.score ?? null,
    }));
  return { status: res.status, performanceScore: score, audits, warnings: [] };
}

async function fetchCrux(url: string, key: string): Promise<CruxSummary> {
  const cruxUrl = `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(key)}`;
  const res = await fetch(cruxUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (res.status === 404) {
    return { status: 404, hasFieldData: false, metrics: {}, warnings: ["no field data for URL"] };
  }
  if (!res.ok) {
    return {
      status: res.status,
      hasFieldData: false,
      metrics: {},
      warnings: [`CrUX HTTP ${res.status}`],
    };
  }
  const j = (await res.json()) as {
    record?: {
      metrics?: Record<string, { percentiles?: { p75?: number }; histogram?: Array<{ start: number; end?: number; density: number }> }>;
    };
  };
  const metricsRaw = j.record?.metrics ?? {};
  const metrics: Record<string, { percentile?: number; category?: string }> = {};
  for (const [k, v] of Object.entries(metricsRaw)) {
    const p75 = v.percentiles?.p75;
    let category: string | undefined;
    if (typeof p75 === "number") {
      // Web Vitals thresholds (LCP ms, INP ms, CLS unitless)
      if (k === "largest_contentful_paint") {
        category = p75 <= 2500 ? "good" : p75 <= 4000 ? "needs-improvement" : "poor";
      } else if (k === "interaction_to_next_paint") {
        category = p75 <= 200 ? "good" : p75 <= 500 ? "needs-improvement" : "poor";
      } else if (k === "cumulative_layout_shift") {
        category = p75 <= 10 ? "good" : p75 <= 25 ? "needs-improvement" : "poor";
      }
    }
    metrics[k] = { percentile: p75, category };
  }
  return { status: 200, hasFieldData: Object.keys(metrics).length > 0, metrics, warnings: [] };
}

const googleSuite: Specialist<Input> = {
  id: "google-suite",
  name: "Google Suite",
  description:
    "PageSpeed Insights + Chrome UX Report field data. Search Console + GA4 require OAuth and ship later.",
  desk: "desk.google-suite",
  inputSchema: InputSchema,
  async execute(ctx) {
    requireIntegrations(["google"]);
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    const key = envValue("GOOGLE_API_KEY");
    const url = manifest.site_under_audit;

    ctx.emit("progress", "Running PageSpeed Insights (mobile + desktop) + CrUX…", {
      progress: 0.1,
    });
    // All three calls are independent — run in parallel to cut wall-clock from
    // ~3× to 1× the slowest call.
    const [psiMobile, psiDesktop, crux] = await Promise.all([
      fetchPSI(url, key, "mobile"),
      fetchPSI(url, key, "desktop"),
      fetchCrux(url, key),
    ]);
    ctx.emit(
      "log",
      `PSI mobile: ${psiMobile.performanceScore !== null ? Math.round(psiMobile.performanceScore * 100) : "n/a"}/100 · desktop: ${psiDesktop.performanceScore !== null ? Math.round(psiDesktop.performanceScore * 100) : "n/a"}/100`,
    );
    ctx.emit(
      "log",
      crux.hasFieldData
        ? `CrUX: ${Object.keys(crux.metrics).length} metric(s) returned.`
        : `CrUX: no field data for this URL.`,
    );

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.65 });

    const payload = { url, psiMobile, psiDesktop, crux };
    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 3500,
      temperature: 0.3,
      messages: [
        {
          role: "user",
          content: `Google suite payload:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        },
      ],
    });

    const today = new Date().toISOString().slice(0, 10);
    const { data, body: bodyWithChart } = applyStructuredOutput({
      rawText: result.text,
      expectedKind: "page-speed",
      chartSpec: (d) => ({
        type: "bar",
        title: "LCP (ms)",
        ref: sidecarRef(today, "google-suite"),
        data: [
          { category: "mobile", count: Math.round(d.cwv.mobile.lcp_ms) },
          { category: "desktop", count: Math.round(d.cwv.desktop.lcp_ms) },
        ],
      }),
    });
    if (data) {
      ctx.emit(
        "log",
        `Structured findings parsed — mobile LCP ${Math.round(data.cwv.mobile.lcp_ms)}ms, desktop LCP ${Math.round(data.cwv.desktop.lcp_ms)}ms, ${data.signals.length} signal${data.signals.length === 1 ? "" : "s"}`,
      );
    } else {
      ctx.emit("log", "No valid structured findings block — skipping sidecar + HTML report");
    }

    ctx.emit("progress", "Writing Google audit to vault…", { progress: 0.9 });
    const { relativePath, executionResult, reportPath, dataPath } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "google-suite",
        frontmatterType: "audit",
        title: `Google audit — ${url}`,
        body: bodyWithChart,
        tags: ["audit", "google", "cwv", "claude-generated"],
        url,
        reportSubtitle: data
          ? `mobile LCP ${Math.round(data.cwv.mobile.lcp_ms)}ms · desktop LCP ${Math.round(data.cwv.desktop.lcp_ms)}ms${data.lighthouse_score != null ? ` · Lighthouse ${data.lighthouse_score}/100` : ""}`
          : undefined,
        ...(data ? { data } : {}),
        costUsd: result.costUsd ?? 0,
      },
      {
        facts: [
          `Google audit run on ${url} (PSI mobile: ${psiMobile.performanceScore !== null ? Math.round(psiMobile.performanceScore * 100) + "/100" : "n/a"}, desktop: ${psiDesktop.performanceScore !== null ? Math.round(psiDesktop.performanceScore * 100) + "/100" : "n/a"}).`,
          crux.hasFieldData
            ? `Field data present for ${Object.keys(crux.metrics).length} metric(s).`
            : "No field data — origin may be low-traffic or new.",
        ],
        threadTitle: "Google audit",
        threadRationale: "fix failing Core Web Vital, re-measure in 28d",
        statusNote: "Google audit on file — field data is the source of truth for CWV.",
      },
    );

    return {
      summary: reportPath
        ? `Google audit written to ${relativePath} (report: ${reportPath})`
        : `Google audit written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      ...(reportPath ? { reportPath } : {}),
      ...(dataPath ? { dataPath } : {}),
      data: {
        performanceScoreMobile: psiMobile.performanceScore,
        performanceScoreDesktop: psiDesktop.performanceScore,
        hasFieldData: crux.hasFieldData,
        ...(data ? { structured: data } : {}),
      },
    };
  },
};

registerSpecialist(googleSuite);
export default googleSuite;
