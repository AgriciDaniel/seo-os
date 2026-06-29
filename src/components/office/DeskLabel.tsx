"use client";

/**
 * DeskLabel — canvas-rendered sprite floating behind/above each desk.
 *
 * Spec: docs spec §4 ("Per-specialist label"). The label sits at
 * desk-local `[0, 2.15, -0.4]` and scales to `[1.7, 0.38, 1]` in world units.
 *
 * The canvas texture is memoized on `(id, active)` so we don't reallocate
 * canvas + texture every frame. We honor `devicePixelRatio` so retina
 * displays get a crisper bitmap without changing the rendered world scale.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { SPECIALIST_LABELS, type SpecialistId } from "./positions";

interface DeskLabelProps {
  id: SpecialistId;
  /** Desk root position (world). The sprite is offset to desk-local
   *  `[0, 2.15, -0.4]` from this. Defaults to origin so the label can be
   *  placed inside a `<group position={...}>` parent if preferred. */
  position?: [number, number, number];
  active: boolean;
}

const BASE_W = 256;
const BASE_H = 56;

function drawLabel(
  ctx: CanvasRenderingContext2D,
  id: SpecialistId,
  active: boolean,
  dpr: number,
) {
  const w = BASE_W * dpr;
  const h = BASE_H * dpr;

  // Clear (in case of redraw on the same canvas)
  ctx.clearRect(0, 0, w, h);

  // Rounded-rect background, full canvas
  const radius = 10 * dpr;
  ctx.fillStyle = active ? "rgba(8,8,12,0.85)" : "rgba(8,8,12,0.55)";
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(w - radius, 0);
  ctx.quadraticCurveTo(w, 0, w, radius);
  ctx.lineTo(w, h - radius);
  ctx.quadraticCurveTo(w, h, w - radius, h);
  ctx.lineTo(radius, h);
  ctx.quadraticCurveTo(0, h, 0, h - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fill();

  // Accent bar — 4px wide, left edge, full height
  ctx.fillStyle = active ? "#10b981" : "#3a3a3a";
  ctx.fillRect(0, 0, 4 * dpr, h);

  // Text — bold 18px ui-monospace, padded 16px from accent bar, vertically centered
  ctx.fillStyle = active ? "#ffffff" : "#6a6a72";
  ctx.font = `bold ${18 * dpr}px ui-monospace, monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(SPECIALIST_LABELS[id].toUpperCase(), (4 + 16) * dpr, h / 2);
}

export function DeskLabel({
  id,
  position = [0, 0, 0],
  active,
}: DeskLabelProps) {
  const texture = useMemo(() => {
    const dpr =
      typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const canvas = document.createElement("canvas");
    canvas.width = BASE_W * dpr;
    canvas.height = BASE_H * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) drawLabel(ctx, id, active, dpr);
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }, [id, active]);

  // Dispose previous texture when the memo recomputes or component unmounts
  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  return (
    <sprite
      position={[position[0], position[1] + 2.15, position[2] - 0.4]}
      scale={[1.7, 0.38, 1]}
    >
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}
