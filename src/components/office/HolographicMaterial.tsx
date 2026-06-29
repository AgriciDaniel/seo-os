"use client";

/**
 * Holographic material wrapper.
 *
 * Re-exports Andersson Mancini's vendored HolographicMaterial component with
 * a typed TS signature. Source: `vendored/three-holographic-material/`
 * (gist: https://gist.github.com/ektogamat/f33dce31ee3ab02ea68f7b7c18ecd016).
 *
 * Also exports `<AgentHologram>` — the avatar bust convenience wrapper
 * (head + tapered torso, no hands/arms/legs — see scene spec §5).
 */

import HolographicMaterialVendored from "../../../vendored/three-holographic-material/HolographicMaterial.js";

export interface HolographicMaterialProps {
  fresnelAmount?: number;
  fresnelOpacity?: number;
  scanlineSize?: number;
  hologramBrightness?: number;
  signalSpeed?: number;
  hologramColor?: string;
  enableBlinking?: boolean;
  blinkFresnelOnly?: boolean;
  blinkFrequency?: number;
  enableAdditive?: boolean;
  hologramOpacity?: number;
  side?: "FrontSide" | "BackSide" | "DoubleSide";
}

/**
 * Re-export with a typed signature. The vendored file is JS — we cast at the
 * boundary so the rest of the scene gets autocomplete + checking.
 */
export const HolographicMaterial = HolographicMaterialVendored as unknown as React.FC<HolographicMaterialProps>;

/* -------------------------------------------------------------------------- */
/* AgentHologram — the bust used on every active specialist + the orchestrator */
/* -------------------------------------------------------------------------- */

const SHARED_PROPS: HolographicMaterialProps = {
  fresnelAmount: 0.45,
  fresnelOpacity: 1.0,
  scanlineSize: 8,
  hologramBrightness: 1.1,
  signalSpeed: 2.0,
  enableBlinking: true,
  blinkFresnelOnly: true,
  hologramOpacity: 0.65,
  enableAdditive: true,
  side: "DoubleSide",
};

/**
 * Head + tapered-torso bust. NO hands, NO arms, NO legs — classic projected
 * hologram aesthetic per scene spec §5. Default emerald; orchestrator passes
 * a gold color.
 *
 * Coordinates assume the parent group is positioned at the chair seat
 * (`y ≈ 0.50`, `z ≈ 1.0` in desk-local space).
 */
export function AgentHologram({
  color = "#10b981",
  scale = 1,
  brightness,
}: {
  color?: string;
  scale?: number;
  /** Overrides the shader's `hologramBrightness`. Default ~1.1 (full
   *  presence). Hover-preview ghosts pass ~0.45 for a dim, half-there read. */
  brightness?: number;
}) {
  const material: HolographicMaterialProps = {
    ...SHARED_PROPS,
    hologramColor: color,
    ...(brightness !== undefined ? { hologramBrightness: brightness } : {}),
  };
  return (
    <group scale={scale}>
      {/* head */}
      <mesh position={[0, 0.7, 0]} scale={[1, 1.05, 0.95]}>
        <sphereGeometry args={[0.14, 18, 14]} />
        <HolographicMaterial {...material} />
      </mesh>
      {/* tapered torso */}
      <mesh position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.22, 0.16, 0.5, 16]} />
        <HolographicMaterial {...material} />
      </mesh>
    </group>
  );
}
