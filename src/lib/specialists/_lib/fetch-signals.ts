/**
 * Shared HTML signal extractor used by every specialist that needs to "see"
 * a page (technical-auditor, content-strategist, schema-validator).
 *
 * Lightweight regex extraction — no JSDOM, no cheerio. The goal is to give
 * the LLM enough structure (title/headings/links/schema) to reason about
 * the page without dragging in a 5MB parser.
 */
import "server-only";

export interface SeoSignals {
  url: string;
  status: number;
  contentType: string;
  contentLength: number;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  viewport: string | null;
  charset: string | null;
  h1: string[];
  h2: string[];
  h3: string[];
  paragraphs: string[];
  visibleText: string;
  wordCount: number;
  hreflangs: Array<{ hreflang: string; href: string }>;
  jsonLd: Array<{ type: string | undefined; raw: string; parseError?: string }>;
  ogTags: Record<string, string>;
  twitterTags: Record<string, string>;
  internalLinks: number;
  externalLinks: number;
  internalLinkSamples: string[];
  imageCount: number;
  imagesMissingAlt: number;
  preloadCount: number;
  asyncScripts: number;
  deferScripts: number;
  blockingScripts: number;
  stylesheetCount: number;
  isHttps: boolean;
  serverHeader: string | null;
  hstsHeader: string | null;
  warnings: string[];
}

export async function extractSignals(url: string): Promise<SeoSignals> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "SEOOfficeBot/0.1 (+local)" },
  });
  const html = await res.text();
  const warnings: string[] = [];

  const get = (re: RegExp): string | null => {
    const m = html.match(re);
    return m ? m[1].trim() : null;
  };
  const all = (re: RegExp): string[] => {
    const out: string[] = [];
    const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = r.exec(html))) out.push(m[1].trim());
    return out;
  };

  const title = get(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription = get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  const canonical = get(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
  const robotsMeta = get(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i);
  const viewport = get(/<meta[^>]+name=["']viewport["'][^>]+content=["']([^"']*)["']/i);
  const charset = get(/<meta[^>]+charset=["']?([^"'\s>]+)/i);

  const h1 = all(/<h1[^>]*>([\s\S]*?)<\/h1>/gi).map(stripTags);
  const h2 = all(/<h2[^>]*>([\s\S]*?)<\/h2>/gi).map(stripTags);
  const h3 = all(/<h3[^>]*>([\s\S]*?)<\/h3>/gi).map(stripTags);
  const paragraphs = all(/<p[^>]*>([\s\S]*?)<\/p>/gi)
    .map(stripTags)
    .filter((t) => t.length > 0);

  const visibleText = (title ? title + "\n\n" : "")
    + h1.concat(h2, h3).join("\n")
    + "\n\n"
    + paragraphs.join("\n\n");
  const wordCount = visibleText.split(/\s+/).filter(Boolean).length;

  // hreflang
  const hreflangs: Array<{ hreflang: string; href: string }> = [];
  for (const m of html.matchAll(/<link[^>]+rel=["']alternate["'][^>]*>/gi)) {
    const tag = m[0];
    const hreflang = tag.match(/hreflang=["']([^"']+)["']/i)?.[1];
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (hreflang && href) hreflangs.push({ hreflang, href });
  }

  // JSON-LD
  const jsonLd: Array<{ type: string | undefined; raw: string; parseError?: string }> = [];
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const raw = m[1].trim();
    try {
      const parsed = JSON.parse(raw) as { "@type"?: string | string[] };
      const type = Array.isArray(parsed["@type"]) ? parsed["@type"].join(",") : parsed["@type"];
      jsonLd.push({ type, raw });
    } catch (err) {
      warnings.push("JSON-LD block failed to parse");
      jsonLd.push({
        type: undefined,
        raw: raw.slice(0, 280),
        parseError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // OG / Twitter
  const ogTags: Record<string, string> = {};
  for (const m of html.matchAll(
    /<meta[^>]+property=["']og:([^"']+)["'][^>]+content=["']([^"']*)["']/gi,
  )) {
    ogTags[m[1]] = m[2];
  }
  const twitterTags: Record<string, string> = {};
  for (const m of html.matchAll(
    /<meta[^>]+name=["']twitter:([^"']+)["'][^>]+content=["']([^"']*)["']/gi,
  )) {
    twitterTags[m[1]] = m[2];
  }

  // links
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    origin = "";
  }
  let internalLinks = 0;
  let externalLinks = 0;
  const internalLinkSamples: string[] = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    const href = m[1];
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    try {
      const u = new URL(href, url);
      if (u.origin === origin) {
        internalLinks++;
        if (internalLinkSamples.length < 12) internalLinkSamples.push(u.pathname);
      } else {
        externalLinks++;
      }
    } catch {
      /* malformed */
    }
  }

  // image stats
  const imageMatches = [...html.matchAll(/<img\b[^>]*>/gi)];
  const imageCount = imageMatches.length;
  const imagesMissingAlt = imageMatches.filter((m) => !/\balt=["']/i.test(m[0])).length;

  // script + style budget
  const preloadCount = (html.match(/<link[^>]+rel=["']preload["']/gi) ?? []).length;
  const scripts = [...html.matchAll(/<script\b[^>]*>/gi)];
  const asyncScripts = scripts.filter((m) => /\basync\b/i.test(m[0])).length;
  const deferScripts = scripts.filter((m) => /\bdefer\b/i.test(m[0])).length;
  const blockingScripts = scripts.filter(
    (m) => /\bsrc=/i.test(m[0]) && !/\b(async|defer)\b/i.test(m[0]),
  ).length;
  const stylesheetCount = (html.match(/<link[^>]+rel=["']stylesheet["']/gi) ?? []).length;

  return {
    url,
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    contentLength: html.length,
    title,
    metaDescription,
    canonical,
    robotsMeta,
    viewport,
    charset,
    h1,
    h2: h2.slice(0, 20),
    h3: h3.slice(0, 25),
    paragraphs: paragraphs.slice(0, 20),
    visibleText: visibleText.slice(0, 6000),
    wordCount,
    hreflangs,
    jsonLd,
    ogTags,
    twitterTags,
    internalLinks,
    externalLinks,
    internalLinkSamples,
    imageCount,
    imagesMissingAlt,
    preloadCount,
    asyncScripts,
    deferScripts,
    blockingScripts,
    stylesheetCount,
    isHttps: url.startsWith("https://"),
    serverHeader: res.headers.get("server"),
    hstsHeader: res.headers.get("strict-transport-security"),
    warnings,
  };
}

export function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
