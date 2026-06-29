"use client";

/**
 * BrainThreads — the data conduits running from each workstation up to the
 * brain's lower hemisphere.
 *
 * Implemented as up to THREE `<lineSegments>` objects (max three draw calls):
 *   1. Active specialist threads  — emerald, opacity 0.22
 *   2. Orchestrator thread        — gold,    opacity 0.45 (the boss gets his
 *                                            own color, matching the dais
 *                                            trim and the bust hologram)
 *   3. Hovered specialist thread  — emerald, opacity 0.14 (single idle desk
 *                                            under the cursor)
 *
 * Idle desks render NO thread at all. Hovering an idle desk fades it in as a
 * preview; clicking promotes that desk into the active set (via chatTarget →
 * activeSceneIds in OfficeScene), which moves the thread to the brighter
 * active buffer with pulse beams (see ThreadPulses).
 *
 * Spec: docs spec §4 ("Threads") + endpoint helpers in positions.ts.
 */

import { useMemo } from "react";
import {
  deskPositions,
  ORCHESTRATOR_POSITION,
  SCENE_COLORS,
  threadEnd,
  threadStart,
  type SpecialistId,
} from "./positions";

interface BrainThreadsProps {
  /** Scene-id keys (already mapped via `toSceneId`) plus "orchestrator". */
  activeSceneIds: Set<string>;
  /** The single desk currently under the pointer (null = none). When set,
   *  that desk's thread is rendered at a medium opacity so the user can
   *  preview the connection before clicking. */
  hoveredSceneId?: SpecialistId | null;
}

const SPECIALIST_COLOR = "#10b981";
const ACTIVE_OPACITY = 0.22;
const HOVERED_OPACITY = 0.14;
/** Bumped vs specialists' 0.22 because gold reads dimmer than emerald at
 *  the same luminance — this evens out their perceived presence. */
const ORCH_OPACITY = 0.45;

interface Station {
  id: string;
  source: [number, number, number];
  end: [number, number, number];
}

/** Stable list of all 27 stations + their thread source/end points. */
function buildStations(): Station[] {
  const desks = deskPositions().map((d) => {
    const source = threadStart(d.position);
    return { id: d.id as string, source, end: threadEnd(source) };
  });
  const orchSource = threadStart(ORCHESTRATOR_POSITION);
  return [
    ...desks,
    { id: "orchestrator", source: orchSource, end: threadEnd(orchSource) },
  ];
}

function pushSegment(buf: number[], s: Station): void {
  buf.push(s.source[0], s.source[1], s.source[2], s.end[0], s.end[1], s.end[2]);
}

export function BrainThreads({ activeSceneIds, hoveredSceneId }: BrainThreadsProps) {
  // Stations are layout-stable — compute once.
  const stations = useMemo(() => buildStations(), []);

  // Three Float32 buffers: orchestrator gold, specialist active emerald,
  // specialist hovered emerald. Idle desks contribute nothing.
  const { activePositions, orchPositions, hoveredPositions } = useMemo(() => {
    const activeArr: number[] = [];
    const orchArr: number[] = [];
    const hoveredArr: number[] = [];
    for (const s of stations) {
      if (s.id === "orchestrator") {
        // Always rendered, always gold — independent of activeSceneIds.
        pushSegment(orchArr, s);
        continue;
      }
      if (activeSceneIds.has(s.id)) {
        pushSegment(activeArr, s);
        continue;
      }
      if (hoveredSceneId && s.id === hoveredSceneId) {
        pushSegment(hoveredArr, s);
      }
      // else: idle, render nothing.
    }
    return {
      activePositions: new Float32Array(activeArr),
      orchPositions: new Float32Array(orchArr),
      hoveredPositions: new Float32Array(hoveredArr),
    };
  }, [stations, activeSceneIds, hoveredSceneId]);

  return (
    <>
      {activePositions.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[activePositions, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={SPECIALIST_COLOR}
            transparent
            opacity={ACTIVE_OPACITY}
          />
        </lineSegments>
      )}
      {orchPositions.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[orchPositions, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={SCENE_COLORS.orchestratorGold}
            transparent
            opacity={ORCH_OPACITY}
          />
        </lineSegments>
      )}
      {hoveredPositions.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[hoveredPositions, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color={SPECIALIST_COLOR}
            transparent
            opacity={HOVERED_OPACITY}
          />
        </lineSegments>
      )}
    </>
  );
}
