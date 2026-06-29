/**
 * Technical SEO (deep) — heavier-weight technical audit than `technical-auditor`.
 *
 * Adds: a Googlebot-UA fetch to detect JS-rendering deltas, full response-header
 * analysis (HSTS, X-Frame-Options, CSP, X-Content-Type-Options, Referrer-Policy,
 * X-Robots-Tag, Cache-Control), robots.txt parsing, security.txt presence,
 * and IndexNow eligibility. Ports the system prompt logic from claude-seo's
 * `seo-technical` skill.
 */
import "server-only";
import { z } from "zod";
import { readManifest } from "@/lib/orchestrator/client-context";
import { registerSpecialist, type Specialist } from "@/lib/orchestrator/registry";
import { selectProvider } from "@/lib/integrations/providers";
import { extractSignals, stripTags } from "./_lib/fetch-signals";
import { writeArtifact } from "./_lib/artifact";

const DEFAULT_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const SYSTEM_PROMPT = `You are the Deep Technical SEO Auditor inside SEO Office.

You receive a comprehensive JSON payload covering: baseline signals from a normal-UA fetch, a Googlebot-UA fetch for JS-rendering comparison, the page's response-header set, parsed robots.txt directives, security.txt presence, and IndexNow eligibility. You produce a deep technical SEO report a non-technical operator can hand to a developer.

## Output contract

Produce a Markdown report with exactly these sections, in this order, each evidence-led:

1. **Executive summary** — 3-5 bullets tagged \`[critical|high|medium|low|info]\`. Lead with the most consequential issue.
2. **Crawlability** — robots.txt directives (User-agent + Disallow/Allow + Sitemap), conflicting rules, Sitemap declarations, crawl budget hints (e.g. faceted nav, large parameter sets).
3. **Indexability** — robots meta, X-Robots-Tag header, canonical posture, noindex/nofollow signals, sitemap presence (from robots.txt).
4. **Security headers** — HSTS (max-age, includeSubDomains, preload), X-Frame-Options OR frame-ancestors in CSP, X-Content-Type-Options, Referrer-Policy, Content-Security-Policy posture, Permissions-Policy if present. Flag missing headers individually with severity.
5. **URL structure & delivery** — HTTPS, redirect chain length (if visible from status), Cache-Control, Vary headers, compression hints, server header (if disclosed).
6. **Mobile readiness signal** — viewport meta presence and content; flag if absent.
7. **Schema posture** — JSON-LD blocks present, types observed, any parse errors. Note absence of common types for the apparent site genre.
8. **JS-rendering signal** — compare default-UA visible word count and content length against the Googlebot-UA fetch. If they differ by more than ~25%, flag as a JS-rendering risk (Googlebot may see less than users). If they're close, write "low risk — server-rendered content appears parity".
9. **IndexNow eligibility & security.txt** — whether the site appears eligible for IndexNow (HTTPS + reachable robots.txt). security.txt presence at /.well-known/security.txt.
10. **Recommendations** — exactly 7 numbered actions, each with: imperative title, one-sentence why, effort estimate (S/M/L), expected impact (S/M/L). Order by impact-per-effort.

## Voice and constraints

- Be terse and concrete. Quote header values, robots directives, exact severities.
- Never claim future ranking or traffic outcomes.
- If a signal is missing from the payload, write "n/a — not present in payload" — do not invent.
- Flag anything that requires field tools (Playwright, PageSpeed, GSC, log files) under "Need to verify with field data" inside the relevant section.
- End after the recommendations.`;

const InputSchema = z.object({});
type Input = z.infer<typeof InputSchema>;

interface RobotsTxt {
  fetched: boolean;
  status: number | null;
  rules: Array<{ userAgent: string; allow: string[]; disallow: string[] }>;
  sitemaps: string[];
  raw: string | null;
}

function parseRobots(text: string): Omit<RobotsTxt, "fetched" | "status" | "raw"> {
  const rules: Array<{ userAgent: string; allow: string[]; disallow: string[] }> = [];
  const sitemaps: string[] = [];
  let current: { userAgent: string; allow: string[]; disallow: string[] } | null = null;
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      current = { userAgent: value, allow: [], disallow: [] };
      rules.push(current);
    } else if (key === "disallow" && current) {
      current.disallow.push(value);
    } else if (key === "allow" && current) {
      current.allow.push(value);
    } else if (key === "sitemap") {
      sitemaps.push(value);
    }
  }
  return { rules, sitemaps };
}

async function fetchRobots(origin: string): Promise<RobotsTxt> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": DEFAULT_UA },
      redirect: "follow",
    });
    if (!res.ok) {
      return { fetched: false, status: res.status, rules: [], sitemaps: [], raw: null };
    }
    const text = await res.text();
    const parsed = parseRobots(text);
    return {
      fetched: true,
      status: res.status,
      rules: parsed.rules,
      sitemaps: parsed.sitemaps,
      raw: text.slice(0, 4000),
    };
  } catch {
    return { fetched: false, status: null, rules: [], sitemaps: [], raw: null };
  }
}

async function fetchSecurityTxt(origin: string): Promise<{ present: boolean; status: number | null; sample: string | null }> {
  try {
    const res = await fetch(`${origin}/.well-known/security.txt`, {
      headers: { "User-Agent": DEFAULT_UA },
      redirect: "follow",
    });
    if (!res.ok) return { present: false, status: res.status, sample: null };
    const text = await res.text();
    return { present: true, status: res.status, sample: text.slice(0, 600) };
  } catch {
    return { present: false, status: null, sample: null };
  }
}

interface UaFetch {
  ua: "default" | "googlebot";
  status: number;
  contentLength: number;
  visibleWordCount: number;
  headers: Record<string, string>;
}

function countVisibleWords(html: string): number {
  // strip script/style + tags
  const noScript = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  const text = stripTags(noScript);
  return text.split(/\s+/).filter(Boolean).length;
}

const TRACKED_HEADERS = [
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "content-security-policy",
  "permissions-policy",
  "x-robots-tag",
  "cache-control",
  "vary",
  "server",
  "content-encoding",
] as const;

async function uaFetch(url: string, ua: "default" | "googlebot"): Promise<UaFetch> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": ua === "googlebot" ? GOOGLEBOT_UA : DEFAULT_UA },
  });
  const html = await res.text();
  const headers: Record<string, string> = {};
  for (const name of TRACKED_HEADERS) {
    const v = res.headers.get(name);
    if (v) headers[name] = v;
  }
  return {
    ua,
    status: res.status,
    contentLength: html.length,
    visibleWordCount: countVisibleWords(html),
    headers,
  };
}

const technicalDeepAuditor: Specialist<Input> = {
  id: "technical-deep-auditor",
  name: "Technical SEO (deep)",
  description:
    "Deep technical audit: UA-comparison JS-rendering signal, response headers, robots.txt, security.txt, IndexNow eligibility.",
  desk: "desk.technical-deep-auditor",
  inputSchema: InputSchema,
  async execute(ctx) {
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`no manifest for client "${ctx.clientSlug}"`);

    const url = manifest.site_under_audit;
    let origin = "";
    try {
      origin = new URL(url).origin;
    } catch {
      throw new Error(`invalid site_under_audit: ${url}`);
    }

    ctx.emit("progress", `Fetching baseline signals from ${url}…`, { progress: 0.1 });
    const signals = await extractSignals(url);

    ctx.emit("progress", "Fetching as default UA + Googlebot UA in parallel…", { progress: 0.3 });
    const [defaultFetch, googlebotFetch, robots, securityTxt] = await Promise.all([
      uaFetch(url, "default"),
      uaFetch(url, "googlebot"),
      fetchRobots(origin),
      fetchSecurityTxt(origin),
    ]);

    const wordDelta = Math.abs(googlebotFetch.visibleWordCount - defaultFetch.visibleWordCount);
    const wordDeltaPct =
      defaultFetch.visibleWordCount > 0
        ? Math.round((wordDelta / defaultFetch.visibleWordCount) * 100)
        : 0;
    const jsRenderRisk: "low" | "medium" | "high" =
      wordDeltaPct < 10 ? "low" : wordDeltaPct < 25 ? "medium" : "high";

    ctx.emit(
      "log",
      `UA delta: default ${defaultFetch.visibleWordCount} words vs googlebot ${googlebotFetch.visibleWordCount} (${wordDeltaPct}% — ${jsRenderRisk}).`,
    );

    const indexNowEligible = signals.isHttps && robots.fetched;

    const payload = {
      url,
      origin,
      baseline: {
        title: signals.title,
        metaDescription: signals.metaDescription,
        canonical: signals.canonical,
        robotsMeta: signals.robotsMeta,
        viewport: signals.viewport,
        wordCount: signals.wordCount,
        jsonLd: signals.jsonLd.map((j) => ({ type: j.type, parseError: j.parseError })),
        hreflangs: signals.hreflangs,
        isHttps: signals.isHttps,
        h1: signals.h1,
      },
      uaCompare: {
        default: {
          status: defaultFetch.status,
          contentLength: defaultFetch.contentLength,
          visibleWordCount: defaultFetch.visibleWordCount,
        },
        googlebot: {
          status: googlebotFetch.status,
          contentLength: googlebotFetch.contentLength,
          visibleWordCount: googlebotFetch.visibleWordCount,
        },
        wordDeltaPct,
        jsRenderRisk,
      },
      responseHeaders: defaultFetch.headers,
      googlebotResponseHeaders: googlebotFetch.headers,
      robotsTxt: robots,
      securityTxt: { present: securityTxt.present, status: securityTxt.status },
      indexNow: {
        eligible: indexNowEligible,
        reason: !signals.isHttps
          ? "not HTTPS"
          : !robots.fetched
            ? "robots.txt unreachable"
            : "HTTPS + robots.txt reachable",
      },
    };

    const provider = await selectProvider();
    ctx.emit("progress", `Calling ${provider.name}…`, { progress: 0.7 });

    const result = await provider.chat({
      tier: "synthesis",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 5120,
      temperature: 0.35,
      messages: [
        {
          role: "user",
          content: `Run the deep technical audit. Payload follows.\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
        },
      ],
    });

    ctx.emit(
      "log",
      `${provider.id}${result.model ? " · " + result.model : ""}${result.durationMs ? " · " + (result.durationMs / 1000).toFixed(1) + "s" : ""}${result.costUsd != null ? " · $" + result.costUsd.toFixed(4) : ""}`,
    );
    ctx.emit("progress", "Writing deep technical audit to vault…", { progress: 0.9 });

    const missingHeaders = TRACKED_HEADERS.filter(
      (h) => h !== "server" && h !== "content-encoding" && h !== "vary" && h !== "cache-control" && !defaultFetch.headers[h],
    );

    const { relativePath, executionResult } = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: "technical-deep",
        frontmatterType: "audit",
        title: `Deep technical SEO audit — ${url}`,
        body: result.text,
        tags: ["audit", "technical-seo", "deep", "claude-generated"],
        risk: jsRenderRisk === "high" || missingHeaders.length >= 4 ? "high" : "medium",
        costUsd: result.costUsd ?? 0,
      },
      {
        facts: [
          `Deep technical audit run on ${url} (JS-render risk: ${jsRenderRisk}, UA word delta ${wordDeltaPct}%).`,
          robots.fetched
            ? `robots.txt: ${robots.rules.length} rule blocks, ${robots.sitemaps.length} sitemap declarations.`
            : `robots.txt: not reachable (status ${robots.status ?? "n/a"}).`,
          missingHeaders.length
            ? `Missing security headers: ${missingHeaders.join(", ")}.`
            : `All tracked security headers present.`,
        ],
        threadTitle: "Deep technical audit",
        threadRationale: "review JS-render delta, header gaps, robots posture",
        statusNote: `Deep technical audit on file — JS-render risk ${jsRenderRisk}, ${missingHeaders.length} security headers missing.`,
      },
    );

    return {
      summary: `Deep technical audit written to ${relativePath}`,
      resultPath: relativePath,
      executionResult,
      data: {
        jsRenderRisk,
        wordDeltaPct,
        missingSecurityHeaders: missingHeaders,
        robotsFetched: robots.fetched,
        securityTxtPresent: securityTxt.present,
        indexNowEligible,
      },
    };
  },
};

registerSpecialist(technicalDeepAuditor);

export default technicalDeepAuditor;
