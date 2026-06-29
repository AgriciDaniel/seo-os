"use client";

/**
 * ThreadPulses — traveling spheres on the active threads.
 *
 * Two flavors, both driven by `useFrame`:
 *
 * 1. Ambient heartbeat — for every active station (including the orchestrator)
 *    a small sphere rides the thread continuously. Phase = `(t * 0.5 + seed) % 1`
 *    so each pulse is staggered. Size eases in/out via `sin(phase * π) * max`,
 *    invisible at both endpoints and peak in the middle. Orchestrator gets a
 *    gold tint; specialists get bright lime.
 * 2. Completion burst — fired when `pulseTimestamps` records a new completion
 *    for a station within the last 1.5s. Travels source → end in ~0.6s,
 *    brighter (white) and larger (radius 0.18). Tracked in a ref so each
 *    burst lives independently of React state.
 *
 * Mesh count is trivial (≤26 heartbeats + a few bursts), so we just render one
 * `<mesh>` per pulse instead of dealing with InstancedMesh matrices.
 *
 * Spec: docs spec §7 (implementation) + §6 (the orchestrator gold heartbeat).
 */

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import {
  deskPositions,
  ORCHESTRATOR_POSITION,
  SCENE_COLORS,
  toSceneId,
  threadEnd,
  threadStart,
} from "./positions";

interface ThreadPulsesProps {
  /** Already-mapped scene ids of currently-running stations. */
  activeSceneIds: Set<string>;
  /** `useJobPulses` output — keyed by REGISTERED id, value is Date.now() ms.
   *  We map to scene id internally. */
  pulseTimestamps: Map<string, number>;
  /** When true (prefers-reduced-motion), ambient pulses freeze at the middle
   *  of each thread (phase 0.5 → peak size) instead of animating along. */
  reducedMotion?: boolean;
}

const AMBIENT_COLOR = SCENE_COLORS.pulseSpecialist; // #6effb1
const ORCH_AMBIENT_COLOR = SCENE_COLORS.pulseOrchestrator; // #ffeaa3
const BURST_COLOR = "#ffffff";

const AMBIENT_MAX_SIZE = 0.08;
const BURST_SIZE = 0.18;
const BURST_DURATION_MS = 600;
const BURST_WINDOW_MS = 1500;

interface Station {
  id: string;
  source: [number, number, number];
  end: [number, number, number];
  seed: number;
  isOrchestrator: boolean;
}

interface ActiveBurst {
  stationId: string;
  startTime: number;
}

function buildStations(): Station[] {
  const out: Station[] = deskPositions().map((d) => {
    const source = threadStart(d.position);
    return {
      id: d.id as string,
      source,
      end: threadEnd(source),
      seed: d.seed,
      isOrchestrator: false,
    };
  });
  const orchSource = threadStart(ORCHESTRATOR_POSITION);
  out.push({
    id: "orchestrator",
    source: orchSource,
    end: threadEnd(orchSource),
    seed: 0.31, // distinct from any desk's golden-ratio seed
    isOrchestrator: true,
  });
  return out;
}

function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export function ThreadPulses({ activeSceneIds, pulseTimestamps, reducedMotion = false }: ThreadPulsesProps) {
  const stations = useMemo(() => buildStations(), []);
  const byId = useMemo(() => {
    const m = new Map<string, Station>();
    for (const s of stations) m.set(s.id, s);
    return m;
  }, [stations]);

  // Map registered-id → scene-id timestamp set. Orchestrator already arrives
  // under its own key (no mapping needed); specialist registered ids translate
  // through `toSceneId`.
  const sceneTimestamps = useMemo(() => {
    const out = new Map<string, number>();
    for (const [registeredId, ts] of pulseTimestamps) {
      if (registeredId === "orchestrator") {
        out.set("orchestrator", ts);
        continue;
      }
      const sceneId = toSceneId(registeredId);
      if (sceneId) out.set(sceneId, ts);
    }
    return out;
  }, [pulseTimestamps]);

  /* ----- ambient heartbeats: one mesh per active station ----------------- */

  const ambientRefs = useRef<Map<string, THREE.Mesh>>(new Map());

  const ambientStations = useMemo(
    () =>
      stations.filter(
        (s) => s.isOrchestrator || activeSceneIds.has(s.id),
      ),
    [stations, activeSceneIds],
  );

  /* ----- completion bursts: imperative list driven by ref ---------------- */

  const activeBursts = useRef<ActiveBurst[]>([]);
  const seenTimestamps = useRef<Map<string, number>>(new Map());
  // Allocate a pool large enough for all stations to burst simultaneously.
  const burstRefs = useRef<Array<THREE.Mesh | null>>(
    new Array(stations.length).fill(null),
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const now = Date.now();

    // 1. Detect new bursts from sceneTimestamps (within BURST_WINDOW_MS).
    for (const [stationId, ts] of sceneTimestamps) {
      if (now - ts > BURST_WINDOW_MS) continue;
      const seen = seenTimestamps.current.get(stationId);
      if (seen === ts) continue;
      seenTimestamps.current.set(stationId, ts);
      activeBursts.current.push({ stationId, startTime: now });
    }

    // 2. Prune bursts older than BURST_DURATION_MS.
    activeBursts.current = activeBursts.current.filter(
      (b) => now - b.startTime <= BURST_DURATION_MS,
    );

    // 3. Drive ambient heartbeat positions/scales.
    for (const station of ambientStations) {
      const ref = ambientRefs.current.get(station.id);
      if (!ref) continue;
      // Reduced motion: freeze at mid-thread peak instead of animating.
      const phase = reducedMotion ? 0.5 : (t * 0.5 + station.seed) % 1;
      const [x, y, z] = lerp3(station.source, station.end, phase);
      ref.position.set(x, y, z);
      const size = Math.sin(phase * Math.PI) * AMBIENT_MAX_SIZE;
      ref.scale.setScalar(Math.max(0.0001, size / AMBIENT_MAX_SIZE));
    }

    // 4. Drive completion-burst positions/visibility.
    for (let i = 0; i < burstRefs.current.length; i++) {
      const mesh = burstRefs.current[i];
      if (!mesh) continue;
      const burst = activeBursts.current[i];
      if (!burst) {
        mesh.visible = false;
        continue;
      }
      const station = byId.get(burst.stationId);
      if (!station) {
        mesh.visible = false;
        continue;
      }
      const progress = Math.min(1, (now - burst.startTime) / BURST_DURATION_MS);
      const [x, y, z] = lerp3(station.source, station.end, progress);
      mesh.visible = true;
      mesh.position.set(x, y, z);
    }
  });

  return (
    <>
      {ambientStations.map((station) => (
        <mesh
          key={station.id}
          ref={(m) => {
            if (m) ambientRefs.current.set(station.id, m);
            else ambientRefs.current.delete(station.id);
          }}
          position={station.source}
        >
          <sphereGeometry args={[AMBIENT_MAX_SIZE, 12, 12]} />
          <meshBasicMaterial
            color={station.isOrchestrator ? ORCH_AMBIENT_COLOR : AMBIENT_COLOR}
            transparent
            opacity={0.95}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* Burst pool — hidden by default, claimed slot-by-slot in useFrame. */}
      {stations.map((station, i) => (
        <mesh
          key={`burst-${i}`}
          ref={(m) => {
            burstRefs.current[i] = m;
          }}
          visible={false}
        >
          <sphereGeometry args={[BURST_SIZE, 14, 14]} />
          <meshBasicMaterial
            color={BURST_COLOR}
            transparent
            opacity={1}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}
