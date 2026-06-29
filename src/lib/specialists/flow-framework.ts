/**
 * FLOW Framework — Find → Leverage → Optimize → Win.
 *
 * Applies the FLOW loop to the client's site based on whatever question / topic
 * the user passes in. Defaults to a generic strategic application if no topic
 * is given. Ports the prompt logic from claude-seo's `seo-flow` skill.
 */
import "server-only";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { extractSignals } from "./_lib/fetch-signals";
import { writeArtifact } from "./_lib/artifact";

const SYSTEM_PROMPT = `You are the FLOW Framework specialist inside SEO Office.

FLOW is an evidence-led SEO loop with four stages:
- **Find** — surface the highest-leverage opportunity (keyword cluster, page-type gap, missing schema). Be specific, not generic.
- **Leverage** — what asset / signal can we use that competitors can't easily replicate? (Real photos, customer data, internal expertise, owned tooling.)
- **Optimize** — concrete on-page or off-page move that compounds the Leverage.
- **Win** — the measurable outcome we expect, with a falsification rule (what would prove this is wrong?).

You receive: the site under audit, a topic/question (optional), and a compact snapshot of the homepage (title, headings, visible text sample).

## Output contract

Produce a Markdown report with these sections, in order:

1. **Topic framing** — restate what we're applying FLOW to in one sentence. If no topic was given, pick the most valuable strategic question implied by the site snapshot.
2. **Find** — 2-3 specific opportunities, each with: short title, why it matters, the evidence you'd verify it with.
3. **Leverage** — the unique asset / signal we will lean on. Be honest about what we don't have.
4. **Optimize** — exactly 3 numbered moves, each with title, why-this-now, effort (S/M/L), expected impact (S/M/L).
5. **Win** — what we'd expect to see in 30 / 60 / 90 days; explicit falsification rule.

## Constraints

- Be terse and evidence-led. Quote visible text when you reference the site.
- No vague "improve SEO" recommendations — every move must be verifiable.
- End after the Win section.`;

const InputSchema = z.object({
  topic: z.string().optional(),
});
type Input = z.infer<typeof InputSchema>;

const flowFramework: Specialist<Input> = {
  id: "flow-framework",
  name: "FLOW Framework",
  description:
    "Find → Leverage → Optimize → Win loop applied to a topic or the site as a whole.",
  desk: "desk.flow-framework",
  inputSchema: InputSchema,
  async execute(ctx) {
    const input = ctx.input;
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    ctx.emit("progress", `Fetching ${manifest.site_under_audit}…`, { progress: 0.15 });
    const signals = await extractSignals(manifest.site_under_audit);

    const provider = await selectProvider();
    ctx.emit("progress", `Applying FLOW via ${provider.name}…`, { progress: 0.45 });

    const payload = {
      site: manifest.site_under_audit,
      topic: input.topic ?? null,
      snapshot: {
        title: signals.title,
        h1: signals.h1,
        h2: signals.h2.slice(0, 12),
        visibleTextSample: signals.visibleText.slice(0, 2500),
        internalLinkSamples: signals.internalLinkSamples,
      },
    };

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 3072,
      temperature: 0.5,
      messages: [
        {
          role: "user",
          content: `Apply FLOW to this:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        },
      ],
    });

    ctx.emit("progress", "Writing FLOW plan to vault…", { progress: 0.85 });
    const slug = input.topic
      ? input.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30) || "flow"
      : "flow";
    const { relativePath, executionResult } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "deliverables",
        type: slug,
        frontmatterType: "deliverable",
        title: input.topic ? `FLOW — ${input.topic}` : `FLOW — ${manifest.site_under_audit}`,
        body: result.text,
        tags: ["deliverable", "flow", "strategy", "claude-generated"],
        costUsd: result.costUsd ?? 0,
      },
      {
        facts: [
          `FLOW loop applied${input.topic ? ` to "${input.topic}"` : ""}.`,
        ],
        threadTitle: "FLOW plan",
        threadRationale: "verify Find/Leverage assumptions before executing Optimize moves",
        statusNote: "FLOW plan on file — review Win criteria, then commit to one Optimize move.",
      },
    );

    return {
      summary: `FLOW plan written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
    };
  },
};

registerSpecialist(flowFramework);
export default flowFramework;
