/**
 * Hreflang Auditor — extracts hreflang annotations from the homepage, validates
 * language/region codes, and LLM-synthesizes a report.
 *
 * Ports the logic from claude-seo's `seo-hreflang` skill.
 */
import "server-only";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { extractSignals } from "./_lib/fetch-signals";
import { writeArtifact } from "./_lib/artifact";

const SYSTEM_PROMPT = `You are the Hreflang Auditor inside SEO Office.

You receive a JSON payload listing every \`<link rel="alternate" hreflang="…" href="…">\` declaration on a homepage, plus a per-tag validation verdict.

## Output contract

Produce a Markdown report with exactly these sections, in order:

1. **Executive summary** — 3-5 bullets tagged \`[critical|high|medium|low|info]\`.
2. **Inventory** — table of (hreflang, href, verdict) for every annotation. Mark invalid codes, malformed hrefs, and self-references.
3. **Coverage gaps** — does the set include \`x-default\`? Are language-only and language-region pairs both present where needed? Any obviously-missing markets given the brand?
4. **Common errors** — call out: invalid ISO 639-1 codes, invalid ISO 3166-1 alpha-2 region codes, mismatched protocols, non-absolute hrefs, missing reciprocal annotations.
5. **Recommendations** — exactly 5 numbered actions, each with title, one-sentence why, effort (S/M/L), impact (S/M/L). Sorted by impact-per-effort.

## Constraints

- Be terse and evidence-led. Quote specific hreflang values when calling out errors.
- If zero hreflangs are present, say so and recommend whether the site even needs them (based on whether the visible content suggests an international audience).
- End after the recommendations.`;

const DeclaredLocaleSchema = z.object({
  code: z.string().optional(),
  location_name: z.string().optional(),
  language_name: z.string().optional(),
  site_url: z.string().url().optional(),
  timezone: z.string().optional(),
});
const InputSchema = z.object({
  declared_locales: z.array(DeclaredLocaleSchema).optional(),
});
type Input = z.infer<typeof InputSchema>;

// ISO 639-1 + ISO 3166-1 alpha-2 — quick regex validators
const LANG_REGEX = /^[a-z]{2,3}$/;
const REGION_REGEX = /^[A-Z]{2}$/;

interface HreflangAudit {
  url: string;
  declaredLocales: Input["declared_locales"];
  count: number;
  hasXDefault: boolean;
  uniqueLanguages: string[];
  entries: Array<{
    hreflang: string;
    href: string;
    verdict: "ok" | "invalid-code" | "malformed-href" | "x-default";
    note?: string;
  }>;
  warnings: string[];
}

function validate(hreflang: string, href: string): {
  verdict: "ok" | "invalid-code" | "malformed-href" | "x-default";
  note?: string;
} {
  if (hreflang === "x-default") {
    try {
      new URL(href);
      return { verdict: "x-default" };
    } catch {
      return { verdict: "malformed-href", note: "x-default href is not absolute" };
    }
  }
  const parts = hreflang.split("-");
  const lang = parts[0]?.toLowerCase();
  const region = parts[1]?.toUpperCase();
  if (!lang || !LANG_REGEX.test(lang)) {
    return { verdict: "invalid-code", note: `language "${parts[0]}" is not ISO 639-1` };
  }
  if (region && !REGION_REGEX.test(region)) {
    return { verdict: "invalid-code", note: `region "${parts[1]}" is not ISO 3166-1` };
  }
  try {
    const u = new URL(href);
    if (!u.protocol.startsWith("http")) {
      return { verdict: "malformed-href", note: "non-http(s) protocol" };
    }
  } catch {
    return { verdict: "malformed-href", note: "href is not absolute" };
  }
  return { verdict: "ok" };
}

const hreflangAuditor: Specialist<Input> = {
  id: "hreflang-auditor",
  name: "Hreflang Auditor",
  description: "International SEO: validate and generate hreflang. Catches common mistakes.",
  desk: "desk.hreflang-auditor",
  inputSchema: InputSchema,
  async execute(ctx) {
    const input = ctx.input;
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    ctx.emit("progress", `Fetching ${manifest.site_under_audit}…`, { progress: 0.15 });
    const signals = await extractSignals(manifest.site_under_audit);

    const entries = signals.hreflangs.map((h) => {
      const v = validate(h.hreflang, h.href);
      return { hreflang: h.hreflang, href: h.href, verdict: v.verdict, note: v.note };
    });
    const uniqueLanguages = Array.from(
      new Set(entries.map((e) => e.hreflang.split("-")[0]).filter((l) => l !== "x")),
    );

    const audit: HreflangAudit = {
      url: signals.url,
      declaredLocales: input.declared_locales ?? manifest.locales ?? [],
      count: entries.length,
      hasXDefault: entries.some((e) => e.hreflang === "x-default"),
      uniqueLanguages,
      entries,
      warnings: signals.warnings,
    };

    ctx.emit("log", `${entries.length} hreflang annotation(s), ${uniqueLanguages.length} language(s).`);

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.55 });

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 3072,
      temperature: 0.3,
      messages: [
        {
          role: "user",
          content: `Hreflang audit payload:\n\n\`\`\`json\n${JSON.stringify(audit, null, 2)}\n\`\`\``,
        },
      ],
    });

    ctx.emit("progress", "Writing hreflang audit to vault…", { progress: 0.85 });
    const { relativePath, executionResult } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "hreflang",
        frontmatterType: "audit",
        title: `Hreflang audit — ${manifest.site_under_audit}`,
        body: result.text,
        tags: ["audit", "hreflang", "international", "claude-generated"],
        costUsd: result.costUsd ?? 0,
      },
      {
        facts: [
          `Hreflang audit run on ${signals.url} (${entries.length} annotations).`,
          audit.hasXDefault
            ? "x-default is present."
            : "x-default is missing — recommended when any hreflang is present.",
        ],
        threadTitle: "Hreflang audit",
        threadRationale: "fix invalid codes + add x-default before next international launch",
        statusNote: "Hreflang on file — see recommendations.",
      },
    );

    return {
      summary: `Hreflang audit written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      data: { count: entries.length, languages: uniqueLanguages.length },
    };
  },
};

registerSpecialist(hreflangAuditor);
export default hreflangAuditor;
