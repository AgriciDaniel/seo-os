/**
 * Terminal renderer — pre-populated with 10 fully-typed lines so the screen
 * reads as dense from the very first frame. The 11th line begins typing on
 * the first tick. Ported verbatim from the prototype HTML.
 */

import { seededRandom, type ScreenRenderer, type SeededRandom, type SpecialistId } from "./types";

interface TerminalEntry {
  c: string;
  t: string;
}

interface TerminalLine {
  c: string;
  t: string;
  charsTyped: number;
}

interface TerminalState {
  type: "terminal";
  agent: SpecialistId | "orchestrator";
  seed: number;
  rand: SeededRandom;
  visibleLines: TerminalLine[];
  currentPoolIdx: number;
  maxLines: number;
}

const TERMINAL_POOL: ReadonlyArray<TerminalEntry> = [
  { c: "#10b981", t: "$ pnpm run audit --depth 3" },
  { c: "#9ca3af", t: "  Scanning 247 URLs..." },
  { c: "#10b981", t: "✓ Schema validation passed" },
  { c: "#10b981", t: "✓ Meta tags complete (78/82)" },
  { c: "#f59e0b", t: "⚠ 12 images missing alt" },
  { c: "#10b981", t: "✓ Robots.txt accessible" },
  { c: "#9ca3af", t: "  Indexing pages..." },
  { c: "#10b981", t: "✓ Sitemap regenerated" },
  { c: "#10b981", t: "✓ Hreflang map updated" },
  { c: "#9ca3af", t: "  Crawl depth: 3 levels" },
  { c: "#3b82f6", t: "→ Pushing to vault..." },
  { c: "#10b981", t: "✓ Wrote 14 notes" },
  { c: "#f59e0b", t: "⚠ 2 duplicate H1s flagged" },
  { c: "#10b981", t: "✓ Internal links verified" },
  { c: "#9ca3af", t: "  Computing diff vs last run..." },
  { c: "#10b981", t: "✓ Diff: +47 lines / -12 lines" },
  { c: "#3b82f6", t: "→ Refreshing brain graph..." },
  { c: "#10b981", t: "✓ 8 new edges resolved" },
  { c: "#9ca3af", t: "  Checkpoint saved" },
  { c: "#a78bfa", t: "⚡ Job duration: 4.2s" },
];

const terminalRenderer: ScreenRenderer<TerminalState> = {
  intervalMs: 180,

  createState(agent, seed) {
    const rand = seededRandom(seed);
    const poolIdx = Math.floor(rand() * TERMINAL_POOL.length);
    const lines: TerminalLine[] = [];
    for (let i = 0; i < 10; i++) {
      const entry = TERMINAL_POOL[(poolIdx + i) % TERMINAL_POOL.length];
      lines.push({ c: entry.c, t: entry.t, charsTyped: entry.t.length });
    }
    return {
      type: "terminal",
      agent,
      seed,
      rand,
      visibleLines: lines,
      currentPoolIdx: (poolIdx + 10) % TERMINAL_POOL.length,
      maxLines: 11,
    };
  },

  tick(s) {
    if (s.visibleLines.length === 0) {
      const entry = TERMINAL_POOL[s.currentPoolIdx];
      s.visibleLines.push({ c: entry.c, t: entry.t, charsTyped: 0 });
    }
    const bottom = s.visibleLines[s.visibleLines.length - 1];
    if (bottom.charsTyped < bottom.t.length) {
      bottom.charsTyped += Math.min(3, bottom.t.length - bottom.charsTyped);
    } else {
      s.currentPoolIdx = (s.currentPoolIdx + 1) % TERMINAL_POOL.length;
      const next = TERMINAL_POOL[s.currentPoolIdx];
      s.visibleLines.push({ c: next.c, t: next.t, charsTyped: 0 });
      if (s.visibleLines.length > s.maxLines) {
        s.visibleLines.shift();
      }
    }
  },

  draw(ctx, w, h, s, time) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, 18);
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(8, 9, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(18, 9, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#10b981";
    ctx.beginPath();
    ctx.arc(28, 9, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "9px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText("~/" + s.agent.toLowerCase() + " — seo-office", w / 2, 12);
    ctx.textAlign = "left";
    ctx.font = "10px ui-monospace, Menlo, monospace";
    for (let i = 0; i < s.visibleLines.length; i++) {
      const line = s.visibleLines[i];
      ctx.fillStyle = line.c;
      ctx.fillText(line.t.substring(0, line.charsTyped), 8, 30 + i * 14);
    }
    if (Math.floor(time * 2) % 2 === 0 && s.visibleLines.length > 0) {
      const lastLine = s.visibleLines[s.visibleLines.length - 1];
      const x = 8 + ctx.measureText(lastLine.t.substring(0, lastLine.charsTyped)).width;
      ctx.fillStyle = "#10b981";
      ctx.fillRect(x + 2, 30 + (s.visibleLines.length - 1) * 14 - 9, 5, 11);
    }
  },
};

export default terminalRenderer;
