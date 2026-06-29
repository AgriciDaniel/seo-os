import { create } from "zustand";
import { ulid } from "ulid";

export type WindowKind =
  | "note"
  | "remote-desktop"
  | "chat"
  | "system"
  | "settings"
  | "task-feed";

export interface WindowSpec {
  id: string;
  kind: WindowKind;
  title: string;
  icon: string;
  contentProps: unknown;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  originRect?: { left: number; top: number; width: number; height: number };
  /** Optional dedup key — `open()` with a matching key focuses and restores
   *  the existing window instead of spawning a duplicate. Use values like
   *  `chat:orchestrator` or `remote-desktop:technical-auditor`. */
  identityKey?: string;
}

interface OpenInput {
  kind: WindowKind;
  title: string;
  icon: string;
  contentProps: unknown;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  originRect?: WindowSpec["originRect"];
  identityKey?: string;
}

const CASCADE_OFFSET = 32;
/**
 * Width of the persistent right-hand sidebar (Files · Vault + Recent panel).
 * Windows must never spawn over it because the sidebar lives BELOW the
 * window portal layer in z-order, so any overlapping window's pointer-events
 * shadow blocks clicks on file rows. The sidebar is currently a fixed
 * 340px in OfficeWorkspace.tsx; keep this value in sync.
 */
export const OFFICE_SIDEBAR_W = 340;

/**
 * Default cascade origin — biased toward the right edge of the available
 * canvas (i.e. just LEFT of the sidebar). This keeps the 3D office visible
 * on the far-left where the user clicks desks AND leaves the Files sidebar
 * clickable on the far-right.
 */
function cascadeOriginX(defaultW: number): number {
  if (typeof window === "undefined") return 360;
  return Math.max(80, window.innerWidth - OFFICE_SIDEBAR_W - defaultW - 24);
}
/**
 * The SweepCard / NextAction card occupies the top-right slot ~y=60-220.
 * Anchor the cascade BELOW that band so a default-positioned window doesn't
 * shadow the sweep controls.
 */
const CASCADE_ORIGIN_Y = 220;
const DEFAULT_W = 720;
const DEFAULT_H = 560;

interface State {
  windows: WindowSpec[];
  maxZ: number;
  open: (input: OpenInput) => string;
  close: (id: string) => void;
  closeAll: () => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
  toggleMaximize: (id: string) => void;
  focus: (id: string) => void;
  setPosition: (id: string, x: number, y: number) => void;
  setSize: (id: string, w: number, h: number) => void;
}

export const useWindowStore = create<State>((set, get) => ({
  windows: [],
  maxZ: 10,
  open: (input) => {
    // Dedup: if a window with the same identityKey is already open,
    // refresh its contentProps, restore-if-minimized, and focus it
    // instead of spawning a duplicate.
    if (input.identityKey) {
      const existing = get().windows.find(
        (w) => w.identityKey === input.identityKey,
      );
      if (existing) {
        const z = get().maxZ + 1;
        set((s) => ({
          windows: s.windows.map((w) =>
            w.id === existing.id
              ? {
                  ...w,
                  contentProps: input.contentProps,
                  minimized: false,
                  z,
                }
              : w,
          ),
          maxZ: z,
        }));
        return existing.id;
      }
    }
    const id = ulid();
    const z = get().maxZ + 1;
    // Auto-cascade — if caller didn't pin x/y, stagger off the last
    // non-minimized window so successive opens don't pile on top. Default
    // anchor is the right-hand side of the viewport so the 3D office canvas
    // on the left stays clickable.
    const w = input.w ?? DEFAULT_W;
    const h = input.h ?? DEFAULT_H;
    const visible = get().windows.filter((w) => !w.minimized);
    const last = visible[visible.length - 1];
    const originX = cascadeOriginX(w);
    let cascadeX = last
      ? Math.max(80, Math.min(last.x - CASCADE_OFFSET, originX))
      : originX;
    let cascadeY = last
      ? Math.min(last.y + CASCADE_OFFSET, CASCADE_ORIGIN_Y + CASCADE_OFFSET * 6)
      : CASCADE_ORIGIN_Y;
    // No-overlap pass — delegated to the shared helper so open-time and
    // drop-time both go through the same logic.
    if (input.x == null && input.y == null) {
      const safe = findNonOverlappingPosition(get().windows, cascadeX, cascadeY, w);
      cascadeX = safe.x;
      cascadeY = safe.y;
    }
    const spec: WindowSpec = {
      id,
      kind: input.kind,
      title: input.title,
      icon: input.icon,
      contentProps: input.contentProps,
      x: input.x ?? cascadeX,
      y: input.y ?? cascadeY,
      w,
      h,
      z,
      minimized: false,
      maximized: false,
      originRect: input.originRect,
      identityKey: input.identityKey,
    };
    set((s) => ({ windows: [...s.windows, spec], maxZ: z }));
    return id;
  },
  close: (id) => {
    const win = get().windows.find((w) => w.id === id);
    set((s) => ({ windows: s.windows.filter((w) => w.id !== id) }));
    if (win?.identityKey) {
      // Static import is safe: connections.ts only imports zustand, no cycle.
      import("./connections").then(({ useConnectionsStore }) => {
        useConnectionsStore.getState().removeEdgesTouching(win.identityKey!);
      });
    }
  },
  closeAll: () => set({ windows: [], maxZ: 10 }),
  minimize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, minimized: true } : w,
      ),
    })),
  restore: (id) => {
    const z = get().maxZ + 1;
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, minimized: false, z } : w,
      ),
      maxZ: z,
    }));
  },
  toggleMaximize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, maximized: !w.maximized } : w,
      ),
    })),
  focus: (id) => {
    const z = get().maxZ + 1;
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, z } : w)),
      maxZ: z,
    }));
  },
  setPosition: (id, x, y) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)),
    })),
  setSize: (id, w, h) =>
    set((s) => ({
      windows: s.windows.map((win) =>
        win.id === id ? { ...win, w, h } : win,
      ),
    })),
}));

/**
 * Find a position near (x, y) that doesn't overlap any other visible
 * window's title-bar strip. Used by open() (cascade-time) AND by Window's
 * endDrag (drop-time) so dragging on top of another window still produces
 * a non-overlapping final position. Pass `excludeId` so a window dragging
 * on top of nothing-but-itself doesn't shift.
 */
export function findNonOverlappingPosition(
  windows: WindowSpec[],
  x: number,
  y: number,
  w: number,
  excludeId?: string,
): { x: number; y: number } {
  const visible = windows.filter((w) => !w.minimized && w.id !== excludeId);
  const overlap = (cx: number, cy: number) =>
    visible.some((win) => {
      const ax1 = cx, ay1 = cy, ax2 = cx + w, ay2 = cy + 40;
      const bx1 = win.x, by1 = win.y, bx2 = win.x + win.w, by2 = win.y + 40;
      return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
    });
  let cx = x;
  let cy = y;
  let hops = 0;
  while (overlap(cx, cy) && hops < 12) {
    cx = Math.max(80, cx - CASCADE_OFFSET);
    cy = cy + CASCADE_OFFSET;
    hops += 1;
  }
  return { x: cx, y: cy };
}

/**
 * Dev-only handle so Playwright (and devtools console) can drive the
 * window system without going through React components. Production
 * builds skip this assignment.
 */
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __seoOfficeWindows?: typeof useWindowStore }).__seoOfficeWindows =
    useWindowStore;
}
