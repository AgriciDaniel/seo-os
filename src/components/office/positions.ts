/**
 * SEO Office — 3D Cosmos · single source of truth for layout + roster.
 *
 * Every desk position, the orchestrator dais position, the brain chandelier
 * anchor, and every scene-specific color constant lives in this one file.
 * If you find yourself hardcoding a position in a per-station component,
 * lift it here instead.
 *
 * Spec: docs/design/2026-05-11-seo-office-design.md
 *       (and the 3D Cosmos spec given to the engineering agent)
 */

export const SPECIALISTS = [
  "technical",
  "content",
  "schema",
  "keywords",
  "strategy",
  "brand",
  "audit",
  "google",
  "backlinks",
  "clusters",
  "briefs",
  "compare",
  "drift",
  "commerce",
  "flow",
  "geo",
  "hreflang",
  "images",
  "imagery",
  "local",
  "maps",
  "page",
  "scale",
  "sitemap",
  "sxo",
  "stack",
] as const;
export type SpecialistId = (typeof SPECIALISTS)[number];

/**
 * Display labels for the canvas-rendered desk sprites. Keep these short —
 * they're rendered at ~1.7 world units wide.
 */
export const SPECIALIST_LABELS: Record<SpecialistId, string> = {
  technical: "Technical",
  content: "Content",
  schema: "Schema",
  keywords: "Keywords",
  strategy: "Strategy",
  brand: "Brand",
  audit: "Full Audit",
  google: "Google Suite",
  backlinks: "Backlinks",
  clusters: "Clusters",
  briefs: "Briefs",
  compare: "Compare",
  drift: "Drift",
  commerce: "Commerce",
  flow: "FLOW",
  geo: "GEO",
  hreflang: "Hreflang",
  images: "Image SEO",
  imagery: "Image Gen",
  local: "Local",
  maps: "Maps",
  page: "Page",
  scale: "Programmatic",
  sitemap: "Sitemap",
  sxo: "SXO",
  stack: "Tech Stack",
};

/**
 * Maps the scene's short specialist id (used by this layout) to the
 * orchestrator's actual registered specialist id. The SSE job stream
 * publishes the registered id; we need the short one to highlight the
 * matching desk. Unmapped registered ids are simply ignored.
 */
export const REGISTERED_TO_SCENE_ID: Record<string, SpecialistId> = {
  "technical-auditor": "technical",
  "content-strategist": "content",
  "schema-validator": "schema",
  "keyword-researcher": "keywords",
  "beast-planner": "strategy",
  "brand-strategist": "brand",
  "full-site-audit": "audit",
  "google-suite": "google",
  "backlink-analyst": "backlinks",
  "topic-clusterer": "clusters",
  "content-brief-generator": "briefs",
  "competitor-pages": "compare",
  "drift-monitor": "drift",
  "ecommerce-analyst": "commerce",
  "flow-framework": "flow",
  "geo-specialist": "geo",
  "hreflang-auditor": "hreflang",
  "image-auditor": "images",
  "image-generator": "imagery",
  "local-seo": "local",
  "maps-intelligence": "maps",
  "page-analyzer": "page",
  "programmatic-strategist": "scale",
  "sitemap-architect": "sitemap",
  "sxo-analyst": "sxo",
  "technical-deep-auditor": "stack",
  "google-search-console": "google",
  "google-analytics": "google",
  "vault-linter": "audit",
  "phase-gate": "strategy",
};

export function toSceneId(registeredId: string): SpecialistId | undefined {
  return REGISTERED_TO_SCENE_ID[registeredId];
}

/** Reverse of REGISTERED_TO_SCENE_ID — derived once at module load. Built
 *  from the canonical forward map so the two can't drift. */
const SCENE_TO_REGISTERED_ID: Partial<Record<SpecialistId, string>> = Object
  .entries(REGISTERED_TO_SCENE_ID)
  .reduce<Partial<Record<SpecialistId, string>>>((acc, [reg, scene]) => {
    acc[scene] ??= reg;
    return acc;
  }, {});

/** Scene id (e.g. "strategy") → registered orchestrator id (e.g. "beast-planner").
 *  Used when a user clicks a 3D desk and we need to set them as the chat
 *  target (the chat dropdown is keyed by registered id). */
export function toRegisteredId(sceneId: SpecialistId): string | undefined {
  return SCENE_TO_REGISTERED_ID[sceneId];
}

export function registeredIdsForScene(sceneId: SpecialistId): string[] {
  return Object.entries(REGISTERED_TO_SCENE_ID)
    .filter(([, scene]) => scene === sceneId)
    .map(([registered]) => registered);
}

/* -------------------------------------------------------------------------- */
/* layout — circular amphitheater                                              */
/* -------------------------------------------------------------------------- */
/* Three concentric rings around the orchestrator dais at origin. Roster is   */
/* filled inner ring first, so the earliest-defined specialists end up        */
/* closest to the boss (matches the active/idle distribution intent: inner    */
/* mostly active, middle mostly idle, outer mixed — emerges from the active   */
/* set being keyed by id, not position).                                      */

export const RINGS = [
  { radius: 6, count: 8 }, //  8 desks · closest to orchestrator
  { radius: 9, count: 9 }, //  9 desks · mid ring
  { radius: 12, count: 9 }, // 9 desks · outer ring
] as const;

/** Platform radius — must clear the outermost ring with margin for desk depth. */
export const PLATFORM_RADIUS = 14;

export interface DeskPosition {
  id: SpecialistId;
  position: [number, number, number];
  ringIndex: number;
  /** Y rotation so the desk's local -Z (avatar/chair facing direction) points
   *  at the origin. Derived from `Math.atan2(x, z)` per the design spec. */
  facing: number;
  /** Stable per-desk seed for animation phase offsets. */
  seed: number;
}

export function deskPositions(): DeskPosition[] {
  const out: DeskPosition[] = [];
  let idx = 0;
  for (let r = 0; r < RINGS.length; r++) {
    const ring = RINGS[r];
    // Phase-offset every other ring by half a step so desks don't line up
    // radially with the ring inside it — pure visual breathing room.
    const phase = r % 2 === 1 ? Math.PI / ring.count : 0;
    for (let i = 0; i < ring.count; i++) {
      const specialist = SPECIALISTS[idx];
      if (!specialist) break;
      const angle = (i / ring.count) * Math.PI * 2 + phase;
      const x = Math.cos(angle) * ring.radius;
      const z = Math.sin(angle) * ring.radius;
      out.push({
        id: specialist,
        position: [x, 0, z],
        ringIndex: r,
        facing: Math.atan2(x, z),
        seed: idx * 0.6180339887, // golden-ratio scatter
      });
      idx++;
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* fixed anchors                                                               */
/* -------------------------------------------------------------------------- */

/** Orchestrator dais at the center of the amphitheater. */
export const ORCHESTRATOR_POSITION: [number, number, number] = [0, 0.6, 0];
export const DAIS_TOP_Y = 0.6;
export const DAIS_RADIUS_TOP = 3.2;
export const DAIS_RADIUS_BOTTOM = 3.45;

/** Brain hangs straight up from the orchestrator — vertical alignment so the
 *  lamp cone falls straight down onto the dais. */
export const BRAIN_POSITION: [number, number, number] = [0, 14, 0];
export const BRAIN_SCALE = 3;
/** Effective radius of the brain at BRAIN_SCALE for thread endpoint projection. */
export const BRAIN_EFFECTIVE_RADIUS = 2.6;

/**
 * Where each thread starts on its station — at the *avatar's head*, so the
 * line visually emerges from the agent rather than from empty space above
 * the monitor. Computed from the station position:
 *
 *  - Specialist desks face origin via rotation.y = atan2(x, z). Their chair
 *    sits at local +Z = 1.0 inside the desk group, which in world space is
 *    1 unit *radially outward* from the desk position. The avatar head sits
 *    above that at world y ≈ 1.2. We start the thread at y = 1.4 — just
 *    above the head sphere's top so the line doesn't pierce the geometry.
 *
 *  - The orchestrator workstation is at origin (r ≈ 0). The bust head sits
 *    at world (0, ~1.91, -0.5) (after the orchestrator group's rotation π).
 *    Start the thread just above the head at (0, 2.1, -0.5).
 */
export function threadStart(stationPos: [number, number, number]): [number, number, number] {
  const [x, , z] = stationPos;
  const r = Math.sqrt(x * x + z * z);
  if (r < 0.01) {
    // Orchestrator special case — fixed position above the gold bust.
    return [0, 2.1, -0.5];
  }
  const ox = x / r;
  const oz = z / r;
  return [x + ox, 1.4, z + oz];
}

/**
 * Where each thread ends on the brain — project from the brain center toward
 * the source point and walk out BRAIN_EFFECTIVE_RADIUS.
 */
export function threadEnd(source: [number, number, number]): [number, number, number] {
  const [bx, by, bz] = BRAIN_POSITION;
  const dx = source[0] - bx;
  const dy = source[1] - by;
  const dz = source[2] - bz;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  const k = BRAIN_EFFECTIVE_RADIUS / len;
  return [bx + dx * k, by + dy * k, bz + dz * k];
}

/* -------------------------------------------------------------------------- */
/* scene-specific colors (not in the design system — keep them here)           */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* screen content types — one per specialist (always defined, even idle)       */
/* -------------------------------------------------------------------------- */

export type ScreenType =
  | "code"
  | "markdown"
  | "json"
  | "data"
  | "terminal"
  | "chart"
  | "dashboard"
  | "complete"
  | "off";

export const SCREEN_TYPE_BY_SPECIALIST: Record<SpecialistId, ScreenType> = {
  technical: "code",
  content: "markdown",
  schema: "json",
  keywords: "data",
  strategy: "markdown",
  brand: "markdown",

  audit: "terminal",
  google: "chart",
  backlinks: "chart",
  clusters: "data",
  briefs: "markdown",
  compare: "data",
  drift: "chart",

  commerce: "data",
  flow: "terminal",
  geo: "data",
  hreflang: "json",
  images: "terminal",
  imagery: "terminal",
  local: "data",

  maps: "data",
  page: "code",
  scale: "terminal",
  sitemap: "json",
  sxo: "markdown",
  stack: "code",
};

/* -------------------------------------------------------------------------- */
/* scene-specific colors                                                       */
/* -------------------------------------------------------------------------- */

export const SCENE_COLORS = {
  /** Warm gold accent for orchestrator trim. Different from --accent-gold
   *  which is reserved for primary CTAs. */
  orchestratorGold: "#c9a45b",
  /** Brain mesh rose. */
  brainRose: "#d97a8a",
  /** Brain wireframe. */
  brainWire: "#7a2030",
  /** Lamp cone + halo. */
  lampWarm: "#ffd6cc",
  /** Orchestrator spotlight. */
  spotlightWarm: "#fff0d8",
  /** Ambient pulse — specialist (bright lime). */
  pulseSpecialist: "#6effb1",
  /** Ambient pulse — orchestrator (warm yellow). */
  pulseOrchestrator: "#ffeaa3",
  /** Cool fill light. */
  coolFill: "#5b6cff",
  /** Hemisphere top. */
  hemiTop: "#3b3c52",
  /** Hemisphere ground. */
  hemiGround: "#0a0a10",
} as const;
