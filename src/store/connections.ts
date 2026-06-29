import { create } from "zustand";
import { ulid } from "ulid";

export type EdgeKind = "delegation" | "return" | "watch";

export interface Edge {
  id: string;
  fromKey: string; // identityKey of source window
  toKey: string; // identityKey of target window
  kind: EdgeKind;
  createdAt: number;
  lastActivityAt: number;
}

export interface PulseEvent {
  edgeId: string;
  direction: "forward" | "reverse";
  kind: "ok" | "err";
  bornAt: number;
}

interface State {
  edges: Edge[];
  /** Newest pulse — subscribers compare bornAt to dedupe (same pattern as
   *  specialistsStore.lastKnowledgeAdded from Phase 3). */
  lastPulse: PulseEvent | null;
  /** Idempotent: if an edge with the same fromKey+toKey+kind already exists,
   *  return its id and bump lastActivityAt instead of creating a duplicate. */
  ensureEdge: (fromKey: string, toKey: string, kind: EdgeKind) => string;
  pulse: (
    edgeId: string,
    direction: PulseEvent["direction"],
    kind: PulseEvent["kind"],
  ) => void;
  removeEdge: (id: string) => void;
  removeEdgesTouching: (identityKey: string) => void;
  pruneIdle: (maxAgeMs: number) => void;
  reset: () => void;
}

export const useConnectionsStore = create<State>((set, get) => ({
  edges: [],
  lastPulse: null,
  ensureEdge: (fromKey, toKey, kind) => {
    const existing = get().edges.find(
      (e) => e.fromKey === fromKey && e.toKey === toKey && e.kind === kind,
    );
    if (existing) {
      set((s) => ({
        edges: s.edges.map((e) =>
          e.id === existing.id ? { ...e, lastActivityAt: Date.now() } : e,
        ),
      }));
      return existing.id;
    }
    const id = ulid();
    const now = Date.now();
    set((s) => ({
      edges: [
        ...s.edges,
        { id, fromKey, toKey, kind, createdAt: now, lastActivityAt: now },
      ],
    }));
    return id;
  },
  pulse: (edgeId, direction, kind) =>
    set({ lastPulse: { edgeId, direction, kind, bornAt: performance.now() } }),
  removeEdge: (id) =>
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),
  removeEdgesTouching: (identityKey) =>
    set((s) => ({
      edges: s.edges.filter(
        (e) => e.fromKey !== identityKey && e.toKey !== identityKey,
      ),
    })),
  pruneIdle: (maxAgeMs) => {
    const cutoff = Date.now() - maxAgeMs;
    set((s) => ({ edges: s.edges.filter((e) => e.lastActivityAt > cutoff) }));
  },
  reset: () => set({ edges: [], lastPulse: null }),
}));
