"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConnectionsStore, type Edge } from "@/store/connections";
import { useWindowStore, type WindowSpec } from "@/store/windows";

interface PendingParticle {
  id: string;
  edgeId: string;
  direction: "forward" | "reverse";
  color: string; // "var(--accent)" or "var(--err)"
  bornAt: number;
}

const PARTICLE_DURATION_MS = 700;

function windowCenter(w: WindowSpec): { x: number; y: number } | null {
  if (w.minimized) return null;
  return { x: w.x + w.w / 2, y: w.y + w.h / 2 };
}

function bezier(
  from: { x: number; y: number },
  to: { x: number; y: number },
): {
  d: string;
  midX: number;
  midY: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
} {
  // Cubic bezier with vertical control offsets so curves arc over instead of
  // cutting straight through. Offset scales with horizontal distance.
  const dx = Math.abs(to.x - from.x);
  const lift = Math.max(40, Math.min(120, dx * 0.35));
  const c1x = from.x + (to.x - from.x) * 0.25;
  const c1y = from.y - lift;
  const c2x = from.x + (to.x - from.x) * 0.75;
  const c2y = to.y - lift;
  const midX = (from.x + 3 * c1x + 3 * c2x + to.x) / 8;
  const midY = (from.y + 3 * c1y + 3 * c2y + to.y) / 8;
  return {
    d: `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`,
    midX,
    midY,
    c1x,
    c1y,
    c2x,
    c2y,
  };
}

function pointOnBezier(
  from: { x: number; y: number },
  c1: { x: number; y: number },
  c2: { x: number; y: number },
  to: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  const x =
    u * u * u * from.x +
    3 * u * u * t * c1.x +
    3 * u * t * t * c2.x +
    t * t * t * to.x;
  const y =
    u * u * u * from.y +
    3 * u * u * t * c1.y +
    3 * u * t * t * c2.y +
    t * t * t * to.y;
  return { x, y };
}

export function EdgeLayer() {
  const edges = useConnectionsStore((s) => s.edges);
  const lastPulse = useConnectionsStore((s) => s.lastPulse);
  const windows = useWindowStore((s) => s.windows);
  const [particles, setParticles] = useState<PendingParticle[]>([]);
  const seenAtRef = useRef<number>(0);
  // `now` is updated every RAF tick so particle positions are computed from
  // a stable, React-visible value — avoids calling performance.now() directly
  // inside the render body (which the React Compiler flags as impure).
  const [now, setNow] = useState(0);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);

  // Mount portal under #os-workspace, BELOW the window portal so edges sit
  // visually beneath windows but above the wallpaper.
  useEffect(() => {
    const el = document.createElement("div");
    el.id = "edge-portal-layer";
    el.style.position = "absolute";
    el.style.inset = "0";
    el.style.pointerEvents = "none";
    el.style.zIndex = "25"; // window portal is 30; edges sit just below
    const host = document.getElementById("os-workspace") ?? document.body;
    host.appendChild(el);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayer(el);
    return () => {
      el.remove();
    };
  }, []);

  // Capture pulses into local particle queue.
  // bornAt is captured in the effect (inside useEffect, not render) so it
  // doesn't violate purity rules.
  useEffect(() => {
    if (!lastPulse || lastPulse.bornAt <= seenAtRef.current) return;
    seenAtRef.current = lastPulse.bornAt;
    const bornAt = performance.now();
    setParticles((arr) => [
      ...arr,
      {
        id: `${lastPulse.edgeId}-${lastPulse.bornAt}`,
        edgeId: lastPulse.edgeId,
        direction: lastPulse.direction,
        color: lastPulse.kind === "err" ? "var(--err)" : "var(--accent)",
        bornAt,
      },
    ]);
  }, [lastPulse]);

  // requestAnimationFrame tick — advances `now` and prunes expired particles.
  // `now` drives all position math in the render body, keeping render pure.
  useEffect(() => {
    if (particles.length === 0) return;
    let raf = 0;
    const loop = () => {
      const t = performance.now();
      setNow(t);
      setParticles((arr) =>
        arr.filter((p) => t - p.bornAt < PARTICLE_DURATION_MS),
      );
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [particles.length]);

  if (!layer) return null;

  // Resolve each edge's endpoint positions via identityKey lookup
  function resolveEdge(e: Edge) {
    const from = windows.find((w) => w.identityKey === e.fromKey);
    const to = windows.find((w) => w.identityKey === e.toKey);
    if (!from || !to) return null;
    const fc = windowCenter(from);
    const tc = windowCenter(to);
    if (!fc || !tc) return null;
    return { from: fc, to: tc };
  }

  return createPortal(
    <svg
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <defs>
        {/* Soft glow for particles */}
        <filter id="edge-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {edges.map((edge) => {
        const r = resolveEdge(edge);
        if (!r) return null;
        const b = bezier(r.from, r.to);
        return (
          <g key={edge.id}>
            <path
              d={b.d}
              fill="none"
              stroke="var(--accent)"
              strokeOpacity={0.35}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeDasharray="4 6"
            />
          </g>
        );
      })}
      {particles.map((p) => {
        const edge = edges.find((e) => e.id === p.edgeId);
        if (!edge) return null;
        const r = resolveEdge(edge);
        if (!r) return null;
        const b = bezier(r.from, r.to);
        // `now` was set in the RAF loop — pure from React's perspective.
        const elapsed = now - p.bornAt;
        const t0 = Math.min(1, elapsed / PARTICLE_DURATION_MS);
        const t = p.direction === "reverse" ? 1 - t0 : t0;
        const pos = pointOnBezier(
          r.from,
          { x: b.c1x, y: b.c1y },
          { x: b.c2x, y: b.c2y },
          r.to,
          t,
        );
        const fade = t0 < 0.85 ? 1 : 1 - (t0 - 0.85) / 0.15;
        return (
          <circle
            key={p.id}
            cx={pos.x}
            cy={pos.y}
            r={4}
            fill={p.color}
            opacity={fade}
            filter="url(#edge-glow)"
          />
        );
      })}
    </svg>,
    layer,
  );
}
