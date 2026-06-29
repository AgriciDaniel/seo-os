"use client";

/**
 * Platform — the charcoal AMPHITHEATER floor + emerald edge ring + emerald
 * underglow disc, with the orchestrator dais at the center.
 *
 * Spec: docs/design/2026-05-11-seo-office-design.md §4 (Platform + Dais)
 * and the circular amphitheater update — three concentric rings of agents
 * around the dais at origin (replaces the previous rectangular grid).
 *
 * Content-only R3F component. Drops into a parent <Canvas>. No useFrame
 * animation, no lighting, no controls — pure static geometry.
 */

import { PLATFORM_RADIUS, SCENE_COLORS } from "./positions";

/* Hardcoded scene constants (not part of the design tokens). */
const PLATFORM_TOP_COLOR = "#0b0b10";
const UNDERGLOW_COLOR = "#10b981"; // --accent-emerald
const DAIS_BODY_COLOR = "#18181b";

/** 24 evenly spaced positions around the dais rim in the XZ plane. */
const RIM_SPHERES: Array<[number, number, number]> = Array.from(
  { length: 24 },
  (_, i) => {
    const theta = (i / 24) * Math.PI * 2;
    return [Math.cos(theta) * 3.2, 0.605, Math.sin(theta) * 3.2];
  },
);

export function Platform() {
  return (
    <group>
      {/* Platform top — charcoal disc. */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[PLATFORM_RADIUS, PLATFORM_RADIUS, 0.2, 96]} />
        <meshStandardMaterial color={PLATFORM_TOP_COLOR} />
      </mesh>

      {/* Emerald edge ring — sits on top of the disc edge, thin and glowing. */}
      <mesh position={[0, 0.005, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[PLATFORM_RADIUS, 0.04, 12, 128]} />
        <meshBasicMaterial
          color={UNDERGLOW_COLOR}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Emerald underglow disc — additive halo just under the slab. */}
      <mesh position={[0, -0.22, 0]}>
        <cylinderGeometry args={[PLATFORM_RADIUS + 0.4, PLATFORM_RADIUS + 0.4, 0.04, 96]} />
        <meshBasicMaterial
          color={UNDERGLOW_COLOR}
          transparent
          opacity={0.45}
          depthWrite={false}
        />
      </mesh>

      {/* Orchestrator dais — cylinder body at origin. The cylinder is 0.6
          tall and positioned by its centroid (y=0.3), so its TOP lands at
          y=0.6 = ORCHESTRATOR_POSITION.y where the workstation anchors. */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[3.2, 3.45, 0.6, 48]} />
        <meshStandardMaterial color={DAIS_BODY_COLOR} />
      </mesh>

      {/* Gold rim torus. */}
      <mesh position={[0, 0.605, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[3.2, 0.045, 12, 80]} />
        <meshStandardMaterial color={SCENE_COLORS.orchestratorGold} />
      </mesh>

      {/* 24 small gold spheres evenly spaced around the rim. */}
      {RIM_SPHERES.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color={SCENE_COLORS.orchestratorGold} />
        </mesh>
      ))}

      {/* Gold underdisc — soft glow under the dais base. */}
      <mesh position={[0, 0.005, 0]}>
        <cylinderGeometry args={[3.55, 3.55, 0.04, 48]} />
        <meshStandardMaterial
          color={SCENE_COLORS.orchestratorGold}
          transparent
          opacity={0.55}
        />
      </mesh>
    </group>
  );
}
