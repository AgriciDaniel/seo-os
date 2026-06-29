/**
 * Schema Validator — inspects every JSON-LD block on the homepage,
 * Node-side validates parseability, then asks the LLM to comment on:
 * - schema type appropriateness for the page
 * - missing required fields per type
 * - rich-result eligibility hints
 * - opportunities to add additional schema
 *
 * Pure Node JSON validation runs first; the LLM gets a structured summary
 * of what was found, not raw HTML.
 */
import "server-only";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { extractSignals } from "./_lib/fetch-signals";
import { writeArtifact } from "./_lib/artifact";
import { applyStructuredOutput, sidecarRef } from "./_lib/structured-output";

const SYSTEM_PROMPT = `You are the Schema Validator inside SEO Office.

You receive a structured summary of every JSON-LD block found on a page plus the page's basic context (title, h1, og tags). Your job is to assess whether the structured data is correctly chosen for the page's intent and whether anything important is missing.

## Output contract

Produce a Markdown report with exactly these sections, in this order:

1. **Executive summary** — 3-5 bullets, each with severity tag \`[critical|high|medium|low|info]\`. Lead with the most consequential issue.
2. **Detected blocks** — bullet list, one per block: \`@type: <type>\`, then a 1-line take ("clean", "missing required fields: X, Y", "wrong type for this page kind", etc.).
3. **Parse failures** — if any JSON-LD failed JSON.parse, list them with the reported error and one-line remediation. If none, write "None — every block parsed cleanly."
4. **Missing schemas** — based on the page's apparent purpose (e.g. homepage vs article vs product), which schema types SHOULD be present that aren't?
5. **Rich-result eligibility** — quick assessment of which Google rich-result formats this page COULD qualify for if schemas are fixed (FAQ, How-To, Product, Article, Breadcrumb, etc.).
6. **Action plan** — exactly 5 numbered actions, each with: short title, why, effort (S/M/L), impact (S/M/L). Ordered by impact-per-effort.

After the action plan, append a final section:

7. **Structured findings (machine-readable)** — a single fenced code block tagged \`data\` containing JSON that matches this schema:

\`\`\`data
{
  "kind": "schema-validation",
  "v": 1,
  "entities": [
    {
      "type": "<schema.org @type, e.g. Organization>",
      "valid": <integer ≥ 0>,
      "invalid": <integer ≥ 0>,
      "missing": <integer ≥ 0>
    }
  ],
  "signals": [
    { "id": "<kebab-case>", "label": "<short label>", "severity": "high|medium|low|info", "detail": "<one sentence>" }
  ]
}
\`\`\`

\`entities\` should include one row per schema.org \`@type\` you detected or recommend. \`valid\` is the count of clean instances of that type on the page, \`invalid\` is the count with parse / required-field errors, and \`missing\` is how many instances SHOULD exist for the page's purpose but don't (typically 0 or 1 for top-level types like Organization). \`signals\` should mirror the bullets in the executive summary plus any per-block issues from "Detected blocks".

## Voice and constraints

- Reference the exact \`@type\` strings you see.
- Don't invent fields; only flag missing fields you can name from the schema.org spec.
- If there are zero JSON-LD blocks, your action plan #1 must be "Add minimal Organization + WebSite schema."
- End after the structured findings block.

The data block is parsed and removed before the note is rendered, so do NOT add commentary inside the fenced block.`;

const InputSchema = z.object({});
type Input = z.infer<typeof InputSchema>;

const schemaValidator: Specialist<Input> = {
  id: "schema-validator",
  name: "Schema Validator",
  description:
    "Parses every JSON-LD block on the homepage and reports type appropriateness, missing fields, and rich-result eligibility.",
  desk: "desk.schema-validator",
  inputSchema: InputSchema,
  async execute(ctx) {
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    ctx.emit("progress", `Fetching ${manifest.site_under_audit}…`, { progress: 0.1 });
    const signals = await extractSignals(manifest.site_under_audit);

    // Node-side: re-parse each block + pull top-level fields the LLM can use.
    const blocks = signals.jsonLd.map((b, i) => {
      let parsed: unknown = null;
      let topLevelKeys: string[] = [];
      let typeNames: string[] = [];
      if (!b.parseError) {
        try {
          parsed = JSON.parse(b.raw);
          if (parsed && typeof parsed === "object") {
            topLevelKeys = Object.keys(parsed as Record<string, unknown>);
            const t = (parsed as { "@type"?: string | string[] })["@type"];
            typeNames = Array.isArray(t) ? t : t ? [t] : [];
          }
        } catch (err) {
          b.parseError = err instanceof Error ? err.message : String(err);
        }
      }
      return {
        index: i,
        types: typeNames,
        topLevelKeys,
        parseError: b.parseError,
        raw: b.raw.slice(0, 500),
      };
    });

    ctx.emit("log", `Found ${blocks.length} JSON-LD block(s)`);

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.4 });

    const compact = {
      url: signals.url,
      pageContext: {
        title: signals.title,
        h1: signals.h1,
        metaDescription: signals.metaDescription,
        ogType: signals.ogTags.type ?? null,
      },
      jsonLd: blocks,
    };

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 3500,
      temperature: 0.35,
      messages: [
        {
          role: "user",
          content: `Validate the structured data. Payload follows.\n\n\`\`\`json\n${JSON.stringify(compact, null, 2)}\n\`\`\``,
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
      expectedKind: "schema-validation",
      chartSpec: (d) => {
        const totalValid = d.entities.reduce((s, e) => s + e.valid, 0);
        const totalInvalid = d.entities.reduce((s, e) => s + e.invalid, 0);
        const totalMissing = d.entities.reduce((s, e) => s + (e.missing ?? 0), 0);
        return {
          type: "bar",
          title: "Schema validation",
          ref: sidecarRef(today, "schema"),
          field: "entities",
          data: [
            { category: "Valid", count: totalValid },
            { category: "Invalid", count: totalInvalid },
            { category: "Missing", count: totalMissing },
          ],
        };
      },
    });
    if (data) {
      const totalValid = data.entities.reduce((s, e) => s + e.valid, 0);
      const totalInvalid = data.entities.reduce((s, e) => s + e.invalid, 0);
      ctx.emit(
        "log",
        `Structured findings parsed — ${data.entities.length} entity type${data.entities.length === 1 ? "" : "s"}, ${totalValid} valid / ${totalInvalid} invalid`,
      );
    } else {
      ctx.emit("log", "No valid structured findings block — skipping sidecar + HTML report");
    }

    ctx.emit("progress", "Writing schema audit to vault…", { progress: 0.85 });

    const { relativePath, executionResult, reportPath, dataPath } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "schema",
        frontmatterType: "audit",
        title: `Schema markup audit — ${manifest.site_under_audit}`,
        body: bodyWithChart,
        tags: ["audit", "schema", "json-ld", "claude-generated"],
        url: manifest.site_under_audit,
        reportSubtitle: data
          ? `${data.entities.length} entity type${data.entities.length === 1 ? "" : "s"} · ${data.entities.reduce((s, e) => s + e.invalid, 0)} invalid`
          : undefined,
        ...(data ? { data } : {}),
        costUsd: result.costUsd ?? 0,
      },
      {
        facts: [
          `Schema audit run on ${manifest.site_under_audit}.`,
          `${blocks.length} JSON-LD block(s) detected${blocks.length ? `: ${blocks.map((b) => b.types.join("/")).filter(Boolean).join(", ")}.` : "."}`,
          blocks.some((b) => b.parseError)
            ? `${blocks.filter((b) => b.parseError).length} block(s) failed JSON.parse.`
            : `All blocks parsed cleanly.`,
        ],
        threadTitle: "Schema markup",
        threadRationale: "review rich-result eligibility + missing schemas",
        statusNote:
          "Schema audit on file — fix parse errors first, then add missing schemas per action plan.",
      },
    );

    return {
      summary: reportPath
        ? `Schema audit written to ${relativePath} (report: ${reportPath})`
        : `Schema audit written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      ...(reportPath ? { reportPath } : {}),
      ...(dataPath ? { dataPath } : {}),
      data: {
        blockCount: blocks.length,
        parseErrors: blocks.filter((b) => b.parseError).length,
        ...(data ? { structured: data } : {}),
      },
    };
  },
};

registerSpecialist(schemaValidator);

export default schemaValidator;
