/**
 * Dashboard renderer — orchestrator centerpiece. Fleet count + queue depth
 * + completed count + sparkline + scrolling event feed. Phase advances on
 * each tick; queue depth oscillates; event offset cycles through the feed.
 *
 * Note: the prototype uses `Math.random()` directly for sparkline jitter
 * (not the seeded RNG). We mirror that to preserve the visual feel.
 */

import type { ScreenRenderer } from "./types";

interface DashboardEvent {
  c: string;
  t: string;
}

interface DashboardState {
  type: "dashboard";
  activeCount: number;
  queueDepth: number;
  completed: number;
  sparkData: number[];
  events: DashboardEvent[];
  eventOffset: number;
  tickCount: number;
  phase: number;
}

const dashboardRenderer: ScreenRenderer<DashboardState> = {
  intervalMs: 220,

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createState(_agent, _seed) {
    const sparkData: number[] = [];
    for (let i = 0; i < 32; i++) sparkData.push(0.3 + Math.random() * 0.5);
    return {
      type: "dashboard",
      activeCount: 16,
      queueDepth: 5,
      completed: 147,
      sparkData,
      events: [
        { c: "#10b981", t: "✓ technical · audit complete" },
        { c: "#10b981", t: "✓ schema · 12 entities written" },
        { c: "#3b82f6", t: "→ content · drafting brief" },
        { c: "#10b981", t: "✓ keywords · ranks updated" },
        { c: "#3b82f6", t: "→ images · processing alts" },
        { c: "#10b981", t: "✓ audit · 47 checks passed" },
        { c: "#f59e0b", t: "⚠ drift · 3 changes flagged" },
        { c: "#10b981", t: "✓ sitemap · regenerated" },
        { c: "#10b981", t: "✓ google · GSC synced" },
        { c: "#3b82f6", t: "→ strategy · planning Q4" },
        { c: "#10b981", t: "✓ briefs · 4 published" },
        { c: "#10b981", t: "✓ local · pack ranks tracked" },
      ],
      eventOffset: 0,
      tickCount: 0,
      phase: 0,
    };
  },

  tick(s) {
    s.tickCount++;
    s.phase += 0.05;
    if (s.tickCount % 4 === 0) {
      s.eventOffset++;
    }
    if (s.tickCount % 3 === 0) {
      s.completed++;
    }
    s.queueDepth = 4 + Math.floor(Math.sin(s.phase * 0.4) * 2 + 2);
    s.sparkData.shift();
    s.sparkData.push(0.3 + Math.sin(s.phase) * 0.25 + Math.random() * 0.25);
  },

  draw(ctx, w, h, s, time) {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#161b22";
    ctx.fillRect(0, 0, w, 22);
    ctx.fillStyle = "#c9a45b";
    ctx.font = "bold 10px ui-monospace, Menlo, monospace";
    ctx.fillText("◆ ORCHESTRATOR · COMMAND", 8, 14);
    if (Math.floor(time * 1.5) % 2 === 0) {
      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.arc(w - 28, 11, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#10b981";
    ctx.font = "9px ui-monospace, Menlo, monospace";
    ctx.fillText("LIVE", w - 22, 14);
    ctx.fillStyle = "#6b7280";
    ctx.font = "8px ui-monospace, Menlo, monospace";
    ctx.fillText("FLEET", 8, 36);
    ctx.fillStyle = "#10b981";
    ctx.font = "bold 18px ui-monospace, Menlo, monospace";
    ctx.fillText(s.activeCount.toString(), 8, 56);
    ctx.fillStyle = "#6b7280";
    ctx.font = "9px ui-monospace, Menlo, monospace";
    ctx.fillText("/26", 30, 56);
    ctx.fillStyle = "#6b7280";
    ctx.font = "8px ui-monospace, Menlo, monospace";
    ctx.fillText("QUEUE", w / 2 - 20, 36);
    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 18px ui-monospace, Menlo, monospace";
    ctx.fillText(s.queueDepth.toString(), w / 2 - 20, 56);
    ctx.fillStyle = "#6b7280";
    ctx.font = "8px ui-monospace, Menlo, monospace";
    ctx.fillText("DONE", w - 78, 36);
    ctx.fillStyle = "#3b82f6";
    ctx.font = "bold 18px ui-monospace, Menlo, monospace";
    ctx.fillText(s.completed.toString(), w - 78, 56);
    const sparkTop = 68;
    const sparkH = 20;
    const sparkLeft = 8;
    const sparkRight = w - 8;
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sparkLeft, sparkTop + sparkH);
    ctx.lineTo(sparkRight, sparkTop + sparkH);
    ctx.stroke();
    ctx.fillStyle = "rgba(201,164,91,0.15)";
    ctx.beginPath();
    ctx.moveTo(sparkLeft, sparkTop + sparkH);
    for (let i = 0; i < s.sparkData.length; i++) {
      const x = sparkLeft + ((sparkRight - sparkLeft) * i) / (s.sparkData.length - 1);
      const y = sparkTop + sparkH - s.sparkData[i] * sparkH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(sparkRight, sparkTop + sparkH);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#c9a45b";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < s.sparkData.length; i++) {
      const x = sparkLeft + ((sparkRight - sparkLeft) * i) / (s.sparkData.length - 1);
      const y = sparkTop + sparkH - s.sparkData[i] * sparkH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = "#6b7280";
    ctx.font = "8px ui-monospace, Menlo, monospace";
    ctx.fillText("RECENT", 8, 102);
    ctx.font = "9px ui-monospace, Menlo, monospace";
    for (let i = 0; i < 6; i++) {
      const e = s.events[(s.eventOffset + i) % s.events.length];
      ctx.fillStyle = e.c;
      ctx.fillText(e.t, 8, 116 + i * 13);
    }
  },
};

export default dashboardRenderer;
