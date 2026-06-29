/**
 * Screen-renderer registry. Map ScreenType → renderer + emissive intensity.
 * Spec: docs/design/2026-05-11-seo-office-design.md §5.5 lines 463–474.
 */

import type { ScreenType } from "../positions";
import type { ScreenRenderer } from "./types";
import terminal from "./terminal";
import code from "./code";
import data from "./data";
import json from "./json";
import markdown from "./markdown";
import chart from "./chart";
import dashboard from "./dashboard";
import complete from "./complete";
import off from "./off";

export const EMISSIVE_INTENSITY_BY_TYPE: Record<ScreenType, number> = {
  terminal: 1.55,
  code: 1.35,
  data: 1.35,
  json: 1.35,
  markdown: 1.4,
  chart: 1.35,
  dashboard: 1.45,
  complete: 1.7,
  off: 0.5,
};

const RENDERERS: Record<ScreenType, ScreenRenderer> = {
  terminal,
  code,
  data,
  json,
  markdown,
  chart,
  dashboard,
  complete,
  off,
};

export function getRenderer(type: ScreenType): ScreenRenderer {
  return RENDERERS[type];
}
