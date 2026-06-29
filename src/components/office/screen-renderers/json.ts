/**
 * JSON / XML renderer — schema or sitemap files with indent-aware layout.
 * Pre-populated to `length - 3` and resets there on cycle, never to 0.
 */

import { sampleIndex, type ScreenRenderer, type SpecialistId } from "./types";

interface JsonSegment {
  c: string;
  t: string;
}

interface JsonLine {
  x: number;
  segs: JsonSegment[];
}

interface JsonState {
  type: "json";
  agent: SpecialistId | "orchestrator";
  seed: number;
  sample: JsonLine[];
  sampleIndex: number;
  currentLine: number;
  currentChar: number;
  pauseTicks: number;
  cycleHoldTicks: number;
}

const JSON_SAMPLES: ReadonlyArray<ReadonlyArray<JsonLine>> = [
  [
    { x: 0, segs: [{ c: "#d4d4d4", t: "{" }] },
    {
      x: 1,
      segs: [
        { c: "#9cdcfe", t: '"@context"' },
        { c: "#d4d4d4", t: ": " },
        { c: "#ce9178", t: '"https://schema.org"' },
        { c: "#d4d4d4", t: "," },
      ],
    },
    {
      x: 1,
      segs: [
        { c: "#9cdcfe", t: '"@type"' },
        { c: "#d4d4d4", t: ": " },
        { c: "#ce9178", t: '"Organization"' },
        { c: "#d4d4d4", t: "," },
      ],
    },
    {
      x: 1,
      segs: [
        { c: "#9cdcfe", t: '"name"' },
        { c: "#d4d4d4", t: ": " },
        { c: "#ce9178", t: '"Acme Co"' },
        { c: "#d4d4d4", t: "," },
      ],
    },
    {
      x: 1,
      segs: [
        { c: "#9cdcfe", t: '"url"' },
        { c: "#d4d4d4", t: ": " },
        { c: "#ce9178", t: '"https://acme.co"' },
        { c: "#d4d4d4", t: "," },
      ],
    },
    {
      x: 1,
      segs: [
        { c: "#9cdcfe", t: '"sameAs"' },
        { c: "#d4d4d4", t: ": [" },
      ],
    },
    {
      x: 2,
      segs: [
        { c: "#ce9178", t: '"https://twitter.com/acme"' },
        { c: "#d4d4d4", t: "," },
      ],
    },
    { x: 2, segs: [{ c: "#ce9178", t: '"https://github.com/acme"' }] },
    { x: 1, segs: [{ c: "#d4d4d4", t: "]," }] },
    {
      x: 1,
      segs: [
        { c: "#9cdcfe", t: '"foundingDate"' },
        { c: "#d4d4d4", t: ": " },
        { c: "#ce9178", t: '"2019-03-15"' },
      ],
    },
    { x: 0, segs: [{ c: "#d4d4d4", t: "}" }] },
  ],
  [
    { x: 0, segs: [{ c: "#d4d4d4", t: "<urlset>" }] },
    { x: 1, segs: [{ c: "#9cdcfe", t: "<url>" }] },
    {
      x: 2,
      segs: [
        { c: "#9cdcfe", t: "<loc>" },
        { c: "#ce9178", t: "/page-1" },
        { c: "#9cdcfe", t: "</loc>" },
      ],
    },
    {
      x: 2,
      segs: [
        { c: "#9cdcfe", t: "<lastmod>" },
        { c: "#ce9178", t: "2026-05-12" },
        { c: "#9cdcfe", t: "</lastmod>" },
      ],
    },
    {
      x: 2,
      segs: [
        { c: "#9cdcfe", t: "<priority>" },
        { c: "#ce9178", t: "0.8" },
        { c: "#9cdcfe", t: "</priority>" },
      ],
    },
    { x: 1, segs: [{ c: "#9cdcfe", t: "</url>" }] },
    { x: 1, segs: [{ c: "#9cdcfe", t: "<url>" }] },
    {
      x: 2,
      segs: [
        { c: "#9cdcfe", t: "<loc>" },
        { c: "#ce9178", t: "/page-2" },
        { c: "#9cdcfe", t: "</loc>" },
      ],
    },
    {
      x: 2,
      segs: [
        { c: "#9cdcfe", t: "<lastmod>" },
        { c: "#ce9178", t: "2026-05-11" },
        { c: "#9cdcfe", t: "</lastmod>" },
      ],
    },
    { x: 1, segs: [{ c: "#9cdcfe", t: "</url>" }] },
    { x: 0, segs: [{ c: "#d4d4d4", t: "</urlset>" }] },
  ],
];

const jsonRenderer: ScreenRenderer<JsonState> = {
  intervalMs: 140,

  createState(agent, seed) {
    const idx = sampleIndex(seed, JSON_SAMPLES.length);
    const sample = (JSON_SAMPLES[idx] ?? JSON_SAMPLES[0]) as JsonLine[];
    return {
      type: "json",
      agent,
      seed,
      sample,
      sampleIndex: idx,
      currentLine: Math.max(0, sample.length - 3),
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
    const line = s.sample[s.currentLine];
    let totalLen = 0;
    for (let i = 0; i < line.segs.length; i++) totalLen += line.segs[i].t.length;
    if (s.currentChar < totalLen) {
      s.currentChar += Math.min(2, totalLen - s.currentChar);
    } else {
      s.pauseTicks = 2;
      s.currentLine++;
      s.currentChar = 0;
      if (s.currentLine >= s.sample.length) {
        s.cycleHoldTicks = 20;
        s.currentLine = Math.max(0, s.sample.length - 3);
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
    const fn = s.sampleIndex === 0 ? s.agent.toLowerCase() + ".schema.json" : "sitemap.xml";
    ctx.fillText(fn, 8, 12);
    if (Math.floor(time * 1.5) % 2 === 0) {
      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.arc(w - 30, 9, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const lineHeight = 13;
    ctx.font = "10px ui-monospace, Menlo, monospace";
    for (let i = 0; i < s.sample.length; i++) {
      const y = 30 + i * lineHeight;
      const line = s.sample[i];
      ctx.fillStyle = "#3a4458";
      ctx.textAlign = "right";
      ctx.fillText((i + 1).toString(), 28, y);
      ctx.textAlign = "left";
      const charsToShow = i < s.currentLine ? Infinity : i === s.currentLine ? s.currentChar : 0;
      let charsRemaining = charsToShow;
      let x = 36 + line.x * 12;
      for (let j = 0; j < line.segs.length && charsRemaining > 0; j++) {
        const seg = line.segs[j];
        const segChars = Math.min(seg.t.length, charsRemaining);
        ctx.fillStyle = seg.c;
        ctx.fillText(seg.t.substring(0, segChars), x, y);
        x += ctx.measureText(seg.t.substring(0, segChars)).width;
        charsRemaining -= segChars;
      }
      if (i === s.currentLine && Math.floor(time * 2) % 2 === 0) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(x, y - 9, 1, 11);
      }
    }
  },
};

export default jsonRenderer;
