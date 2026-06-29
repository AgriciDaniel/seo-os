"use client";

/**
 * BrainChandelier — the sky-brain hanging above the orchestrator.
 *
 * Renders the same `<Brain>` component used by the Brain tab, fed by the same
 * `/api/brain/graph?slug=…` endpoint, just positioned in the office sky and
 * non-interactive. The lamp (halo + cone + spotlight + ambient pink point
 * light) is rendered as a SIBLING in world coordinates so the rotation of the
 * brain doesn't drag the spotlight around.
 *
 * Spec: docs spec §4 ("Brain chandelier" + "Lamp") + §8 (data parity with the
 * Brain tab) + §9 (slow y-rotation).
 */

import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { memo, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { AdditiveBlending } from "three";
import { Brain, type BrainEdge, type BrainNode } from "@/components/BrainScene";
import {
  BRAIN_POSITION,
  BRAIN_SCALE,
  ORCHESTRATOR_POSITION,
  SCENE_COLORS,
  deskPositions,
  toSceneId,
} from "./positions";
import { useSpecialistsStore } from "@/store/specialists";
import { useTheme, THEMES } from "@/components/office/themes";
import { BrainParticle } from "./BrainParticle";

interface BrainChandelierProps {
  clientSlug: string;
  /** When provided, the brain group becomes clickable (camera focuses on it).
   *  Ignored while `focused` is true so a stray click doesn't re-trigger. */
  onClick?: () => void;
  /** When true, the brain stops rotating and its nodes become interactive
   *  (hover halos, labels, click → onSelectNode). Driven by the parent's
   *  camera-focus state. */
  focused?: boolean;
  /** Click handler for individual brain nodes. Only fires while `focused`. */
  onSelectNode?: (node: BrainNode) => void;
  /** When true (prefers-reduced-motion), the brain stops auto-rotating
   *  and the halo stops pulsing. */
  reducedMotion?: boolean;
  /** Any agent activity in flight — orchestrator thinking OR at least one
   *  specialist running. Brightens halo, cone, spotlight, and brain
   *  pointLight so the room visibly reacts to work. */
  pulsing?: boolean;
}

interface GraphData {
  nodes: BrainNode[];
  edges: BrainEdge[];
}

/** Halo (the warm "bulb") — just below the brain on the lamp axis. */
const HALO_POSITION: [number, number, number] = [
  BRAIN_POSITION[0],
  BRAIN_POSITION[1] - 2.6,
  BRAIN_POSITION[2],
];
/** Cone centroid. The cone is 10.6 tall; we want its bottom at y≈1 (just
 *  above the dais top at y=0.6) and its top at y≈11.6 (clear of the brain).
 *  Centroid = bottom + height/2 = 1.0 + 5.3 = 6.3. */
const CONE_POSITION: [number, number, number] = [
  BRAIN_POSITION[0],
  6.3,
  BRAIN_POSITION[2],
];
/** Spotlight origin — just below the brain. */
const SPOTLIGHT_POSITION: [number, number, number] = [
  BRAIN_POSITION[0],
  BRAIN_POSITION[1] - 3,
  BRAIN_POSITION[2],
];

/** Halo — a soft additive sphere with a gentle scale pulse. Amplitude
 *  and base opacity bump when `pulsing` (any agent activity in flight). */
function LampHalo({
  reducedMotion = false,
  pulsing = false,
}: {
  reducedMotion?: boolean;
  pulsing?: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const ampRef = useRef(0.1);
  const opacityRef = useRef(0.15);
  useFrame((state, delta) => {
    if (!ref.current) return;
    const targetAmp = pulsing ? 0.2 : 0.1;
    const targetOpacity = pulsing ? 0.3 : 0.15;
    const k = Math.min(1, delta * 6);
    ampRef.current += (targetAmp - ampRef.current) * k;
    opacityRef.current += (targetOpacity - opacityRef.current) * k;
    if (matRef.current) matRef.current.opacity = opacityRef.current;
    if (reducedMotion) {
      // Snap to the active scale; no sinusoid.
      ref.current.scale.setScalar(1 + ampRef.current);
      return;
    }
    const t = state.clock.elapsedTime;
    const freq = pulsing ? 2.0 : 1.4;
    const s = 1.0 + Math.sin(t * freq) * ampRef.current;
    ref.current.scale.setScalar(s);
  });
  return (
    <mesh ref={ref} position={HALO_POSITION}>
      <sphereGeometry args={[0.9, 24, 24]} />
      <meshBasicMaterial
        ref={matRef}
        color={SCENE_COLORS.lampWarm}
        transparent
        opacity={0.15}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Cone + spotlight + brain pointLight — all lerp their intensity toward
 *  the active set when `pulsing`. Single ref-driven `useFrame` keeps the
 *  whole bundle on one animation tick and off the React reconciliation
 *  path. */
function PulsingLights({
  pulsing = false,
}: {
  pulsing?: boolean;
}) {
  const coneMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const spotRef = useRef<THREE.SpotLight>(null);
  const brainPtRef = useRef<THREE.PointLight>(null);
  const coneOpacity = useRef(0.08);
  const spotIntensity = useRef(5.5);
  const brainIntensity = useRef(1.0);
  useFrame((_, delta) => {
    // Target intensities tuned for ambience over drama. The previous active
    // targets (cone 0.18, spot 7.5, brain 2.2) had ~30-50% amplitude over
    // idle, and `recentToolActivity` flips the flag false 1.5s after each
    // tool tick — so multi-step agentic work caused the dais spotlight to
    // visibly oscillate between two bright states ("tweaking"). New targets
    // are a ~15% boost — the room still visibly reacts to work without
    // strobing the orchestrator's lighting. Paired with the longer activity
    // tail in OfficeScene (4s) and a slower lerp below, brief gaps between
    // tool ticks no longer trip the round-trip animation.
    const targetCone = pulsing ? 0.13 : 0.08;
    const targetSpot = pulsing ? 6.3 : 5.5;
    const targetBrain = pulsing ? 1.6 : 1.0;
    // k = delta * 3 → ~300ms to reach steady state. Slower than the old
    // delta*6 (~150ms) so the lerp smooths over the activity-flag's brief
    // flutters; faster than delta*1.5 (~600ms) which would feel sluggish.
    const k = Math.min(1, delta * 3);
    coneOpacity.current += (targetCone - coneOpacity.current) * k;
    spotIntensity.current += (targetSpot - spotIntensity.current) * k;
    brainIntensity.current += (targetBrain - brainIntensity.current) * k;
    if (coneMatRef.current) coneMatRef.current.opacity = coneOpacity.current;
    if (spotRef.current) spotRef.current.intensity = spotIntensity.current;
    if (brainPtRef.current) brainPtRef.current.intensity = brainIntensity.current;
  });

  return (
    <>
      {/* Visible cone — open-ended cylinder, additive, double-sided. */}
      <mesh position={CONE_POSITION}>
        <cylinderGeometry args={[0.18, 3.6, 10.6, 40, 1, true]} />
        <meshBasicMaterial
          ref={coneMatRef}
          color={SCENE_COLORS.lampWarm}
          transparent
          opacity={0.08}
          blending={AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Actual spotlight — lands on the dais top. */}
      <spotLight
        ref={spotRef}
        color={SCENE_COLORS.spotlightWarm}
        intensity={5.5}
        distance={16}
        angle={Math.PI / 4}
        penumbra={0.4}
        decay={1.1}
        position={SPOTLIGHT_POSITION}
        target-position={ORCHESTRATOR_POSITION}
      />

      {/* Ambient warm point light at the brain itself. Pulses with the
          rest of the lamp so the brain reads as the source of activity. */}
      <pointLight
        ref={brainPtRef}
        color="#d97a8a"
        intensity={1.0}
        distance={50}
        decay={1.4}
        position={BRAIN_POSITION}
      />
    </>
  );
}

function BrainChandelierImpl({
  clientSlug,
  onClick,
  focused = false,
  onSelectNode,
  reducedMotion = false,
  pulsing = false,
}: BrainChandelierProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [data, setData] = useState<GraphData>({ nodes: [], edges: [] });
  // Surface fetch failures to the user via the existing focused-brain
  // affordance. Previously `.catch(() => undefined)` swallowed every error
  // silently: if `/api/brain/graph` returned 500 (vault corrupt, DB locked,
  // permission flap), the brain rendered empty forever with no retry path
  // and no signal to the user. Now we capture the failure and let the
  // <BrainCenter> render an HTML overlay with a Retry button when focused.
  // `loadNonce` is the retry counter — bumping it re-runs the effect by
  // changing its dep, which kicks a fresh fetch.
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);

  // ── Particle emission (Task 4.1+4.2) ──────────────────────────────────────
  interface ParticleSpec {
    id: string;
    from: [number, number, number];
    color: string;
    bornAt: number;
  }

  const [particles, setParticles] = useState<ParticleSpec[]>([]);
  const seenAtRef = useRef<number>(0);
  const { theme } = useTheme();
  const accentHex = parseAccentColor(THEMES[theme].chrome.accent);

  useEffect(() => {
    const unsub = useSpecialistsStore.subscribe((state) => {
      const ka = state.lastKnowledgeAdded;
      if (!ka || ka.at <= seenAtRef.current) return;
      seenAtRef.current = ka.at;
      const sceneId = toSceneId(ka.specialistId);
      if (!sceneId) return;
      const desk = deskPositions().find((d) => d.id === sceneId);
      if (!desk) return;
      setParticles((arr) => [
        ...arr,
        {
          id: `${ka.specialistId}-${ka.at}`,
          from: desk.position,
          color: accentHex,
          bornAt: performance.now(),
        },
      ]);
    });
    return unsub;
  }, [accentHex]);

  useEffect(() => {
    const interval = setInterval(() => {
      setParticles((arr) => arr.filter((p) => performance.now() - p.bornAt < 1000));
    }, 200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void fetch(`/api/brain/graph?slug=${encodeURIComponent(clientSlug)}`, {
      signal: ac.signal,
    })
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => {
        if (ac.signal.aborted) return;
        if (d.ok) {
          setData({ nodes: d.nodes, edges: d.edges });
          setFetchError(null);
        } else {
          setFetchError(typeof d.error === "string" ? d.error : "brain fetch failed");
        }
      })
      .catch((err: unknown) => {
        // AbortError on switch is normal — silent. Anything else is a
        // real failure the user deserves to know about.
        if ((err as { name?: string })?.name === "AbortError") return;
        if (ac.signal.aborted) return;
        setFetchError(err instanceof Error ? err.message : String(err));
      });
    return () => ac.abort();
  }, [clientSlug, loadNonce]);
  // Stable retry handler — exposed below via the BrainCenter's onRetry. A
  // ref isn't needed since this is a top-level component function (stable
  // across renders by closure identity since it only captures `setLoadNonce`).
  function retryBrainFetch() {
    setFetchError(null);
    setLoadNonce((n) => n + 1);
  }

  // ── Receive-pulse (Task 4.3) ───────────────────────────────────────────────
  // Each particle arrives at the brain ~800ms after it was born.
  // Schedule a brief scale bump for that moment.
  const [pulse, setPulse] = useState(0);
  const pulseValueRef = useRef(0);

  useEffect(() => {
    if (particles.length === 0) return;
    const lastBorn = particles[particles.length - 1].bornAt;
    const arriveIn = Math.max(0, 800 - (performance.now() - lastBorn));
    // Browser setTimeout returns a number, not an object — attaching `_stop`
    // to it throws in React 19 strict mode and forces a Fast Refresh full
    // reload, which clears every chat panel's local turns/state. Use a
    // local closure variable to track the nested timeout instead.
    let stopT: ReturnType<typeof setTimeout> | null = null;
    const startT = setTimeout(() => {
      setPulse(1);
      stopT = setTimeout(() => setPulse(0), 300);
    }, arriveIn);
    return () => {
      clearTimeout(startT);
      if (stopT !== null) clearTimeout(stopT);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [particles.length]);

  // Slow y-rotation on the rotating brain group only — NOT on the lamp.
  // Frozen when prefers-reduced-motion is on, AND while focused (so nodes
  // don't drift out from under the user's cursor).
  // Pulse blended multiplicatively: applies a 6% scale bump on particle
  // absorption, smoothly lerped so it doesn't conflict with rotation.
  useFrame((_, dt) => {
    if (!groupRef.current) return;
    // Lerp the pulse value toward target.
    pulseValueRef.current += (pulse - pulseValueRef.current) * Math.min(1, dt * 8);
    // Apply the pulse scale on top of BRAIN_SCALE.
    const s = BRAIN_SCALE * (1 + pulseValueRef.current * 0.06);
    groupRef.current.scale.setScalar(s);
    // Continue rotation unless frozen.
    if (!reducedMotion && !focused) {
      groupRef.current.rotation.y += 0.0015;
    }
  });

  const brainGroup = (
    <group
      ref={groupRef}
      position={BRAIN_POSITION}
      rotation={[0.15, 0.4, 0]}
    >
      <Brain
        nodes={data.nodes}
        edges={data.edges}
        interactive={focused}
        onSelectNode={focused ? onSelectNode : undefined}
        globe
        globeColor={pulsing ? "#ffc000" : "#5fdfff"}
        reducedMotion={reducedMotion}
        // brain group is at scale=3 and the focused camera sits ~5 world units
        // from the brain center; bump the label factor proportionally so the
        // text reads at the same size as the old right-pane Brain tab.
        labelDistanceFactor={10}
      />
    </group>
  );

  // While focused, the per-node InteractiveNode handlers own the events —
  // don't bubble an outer click or it'd swallow node clicks AND re-trigger
  // focus mode every time the user clicked the brain. We KEEP the outer
  // <group> mounted regardless of focus state and just toggle its onClick
  // prop. Previous code swapped between `<group onClick>{brain}</group>`
  // and `brain` directly, which forced R3F to dispose + remount every
  // brain mesh on each focus transition — sometimes leaving the brain
  // permanently invisible after navigating to a specialist and back.
  const wrappedBrain = (
    <group onClick={!focused && onClick ? onClick : undefined}>
      {brainGroup}
    </group>
  );

  return (
    <>
      {wrappedBrain}

      {/* Brain-fetch error overlay. Renders only when focused AND the
          /api/brain/graph fetch failed. Anchored just below the brain
          center so it sits in the user's eye line when the camera has
          flown in. Click → retry. Previously this whole failure mode was
          silent: a 500 from the brain endpoint left the cloud empty
          forever with no signal to the user. Now they see a clear cue
          and can recover without a page reload. */}
      {focused && fetchError && (
        <Html
          position={[BRAIN_POSITION[0], BRAIN_POSITION[1] - 3, BRAIN_POSITION[2]]}
          center
          distanceFactor={6}
          zIndexRange={[40, 0]}
          style={{ pointerEvents: "auto" }}
        >
          <div className="flex items-center gap-2 border border-red-500/50 bg-abyss/95 px-3 py-2 text-[11px] text-red-200 backdrop-blur">
            <span aria-hidden>⚠</span>
            <span>brain unavailable: {fetchError}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                retryBrainFetch();
              }}
              className="ml-1 border border-red-400/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-red-100 transition-colors hover:bg-red-500/20"
            >
              retry
            </button>
          </div>
        </Html>
      )}

      {/* --- Lamp: sibling of the brain group, in WORLD coordinates. ----- */}

      {/* Halo bulb under the brain. */}
      <LampHalo reducedMotion={reducedMotion} pulsing={pulsing} />

      {/* Pulsing bundle: cone + spotlight + brain point light. All
          intensities lerp toward the active set when `pulsing`. */}
      <PulsingLights pulsing={pulsing} />

      {/* Warm fill light at the dais — short-range, fills the shadow side of
          the workstation (chair back, side tower) that the directional spot
          doesn't reach. Without this, the chair reads black against the
          platform. Independent of `pulsing` — it's purely ambient. */}
      <pointLight
        color={SCENE_COLORS.lampWarm}
        intensity={1.2}
        distance={5}
        decay={1.6}
        position={[ORCHESTRATOR_POSITION[0], ORCHESTRATOR_POSITION[1] + 1.6, ORCHESTRATOR_POSITION[2]]}
      />

      {/* Particle group — world-space siblings, NOT inside the brain's
          transform. Particles travel from desk → BRAIN_POSITION in world
          coords and must not be offset by any ancestor transform. */}
      <group>
        {particles.map((p) => (
          <BrainParticle
            key={p.id}
            from={p.from}
            color={p.color}
            bornAt={p.bornAt}
            brainCenter={BRAIN_POSITION}
          />
        ))}
      </group>
    </>
  );
}

/** Extract the first hex color from a CSS color string.
 *  Falls back to white if no hex is found. */
function parseAccentColor(css: string): string {
  const hex = css.match(/#[0-9a-fA-F]{3,8}/);
  return hex ? hex[0] : "#ffffff";
}

/**
 * Memoize BrainChandelier. Includes the full Brain mesh (potentially many
 * nodes + edges), the lamp cone, spotlight, halo, plus 4 useFrame loops.
 * Callbacks (onClick, onSelectNode) are call-time-only; we compare the
 * value props to decide whether to re-render. clientSlug change triggers
 * the data refetch via the effect deps; included here so the memo
 * recognises a fresh fetch is needed when the client switches.
 */
export const BrainChandelier = memo(BrainChandelierImpl, (prev, next) => {
  return (
    prev.clientSlug === next.clientSlug &&
    prev.focused === next.focused &&
    prev.reducedMotion === next.reducedMotion &&
    prev.pulsing === next.pulsing
  );
});
