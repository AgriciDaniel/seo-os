import type { ScreenRenderer } from "./types";

interface CompleteState {
  type: "complete";
  t: number;
}

const complete: ScreenRenderer<CompleteState> = {
  intervalMs: 120,
  createState: () => ({ type: "complete", t: 0 }),
  tick: (state) => {
    state.t += 1;
  },
  draw: (ctx, w, h, state) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#020403";
    ctx.fillRect(0, 0, w, h);

    const pulse = 0.55 + Math.sin(state.t * 0.25) * 0.18;
    ctx.strokeStyle = `rgba(16, 185, 129, ${pulse})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, w - 36, h - 36);

    ctx.fillStyle = "rgba(16, 185, 129, 0.16)";
    ctx.fillRect(24, 24, w - 48, h - 48);

    ctx.strokeStyle = "#80fdb8";
    ctx.lineWidth = 14;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(94, 100);
    ctx.lineTo(134, 134);
    ctx.lineTo(224, 62);
    ctx.stroke();

    ctx.fillStyle = "#e8fff3";
    ctx.font = "bold 18px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("COMPLETE", w / 2, 168);
  },
};

export default complete;
