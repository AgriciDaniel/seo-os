/**
 * Shared types for screen-renderers.
 *
 * Each renderer is a pure module: createState (per-screen seed-stable
 * initialization), tick (mutates state in place), draw (paints the canvas).
 * The parent <Screen> component owns the interval and drives all three.
 */

import type { SpecialistId, ScreenType } from "../positions";

export interface ScreenRenderer<S = unknown> {
  createState(agentId: SpecialistId | "orchestrator", seed: number): S;
  tick(state: S): void;
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, state: S, time: number): void;
  /** ms between redraws */
  intervalMs: number;
}

export interface SeededRandom {
  (): number;
}

export function safeSeed(seed: number): number {
  return Number.isFinite(seed) ? seed : 1;
}

export function sampleIndex(seed: number, length: number): number {
  if (length <= 0) return 0;
  return Math.abs(Math.floor(safeSeed(seed))) % length;
}

/**
 * Match the HTML reference's `seedRand` exactly — same LCG, same modulus —
 * so a given seed produces identical visuals to the prototype.
 */
export function seededRandom(seed: number): SeededRandom {
  let s = safeSeed(seed) || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export { type ScreenType, type SpecialistId };
