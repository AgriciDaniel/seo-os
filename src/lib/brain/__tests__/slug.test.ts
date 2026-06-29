import { test } from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { toClientSlug as canonicalToClientSlug } from "../slug.ts";
import { toClientSlug as exportedToClientSlug } from "../types.ts";

test("R10 client slug normalizer handles adversarial inputs", () => {
  const cases = new Map<string, string>([
    ["Acme Outdoors", "acme-outdoors"],
    ["ACME's   Gear & Apparel", "acmes-gear-apparel"],
    [" / Weird / Path / Name / ", "weird-path-name"],
    ["ümlaut русский 日本語 Acme", "mlaut-acme"],
    ["---Already---Dashed---", "already-dashed"],
    ["a".repeat(80), "a".repeat(60)],
  ]);

  for (const [input, expected] of cases) {
    assert.equal(canonicalToClientSlug(input), expected);
  }
});

test("R10 exported server slug normalizer stays identical for 1000 random inputs", () => {
  let seed = 0x5eed;
  for (let i = 0; i < 1000; i++) {
    const input = randomString(seed, 80);
    seed = nextSeed(seed);
    assert.equal(exportedToClientSlug(input), canonicalToClientSlug(input), input);
    assert.ok(canonicalToClientSlug(input).length <= 60);
    assert.doesNotMatch(canonicalToClientSlug(input), /^-|-$|\s|\/|\\/);
  }
});

test("R10 onboarding UI does not reintroduce a local slug normalizer", async () => {
  // The simplified URL-only intake derives slugs server-side via
  // `expandMinimalClientInput` → `toClientSlug`. The page must NOT contain a
  // hand-rolled slugifier, but the import is no longer required because the
  // form does not compute slugs itself.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const page = await fsp.readFile(
    path.resolve(here, "../../../app/clients/new/page.tsx"),
    "utf8",
  );
  assert.doesNotMatch(page, /function\s+slugify\s*\(/);
  assert.doesNotMatch(page, /\.slice\(0,\s*40\)/);
});

test("Server-side minimal-intake helper imports the shared slug normalizer", async () => {
  // The slug normalisation guarantee moved from the client form to the
  // server expander. Pin the expectation there so the linkage doesn't drift.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const expander = await fsp.readFile(
    path.resolve(here, "../minimal-intake.ts"),
    "utf8",
  );
  // expandMinimalClientInput delegates slug derivation to
  // `ClientInputSchema.parse(...)` which calls `toClientSlug` internally.
  assert.match(expander, /from "\.\/types"/);
});

function randomString(seed: number, maxLength: number): string {
  const alphabet =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_/\\'!@#$%^&*()[]{}.,;:ümlaut日本語";
  let s = "";
  let state = seed;
  const length = (state % maxLength) + 1;
  for (let i = 0; i < length; i++) {
    state = nextSeed(state);
    s += alphabet[state % alphabet.length];
  }
  return s;
}

function nextSeed(seed: number): number {
  return (seed * 1664525 + 1013904223) >>> 0;
}
