"use client";

/**
 * Specialist — content-only component for one specialist desk.
 *
 * Spec: docs spec §4 ("Per-specialist desk geometry") + §5 (head idle motion).
 *
 * Everything is in desk-local coordinates wrapped in a single
 * `<group position={position}>`. The component is silent (no `useFrame`) when
 * `active === false` *and not hovered* so the 26 idle desks contribute zero
 * per-frame work in the steady state.
 *
 * Three visible states per desk:
 *   - active:   full hologram bust, monitor screen ticking, mint spill light
 *   - hovered:  dim "ghost" hologram (preview) — invites the user to click
 *   - dormant:  desk furniture only, off-screen on the monitor
 *
 * The parent (`OfficeScene`) owns the Canvas, lighting, and orbit controls —
 * we render only desk geometry + chair + monitor + (conditional) hologram and
 * monitor point-light + label.
 */

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { DeskLabel } from "./DeskLabel";
import { AgentHologram } from "./HolographicMaterial";
import { Screen } from "./Screen";
import { SCENE_COLORS, type SpecialistId } from "./positions";
import { useJobProgress } from "@/hooks/useJobProgress";

interface SpecialistProps {
  id: SpecialistId;
  /** Desk world position (from `deskPositions()`). */
  position: [number, number, number];
  /** Y rotation so the desk faces the orchestrator at origin. From
   *  `deskPositions()` — `Math.atan2(x, z)`. */
  facing: number;
  /** Stable phase offset so each avatar idles slightly differently. */
  seed: number;
  /** True when this specialist has a RUNNING job. Drives the full job-
   *  activity theater (monitor on + floor ring + emissive tabletop + last-log
   *  billboard). For "monitor on because the user is chatting" presence, use
   *  `chatting` instead — chat is not execution. */
  active: boolean;
  /** True when this specialist is the user's current chat target. Lights the
   *  monitor screen + hologram bust + spill light + label, but does NOT
   *  trigger the job-activity theater (no floor ring, no emissive desk pulse,
   *  no last-log). A chatting desk reads as "online and present", a running
   *  desk reads as "executing right now". */
  chatting?: boolean;
  /** Success pulse timestamp. The monitor shows COMPLETE for 10s for the
   *  immediate "just finished" cue, then the desk stays *present* (monitor
   *  type-specific screen + hologram + spill light) for `POST_ACTIVITY_WINDOW_MS`
   *  so the office accumulates a sense of "who's been working" instead of
   *  resetting to total darkness as soon as a job ends. */
  completedAt?: number;
  /** Most recent chat-stream end timestamp for this specialist. Parallel to
   *  `completedAt` but driven by chat (specialist just replied), not jobs.
   *  Both feed the same `recentlyActive` presence gate; whichever is more
   *  recent wins. A specialist who just answered a question stays visibly
   *  present at their desk for the full window even if no job was run. */
  lastReplyAt?: number;
  /** Active job's id when the desk has a running specialist. Used to mount
   *  a per-job EventSource that drives the floor ring + emissive tabletop +
   *  last-log billboard. Undefined when the desk is idle, when only chatting,
   *  or when `active` was set by chat-target focus rather than a real running
   *  job. */
  jobId?: string;
  /** Client slug — passed to `useJobProgress` for the ownership check on
   *  the per-job SSE route. */
  clientSlug?: string;
  /** Honor `prefers-reduced-motion` — freeze the floor-ring pulse. */
  reducedMotion?: boolean;
  /** Fired when the user clicks anywhere on this desk station. Used by the
   *  parent to set the chat target (and light up the desk via that pathway).
   *  Also receives the desk's approximate screen-space rect so the parent can
   *  animate a window spawning from the desk's position. */
  onSelect?: (id: SpecialistId, originRect?: { left: number; top: number; width: number; height: number }) => void;
  /** Fired when this desk's hover state changes. The parent uses this to
   *  surface the corresponding sky-thread (idle threads are otherwise
   *  invisible). */
  onHoverChange?: (id: SpecialistId, hovered: boolean) => void;
  /** Fired when the user clicks the × overlay that appears on hover while
   *  the desk is in the afterglow state (recentlyActive && !active &&
   *  !chatting). When omitted, the × button is not rendered — the parent
   *  must explicitly wire dismissal to opt in. The translation from scene
   *  id to registered id happens in OfficeScene; this component is id-
   *  agnostic and just signals "user wants this desk gone now". */
  onDismiss?: () => void;
}

const CHARCOAL = "#27272a";
/** Hologram emerald (vivid). */
const EMERALD = "#10b981";
/** Active-monitor accent point-light — warm mint, per spec criterion #9. */
const SCREEN_ACCENT = "#80fdb8";
/** Brightness override for the hover-only ghost bust — about 40% of full. */
const GHOST_BRIGHTNESS = 0.45;
/** Brightness override for the "recently-active but no longer running" bust
 *  — about 75% of full. Visibly dimmer than an actively-running specialist,
 *  but markedly brighter than the hover ghost. The office reads as "this
 *  agent did some work in the last few minutes, still standing here". */
const PRESENT_BRIGHTNESS = 0.75;
/** How long after a specialist's last activity (job completion OR chat
 *  reply) the desk stays visibly *present* — monitor on, hologram visible —
 *  before fading back to dormant. The user's office should feel lived-in
 *  across a working session, not reset to total darkness 10s after every
 *  task. 5 minutes is long enough to remember a multi-step exchange and
 *  short enough that abandoned desks eventually clear. */
const POST_ACTIVITY_WINDOW_MS = 5 * 60 * 1000;
/** Window during which the monitor renders the COMPLETE success screen. After
 *  this expires the screen drops back to the specialist's type-specific
 *  canvas (still on — the desk stays *present* for the longer window). */
const COMPLETE_SCREEN_WINDOW_MS = 10_000;
/** Window during which the last-log billboard fades out above an active
 *  desk. Strictly shorter than the active-job lifecycle. */
const LAST_LOG_WINDOW_MS = 8_000;

/** Head idle motion. Rendered when active (full presence) OR hovered (ghost). */
function HologramHead({ seed, brightness }: { seed: number; brightness?: number }) {
  const headRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!headRef.current) return;
    const t = state.clock.elapsedTime;
    headRef.current.rotation.x = Math.sin(t * 0.6 + seed) * 0.06;
    headRef.current.rotation.y = Math.sin(t * 0.35 + seed * 1.4) * 0.08;
  });

  return (
    <group ref={headRef} position={[0, 0.5, 1.0]}>
      <AgentHologram color={EMERALD} brightness={brightness} />
    </group>
  );
}

/** Floor ring + emissive desktop accent — both lerp toward the active set
 *  while a job is running, fall back to idle when it isn't. Kept as a
 *  separate component so the per-frame work only mounts when a desk is
 *  actually active. */
function DeskActivity({
  desktopMatRef,
  progress,
  reducedMotion,
}: {
  desktopMatRef: React.RefObject<THREE.MeshStandardMaterial | null>;
  progress: number;
  reducedMotion: boolean;
}) {
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const ringScaleRef = useRef<THREE.Mesh>(null);
  const ringOpacity = useRef(0.1);
  const desktopEmissive = useRef(0);

  useFrame((state, delta) => {
    const targetRing = 0.1 + progress * 0.7;
    const targetEm = 0.4 * progress;
    const k = Math.min(1, delta * 6);
    ringOpacity.current += (targetRing - ringOpacity.current) * k;
    desktopEmissive.current += (targetEm - desktopEmissive.current) * k;
    if (ringMatRef.current) ringMatRef.current.opacity = ringOpacity.current;
    if (desktopMatRef.current) {
      desktopMatRef.current.emissiveIntensity = desktopEmissive.current;
    }
    // Gentle scale breathing on the ring while running — frozen under
    // reduced motion.
    if (ringScaleRef.current) {
      const t = state.clock.elapsedTime;
      const s = reducedMotion ? 1 : 1 + Math.sin(t * 2.0) * 0.04;
      ringScaleRef.current.scale.set(s, 1, s);
    }
  });

  return (
    <mesh ref={ringScaleRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.0, 1.35, 48]} />
      <meshBasicMaterial
        ref={ringMatRef}
        color={SCENE_COLORS.pulseSpecialist}
        transparent
        opacity={0.1}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

function SpecialistStatusBubble({
  text,
  progress,
}: {
  text: string;
  progress: number | null;
}) {
  const percent = Math.round(Math.max(0.04, Math.min(1, progress ?? 0.08)) * 100);
  return (
    <Html
      position={[0, 2.85, 0.92]}
      center
      transform
      distanceFactor={7}
      zIndexRange={[30, 0]}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      <div className="agent-bubble agent-bubble--specialist" aria-label={text}>
        <span className="agent-bubble__pulse" />
        <span className="agent-bubble__text">{text}</span>
        <span className="agent-bubble__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="agent-bubble__bar">
          <span style={{ width: `${percent}%` }} />
        </span>
      </div>
    </Html>
  );
}

function SpecialistImpl({
  id,
  position,
  facing,
  seed,
  active,
  chatting = false,
  completedAt,
  lastReplyAt,
  jobId,
  clientSlug = "",
  reducedMotion = false,
  onSelect,
  onHoverChange,
  onDismiss,
}: SpecialistProps) {
  const { camera, size } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  const [hovered, setHovered] = useState(false);
  // Mirror of `hovered` for the unmount cleanup. Plain state is captured by
  // closure value at effect-registration time, so an empty-dep cleanup that
  // reads `hovered` directly would see the stale initial value and never
  // fire its branches. The ref pattern reads the latest value at the moment
  // cleanup runs — the canonical React idiom for "act on the most recent
  // state during teardown".
  const hoveredRef = useRef(false);
  useEffect(() => {
    hoveredRef.current = hovered;
  }, [hovered]);
  // Unmount-only cleanup. If the desk unmounts while the pointer was over
  // it (scene retry / theme rebuild / focus-driven remount), the document
  // cursor would otherwise stay stuck on "pointer", and the parent's
  // `hoveredSceneId` would keep drawing a phantom hover-thread to the
  // brain because no pointerOut event ever fires for a removed mesh.
  // Empty deps + ref read = run exactly once on unmount with current state.
  useEffect(() => {
    return () => {
      if (hoveredRef.current) {
        document.body.style.cursor = "";
        onHoverChange?.(id, false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only cleanup
  }, []);
  const desktopMatRef = useRef<THREE.MeshStandardMaterial>(null);

  // Per-job stream. The hook is a no-op when jobId is undefined, so it's
  // safe to call unconditionally — keeps the React rules-of-hooks happy
  // while only spending bandwidth on running desks.
  const { progress, lastLog, lastLogTs } = useJobProgress(jobId, clientSlug);
  const [now, setNow] = useState(() => Date.now());

  // Most-recent-activity wall-clock — the latest of "job completed" or
  // "specialist replied in chat". Drives the long presence window; the
  // immediate COMPLETE screen still keys off `completedAt` only (a chat
  // reply shouldn't masquerade as a job completion in the UI).
  const lastActivityAt = useMemo(() => {
    const a = completedAt ?? 0;
    const b = lastReplyAt ?? 0;
    const m = Math.max(a, b);
    return m > 0 ? m : null;
  }, [completedAt, lastReplyAt]);

  // FAST TICK (500ms) — only while one of the *short* animation windows is
  // open: the last-log billboard fade (8s) or the COMPLETE success screen
  // (10s). Stops as soon as both windows have closed. The fast tick wakes
  // React often enough to drive smooth fades without burning frames for
  // 5 minutes after every task. (Previously this fired for the FULL
  // completedAt window which was already wasteful at 10s; with the 5-min
  // presence window unmerged it would have been catastrophic.)
  useEffect(() => {
    const logFresh = lastLogTs !== null && Date.now() - lastLogTs < LAST_LOG_WINDOW_MS;
    const completeFresh =
      completedAt !== undefined && Date.now() - completedAt < COMPLETE_SCREEN_WINDOW_MS;
    if (!logFresh && !completeFresh) return;
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, [lastLogTs, completedAt]);

  // EDGE TICK (one-shot setTimeout) — fires exactly once when the 5-minute
  // presence window expires, flipping `recentlyActive` false → dormant. No
  // intermediate ticks: nothing visible changes during the window, so we
  // don't need to re-render until the boundary. Cancelled & rearmed
  // whenever lastActivityAt advances.
  useEffect(() => {
    if (!lastActivityAt) return;
    const ageMs = Date.now() - lastActivityAt;
    const remaining = POST_ACTIVITY_WINDOW_MS - ageMs;
    if (remaining <= 0) return;
    const t = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(t);
  }, [lastActivityAt]);

  const logAgeMs = lastLogTs ? now - lastLogTs : Infinity;
  const freshLog = lastLog !== null && logAgeMs < LAST_LOG_WINDOW_MS;
  // `recentlyCompleted` — short window, drives the COMPLETE success screen.
  // Strictly keyed on completedAt (chat replies are not job completions).
  const completionAgeMs = completedAt ? now - completedAt : Infinity;
  const recentlyCompleted = !active && completionAgeMs < COMPLETE_SCREEN_WINDOW_MS;
  // `recentlyActive` — long window, drives presence (monitor on, hologram
  // visible, spill light). The desk reads as "I did some work recently and
  // I'm still standing here", which is the lived-in office feel we want
  // instead of darkness 10s after every task.
  const activityAgeMs = lastActivityAt ? now - lastActivityAt : Infinity;
  const recentlyActive = !active && activityAgeMs < POST_ACTIVITY_WINDOW_MS;
  const progressFraction = active ? (progress ?? 0) : 0;

  // "Presence" — anything that signals the desk is *online* (monitor screen,
  // hologram bust, spill light, label brightness). Three independent
  // triggers feed it; the job-activity theater (DeskActivity ring, emissive
  // tabletop pulse, last-log billboard) stays gated on `active` only.
  //   - active:         job is running RIGHT NOW
  //   - chatting:       user has this specialist as chat target
  //   - recentlyActive: specialist just finished a job OR replied to a
  //                     message within the last POST_ACTIVITY_WINDOW_MS
  const present = active || chatting || recentlyActive;
  const bubbleText = active
    ? compactSpecialistStatus(freshLog ? lastLog : null, progress)
    : null;

  // Pointer event handlers on the outer group — any child mesh hover bubbles
  // here. stopPropagation keeps the cursor flicker from neighboring desks.
  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    onHoverChange?.(id, true);
    document.body.style.cursor = "pointer";
  };
  const handleOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(false);
    onHoverChange?.(id, false);
    document.body.style.cursor = "";
  };
  function computeOriginRect():
    | { left: number; top: number; width: number; height: number }
    | undefined {
    if (!groupRef.current) return undefined;
    const v = new THREE.Vector3();
    v.setFromMatrixPosition(groupRef.current.matrixWorld);
    v.project(camera);
    const x = (v.x + 1) * 0.5 * size.width;
    const y = (-v.y + 1) * 0.5 * size.height;
    return { left: x - 40, top: y - 28, width: 80, height: 56 };
  }

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const rect = computeOriginRect();
    onSelect?.(id, rect);
  };

  const showAvatar = present || hovered;

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={[0, facing, 0]}
      onPointerOver={handleOver}
      onPointerOut={handleOut}
      onClick={handleClick}
    >
      {/* Desktop */}
      <mesh position={[0, 0.74, 0]}>
        <boxGeometry args={[2.6, 0.06, 1.2]} />
        <meshStandardMaterial
          ref={desktopMatRef}
          color={CHARCOAL}
          roughness={0.6}
          emissive={SCENE_COLORS.pulseSpecialist}
          emissiveIntensity={0}
        />
      </mesh>

      {/* Floor ring — appears under active desks, intensity scales with
          the job's progress. */}
      {active && (
        <DeskActivity
          desktopMatRef={desktopMatRef}
          progress={progressFraction}
          reducedMotion={reducedMotion}
        />
      )}

      {/* 4 desk legs — corners at (±1.25, 0.37, ±0.55) */}
      <mesh position={[1.25, 0.37, 0.55]}>
        <boxGeometry args={[0.08, 0.74, 0.08]} />
        <meshStandardMaterial color={CHARCOAL} roughness={0.6} />
      </mesh>
      <mesh position={[-1.25, 0.37, 0.55]}>
        <boxGeometry args={[0.08, 0.74, 0.08]} />
        <meshStandardMaterial color={CHARCOAL} roughness={0.6} />
      </mesh>
      <mesh position={[1.25, 0.37, -0.55]}>
        <boxGeometry args={[0.08, 0.74, 0.08]} />
        <meshStandardMaterial color={CHARCOAL} roughness={0.6} />
      </mesh>
      <mesh position={[-1.25, 0.37, -0.55]}>
        <boxGeometry args={[0.08, 0.74, 0.08]} />
        <meshStandardMaterial color={CHARCOAL} roughness={0.6} />
      </mesh>

      {/* Monitor — material array; +Z (index 4) is the live screen content
          rendered as a canvas-backed CanvasTexture by <Screen>. When idle,
          <Screen> renders the "off" canvas (black + dim red corner LED). */}
      <mesh position={[0, 1.35, -0.05]} rotation={[-0.08, 0, 0]}>
        <boxGeometry args={[1.4, 0.86, 0.06]} />
        <meshStandardMaterial attach="material-0" color={CHARCOAL} />
        <meshStandardMaterial attach="material-1" color={CHARCOAL} />
        <meshStandardMaterial attach="material-2" color={CHARCOAL} />
        <meshStandardMaterial attach="material-3" color={CHARCOAL} />
        <Screen
          agentId={id}
          active={present || recentlyCompleted}
          completed={recentlyCompleted}
          seed={seed}
          attach="material-4"
        />
        <meshStandardMaterial attach="material-5" color={CHARCOAL} />
      </mesh>

      {/* Chair — seat, back, post */}
      <mesh position={[0, 0.46, 1.0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.08, 24]} />
        <meshStandardMaterial color={CHARCOAL} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.85, 1.28]}>
        <boxGeometry args={[0.7, 0.7, 0.06]} />
        <meshStandardMaterial color={CHARCOAL} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.22, 1.0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.4, 12]} />
        <meshStandardMaterial color={CHARCOAL} roughness={0.6} />
      </mesh>

      {/* Present-only: monitor accent point-light. The hover ghost does NOT
       *  spawn this — it'd betray the "preview, not yet running" semantics.
       *  Chat and afterglow presence DO spawn it (the screen is on, so the
       *  spill light needs to match — otherwise the monitor reads as a black
       *  slab with a glowing canvas pasted on it). Active job is the brightest
       *  tier; chat and afterglow share the dimmer "ambient presence" tier. */}
      {present && (
        <pointLight
          color={SCREEN_ACCENT}
          intensity={active ? 0.55 : 0.4}
          distance={3.5}
          decay={1.7}
          position={[0, 1.35, 0.3]}
        />
      )}

      {/* Hologram bust — three brightness tiers:
       *    - full        when active (running) or chatting (live attention)
       *    - 0.75 PRESENT when only recentlyActive (afterglow — still here,
       *                   but not actively working or being addressed)
       *    - 0.45 GHOST   on hover-only (preview)
       *  A half-faded bust above a fully-lit monitor would read as a glitch
       *  during live attention, so chatting must use full brightness; the
       *  dimmer afterglow tier reads as "I was here a moment ago", which is
       *  exactly the presence we want during the 5-minute window. */}
      {showAvatar && (
        <HologramHead
          seed={seed}
          brightness={
            active || chatting
              ? undefined
              : recentlyActive
                ? PRESENT_BRIGHTNESS
                : GHOST_BRIGHTNESS
          }
        />
      )}

      {/* Label — sprite is rendered desk-local; DeskLabel applies the
          (+2.15 y, -0.4 z) offset internally. */}
      <DeskLabel id={id} position={[0, 0, 0]} active={present || hovered} />

      {bubbleText && <SpecialistStatusBubble text={bubbleText} progress={progress} />}

      {/* Per-desk dismiss button. Visible ONLY when the desk is in the
       *  pure afterglow state (recentlyActive but NOT actively running and
       *  NOT the current chat target) AND the pointer is hovering AND the
       *  parent supplied an `onDismiss` wiring. Clicking it tells the
       *  parent to add this desk's specialist to the dismissed set, which
       *  masks both completedAt + lastReplyAt → desk goes dormant
       *  immediately. New activity from this specialist (job pulse or
       *  fresh chat reply) automatically re-arms by clearing the dismiss.
       *
       *  Positioning: top-right of the monitor mesh — the universal "close
       *  this window" affordance. `transform + distanceFactor={6}` keeps
       *  the HTML overlay legible at default office-overview distance and
       *  also when focused close-up on the desk. The wrapper stops pointer
       *  propagation so clicking × does NOT also fire the desk's onSelect
       *  (which would fly the camera in and switch the chat target,
       *  defeating the dismissal). */}
      {onDismiss && recentlyActive && !active && !chatting && hovered && (
        <Html
          position={[0.75, 1.85, 0]}
          transform
          distanceFactor={6}
          zIndexRange={[20, 0]}
          style={{ pointerEvents: "auto", userSelect: "none" }}
        >
          <button
            type="button"
            title="Send home — clear this specialist's afterglow"
            aria-label="Dismiss this specialist's afterglow"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="flex h-6 w-6 items-center justify-center border border-graphite bg-abyss/90 text-[12px] leading-none text-ash backdrop-blur transition-colors hover:border-gold hover:text-gold"
          >
            ×
          </button>
        </Html>
      )}
    </group>
  );
}

/**
 * React.memo with a tight prop equality. The default shallow compare would
 * be fine, but we know two specific facts about this component that let us
 * skip even more:
 *   - `position`, `facing`, `seed` are derived once from `deskPositions()`
 *     and never change across the component's lifetime; their tuple
 *     references are stable. Skipping their compare costs nothing.
 *   - Callback identities (onSelect, onHoverChange, onDismiss) change on
 *     every OfficeScene render because the parent currently builds them
 *     inline. Comparing them by reference would defeat memo entirely. We
 *     ignore them in the equality check because their behavior is
 *     determined by what they CLOSE OVER (registered id, dismissed set,
 *     etc.), which is captured at call time — the function identity
 *     itself doesn't affect what happens visually.
 * Without this memo, every state change in OfficeWorkspace (focus, target,
 * chat target, hover) caused all 26 specialists to re-reconcile their
 * desk/legs/monitor/chair/hologram/label subtrees. That's the click-lag
 * the user reported: 26 × ~10 meshes × ~3 props = ~800 reconciliations
 * fired on every state change, even when nothing about that desk changed.
 */
export const Specialist = memo(SpecialistImpl, (prev, next) => {
  return (
    prev.id === next.id &&
    prev.active === next.active &&
    prev.chatting === next.chatting &&
    prev.completedAt === next.completedAt &&
    prev.lastReplyAt === next.lastReplyAt &&
    prev.jobId === next.jobId &&
    prev.clientSlug === next.clientSlug &&
    prev.reducedMotion === next.reducedMotion
  );
});

function compactSpecialistStatus(message: string | null, progress: number | null): string {
  const text = (message ?? "").trim();
  const lower = text.toLowerCase();
  if (!text) {
    if (progress == null || progress < 0.05) return "Queued";
    if (progress < 0.2) return "Starting";
    return "Thinking";
  }
  if (lower.includes("vault") && (lower.includes("walking") || lower.includes("lint"))) {
    return "Checking vault";
  }
  if (lower.includes("verifying") || lower.includes("access") || lower.includes("property")) {
    return "Checking access";
  }
  if (
    lower.includes("fetching") ||
    lower.includes("crawl") ||
    lower.includes("sitemap")
  ) {
    return "Fetching site";
  }
  if (
    lower.includes("pulling") ||
    lower.includes("serp") ||
    lower.includes("queries") ||
    lower.includes("pages") ||
    lower.includes("channels") ||
    lower.includes("totals")
  ) {
    return "Pulling data";
  }
  if (
    lower.includes("calling") ||
    lower.includes("synthesizing") ||
    lower.includes("applying") ||
    lower.includes("designing")
  ) {
    return "Thinking";
  }
  if (
    lower.includes("writing") ||
    lower.includes("persisting") ||
    lower.includes("report") ||
    lower.includes("artifact")
  ) {
    return "Writing report";
  }
  if (lower.includes("reading") || lower.includes("gathering")) {
    return "Reading brain";
  }
  if (lower.includes("reviewing")) {
    return "Reviewing output";
  }
  if (lower.includes("finished") || lower.includes("complete")) {
    return "Finishing";
  }
  return shortenStatus(text);
}

function shortenStatus(text: string): string {
  const cleaned = text
    .replace(/https?:\/\/\S+/gi, "site")
    .replace(/[.。…]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= 24) return cleaned;
  return `${cleaned.slice(0, 21).trim()}...`;
}
