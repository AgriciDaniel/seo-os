import { test } from "node:test";
import assert from "node:assert/strict";

import { mergeCanonicalSection } from "@/lib/brain/canonical-writer.ts";

test("canonical section merge preserves human content", () => {
  const before = [
    "# Keyword Targets and Page Map",
    "",
    "Human note stays.",
    "",
    "<!-- seo-office:keyword-map:start -->",
    "Old generated content.",
    "<!-- seo-office:keyword-map:end -->",
  ].join("\n");

  const after = mergeCanonicalSection(
    before,
    "keyword-map",
    "| Keyword | URL |\n| --- | --- |",
  );

  assert.match(after, /Human note stays/);
  assert.match(after, /\| Keyword \| URL \|/);
  assert.doesNotMatch(after, /Old generated content/);
});
