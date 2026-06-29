/**
 * Brand & Competitive Strategist.
 *
 * Reads the page's surface signals (title, h1, h2, meta description,
 * paragraph samples, OG tags) and produces a brand positioning brief +
 * competitor differentiation hypothesis. No external competitor data in
 * v0.1.3 — that comes later via DataForSEO competitor pulls.
 */
import "server-only";
import { z } from "zod";
import { readManifest, recordSource } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { fetchGitHubRepoMetadata } from "@/lib/integrations/github";
import { writeRaw } from "@/lib/brain/vault-fs";
import { extractSignals } from "./_lib/fetch-signals";
import { writeArtifact } from "./_lib/artifact";

const SYSTEM_PROMPT = `You are the Brand & Competitive Strategist inside SEO Office.

You receive a compact payload describing how a site presents itself to a first-time visitor (title, headings, meta description, lead paragraphs, OG tags, page structure). Your job is to articulate the brand's apparent positioning today and propose where it should differentiate from a typical competitor in its space.

## Output contract

Produce a Markdown report with exactly these sections, in this order:

1. **Brand snapshot** — 3-5 bullets capturing what this site is communicating right now. Cite the exact phrases / headings you read.
2. **Inferred positioning** — one paragraph naming the apparent positioning axis (e.g. "premium curated vs mass marketplace", "expert-led vs community-driven"). Note explicit positioning claims if any.
3. **Voice & tone** — what does the copy *sound* like? Tight vs verbose, technical vs plain, formal vs casual. Quote 1-2 short phrases.
4. **Differentiation gaps** — 3-5 bullets on what's MISSING from the homepage that a competitor could (or already does) own. Examples: proof, specificity, named expertise, transparent pricing, contrarian POV.
5. **Recommended positioning moves** — 5 concrete additions/changes to the homepage that would sharpen positioning, each with: short title, one-sentence why, effort (S/M/L), impact on competitive position (S/M/L).
6. **Competitor watch list** — 4-6 questions to investigate about competitors before committing to the moves above (e.g. "what claims do top-3 competitors make in their hero?"). These become inputs to the next research pass.

## Voice and constraints

- No traffic / ranking talk. This is about positioning, not SEO.
- Don't invent competitor names you can't see in the payload.
- Be specific about what the copy DOES say vs what you wish it said.
- End after the competitor watch list.`;

const InputSchema = z.object({
  github_url: z.string().url().optional(),
});
type Input = z.infer<typeof InputSchema>;

const brandStrategist: Specialist<Input> = {
  id: "brand-strategist",
  name: "Brand & Competitive Strategist",
  description:
    "Reads the homepage and produces a brand positioning brief + differentiation hypothesis + competitor watch list.",
  desk: "desk.brand-strategist",
  inputSchema: InputSchema,
  async execute(ctx) {
    const input = ctx.input;
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    ctx.emit("progress", `Fetching ${manifest.site_under_audit}…`, { progress: 0.1 });
    const signals = await extractSignals(manifest.site_under_audit);

    const githubUrl = input.github_url ?? manifest.github_url;
    const github = githubUrl ? await fetchGitHubRepoMetadata(githubUrl) : null;
    if (github) {
      const rawPath = `.raw/sources/github/${github.owner}-${github.repo}.json`;
      await writeRaw(ctx.clientSlug, rawPath, JSON.stringify(github, null, 2));
      await recordSource(ctx.clientSlug, `github:${github.owner}/${github.repo}`, {
        path: rawPath,
        retrieved_at: github.fetched_at,
        cost_usd: 0,
      });
      ctx.emit(
        "log",
        `GitHub repo: ${github.owner}/${github.repo} · ${github.stars} stars · ${github.recent_commits.length} recent commits`,
      );
    } else if (githubUrl) {
      ctx.emit("log", `GitHub metadata unavailable for ${githubUrl}; continuing with site signals.`);
    }

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.4 });

    const compact = {
      url: signals.url,
      title: signals.title,
      metaDescription: signals.metaDescription,
      h1: signals.h1,
      h2: signals.h2,
      h3: signals.h3,
      leadParagraphs: signals.paragraphs.slice(0, 6),
      ogTags: signals.ogTags,
      twitterTags: signals.twitterTags,
      wordCount: signals.wordCount,
      githubRepository: github,
    };

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 4096,
      temperature: 0.55,
      messages: [
        {
          role: "user",
          content: `${github ? "Assess this site's brand positioning using the website plus the GitHub repository metadata as a major owned SEO surface." : "Assess this site's brand positioning."} Payload follows.\n\n\`\`\`json\n${JSON.stringify(compact, null, 2)}\n\`\`\``,
        },
      ],
    });

    ctx.emit(
      "log",
      `${provider.id}${result.model ? " · " + result.model : ""}${result.durationMs ? " · " + (result.durationMs / 1000).toFixed(1) + "s" : ""}${result.costUsd != null ? " · $" + result.costUsd.toFixed(4) : ""}`,
    );
    ctx.emit("progress", "Writing brand brief to vault…", { progress: 0.85 });

    const { relativePath, executionResult } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "brand",
        frontmatterType: "audit",
        title: `Brand positioning brief — ${manifest.site_under_audit}`,
        body: result.text,
        tags: ["audit", "brand", "positioning", "claude-generated"],
        costUsd: result.costUsd ?? 0,
      },
      {
        facts: [
          `Brand positioning brief run on ${manifest.site_under_audit}.`,
          signals.title ? `Hero title: "${signals.title.slice(0, 60)}".` : `No hero title.`,
          github
            ? `GitHub source included: ${github.owner}/${github.repo} (${github.stars} stars, ${github.recent_commits.length} recent commits sampled).`
            : null,
        ].filter((fact): fact is string => Boolean(fact)),
        threadTitle: "Brand positioning",
        threadRationale: "review differentiation gaps + commit to a sharper axis",
        statusNote:
          "Brand brief on file — investigate competitor watch list, then refine positioning moves.",
      },
    );

    return {
      summary: `Brand brief written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      data: { wordCount: signals.wordCount },
    };
  },
};

registerSpecialist(brandStrategist);

export default brandStrategist;
