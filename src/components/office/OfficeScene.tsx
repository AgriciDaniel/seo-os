"use client";

/**
 * SEO Office — 3D Cosmos Command Theater.
 *
 * Composition:
 *  - Platform + dais
 *  - Orchestrator throne (always-on gold hologram, clickable)
 *  - 26 specialist desks in 3 concentric rings (busts only when active or
 *    hovered; clickable for per-desk camera focus)
 *  - Brain chandelier hanging over the orchestrator (clickable)
 *  - 27 light threads + ambient pulses + completion bursts
 *  - Two-layer starfield
 *
 * Per-desk state is the union of two independent signals:
 *   - active: derived from `useActiveAgents(slug)` → SSE job stream. Drives
 *     the full job-activity theater (floor ring + emissive tabletop pulse +
 *     last-log billboard) and resolves the desk's per-job EventSource.
 *   - chatting: derived from `chatTarget` (registered id → scene id). Drives
 *     monitor presence (screen on, hologram visible, spill light, bright
 *     label) but NOT the job-activity theater — chat is "online and
 *     listening", not "executing right now".
 * The scene degrades to "all desks idle" if the active stream is unavailable.
 *
 * Focus model: a single `focused: string | null` value drives the camera rig.
 * Possible values: "brain", "orchestrator", a specialist scene id, or null
 * for the default office overview. CameraRig flies to the pose matched to
 * that value; OrbitControls handles fine control after arrival.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/** Ref type for drei's `<OrbitControls>` — derived from the component itself
 *  so we don't need to import `three-stdlib` directly (not in dependencies). */
type OrbitControlsHandle = React.ComponentRef<typeof OrbitControls>;

import {
  useActiveAgents,
  useActiveJobIds,
  useOrchestratorThinking,
} from "@/hooks/useActiveAgents";
import { useJobPulses } from "@/hooks/useJobPulses";
import { useAgenticEvents } from "@/hooks/useAgenticEvents";
import type { BrainNode } from "@/components/BrainScene";

import { Platform } from "./Platform";
import { Specialist } from "./Specialist";
import { Orchestrator } from "./Orchestrator";
import { BrainChandelier } from "./BrainChandelier";
import { BrainThreads } from "./BrainThreads";
import { ThreadPulses } from "./ThreadPulses";
import { ThemeBackground, useTheme } from "./themes";
import {
  deskPositions,
  registeredIdsForScene,
  toSceneId,
  toRegisteredId,
  BRAIN_POSITION,
  type SpecialistId,
} from "./positions";

/** A scene-side focus id. Sentinel strings + scene specialist ids; null is
 *  the default office overview. */
export type FocusId = "brain" | "orchestrator" | SpecialistId | null;

interface Props {
  clientSlug: string;
  /** Which entity is focused, if any. CameraRig flies to the matching pose. */
  focused?: FocusId;
  /** Click on the in-office brain (only fires when not already focused on
   *  the brain — each interactive brain node owns its own click handler). */
  onSelectBrain?: () => void;
  /** Click on a brain node while focused on the brain. */
  onSelectBrainNode?: (node: BrainNode) => void;
  /** Click on empty space (no 3D object hit) while focused — exits focus. */
  onUnfocus?: () => void;
  /** Registered specialist id the user is currently chatting with. The
   *  right-pane inbox uses this; running visuals stay tied to actual jobs
   *  so a selected specialist does not look like it is still executing. */
  chatTarget?: string;
  /** Per-specialist "last reply" timestamps (registered id → epoch ms). The
   *  parent updates this whenever a specialist's chat stream completes so
   *  the desk stays *present* (monitor + hologram visible) for the long
   *  post-activity window instead of disappearing at stream end. Parallel
   *  to `useJobPulses` — both signals feed the same `recentlyActive` gate
   *  inside Specialist; the larger of the two wins per desk. */
  replyTimestamps?: ReadonlyMap<string, number>;
  /** Registered ids the user has explicitly dismissed via the per-desk ×
   *  button. We mask both `completedAt` and `lastReplyAt` for these desks
   *  so they go dormant immediately. SOFT — server-side activity events
   *  (job pulses, chat replies) win; the parent re-arms by removing the
   *  id from this set whenever fresh activity arrives for that specialist. */
  dismissedSpecialists?: ReadonlySet<string>;
  /** Fired when the user clicks an afterglow desk's × button. Receives the
   *  registered id (not the scene id) so the parent can add it to the
   *  dismissed set with a straight lookup. */
  onDismissSpecialist?: (registeredId: string) => void;
  /** Fired when OfficeScene sees a *fresh* job pulse arrive for a specialist
   *  the user previously dismissed. Lets the parent re-arm by removing the
   *  id from the dismissed set, so a brand-new job completion will visibly
   *  light up the desk again even after a manual dismissal. Mirrors the
   *  chat-reply re-arm already handled inside `markSpecialistReplied`. */
  onClearDismiss?: (registeredId: string) => void;
  /** Click on a specialist desk (scene id, e.g. "strategy"). */
  onSelectDesk?: (sceneId: SpecialistId) => void;
  /** Click on the orchestrator dais. */
  onSelectOrchestrator?: () => void;
  /** Whether ambient music is currently playing. Drives the speaker-tower
   *  pulse so the orchestrator's speaker visibly reflects the audio state. */
  musicPlaying?: boolean;
  /** Click on the orchestrator's speaker tower → toggles ambient music. */
  onToggleMusic?: () => void;
  /** Canvas created a WebGL context and the workspace can hide the fallback. */
  onSceneReady?: () => void;
  /** WebGL context is unavailable or lost; parent swaps in the safe fallback. */
  onWebGLUnavailable?: () => void;
  /** Phase 3: fired when a specialist desk is clicked with the desk's registered
   *  id and the bounding DOMRect of the clicked element (for window-origin
   *  animation). Wired to windowStore.open in Phase 3; destructured here only. */
  onDeskClick?: (specialistId: string, originRect: DOMRect) => void;
}

function firstMappedValue<T>(
  map: ReadonlyMap<string, T>,
  keys: readonly string[],
): T | undefined {
  for (const key of keys) {
    const value = map.get(key);
    if (value !== undefined) return value;
  }
  return undefined;
}

function latestMappedTimestamp(
  map: ReadonlyMap<string, number>,
  keys: readonly string[],
): number | undefined {
  let latest: number | undefined;
  for (const key of keys) {
    const value = map.get(key);
    if (value !== undefined && (latest === undefined || value > latest)) {
      latest = value;
    }
  }
  return latest;
}

/* -------------------------------------------------------------------------- */
/* camera pose table                                                           */
/* -------------------------------------------------------------------------- */

interface CameraPose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

/** Default office overview. Camera SE-and-high; target a touch above the dais. */
const POSE_DEFAULT: CameraPose = {
  pos: new THREE.Vector3(20, 14, 20),
  target: new THREE.Vector3(0, 4, 0),
};

/** Brain — camera above-and-south, target at brain center.
 *  Offset (0, 3.75, 6.75) gives ~7.7 units of standoff from the brain — a
 *  half-step pulled back from the previous (0, 2.5, 4.5)/~5.15 framing so
 *  the full cloud reads as a contained object rather than dominating the
 *  viewport on entry. Same azimuth (due-south, slight downward tilt) so
 *  the brain still lands in the same screen quadrant; users can dolly in
 *  to the min=3 constraint via scroll if they want a closer look. */
const POSE_BRAIN: CameraPose = {
  pos: new THREE.Vector3(0, 17.75, 6.75),
  target: new THREE.Vector3(BRAIN_POSITION[0], BRAIN_POSITION[1], BRAIN_POSITION[2]),
};

/** Orchestrator — camera on the NORTH side of the dais so it sees the
 *  monitor screens (which face world -Z, because the orchestrator group has
 *  rotation.y = π, flipping its local screen face direction). Pulled back to
 *  6 units so the chair + bust + 3 monitors all fit comfortably in frame. */
const POSE_ORCHESTRATOR: CameraPose = {
  pos: new THREE.Vector3(0, 3.5, -6),
  target: new THREE.Vector3(0, 1.7, 0),
};

/**
 * Per-desk poses, pre-computed once at module load from the canonical desk
 * positions. Each pose puts the camera ~2.6 units outward from the desk
 * (radial direction) at y=3.0, looking at the monitor center (y=1.35) — a
 * comfortable framing that includes the chair, avatar, and screen. Cheap to
 * keep in memory; avoids recomputing inside `useFrame`.
 */
const DESK_POSES: Map<SpecialistId, CameraPose> = (() => {
  const m = new Map<SpecialistId, CameraPose>();
  for (const d of deskPositions()) {
    const [dx, , dz] = d.position;
    const r = Math.sqrt(dx * dx + dz * dz) || 1;
    const ox = dx / r;
    const oz = dz / r;
    m.set(d.id, {
      pos: new THREE.Vector3(dx + ox * 2.6, 3.0, dz + oz * 2.6),
      target: new THREE.Vector3(dx, 1.35, dz),
    });
  }
  return m;
})();

function poseFor(focused: FocusId): CameraPose {
  if (focused === null) return POSE_DEFAULT;
  if (focused === "brain") return POSE_BRAIN;
  if (focused === "orchestrator") return POSE_ORCHESTRATOR;
  return DESK_POSES.get(focused) ?? POSE_DEFAULT;
}

interface OrbitConstraints {
  min: number;
  max: number;
  polar: number;
}

/** OrbitControls min/max/polar tuned per focus kind. Tighter near the focused
 *  entity; loosest in the default overview. */
function constraintsFor(focused: FocusId): OrbitConstraints {
  if (focused === null) return { min: 14, max: 60, polar: Math.PI * 0.45 };
  if (focused === "brain") return { min: 3, max: 18, polar: Math.PI * 0.9 };
  if (focused === "orchestrator") return { min: 2.5, max: 10, polar: Math.PI * 0.85 };
  return { min: 1.5, max: 8, polar: Math.PI * 0.85 };
}

/** Squared-distance epsilon used to decide we've "arrived" at the target
 *  pose. 0.04 ≈ within 0.2 world units — visually indistinguishable from
 *  arrived. */
const ARRIVAL_EPS_SQ = 0.04;
/** Lerp factor per frame. Lower = smoother, more cinematic flight.
 *  0.06 ≈ 99% in ~75 frames (~1.25s at 60fps). User-input cancels the lerp
 *  via arrivedRef, so a slower flight doesn't trap anyone — it just feels
 *  less abrupt when transitioning between entities. */
const LERP_FACTOR = 0.06;

/**
 * CameraRig — runs inside the Canvas. ONE-SHOT animation: eases the camera +
 * OrbitControls target toward the pose matched to `focused` until both
 * arrive, then stops and hands control to OrbitControls.
 *
 * Two ways the rig stops lerping:
 *   1. Natural arrival — distance to target < ARRIVAL_EPS_SQ.
 *   2. User starts interacting (mid-flight scroll or drag) — OrbitControls
 *      `onStart` flips `arrivedRef = true` so the user wins immediately.
 *
 * `recenterNonce` is a generation counter — incrementing it replays the lerp.
 */
function CameraRig({
  focused,
  recenterNonce,
  controlsRef,
  arrivedRef,
}: {
  focused: FocusId;
  recenterNonce: number;
  controlsRef: React.RefObject<OrbitControlsHandle | null>;
  arrivedRef: React.RefObject<boolean>;
}) {
  const { camera } = useThree();
  const lastFocusedRef = useRef<FocusId>(focused);
  const lastRecenterRef = useRef(recenterNonce);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    // Focus changed OR recenter requested — restart the animation.
    if (
      focused !== lastFocusedRef.current ||
      recenterNonce !== lastRecenterRef.current
    ) {
      lastFocusedRef.current = focused;
      lastRecenterRef.current = recenterNonce;
      arrivedRef.current = false;
    }
    if (arrivedRef.current) return;

    const { pos, target } = poseFor(focused);
    camera.position.lerp(pos, LERP_FACTOR);
    controls.target.lerp(target, LERP_FACTOR);
    controls.update();

    if (
      camera.position.distanceToSquared(pos) < ARRIVAL_EPS_SQ &&
      controls.target.distanceToSquared(target) < ARRIVAL_EPS_SQ
    ) {
      arrivedRef.current = true;
    }
  });
  return null;
}

export default function OfficeScene({
  clientSlug,
  focused = null,
  onSelectBrain,
  onSelectBrainNode,
  onUnfocus,
  chatTarget,
  replyTimestamps,
  dismissedSpecialists,
  onDismissSpecialist,
  onClearDismiss,
  onSelectDesk,
  onSelectOrchestrator,
  musicPlaying = false,
  onToggleMusic,
  onSceneReady,
  onWebGLUnavailable,
  onDeskClick,
}: Props) {
  // Active background theme — drives the in-Canvas ThemeBackground component
  // (lights, fog, particles, horizon). The CSS gradient itself is applied on
  // the parent container by OfficeWorkspaceInner, not here.
  const { theme } = useTheme();

  const activeRegistered = useActiveAgents(clientSlug);
  const activeJobIds = useActiveJobIds(clientSlug);
  const pulseTimestamps = useJobPulses(clientSlug);
  const orchestratorThinking = useOrchestratorThinking(clientSlug);

  // Tool-use activity from the agentic stream — incremented on each
  // `tool_use` / `file_read` / `todo_update`. The brain pulses brighter
  // for ~1.5s after every tick so the user sees the orchestrator is
  // *actively touching* tools, not just idling on an open LLM call.
  const [lastToolTickMs, setLastToolTickMs] = useState(0);
  useAgenticEvents(clientSlug, (ev) => {
    if (
      ev.kind === "tool_use" ||
      ev.kind === "file_read" ||
      ev.kind === "file_edit" ||
      ev.kind === "todo_update" ||
      ev.kind === "bash"
    ) {
      setLastToolTickMs(Date.now());
    }
  });
  // Periodic now-tick — only runs while a recent tool tick is still
  // inside the activity window. The previous version had a re-render
  // storm: once the first tool tick set `lastToolTickMs > 0`, the
  // interval kept ticking at 250ms FOREVER (the gate-check only handled
  // the initial 0 case). New version self-stops once we've crossed the
  // window so a truly idle office spends zero React reconciliation
  // cycles on this. The initial Date.now() is captured lazily by
  // useState so the effect never sets state synchronously on mount.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (lastToolTickMs === 0) return;
    const i = setInterval(() => {
      setNowMs(Date.now());
      // 500ms of overshoot past the 4000ms activity window so the
      // BrainChandelier's lerp has settled before we stop poking React.
      if (Date.now() - lastToolTickMs > 4500) clearInterval(i);
    }, 250);
    return () => clearInterval(i);
  }, [lastToolTickMs]);
  // Activity-tail window. Was 1500ms — short enough that multi-step
  // agentic work (tools fire in clusters with quiet gaps) caused the
  // `pulsing` flag fed to BrainChandelier to oscillate true→false→true,
  // visibly strobing the dais spotlight. 4000ms covers typical inter-
  // tool gaps while still letting the lights settle once the agent is
  // truly idle. Paired with shrunk amplitudes + slower lerp in
  // PulsingLights, this collapses the user-reported "tweaking" cluster
  // into one calm pulsing envelope.
  const recentToolActivity =
    lastToolTickMs > 0 && nowMs - lastToolTickMs < 4000;

  /**
   * `activeRegistered` is keyed by the orchestrator's registered specialist id
   * (e.g. "technical-auditor"); the scene works in short scene ids
   * (e.g. "technical"). Map at this boundary, exactly once per change.
   * The synthetic "orchestrator" key is treated separately — until/unless we
   * wire orchestration-as-a-job, the orchestrator renders always-on per spec
   * §6 and doesn't need to appear in this set.
   */
  const activeSceneIds = useMemo(() => {
    const out = new Set<string>();
    for (const reg of activeRegistered) {
      const scene = toSceneId(reg);
      if (scene) out.add(scene);
    }
    if (activeRegistered.has("orchestrator")) out.add("orchestrator");
    return out;
  }, [activeRegistered]);

  /**
   * Scene id of the specialist the user is currently chatting with (if any).
   * Maps the registered chat target (e.g. "beast-planner") to the desk's
   * scene id (e.g. "strategy") so the matching desk can light its monitor +
   * hologram. The orchestrator and unknown targets resolve to `null`:
   *   - orchestrator: already always-on per spec §6, no extra signal needed.
   *   - unknown: chat target not in the specialist roster (defensive — should
   *     never happen with the current chatTargets list).
   * The job-activity theater (floor ring, emissive desk pulse, last-log)
   * stays gated on `activeSceneIds` only. Chat = presence, not execution.
   */
  const chatSceneId: SpecialistId | null = useMemo(() => {
    if (!chatTarget || chatTarget === "orchestrator") return null;
    return toSceneId(chatTarget) ?? null;
  }, [chatTarget]);

  /**
   * Re-arm dismissed specialists when a NEW job pulse arrives for them. The
   * pulse map's identity is stable across ticks where no specialist completes
   * a job; whenever a fresh completion happens for an id the user previously
   * dismissed, the timestamp for that id will be either new (entry didn't
   * exist before) or greater than the prior value. Either case is "fresh
   * activity" — we tell the parent to clear that id from the dismissed set
   * so the COMPLETE pulse + afterglow are visible again.
   *
   * Stored as a ref so we don't trigger re-renders on every comparison —
   * we only read it inside an effect and mutate it after the comparison.
   * Note: the chat-reply re-arm already lives inside `markSpecialistReplied`
   * at the workspace level, so this effect handles only the job-pulse case.
   */
  const prevPulseRef = useRef<ReadonlyMap<string, number>>(new Map());
  useEffect(() => {
    const dismissed = dismissedSpecialists;
    if (dismissed && dismissed.size > 0 && onClearDismiss) {
      for (const id of dismissed) {
        const current = pulseTimestamps.get(id);
        if (current === undefined) continue;
        const prev = prevPulseRef.current.get(id);
        if (prev !== current) onClearDismiss(id);
      }
    }
    prevPulseRef.current = pulseTimestamps;
  }, [pulseTimestamps, dismissedSpecialists, onClearDismiss]);

  // sr-only accessibility description, kept in sync with active count
  const activeCount = activeSceneIds.size - (activeSceneIds.has("orchestrator") ? 1 : 0);

  const desks = useMemo(() => deskPositions(), []);

  // Honor prefers-reduced-motion → disable auto-rotate. One-shot hydration
  // from the media query, then live updates via the change listener.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Stop auto-rotate after first user interaction so it doesn't fight the user
  const [autoRotate, setAutoRotate] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControlsHandle | null>(null);
  const contextLostCleanupRef = useRef<(() => void) | null>(null);
  // Captured once via <Canvas onCreated>. Lets the DOM zoom buttons reach
  // the R3F camera without imperative-handle gymnastics.
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  // Hoisted out of CameraRig so OrbitControls `onStart` can cancel a mid-
  // flight lerp by flipping this to true — the user gets the camera back
  // immediately instead of fighting our easing.
  const arrivedRef = useRef(false);
  // Bumped by the ⊙ button — CameraRig watches and replays the lerp.
  const [recenterNonce, setRecenterNonce] = useState(0);

  // Single-value hover tracking. Only one desk can be under the pointer at
  // a time, so we hold one scene id (or null). Used by BrainThreads to fade
  // the corresponding sky-thread in as a preview.
  const [hoveredSceneId, setHoveredSceneId] = useState<SpecialistId | null>(null);
  const onDeskHoverChange = (id: SpecialistId, hovered: boolean) => {
    // Functional updater handles the race where pointer enters B before
    // leaving A — B's enter fires first (prev → B); then A's leave sees
    // prev=B (not A), keeps B.
    setHoveredSceneId((prev) => (hovered ? id : prev === id ? null : prev));
  };

  // Idle auto-orbit. The camera resumes a slow ambient rotation 5s after the
  // user last interacted (drag/scroll/button click/focus change). Any new
  // interaction cancels the pending resume and starts a fresh timer.
  const IDLE_RESUME_MS = 5000;
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function markUserInteraction() {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setAutoRotate(false);
    idleTimerRef.current = setTimeout(() => {
      setAutoRotate(true);
      idleTimerRef.current = null;
    }, IDLE_RESUME_MS);
  }
  // Cleanup the timer on unmount so we don't try to setState after unmount.
  useEffect(() => () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    contextLostCleanupRef.current?.();
  }, []);
  // Any focus change is a user-initiated event (click an entity, ESC, back
  // button, click empty space). Treat it as interaction. Skip the initial
  // render so the very first frame still auto-rotates.
  const focusedFirstRef = useRef(true);
  useEffect(() => {
    if (focusedFirstRef.current) {
      focusedFirstRef.current = false;
      return;
    }
    markUserInteraction();
    // markUserInteraction closes over refs + the stable setState dispatch.
  }, [focused]);

  // Zoom by scaling the camera's offset from the orbit target. controls.update()
  // clamps to min/max distance for free. Also cancels any pending lerp so the
  // user's zoom isn't immediately undone by CameraRig.
  function zoom(factor: number) {
    const controls = controlsRef.current;
    const cam = cameraRef.current;
    if (!controls || !cam) return;
    arrivedRef.current = true;
    const offset = cam.position.clone().sub(controls.target).multiplyScalar(factor);
    cam.position.copy(controls.target).add(offset);
    controls.update();
    markUserInteraction();
  }

  const constraints = constraintsFor(focused);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <h2 className="sr-only">
        SEO Office: orchestrator on raised dais under a glowing brain-vault chandelier,
        26 specialist agents in three concentric rings. {activeCount}{" "}
        {activeCount === 1 ? "agent" : "agents"} currently active.
      </h2>

      <Canvas
        camera={{ fov: 52, near: 0.1, far: 400, position: [20, 14, 20] }}
        dpr={[1, 2]}
        // alpha:true + transparent style lets the parent container's themed
        // CSS gradient show through behind the WebGL scene. Without this we'd
        // paint a flat #000 over every theme's sky.
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
        onCreated={({ camera, gl }) => {
          cameraRef.current = camera as THREE.PerspectiveCamera;
          contextLostCleanupRef.current?.();
          const canvas = gl.domElement;
          const onContextLost = (event: Event) => {
            event.preventDefault();
            onWebGLUnavailable?.();
          };
          canvas.addEventListener("webglcontextlost", onContextLost, {
            once: true,
          });
          contextLostCleanupRef.current = () => {
            canvas.removeEventListener("webglcontextlost", onContextLost);
          };
          onSceneReady?.();
        }}
        // R3F fires `onPointerMissed` when a click bubbles out without any 3D
        // object catching it. While focused, that means the user clicked the
        // background — treat as "exit focus".
        onPointerMissed={() => {
          if (focused !== null && onUnfocus) onUnfocus();
        }}
      >
        <Suspense fallback={null}>
          {/* Background — lights (hemisphere + warm key + cool fill + ambient),
              fog, particle layer (stars / clouds / fireflies / etc.), and a
              far-horizon silhouette set. All driven by the active theme.
              Replaces the previous hand-tuned lights + <Stars/> backdrop. */}
          <ThemeBackground theme={theme} />

          {/* stage */}
          <Platform />

          {/* orchestrator — always rendered, screens always animating. The
              side-tower mesh doubles as a clickable speaker that toggles
              ambient music; its green light strip pulses while playing. */}
          <Orchestrator
            onSelect={onSelectOrchestrator}
            musicPlaying={musicPlaying}
            onToggleMusic={onToggleMusic}
            thinking={orchestratorThinking}
            reducedMotion={reducedMotion}
          />

          {/* 26 specialist desks — three concentric rings around the dais.
              jobId is resolved scene-id → registered-id aliases →
              activeJobIds map. Some build-brain support jobs (GA4,
              Search Console, phase gates, vault lint) intentionally share
              the closest physical desk instead of requiring extra geometry. */}
          {desks.map((d) => {
            const registered = toRegisteredId(d.id);
            const registeredAliases = registeredIdsForScene(d.id);
            const jobId = firstMappedValue(activeJobIds, registeredAliases);
            // Soft user-side dismissal mask. When set, BOTH timestamps are
            // suppressed so `lastActivityAt` in Specialist resolves to null
            // → recentlyActive=false → present collapses (unless the desk is
            // also currently active or chatting, which are independent
            // signals not affected by dismissal). The mask is automatically
            // lifted by the parent whenever fresh activity arrives for this
            // registered id — see markSpecialistReplied / job-pulse re-arm.
            const isDismissed =
              registeredAliases.length > 0 &&
              registeredAliases.every((id) => dismissedSpecialists?.has(id));
            const completedAt =
              !isDismissed ? latestMappedTimestamp(pulseTimestamps, registeredAliases) : undefined;
            const lastReplyAt =
              !isDismissed && replyTimestamps
                ? latestMappedTimestamp(replyTimestamps, registeredAliases)
                : undefined;
            return (
              <Specialist
                key={d.id}
                id={d.id}
                position={d.position}
                facing={d.facing}
                seed={d.seed}
                active={activeSceneIds.has(d.id)}
                chatting={d.id === chatSceneId}
                completedAt={completedAt}
                lastReplyAt={lastReplyAt}
                jobId={jobId}
                clientSlug={clientSlug}
                reducedMotion={reducedMotion}
                onSelect={(sceneId, originRect) => {
                  // Existing chat/focus behavior — unchanged.
                  onSelectDesk?.(sceneId);
                  // Phase 3: also fire the desk-click → window-open path.
                  if (onDeskClick) {
                    const registered = toRegisteredId(sceneId);
                    if (registered) {
                      onDeskClick(
                        registered,
                        (originRect ?? { left: 200, top: 200, width: 80, height: 56 }) as DOMRect,
                      );
                    }
                  }
                }}
                onHoverChange={onDeskHoverChange}
                // Translate the scene id back to the registered id here
                // (the dismissed set + workspace state are both keyed on
                // registered id, while desks work in scene-local short ids).
                onDismiss={
                  registered && onDismissSpecialist
                    ? () => onDismissSpecialist(registered)
                    : undefined
                }
              />
            );
          })}

          {/* sky-brain — click focuses the camera onto it; in brain-focus
              mode the per-node onClick handlers take over for slide-overs. */}
          <BrainChandelier
            clientSlug={clientSlug}
            onClick={onSelectBrain}
            focused={focused === "brain"}
            onSelectNode={onSelectBrainNode}
            reducedMotion={reducedMotion}
            pulsing={orchestratorThinking || activeCount > 0 || recentToolActivity}
          />

          {/* threads + pulses — idle threads hidden, hovered thread fades in */}
          <BrainThreads
            activeSceneIds={activeSceneIds}
            hoveredSceneId={hoveredSceneId}
          />
          <ThreadPulses
            activeSceneIds={activeSceneIds}
            pulseTimestamps={pulseTimestamps}
            reducedMotion={reducedMotion}
          />

          <CameraRig
            focused={focused}
            recenterNonce={recenterNonce}
            controlsRef={controlsRef}
            arrivedRef={arrivedRef}
          />

          <OrbitControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.05}
            minDistance={constraints.min}
            maxDistance={constraints.max}
            maxPolarAngle={constraints.polar}
            target={[0, 4, 0]}
            // Auto-rotate around whatever the current target is (default
            // overview OR a focused entity). The idle timer flips this back
            // on 5s after the last user interaction.
            autoRotate={!reducedMotion && autoRotate}
            autoRotateSpeed={0.25}
            enablePan={false}
            // User started interacting — cancel any mid-flight camera lerp,
            // kill auto-rotate, and arm the idle timer for resume.
            onStart={() => {
              arrivedRef.current = true;
              markUserInteraction();
            }}
            keyPanSpeed={7.0}
          />
        </Suspense>
      </Canvas>

      {/* Camera controls — bottom-left. Matches the existing hint-pill design
          language: thin graphite border, abyss/85 backdrop blur, ash text,
          gold on hover. Three buttons divided by vertical graphite rules. */}
      <div className="pointer-events-auto absolute bottom-4 left-4 z-10 flex items-stretch border border-graphite bg-abyss/85 backdrop-blur">
        <button
          type="button"
          onClick={() => {
            setRecenterNonce((n) => n + 1);
            markUserInteraction();
          }}
          title="Re-center camera"
          aria-label="Re-center camera"
          className="border-r border-graphite px-3 py-2 text-[14px] leading-none text-ash transition-colors hover:bg-graphite/40 hover:text-gold"
        >
          ⊙
        </button>
        <button
          type="button"
          onClick={() => zoom(0.85)}
          title="Zoom in"
          aria-label="Zoom in"
          className="border-r border-graphite px-3 py-2 text-[14px] leading-none text-ash transition-colors hover:bg-graphite/40 hover:text-gold"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoom(1.18)}
          title="Zoom out"
          aria-label="Zoom out"
          className="px-3 py-2 text-[14px] leading-none text-ash transition-colors hover:bg-graphite/40 hover:text-gold"
        >
          −
        </button>
      </div>
    </div>
  );
}
