/**
 * Chart renderer — Search Console-style clicks+impressions area chart.
 * Each tick advances the phase, shifts the oldest data point off, and
 * pushes a new one onto the right edge.
 */

import { seededRandom, type ScreenRenderer, type SeededRandom, type SpecialistId } from "./types";

interface ChartPoint {
  clicks: number;
  impr: number;
}

interface ChartState {
  type: "chart";
  agent: SpecialistId | "orchestrator";
  seed: number;
  rand: SeededRandom;
  data: ChartPoint[];
  tickCount: number;
  phase: number;
}

const chartRenderer: ScreenRenderer<ChartState> = {
  intervalMs: 140,

  createState(agent, seed) {
    const rand = seededRandom(seed);
    const data: ChartPoint[] = [];
    for (let i = 0; i < 48; i++) {
      const base = 0.5 + 0.3 * Math.sin(i * 0.3 + seed * 0.7);
      data.push({
        clicks: Math.max(0.05, Math.min(0.95, base + rand() * 0.2 - 0.1)),
        impr: Math.max(0.1, Math.min(0.95, base + 0.25 + rand() * 0.15 - 0.07)),
      });
    }
    return { type: "chart", agent, seed, rand, data, tickCount: 0, phase: seed };
  },

  tick(s) {
    s.tickCount++;
    s.phase += 0.08;
    s.data.shift();
    const base = 0.5 + 0.3 * Math.sin(s.phase);
    s.data.push({
      clicks: Math.max(0.05, Math.min(0.95, base + s.rand() * 0.2 - 0.1)),
      impr: Math.max(0.1, Math.min(0.95, base + 0.25 + s.rand() * 0.15 - 0.07)),
    });
  },

  draw(ctx, w, h, s, time) {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#161b22";
    ctx.fillRect(0, 0, w, 22);
    ctx.fillStyle = "#e4e4e7";
    ctx.font = "bold 10px ui-monospace, Menlo, monospace";
    ctx.fillText("search.google.com/console", 8, 14);
    if (Math.floor(time * 1.5) % 2 === 0) {
      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.arc(w - 32, 11, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#10b981";
    ctx.font = "9px ui-monospace, Menlo, monospace";
    ctx.fillText("LIVE", w - 24, 14);
    let avgClicks = 0;
    let avgImpr = 0;
    for (let i = 0; i < s.data.length; i++) {
      avgClicks += s.data[i].clicks;
      avgImpr += s.data[i].impr;
    }
    avgClicks /= s.data.length;
    avgImpr /= s.data.length;
    const totalClicks = Math.floor(avgClicks * 20000);
    const totalImpr = Math.floor(avgImpr * 850000);
    const ctr = ((totalClicks / totalImpr) * 100).toFixed(1) + "%";
    const pos = (20 + Math.sin(s.phase * 0.5) * 5).toFixed(1);
    const kpis = [
      { label: "CLICKS", value: (totalClicks / 1000).toFixed(1) + "K", color: "#3b82f6" },
      { label: "IMPR", value: Math.floor(totalImpr / 1000) + "K", color: "#10b981" },
      { label: "CTR", value: ctr, color: "#f59e0b" },
      { label: "POS", value: pos, color: "#a78bfa" },
    ];
    const colW = w / 4;
    for (let k = 0; k < 4; k++) {
      const x = k * colW;
      ctx.fillStyle = "#6b7280";
      ctx.font = "8px ui-monospace, Menlo, monospace";
      ctx.fillText(kpis[k].label, x + 6, 36);
      ctx.fillStyle = kpis[k].color;
      ctx.font = "bold 13px ui-monospace, Menlo, monospace";
      ctx.fillText(kpis[k].value, x + 6, 53);
    }
    const chartTop = 64;
    const chartBottom = h - 16;
    const chartLeft = 12;
    const chartRight = w - 12;
    const chartH = chartBottom - chartTop;
    const chartW = chartRight - chartLeft;
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let g = 0; g <= 3; g++) {
      const gy = chartTop + (chartH * g) / 3;
      ctx.beginPath();
      ctx.moveTo(chartLeft, gy);
      ctx.lineTo(chartRight, gy);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(16,185,129,0.12)";
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartBottom);
    for (let i = 0; i < s.data.length; i++) {
      const x = chartLeft + (chartW * i) / (s.data.length - 1);
      const y = chartTop + chartH - s.data[i].impr * chartH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(chartRight, chartBottom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < s.data.length; i++) {
      const x = chartLeft + (chartW * i) / (s.data.length - 1);
      const y = chartTop + chartH - s.data[i].impr * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(59,130,246,0.18)";
    ctx.beginPath();
    ctx.moveTo(chartLeft, chartBottom);
    for (let i = 0; i < s.data.length; i++) {
      const x = chartLeft + (chartW * i) / (s.data.length - 1);
      const y = chartTop + chartH - s.data[i].clicks * chartH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(chartRight, chartBottom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < s.data.length; i++) {
      const x = chartLeft + (chartW * i) / (s.data.length - 1);
      const y = chartTop + chartH - s.data[i].clicks * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const lx = chartRight;
    const ly = chartTop + chartH - s.data[s.data.length - 1].clicks * chartH;
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(59,130,246,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(lx, ly, 5 + Math.sin(time * 3) * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#3b82f6";
    ctx.fillRect(12, h - 10, 8, 2);
    ctx.fillStyle = "#9ca3af";
    ctx.font = "8px ui-monospace, Menlo, monospace";
    ctx.fillText("Clicks", 24, h - 5);
    ctx.fillStyle = "#10b981";
    ctx.fillRect(60, h - 10, 8, 2);
    ctx.fillStyle = "#9ca3af";
    ctx.fillText("Impressions", 72, h - 5);
    ctx.textAlign = "right";
    ctx.fillStyle = "#6b7280";
    ctx.fillText(s.agent.toLowerCase(), w - 12, h - 5);
    ctx.textAlign = "left";
  },
};

export default chartRenderer;
