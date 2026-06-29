/**
 * Data table renderer — keyword rankings with periodic flash-on-update.
 * Every 3rd tick mutates one random row; flashAge decays the highlight.
 */

import {
  safeSeed,
  seededRandom,
  type ScreenRenderer,
  type SeededRandom,
  type SpecialistId,
} from "./types";

interface DataRow {
  keyword: string;
  pos: number;
  vol: number;
  delta: number;
  flashAge: number;
}

interface DataState {
  type: "data";
  agent: SpecialistId | "orchestrator";
  seed: number;
  rand: SeededRandom;
  rows: DataRow[];
  tickCount: number;
}

const KEYWORDS: ReadonlyArray<string> = [
  "seo audit",
  "keyword research",
  "content brief",
  "schema markup",
  "backlink audit",
  "site speed",
  "meta tags",
  "sitemap.xml",
  "hreflang",
  "robots.txt",
  "core vitals",
  "indexation",
  "canonical",
  "image alt",
  "redirects",
  "local pack",
  "knowledge graph",
  "featured snippet",
  "people also ask",
  "rich results",
];

const dataRenderer: ScreenRenderer<DataState> = {
  intervalMs: 450,

  createState(agent, seed) {
    const rand = seededRandom(seed);
    // The HTML uses `seed` as an integer offset into KEYWORDS; our seed is a
    // golden-ratio float, so we floor it for indexing while still using the
    // float for the LCG.
    const seedInt = Math.abs(Math.floor(safeSeed(seed) * 1000));
    const rows: DataRow[] = [];
    for (let i = 0; i < 10; i++) {
      rows.push({
        keyword: KEYWORDS[(seedInt + i * 3) % KEYWORDS.length],
        pos: 1 + Math.floor(rand() * 40),
        vol: 0.1 + rand() * 9.9,
        delta: Math.floor(rand() * 11) - 5,
        flashAge: 999,
      });
    }
    return { type: "data", agent, seed, rand, rows, tickCount: 0 };
  },

  tick(s) {
    s.tickCount++;
    if (s.tickCount % 3 === 0) {
      const idx = Math.floor(s.rand() * s.rows.length);
      const row = s.rows[idx];
      const change = Math.floor(s.rand() * 7) - 3;
      row.pos = Math.max(1, Math.min(60, row.pos + change));
      row.delta = change;
      row.flashAge = 0;
    }
    for (let i = 0; i < s.rows.length; i++) s.rows[i].flashAge++;
  },

  draw(ctx, w, h, s, time) {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#161b22";
    ctx.fillRect(0, 0, w, 22);
    ctx.fillStyle = "#e4e4e7";
    ctx.font = "bold 10px ui-monospace, Menlo, monospace";
    ctx.fillText(s.agent.toUpperCase() + " · RANKINGS", 8, 14);
    if (Math.floor(time * 1.5) % 2 === 0) {
      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.arc(w - 44, 11, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#10b981";
    ctx.font = "9px ui-monospace, Menlo, monospace";
    ctx.fillText("LIVE", w - 36, 14);
    ctx.fillStyle = "#6b7280";
    ctx.font = "8px ui-monospace, Menlo, monospace";
    ctx.fillText("KEYWORD", 8, 36);
    ctx.fillText("POS", w - 86, 36);
    ctx.fillText("VOL", w - 58, 36);
    ctx.fillText("Δ", w - 22, 36);
    for (let i = 0; i < s.rows.length; i++) {
      const row = s.rows[i];
      const y = 52 + i * 14;
      const flashOpacity = Math.max(0, 1 - row.flashAge / 6);
      if (flashOpacity > 0) {
        ctx.fillStyle = "rgba(16,185,129," + flashOpacity * 0.18 + ")";
        ctx.fillRect(0, y - 10, w, 13);
      } else if (i % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.02)";
        ctx.fillRect(0, y - 10, w, 13);
      }
      ctx.fillStyle = "#d1d5db";
      ctx.font = "9px ui-monospace, Menlo, monospace";
      ctx.fillText(row.keyword, 8, y);
      ctx.fillStyle = row.pos <= 5 ? "#10b981" : row.pos <= 15 ? "#f59e0b" : "#9ca3af";
      ctx.fillText(row.pos.toString(), w - 82, y);
      ctx.fillStyle = "#9ca3af";
      ctx.fillText(row.vol.toFixed(1) + "K", w - 58, y);
      ctx.fillStyle = row.delta > 0 ? "#10b981" : row.delta < 0 ? "#ef4444" : "#6b7280";
      ctx.fillText((row.delta > 0 ? "+" : "") + row.delta, w - 22, y);
    }
  },
};

export default dataRenderer;
