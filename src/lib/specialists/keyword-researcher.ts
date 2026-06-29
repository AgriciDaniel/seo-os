/**
 * Keyword Researcher.
 *
 * v0.1.3 scope: LLM-driven seed-keyword + cluster ideation. Reads the
 * manifest, derives the site's topical scope from title/h1/paragraphs, and
 * asks the LLM to propose seed clusters scored by intent + difficulty.
 *
 * DataForSEO integration (real volume + difficulty data) lands in v0.1.4
 * via the Python bridge to vendored marketing-brain/scripts/find_competitors.py.
 */
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { vaultRoot } from "@/lib/brain/paths";
import { readManifest, writeManifest } from "@/lib/orchestrator/client-context";
import {
  registerSpecialist,
  type Specialist,
  type SpecialistContext,
} from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { isConfigured as dataforseoConfigured } from "@/lib/integrations/dataforseo";
import { runMarketingBrainScript } from "@/lib/marketing-brain/scripts";
import { extractSignals } from "./_lib/fetch-signals";
import { inferBusinessType } from "./_lib/business-type";
import { writeArtifact } from "./_lib/artifact";
import { applyStructuredOutput, sidecarRef } from "./_lib/structured-output";
import { updateCanonicalNote } from "@/lib/brain/canonical-writer";

const SYSTEM_PROMPT = `You are the Keyword Researcher inside SEO Office.

You receive a compact JSON payload describing a website (URL, title, headings, a paragraph sample, business type, whether DataForSEO is configured). Your job is to propose a starter keyword research plan grounded in what you can see.

## Output contract

Produce a Markdown report with exactly these sections, in this order:

1. **Topical scope** — 1-2 sentences naming the apparent topical territory of the site based on visible content.
2. **Seed clusters** — table of 8-12 rows, columns: \`Cluster\`, \`Apparent intent\`, \`Difficulty guess (S/M/L)\`, \`Why this fits\`. Group related keywords; don't list 50 individual phrases.
3. **Top 20 starter keywords** — bullet list, one per line: \`<keyword>  ·  intent: <I/C/T/N>  ·  why\`. Cover all clusters.
4. **Cluster prioritisation** — recommend the 3 clusters to tackle first, with reasoning that considers buyer journey + winnability for a small site.
5. **Data gaps** — explicit list of what you can't know without real data (volume, difficulty, SERP composition, competitor overlap, seasonality).
6. **Action plan** — exactly 5 numbered actions, each with: title, why, effort (S/M/L), impact (S/M/L). The first action MUST be "Pull DataForSEO volume + difficulty for the top 20 seeds" if DataForSEO isn't yet configured.

After the action plan, append a final section:

7. **Structured findings (machine-readable)** — a single fenced code block tagged \`data\` containing JSON that matches this schema:

\`\`\`data
{
  "kind": "keyword-research",
  "v": 1,
  "top_keywords": [
    {
      "keyword": "<keyword phrase>",
      "volume": <integer monthly search volume, best estimate when DataForSEO isn't configured>,
      "difficulty": <0-100, optional>,
      "intent": "informational|commercial|transactional|navigational"
    }
  ],
  "intent_mix": [
    { "label": "informational|commercial|transactional|navigational", "value": <number ≥ 0> }
  ]
}
\`\`\`

\`top_keywords\` lists up to 50 keywords ordered by descending estimated monthly volume; include the 20 starter keywords from section 3 plus any additional cluster heads worth tracking. When DataForSEO isn't configured, supply a best-guess integer volume (never 0 unless you're certain the term has no search demand). \`intent_mix\` is the share each intent represents across \`top_keywords\` — values are relative weights, not percentages.

## Voice and constraints

- Be terse, no fluff. No promised traffic numbers in prose.
- If business_type is present, weight cluster suggestions toward that vertical's common patterns.
- Use intent labels: I (informational), C (commercial-investigation), T (transactional), N (navigational) in prose; in the data block use the full lowercase words ("informational", "commercial", "transactional", "navigational").
- End after the structured findings block.

The data block is parsed and removed before the note is rendered, so do NOT add commentary inside the fenced block.`;

const InputSchema = z.object({});
type Input = z.infer<typeof InputSchema>;

const keywordResearcher: Specialist<Input> = {
  id: "keyword-researcher",
  name: "Keyword Researcher",
  description:
    "Proposes a starter keyword research plan with seed clusters and prioritisation, grounded in visible page content.",
  desk: "desk.keyword-researcher",
  inputSchema: InputSchema,
  async execute(ctx) {
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    ctx.emit("progress", `Fetching ${manifest.site_under_audit}…`, { progress: 0.1 });
    const signals = await extractSignals(manifest.site_under_audit);

    // Resolve business_type NOW, while we have the homepage signals and BEFORE
    // the competitor specialist (which depends on this job) runs. Minimal-intake
    // leaves it "unknown", which otherwise poisons competitor SERP queries.
    if (!manifest.business_type || manifest.business_type === "unknown") {
      const guess = inferBusinessType(signals);
      if (guess.type) {
        manifest.business_type = guess.type;
        await writeManifest(ctx.clientSlug, manifest);
        ctx.emit(
          "log",
          `Resolved business_type → "${guess.type}" (${guess.confidence}: ${guess.signals.join(", ")})`,
        );
      } else {
        ctx.emit("log", "business_type left unresolved — no confident signal from the homepage.");
      }
    }

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.4 });

    const compact = {
      url: signals.url,
      title: signals.title,
      h1: signals.h1,
      h2: signals.h2,
      metaDescription: signals.metaDescription,
      paragraphSamples: signals.paragraphs.slice(0, 8),
      dataforseo_configured: dataforseoConfigured(),
    };

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 4096,
      temperature: 0.55,
      messages: [
        {
          role: "user",
          content: `Propose a keyword research plan for this site. Payload follows.\n\n\`\`\`json\n${JSON.stringify(compact, null, 2)}\n\`\`\``,
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
      expectedKind: "keyword-research",
      chartSpec: (d) => ({
        type: "bar",
        title: "Top keywords by monthly volume",
        ref: sidecarRef(today, "keywords"),
        field: "top_keywords",
        data: d.top_keywords.slice(0, 12).map((k) => ({
          category: k.keyword,
          count: k.volume,
        })),
      }),
    });
    if (data) {
      ctx.emit(
        "log",
        `Structured findings parsed — ${data.top_keywords.length} keyword${data.top_keywords.length === 1 ? "" : "s"}, ${data.intent_mix.length} intent bucket${data.intent_mix.length === 1 ? "" : "s"}`,
      );
    } else {
      ctx.emit("log", "No valid structured findings block — skipping sidecar + HTML report");
    }

    ctx.emit("progress", "Writing keyword research to vault…", { progress: 0.85 });

    const { relativePath, executionResult, reportPath, dataPath } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "keywords",
        frontmatterType: "audit",
        title: `Keyword research — ${manifest.site_under_audit}`,
        body: bodyWithChart,
        tags: ["audit", "keywords", "claude-generated"],
        url: manifest.site_under_audit,
        reportSubtitle: data
          ? `${data.top_keywords.length} keywords · ${data.intent_mix.length} intent bucket${data.intent_mix.length === 1 ? "" : "s"}`
          : undefined,
        ...(data ? { data } : {}),
        costUsd: result.costUsd ?? 0,
      },
      {
        facts: [
          `Keyword research run on ${manifest.site_under_audit}.`,
          dataforseoConfigured()
            ? `DataForSEO configured — quantitative pass available next.`
            : `DataForSEO not configured — quantitative data pending.`,
        ],
        threadTitle: "Keyword research",
        threadRationale: "review clusters + prioritise the first 3",
        statusNote:
          dataforseoConfigured()
            ? "Keyword plan on file — pull real volumes next."
            : "Keyword plan on file — configure DataForSEO for real volumes.",
      },
    );

    const bridge = await runKeywordMarketingBrainBridge(ctx);

    const provenance = dataforseoConfigured() ? "live_api" : "model_estimate";
    // Distribute keywords across the site's REAL pages (the homepage's internal
    // links) instead of slamming every term onto "/". Token-match each keyword
    // to the closest candidate path; fall back to "/" only when nothing matches.
    const candidateUrls = Array.from(
      new Set(signals.internalLinkSamples.filter((p) => p && p !== "/")),
    );
    const assignments =
      data?.top_keywords.slice(0, 25).map((keyword) => ({
        keyword: keyword.keyword,
        volume: keyword.volume,
        intent: keyword.intent ?? "informational",
        url: assignKeywordUrl(keyword.keyword, candidateUrls),
      })) ?? [];
    const keywordRows = assignments.map(
      (a) => `| ${escapeTable(a.keyword)} | ${a.url} | ${a.volume} | ${a.intent} | ${provenance} |`,
    );
    const keywordTable = [
      "| Keyword | Canonical URL | Volume | Intent | Provenance |",
      "| --- | --- | ---: | --- | --- |",
      ...(keywordRows.length
        ? keywordRows
        : [
            `| ${escapeTable(signals.title || manifest.site_under_audit)} | / | n/a | informational | manual |`,
          ]),
    ].join("\n");

    await updateCanonicalNote(
      ctx.clientSlug,
      "wiki/keywords/Keyword Targets and Page Map.md",
      "keyword-map",
      [
        "Generated by SEO Office keyword researcher.",
        "",
        keywordTable,
        "",
        ...(bridge.artifactPaths.length
          ? [
              "Marketing Brain script artifacts:",
              ...bridge.artifactPaths.map((artifact) => `- ${artifact}`),
              "",
            ]
          : []),
        `Evidence: [[${relativePath.replace(/^wiki\//, "").replace(/\.md$/, "")}]].`,
      ].join("\n"),
    );
    await updateCanonicalNote(
      ctx.clientSlug,
      "wiki/decisions/Keyword to URL Map.md",
      "keyword-url-decisions",
      [
        bridge.workbookReady
          ? "Initial canonical URL decisions. A Marketing Brain keyword workbook was generated from raw DataForSEO inputs."
          : "Initial canonical URL decisions. Treat model-estimated rows as provisional until DataForSEO is connected and raw competitor keywords exist.",
        "",
        keywordTable,
      ].join("\n"),
    );
    await updateCanonicalNote(
      ctx.clientSlug,
      "wiki/sources/DataForSEO Keyword Exports.md",
      "dataforseo-keywords",
      dataforseoConfigured()
        ? [
            `DataForSEO is configured. Latest keyword artifact: [[${relativePath.replace(/^wiki\//, "").replace(/\.md$/, "")}]].`,
            bridge.artifactPaths.length
              ? `Marketing Brain raw/workbook artifacts: ${bridge.artifactPaths.map((artifact) => `\`${artifact}\``).join(", ")}.`
              : `Marketing Brain workbook could not be generated yet: ${bridge.message ?? "raw competitor keyword inputs are missing"}.`,
          ].join("\n\n")
        : `No live DataForSEO export was available for this run. Keyword volumes in [[${relativePath.replace(/^wiki\//, "").replace(/\.md$/, "")}]] are marked \`model_estimate\` and must not be treated as live evidence.`,
    );
    await updateCanonicalNote(
      ctx.clientSlug,
      "wiki/keywords/Keyword Cannibalization Ledger.md",
      "keyword-cannibalization",
      renderCannibalizationLedger(assignments),
    );

    return {
      summary: reportPath
        ? `Keyword research written to ${relativePath} (report: ${reportPath})`
        : `Keyword research written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      ...(reportPath ? { reportPath } : {}),
      ...(dataPath ? { dataPath } : {}),
      data: {
        dataforseoConfigured: dataforseoConfigured(),
        marketingBrainBridge: bridge,
        ...(data ? { structured: data } : {}),
      },
      evidence: [
        {
          claim: dataforseoConfigured()
            ? "Keyword map was generated with DataForSEO available."
            : "Keyword map was generated from visible page signals and model-estimated demand.",
          provenance,
          source_paths: [
            relativePath,
            "wiki/keywords/Keyword Targets and Page Map.md",
            "wiki/sources/DataForSEO Keyword Exports.md",
            ...bridge.artifactPaths,
          ],
          confidence: dataforseoConfigured() ? "high" : "medium",
          cost_usd: result.costUsd ?? 0,
        },
      ],
      degraded: !dataforseoConfigured() || !bridge.workbookReady,
      ...(!dataforseoConfigured() || !bridge.workbookReady
        ? {
            degradationReason: !dataforseoConfigured()
              ? "DataForSEO is not configured; volumes are model estimates."
              : bridge.message ?? "Marketing Brain keyword workbook could not be generated.",
          }
        : {}),
    };
  },
};

registerSpecialist(keywordResearcher);

export default keywordResearcher;

function escapeTable(value: string): string {
  return value.replace(/\|/g, "/").replace(/\n/g, " ").trim();
}

/**
 * Assign a keyword to the best-matching candidate page path by token overlap.
 * Candidates are the homepage's internal links (real site pages). Falls back to
 * "/" only when no path shares a meaningful token with the keyword — this is
 * what prevents the all-keywords-on-"/" cannibalization the old hardcoded
 * default produced.
 */
function assignKeywordUrl(keyword: string, candidates: string[]): string {
  const words = keyword.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  let best = "/";
  let bestScore = 0;
  for (const candidate of candidates) {
    const slug = candidate.toLowerCase().replace(/[^a-z0-9]+/g, " ");
    const score = words.filter((w) => slug.includes(w)).length;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** Populate the previously-empty Keyword Cannibalization Ledger: group keywords
 *  by target URL and flag the single-URL collapse the old default caused. */
function renderCannibalizationLedger(
  assignments: Array<{ keyword: string; url: string; intent: string }>,
): string {
  if (assignments.length === 0) {
    return "No keyword assignments yet — re-run keyword research with structured findings to populate this ledger.";
  }
  const byUrl = new Map<string, string[]>();
  for (const a of assignments) {
    byUrl.set(a.url, [...(byUrl.get(a.url) ?? []), a.keyword]);
  }
  const distinct = byUrl.size;
  const lines: string[] = [
    `**${assignments.length} keywords mapped across ${distinct} distinct URL${distinct === 1 ? "" : "s"}.**`,
    "",
  ];
  if (distinct === 1 && assignments.length > 1) {
    lines.push(
      "> ⚠️ **High cannibalization risk:** every keyword targets a single URL. " +
        "Distribute commercial vs informational intent across dedicated topic pages.",
      "",
    );
  } else {
    lines.push(
      "No single-URL collapse detected. Review per-URL groupings below for over-loaded pages.",
      "",
    );
  }
  lines.push("| Target URL | # keywords | Keywords |", "| --- | ---: | --- |");
  for (const [url, kws] of [...byUrl.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(
      `| ${url} | ${kws.length} | ${kws.slice(0, 8).map((k) => escapeTable(k)).join(", ")}${kws.length > 8 ? " …" : ""} |`,
    );
  }
  return lines.join("\n");
}

async function runKeywordMarketingBrainBridge(
  ctx: SpecialistContext<Input>,
): Promise<{
  workbookReady: boolean;
  artifactPaths: string[];
  message?: string;
}> {
  if (!dataforseoConfigured()) {
    return {
      workbookReady: false,
      artifactPaths: [],
      message: "DataForSEO is not configured.",
    };
  }

  const artifactPaths: string[] = [];
  try {
    ctx.emit("progress", "Building Marketing Brain keyword workbook…", {
      progress: 0.9,
    });
    const workbook = await runMarketingBrainScript(
      ctx.clientSlug,
      "build-keyword-xlsx",
      {
        signal: ctx.signal,
        timeoutMs: 120_000,
        onLine: (line, stream) => ctx.emit("log", `[marketing-brain:${stream}] ${line}`),
      },
    );
    if (workbook.status === "needs_data") {
      return {
        workbookReady: false,
        artifactPaths,
        message: workbook.message,
      };
    }

    artifactPaths.push(...latestVaultFiles(ctx.clientSlug, /^keywords-\d{4}-\d{2}-\d{2}\.(xlsx|csv)$/));

    const csvPath = latestVaultFileAbs(ctx.clientSlug, /^keywords-\d{4}-\d{2}-\d{2}\.csv$/);
    if (csvPath) {
      ctx.emit("progress", "Mining PAA SERPs from Marketing Brain keyword workbook…", {
        progress: 0.93,
      });
      try {
        const paa = await runMarketingBrainScript(ctx.clientSlug, "mine-paa-serps", {
          signal: ctx.signal,
          timeoutMs: 180_000,
          args: ["--csv", csvPath, "--top-n", "25", "--total-cap", "1.00"],
          onLine: (line, stream) => ctx.emit("log", `[marketing-brain:${stream}] ${line}`),
        });
        if (paa.status === "succeeded") {
          artifactPaths.push(
            ...latestVaultFiles(
              ctx.clientSlug,
              /^\.raw\/sources\/dataforseo\/paa(-digest)?-\d{4}-\d{2}-\d{2}\.(json|md)$/,
            ),
          );
        }
      } catch (err) {
        ctx.emit(
          "log",
          `Marketing Brain PAA mining skipped: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      workbookReady: artifactPaths.some((artifact) => artifact.endsWith(".xlsx")),
      artifactPaths: [...new Set(artifactPaths)],
    };
  } catch (err) {
    return {
      workbookReady: false,
      artifactPaths: [...new Set(artifactPaths)],
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function latestVaultFileAbs(clientSlug: string, pattern: RegExp): string | null {
  const root = vaultRoot(clientSlug);
  const match = latestVaultFiles(clientSlug, pattern).at(-1);
  return match ? path.join(root, match) : null;
}

function latestVaultFiles(clientSlug: string, pattern: RegExp): string[] {
  const root = vaultRoot(clientSlug);
  const out: string[] = [];
  walk(root, root, pattern, out);
  return out.sort();
}

function walk(root: string, dir: string, pattern: RegExp, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".raw") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(root, abs, pattern, out);
      continue;
    }
    const rel = path.relative(root, abs).split(path.sep).join("/");
    if (pattern.test(rel)) out.push(rel);
  }
}
