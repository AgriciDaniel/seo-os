/**
 * Backlink Analyst — backlink profile audit with a graceful provider ladder.
 *
 * Tries DataForSEO → Bing Webmaster in order, and degrades to a "what's
 * missing + how to enable" report if neither is configured. Never throws on
 * missing integrations — graceful degradation IS the deliverable.
 */
import "server-only";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { isAvailable } from "./_lib/availability";
import { post as dfsPost } from "@/lib/integrations/dataforseo";
import { envValue } from "@/lib/setup/env-local";
import { writeArtifact } from "./_lib/artifact";
import {
  applyStructuredOutput,
  sidecarRef,
} from "./_lib/structured-output";
import { optionalIntegrationDegradation } from "./integration-readiness";

const SYSTEM_PROMPT = `You are the Backlink Analyst inside SEO Office.

You receive a JSON payload describing a backlink profile for a domain. The payload always names the data source used (\`dataforseo\`, \`bing\`, or \`none\`) and either contains real data, partial data, or a list of providers that were unavailable. Your job: synthesize what is actually known and be explicit about what is not.

## Output contract

Produce a Markdown report with exactly these sections, in order:

1. **Executive summary** — 3-5 bullets tagged \`[critical|high|medium|low|info]\`. Lead with the most consequential finding (toxic concentration, anchor over-optimisation, thin profile, etc.). If \`source = "none"\`, the summary explains the gap and recommends which provider to configure first.
2. **Profile overview** — referring domains, total backlinks, follow/nofollow split, domain rating / DA / spam score. Cite the numbers verbatim. If a field is missing, write "n/a (not provided by <source>)".
3. **Anchor text distribution** — top anchors with share %, branded vs exact vs partial vs generic vs URL split. Flag exact-match overuse (>20% is a red flag for most niches).
4. **Toxic / risk signals** — Spam Score / quality flags, sudden velocity changes, foreign-language clusters that don't match the brand, link networks, PBN smell. If the source doesn't expose these, say so.
5. **Top referring domains** — list 10-15 highest-authority referrers with their metric. Note any reciprocal patterns or obvious sitewide footers.
6. **Recommendations** — exactly 6 numbered actions, each with: imperative title, one-sentence why, effort (S/M/L), expected impact (S/M/L). Ordered by impact-per-effort. If \`source = "none"\`, every recommendation is a setup/enablement step (configure provider, manual audit fallback, etc.).

After the recommendations, append a final section:

7. **Structured findings (machine-readable)** — a single fenced code block tagged \`data\` containing JSON that matches this schema:

\`\`\`data
{
  "kind": "backlinks",
  "v": 1,
  "dr_distribution": [
    { "bin": "<0-10|10-20|...|90-100>", "count": <integer ≥ 0> }
  ],
  "top_domains": [
    { "domain": "<root domain>", "dr": <0-100, optional>, "links": <integer ≥ 0> }
  ]
}
\`\`\`

The data block is parsed and removed before the note is rendered, so do NOT add commentary inside the fenced block. \`top_domains\` may contain at most 25 entries, sorted by authority/links desc. \`dr_distribution\` bins should cover the full 0–100 DR range; emit zero-count bins for ranges with no domains. When the source is \`none\` and no quantitative data exists, emit empty arrays for both fields rather than fabricating numbers.

## Voice and constraints

- Be terse, evidence-led. Quote exact numbers and anchor strings.
- Never invent metrics. If the payload lacks DA, do not estimate DA.
- Never promise ranking or traffic gains.
- When the source is degraded or none, the report's tone is "here is what you can do today, and here is what unlocks once you add a key" — not apologetic, not speculative.
- Do NOT include a closing summary, sign-off, or call to action — the report ends after the structured findings block.`;

const InputSchema = z.object({});
type Input = z.infer<typeof InputSchema>;

type BacklinkSource = "dataforseo" | "bing" | "none";

interface BacklinkPayload {
  domain: string;
  target_url: string;
  source: BacklinkSource;
  configured_providers: string[];
  missing_providers: Array<{ id: string; envVars: string[]; signupHint: string }>;
  raw: unknown;
  derived?: {
    referringDomains?: number;
    totalBacklinks?: number;
    follow?: number;
    nofollow?: number;
    domainRating?: number;
    spamScore?: number;
  };
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function tryDataForSEO(target: string): Promise<{ raw: unknown; derived: BacklinkPayload["derived"] } | null> {
  try {
    const json = await dfsPost("/v3/backlinks/summary/live", {
      target,
      internal_list_limit: 10,
      backlinks_status_type: "live",
      include_subdomains: true,
    });
    const result = json.tasks?.[0]?.result?.[0] as
      | {
          referring_domains?: number;
          backlinks?: number;
          backlinks_spam_score?: number;
          referring_domains_nofollow?: number;
          rank?: number;
        }
      | undefined;
    return {
      raw: result ?? json,
      derived: {
        referringDomains: result?.referring_domains,
        totalBacklinks: result?.backlinks,
        nofollow: result?.referring_domains_nofollow,
        domainRating: result?.rank,
        spamScore: result?.backlinks_spam_score,
      },
    };
  } catch {
    return null;
  }
}

async function tryBing(target: string): Promise<{ raw: unknown; derived: BacklinkPayload["derived"] } | null> {
  const key = envValue("BING_WEBMASTER_API_KEY");
  if (!key) return null;
  try {
    const url = `https://ssl.bing.com/webmaster/api.svc/json/GetUrlLinks?apikey=${encodeURIComponent(
      key,
    )}&siteUrl=${encodeURIComponent(target)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as { d?: Array<unknown> };
    const links = Array.isArray(json.d) ? json.d : [];
    return {
      raw: { sample: links.slice(0, 25), count: links.length },
      derived: {
        totalBacklinks: links.length,
      },
    };
  } catch {
    return null;
  }
}

const backlinkAnalyst: Specialist<Input> = {
  id: "backlink-analyst",
  name: "Backlink Analyst",
  description:
    "Audits backlink profile via DataForSEO/Moz/Bing with graceful degradation; covers DA, anchors, and toxic signals.",
  desk: "desk.backlink-analyst",
  inputSchema: InputSchema,
  async execute(ctx) {
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    const targetUrl = manifest.site_under_audit;
    const domain = domainOf(targetUrl);
    ctx.emit("progress", `Resolving backlink source for ${domain}…`, { progress: 0.1 });

    const configured: string[] = [];
    if (isAvailable("dataforseo")) configured.push("dataforseo");
    if (isAvailable("bing")) configured.push("bing");

    let source: BacklinkSource = "none";
    let raw: unknown = null;
    let derived: BacklinkPayload["derived"] | undefined;

    if (isAvailable("dataforseo")) {
      ctx.emit("progress", "Trying DataForSEO /v3/backlinks/summary/live…", { progress: 0.25 });
      const r = await tryDataForSEO(domain);
      if (r) {
        source = "dataforseo";
        raw = r.raw;
        derived = r.derived;
      }
    }
    if (source === "none" && isAvailable("bing")) {
      ctx.emit("progress", "Trying Bing Webmaster GetUrlLinks…", { progress: 0.5 });
      const r = await tryBing(targetUrl);
      if (r) {
        source = "bing";
        raw = r.raw;
        derived = r.derived;
      }
    }

    const missing_providers = [
      {
        id: "dataforseo",
        envVars: ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"],
        signupHint: "https://dataforseo.com — full backlink summary endpoint",
      },
      {
        id: "bing",
        envVars: ["BING_WEBMASTER_API_KEY"],
        signupHint: "https://www.bing.com/webmasters — free, requires site verification",
      },
    ].filter((p) => !configured.includes(p.id));

    const payload: BacklinkPayload = {
      domain,
      target_url: targetUrl,
      source,
      configured_providers: configured,
      missing_providers,
      raw,
      derived,
    };

    ctx.emit("log", `Backlink source resolved: ${source}`);
    const degradation = optionalIntegrationDegradation("backlink-analyst");

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.65 });

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 4096,
      temperature: 0.4,
      messages: [
        {
          role: "user",
          content: `Audit this backlink profile. Payload follows.\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
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
      expectedKind: "backlinks",
      chartSpec: (d) => ({
        type: "bar",
        title: "DR distribution",
        ref: sidecarRef(today, "backlinks"),
        data: d.dr_distribution.map((b) => ({ category: b.bin, count: b.count })),
      }),
    });
    if (data) {
      ctx.emit(
        "log",
        `Structured findings parsed — ${data.dr_distribution.length} DR bins, ${data.top_domains.length} top domain${data.top_domains.length === 1 ? "" : "s"}`,
      );
    } else {
      ctx.emit("log", "No valid structured findings block — skipping sidecar + HTML report");
    }

    ctx.emit("progress", "Writing backlink audit to vault…", { progress: 0.9 });

    const sourceFact =
      source === "none"
        ? `No backlink provider configured — degraded report written for ${domain}.`
        : `Backlink audit ran via ${source} for ${domain}.`;
    const profileFact = derived?.referringDomains
      ? `${derived.referringDomains} referring domains reported by ${source}.`
      : derived?.totalBacklinks
        ? `${derived.totalBacklinks} backlinks reported by ${source}.`
        : `Quantitative profile data limited (source: ${source}).`;

    const { relativePath, executionResult, reportPath, dataPath } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "backlinks",
        frontmatterType: "audit",
        title: `Backlink audit — ${domain}`,
        body: bodyWithChart,
        tags: ["audit", "backlinks", "off-page", "claude-generated"],
        url: targetUrl,
        reportSubtitle: data
          ? `${data.top_domains.length} top domain${data.top_domains.length === 1 ? "" : "s"} captured · source: ${source}`
          : undefined,
        ...(data ? { data } : {}),
        costUsd: result.costUsd ?? 0,
        ...degradation.artifact,
      },
      {
        facts: [sourceFact, profileFact],
        threadTitle: "Backlink audit",
        threadRationale:
          source === "none"
            ? "configure a backlink provider to unlock real data"
            : "review anchor mix + flagged toxic referrers",
        statusNote:
          source === "none"
            ? "Backlink audit degraded — see report for the cheapest path to real data."
            : `Backlink profile on file (${source}) — review recommendations.`,
      },
    );

    return {
      summary: reportPath
        ? `Backlink audit written to ${relativePath} (report: ${reportPath})`
        : source === "none"
          ? `Backlink audit (degraded, no providers) written to ${relativePath}`
          : `Backlink audit written to ${relativePath} (source: ${source})`,
      resultPath: relativePath,
      executionResult,
      ...(reportPath ? { reportPath } : {}),
      ...(dataPath ? { dataPath } : {}),
      data: {
        source,
        derived,
        ...(data ? { structured: data } : {}),
      },
      ...degradation.result,
    };
  },
};

registerSpecialist(backlinkAnalyst);

export default backlinkAnalyst;
