/**
 * Hostname-based derivation helpers shared across specialists.
 *
 * Why "apex-aware": every agent-built specialist used to call
 *   new URL(siteUrl).hostname.replace(/^www\./, "").split(".")[0]
 * which produces "blog" for `blog.example.com` (dropping the brand). These
 * helpers strip the well-known content subdomains (www, blog, shop, store,
 * app, docs, etc.) before taking the apex label, which fixes that class of
 * bug for most real-world sites without a full PSL lookup.
 */
import "server-only";

const CONTENT_SUBDOMAINS = new Set([
  "www",
  "blog",
  "shop",
  "store",
  "app",
  "docs",
  "help",
  "support",
  "news",
  "go",
]);

/** Returns `acmeoutdoors` from `https://blog.acmeoutdoors.com/posts/x`. */
export function apexLabel(siteUrl: string): string {
  try {
    const host = new URL(siteUrl).hostname.toLowerCase();
    const parts = host.split(".").filter(Boolean);
    if (parts.length === 0) return "site";
    // Strip leading content subdomain if present
    if (parts.length >= 3 && CONTENT_SUBDOMAINS.has(parts[0])) {
      parts.shift();
    }
    // For e.g. example.co.uk we want "example", not "example.co"
    return parts[0];
  } catch {
    return "site";
  }
}

/** Returns `acme outdoors` from `https://acmeoutdoors.com`. */
export function brandLabel(siteUrl: string): string {
  const apex = apexLabel(siteUrl);
  return apex.replace(/[-_]/g, " ").trim() || "brand";
}

/** Returns `acme.com` (no protocol, no www) from `https://www.acme.com/path`. */
export function bareHost(siteUrl: string): string {
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, "");
  } catch {
    return siteUrl;
  }
}
