import { create } from "zustand";

export type SpecialistState = "idle" | "running" | "review" | "failed" | "skipped" | "blocked";
export type SpecialistStateInput = SpecialistState | "succeeded";

interface SpecialistEntry {
  state: SpecialistState;
  lastJobId?: string;
  lastMessage?: string;
  lastArtifactPath?: string;
  lastTransitionAt: number;
}

interface KnowledgeAdded {
  specialistId: string;
  artifactPath: string;
  at: number;
}

interface State {
  byId: Record<string, SpecialistEntry>;
  lastKnowledgeAdded: KnowledgeAdded | null;
  setState: (
    id: string,
    next: SpecialistStateInput,
    extra?: { jobId?: string; message?: string; artifactPath?: string },
  ) => void;
  reset: () => void;
}

export const useSpecialistsStore = create<State>((set, get) => ({
  byId: {},
  lastKnowledgeAdded: null,
  setState: (id, next, extra) => {
    const prev = get().byId[id]?.state;
    const isKnowledgeAdd =
      prev === "running" && next === "succeeded" && !!extra?.artifactPath;
    // Map "succeeded" → "review" (with artifact) or "idle" (without).
    const stored: SpecialistState =
      next === "succeeded" ? (extra?.artifactPath ? "review" : "idle") : next;
    const entry: SpecialistEntry = {
      state: stored,
      lastJobId: extra?.jobId,
      lastMessage: extra?.message,
      lastArtifactPath: extra?.artifactPath,
      lastTransitionAt: Date.now(),
    };
    set({
      byId: { ...get().byId, [id]: entry },
      lastKnowledgeAdded: isKnowledgeAdd
        ? { specialistId: id, artifactPath: extra!.artifactPath!, at: Date.now() }
        : get().lastKnowledgeAdded,
    });
  },
  reset: () => set({ byId: {}, lastKnowledgeAdded: null }),
}));
