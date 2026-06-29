/**
 * Off-state renderer — a near-black canvas with a faint center vignette and
 * a single red corner LED. Renders once; tick is a no-op and intervalMs is
 * absurdly high so the parent never schedules a redraw.
 */

import type { ScreenRenderer } from "./types";

interface OffState {
  type: "off";
}

const offRenderer: ScreenRenderer<OffState> = {
  intervalMs: 99999,

  createState() {
    return { type: "off" };
  },

  tick() {
    /* no-op */
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  draw(ctx, w, h, _s, _time) {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);
    const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
    grad.addColorStop(0, "rgba(255,255,255,0.015)");
    grad.addColorStop(1, "rgba(0,0,0,0.2)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(w - 10, h - 10, 1.8, 0, Math.PI * 2);
    ctx.fill();
  },
};

export default offRenderer;
