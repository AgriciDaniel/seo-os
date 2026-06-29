import test from "node:test";
import assert from "node:assert/strict";
import { applyChromeTokens, chromePropertyMap } from "../apply-chrome";
import { THEMES } from "../theme-config";

test("chromePropertyMap maps every ThemeConfig.chrome field to a CSS variable", () => {
  const cosmos = THEMES.cosmos.chrome;
  const keys = Object.keys(cosmos);
  for (const k of keys) {
    const cssVar = chromePropertyMap[k as keyof typeof cosmos];
    assert.ok(cssVar, `no CSS variable mapped for chrome.${k}`);
    assert.ok(
      cssVar.startsWith("--"),
      `CSS variable for ${k} must start with "--", got "${cssVar}"`,
    );
  }
});

test("applyChromeTokens writes every CSS variable to a fake style object", () => {
  const fake: Record<string, string> = {};
  const setProperty = (k: string, v: string) => { fake[k] = v; };
  applyChromeTokens(THEMES.cosmos.chrome, { setProperty } as unknown as CSSStyleDeclaration);
  assert.equal(fake["--accent"], "#f5c842");
  assert.equal(fake["--fg"], "#e6e8ec");
  assert.equal(fake["--window-radius"], "8px");
  assert.equal(fake["--tl-close"], "#ff6b6b");
});
