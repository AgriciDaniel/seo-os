/**
 * Markdown renderer — content briefs and strategy docs with per-style
 * coloring (h1/h2/meta/li/p). Pre-populated to `length - 3`.
 */

import { sampleIndex, type ScreenRenderer, type SpecialistId } from "./types";

type MdStyle = "h1" | "h2" | "meta" | "li" | "p";

interface MdLine {
  style: MdStyle;
  t: string;
}

interface MdSample {
  fn: string;
  lines: MdLine[];
}

interface MarkdownState {
  type: "markdown";
  agent: SpecialistId | "orchestrator";
  seed: number;
  sample: MdSample;
  currentLine: number;
  currentChar: number;
  pauseTicks: number;
  cycleHoldTicks: number;
}

const MD_SAMPLES: ReadonlyArray<MdSample> = [
  {
    fn: "q3-content-brief.md",
    lines: [
      { style: "h1", t: "# Best SEO Tools 2026" },
      { style: "meta", t: "---" },
      { style: "meta", t: "status: drafting" },
      { style: "meta", t: "owner: content" },
      { style: "meta", t: "---" },
      { style: "h2", t: "## Outline" },
      { style: "li", t: "- Introduction" },
      { style: "li", t: "- Core thesis" },
      { style: "li", t: "- Top 10 picks" },
      { style: "li", t: "- Comparison matrix" },
      { style: "li", t: "- Methodology" },
      { style: "p", t: "Target: bottom-funnel buyers" },
    ],
  },
  {
    fn: "strategy-q3.md",
    lines: [
      { style: "h1", t: "# Q3 Strategy" },
      { style: "h2", t: "## Goals" },
      { style: "li", t: "- 15% organic growth" },
      { style: "li", t: "- 40 new briefs published" },
      { style: "li", t: "- 200 backlinks acquired" },
      { style: "h2", t: "## Approach" },
      { style: "p", t: "Cluster around buyer intent" },
      { style: "p", t: "Refresh top 50 pages" },
      { style: "p", t: "Outreach to 100 sites" },
      { style: "h2", t: "## Risks" },
      { style: "li", t: "- Algorithm volatility" },
      { style: "li", t: "- Resource constraints" },
    ],
  },
];

const markdownRenderer: ScreenRenderer<MarkdownState> = {
  intervalMs: 140,

  createState(agent, seed) {
    const idx = sampleIndex(seed, MD_SAMPLES.length);
    const sample = MD_SAMPLES[idx] ?? MD_SAMPLES[0];
    return {
      type: "markdown",
      agent,
      seed,
      sample,
      currentLine: Math.max(0, sample.lines.length - 3),
      currentChar: 0,
      pauseTicks: 0,
      cycleHoldTicks: 0,
    };
  },

  tick(s) {
    if (s.cycleHoldTicks > 0) {
      s.cycleHoldTicks--;
      return;
    }
    if (s.pauseTicks > 0) {
      s.pauseTicks--;
      return;
    }
    const line = s.sample.lines[s.currentLine];
    if (s.currentChar < line.t.length) {
      s.currentChar += Math.min(3, line.t.length - s.currentChar);
    } else {
      s.pauseTicks = 2;
      s.currentLine++;
      s.currentChar = 0;
      if (s.currentLine >= s.sample.lines.length) {
        s.cycleHoldTicks = 25;
        s.currentLine = Math.max(0, s.sample.lines.length - 3);
      }
    }
  },

  draw(ctx, w, h, s, time) {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#161b22";
    ctx.fillRect(0, 0, w, 18);
    ctx.fillStyle = "#e4e4e7";
    ctx.font = "10px ui-monospace, Menlo, monospace";
    ctx.fillText(s.sample.fn, 8, 12);
    if (Math.floor(time * 1.5) % 2 === 0) {
      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.arc(w - 30, 9, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const lineHeight = 12;
    for (let i = 0; i < s.sample.lines.length; i++) {
      const line = s.sample.lines[i];
      const y = 28 + i * lineHeight;
      const charsToShow = i < s.currentLine ? Infinity : i === s.currentLine ? s.currentChar : 0;
      const displayText = line.t.substring(0, charsToShow);
      if (line.style === "h1") {
        ctx.fillStyle = "#60a5fa";
        ctx.font = "bold 12px ui-monospace, Menlo, monospace";
      } else if (line.style === "h2") {
        ctx.fillStyle = "#fde047";
        ctx.font = "bold 11px ui-monospace, Menlo, monospace";
      } else if (line.style === "meta") {
        ctx.fillStyle = "#6b7280";
        ctx.font = "9px ui-monospace, Menlo, monospace";
      } else if (line.style === "li") {
        ctx.fillStyle = "#d1d5db";
        ctx.font = "10px ui-monospace, Menlo, monospace";
      } else {
        ctx.fillStyle = "#d1d5db";
        ctx.font = "10px ui-monospace, Menlo, monospace";
      }
      ctx.fillText(displayText, 8, y);
      if (i === s.currentLine && Math.floor(time * 2) % 2 === 0) {
        ctx.fillStyle = "#fff";
        const tw = ctx.measureText(displayText).width;
        ctx.fillRect(8 + tw, y - 9, 1, 11);
      }
    }
  },
};

export default markdownRenderer;
