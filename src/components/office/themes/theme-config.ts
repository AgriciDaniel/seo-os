/**
 * Theme configuration for the SEO Office 3D scene background.
 *
 * Each theme defines:
 * - A CSS background gradient (drawn behind the WebGL canvas)
 * - Hemisphere + key + cool directional light settings
 * - Scene fog color and falloff distances
 * - A particle layer (animated ambient elements)
 * - A horizon set (distant static objects framing the scene)
 *
 * To add a new theme: add a key to the registry, declare its config,
 * implement the particle and horizon builders, and register them in
 * ThemeBackground.tsx.
 */

export type ParticleKind =
  | 'stars'
  | 'clouds'
  | 'fireflies'
  | 'dust'
  | 'plankton'
  | 'none';

export type HorizonKind =
  | 'forest'
  | 'servers'
  | 'mountains'
  | 'seafloor'
  | 'none';

export interface ThemeConfig {
  /** Human-readable name shown in the theme picker. */
  label: string;
  /** CSS gradient string applied to the WebGL stage container. */
  bgGradient: string;
  /** Hemisphere light: sky-side color. */
  hemiTop: number;
  /** Hemisphere light: ground-side color. */
  hemiBot: number;
  /** Hemisphere light intensity. */
  hemiInt: number;
  /** Scene fog color (Three.js Fog, linear falloff). */
  fogColor: number;
  /** Distance at which fog begins. */
  fogNear: number;
  /** Distance at which fog reaches full saturation. */
  fogFar: number;
  /** Warm/key directional light color. */
  keyColor: number;
  /** Warm/key directional light intensity. */
  keyInt: number;
  /** Cool/fill directional light color. */
  coolColor: number;
  /** Cool/fill directional light intensity. */
  coolInt: number;
  /** Which particle layer to render. */
  particleType: ParticleKind;
  /** Which horizon set to render. */
  horizonType: HorizonKind;
  /**
   * Optional override color for dust particles. Only consulted when
   * particleType === 'dust'. Defaults to a neutral cool gray.
   */
  dustColor?: number;

  /** OS chrome tokens — every color, font, radius in the OS shell flows
   *  from here via CSS custom properties. Zero hardcoded hex outside
   *  this file in the entire OS chrome layer. */
  chrome: {
    fontUi: string;
    fontMono: string;
    fg: string;
    fgMuted: string;
    fgFaint: string;
    accent: string;
    accentSoft: string;
    accentFg: string;
    ok: string;
    err: string;
    ribbon: string;
    chromeBg: string;
    chromeBorder: string;
    panelBg: string;
    panelBgSoft: string;
    panelRadius: string;
    windowBorder: string;
    windowRadius: string;
    windowShadow: string;
    titlebarBg: string;
    rowHover: string;
    rowSelected: string;
    inputBg: string;
    inputRadius: string;
    codeBg: string;
    btnRadius: string;
    tlClose: string;
    tlMin: string;
    tlMax: string;
    tlDefault: string;
    monitorBg: string;
    monitorFg: string;
    monitorFgDim: string;
    monitorBorder: string;
    monitorRadius: string;
    monitorGlow: string;
    monitorGlowRunning: string;
    monitorGlowRunningStrong: string;
    monitorBorderRunning: string;
    monitorScan: string;
  };
}

export type ThemeName =
  | 'cosmos'
  | 'clouds'
  | 'forest'
  | 'datacenter'
  | 'sunset'
  | 'ocean'
  | 'retro';

export const THEMES: Record<ThemeName, ThemeConfig> = {
  cosmos: {
    label: 'Cosmos',
    bgGradient: 'radial-gradient(ellipse at center, #0a0a1a 0%, #04050a 70%)',
    hemiTop: 0x3b3c52,
    hemiBot: 0x0a0a10,
    hemiInt: 0.4,
    fogColor: 0x04050a,
    fogNear: 60,
    fogFar: 200,
    keyColor: 0xfafaf5,
    keyInt: 0.7,
    coolColor: 0x5b6cff,
    coolInt: 0.22,
    particleType: 'stars',
    horizonType: 'none',
    chrome: {
      fontUi: "'Inter', system-ui, -apple-system, sans-serif",
      fontMono: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, 'Consolas', monospace",
      fg: "#e6e8ec",
      fgMuted: "#9aa0aa",
      fgFaint: "#5a6068",
      accent: "#f5c842",
      accentSoft: "rgba(245,200,66,0.4)",
      accentFg: "#0b0d10",
      ok: "#5fd99a",
      err: "#ff6b6b",
      ribbon: "#f5c842",
      chromeBg: "rgba(6,8,14,0.92)",
      chromeBorder: "rgba(245,200,66,0.10)",
      panelBg: "rgba(12,16,22,0.92)",
      panelBgSoft: "rgba(245,200,66,0.05)",
      panelRadius: "8px",
      windowBorder: "rgba(245,200,66,0.20)",
      windowRadius: "8px",
      windowShadow: "0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(245,200,66,0.04), 0 0 32px rgba(91,108,255,0.04)",
      titlebarBg: "rgba(245,200,66,0.04)",
      rowHover: "rgba(245,200,66,0.05)",
      rowSelected: "rgba(245,200,66,0.10)",
      inputBg: "rgba(0,0,0,0.4)",
      inputRadius: "4px",
      codeBg: "rgba(245,200,66,0.08)",
      btnRadius: "4px",
      tlClose: "#ff6b6b",
      tlMin: "#f5c842",
      tlMax: "#5fd99a",
      tlDefault: "rgba(120,128,140,0.5)",
      monitorBg: "#0a0d12",
      monitorFg: "#f5c842",
      monitorFgDim: "rgba(245,200,66,0.22)",
      monitorBorder: "rgba(245,200,66,0.32)",
      monitorRadius: "2px",
      monitorGlow: "inset 0 0 8px rgba(0,0,0,0.8), 0 0 6px rgba(245,200,66,0.06)",
      monitorGlowRunning: "inset 0 0 12px rgba(245,200,66,0.32), 0 0 14px rgba(245,200,66,0.5)",
      monitorGlowRunningStrong: "inset 0 0 14px rgba(245,200,66,0.42), 0 0 22px rgba(245,200,66,0.7)",
      monitorBorderRunning: "rgba(245,200,66,0.75)",
      monitorScan: "rgba(245,200,66,0.05)",
    },
  },
  clouds: {
    // Re-keyed toward a sunset golden-hour palette: muted plum at the top
    // fading through warm dusty rose to amber at the horizon. Reads as
    // "the sky at the end of the day" rather than the bright-daylight
    // pale blue the original was tuned for, which clashed with the dark
    // office furniture and washed out the gold orchestrator trim.
    label: 'Clouds',
    bgGradient:
      'linear-gradient(to bottom, #2e2030 0%, #5a3a44 30%, #8a5258 55%, #b87264 78%, #d09578 100%)',
    hemiTop: 0x8a5258,
    hemiBot: 0x2a1a28,
    hemiInt: 0.55,
    fogColor: 0x7a4248,
    fogNear: 45,
    fogFar: 170,
    keyColor: 0xffc090,
    keyInt: 0.8,
    coolColor: 0x60406a,
    coolInt: 0.28,
    particleType: 'clouds',
    horizonType: 'none',
    chrome: {
      fontUi: "'Inter', system-ui, -apple-system, sans-serif",
      fontMono: "'JetBrains Mono', ui-monospace, monospace",
      fg: "#fff5e8",
      fgMuted: "#d9b8a4",
      fgFaint: "#a08070",
      accent: "#ffc090",
      accentSoft: "rgba(255,192,144,0.45)",
      accentFg: "#2e1820",
      ok: "#b8d484",
      err: "#d97474",
      ribbon: "#ffd098",
      chromeBg: "rgba(54,32,42,0.85)",
      chromeBorder: "rgba(255,200,140,0.14)",
      panelBg: "rgba(50,30,38,0.92)",
      panelBgSoft: "rgba(255,200,140,0.07)",
      panelRadius: "9px",
      windowBorder: "rgba(255,200,140,0.22)",
      windowRadius: "9px",
      windowShadow: "0 24px 64px rgba(60,20,30,0.6), 0 0 0 1px rgba(255,200,140,0.05)",
      titlebarBg: "rgba(255,200,140,0.05)",
      rowHover: "rgba(255,200,140,0.06)",
      rowSelected: "rgba(255,200,140,0.12)",
      inputBg: "rgba(30,15,22,0.5)",
      inputRadius: "5px",
      codeBg: "rgba(255,200,140,0.1)",
      btnRadius: "5px",
      tlClose: "#d97474",
      tlMin: "#ffc090",
      tlMax: "#b8d484",
      tlDefault: "rgba(180,140,120,0.5)",
      monitorBg: "#2a1820",
      monitorFg: "#ffd098",
      monitorFgDim: "rgba(255,208,152,0.25)",
      monitorBorder: "rgba(255,200,140,0.32)",
      monitorRadius: "3px",
      monitorGlow: "inset 0 0 8px rgba(0,0,0,0.6), 0 0 6px rgba(255,200,140,0.08)",
      monitorGlowRunning: "inset 0 0 12px rgba(255,200,140,0.35), 0 0 14px rgba(255,200,140,0.55)",
      monitorGlowRunningStrong: "inset 0 0 14px rgba(255,200,140,0.5), 0 0 22px rgba(255,200,140,0.75)",
      monitorBorderRunning: "rgba(255,200,140,0.85)",
      monitorScan: "rgba(255,200,140,0.06)",
    },
  },
  forest: {
    label: 'Forest',
    bgGradient:
      'linear-gradient(to bottom, #1a2438 0%, #2a3a52 35%, #3a4a62 60%, #2a3a48 100%)',
    hemiTop: 0x4a5a78,
    hemiBot: 0x152028,
    hemiInt: 0.5,
    fogColor: 0x2a3a48,
    fogNear: 50,
    fogFar: 180,
    keyColor: 0xc8d4e8,
    keyInt: 0.5,
    coolColor: 0x4060a0,
    coolInt: 0.25,
    particleType: 'fireflies',
    horizonType: 'forest',
    chrome: {
      fontUi: "'Inter', system-ui, -apple-system, sans-serif",
      fontMono: "'JetBrains Mono', ui-monospace, monospace",
      fg: "#e2ecdc",
      fgMuted: "#9eb098",
      fgFaint: "#5a7060",
      accent: "#d4a050",
      accentSoft: "rgba(212,160,80,0.4)",
      accentFg: "#1a2030",
      ok: "#7eb89e",
      err: "#d97474",
      ribbon: "#d4a050",
      chromeBg: "rgba(20,30,48,0.90)",
      chromeBorder: "rgba(212,180,80,0.12)",
      panelBg: "rgba(22,32,48,0.92)",
      panelBgSoft: "rgba(212,180,80,0.06)",
      panelRadius: "8px",
      windowBorder: "rgba(212,180,80,0.22)",
      windowRadius: "8px",
      windowShadow: "0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(212,180,80,0.04)",
      titlebarBg: "rgba(212,180,80,0.05)",
      rowHover: "rgba(212,180,80,0.05)",
      rowSelected: "rgba(212,180,80,0.10)",
      inputBg: "rgba(12,18,28,0.5)",
      inputRadius: "4px",
      codeBg: "rgba(212,180,80,0.09)",
      btnRadius: "4px",
      tlClose: "#d97474",
      tlMin: "#d4a050",
      tlMax: "#7eb89e",
      tlDefault: "rgba(120,140,128,0.5)",
      monitorBg: "#1a2028",
      monitorFg: "#d4a050",
      monitorFgDim: "rgba(212,160,80,0.25)",
      monitorBorder: "rgba(212,160,80,0.32)",
      monitorRadius: "2px",
      monitorGlow: "inset 0 0 8px rgba(0,0,0,0.7), 0 0 6px rgba(212,160,80,0.06)",
      monitorGlowRunning: "inset 0 0 12px rgba(212,160,80,0.35), 0 0 14px rgba(212,160,80,0.5)",
      monitorGlowRunningStrong: "inset 0 0 14px rgba(212,160,80,0.5), 0 0 22px rgba(212,160,80,0.75)",
      monitorBorderRunning: "rgba(212,160,80,0.8)",
      monitorScan: "rgba(212,160,80,0.05)",
    },
  },
  datacenter: {
    label: 'Datacenter',
    bgGradient:
      'linear-gradient(to bottom, #0a1018 0%, #0e1822 50%, #0a1218 100%)',
    hemiTop: 0x2a4060,
    hemiBot: 0x080c14,
    hemiInt: 0.4,
    fogColor: 0x0a1218,
    fogNear: 45,
    fogFar: 170,
    keyColor: 0xc0d4e8,
    keyInt: 0.5,
    coolColor: 0x3060c0,
    coolInt: 0.35,
    particleType: 'dust',
    horizonType: 'servers',
    dustColor: 0x8aa8c8,
    chrome: {
      fontUi: "'JetBrains Mono', ui-monospace, monospace",
      fontMono: "'JetBrains Mono', ui-monospace, monospace",
      fg: "#d0dce8",
      fgMuted: "#8094a8",
      fgFaint: "#4a5868",
      accent: "#5a8fd4",
      accentSoft: "rgba(90,150,212,0.4)",
      accentFg: "#08101c",
      ok: "#5fc89a",
      err: "#ff6b6b",
      ribbon: "#5a8fd4",
      chromeBg: "rgba(8,12,18,0.96)",
      chromeBorder: "rgba(90,150,212,0.14)",
      panelBg: "rgba(10,16,24,0.94)",
      panelBgSoft: "rgba(90,150,212,0.06)",
      panelRadius: "4px",
      windowBorder: "rgba(90,150,212,0.25)",
      windowRadius: "4px",
      windowShadow: "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(90,150,212,0.05)",
      titlebarBg: "rgba(90,150,212,0.04)",
      rowHover: "rgba(90,150,212,0.06)",
      rowSelected: "rgba(90,150,212,0.12)",
      inputBg: "rgba(0,0,0,0.5)",
      inputRadius: "2px",
      codeBg: "rgba(90,150,212,0.10)",
      btnRadius: "2px",
      tlClose: "#ff6b6b",
      tlMin: "#5a8fd4",
      tlMax: "#5fc89a",
      tlDefault: "rgba(80,100,128,0.5)",
      monitorBg: "#050810",
      monitorFg: "#5a8fd4",
      monitorFgDim: "rgba(90,150,212,0.25)",
      monitorBorder: "rgba(90,150,212,0.4)",
      monitorRadius: "1px",
      monitorGlow: "inset 0 0 8px rgba(0,0,0,0.9), 0 0 6px rgba(90,150,212,0.08)",
      monitorGlowRunning: "inset 0 0 12px rgba(90,150,212,0.4), 0 0 14px rgba(90,150,212,0.55)",
      monitorGlowRunningStrong: "inset 0 0 14px rgba(90,150,212,0.55), 0 0 22px rgba(90,150,212,0.8)",
      monitorBorderRunning: "rgba(90,150,212,0.85)",
      monitorScan: "rgba(90,150,212,0.06)",
    },
  },
  sunset: {
    label: 'Sunset',
    bgGradient:
      'linear-gradient(to bottom, #2a1a3a 0%, #6a3a48 25%, #c87060 50%, #e8a878 70%, #f0c898 100%)',
    hemiTop: 0xf0a878,
    hemiBot: 0x4a1a30,
    hemiInt: 0.7,
    fogColor: 0xc87060,
    fogNear: 50,
    fogFar: 180,
    keyColor: 0xffd498,
    keyInt: 1.0,
    coolColor: 0x804060,
    coolInt: 0.3,
    particleType: 'dust',
    horizonType: 'mountains',
    dustColor: 0xffd49c,
    chrome: {
      fontUi: "'Inter', system-ui, -apple-system, sans-serif",
      fontMono: "'JetBrains Mono', ui-monospace, monospace",
      fg: "#fff5e0",
      fgMuted: "#d9bca0",
      fgFaint: "#a07060",
      accent: "#ffd498",
      accentSoft: "rgba(255,212,152,0.5)",
      accentFg: "#2a1a30",
      ok: "#88c884",
      err: "#ff7868",
      ribbon: "#ffd498",
      chromeBg: "rgba(40,20,40,0.78)",
      chromeBorder: "rgba(255,212,152,0.18)",
      panelBg: "rgba(45,22,32,0.85)",
      panelBgSoft: "rgba(255,212,152,0.08)",
      panelRadius: "10px",
      windowBorder: "rgba(255,212,152,0.28)",
      windowRadius: "11px",
      windowShadow: "0 24px 64px rgba(60,20,30,0.55), 0 0 0 1px rgba(255,212,152,0.06)",
      titlebarBg: "rgba(255,212,152,0.06)",
      rowHover: "rgba(255,212,152,0.07)",
      rowSelected: "rgba(255,212,152,0.14)",
      inputBg: "rgba(25,12,20,0.55)",
      inputRadius: "6px",
      codeBg: "rgba(255,212,152,0.12)",
      btnRadius: "6px",
      tlClose: "#ff7868",
      tlMin: "#ffd498",
      tlMax: "#88c884",
      tlDefault: "rgba(180,140,120,0.5)",
      monitorBg: "#2a1820",
      monitorFg: "#ffd498",
      monitorFgDim: "rgba(255,212,152,0.28)",
      monitorBorder: "rgba(255,212,152,0.4)",
      monitorRadius: "4px",
      monitorGlow: "inset 0 0 8px rgba(0,0,0,0.5), 0 0 6px rgba(255,212,152,0.1)",
      monitorGlowRunning: "inset 0 0 12px rgba(255,212,152,0.4), 0 0 14px rgba(255,212,152,0.6)",
      monitorGlowRunningStrong: "inset 0 0 14px rgba(255,212,152,0.55), 0 0 22px rgba(255,212,152,0.85)",
      monitorBorderRunning: "rgba(255,212,152,0.9)",
      monitorScan: "rgba(255,212,152,0.07)",
    },
  },
  ocean: {
    label: 'Ocean',
    bgGradient:
      'linear-gradient(to bottom, #082045 0%, #0a3068 25%, #0a2050 55%, #061028 85%, #030a18 100%)',
    hemiTop: 0x2068a8,
    hemiBot: 0x041028,
    hemiInt: 0.6,
    fogColor: 0x0a3060,
    fogNear: 32,
    fogFar: 140,
    keyColor: 0x90e0ff,
    keyInt: 0.55,
    coolColor: 0x1080b8,
    coolInt: 0.5,
    particleType: 'plankton',
    horizonType: 'seafloor',
    chrome: {
      fontUi: "'Inter', system-ui, -apple-system, sans-serif",
      fontMono: "'JetBrains Mono', ui-monospace, monospace",
      fg: "#d0e8f5",
      fgMuted: "#80b0c8",
      fgFaint: "#4870a0",
      accent: "#5fc8ff",
      accentSoft: "rgba(95,200,255,0.4)",
      accentFg: "#04102a",
      ok: "#5fd9ae",
      err: "#ff7878",
      ribbon: "#5fc8ff",
      chromeBg: "rgba(8,20,42,0.92)",
      chromeBorder: "rgba(95,200,255,0.14)",
      panelBg: "rgba(10,22,42,0.94)",
      panelBgSoft: "rgba(95,200,255,0.06)",
      panelRadius: "7px",
      windowBorder: "rgba(95,200,255,0.25)",
      windowRadius: "7px",
      windowShadow: "0 24px 64px rgba(0,10,30,0.7), 0 0 0 1px rgba(95,200,255,0.05)",
      titlebarBg: "rgba(95,200,255,0.04)",
      rowHover: "rgba(95,200,255,0.06)",
      rowSelected: "rgba(95,200,255,0.12)",
      inputBg: "rgba(2,8,20,0.55)",
      inputRadius: "4px",
      codeBg: "rgba(95,200,255,0.10)",
      btnRadius: "4px",
      tlClose: "#ff7878",
      tlMin: "#5fc8ff",
      tlMax: "#5fd9ae",
      tlDefault: "rgba(80,120,160,0.5)",
      monitorBg: "#040c1c",
      monitorFg: "#5fc8ff",
      monitorFgDim: "rgba(95,200,255,0.25)",
      monitorBorder: "rgba(95,200,255,0.4)",
      monitorRadius: "3px",
      monitorGlow: "inset 0 0 8px rgba(0,0,0,0.85), 0 0 6px rgba(95,200,255,0.08)",
      monitorGlowRunning: "inset 0 0 12px rgba(95,200,255,0.4), 0 0 14px rgba(95,200,255,0.6)",
      monitorGlowRunningStrong: "inset 0 0 14px rgba(95,200,255,0.55), 0 0 22px rgba(95,200,255,0.85)",
      monitorBorderRunning: "rgba(95,200,255,0.9)",
      monitorScan: "rgba(95,200,255,0.06)",
    },
  },
  retro: {
    label: 'Retro Terminal',
    bgGradient:
      'linear-gradient(to bottom, #1f1a13 0%, #2a201a 50%, #3a2e1f 100%)',
    hemiTop: 0x6a5232,
    hemiBot: 0x2a201a,
    hemiInt: 0.45,
    fogColor: 0x2a201a,
    fogNear: 50,
    fogFar: 170,
    keyColor: 0xffe089,
    keyInt: 0.75,
    coolColor: 0x6a5232,
    coolInt: 0.20,
    particleType: 'dust',
    horizonType: 'servers',
    dustColor: 0xf5c842,
    chrome: {
      fontUi: "'Courier New', 'IBM Plex Mono', ui-monospace, monospace",
      fontMono: "'Courier New', 'IBM Plex Mono', ui-monospace, monospace",
      fg: "#1f1a13",
      fgMuted: "#5a4520",
      fgFaint: "#8b7355",
      accent: "#b8924f",
      accentSoft: "rgba(184,146,79,0.45)",
      accentFg: "#ede4cf",
      ok: "#5a7a3e",
      err: "#a93838",
      ribbon: "#b8924f",
      chromeBg: "rgba(212,196,168,0.94)",
      chromeBorder: "rgba(90,69,32,0.42)",
      panelBg: "#ede4cf",
      panelBgSoft: "#d4c4a8",
      panelRadius: "0",
      windowBorder: "#5a4520",
      windowRadius: "0",
      windowShadow: "6px 6px 0 rgba(31,26,19,0.55), 0 0 0 1px #5a4520",
      titlebarBg: "#b8a984",
      rowHover: "#b8a984",
      rowSelected: "#8b7355",
      inputBg: "#ede4cf",
      inputRadius: "0",
      codeBg: "#d4c4a8",
      btnRadius: "0",
      tlClose: "#5a4520",
      tlMin: "#5a4520",
      tlMax: "#5a4520",
      tlDefault: "#5a4520",
      monitorBg: "#1a1408",
      monitorFg: "#f5c842",
      monitorFgDim: "rgba(245,200,66,0.22)",
      monitorBorder: "#8b7355",
      monitorRadius: "0",
      monitorGlow: "inset 0 0 8px rgba(0,0,0,0.75), 0 0 6px rgba(245,200,66,0.08)",
      monitorGlowRunning: "inset 0 0 12px rgba(245,200,66,0.40), 0 0 14px rgba(245,200,66,0.55)",
      monitorGlowRunningStrong: "inset 0 0 14px rgba(245,200,66,0.55), 0 0 22px rgba(245,200,66,0.85)",
      monitorBorderRunning: "#f5c842",
      monitorScan: "rgba(245,200,66,0.10)",
    },
  },
};

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];
