/**
 * Programmatic Strategist — designs template-driven pages at scale with
 * anti-thin-content safeguards.
 *
 * Ports the strategic synthesis from claude-seo's `seo-programmatic` skill.
 */
import "server-only";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { extractSignals } from "./_lib/fetch-signals";
import { writeArtifact } from "./_lib/artifact";

const SYSTEM_PROMPT = `You are the Programmatic Strategist inside SEO Office.

Programmatic SEO = generating pages at scale from a data source. Your job is to design a plan that captures the long tail without tripping Google's thin-content / index-bloat heuristics.

You receive: the site under audit, an optional pattern hint (e.g. "city + service", "product + use case"), the visible homepage snapshot, and the business type from the manifest.

## Output contract

Produce a Markdown report with these sections, in order:

1. **Pattern** — the proposed (variable_1, variable_2, …) template. Concrete with examples ("/locations/{city}-{service}").
2. **Data source** — what feeds the template? If the client doesn't have it yet, name the cheapest way to obtain it.
3. **Per-page content budget** — minimum unique words, minimum unique data points, minimum unique media. The numbers separate thin from substantive.
4. **Anti-thin safeguards** — exactly 5 rules: thresholds at which a page should NOT generate, deduplication strategy, internal-link strategy, canonical strategy, noindex strategy.
5. **Index-bloat prevention** — sitemap structure, crawl-budget plan, robots policy.
6. **Validation checkpoints** — what we'll measure at 100 / 1k / 10k pages to confirm or kill the program.
7. **Risks** — 2-4 honest failure modes and their early-warning signals.

## Constraints

- Be terse, concrete, evidence-led.
- No "set it and forget it" — every recommendation must have a measurement.
- End after Risks.`;

const InputSchema = z.object({
  pattern: z.string().optional(),
});
type Input = z.infer<typeof InputSchema>;

const programmaticStrategist: Specialist<Input> = {
  id: "programmatic-strategist",
  name: "Programmatic Strategist",
  description:
    "Template-driven pages at scale with anti-thin-content safeguards and index-bloat prevention.",
  desk: "desk.programmatic-strategist",
  inputSchema: InputSchema,
  async execute(ctx) {
    const input = ctx.input;
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    ctx.emit("progress", `Fetching ${manifest.site_under_audit}…`, { progress: 0.15 });
    const signals = await extractSignals(manifest.site_under_audit);

    const provider = await selectProvider();
    ctx.emit("progress", `Designing program via ${provider.name}…`, { progress: 0.45 });

    const payload = {
      site: manifest.site_under_audit,
      patternHint: input.pattern ?? null,
      snapshot: {
        title: signals.title,
        h1: signals.h1,
        h2: signals.h2.slice(0, 10),
        visibleTextSample: signals.visibleText.slice(0, 2000),
        internalLinkSamples: signals.internalLinkSamples,
      },
    };

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 3500,
      temperature: 0.4,
      messages: [
        {
          role: "user",
          content: `Design a programmatic SEO program:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        },
      ],
    });

    ctx.emit("progress", "Writing program plan to vault…", { progress: 0.85 });
    const { relativePath, executionResult } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "deliverables",
        type: "programmatic-program",
        frontmatterType: "deliverable",
        title: input.pattern
          ? `Programmatic plan — ${input.pattern}`
          : `Programmatic plan — ${manifest.site_under_audit}`,
        body: result.text,
        tags: ["deliverable", "programmatic", "scale", "claude-generated"],
        risk: "medium",
        costUsd: result.costUsd ?? 0,
      },
      {
        facts: [
          `Programmatic SEO plan drafted${input.pattern ? ` for "${input.pattern}"` : ""}.`,
        ],
        threadTitle: "Programmatic SEO plan",
        threadRationale: "verify data source + per-page content budget before scaling",
        statusNote: "Programmatic plan on file — gate at 100 pages before scaling.",
      },
    );

    return {
      summary: `Programmatic plan written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
    };
  },
};

registerSpecialist(programmaticStrategist);
export default programmaticStrategist;
