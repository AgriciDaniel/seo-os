import test from "node:test";
import assert from "node:assert/strict";
import { THEMES, THEME_NAMES } from "../theme-config";

test("every theme defines a complete chrome block", () => {
  const requiredKeys = [
    "fontUi", "fontMono",
    "fg", "fgMuted", "fgFaint",
    "accent", "accentSoft", "accentFg",
    "ok", "err", "ribbon",
    "chromeBg", "chromeBorder",
    "panelBg", "panelBgSoft", "panelRadius",
    "windowBorder", "windowRadius", "windowShadow",
    "titlebarBg",
    "rowHover", "rowSelected",
    "inputBg", "inputRadius", "codeBg",
    "btnRadius",
    "tlClose", "tlMin", "tlMax", "tlDefault",
    "monitorBg", "monitorFg", "monitorFgDim",
    "monitorBorder", "monitorRadius",
    "monitorGlow", "monitorGlowRunning", "monitorGlowRunningStrong",
    "monitorBorderRunning", "monitorScan",
  ] as const;

  for (const name of THEME_NAMES) {
    const theme = THEMES[name];
    assert.ok(theme.chrome, `theme "${name}" missing chrome block`);
    for (const key of requiredKeys) {
      assert.ok(
        typeof theme.chrome[key as keyof typeof theme.chrome] === "string",
        `theme "${name}" missing chrome.${key}`,
      );
    }
  }
});
