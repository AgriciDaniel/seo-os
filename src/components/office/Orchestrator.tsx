"use client";

/**
 * Orchestrator — the boss desk on the gold dais.
 *
 * Content-only group at `ORCHESTRATOR_POSITION`, rotated 180° (group y=π)
 * so the U-shape monitor cluster faces the specialists.
 *
 * Local coordinate convention (after the y=π flip): the chair is at +z, the
 * monitors are at -z, and the avatar sits on the chair. All positions below
 * mirror the reference cosmos HTML so the workstation reads as one piece of
 * furniture instead of three floating slabs.
 *
 * Spec: docs spec §4 ("Orchestrator") + §5 (gold avatar) + §6 (always visible).
 */

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { memo, useEffect, useRef } from "react";
import * as THREE from "three";
import { AgentHologram } from "./HolographicMaterial";
import { Screen } from "./Screen";
import { ORCHESTRATOR_POSITION, SCENE_COLORS } from "./positions";

// The orchestrator is always rendered identically per spec §6 ("never idle").
// Screens, spill light, and avatar are hardcoded on. If the orchestrator
// later gains specialist-style job semantics, reintroduce an `active` prop.
interface OrchestratorProps {
  /** Fired when the user clicks anywhere on the orchestrator (except the
   *  speaker tower, which has its own handler). Parent typically uses this
   *  to set the chat target to "orchestrator" and fly the camera in. */
  onSelect?: () => void;
  /** Ambient music currently playing — drives the speaker-tower pulse. */
  musicPlaying?: boolean;
  /** Fired when the user clicks the side tower (the "speaker"). Parent
   *  toggles ambient music. */
  onToggleMusic?: () => void;
  /** True while an agentic chat stream is open (orchestrator LLM mid-call).
   *  Drives the bust's wider idle-wiggle and the FloatingOcta intensification.
   *  Sourced from `useOrchestratorThinking(slug)` in OfficeScene. */
  thinking?: boolean;
  /** Honor `prefers-reduced-motion` — snap to thinking pose without
   *  sinusoidal motion. */
  reducedMotion?: boolean;
}

const CHARCOAL = "#18181b";
const DESK = "#2a2a32";
const LEATHER = "#1a1a1f";
const LEATHER_DARK = "#0d0d12";
const METAL = "#27272a";
const POST_METAL = "#52525b";
const WHEEL = "#0a0a0a";
const TOWER_BODY = "#18181b";

const GOLD = SCENE_COLORS.orchestratorGold;
/** Spill light from the active monitor cluster (warm mint). */
const SCREEN_ACCENT = "#a8e8c8";

/** Gold octahedron hologram floating above the desk. When `thinking` is
 *  true (agentic stream open), the inner mesh's scale-pulse amplitude
 *  doubles and the outer wireframe brightens — the single most visible
 *  "the orchestrator is processing right now" cue in the scene. */
function FloatingOcta({
  thinking = false,
  reducedMotion = false,
}: {
  thinking?: boolean;
  reducedMotion?: boolean;
}) {
  const outer = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);
  const outerMat = useRef<THREE.MeshBasicMaterial>(null);
  const innerMat = useRef<THREE.MeshBasicMaterial>(null);
  // Lerped intensities so the transition between idle and thinking is
  // buttery, not jumpy. Each frame we step toward the target.
  const ampRef = useRef(0.15);
  const outerOpacityRef = useRef(0.8);
  const innerOpacityRef = useRef(0.95);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const targetAmp = thinking ? 0.35 : 0.15;
    const targetOuter = thinking ? 1.0 : 0.8;
    const targetInner = thinking ? 1.0 : 0.95;
    // 8x per second easing — feels responsive without snapping.
    const k = Math.min(1, delta * 8);
    ampRef.current += (targetAmp - ampRef.current) * k;
    outerOpacityRef.current += (targetOuter - outerOpacityRef.current) * k;
    innerOpacityRef.current += (targetInner - innerOpacityRef.current) * k;

    if (outer.current) {
      outer.current.rotation.y += (thinking ? 0.022 : 0.012);
      outer.current.rotation.x += (thinking ? 0.011 : 0.006);
    }
    if (inner.current) {
      inner.current.rotation.y -= (thinking ? 0.034 : 0.018);
      const freq = thinking ? 2.4 : 1.5;
      const s = reducedMotion
        ? 0.85 + ampRef.current // freeze at peak when motion is reduced
        : 0.85 + Math.sin(t * freq) * ampRef.current;
      inner.current.scale.setScalar(s);
    }
    if (outerMat.current) outerMat.current.opacity = outerOpacityRef.current;
    if (innerMat.current) innerMat.current.opacity = innerOpacityRef.current;
  });

  return (
    <group position={[0, 2.2, -0.85]}>
      <mesh ref={outer}>
        <octahedronGeometry args={[0.16, 0]} />
        <meshBasicMaterial ref={outerMat} color={GOLD} wireframe transparent opacity={0.8} />
      </mesh>
      <mesh ref={inner}>
        <octahedronGeometry args={[0.06, 0]} />
        <meshBasicMaterial ref={innerMat} color="#ffeaa3" transparent opacity={0.95} />
      </mesh>
    </group>
  );
}

function OrchestratorThinkingBubble() {
  return (
    <Html
      position={[0, 2.95, -0.55]}
      center
      transform
      distanceFactor={7}
      zIndexRange={[35, 0]}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      <div className="agent-bubble agent-bubble--orchestrator" aria-label="Orchestrator thinking">
        <span className="agent-bubble__pulse" />
        <span className="agent-bubble__text">Thinking</span>
        <span className="agent-bubble__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="agent-bubble__bar">
          <span />
        </span>
      </div>
    </Html>
  );
}

/** Low-profile mechanical-style keyboard on the center desk. A dark
 *  base slab (slightly raised off the gold trim) plus a 4×13 grid of
 *  square key bumps. Each key reads as a distinct cap from any of the
 *  office's preferred camera angles, so the desk doesn't look like the
 *  flat gold rectangle it was before. Static — no animation. */
function Keyboard() {
  const ROWS = 4;
  const COLS = 13;
  const KEY_W = 0.045;
  const KEY_D = 0.045;
  const KEY_H = 0.012;
  const GAP = 0.008;
  // Total grid extent so we can center it on the base.
  const gridW = COLS * KEY_W + (COLS - 1) * GAP;
  const gridD = ROWS * KEY_D + (ROWS - 1) * GAP;
  const baseW = gridW + 0.04;
  const baseD = gridD + 0.05;
  const baseY = 0.795;
  const baseCenterZ = -0.32;
  const keyTopY = baseY + 0.008 + KEY_H / 2;

  return (
    <group>
      {/* Base slab */}
      <mesh position={[0, baseY, baseCenterZ]}>
        <boxGeometry args={[baseW, 0.018, baseD]} />
        <meshStandardMaterial color="#0d0d12" metalness={0.5} roughness={0.55} />
      </mesh>
      {/* Gold trim strip along the front (user-facing) edge */}
      <mesh position={[0, baseY + 0.003, baseCenterZ + baseD / 2 - 0.005]}>
        <boxGeometry args={[baseW - 0.02, 0.022, 0.01]} />
        <meshBasicMaterial color={GOLD} transparent opacity={0.7} />
      </mesh>
      {/* Key grid */}
      {Array.from({ length: ROWS }).map((_, r) =>
        Array.from({ length: COLS }).map((_, c) => {
          const x = -gridW / 2 + KEY_W / 2 + c * (KEY_W + GAP);
          const z = baseCenterZ - gridD / 2 + KEY_D / 2 + r * (KEY_D + GAP);
          return (
            <mesh key={`k-${r}-${c}`} position={[x, keyTopY, z]}>
              <boxGeometry args={[KEY_W, KEY_H, KEY_D]} />
              <meshStandardMaterial
                color="#1a1a20"
                metalness={0.35}
                roughness={0.6}
              />
            </mesh>
          );
        }),
      )}
    </group>
  );
}

/** Compact desk mouse — flattened ovoid body with a thin gold scroll-
 *  wheel accent. Sits to the right of the keyboard at the same height
 *  as the keyboard base so it reads as part of the same setup. */
function Mouse() {
  return (
    <group position={[0.55, 0.795, -0.28]}>
      {/* Body — squashed sphere giving a low-profile mouse silhouette.
          scale [1, 0.5, 1.5] makes it longer (z) than wide (x) than tall (y),
          matching real desktop-mouse proportions. */}
      <mesh scale={[1, 0.5, 1.55]}>
        <sphereGeometry args={[0.045, 16, 12]} />
        <meshStandardMaterial color="#1a1a20" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Scroll-wheel slot — small gold strip on the top-front centerline */}
      <mesh position={[0, 0.025, -0.012]}>
        <boxGeometry args={[0.012, 0.005, 0.022]} />
        <meshBasicMaterial color={GOLD} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

/** Side-mounted 5-bar level meter on the chair-facing face of the speaker
 *  tower. Each bar lights up sequentially when music plays, giving the
 *  visual cadence of an audio VU meter; all five dim to 0.18 when paused. */
function TowerLevelMeter({ musicPlaying }: { musicPlaying: boolean }) {
  const matRefs = [
    useRef<THREE.MeshBasicMaterial>(null),
    useRef<THREE.MeshBasicMaterial>(null),
    useRef<THREE.MeshBasicMaterial>(null),
    useRef<THREE.MeshBasicMaterial>(null),
    useRef<THREE.MeshBasicMaterial>(null),
  ];

  // R3F frame loop mutates Three.js material opacity each tick — the
  // immutability lint rule isn't designed for animation idioms.
  // eslint-disable-next-line react-hooks/immutability
  useFrame((state) => {
    if (!musicPlaying) {
      for (const r of matRefs) {
        if (r.current) r.current.opacity = 0.18;
      }
      return;
    }
    // Each bar is driven by a slightly different sine — gives the staggered
    // "audio level" look without doing real FFT. Pseudo-rhythm is the sum
    // of two close frequencies so the apparent beat shifts naturally.
    const t = state.clock.elapsedTime;
    for (let i = 0; i < matRefs.length; i++) {
      const r = matRefs[i];
      if (!r.current) continue;
      const phase = i * 0.7;
      const base = Math.sin(t * 4.2 + phase) * 0.5 + 0.5;
      const sub = Math.sin(t * 6.8 + phase * 1.3) * 0.4 + 0.6;
      r.current.opacity = 0.25 + base * sub * 0.75;
    }
  });

  // Five horizontal bars stacked on the chair-facing face of the tower
  // (local x = 1.81, which is the speaker's −X side after the orchestrator's
  // π rotation). Vertical spacing ~0.10 centered at y=0.55.
  return (
    <group>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[1.81, 0.32 + i * 0.12, 0.5]}>
          <boxGeometry args={[0.025, 0.06, 0.04]} />
          <meshBasicMaterial
            ref={matRefs[i]}
            color="#10b981"
            transparent
            opacity={0.18}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Front-face drivers + emanating sound rings. The woofer (lower, large)
 *  thumps with a bass-frequency sine; the tweeter (upper, small) shimmers
 *  with a treble-frequency sine. Two concentric green ring waves expand
 *  outward from the woofer on alternating cycles, like sonar pings. All
 *  effects collapse to rest pose when music is off — the speaker stops
 *  visibly producing sound. */
function TowerDrivers({ musicPlaying }: { musicPlaying: boolean }) {
  const wooferCap = useRef<THREE.Mesh>(null);
  const tweeterDome = useRef<THREE.Mesh>(null);
  const waveA = useRef<THREE.Mesh>(null);
  const waveAMat = useRef<THREE.MeshBasicMaterial>(null);
  const waveB = useRef<THREE.Mesh>(null);
  const waveBMat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    if (!musicPlaying) {
      if (wooferCap.current) wooferCap.current.scale.set(1, 1, 1);
      if (tweeterDome.current) tweeterDome.current.scale.set(1, 1, 1);
      if (waveAMat.current) waveAMat.current.opacity = 0;
      if (waveBMat.current) waveBMat.current.opacity = 0;
      return;
    }
    const t = state.clock.elapsedTime;

    // Bass thump — two close sines summed give a pseudo-rhythm.
    const bass = (Math.sin(t * 5.0) + Math.sin(t * 7.3) * 0.6) * 0.5 + 0.5;
    if (wooferCap.current) {
      const s = 1 + bass * 0.22;
      wooferCap.current.scale.set(s, s, 1 + bass * 0.4);
    }

    // Treble shimmer — higher frequency, smaller excursion.
    const treble = Math.sin(t * 12.0) * 0.5 + 0.5;
    if (tweeterDome.current) {
      const s = 1 + treble * 0.10;
      tweeterDome.current.scale.set(s, s, 1);
    }

    // Sound rings — radius grows, opacity fades. Two rings half a cycle
    // out of phase so there's always one mid-flight.
    const cycle = 1.4;
    const a = (t / cycle) % 1;
    const b = ((t / cycle) + 0.5) % 1;
    if (waveA.current && waveAMat.current) {
      waveA.current.scale.setScalar(0.5 + a * 1.8);
      waveAMat.current.opacity = (1 - a) * 0.45;
    }
    if (waveB.current && waveBMat.current) {
      waveB.current.scale.setScalar(0.5 + b * 1.8);
      waveBMat.current.opacity = (1 - b) * 0.45;
    }
  });

  // Drivers face local +z (the orchestrator's local +z, which is the
  // viewer-facing direction in the focused-orchestrator camera pose). The
  // speaker enclosure spans z∈[0.15, 0.65] in local coords; we mount the
  // drivers a hair in front of z=0.65 so they sit on the grille face.
  const FRONT_Z = 0.654;

  return (
    <group>
      {/* Recessed grille panel — flat black, low metalness, makes the
          drivers and waves pop against a cleaner backdrop than the
          enclosure's slight reflectivity. */}
      <mesh position={[2.0, 0.55, 0.652]}>
        <boxGeometry args={[0.32, 1.0, 0.005]} />
        <meshStandardMaterial color="#080809" metalness={0.2} roughness={0.95} />
      </mesh>

      {/* WOOFER — outer ring, recessed cone, center cap that pulses. */}
      <mesh position={[2.0, 0.32, FRONT_Z]}>
        <torusGeometry args={[0.13, 0.012, 8, 28]} />
        <meshStandardMaterial color={METAL} metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[2.0, 0.32, FRONT_Z - 0.002]}>
        <circleGeometry args={[0.118, 28]} />
        <meshStandardMaterial color="#0a0a0a" metalness={0.3} roughness={0.9} />
      </mesh>
      <mesh ref={wooferCap} position={[2.0, 0.32, FRONT_Z + 0.004]}>
        <cylinderGeometry args={[0.05, 0.05, 0.018, 24]} />
        <meshStandardMaterial color={METAL} metalness={0.8} roughness={0.3} />
      </mesh>

      {/* TWEETER — small ring + soft-dome diaphragm. */}
      <mesh position={[2.0, 0.85, FRONT_Z]}>
        <torusGeometry args={[0.05, 0.008, 8, 20]} />
        <meshStandardMaterial color={METAL} metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh ref={tweeterDome} position={[2.0, 0.85, FRONT_Z + 0.001]}>
        <sphereGeometry args={[0.035, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#1a1a20" metalness={0.6} roughness={0.5} />
      </mesh>

      {/* Sonar-style ring waves emanating from the woofer. depthWrite
          off so they don't fight the cap or grille for z-order. */}
      <mesh ref={waveA} position={[2.0, 0.32, FRONT_Z + 0.006]}>
        <ringGeometry args={[0.14, 0.16, 32]} />
        <meshBasicMaterial
          ref={waveAMat}
          color="#10b981"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={waveB} position={[2.0, 0.32, FRONT_Z + 0.007]}>
        <ringGeometry args={[0.14, 0.16, 32]} />
        <meshBasicMaterial
          ref={waveBMat}
          color="#10b981"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/** Gold hologram bust — sits on the chair at the same (x,y,z) as the cushion.
 *  Wears small dark-metal spectacles to read as "the boss". The bust is
 *  rendered brighter than a specialist's so the gold reads as gold, not as
 *  a dim emerald-cousin under the spotlight.
 *
 *  Composition:
 *  - Outer group: static position + π/Y rotation so the bust's local +Z
 *    "face direction" maps to world +Z (south, toward monitors). The bust
 *    is now facing his screens — the over-the-shoulder view from the
 *    focused-orchestrator camera shows the back of the head, while the
 *    default office overview (SE) shows the face with glasses.
 *  - Inner group (headRef): idle-wiggle target. useFrame mutates this
 *    group's rotation; the outer group's static π is preserved.
 */
function OrchestratorBust({
  thinking = false,
  reducedMotion = false,
}: {
  thinking?: boolean;
  reducedMotion?: boolean;
}) {
  const headRef = useRef<THREE.Group>(null);
  // Lerped wiggle amplitudes — idle 0.06/0.08, thinking 0.18/0.22 with
  // doubled frequency. The transition takes ~150 ms which is below the
  // user's reaction threshold but eliminates the "snap to active pose"
  // jerk a hard switch would produce.
  const ampX = useRef(0.06);
  const ampY = useRef(0.08);
  const freqMult = useRef(1.0);

  useFrame((state, delta) => {
    if (!headRef.current) return;
    const t = state.clock.elapsedTime;
    const targetX = thinking ? 0.18 : 0.06;
    const targetY = thinking ? 0.22 : 0.08;
    const targetFreq = thinking ? 2.0 : 1.0;
    const k = Math.min(1, delta * 6);
    ampX.current += (targetX - ampX.current) * k;
    ampY.current += (targetY - ampY.current) * k;
    freqMult.current += (targetFreq - freqMult.current) * k;
    if (reducedMotion) {
      // Snap to amplitude target, no sinusoid.
      headRef.current.rotation.x = thinking ? targetX : 0;
      headRef.current.rotation.y = thinking ? targetY * 0.5 : 0;
      return;
    }
    const fm = freqMult.current;
    headRef.current.rotation.x = Math.sin(t * 0.6 * fm) * ampX.current;
    headRef.current.rotation.y = Math.sin(t * 0.35 * fm) * ampY.current;
  });

  return (
    <group position={[0, 0.55, 0.5]} rotation={[0, Math.PI, 0]}>
      <group ref={headRef}>
        <AgentHologram color={GOLD} scale={1.08} brightness={1.6} />

        {/* Glasses — small dark-metal spectacles ON the face surface.
            Head sphere center (in this inner frame): (0, 0.756, 0) with
            radii (0.151, 0.159, 0.144). The face surface at the eye line
            (y=0.78) curves sharply — at z≈0.135 the head's x-extent is
            only ~0.048. So the lenses are kept small (outer radius 0.025
            with ±0.030 spacing) and pushed to z=0.150 where they sit just
            forward of the face surface, like glasses worn at a natural
            standoff. Earlier placement at z=0.095 was *inside* the head
            and the lenses were invisible.

            TorusGeometry default is in XY plane with the hole through +Z —
            correct for "lens facing forward", no rotation needed. */}
        <mesh position={[-0.03, 0.78, 0.15]}>
          <torusGeometry args={[0.025, 0.005, 8, 32]} />
          <meshStandardMaterial color="#0e0e12" metalness={0.9} roughness={0.2} />
        </mesh>
        <mesh position={[0.03, 0.78, 0.15]}>
          <torusGeometry args={[0.025, 0.005, 8, 32]} />
          <meshStandardMaterial color="#0e0e12" metalness={0.9} roughness={0.2} />
        </mesh>
        {/* Bridge — spans the gap between the inner lens edges
            (gap = 2 × (0.03 − 0.025) = 0.010 wide). */}
        <mesh position={[0, 0.78, 0.15]}>
          <boxGeometry args={[0.01, 0.004, 0.004]} />
          <meshStandardMaterial color="#0e0e12" metalness={0.9} roughness={0.2} />
        </mesh>

        {/* Baseball cap — dome + brim + top button. Modeled after a
            classic fitted/trucker cap (see reference image): snug crown
            with a small fabric button on the apex, and a long curved
            bill projecting forward with a slight downward tilt.

            Dome:
             - Radius 0.14 (down from 0.16) for a snugger fit — barely
               wider than the head's x-radius (0.151) so the cap reads
               as worn-on rather than oversized.
             - Scale y=0.6 keeps the profile low — fitted cap, not
               beanie. Dome top lands at y≈0.924, just above the head
               crown at y≈0.914.
             - thetaLength = π/2 + 0.08 gives a TINY curl past the
               equator so the rim has the suggestion of a downward
               edge without eating the face. */}
        {/* Dome (and the button + brim below) was uniformly shifted along
            local +Z (face direction) from the original z=-0.02 so the cap
            sits forward on the head — exposing some of the back-skull
            curve and projecting the brim further past the face. After two
            iterations the shift settled at +0.02 (dome z=0.0): brim back
            at z≈0.02 still well inside dome's lower volume, dome back
            rim at z≈-0.14 essentially flush with the head back at
            z≈-0.144 (no overlap behind the skull). All three cap parts
            (dome, top button, brim) shifted by the same delta so the
            prior author's brim/dome/rim tangency analysis (encoded in
            the comments below) still holds. */}
        <mesh position={[0, 0.84, 0.0]} scale={[1.0, 0.6, 1.0]}>
          <sphereGeometry args={[0.14, 22, 16, 0, Math.PI * 2, 0, Math.PI / 2 + 0.18]} />
          {/* Two non-obvious bits encoded here:
              1) DoubleSide — the dome is a partial-sphere CHUNK so its
                 bottom is open. Without DoubleSide, looking up under
                 the back rim showed straight through to the background.
                 Painting both sides means viewers see a dark cap lining
                 instead.
              2) thetaLength = π/2 + 0.18 (~10° past the equator), bumped
                 from the earlier π/2 + 0.08. The head ellipsoid has
                 y-radius 0.158 (effective) vs the dome's y-radius 0.084,
                 so the head's profile extends DOWN further than the
                 dome chunk did. At thetaLength=π/2+0.08 the dome's
                 rim sat at y≈0.833 but the head's top-side at x=0.13
                 was at y≈0.837 — practically tangent — and at lower y
                 the head's sides poked out below the rim. Wrapping to
                 π/2+0.18 drops the rim to y≈0.825 (rim radius 0.1377
                 vs head x≈0.136 at that y), giving solid coverage all
                 the way around without reaching the glasses at y=0.78. */}
          <meshStandardMaterial
            color="#0e0e12"
            metalness={0.35}
            roughness={0.7}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Top fabric button — the small covered button found on the
            apex of every traditional 6-panel cap. Same dark fabric color
            as the dome so it reads as a part of the cap, not a separate
            accessory. */}
        <mesh position={[0, 0.925, 0.0]}>
          <sphereGeometry args={[0.013, 10, 8]} />
          <meshStandardMaterial color="#0e0e12" metalness={0.35} roughness={0.7} />
        </mesh>
        {/* Brim — half-cylinder (+Z half of a flat disc), back diameter
            buried inside the dome volume, forward portion projecting
            forward as the visible bill.

            This block was iterated multiple times. The two failure modes
            we kept oscillating between were:
              A) Brim back placed AT the dome's front-most rim (z≈0.12)
                 — the back-corners at x=±r floated 0.10 forward of the
                 dome's sides because the dome's rim is a CIRCLE and the
                 brim's back is a STRAIGHT LINE (one-point contact only).
              B) Brim back fully behind the dome center with small
                 radius and short z-scale — back was hidden but visible
                 bill projection was only 0.08, too short to read as a
                 cap.

            The geometry that satisfies BOTH constraints:
             - Sphere center z = -0.02. Brim back at z=0 sits 0.02
               forward of center, well INSIDE the dome's lower volume.
             - radius=0.115 keeps back-corner squared distance at 0.0137
               vs the dome ellipsoid limit 0.0196 — deep margin, no
               geometric borderline cases.
             - z-scale=1.9 places the forward edge at z=0.2185, which is
               ~0.075 past the face line (z≈0.144).
             - At the SIDES, the brim's curved edge exits the dome at
               x=±0.1095, z=0.0667 — within 0.003 of where the dome's
               own lower rim sits at the same x (z=0.0666). So the brim
               appears to emerge FROM the dome's natural rim curve.
             - height=0.020 gives a visible side-profile thickness, and
               rotation x=0.20 rad (~11.5°) is the natural downward bill
               tilt of a worn ball cap. */}
        <mesh position={[0, 0.836, 0.02]} rotation={[0.20, 0, 0]} scale={[1, 1, 1.9]}>
          <cylinderGeometry args={[0.115, 0.115, 0.020, 32, 1, false, -Math.PI / 2, Math.PI]} />
          <meshStandardMaterial color="#0e0e12" metalness={0.35} roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

function OrchestratorImpl({
  onSelect,
  musicPlaying = false,
  onToggleMusic,
  thinking = false,
  reducedMotion = false,
}: OrchestratorProps) {
  // Hover tracking is implicit (cursor only — no React state), so we mirror
  // the "is pointer currently over me" via a ref that pointerOver/Out flip.
  // The unmount-only cleanup reads it to decide whether to reset the
  // document cursor. Without this, focusing a desk while hovering the
  // orchestrator (or the speaker tower group) would leave the cursor stuck
  // on "pointer" forever because the unmount tears the meshes down before
  // their pointerOut events fire.
  const orchHoverRef = useRef(false);
  const speakerHoverRef = useRef(false);
  useEffect(() => {
    return () => {
      if (orchHoverRef.current || speakerHoverRef.current) {
        document.body.style.cursor = "";
      }
    };
  }, []);
  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    orchHoverRef.current = true;
    document.body.style.cursor = "pointer";
  };
  const handleOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    orchHoverRef.current = false;
    document.body.style.cursor = "";
  };
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect?.();
  };

  return (
    <group
      position={ORCHESTRATOR_POSITION}
      rotation={[0, Math.PI, 0]}
      onPointerOver={handleOver}
      onPointerOut={handleOut}
      onClick={handleClick}
    >
      {/* ============================================================
          WORKSTATION DESKS — U-shape, surface extends BACK (z negative)
          so the monitors at z=-0.86 sit on the desk rather than floating.
          ============================================================ */}

      {/* Center desk */}
      <mesh position={[0, 0.74, -0.5]}>
        <boxGeometry args={[2.4, 0.08, 1.0]} />
        <meshStandardMaterial color={DESK} roughness={0.4} metalness={0.45} />
      </mesh>
      <mesh position={[0, 0.785, -0.5]}>
        <boxGeometry args={[2.42, 0.015, 1.02]} />
        <meshBasicMaterial color={GOLD} transparent opacity={0.75} />
      </mesh>

      {/* Left wing */}
      <group position={[-1.65, 0.74, -0.25]} rotation={[0, Math.PI / 7, 0]}>
        <mesh>
          <boxGeometry args={[1.3, 0.08, 0.8]} />
          <meshStandardMaterial color={DESK} roughness={0.4} metalness={0.45} />
        </mesh>
        <mesh position={[0, 0.045, 0]}>
          <boxGeometry args={[1.32, 0.015, 0.82]} />
          <meshBasicMaterial color={GOLD} transparent opacity={0.75} />
        </mesh>
      </group>

      {/* Right wing */}
      <group position={[1.65, 0.74, -0.25]} rotation={[0, -Math.PI / 7, 0]}>
        <mesh>
          <boxGeometry args={[1.3, 0.08, 0.8]} />
          <meshStandardMaterial color={DESK} roughness={0.4} metalness={0.45} />
        </mesh>
        <mesh position={[0, 0.045, 0]}>
          <boxGeometry args={[1.32, 0.015, 0.82]} />
          <meshBasicMaterial color={GOLD} transparent opacity={0.75} />
        </mesh>
      </group>

      {/* Front desk legs (only on the chair side — wings are cantilevered) */}
      <mesh position={[-1.0, 0.37, -0.5]}>
        <boxGeometry args={[0.14, 0.74, 0.14]} />
        <meshStandardMaterial color={METAL} roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[1.0, 0.37, -0.5]}>
        <boxGeometry args={[0.14, 0.74, 0.14]} />
        <meshStandardMaterial color={METAL} roughness={0.4} metalness={0.6} />
      </mesh>

      {/* ============================================================
          MONITORS — center DASHBOARD, left CHART, right TERMINAL
          ============================================================ */}

      {/* The orchestrator's three screens are ALWAYS animating per spec §6
          ("never idle"). They reflect the state of the whole office (fleet
          dashboard / chart / queue terminal), so `active` here is hardcoded
          true — independent of whether the orchestrator-as-a-specialist
          itself has a running job. */}

      {/* Center — DASHBOARD */}
      <mesh position={[0, 1.45, -0.86]} rotation={[-0.08, 0, 0]}>
        <boxGeometry args={[1.75, 1.05, 0.07]} />
        <meshStandardMaterial attach="material-0" color={CHARCOAL} />
        <meshStandardMaterial attach="material-1" color={CHARCOAL} />
        <meshStandardMaterial attach="material-2" color={CHARCOAL} />
        <meshStandardMaterial attach="material-3" color={CHARCOAL} />
        <Screen
          agentId="orchestrator"
          typeOverride="dashboard"
          active
          seed={0}
          attach="material-4"
        />
        <meshStandardMaterial attach="material-5" color={CHARCOAL} />
      </mesh>

      {/* Left — CHART (fleet performance) */}
      <mesh position={[-1.78, 1.31, -0.55]} rotation={[-0.08, Math.PI / 7, 0]}>
        <boxGeometry args={[1.15, 0.78, 0.07]} />
        <meshStandardMaterial attach="material-0" color={CHARCOAL} />
        <meshStandardMaterial attach="material-1" color={CHARCOAL} />
        <meshStandardMaterial attach="material-2" color={CHARCOAL} />
        <meshStandardMaterial attach="material-3" color={CHARCOAL} />
        <Screen
          agentId="orchestrator"
          typeOverride="chart"
          active
          seed={1}
          attach="material-4"
        />
        <meshStandardMaterial attach="material-5" color={CHARCOAL} />
      </mesh>

      {/* Right — TERMINAL (orchestration queue) */}
      <mesh position={[1.78, 1.31, -0.55]} rotation={[-0.08, -Math.PI / 7, 0]}>
        <boxGeometry args={[1.15, 0.78, 0.07]} />
        <meshStandardMaterial attach="material-0" color={CHARCOAL} />
        <meshStandardMaterial attach="material-1" color={CHARCOAL} />
        <meshStandardMaterial attach="material-2" color={CHARCOAL} />
        <meshStandardMaterial attach="material-3" color={CHARCOAL} />
        <Screen
          agentId="orchestrator"
          typeOverride="terminal"
          active
          seed={2}
          attach="material-4"
        />
        <meshStandardMaterial attach="material-5" color={CHARCOAL} />
      </mesh>

      {/* Monitor spill light (warm mint) — also always on, matching the
          always-animating screens. */}
      <pointLight
        color={SCREEN_ACCENT}
        intensity={2.0}
        distance={6}
        decay={1.5}
        position={[0, 1.45, 0]}
      />

      {/* Keyboard — dark base with a grid of low-profile keys. 4 rows × 13
          columns of mechanical-style key bumps. The base is a thin slab
          with subtle gold trim along the front edge so it matches the
          rest of the workstation's gold accents. Mouse sits to the right
          (positive x), centered roughly where a hand would rest beside
          the keyboard. */}
      <Keyboard />
      <Mouse />

      {/* Floating gold octahedron above the center monitor */}
      <FloatingOcta thinking={thinking} reducedMotion={reducedMotion} />
      {thinking && <OrchestratorThinkingBubble />}

      {/* ============================================================
          EXECUTIVE CHAIR — at +z (in front of the workstation, facing south)
          ============================================================ */}

      {/* Seat cushion */}
      <mesh position={[0, 0.55, 0.5]}>
        <cylinderGeometry args={[0.42, 0.42, 0.14, 32]} />
        <meshStandardMaterial color={LEATHER} roughness={0.35} metalness={0.15} />
      </mesh>
      {/* Gold cushion-edge torus */}
      <mesh position={[0, 0.625, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.012, 8, 40]} />
        <meshBasicMaterial color={GOLD} transparent opacity={0.75} />
      </mesh>

      {/* Chair back */}
      <mesh position={[0, 1.0, 0.81]}>
        <boxGeometry args={[0.85, 0.75, 0.1]} />
        <meshStandardMaterial color={LEATHER} roughness={0.35} metalness={0.15} />
      </mesh>
      {/* Gold top-edge trim on chair back */}
      <mesh position={[0, 1.375, 0.81]}>
        <boxGeometry args={[0.86, 0.012, 0.11]} />
        <meshBasicMaterial color={GOLD} transparent opacity={0.75} />
      </mesh>
      {/* Lumbar pillow */}
      <mesh position={[0, 0.78, 0.755]}>
        <boxGeometry args={[0.6, 0.18, 0.04]} />
        <meshStandardMaterial color={LEATHER_DARK} roughness={0.5} />
      </mesh>
      {/* Headrest */}
      <mesh position={[0, 1.46, 0.79]}>
        <boxGeometry args={[0.55, 0.18, 0.13]} />
        <meshStandardMaterial color={LEATHER} roughness={0.35} metalness={0.15} />
      </mesh>

      {/* Armrests — pads + metal supports */}
      <mesh position={[-0.46, 0.78, 0.55]}>
        <boxGeometry args={[0.11, 0.05, 0.42]} />
        <meshStandardMaterial color={LEATHER} roughness={0.35} metalness={0.15} />
      </mesh>
      <mesh position={[-0.46, 0.63, 0.55]}>
        <boxGeometry args={[0.06, 0.26, 0.06]} />
        <meshStandardMaterial color={METAL} roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0.46, 0.78, 0.55]}>
        <boxGeometry args={[0.11, 0.05, 0.42]} />
        <meshStandardMaterial color={LEATHER} roughness={0.35} metalness={0.15} />
      </mesh>
      <mesh position={[0.46, 0.63, 0.55]}>
        <boxGeometry args={[0.06, 0.26, 0.06]} />
        <meshStandardMaterial color={METAL} roughness={0.4} metalness={0.6} />
      </mesh>

      {/* Center post + base hub */}
      <mesh position={[0, 0.27, 0.5]}>
        <cylinderGeometry args={[0.07, 0.07, 0.42, 16]} />
        <meshStandardMaterial color={POST_METAL} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.06, 0.5]}>
        <cylinderGeometry args={[0.12, 0.12, 0.08, 16]} />
        <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.4} />
      </mesh>

      {/* 5-spoke chair base — radial around (0, _, 0.5) */}
      {Array.from({ length: 5 }).map((_, i) => {
        const angle = (i / 5) * Math.PI * 2;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        return (
          <group key={i}>
            <mesh
              position={[cosA * 0.22, 0.07, 0.5 + sinA * 0.22]}
              rotation={[0, -angle, 0]}
            >
              <boxGeometry args={[0.36, 0.05, 0.07]} />
              <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.4} />
            </mesh>
            <mesh position={[cosA * 0.42, 0.06, 0.5 + sinA * 0.42]}>
              <sphereGeometry args={[0.06, 10, 10]} />
              <meshStandardMaterial color={WHEEL} roughness={0.5} />
            </mesh>
          </group>
        );
      })}

      {/* ============================================================
          SIDE SPEAKER — proper hi-fi tower with two drivers (woofer +
          tweeter) and a 5-bar level meter on the chair-facing side.
          Click anywhere on it to toggle ambient music.

          When music plays:
           - Woofer center cap pulses with a bass-frequency sine
           - Tweeter dome shimmers with a higher-frequency treble sine
           - Two green ring waves expand outward from the woofer
             (alternating phases — there's always one mid-flight)
           - The 5 side bars staggered-light like a VU meter

          When music is off, every reactive element collapses to a flat
          rest pose so the speaker visibly stops producing sound.
          ============================================================ */}
      <group
        onClick={(e) => {
          e.stopPropagation();
          onToggleMusic?.();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          speakerHoverRef.current = true;
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          speakerHoverRef.current = false;
          document.body.style.cursor = "";
        }}
      >
        {/* Enclosure body — matte dark, slightly metallic */}
        <mesh position={[2.0, 0.55, 0.4]}>
          <boxGeometry args={[0.38, 1.05, 0.5]} />
          <meshStandardMaterial color={TOWER_BODY} metalness={0.55} roughness={0.6} />
        </mesh>
        <TowerDrivers musicPlaying={musicPlaying} />
        <TowerLevelMeter musicPlaying={musicPlaying} />
      </group>

      {/* Gold holographic bust — sits in the chair (same x,y,z as cushion) */}
      <OrchestratorBust thinking={thinking} reducedMotion={reducedMotion} />
    </group>
  );
}

/**
 * Memoize the Orchestrator. Its body contains 4 useFrame loops + 50+ meshes
 * (keyboard grid, mouse, speaker drivers, level meter, chair, monitors, etc.)
 * that all re-reconcile on every parent re-render. The orchestrator's
 * visible behavior is fully determined by these 4 props — `onSelect` and
 * `onToggleMusic` are call-time-only (don't affect rendering), and we
 * compare the remaining three by value. Without this memo, every click
 * anywhere in the office forced ~60 orchestrator meshes through React's
 * reconciliation phase even though nothing about the boss had changed.
 */
export const Orchestrator = memo(OrchestratorImpl, (prev, next) => {
  return (
    prev.musicPlaying === next.musicPlaying &&
    prev.thinking === next.thinking &&
    prev.reducedMotion === next.reducedMotion
  );
});
