/**
 * Code editor renderer — VSCode-styled tokenized source files. The cursor
 * starts at `length - 3` so the editor reads as already populated, and
 * on cycle restart we reset to the same offset (not line 0).
 */

import { sampleIndex, type ScreenRenderer, type SpecialistId } from "./types";

interface CodeSegment {
  c: string;
  t: string;
}

interface CodeSample {
  fn: string;
  lang: string;
  lines: CodeSegment[][];
}

interface CodeState {
  type: "code";
  agent: SpecialistId | "orchestrator";
  seed: number;
  sample: CodeSample;
  currentLine: number;
  currentChar: number;
  pauseTicks: number;
  cycleHoldTicks: number;
}

const CODE_SAMPLES: ReadonlyArray<CodeSample> = [
  {
    fn: "page.tsx",
    lang: "TypeScript",
    lines: [
      [
        { c: "#c586c0", t: "import" },
        { c: "#9cdcfe", t: " { Hero } " },
        { c: "#c586c0", t: "from " },
        { c: "#ce9178", t: '"@/components/hero"' },
        { c: "#d4d4d4", t: ";" },
      ],
      [
        { c: "#c586c0", t: "import" },
        { c: "#9cdcfe", t: " { Metadata } " },
        { c: "#c586c0", t: "from " },
        { c: "#ce9178", t: '"next"' },
        { c: "#d4d4d4", t: ";" },
      ],
      [],
      [
        { c: "#c586c0", t: "export const " },
        { c: "#4fc1ff", t: "metadata" },
        { c: "#d4d4d4", t: ": " },
        { c: "#4ec9b0", t: "Metadata" },
        { c: "#d4d4d4", t: " = {" },
      ],
      [
        { c: "#d4d4d4", t: "  " },
        { c: "#9cdcfe", t: "title" },
        { c: "#d4d4d4", t: ": " },
        { c: "#ce9178", t: '"SEO Tools 2026"' },
        { c: "#d4d4d4", t: "," },
      ],
      [
        { c: "#d4d4d4", t: "  " },
        { c: "#9cdcfe", t: "description" },
        { c: "#d4d4d4", t: ": " },
        { c: "#ce9178", t: '"Reviews & rankings"' },
        { c: "#d4d4d4", t: "," },
      ],
      [{ c: "#d4d4d4", t: "};" }],
      [],
      [
        { c: "#c586c0", t: "export default function" },
        { c: "#dcdcaa", t: " Page" },
        { c: "#d4d4d4", t: "() {" },
      ],
      [
        { c: "#d4d4d4", t: "  " },
        { c: "#c586c0", t: "return" },
        { c: "#d4d4d4", t: " (" },
      ],
      [
        { c: "#d4d4d4", t: "    <" },
        { c: "#4ec9b0", t: "Hero" },
        { c: "#d4d4d4", t: " " },
        { c: "#9cdcfe", t: "title" },
        { c: "#d4d4d4", t: "=" },
        { c: "#ce9178", t: '"Best"' },
        { c: "#d4d4d4", t: " />" },
      ],
      [{ c: "#d4d4d4", t: "  );" }],
      [{ c: "#d4d4d4", t: "}" }],
    ],
  },
  {
    fn: "meta.ts",
    lang: "TypeScript",
    lines: [
      [
        { c: "#c586c0", t: "export const " },
        { c: "#4fc1ff", t: "SCHEMA" },
        { c: "#d4d4d4", t: " = {" },
      ],
      [
        { c: "#d4d4d4", t: "  " },
        { c: "#9cdcfe", t: "org" },
        { c: "#d4d4d4", t: ": {" },
      ],
      [
        { c: "#d4d4d4", t: "    " },
        { c: "#9cdcfe", t: "name" },
        { c: "#d4d4d4", t: ": " },
        { c: "#ce9178", t: '"Acme Co"' },
        { c: "#d4d4d4", t: "," },
      ],
      [
        { c: "#d4d4d4", t: "    " },
        { c: "#9cdcfe", t: "url" },
        { c: "#d4d4d4", t: ": " },
        { c: "#ce9178", t: '"https://acme.co"' },
        { c: "#d4d4d4", t: "," },
      ],
      [
        { c: "#d4d4d4", t: "    " },
        { c: "#9cdcfe", t: "logo" },
        { c: "#d4d4d4", t: ": " },
        { c: "#ce9178", t: '"/logo.svg"' },
      ],
      [{ c: "#d4d4d4", t: "  }," }],
      [
        { c: "#d4d4d4", t: "  " },
        { c: "#9cdcfe", t: "breadcrumbs" },
        { c: "#d4d4d4", t: ": [" },
      ],
      [
        { c: "#d4d4d4", t: "    { " },
        { c: "#9cdcfe", t: "name" },
        { c: "#d4d4d4", t: ": " },
        { c: "#ce9178", t: '"Home"' },
        { c: "#d4d4d4", t: " }," },
      ],
      [
        { c: "#d4d4d4", t: "    { " },
        { c: "#9cdcfe", t: "name" },
        { c: "#d4d4d4", t: ": " },
        { c: "#ce9178", t: '"Tools"' },
        { c: "#d4d4d4", t: " }" },
      ],
      [{ c: "#d4d4d4", t: "  ]" }],
      [{ c: "#d4d4d4", t: "};" }],
    ],
  },
];

const codeRenderer: ScreenRenderer<CodeState> = {
  intervalMs: 130,

  createState(agent, seed) {
    // `seed` from positions.ts is a golden-ratio float; floor to use as index.
    const idx = sampleIndex(seed, CODE_SAMPLES.length);
    const sample = CODE_SAMPLES[idx] ?? CODE_SAMPLES[0];
    return {
      type: "code",
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
    const lines = s.sample.lines;
    const current = lines[s.currentLine];
    let totalLen = 0;
    for (let i = 0; i < current.length; i++) totalLen += current[i].t.length;
    if (s.currentChar < totalLen) {
      s.currentChar += Math.min(2, totalLen - s.currentChar);
    } else {
      s.pauseTicks = 2;
      s.currentLine++;
      s.currentChar = 0;
      if (s.currentLine >= lines.length) {
        s.cycleHoldTicks = 20;
        // Restart near end-of-file (not line 0) — the prototype's correct behavior.
        s.currentLine = Math.max(0, lines.length - 3);
      }
    }
  },

  draw(ctx, w, h, s, time) {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#161b22";
    ctx.fillRect(0, 0, w, 20);
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(4, 3, 92, 15);
    ctx.fillStyle = "#e4e4e7";
    ctx.font = "10px ui-monospace, Menlo, monospace";
    ctx.fillText(s.sample.fn, 10, 13);
    ctx.fillStyle = "#6b7280";
    ctx.fillText("●", 88, 13);
    const lines = s.sample.lines;
    ctx.font = "10px ui-monospace, Menlo, monospace";
    const lineHeight = 12;
    for (let i = 0; i < lines.length; i++) {
      const y = 32 + i * lineHeight;
      ctx.fillStyle = "#3a4458";
      ctx.textAlign = "right";
      ctx.fillText((i + 1).toString(), 22, y);
      ctx.textAlign = "left";
      let charsToShow: number;
      if (i < s.currentLine) charsToShow = Infinity;
      else if (i === s.currentLine) charsToShow = s.currentChar;
      else charsToShow = 0;
      let charsRemaining = charsToShow;
      let x = 30;
      for (let j = 0; j < lines[i].length && charsRemaining > 0; j++) {
        const seg = lines[i][j];
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
    ctx.fillStyle = "#0e639c";
    ctx.fillRect(0, h - 14, w, 14);
    ctx.fillStyle = "#fff";
    ctx.font = "9px ui-monospace, Menlo, monospace";
    ctx.fillText("TypeScript · Ln " + (s.currentLine + 1), 6, h - 5);
    ctx.textAlign = "right";
    ctx.fillText(s.agent, w - 6, h - 5);
    ctx.textAlign = "left";
  },
};

export default codeRenderer;
