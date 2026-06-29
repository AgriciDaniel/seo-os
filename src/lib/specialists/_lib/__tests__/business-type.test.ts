import test from "node:test";
import assert from "node:assert/strict";

import { inferBusinessType } from "../business-type.ts";
import type { SeoSignals } from "../fetch-signals.ts";

/** Minimal SeoSignals fixture — inferBusinessType only reads the text/schema/link fields. */
function sig(partial: Partial<SeoSignals>): SeoSignals {
  return {
    url: "https://example.com",
    status: 200,
    contentType: "text/html",
    contentLength: 0,
    title: null,
    metaDescription: null,
    canonical: null,
    robotsMeta: null,
    viewport: null,
    charset: null,
    h1: [],
    h2: [],
    h3: [],
    paragraphs: [],
    visibleText: "",
    wordCount: 0,
    hreflangs: [],
    jsonLd: [],
    ogTags: {},
    twitterTags: {},
    internalLinks: 0,
    externalLinks: 0,
    internalLinkSamples: [],
    imageCount: 0,
    imagesMissingAlt: 0,
    preloadCount: 0,
    asyncScripts: 0,
    deferScripts: 0,
    blockingScripts: 0,
    stylesheetCount: 0,
    isHttps: true,
    serverHeader: null,
    hstsHeader: null,
    warnings: [],
    ...partial,
  };
}

test("inferBusinessType detects SaaS from trial/pricing/link signals", () => {
  const guess = inferBusinessType(
    sig({
      visibleText: "Start your free trial. Pricing plans from $9/mo. Dashboard and integrations.",
      internalLinkSamples: ["/pricing", "/signup"],
    }),
  );
  assert.equal(guess.type, "saas");
  assert.ok(["medium", "high"].includes(guess.confidence));
});

test("inferBusinessType detects ecommerce from Product schema + cart copy", () => {
  const guess = inferBusinessType(
    sig({
      jsonLd: [{ type: "Product", raw: "{}" }],
      visibleText: "Add to cart. Free shipping on all orders.",
    }),
  );
  assert.equal(guess.type, "ecommerce");
});

test("inferBusinessType detects local services from LocalBusiness schema", () => {
  const guess = inferBusinessType(
    sig({
      jsonLd: [{ type: "Dentist", raw: "{}" }],
      visibleText: "Book an appointment. Opening hours and directions.",
    }),
  );
  assert.equal(guess.type, "local-seo-services");
});

test("inferBusinessType returns null (keeps 'unknown') when no confident signal", () => {
  const guess = inferBusinessType(sig({ title: "Welcome", visibleText: "Hello world." }));
  assert.equal(guess.type, null);
  assert.equal(guess.confidence, "low");
});
