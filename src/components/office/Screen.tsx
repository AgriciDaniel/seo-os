"use client";

/**
 * Screen — mounts a 320×192 offscreen canvas, picks the right renderer for
 * its agent + state, and feeds the canvas to a meshStandardMaterial as both
 * `map` and `emissiveMap`. The parent BoxGeometry attaches us to material-4
 * (the +Z face) by default.
 *
 * The renderer's `intervalMs` throttles redraws — useFrame fires every
 * frame, but we only tick + redraw when enough wall time has elapsed.
 * `off` screens render once on mount and then sleep (intervalMs = 99999).
 */

import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { SCREEN_TYPE_BY_SPECIALIST, type SpecialistId, type ScreenType } from "./positions";
import { EMISSIVE_INTENSITY_BY_TYPE, getRenderer } from "./screen-renderers";
import { useSpecialistsStore } from "@/store/specialists";

interface CanvasBundle {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
}

/**
 * Allocate the canvas + CanvasTexture once per (agentId, seed, renderer)
 * tuple. We use lazy useState (not useMemo) so React 19's react-hooks
 * linter doesn't flag the in-place `needsUpdate` mutation that follows
 * every redraw — useState values are designed to be passed to imperative
 * APIs and mutated through them, which is exactly what Three.js does with
 * `CanvasTexture.needsUpdate`. The texture itself is a stable identity
 * across renders, so attaching it to <meshStandardMaterial map={...}>
 * doesn't churn material rebuilds.
 */
function createBundle(): CanvasBundle | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 192;
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return { canvas, texture };
}

interface ScreenProps {
  /** "orchestrator" or a specialist id. Type is looked up from
   *  SCREEN_TYPE_BY_SPECIALIST unless `typeOverride` is set. */
  agentId: SpecialistId | "orchestrator";
  /** Override the resolved type — used by the orchestrator's 3 monitors
   *  (center=dashboard, left=chart, right=terminal). */
  typeOverride?: ScreenType;
  /** false → render the `off` canvas (black + red corner LED). */
  active: boolean;
  /** true → render the short terminal success canvas. */
  completed?: boolean;
  /** Per-screen animation phase offset. */
  seed: number;
  /** Which material slot to attach to (defaults to material-4 = +Z face on
   *  the monitor BoxGeometry). */
  attach?: string;
}

export function Screen({
  agentId,
  typeOverride,
  active,
  completed = false,
  seed,
  attach = "material-4",
}: ScreenProps) {
  const resolvedType: ScreenType = completed
    ? "complete"
    : active
    ? (typeOverride ??
      (agentId === "orchestrator"
        ? "dashboard"
        : SCREEN_TYPE_BY_SPECIALIST[agentId as SpecialistId]))
    : "off";

  const renderer = useMemo(() => getRenderer(resolvedType), [resolvedType]);

  // Lazy one-time allocation. We deliberately ignore subsequent changes to
  // (agentId, seed, renderer) — when those change, the parent should remount
  // the Screen (key on the parent). This keeps the texture identity stable.
  const [bundle] = useState<CanvasBundle | null>(createBundle);

  const stateRef = useRef<unknown>(null);
  const lastUpdateRef = useRef(0);

  // Subscribe to specialistsStore for this agent's live monitor state.
  // Orchestrator desks always return "idle" — they have their own always-on
  // renderer and don't need overlay treatment.
  const monitorState = useSpecialistsStore((s) =>
    typeof agentId === "string" && agentId !== "orchestrator"
      ? (s.byId[agentId]?.state ?? "idle")
      : "idle",
  );

  // Track last overlay-painted state. When monitorState changes, force a
  // redraw in the next useFrame by clearing the throttle gate.
  const lastOverlayStateRef = useRef<string>("idle");
  useEffect(() => {
    if (monitorState !== lastOverlayStateRef.current) {
      lastUpdateRef.current = 0;
    }
  }, [monitorState]);

  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    if (!bundle) return;
    stateRef.current = renderer.createState(agentId, seed);
    lastUpdateRef.current = 0;
    const ctx = bundle.canvas.getContext("2d");
    if (ctx) {
      renderer.draw(ctx, 320, 192, stateRef.current, 0);
      // Three.js documented pattern — flag the GPU upload after a canvas draw.
      // eslint-disable-next-line react-hooks/immutability
      bundle.texture.needsUpdate = true;
    }
    return () => {
      stateRef.current = null;
    };
  }, [agentId, seed, renderer, bundle]);

  // Final cleanup — dispose the GPU texture when the component unmounts.
  useEffect(() => {
    return () => {
      bundle?.texture.dispose();
    };
  }, [bundle]);

  // eslint-disable-next-line react-hooks/immutability
  useFrame(({ clock }) => {
    const now = clock.elapsedTime * 1000;
    if (now - lastUpdateRef.current < renderer.intervalMs) return;
    const state = stateRef.current;
    if (!bundle || state == null) return;
    if (
      typeof state === "object" &&
      "type" in state &&
      state.type !== resolvedType
    ) {
      return;
    }
    const ctx = bundle.canvas.getContext("2d");
    if (!ctx) return;
    renderer.tick(state);
    renderer.draw(ctx, 320, 192, state, clock.elapsedTime);

    // Monitor state overlay — drawn ON TOP of the renderer's output.
    // "review" → small yellow corner ribbon in top-right.
    // "failed" → red bezel border.
    // "idle" / "running" → no overlay (renderer handles those).
    if (monitorState === "review") {
      ctx.fillStyle = "#f5c842";
      ctx.beginPath();
      ctx.moveTo(bundle.canvas.width, 0);
      ctx.lineTo(bundle.canvas.width - 16, 0);
      ctx.lineTo(bundle.canvas.width, 16);
      ctx.closePath();
      ctx.fill();
    } else if (monitorState === "failed") {
      ctx.strokeStyle = "#ff6b6b";
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, bundle.canvas.width - 4, bundle.canvas.height - 4);
    }
    // TODO(theming): pipe theme tokens (--ribbon, --err) into this paint
    // context. v1 hardcodes the canonical accents.
    lastOverlayStateRef.current = monitorState;

    // eslint-disable-next-line react-hooks/immutability
    bundle.texture.needsUpdate = true;
    lastUpdateRef.current = now;
  });

  return (
    <meshStandardMaterial
      attach={attach}
      map={bundle?.texture ?? undefined}
      emissive="#ffffff"
      emissiveMap={bundle?.texture ?? undefined}
      emissiveIntensity={EMISSIVE_INTENSITY_BY_TYPE[resolvedType]}
      roughness={0.4}
    />
  );
}
