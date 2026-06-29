/**
 * Mirror the active theme's chrome tokens to CSS custom properties.
 *
 * Every OS-shell component reads its colors / fonts / radii from
 * `var(--accent)`, `var(--fg)`, etc. — that's the single source of
 * truth. Theme-config holds the values; this module is the bridge.
 *
 * The mapping is camelCase (TS) -> kebab-case (CSS), per convention.
 */
import type { ThemeConfig } from "./theme-config";

type Chrome = ThemeConfig["chrome"];

/** TS field -> CSS custom property name. Authoritative; the test in
 *  __tests__/apply-chrome.test.ts asserts every chrome field is mapped. */
export const chromePropertyMap: Record<keyof Chrome, string> = {
  fontUi: "--font-ui",
  fontMono: "--font-mono",
  fg: "--fg",
  fgMuted: "--fg-muted",
  fgFaint: "--fg-faint",
  accent: "--accent",
  accentSoft: "--accent-soft",
  accentFg: "--accent-fg",
  ok: "--ok",
  err: "--err",
  ribbon: "--ribbon",
  chromeBg: "--chrome-bg",
  chromeBorder: "--chrome-border",
  panelBg: "--panel-bg",
  panelBgSoft: "--panel-bg-soft",
  panelRadius: "--panel-radius",
  windowBorder: "--window-border",
  windowRadius: "--window-radius",
  windowShadow: "--window-shadow",
  titlebarBg: "--titlebar-bg",
  rowHover: "--row-hover",
  rowSelected: "--row-selected",
  inputBg: "--input-bg",
  inputRadius: "--input-radius",
  codeBg: "--code-bg",
  btnRadius: "--btn-radius",
  tlClose: "--tl-close",
  tlMin: "--tl-min",
  tlMax: "--tl-max",
  tlDefault: "--tl-default",
  monitorBg: "--monitor-bg",
  monitorFg: "--monitor-fg",
  monitorFgDim: "--monitor-fg-dim",
  monitorBorder: "--monitor-border",
  monitorRadius: "--monitor-radius",
  monitorGlow: "--monitor-glow",
  monitorGlowRunning: "--monitor-glow-running",
  monitorGlowRunningStrong: "--monitor-glow-running-strong",
  monitorBorderRunning: "--monitor-border-running",
  monitorScan: "--monitor-scan",
};

/** Write every chrome token onto the target style declaration as a CSS
 *  custom property. Caller usually passes `document.documentElement.style`. */
export function applyChromeTokens(
  chrome: Chrome,
  target: Pick<CSSStyleDeclaration, "setProperty">,
): void {
  for (const key of Object.keys(chromePropertyMap) as (keyof Chrome)[]) {
    target.setProperty(chromePropertyMap[key], chrome[key]);
  }
}
