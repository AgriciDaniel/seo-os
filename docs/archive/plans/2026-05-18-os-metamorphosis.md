# OS Metamorphosis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform SEO Office's 3D-office-with-tabbed-right-pane into a unified OS-desktop: 3D scene becomes the wallpaper, OS chrome (menu bar, dock, status bar, floating windows) grafts on top, Files app replaces VaultBrowser, every desk becomes a clickable workstation with live 4-state monitor, brain emits particles on knowledge transitions, all 7 themes drive both 3D scene AND OS chrome through a single CSS-variable-backed theme system.

**Architecture:** Six-phase build, each phase independently shippable. Phase 0 invisibly refactors hardcoded colors → CSS variables. Phase 1 builds the OS shell + window manager (drag/close/minimize/maximize). Phase 2 replaces VaultBrowser with FilesApp (quiet ribbon approval). Phase 3 wires desk-click → spawn-remote-desktop-window + 4-state monitors driven by existing SSE. Phase 4 connects specialist activity to brain via R3F particle emission. Phase 5 polish + retires dashboard route into a SystemApp window. **Backend untouched** — every API, every specialist, the Assignment envelope, build-brain sweep, chat narrator, SSE pipeline, SQLite index: zero changes.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript 5 · Tailwind v4 · React Three Fiber 9 · Zustand 5 · `@anthropic-ai/sdk` 0.95 · better-sqlite3 · pnpm. Plus one new dependency: **framer-motion** (~30KB) for window open/close/minimize animations.

**Design spec:** [`~/.claude/plans/oh-wow-are-you-jazzy-stroustrup.md`](file:///home/agricidaniel/.claude/plans/oh-wow-are-you-jazzy-stroustrup.md)

**Visual reference:** [`/tmp/seo-office-os-demo.html`](file:///tmp/seo-office-os-demo.html)

---

## File structure overview

```
src/
├── components/
│   ├── os/                         NEW — entire OS chrome layer
│   │   ├── Desktop.tsx             composes MenuBar + Workspace + StatusBar
│   │   ├── MenuBar.tsx             top bar + theme dropdown + notifications
│   │   ├── StatusBar.tsx           bottom bar — health/cost/cache/integr/sweep/review
│   │   ├── WindowManager.tsx       Portal layer, renders all open windows
│   │   ├── Window.tsx              single window — frame, traffic lights, drag, resize
│   │   ├── MinimizedTray.tsx       dock footer; chips that restore minimized windows
│   │   ├── FilesApp.tsx            Finder-style folder tree + file list (replaces VaultBrowser)
│   │   ├── NoteWindow.tsx          markdown viewer; reuses MarkdownBody
│   │   ├── RemoteDesktopWindow.tsx specialist Inbox + Files + Last output
│   │   └── SystemApp.tsx           manifest + integrations + sweeps (replaces /dashboard)
│   ├── office/
│   │   ├── themes/
│   │   │   ├── theme-config.ts     MODIFIED — extends ThemeConfig with chrome block, adds retro theme
│   │   │   └── theme-context.tsx   MODIFIED — useEffect mirrors chrome to CSS vars
│   │   ├── OfficeScene.tsx         MODIFIED — onDeskClick prop forwarded to Specialists
│   │   ├── Specialist.tsx          MODIFIED — onClick computes originRect, calls back
│   │   ├── Screen.tsx              MODIFIED — 4-state monitor renderer reading specialistsStore
│   │   ├── BrainChandelier.tsx     MODIFIED — particle emission on knowledge-added
│   │   └── StatusPill.tsx          MODIFIED — neutralize gold for needs-review
│   ├── ChatPanel.tsx               UNCHANGED — drops into dock as-is
│   ├── MarkdownBody.tsx            UNCHANGED — consumed by NoteWindow
│   ├── VaultBrowser.tsx            RETIRED in Phase 2
│   └── ThemePopover.tsx            RETIRED in Phase 1
├── app/office/
│   └── OfficeWorkspace.tsx         MODIFIED — switches to <Desktop> layout
├── app/dashboard/
│   └── page.tsx                    RETIRED in Phase 5
├── store/
│   ├── windows.ts                  NEW — Zustand window state
│   └── specialists.ts              NEW — Zustand per-specialist live state
└── hooks/
    └── useSpecialistsStream.ts     NEW — subscribes existing SSE to specialistsStore

```

---

## Phase 0 — Theme foundation (invisible refactor)

Goal: extend the existing theme system so each theme carries OS-chrome tokens. No visible UX change yet. Verify all 7 themes still render the 3D scene identically to today.

### Task 0.1: Extend ThemeConfig with chrome interface

**Files:**
- Modify: `src/components/office/themes/theme-config.ts:31-65`
- Test: `src/components/office/themes/__tests__/theme-config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/office/themes/__tests__/theme-config.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { THEMES, THEME_NAMES } from "../theme-config";

test("every theme defines a complete chrome block", () => {
  const requiredKeys = [
    "fontUi", "fontMono",
    "fg", "fgMuted", "fgFaint",
    "accent", "accentSoft", "accentFg",
    "ok", "err", "ribbon",
    "chromeBg", "chromeBorder",
    "panelBg", "panelBgSoft", "panelRadius",
    "windowBorder", "windowRadius", "windowShadow",
    "titlebarBg",
    "rowHover", "rowSelected",
    "inputBg", "inputRadius", "codeBg",
    "btnRadius",
    "tlClose", "tlMin", "tlMax", "tlDefault",
    "monitorBg", "monitorFg", "monitorFgDim",
    "monitorBorder", "monitorRadius",
    "monitorGlow", "monitorGlowRunning", "monitorGlowRunningStrong",
    "monitorBorderRunning", "monitorScan",
  ] as const;

  for (const name of THEME_NAMES) {
    const theme = THEMES[name];
    assert.ok(theme.chrome, `theme "${name}" missing chrome block`);
    for (const key of requiredKeys) {
      assert.ok(
        typeof theme.chrome[key as keyof typeof theme.chrome] === "string",
        `theme "${name}" missing chrome.${key}`,
      );
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/home/agricidaniel/Desktop/SEO Office" && pnpm test src/components/office/themes/__tests__/theme-config.test.ts
```

Expected: FAIL — `chrome` does not exist on type ThemeConfig.

- [ ] **Step 3: Extend ThemeConfig interface**

In `src/components/office/themes/theme-config.ts`, add to the `ThemeConfig` interface (after the existing `dustColor` field):

```ts
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
```

- [ ] **Step 4: Run typecheck to confirm interface error spreads to all 6 themes**

```bash
pnpm typecheck 2>&1 | head -30
```

Expected: 6 errors, one per theme, all saying `Property 'chrome' is missing`.

- [ ] **Step 5: Commit**

```bash
git add src/components/office/themes/theme-config.ts src/components/office/themes/__tests__/theme-config.test.ts
git commit -m "feat(themes): extend ThemeConfig with chrome token block

Adds a 40-field chrome block to ThemeConfig that will drive every
color/font/radius/glow in the OS shell via CSS custom properties.
All 6 existing themes will need this block populated (next tasks)."
```

---

### Task 0.2: Populate chrome block for the cosmos theme

**Files:**
- Modify: `src/components/office/themes/theme-config.ts` (cosmos entry, ~lines 76-91)

- [ ] **Step 1: Confirm the test still fails for cosmos**

```bash
pnpm test src/components/office/themes/__tests__/theme-config.test.ts 2>&1 | head -10
```

Expected: FAIL — `theme "cosmos" missing chrome block`.

- [ ] **Step 2: Add chrome block to cosmos**

Inside the `cosmos` theme object (after `horizonType: 'none'`):

```ts
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
```

- [ ] **Step 3: Run typecheck — cosmos should now pass, 5 themes still fail**

```bash
pnpm typecheck 2>&1 | grep -c "missing"
```

Expected: 5 (one for each of clouds, forest, datacenter, sunset, ocean).

- [ ] **Step 4: Commit**

```bash
git add src/components/office/themes/theme-config.ts
git commit -m "feat(themes): add cosmos chrome block

Cosmos uses gold #f5c842 as primary accent, dark cosmos-blue chrome,
8px window radius, Inter UI / JetBrains Mono code, diffuse shadow."
```

---

### Task 0.3: Populate chrome for clouds theme

**Files:**
- Modify: `src/components/office/themes/theme-config.ts` (clouds entry)

- [ ] **Step 1: Confirm clouds test fails**

```bash
pnpm typecheck 2>&1 | grep -A1 "clouds" | head -3
```

Expected: error referencing clouds + missing chrome.

- [ ] **Step 2: Add chrome block to clouds**

Inside the `clouds` theme object (after `horizonType: 'none'`):

```ts
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
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck 2>&1 | grep -c "missing"
```

Expected: 4 (forest, datacenter, sunset, ocean still missing).

- [ ] **Step 4: Commit**

```bash
git add src/components/office/themes/theme-config.ts
git commit -m "feat(themes): add clouds chrome block (warm peach golden-hour)"
```

---

### Task 0.4: Populate chrome for forest theme

**Files:**
- Modify: `src/components/office/themes/theme-config.ts` (forest entry)

- [ ] **Step 1: Add chrome block to forest**

```ts
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
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck 2>&1 | grep -c "missing"
```

Expected: 3.

- [ ] **Step 3: Commit**

```bash
git add src/components/office/themes/theme-config.ts
git commit -m "feat(themes): add forest chrome block (twilight + amber firefly accent)"
```

---

### Task 0.5: Populate chrome for datacenter theme

**Files:**
- Modify: `src/components/office/themes/theme-config.ts` (datacenter entry)

- [ ] **Step 1: Add chrome block to datacenter**

Note: this theme uses JetBrains Mono for the UI font too — it's the "most technical" theme and the monospace UI signals that.

```ts
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
```

- [ ] **Step 2: Commit**

```bash
pnpm typecheck 2>&1 | grep -c "missing"  # expect 2
git add src/components/office/themes/theme-config.ts
git commit -m "feat(themes): add datacenter chrome block (cyan NOC, mono UI, blocky)"
```

---

### Task 0.6: Populate chrome for sunset theme

**Files:**
- Modify: `src/components/office/themes/theme-config.ts` (sunset entry)

- [ ] **Step 1: Add chrome block to sunset**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/office/themes/theme-config.ts
git commit -m "feat(themes): add sunset chrome block (vivid warm peach, soft radii)"
```

---

### Task 0.7: Populate chrome for ocean theme

**Files:**
- Modify: `src/components/office/themes/theme-config.ts` (ocean entry)

- [ ] **Step 1: Add chrome block to ocean**

```ts
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
```

- [ ] **Step 2: Run all tests + commit**

```bash
pnpm test src/components/office/themes/__tests__/theme-config.test.ts
git add src/components/office/themes/theme-config.ts
git commit -m "feat(themes): add ocean chrome block (cyan underwater)"
```

Expected: 6 existing themes now have chrome. Test still fails because retro doesn't exist yet.

---

### Task 0.8: Add `retro` theme (7th theme, user favourite)

**Files:**
- Modify: `src/components/office/themes/theme-config.ts` — extend `ThemeName` union, add `retro` to `THEMES`

- [ ] **Step 1: Extend ThemeName union**

In `theme-config.ts`, find the `ThemeName` type and add `'retro'`:

```ts
export type ThemeName =
  | 'cosmos'
  | 'clouds'
  | 'forest'
  | 'datacenter'
  | 'sunset'
  | 'ocean'
  | 'retro';
```

- [ ] **Step 2: Add the retro entry to THEMES**

Inside the `THEMES` record (after `ocean`), add:

```ts
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
```

- [ ] **Step 3: Run tests**

```bash
pnpm test src/components/office/themes/__tests__/theme-config.test.ts
pnpm typecheck
```

Expected: ALL PASS. All 7 themes have a complete chrome block.

- [ ] **Step 4: Commit**

```bash
git add src/components/office/themes/theme-config.ts
git commit -m "feat(themes): add retro terminal as 7th theme

Beige industrial chrome + Courier mono + amber CRT monitors + zero
radius (blocky) + hard offset shadow. Uses existing 'dust' particle
renderer with #f5c842 golden motes and 'servers' horizon."
```

---

### Task 0.9: Mirror chrome tokens into CSS custom properties

**Files:**
- Create: `src/components/office/themes/apply-chrome.ts`
- Test: `src/components/office/themes/__tests__/apply-chrome.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/office/themes/__tests__/apply-chrome.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { applyChromeTokens, chromePropertyMap } from "../apply-chrome";
import { THEMES } from "../theme-config";

test("chromePropertyMap maps every ThemeConfig.chrome field to a CSS variable", () => {
  const cosmos = THEMES.cosmos.chrome;
  const keys = Object.keys(cosmos);
  for (const k of keys) {
    const cssVar = chromePropertyMap[k as keyof typeof cosmos];
    assert.ok(cssVar, `no CSS variable mapped for chrome.${k}`);
    assert.ok(
      cssVar.startsWith("--"),
      `CSS variable for ${k} must start with "--", got "${cssVar}"`,
    );
  }
});

test("applyChromeTokens writes every CSS variable to a fake style object", () => {
  const fake: Record<string, string> = {};
  const setProperty = (k: string, v: string) => { fake[k] = v; };
  applyChromeTokens(THEMES.cosmos.chrome, { setProperty } as unknown as CSSStyleDeclaration);
  assert.equal(fake["--accent"], "#f5c842");
  assert.equal(fake["--fg"], "#e6e8ec");
  assert.equal(fake["--window-radius"], "8px");
  assert.equal(fake["--tl-close"], "#ff6b6b");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/components/office/themes/__tests__/apply-chrome.test.ts
```

Expected: FAIL — module `../apply-chrome` does not exist.

- [ ] **Step 3: Create the apply-chrome module**

Create `src/components/office/themes/apply-chrome.ts`:

```ts
import "server-only" /* assertion: this module is also imported by client
  components but only the function body, not server-only — keep as plain
  module. The string above triggers Next to flag misuse; remove if needed. */;
// NOTE: remove the `server-only` import above if the lint passes without it
// in client-side imports. The mapping itself is pure data + a pure function.

import type { ThemeConfig } from "./theme-config";

type Chrome = ThemeConfig["chrome"];

/** Map from ThemeConfig.chrome fields to their CSS custom property names.
 *  CSS variables follow kebab-case convention; chrome fields use camelCase. */
export const chromePropertyMap: Record<keyof Chrome, string> = {
  fontUi: "--font-ui",
  fontMono: "--font-mono",
  fg: "--fg",
  fgMuted: "--fg-muted",
  fgFaint: "--fg-faint",
  accent: "--accent",
  accentSoft: "--accent-soft",
  accentFg: "--accent-fg",
  ok: "--ok",
  err: "--err",
  ribbon: "--ribbon",
  chromeBg: "--chrome-bg",
  chromeBorder: "--chrome-border",
  panelBg: "--panel-bg",
  panelBgSoft: "--panel-bg-soft",
  panelRadius: "--panel-radius",
  windowBorder: "--window-border",
  windowRadius: "--window-radius",
  windowShadow: "--window-shadow",
  titlebarBg: "--titlebar-bg",
  rowHover: "--row-hover",
  rowSelected: "--row-selected",
  inputBg: "--input-bg",
  inputRadius: "--input-radius",
  codeBg: "--code-bg",
  btnRadius: "--btn-radius",
  tlClose: "--tl-close",
  tlMin: "--tl-min",
  tlMax: "--tl-max",
  tlDefault: "--tl-default",
  monitorBg: "--monitor-bg",
  monitorFg: "--monitor-fg",
  monitorFgDim: "--monitor-fg-dim",
  monitorBorder: "--monitor-border",
  monitorRadius: "--monitor-radius",
  monitorGlow: "--monitor-glow",
  monitorGlowRunning: "--monitor-glow-running",
  monitorGlowRunningStrong: "--monitor-glow-running-strong",
  monitorBorderRunning: "--monitor-border-running",
  monitorScan: "--monitor-scan",
};

/** Write every chrome token onto the target style declaration as a CSS
 *  custom property. Caller usually passes `document.documentElement.style`. */
export function applyChromeTokens(
  chrome: Chrome,
  target: Pick<CSSStyleDeclaration, "setProperty">,
): void {
  for (const key of Object.keys(chromePropertyMap) as (keyof Chrome)[]) {
    target.setProperty(chromePropertyMap[key], chrome[key]);
  }
}
```

Note: remove the `import "server-only"` line if it causes import errors during the next typecheck — this module is shared between server and client.

- [ ] **Step 4: Run test**

```bash
pnpm test src/components/office/themes/__tests__/apply-chrome.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/office/themes/apply-chrome.ts src/components/office/themes/__tests__/apply-chrome.test.ts
git commit -m "feat(themes): apply-chrome utility maps tokens to CSS variables"
```

---

### Task 0.10: Wire applyChromeTokens into ThemeProvider

**Files:**
- Modify: `src/components/office/themes/theme-context.tsx` (~line 42)

- [ ] **Step 1: Read the current ThemeProvider**

```bash
grep -n "ThemeProvider" src/components/office/themes/theme-context.tsx | head -5
```

- [ ] **Step 2: Add useEffect that mirrors chrome to CSS vars**

In `src/components/office/themes/theme-context.tsx`, find the existing `useEffect` for localStorage hydration. Below it (still inside the `ThemeProvider` function), add a new effect:

```ts
  // Mirror chrome tokens to CSS custom properties on <html>. Triggered
  // on every theme change so OS-shell components reading var(--accent)
  // etc. re-skin immediately. SSR-safe via the typeof check.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const chrome = THEMES[theme].chrome;
    applyChromeTokens(chrome, document.documentElement.style);
  }, [theme]);
```

At the top of the file, add the import:

```ts
import { applyChromeTokens } from "./apply-chrome";
```

- [ ] **Step 3: Verify typecheck still passes**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Smoke test in dev server**

```bash
pnpm dev > /tmp/dev.log 2>&1 &
sleep 4
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/office
```

Open browser to `http://localhost:3000/office`, open DevTools, run in console:

```js
getComputedStyle(document.documentElement).getPropertyValue('--accent')
```

Expected: returns `#f5c842` (cosmos default) or whatever theme is active.

- [ ] **Step 5: Commit**

```bash
git add src/components/office/themes/theme-context.tsx
git commit -m "feat(themes): ThemeProvider mirrors chrome tokens to CSS variables

On every theme change, write the active theme's chrome block onto
document.documentElement.style as CSS custom properties. OS-shell
components consume via var(--accent) etc. — single source of truth."
```

---

### Phase 0 verification

```bash
pnpm typecheck
pnpm lint
pnpm test
```

All clean. Visit `http://localhost:3000/office` and cycle through all 7 themes via the existing ThemePopover (paint-palette icon, bottom-right). **Existing scene should look identical to before** — chrome tokens are written to CSS but nothing reads them yet. Confirm the 3D scene re-themes (this was already working).

Commit:

```bash
git commit --allow-empty -m "chore: Phase 0 complete — theme foundation in place"
```

---

## Phase 1 — OS shell + Window Manager

Goal: build the menu bar, status bar, window manager, and minimized tray. Replace the tab-toggle in OfficeWorkspace with a `<Desktop>` layout. The 3D office Canvas stays mounted; ChatPanel moves into the dock. VaultBrowser temporarily lives in the dock's Files slot (replaced in Phase 2).

### Task 1.1: Install framer-motion

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
cd "/home/agricidaniel/Desktop/SEO Office"
pnpm add framer-motion
```

- [ ] **Step 2: Verify version**

```bash
grep "framer-motion" package.json
```

Expected: an entry under `dependencies`.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add framer-motion for window open/close animations"
```

---

### Task 1.2: Build the window store

**Files:**
- Create: `src/store/windows.ts`
- Test: `src/store/__tests__/windows.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { useWindowStore } from "../windows";

test("opens a window with auto-incrementing z and unique id", () => {
  const s = useWindowStore.getState();
  s.closeAll();
  const id1 = s.open({ kind: "note", title: "a.md", icon: "📄", contentProps: {} });
  const id2 = s.open({ kind: "note", title: "b.md", icon: "📄", contentProps: {} });
  const ws = useWindowStore.getState().windows;
  assert.equal(ws.length, 2);
  assert.notEqual(id1, id2);
  assert.ok(ws[1].z > ws[0].z, "second window should be on top");
});

test("focus brings a window to front", () => {
  const s = useWindowStore.getState();
  s.closeAll();
  const a = s.open({ kind: "note", title: "a.md", icon: "📄", contentProps: {} });
  const b = s.open({ kind: "note", title: "b.md", icon: "📄", contentProps: {} });
  s.focus(a);
  const ws = useWindowStore.getState().windows;
  const aWin = ws.find(w => w.id === a)!;
  const bWin = ws.find(w => w.id === b)!;
  assert.ok(aWin.z > bWin.z);
});

test("minimize sets minimized=true; restore clears it", () => {
  const s = useWindowStore.getState();
  s.closeAll();
  const id = s.open({ kind: "note", title: "a.md", icon: "📄", contentProps: {} });
  s.minimize(id);
  assert.equal(useWindowStore.getState().windows[0].minimized, true);
  s.restore(id);
  assert.equal(useWindowStore.getState().windows[0].minimized, false);
});

test("close removes the window from the array", () => {
  const s = useWindowStore.getState();
  s.closeAll();
  const id = s.open({ kind: "note", title: "a.md", icon: "📄", contentProps: {} });
  s.close(id);
  assert.equal(useWindowStore.getState().windows.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/store/__tests__/windows.test.ts
```

Expected: FAIL — module `../windows` not found.

- [ ] **Step 3: Implement the store**

Create `src/store/windows.ts`:

```ts
import { create } from "zustand";
import { ulid } from "ulid";

export type WindowKind =
  | "note"
  | "remote-desktop"
  | "system"
  | "settings";

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
}

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
}

export const useWindowStore = create<State>((set, get) => ({
  windows: [],
  maxZ: 10,
  open: (input) => {
    const id = ulid();
    const z = get().maxZ + 1;
    const spec: WindowSpec = {
      id,
      kind: input.kind,
      title: input.title,
      icon: input.icon,
      contentProps: input.contentProps,
      x: input.x ?? 60,
      y: input.y ?? 60,
      w: input.w ?? 460,
      h: input.h ?? 360,
      z,
      minimized: false,
      maximized: false,
      originRect: input.originRect,
    };
    set((s) => ({ windows: [...s.windows, spec], maxZ: z }));
    return id;
  },
  close: (id) => set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),
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
      windows: s.windows.map((win) => (win.id === id ? { ...win, w, h } : win)),
    })),
}));
```

- [ ] **Step 4: Install ulid if not present**

```bash
pnpm add ulid
```

- [ ] **Step 5: Run test**

```bash
pnpm test src/store/__tests__/windows.test.ts
```

Expected: PASS (all 4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/store/windows.ts src/store/__tests__/windows.test.ts package.json pnpm-lock.yaml
git commit -m "feat(os): windowStore — open/close/minimize/restore/focus/maximize

Zustand store for the OS window manager. Auto-incrementing z-index,
ULID ids, position/size mutators for drag/resize."
```

---

### Task 1.3: Build the Window component (frame + traffic lights)

**Files:**
- Create: `src/components/os/Window.tsx`
- Test: `src/components/os/__tests__/Window.test.tsx` (skip — pure UI; manual visual check)

- [ ] **Step 1: Create the component**

Create `src/components/os/Window.tsx`:

```tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useWindowStore, type WindowSpec } from "@/store/windows";

interface WindowProps {
  spec: WindowSpec;
  children: ReactNode;
}

/** A single floating window. Frame + title bar (with traffic lights and
 *  drag handler) + children. Position/size driven by windowStore. */
export function Window({ spec, children }: WindowProps) {
  const close = useWindowStore((s) => s.close);
  const minimize = useWindowStore((s) => s.minimize);
  const toggleMaximize = useWindowStore((s) => s.toggleMaximize);
  const focus = useWindowStore((s) => s.focus);
  const setPosition = useWindowStore((s) => s.setPosition);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);

  if (spec.minimized) return null;

  const style: React.CSSProperties = spec.maximized
    ? { top: 8, left: 8, right: 8, bottom: 8, zIndex: spec.z }
    : { top: spec.y, left: spec.x, width: spec.w, zIndex: spec.z };

  function startDrag(e: React.PointerEvent) {
    if (spec.maximized) return;
    if ((e.target as HTMLElement).closest(".traffic-lights")) return;
    dragOffset.current = { x: e.clientX - spec.x, y: e.clientY - spec.y };
    focus(spec.id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function doDrag(e: React.PointerEvent) {
    if (!dragOffset.current) return;
    const nx = e.clientX - dragOffset.current.x;
    const ny = e.clientY - dragOffset.current.y;
    setPosition(spec.id, Math.max(0, nx), Math.max(0, ny));
  }
  function endDrag(e: React.PointerEvent) {
    dragOffset.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  return (
    <motion.div
      className="absolute overflow-hidden backdrop-blur-md"
      style={{
        ...style,
        background: "var(--window-bg)",
        border: "1px solid var(--window-border)",
        borderRadius: "var(--window-radius)",
        boxShadow: "var(--window-shadow)",
      }}
      onPointerDown={() => focus(spec.id)}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.6, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div
        className="flex items-center gap-2.5 px-3.5 py-2 cursor-move select-none"
        style={{
          background: "var(--titlebar-bg)",
          borderBottom: "1px solid var(--window-border)",
          fontFamily: "var(--font-ui)",
          fontSize: 11.5,
        }}
        onPointerDown={startDrag}
        onPointerMove={doDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="traffic-lights flex gap-1.5">
          <button
            aria-label="close"
            onClick={(e) => { e.stopPropagation(); close(spec.id); }}
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: "var(--tl-close)" }}
          />
          <button
            aria-label="minimize"
            onClick={(e) => { e.stopPropagation(); minimize(spec.id); }}
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: "var(--tl-min)" }}
          />
          <button
            aria-label="maximize"
            onClick={(e) => { e.stopPropagation(); toggleMaximize(spec.id); }}
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: "var(--tl-max)" }}
          />
        </div>
        <span className="flex items-center gap-2" style={{ color: "var(--fg)" }}>
          <span style={{ color: "var(--accent)" }}>{spec.icon}</span>
          {spec.title}
        </span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: spec.maximized ? "calc(100vh - 110px)" : 360 }}>
        {children}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/os/Window.tsx
git commit -m "feat(os): Window component with traffic lights, drag, framer animation

Reads position/size/z from windowStore; emits drag updates via
setPosition. Open/close animate scale 0.6→1 over 220ms via framer-motion.
Traffic-light clicks stopPropagation so they don't trigger drag-start."
```

---

### Task 1.4: Build the WindowManager Portal

**Files:**
- Create: `src/components/os/WindowManager.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useWindowStore } from "@/store/windows";
import { Window } from "./Window";
import { NoteWindow } from "./NoteWindow";
import { RemoteDesktopWindow } from "./RemoteDesktopWindow";
import { SystemApp } from "./SystemApp";

/** Renders all open windows into a fixed-position portal layer above the
 *  3D Canvas but below the menu bar. Body content varies per kind. */
export function WindowManager() {
  const windows = useWindowStore((s) => s.windows);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = document.createElement("div");
    el.id = "window-portal-layer";
    el.style.position = "absolute";
    el.style.inset = "0";
    el.style.pointerEvents = "none";
    el.style.zIndex = "30";
    const host = document.getElementById("os-workspace") ?? document.body;
    host.appendChild(el);
    setLayer(el);
    return () => { el.remove(); };
  }, []);

  if (!layer) return null;

  return createPortal(
    <AnimatePresence>
      {windows.map((spec) => (
        <div key={spec.id} style={{ pointerEvents: "auto" }}>
          <Window spec={spec}>
            {spec.kind === "note" && <NoteWindow {...(spec.contentProps as any)} />}
            {spec.kind === "remote-desktop" && <RemoteDesktopWindow {...(spec.contentProps as any)} />}
            {spec.kind === "system" && <SystemApp />}
          </Window>
        </div>
      ))}
    </AnimatePresence>,
    layer,
  );
}
```

- [ ] **Step 2: Create stub bodies (will flesh out in later tasks)**

Create `src/components/os/NoteWindow.tsx`:

```tsx
"use client";
export function NoteWindow({ path }: { path: string }) {
  return <div className="p-4" style={{ color: "var(--fg)" }}>Note: {path}</div>;
}
```

Create `src/components/os/RemoteDesktopWindow.tsx`:

```tsx
"use client";
export function RemoteDesktopWindow({ specialistId }: { specialistId: string }) {
  return <div className="p-4" style={{ color: "var(--fg)" }}>Specialist: {specialistId}</div>;
}
```

Create `src/components/os/SystemApp.tsx`:

```tsx
"use client";
export function SystemApp() {
  return <div className="p-4" style={{ color: "var(--fg)" }}>System</div>;
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/components/os/WindowManager.tsx src/components/os/NoteWindow.tsx src/components/os/RemoteDesktopWindow.tsx src/components/os/SystemApp.tsx
git commit -m "feat(os): WindowManager portal layer + stub window bodies

Portal targets #os-workspace; renders every open window with kind-
based body switch. Stub NoteWindow/RemoteDesktopWindow/SystemApp
fleshed out in later phases."
```

---

### Task 1.5: Build MenuBar with theme dropdown

**Files:**
- Create: `src/components/os/MenuBar.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { THEMES, THEME_NAMES, useTheme, type ThemeName } from "@/components/office/themes";

function themeSwatch(name: ThemeName): string {
  const g = THEMES[name].bgGradient;
  const m = g.match(/#[0-9a-fA-F]{6}/);
  return m ? m[0] : "#ffffff";
}

export function MenuBar({ clientName }: { clientName?: string }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className="flex items-center gap-4 px-4"
      style={{
        height: 38,
        background: "var(--chrome-bg)",
        borderBottom: "1px solid var(--chrome-border)",
        fontFamily: "var(--font-ui)",
      }}
    >
      <span style={{ color: "var(--accent)", fontSize: 13, fontWeight: 700, letterSpacing: "0.06em" }}>
        ◯ SEO OFFICE
      </span>
      <nav className="flex gap-5" style={{ fontSize: 11.5, color: "var(--fg-muted)" }}>
        <span style={{ color: "var(--fg)", borderBottom: "1px solid var(--accent)" }}>OFFICE</span>
        <a href="/setup">SETUP</a>
        {clientName && (
          <span className="inline-flex items-center gap-1.5" style={{ color: "var(--accent)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ok)" }} />
            {clientName}
          </span>
        )}
      </nav>
      <div ref={rootRef} className="ml-auto relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 px-2.5 py-1"
          style={{
            background: "var(--panel-bg-soft)",
            border: "1px solid var(--chrome-border)",
            borderRadius: "var(--btn-radius)",
            color: "var(--fg)",
            fontSize: 11,
          }}
        >
          <span style={{ width: 14, height: 14, background: themeSwatch(theme), borderRadius: 3, display: "inline-block" }} />
          <span>{THEMES[theme].label}</span>
          <span style={{ fontSize: 9, color: "var(--fg-faint)" }}>▾</span>
        </button>
        {open && (
          <div
            className="absolute right-0 top-[110%] z-[100] min-w-[220px] p-1.5"
            style={{
              background: "var(--panel-bg)",
              border: "1px solid var(--chrome-border)",
              borderRadius: "var(--panel-radius)",
              boxShadow: "0 14px 40px rgba(0,0,0,0.4)",
            }}
          >
            {THEME_NAMES.map((name) => (
              <button
                key={name}
                onClick={() => { setTheme(name); setOpen(false); }}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left rounded"
                style={{
                  background: name === theme ? "var(--row-selected)" : "transparent",
                  borderLeft: `2px solid ${name === theme ? "var(--accent)" : "transparent"}`,
                  color: name === theme ? "var(--accent)" : "var(--fg)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  fontWeight: name === theme ? 600 : 400,
                }}
              >
                <span style={{ width: 14, height: 14, background: themeSwatch(name), borderRadius: 3 }} />
                <span>{THEMES[name].label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/os/MenuBar.tsx
git commit -m "feat(os): MenuBar with brand, nav, client pill, theme dropdown

Theme picker promoted from corner palette icon to menu-bar dropdown.
All 7 themes listed with color swatches. Escape closes; outside click
closes. ThemePopover will be retired in a later task."
```

---

### Task 1.6: Build StatusBar

**Files:**
- Create: `src/components/os/StatusBar.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

interface StatusBarProps {
  health?: number;
  cost?: string;
  cachePct?: number;
  cacheHits?: string;
  integrations?: string;
  lastSweep?: string;
  reviewCount?: number;
  activeAgents?: number;
}

export function StatusBar({
  health = 100,
  cost = "—",
  cachePct,
  cacheHits = "—",
  integrations = "—",
  lastSweep = "—",
  reviewCount = 0,
  activeAgents = 0,
}: StatusBarProps) {
  return (
    <div
      className="flex items-center gap-5 px-4"
      style={{
        height: 32,
        background: "var(--chrome-bg)",
        borderTop: "1px solid var(--chrome-border)",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.06em",
        color: "var(--fg-muted)",
        textTransform: "uppercase",
      }}
    >
      <Cell label="HEALTH" value={String(health)} valueColor="var(--ok)" hint="clean" />
      <Cell label="COST" value={cost} />
      {cachePct !== undefined && (
        <Cell label="CACHE" value={`${cachePct}%`} hint={cacheHits} />
      )}
      <Cell label="INTEGR" value={integrations} valueColor="var(--ok)" hint="ready" />
      <Cell label="LAST SWEEP" value={lastSweep} />
      <Cell label="REVIEW" value={String(reviewCount)} valueColor="var(--accent)" hint={reviewCount === 0 ? "clear" : "awaiting"} />
      <div className="ml-auto flex items-center gap-2" style={{ color: "var(--ok)" }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "var(--ok)",
          animation: "pulse 2.4s ease-in-out infinite",
        }} />
        live · {activeAgents} active agent{activeAgents === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function Cell({ label, value, valueColor, hint }: { label: string; value: string; valueColor?: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span style={{ color: "var(--fg-faint)" }}>{label}</span>
      <span style={{ color: valueColor ?? "var(--fg)", fontWeight: 600 }}>{value}</span>
      {hint && <span style={{ color: "var(--fg-faint)" }}>{hint}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Add the pulse keyframe to globals.css**

In `src/app/globals.css`, append:

```css
@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.4); opacity: 0.5; }
}
```

- [ ] **Step 3: Typecheck + Commit**

```bash
pnpm typecheck
git add src/components/os/StatusBar.tsx src/app/globals.css
git commit -m "feat(os): StatusBar showing health/cost/cache/integr/sweep/review

All values are props for now; will be wired to live data sources in
later phases (windowStore, specialistsStore, providers)."
```

---

### Task 1.7: Build MinimizedTray

**Files:**
- Create: `src/components/os/MinimizedTray.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useWindowStore } from "@/store/windows";

export function MinimizedTray() {
  const windows = useWindowStore((s) => s.windows);
  const restore = useWindowStore((s) => s.restore);
  const minimized = windows.filter((w) => w.minimized);

  return (
    <div
      className="flex gap-1.5 px-2.5 py-2 overflow-x-auto"
      style={{
        borderTop: "1px solid var(--chrome-border)",
        background: "var(--titlebar-bg)",
        minHeight: 38,
      }}
    >
      {minimized.length === 0 ? (
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--fg-faint)",
          padding: "4px 6px",
          letterSpacing: "0.14em",
        }}>
          MINIMIZED · empty
        </span>
      ) : (
        minimized.map((w) => (
          <button
            key={w.id}
            onClick={() => restore(w.id)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap"
            style={{
              background: "var(--panel-bg-soft)",
              border: "1px solid var(--chrome-border)",
              color: "var(--fg)",
              padding: "4px 10px",
              borderRadius: 12,
              fontFamily: "var(--font-ui)",
              fontSize: 10.5,
            }}
          >
            <span style={{ color: "var(--accent)" }}>{w.icon}</span>
            {w.title}
          </button>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + Commit**

```bash
pnpm typecheck
git add src/components/os/MinimizedTray.tsx
git commit -m "feat(os): MinimizedTray — chip per minimized window, click to restore"
```

---

### Task 1.8: Build Desktop composing the chrome

**Files:**
- Create: `src/components/os/Desktop.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { type ReactNode } from "react";
import { MenuBar } from "./MenuBar";
import { StatusBar } from "./StatusBar";
import { WindowManager } from "./WindowManager";

interface DesktopProps {
  clientName?: string;
  wallpaper: ReactNode;
  dock: ReactNode;
  statusBarProps?: React.ComponentProps<typeof StatusBar>;
}

export function Desktop({ clientName, wallpaper, dock, statusBarProps }: DesktopProps) {
  return (
    <div
      id="os-shell"
      className="grid h-screen"
      style={{ gridTemplateRows: "38px 1fr 32px", overflow: "hidden" }}
    >
      <MenuBar clientName={clientName} />
      <div id="os-workspace" className="grid relative" style={{ gridTemplateColumns: "1fr 340px" }}>
        <div className="relative overflow-hidden" id="os-wallpaper">
          {wallpaper}
        </div>
        <aside
          id="os-dock"
          className="grid"
          style={{
            gridTemplateRows: "1fr 1fr auto",
            borderLeft: "1px solid var(--chrome-border)",
            background: "var(--chrome-bg)",
          }}
        >
          {dock}
        </aside>
        <WindowManager />
      </div>
      <StatusBar {...statusBarProps} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + Commit**

```bash
pnpm typecheck
git add src/components/os/Desktop.tsx
git commit -m "feat(os): Desktop layout composes MenuBar + workspace + StatusBar

Workspace is two-column: wallpaper (3D Canvas slot) + dock. The
WindowManager portal mounts inside #os-workspace so windows float
above the wallpaper but inside the workspace bounds."
```

---

### Task 1.9: Switch OfficeWorkspace to the Desktop layout

**Files:**
- Modify: `src/app/office/OfficeWorkspace.tsx`

- [ ] **Step 1: Read the current layout**

```bash
sed -n '140,260p' "src/app/office/OfficeWorkspace.tsx"
```

Identify the section that renders the right pane with tab toggles for chat/vault.

- [ ] **Step 2: Replace the layout**

Find the return statement and replace the right-pane tab structure with `<Desktop>`:

```tsx
return (
  <ThemeProvider persistKey="seo-office:theme" defaultTheme="cosmos">
    <Desktop
      clientName={client?.name}
      statusBarProps={{ health: 100, cost: cost ?? "—", activeAgents: activeAgents ?? 0 }}
      wallpaper={<OfficeScene clientSlug={slug} onDeskClick={handleDeskClick} />}
      dock={
        <>
          <section className="flex flex-col overflow-hidden border-b" style={{ borderColor: "var(--chrome-border)" }}>
            <header className="flex items-center gap-2 px-3.5 py-2.5" style={{
              background: "var(--titlebar-bg)", borderBottom: "1px solid var(--chrome-border)",
              fontFamily: "var(--font-ui)", fontSize: 10.5, fontWeight: 600,
              letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--fg-muted)",
            }}>
              <span style={{ color: "var(--accent)" }}>📁</span>
              Files · vault
            </header>
            <div className="flex-1 overflow-y-auto">
              <VaultBrowser clientSlug={slug} />
            </div>
          </section>
          <section className="flex flex-col overflow-hidden">
            <header className="flex items-center gap-2 px-3.5 py-2.5" style={{
              background: "var(--titlebar-bg)", borderBottom: "1px solid var(--chrome-border)",
              fontFamily: "var(--font-ui)", fontSize: 10.5, fontWeight: 600,
              letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--fg-muted)",
            }}>
              <span style={{ color: "var(--accent)" }}>●</span>
              Chat · orchestrator
            </header>
            <div className="flex-1 overflow-hidden">
              <ChatPanel clientSlug={slug} target="orchestrator" />
            </div>
          </section>
          <MinimizedTray />
        </>
      }
    />
  </ThemeProvider>
);
```

Add the imports at the top:

```tsx
import { Desktop } from "@/components/os/Desktop";
import { MinimizedTray } from "@/components/os/MinimizedTray";
```

Define a stub `handleDeskClick` for now:

```tsx
function handleDeskClick(_specialistId: string, _originRect: DOMRect) {
  // Phase 3 wires this to windowStore.open
}
```

- [ ] **Step 3: Add `onDeskClick` prop to OfficeScene (do not wire yet)**

In `src/components/office/OfficeScene.tsx`, find the props interface and add:

```ts
onDeskClick?: (specialistId: string, originRect: DOMRect) => void;
```

Add to destructuring; the handler is not invoked anywhere yet (Phase 3 wires it through Specialist).

- [ ] **Step 4: Smoke test**

```bash
pnpm dev > /tmp/dev.log 2>&1 &
sleep 5
curl -sS -o /dev/null -w "/office → %{http_code}\n" http://localhost:3000/office
```

Open the browser at `http://localhost:3000/office`. Verify:
1. Menu bar at top with theme dropdown
2. 3D Canvas takes the left ~70%
3. Files + Chat docked on the right
4. Status bar at bottom
5. Theme dropdown switches themes — wallpaper + chrome both update

- [ ] **Step 5: Commit**

```bash
pkill -f "next dev" 2>/dev/null
git add src/app/office/OfficeWorkspace.tsx src/components/office/OfficeScene.tsx
git commit -m "feat(os): OfficeWorkspace switches to <Desktop> layout

The right-pane tab toggle (chat|vault) is gone. Both apps now live
as persistent docked panels. WindowManager portal is mounted but
no windows open yet (Phase 2+). OfficeScene gains onDeskClick prop;
handler is a stub until Phase 3."
```

---

### Task 1.10: Retire ThemePopover

**Files:**
- Delete: `src/components/ThemePopover.tsx`
- Modify: any callers (likely `OfficeWorkspace.tsx` corner cluster)

- [ ] **Step 1: Find callers**

```bash
grep -rn "ThemePopover" src/ | grep -v "ThemePopover.tsx"
```

- [ ] **Step 2: Remove imports + usages**

Wherever ThemePopover is rendered (most likely a bottom-right corner cluster in OfficeWorkspace), remove the import and the JSX usage.

- [ ] **Step 3: Delete the file**

```bash
rm src/components/ThemePopover.tsx
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(os): retire ThemePopover — promoted into MenuBar"
```

---

### Phase 1 verification

- All windows open as drag/close/min/max enabled, even before content is meaningful
- Test in browser console:

```js
useWindowStore.getState().open({ kind: "system", title: "test", icon: "▣", contentProps: {} });
```

A window appears, can be dragged, closed, minimized to tray, restored.

Commit checkpoint:

```bash
git commit --allow-empty -m "chore: Phase 1 complete — OS shell + Window Manager working end-to-end"
```

---

## Phase 2 — Files App + Quiet Approval

Goal: replace `VaultBrowser.tsx` with `FilesApp.tsx`. Ribbon icons instead of "needs review" labels. Remove segregated review queue. Remove header counters. Files open as `NoteWindow` floating windows. Neutralize `StatusPill` for approval status.

**Read before writing (best-practices §read-before-write):**
- `src/components/VaultBrowser.tsx` — locks current vault data shape consumed by the UI (notes + summary + reviewQueue from `/api/brain`).
- `src/app/api/brain/route.ts` — confirms the endpoint payload. No new endpoint needed; FilesApp reuses it.
- `src/components/MarkdownBody.tsx` — reused by NoteWindow. Confirm prop signature before importing.
- `src/components/office/StatusPill.tsx` — current status colors. Neutralize only the gold-for-needs-review path; assignment lifecycle colors stay.
- `src/components/VaultNoteSlideOver.tsx` — dead code after this phase; capture any non-obvious behaviors (e.g. backlink rendering) before deletion.

**Blast radius:** no API contract change; no DB or disk change. `VaultBrowser` is the only consumer being retired — grep before deletion confirms zero outside callers expected.

**Rollback:** revert Phase 2 commits in reverse order; `git checkout HEAD~N -- src/components/VaultBrowser.tsx src/components/VaultNoteSlideOver.tsx` restores deleted files from history.

### Task 2.1: Memo — vault data contract for the FilesApp build

**Files:**
- Create: `docs/superpowers/plans/notes/2026-05-18-vault-data-contract.md`

A short read-only memo capturing exactly what `/api/brain` returns and what FilesApp consumes vs discards. Prevents drift later.

- [ ] **Step 1: Read the relevant files**

```bash
cd "/home/agricidaniel/Desktop/SEO Office"
sed -n '1,60p' src/app/api/brain/route.ts
sed -n '1,80p' src/components/VaultBrowser.tsx
```

- [ ] **Step 2: Write the memo**

Create `docs/superpowers/plans/notes/2026-05-18-vault-data-contract.md`:

```markdown
# Vault data contract (read-only memo for FilesApp implementation)

## GET /api/brain?clientSlug=…

Returns: { notes: BrainNote[], summary: {...}, reviewQueue: BrainNote[] }

BrainNote shape (from BrainNoteSchema in src/lib/brain/types.ts):
- path: string (relative to vault root)
- type: 'audit' | 'decision' | 'deliverable' | 'keyword-strategy' | …
- title: string
- approval_status: 'approved' | 'needs-review' | 'rejected' | undefined
- risk_level: 'low' | 'medium' | 'high' | undefined
- confidence: number (0-1) | undefined
- created, updated: ISO timestamps
- owner: string | undefined

## What FilesApp reuses
- The full `notes` array.

## What FilesApp discards (deliberate friction removal)
- `response.reviewQueue` — segregated queue is the noise we're killing.
- `response.summary.pending`, `summary.highRiskReview` — header counters retired.

## Folder grouping rule
FilesApp derives folders from `note.path` prefix segments:
- "audits/2026-05-12-audit.md"     → folder "audits" / file "2026-05-12-audit.md"
- "sources/dataforseo/2026-05.json" → folder "sources" / folder "dataforseo" / file …
- "hot.md", "log.md", "index.md"    → root files

Folders sorted alphabetically; files sorted by path.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/notes/2026-05-18-vault-data-contract.md
git commit -m "docs(plans): vault data contract memo for FilesApp build"
```

---

### Task 2.2: Pure helper — buildFolderTree

**Files:**
- Create: `src/lib/brain/folder-tree.ts`
- Test: `src/lib/brain/__tests__/folder-tree.test.ts`

Pure (no I/O, no React). Test-first — the shape matters everywhere downstream.

- [ ] **Step 1: Write the failing test**

Create `src/lib/brain/__tests__/folder-tree.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildFolderTree } from "../folder-tree";

interface MockNote { path: string; approval_status?: string }

test("flat root files appear as leaf children of root", () => {
  const tree = buildFolderTree<MockNote>([
    { path: "hot.md" },
    { path: "log.md" },
    { path: "index.md" },
  ]);
  assert.equal(tree.folders.length, 0);
  assert.equal(tree.files.length, 3);
  assert.deepEqual(tree.files.map((f) => f.note.path), ["hot.md", "index.md", "log.md"]);
});

test("single-segment prefix builds a folder with files inside", () => {
  const tree = buildFolderTree<MockNote>([
    { path: "audits/2026-05-12-audit.md" },
    { path: "audits/2026-05-08-audit.md" },
    { path: "hot.md" },
  ]);
  assert.equal(tree.folders.length, 1);
  assert.equal(tree.folders[0].name, "audits");
  assert.equal(tree.folders[0].files.length, 2);
  assert.equal(tree.files.length, 1);
  assert.equal(tree.files[0].note.path, "hot.md");
});

test("nested prefix produces nested folders", () => {
  const tree = buildFolderTree<MockNote>([
    { path: "sources/dataforseo/2026-05.json" },
    { path: "sources/gsc/queries-q2.json" },
  ]);
  assert.equal(tree.folders.length, 1);
  assert.equal(tree.folders[0].name, "sources");
  assert.equal(tree.folders[0].folders.length, 2);
  const dfs = tree.folders[0].folders.find((f) => f.name === "dataforseo")!;
  assert.equal(dfs.files.length, 1);
  assert.equal(dfs.files[0].note.path, "sources/dataforseo/2026-05.json");
});

test("folders are sorted alphabetically; files by path", () => {
  const tree = buildFolderTree<MockNote>([
    { path: "zeta/z.md" },
    { path: "alpha/a.md" },
    { path: "beta/b.md" },
  ]);
  assert.deepEqual(tree.folders.map((f) => f.name), ["alpha", "beta", "zeta"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/lib/brain/__tests__/folder-tree.test.ts
```

Expected: FAIL — module `../folder-tree` not found.

- [ ] **Step 3: Implement the helper**

Create `src/lib/brain/folder-tree.ts`:

```ts
export interface FileEntry<TNote> { note: TNote }
export interface FolderNode<TNote> {
  name: string;
  path: string;
  folders: FolderNode<TNote>[];
  files: FileEntry<TNote>[];
}
export interface FolderTree<TNote> {
  folders: FolderNode<TNote>[];
  files: FileEntry<TNote>[];
}

interface PathBearing { path: string }

export function buildFolderTree<TNote extends PathBearing>(notes: TNote[]): FolderTree<TNote> {
  const root: FolderTree<TNote> = { folders: [], files: [] };
  for (const note of notes) {
    const parts = note.path.split("/").filter(Boolean);
    if (parts.length <= 1) { root.files.push({ note }); continue; }
    insertIntoFolder(root, parts.slice(0, -1), [], note);
  }
  sortTree(root);
  return root;
}

function insertIntoFolder<TNote extends PathBearing>(
  current: FolderTree<TNote>,
  remainingDirs: string[],
  consumed: string[],
  note: TNote,
): void {
  if (remainingDirs.length === 0) { current.files.push({ note }); return; }
  const [head, ...rest] = remainingDirs;
  const childPath = [...consumed, head].join("/");
  let folder = current.folders.find((f) => f.name === head);
  if (!folder) {
    folder = { name: head, path: childPath, folders: [], files: [] };
    current.folders.push(folder);
  }
  insertIntoFolder(folder, rest, [...consumed, head], note);
}

function sortTree<TNote extends PathBearing>(tree: FolderTree<TNote>): void {
  tree.folders.sort((a, b) => a.name.localeCompare(b.name));
  tree.files.sort((a, b) => a.note.path.localeCompare(b.note.path));
  for (const folder of tree.folders) sortTree(folder);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test src/lib/brain/__tests__/folder-tree.test.ts
```

Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/brain/folder-tree.ts src/lib/brain/__tests__/folder-tree.test.ts
git commit -m "feat(brain): buildFolderTree pure helper for FilesApp"
```

---

### Task 2.3: FileRow with quiet ribbon icons

**Files:**
- Create: `src/components/os/files/FileRow.tsx`
- Test: `src/components/os/files/__tests__/FileRow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/os/files/__tests__/FileRow.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { ribbonKind } from "../FileRow";

test("approved → 'approved'", () => assert.equal(ribbonKind("approved"), "approved"));
test("needs-review → 'ribbon'", () => assert.equal(ribbonKind("needs-review"), "ribbon"));
test("rejected → 'rejected'", () => assert.equal(ribbonKind("rejected"), "rejected"));
test("undefined → 'unmarked'", () => assert.equal(ribbonKind(undefined), "unmarked"));
test("unknown string → 'unmarked'", () => assert.equal(ribbonKind("weird"), "unmarked"));
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

```bash
pnpm test src/components/os/files/__tests__/FileRow.test.ts
```

- [ ] **Step 3: Create the component**

Create `src/components/os/files/FileRow.tsx`:

```tsx
"use client";

import type { CSSProperties } from "react";

export type RibbonKind = "approved" | "ribbon" | "rejected" | "unmarked";

export function ribbonKind(approvalStatus: string | undefined): RibbonKind {
  if (approvalStatus === "approved") return "approved";
  if (approvalStatus === "needs-review") return "ribbon";
  if (approvalStatus === "rejected") return "rejected";
  return "unmarked";
}

interface FileRowProps {
  title: string;
  path: string;
  approvalStatus?: string;
  selected?: boolean;
  depth: number;
  onSelect: () => void;
  onOpen: () => void;
}

export function FileRow({ title, path, approvalStatus, selected, depth, onSelect, onOpen }: FileRowProps) {
  const kind = ribbonKind(approvalStatus);
  const indent = 32 + depth * 18;
  const base: CSSProperties = {
    paddingLeft: indent, paddingRight: 14, paddingTop: 3.5, paddingBottom: 3.5,
    fontFamily: "var(--font-ui)", fontSize: 12,
    background: selected ? "var(--row-selected)" : "transparent",
    color: selected ? "var(--fg)" : "var(--fg-muted)",
    borderLeft: `2px solid ${selected ? "var(--accent)" : "transparent"}`,
    cursor: "default",
  };
  return (
    <div
      role="button" tabIndex={0}
      className="flex w-full items-center gap-2"
      style={base}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
        if (e.key === " ") { e.preventDefault(); onSelect(); }
      }}
      title={`${path} — ${kindLabel(kind)}`}
    >
      <span style={{ color: "var(--fg-faint)", fontSize: 11 }}>📄</span>
      <span className="truncate">{title}</span>
      <Ribbon kind={kind} />
    </div>
  );
}

function Ribbon({ kind }: { kind: RibbonKind }) {
  const base: CSSProperties = { marginLeft: "auto", width: 8, height: 8, flexShrink: 0 };
  if (kind === "approved") return <span aria-hidden style={{ ...base, background: "var(--ok)", borderRadius: "50%" }} />;
  if (kind === "ribbon") return <span aria-hidden style={{ ...base, background: "var(--ribbon)", borderRadius: 2 }} />;
  if (kind === "rejected") return <span aria-hidden style={{ ...base, background: "var(--err)", borderRadius: "50%" }} />;
  return <span aria-hidden style={{ ...base, background: "transparent", border: "1px solid var(--chrome-border)", borderRadius: "50%" }} />;
}

function kindLabel(k: RibbonKind): string {
  if (k === "approved") return "approved";
  if (k === "ribbon") return "awaiting review";
  if (k === "rejected") return "rejected";
  return "no approval gate";
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/components/os/files/__tests__/FileRow.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/os/files/FileRow.tsx src/components/os/files/__tests__/FileRow.test.ts
git commit -m "feat(files): FileRow with quiet ribbon icons (no 'needs review' label)

needs-review → yellow square ribbon. approved → green dot.
rejected → red dot. unmarked → hollow circle. Tooltip carries
the meaning; the row stays calm."
```

---

### Task 2.4: FolderRow + recursive FolderView

**Files:**
- Create: `src/components/os/files/FolderRow.tsx`
- Create: `src/components/os/files/FolderView.tsx`

- [ ] **Step 1: Create FolderRow**

`src/components/os/files/FolderRow.tsx`:

```tsx
"use client";

import { type ReactNode } from "react";

interface FolderRowProps {
  name: string;
  depth: number;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
}

export function FolderRow({ name, depth, expanded, onToggle, children }: FolderRowProps) {
  const indent = 14 + depth * 18;
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 text-left"
        style={{
          paddingLeft: indent, paddingRight: 14,
          paddingTop: 3.5, paddingBottom: 3.5,
          color: "var(--fg)", fontFamily: "var(--font-ui)",
          fontSize: 12, fontWeight: 600,
          background: "transparent", border: "none",
        }}
        aria-expanded={expanded}
      >
        <span style={{ color: "var(--fg-faint)", fontSize: 8.5, width: 10, textAlign: "center" }}>
          {expanded ? "▼" : "▶"}
        </span>
        <span style={{ color: "var(--accent)" }}>📁</span>
        <span>{name}</span>
      </button>
      {expanded && children}
    </>
  );
}
```

- [ ] **Step 2: Create FolderView**

`src/components/os/files/FolderView.tsx`:

```tsx
"use client";

import { useState } from "react";
import { FolderRow } from "./FolderRow";
import { FileRow } from "./FileRow";
import type { FolderNode } from "@/lib/brain/folder-tree";

interface VaultNote {
  path: string;
  title?: string;
  approval_status?: string;
}

interface FolderViewProps<TNote extends VaultNote> {
  folder: FolderNode<TNote>;
  depth: number;
  selectedPath: string | null;
  onSelect: (note: TNote) => void;
  onOpen: (note: TNote) => void;
  defaultExpanded?: boolean;
}

export function FolderView<TNote extends VaultNote>({
  folder, depth, selectedPath, onSelect, onOpen, defaultExpanded = false,
}: FolderViewProps<TNote>) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <FolderRow name={folder.name} depth={depth} expanded={expanded} onToggle={() => setExpanded((v) => !v)}>
      {folder.folders.map((sub) => (
        <FolderView key={sub.path} folder={sub} depth={depth + 1}
          selectedPath={selectedPath} onSelect={onSelect} onOpen={onOpen} />
      ))}
      {folder.files.map(({ note }) => (
        <FileRow
          key={note.path}
          title={note.title ?? note.path.split("/").pop()!}
          path={note.path}
          approvalStatus={note.approval_status}
          selected={selectedPath === note.path}
          depth={depth + 1}
          onSelect={() => onSelect(note)}
          onOpen={() => onOpen(note)}
        />
      ))}
    </FolderRow>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/components/os/files/FolderRow.tsx src/components/os/files/FolderView.tsx
git commit -m "feat(files): FolderRow + recursive FolderView"
```

---

### Task 2.5: FilesApp shell — fetch, build tree, render

**Files:**
- Create: `src/components/os/FilesApp.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { buildFolderTree } from "@/lib/brain/folder-tree";
import { FolderView } from "./files/FolderView";
import { FileRow } from "./files/FileRow";
import { useWindowStore } from "@/store/windows";

interface BrainNote {
  path: string;
  title?: string;
  approval_status?: string;
  risk_level?: string;
  updated?: string;
}

interface BrainPayload { notes: BrainNote[] }

interface FilesAppProps { clientSlug: string }

export function FilesApp({ clientSlug }: FilesAppProps) {
  const [notes, setNotes] = useState<BrainNote[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = useWindowStore((s) => s.open);

  useEffect(() => {
    let abort = false;
    async function load() {
      try {
        const res = await fetch(`/api/brain?clientSlug=${encodeURIComponent(clientSlug)}`);
        if (!res.ok) throw new Error(`brain fetch ${res.status}`);
        const json = (await res.json()) as BrainPayload;
        if (!abort) setNotes(json.notes ?? []);
      } catch (e) {
        if (!abort) setError(String((e as Error).message));
      }
    }
    void load();
    return () => { abort = true; };
  }, [clientSlug]);

  const tree = useMemo(() => buildFolderTree(notes), [notes]);

  function openNote(note: BrainNote) {
    open({
      kind: "note",
      title: note.title ?? note.path.split("/").pop() ?? note.path,
      icon: "📄",
      contentProps: { clientSlug, path: note.path, approvalStatus: note.approval_status },
      w: 520, h: 480,
    });
  }

  if (error) {
    return <div className="p-3" style={{ color: "var(--err)", fontSize: 12 }}>Failed to load vault: {error}</div>;
  }
  return (
    <div className="flex-1 overflow-y-auto py-1.5">
      {tree.folders.map((folder) => (
        <FolderView
          key={folder.path}
          folder={folder}
          depth={0}
          selectedPath={selectedPath}
          onSelect={(n) => setSelectedPath(n.path)}
          onOpen={openNote}
          defaultExpanded={folder.name === "audits"}
        />
      ))}
      {tree.files.map(({ note }) => (
        <FileRow
          key={note.path}
          title={note.title ?? note.path}
          path={note.path}
          approvalStatus={note.approval_status}
          selected={selectedPath === note.path}
          depth={0}
          onSelect={() => setSelectedPath(note.path)}
          onOpen={() => openNote(note)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/os/FilesApp.tsx
git commit -m "feat(files): FilesApp — Finder-style vault renderer

Fetches /api/brain, builds folder tree, renders recursive
FolderView + leaf FileRow. Double-click → opens NoteWindow."
```

---

### Task 2.6: Flesh out NoteWindow (markdown + frontmatter)

**Files:**
- Modify: `src/components/os/NoteWindow.tsx`

- [ ] **Step 1: Confirm the note endpoint exists**

```bash
ls src/app/api/brain/note*
```

If the endpoint exists (likely `/api/brain/note`), use it. If not, check `src/components/VaultNoteSlideOver.tsx` for the actual endpoint name and adjust accordingly.

- [ ] **Step 2: Replace the stub**

```tsx
"use client";

import { useEffect, useState } from "react";
import { MarkdownBody } from "@/components/MarkdownBody";

interface NoteWindowProps {
  clientSlug: string;
  path: string;
  approvalStatus?: string;
}

interface NotePayload {
  body: string;
  frontmatter?: Record<string, unknown>;
}

export function NoteWindow({ clientSlug, path, approvalStatus }: NoteWindowProps) {
  const [data, setData] = useState<NotePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let abort = false;
    async function load() {
      try {
        const url = `/api/brain/note?clientSlug=${encodeURIComponent(clientSlug)}&path=${encodeURIComponent(path)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`note fetch ${res.status}`);
        const json = (await res.json()) as NotePayload;
        if (!abort) setData(json);
      } catch (e) {
        if (!abort) setError(String((e as Error).message));
      }
    }
    void load();
    return () => { abort = true; };
  }, [clientSlug, path]);

  if (error) return <div className="p-4" style={{ color: "var(--err)" }}>Failed: {error}</div>;
  if (!data) return <div className="p-4" style={{ color: "var(--fg-faint)" }}>Loading…</div>;

  return (
    <div className="px-5 py-4" style={{ color: "var(--fg)", fontFamily: "var(--font-ui)", fontSize: 12.5, lineHeight: 1.55 }}>
      {data.frontmatter && (
        <pre
          className="mb-3 p-2.5"
          style={{
            fontFamily: "var(--font-mono)", fontSize: 10,
            color: "var(--fg-muted)", background: "var(--panel-bg-soft)",
            borderLeft: `2px solid ${approvalStatus === "needs-review" ? "var(--ribbon)" : "var(--accent)"}`,
            margin: 0,
          }}
        >
          {Object.entries(data.frontmatter)
            .filter(([k]) => k !== "body")
            .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
            .join("\n")}
        </pre>
      )}
      <MarkdownBody>{data.body}</MarkdownBody>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + smoke**

```bash
pnpm typecheck
pnpm dev > /tmp/dev.log 2>&1 &
sleep 4
curl -sS -o /dev/null -w "/office → %{http_code}\n" http://localhost:3000/office
```

Browser: open `/office`, double-click any file in the Files dock — a NoteWindow appears.

- [ ] **Step 4: Commit**

```bash
pkill -f "next dev" 2>/dev/null
git add src/components/os/NoteWindow.tsx
git commit -m "feat(files): NoteWindow renders markdown via MarkdownBody

Frontmatter rendered as quiet left-bordered pre-block; border
color depends on approval_status (ribbon for needs-review,
accent otherwise)."
```

---

### Task 2.7: Swap VaultBrowser → FilesApp in the dock

**Files:**
- Modify: `src/app/office/OfficeWorkspace.tsx`

- [ ] **Step 1: Swap import + JSX**

Replace:

```tsx
import { VaultBrowser } from "@/components/VaultBrowser";
// …
<VaultBrowser clientSlug={slug} />
```

with:

```tsx
import { FilesApp } from "@/components/os/FilesApp";
// …
<FilesApp clientSlug={slug} />
```

- [ ] **Step 2: Smoke test**

```bash
pnpm dev > /tmp/dev.log 2>&1 &
sleep 4
curl -sS -o /dev/null -w "/office → %{http_code}\n" http://localhost:3000/office
```

Verify FilesApp now renders in the dock.

- [ ] **Step 3: Commit**

```bash
pkill -f "next dev" 2>/dev/null
git add src/app/office/OfficeWorkspace.tsx
git commit -m "feat(files): OfficeWorkspace dock uses FilesApp"
```

---

### Task 2.8: Delete VaultBrowser + VaultNoteSlideOver

**Files:**
- Delete: `src/components/VaultBrowser.tsx`, `src/components/VaultNoteSlideOver.tsx`

- [ ] **Step 1: Confirm no other callers**

```bash
grep -rn "VaultBrowser\|VaultNoteSlideOver" src/ | grep -v "/VaultBrowser.tsx\|/VaultNoteSlideOver.tsx"
```

Expected: empty. If anything appears, fix that reference before deletion.

- [ ] **Step 2: Delete**

```bash
rm src/components/VaultBrowser.tsx src/components/VaultNoteSlideOver.tsx
```

- [ ] **Step 3: Typecheck + lint**

```bash
pnpm typecheck
pnpm lint
```

Both must pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(files): delete VaultBrowser + VaultNoteSlideOver

Superseded by FilesApp + NoteWindow. The segregated review queue
and pending/high-risk-review counters that lived in VaultBrowser
are deliberately not preserved — that was the friction we built
the metamorphosis to remove."
```

---

### Task 2.9: Neutralize StatusPill for approval_status

**Files:**
- Modify: `src/components/office/StatusPill.tsx`
- Modify: any descendant that fires gold for `approval_status === "needs-review"`

- [ ] **Step 1: Read current**

```bash
sed -n '1,50p' src/components/office/StatusPill.tsx
```

Identify whether StatusPill itself reads `approval_status` or only assignment lifecycle status. If StatusPill never touches approval_status (lifecycle only), there's nothing to change in this file — but other components might. Grep them out:

```bash
grep -rn "needs-review" src/components/ src/app/
```

- [ ] **Step 2: Remove every gold "needs review" path**

For each grep hit outside of `FileRow.tsx`:
- If it's a label like "Review note" → remove the conditional that switches between "Open" and "Review", just use "Open"
- If it's a counter / stat → delete it (already covered by Phase 2 retirement of VaultBrowser, but Inbox/Sweep cards may have similar)
- If it's a color class like `text-gold` keyed on approval_status → remove the conditional, use the neutral color

- [ ] **Step 3: Typecheck + lint + smoke**

```bash
pnpm typecheck
pnpm lint
pnpm dev > /tmp/dev.log 2>&1 &
sleep 4
```

Browser: open `/office`, trigger a sweep or open existing Inbox — confirm no gold "Review note" button anywhere; assignment lifecycle pills (queued/running/succeeded/failed) still color correctly.

- [ ] **Step 4: Commit**

```bash
pkill -f "next dev" 2>/dev/null
git add -A
git commit -m "feat(ui): neutralize approval_status gold throughout

Assignment lifecycle status colors (queued/running/succeeded/failed)
preserved. 'needs-review' as approval_status now communicates only
via the FileRow ribbon icon. No more gold 'Review note' buttons or
labels anywhere in the UI."
```

---

### Phase 2 verification

- [ ] FilesApp loads in the dock with folder tree mirroring disk layout
- [ ] Double-click a file → NoteWindow opens; drag/close/min/max all work (Phase 1 carries this)
- [ ] Yellow ribbon square on `needs-review`; green dot on `approved`; hollow circle on unmarked
- [ ] No "review queue" segregated section anywhere
- [ ] No "pending: N" / "high-risk review: N" header counter
- [ ] StatusPill no longer shouts gold for approval status
- [ ] All 7 themes still render the FilesApp readable (chrome tokens propagate)
- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm test` all green

```bash
git commit --allow-empty -m "chore: Phase 2 complete — Files App + quiet approval"
```

**Rollback:** revert Phase 2 commits in reverse order. To restore the deleted components: `git checkout <Phase-2-pre-delete-sha> -- src/components/VaultBrowser.tsx src/components/VaultNoteSlideOver.tsx`.

---

## Phase 3 — Live Monitors + Remote Desktop

Goal: subscribe to existing SSE stream, drive 4-state monitor renderer, spawn `RemoteDesktopWindow` on desk click.

**Read before writing (best-practices §read-before-write):**
- `src/components/office/Screen.tsx` — current monitor renderer (canvas → THREE.CanvasTexture). Confirm how its draw function is called from a useFrame loop so the 4-state branch slots in cleanly.
- `src/components/office/screen-renderers/index.ts` + `types.ts` — renderer registry pattern. The four states (idle/running/review/failed) become four new renderers or one renderer that switches on a state prop.
- `src/components/office/Specialist.tsx` — current desk component. Confirm how onClick is currently wired (or not); we add an `onSelect(specialistId, originRect)` callback.
- `src/components/office/OfficeScene.tsx` — confirm the prop drilling for `onDeskClick`.
- `src/app/api/clients/[slug]/jobs/stream/route.ts` — SSE event shape. Confirm event field names (`type`, `jobId`, `specialistId`, `status`, `message`, `artifactPath`). Engineer should read the actual event types before coding the hook.
- `src/lib/orchestrator/job-queue.ts` — terminal-event semantics. Confirm which `status` values count as "knowledge-added" (likely `succeeded` with an artifact path).
- `src/lib/orchestrator/assignment.ts` — Assignment schema for the Inbox tab.

**Blast radius:**
- No backend change. The SSE stream and assignment endpoints already exist; this phase only adds a *subscriber*.
- `Specialist.tsx` gains an onClick + originRect callback path. If any other component renders `<Specialist>`, that caller must be aware (probably just `OfficeScene`).
- `Screen.tsx` changes painting logic but keeps the same canvas size/texture binding — should not affect lighting or scene composition.

**Rollback:** revert Phase 3 commits in reverse order. The new files (`specialists.ts` store, `useSpecialistsStream.ts` hook) can be deleted standalone. `Screen.tsx` edits are isolated to the paint function. The hook subscribes via `EventSource` which the browser cleans up automatically.

### Task 3.1: specialistsStore (Zustand)

**Files:**
- Create: `src/store/specialists.ts`
- Test: `src/store/__tests__/specialists.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { useSpecialistsStore } from "../specialists";

test("starts empty; setState writes per-specialist state", () => {
  const s = useSpecialistsStore.getState();
  s.reset();
  s.setState("technical-auditor", "running", { jobId: "j1", message: "crawl 1/120" });
  const t = useSpecialistsStore.getState().byId["technical-auditor"];
  assert.equal(t.state, "running");
  assert.equal(t.lastJobId, "j1");
  assert.equal(t.lastMessage, "crawl 1/120");
});

test("knowledge-added transitions emit a one-shot event", () => {
  const s = useSpecialistsStore.getState();
  s.reset();
  const events: string[] = [];
  const off = useSpecialistsStore.subscribe((state) => {
    if (state.lastKnowledgeAdded) events.push(state.lastKnowledgeAdded.specialistId);
  });
  s.setState("technical-auditor", "running");
  s.setState("technical-auditor", "succeeded", { artifactPath: "audits/x.md" });
  // The "knowledge-added" event fires on running→succeeded WITH an artifact
  assert.deepEqual(events, ["technical-auditor"]);
  off();
});

test("succeeded WITHOUT artifactPath does not fire knowledge-added", () => {
  const s = useSpecialistsStore.getState();
  s.reset();
  let kaCount = 0;
  const off = useSpecialistsStore.subscribe((state) => {
    if (state.lastKnowledgeAdded) kaCount++;
  });
  s.setState("foo", "running");
  s.setState("foo", "succeeded"); // no artifact
  assert.equal(kaCount, 0);
  off();
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm test src/store/__tests__/specialists.test.ts
```

- [ ] **Step 3: Implement the store**

```ts
import { create } from "zustand";

export type SpecialistState = "idle" | "running" | "review" | "failed";

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
  /** One-shot field; subscribers should read it inside their callback and act.
   *  We don't clear it — subscribers should compare `at` timestamps to dedupe. */
  lastKnowledgeAdded: KnowledgeAdded | null;
  setState: (
    id: string,
    next: SpecialistState,
    extra?: { jobId?: string; message?: string; artifactPath?: string },
  ) => void;
  reset: () => void;
}

export const useSpecialistsStore = create<State>((set, get) => ({
  byId: {},
  lastKnowledgeAdded: null,
  setState: (id, next, extra) => {
    const prev = get().byId[id]?.state;
    const entry: SpecialistEntry = {
      state: next,
      lastJobId: extra?.jobId,
      lastMessage: extra?.message,
      lastArtifactPath: extra?.artifactPath,
      lastTransitionAt: Date.now(),
    };
    const isKnowledgeAdd =
      prev === "running" && next === "succeeded" && !!extra?.artifactPath;
    set({
      byId: { ...get().byId, [id]: entry },
      lastKnowledgeAdded: isKnowledgeAdd
        ? { specialistId: id, artifactPath: extra!.artifactPath!, at: Date.now() }
        : get().lastKnowledgeAdded,
    });
    // Map "succeeded" to "review" or "idle" depending on artifact presence.
    // The store keeps semantic state; Screen.tsx maps to visual.
    if (next === "succeeded") {
      set({
        byId: {
          ...get().byId,
          [id]: { ...entry, state: extra?.artifactPath ? "review" : "idle" },
        },
      });
    }
  },
  reset: () => set({ byId: {}, lastKnowledgeAdded: null }),
}));
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm test src/store/__tests__/specialists.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/store/specialists.ts src/store/__tests__/specialists.test.ts
git commit -m "feat(os): specialistsStore — per-specialist live state

idle/running/review/failed states driven by SSE events. Emits a
one-shot knowledge-added on running→succeeded-with-artifact; the
BrainChandelier subscribes to fire particles."
```

---

### Task 3.2: useSpecialistsStream hook (SSE → store)

**Files:**
- Create: `src/hooks/useSpecialistsStream.ts`

The hook is a thin SSE adapter. The engineer should first **read** the actual server-side event names in `src/app/api/clients/[slug]/jobs/stream/route.ts` and `src/lib/orchestrator/events.ts` to match the shape.

- [ ] **Step 1: Skim the existing SSE event shape**

```bash
sed -n '1,80p' src/app/api/clients/[slug]/jobs/stream/route.ts
sed -n '1,80p' src/lib/orchestrator/events.ts
```

Adapt the hook's event-type matching below to match the actual field names.

- [ ] **Step 2: Create the hook**

```ts
"use client";

import { useEffect } from "react";
import { useSpecialistsStore, type SpecialistState } from "@/store/specialists";

/** Open an EventSource on the per-client jobs stream and translate
 *  events into specialistsStore mutations. Cleans up on slug change /
 *  unmount. Idempotent: re-mount is safe. */
export function useSpecialistsStream(clientSlug: string | undefined): void {
  const setState = useSpecialistsStore((s) => s.setState);

  useEffect(() => {
    if (!clientSlug) return;
    const es = new EventSource(
      `/api/clients/${encodeURIComponent(clientSlug)}/jobs/stream`,
    );
    function onEvent(ev: MessageEvent) {
      try {
        const data = JSON.parse(ev.data);
        // Adapt these field names to the actual server payload after reading
        // src/lib/orchestrator/events.ts. Typical fields: type, specialistId,
        // status, jobId, message, artifactPath.
        const id: string | undefined = data.specialistId;
        if (!id) return;
        const status: string | undefined = data.status ?? data.type;
        if (!status) return;
        const next = statusToState(status);
        if (next) {
          setState(id, next, {
            jobId: data.jobId,
            message: data.message,
            artifactPath: data.artifactPath ?? data.artifact_path,
          });
        }
      } catch {
        // ignore malformed events
      }
    }
    es.addEventListener("message", onEvent);
    return () => {
      es.removeEventListener("message", onEvent);
      es.close();
    };
  }, [clientSlug, setState]);
}

function statusToState(status: string): SpecialistState | null {
  switch (status) {
    case "queued":
    case "spawning":
    case "running":
      return "running";
    case "succeeded":
      return "succeeded" as SpecialistState; // store maps to review|idle
    case "failed":
    case "cancelled":
      return "failed";
    case "idle":
    case "done":
      return "idle";
    default:
      return null;
  }
}
```

Note: the `succeeded` case relies on the store's post-process that re-maps to `review` or `idle` based on `artifactPath`. The cast is a deliberate seam.

- [ ] **Step 3: Mount the hook in OfficeWorkspace**

In `src/app/office/OfficeWorkspace.tsx`, add at the top of the component (before any return):

```tsx
import { useSpecialistsStream } from "@/hooks/useSpecialistsStream";
// …
useSpecialistsStream(slug);
```

- [ ] **Step 4: Typecheck + smoke**

```bash
pnpm typecheck
pnpm dev > /tmp/dev.log 2>&1 &
sleep 4
```

Open browser DevTools → Network tab → confirm one EventSource connection to `/api/clients/<slug>/jobs/stream`. In the console:

```js
useSpecialistsStore.getState().byId
```

Initially empty `{}`. Trigger any audit; observe entries appear.

- [ ] **Step 5: Commit**

```bash
pkill -f "next dev" 2>/dev/null
git add src/hooks/useSpecialistsStream.ts src/app/office/OfficeWorkspace.tsx
git commit -m "feat(os): useSpecialistsStream — SSE → specialistsStore adapter

Mounted once in OfficeWorkspace. Translates job-queue events into
per-specialist state. Cleans up on slug change / unmount."
```

---

### Task 3.3: Screen.tsx — 4-state monitor renderer

**Files:**
- Modify: `src/components/office/Screen.tsx`

- [ ] **Step 1: Read the current Screen.tsx**

```bash
wc -l src/components/office/Screen.tsx
sed -n '1,60p' src/components/office/Screen.tsx
```

Locate the canvas paint loop (likely a useFrame or imperative paint function).

- [ ] **Step 2: Read specialistsStore inside the component**

Add at the top:

```tsx
import { useSpecialistsStore } from "@/store/specialists";
```

Inside the component body (for whichever desk this Screen renders), add:

```tsx
const entry = useSpecialistsStore((s) => s.byId[specialistId]);
const state = entry?.state ?? "idle";
const message = entry?.lastMessage;
```

`specialistId` should be a prop the Screen already receives (or that the parent Specialist passes).

- [ ] **Step 3: Branch the paint function on state**

In the paint function (the one that draws to the 2D canvas before becoming a `THREE.CanvasTexture`), add a switch:

```tsx
switch (state) {
  case "idle":
    paintIdle(ctx, w, h);
    break;
  case "running":
    paintRunning(ctx, w, h, message ?? "");
    break;
  case "review":
    paintIdle(ctx, w, h);
    paintCornerRibbon(ctx, w);
    break;
  case "failed":
    paintIdle(ctx, w, h);
    paintErrorBezel(ctx, w, h);
    break;
}
```

And implement the four paint helpers (in the same file or a colocated module):

```tsx
function paintIdle(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(0, 0, w, h);
  // dim power glyph
  ctx.fillStyle = "rgba(180,140,80,0.25)";
  ctx.font = `${Math.floor(h * 0.35)}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⏻", w / 2, h / 2);
}

function paintRunning(ctx: CanvasRenderingContext2D, w: number, h: number, message: string) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#f5c842";
  ctx.font = `${Math.floor(h * 0.10)}px ui-monospace, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const lines = [
    "RUN…",
    message.slice(0, 22),
    "",
    "▮",
  ];
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 6, 6 + i * (h * 0.16));
  }
}

function paintCornerRibbon(ctx: CanvasRenderingContext2D, w: number) {
  ctx.fillStyle = "#f5c842";
  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(w - 10, 0);
  ctx.lineTo(w, 10);
  ctx.closePath();
  ctx.fill();
}

function paintErrorBezel(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.strokeStyle = "#ff6b6b";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
}
```

These hardcoded colors are an exception worth flagging: ideally they too pull from the theme. For v1 they can stay as the four canonical accents; a TODO comment notes the future move to a theme-aware paint context. (See best-practices §evidence-over-intuition — we ship the smallest viable change first; if theming the canvas turns out to matter visually, it's a follow-up.)

Add a `TODO(theming):` comment above the paint helpers so it's grep-findable.

- [ ] **Step 4: Re-trigger the canvas repaint when state changes**

Ensure the `useEffect` / `useFrame` that updates `THREE.CanvasTexture.needsUpdate = true` is also triggered by `state` and `message` changes. Add `state, message` to the dependency array.

- [ ] **Step 5: Smoke test**

```bash
pnpm typecheck
pnpm dev > /tmp/dev.log 2>&1 &
sleep 4
```

Browser console:

```js
useSpecialistsStore.getState().setState("technical-auditor", "running", { message: "crawl 5/120" });
```

The technical-auditor desk's monitor should switch to running. Then:

```js
useSpecialistsStore.getState().setState("technical-auditor", "succeeded", { artifactPath: "audits/x.md" });
```

Monitor should show the corner ribbon (review state).

- [ ] **Step 6: Commit**

```bash
pkill -f "next dev" 2>/dev/null
git add src/components/office/Screen.tsx
git commit -m "feat(os): Screen.tsx 4-state renderer (idle/running/review/failed)

Reads specialistsStore per-desk. Paint branches in 2D canvas before
the texture binds to the 3D mesh. Hardcoded accent colors marked
TODO(theming) for a follow-up that pipes theme tokens into the
canvas paint context."
```

---

### Task 3.4: RemoteDesktopWindow with 3 tabs

**Files:**
- Modify: `src/components/os/RemoteDesktopWindow.tsx`

- [ ] **Step 1: Flesh out the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { MarkdownBody } from "@/components/MarkdownBody";
import { useSpecialistsStore } from "@/store/specialists";

interface RemoteDesktopWindowProps {
  clientSlug: string;
  specialistId: string;
}

type Tab = "inbox" | "files" | "last";

interface Assignment {
  id: string;
  title: string;
  status: string;
  proposed_at?: string;
  message?: string;
  artifact_path?: string;
}

export function RemoteDesktopWindow({ clientSlug, specialistId }: RemoteDesktopWindowProps) {
  const [tab, setTab] = useState<Tab>("inbox");
  const entry = useSpecialistsStore((s) => s.byId[specialistId]);

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex border-b"
        style={{ background: "var(--titlebar-bg)", borderColor: "var(--window-border)" }}
      >
        <TabBtn label="Inbox" active={tab === "inbox"} onClick={() => setTab("inbox")} />
        <TabBtn label="Files" active={tab === "files"} onClick={() => setTab("files")} />
        <TabBtn label="Last output" active={tab === "last"} onClick={() => setTab("last")} />
      </div>
      <div className="overflow-y-auto" style={{ flex: 1 }}>
        {tab === "inbox" && <InboxTab clientSlug={clientSlug} specialistId={specialistId} liveState={entry?.state} />}
        {tab === "files" && <FilesTab clientSlug={clientSlug} specialistId={specialistId} />}
        {tab === "last" && <LastOutputTab clientSlug={clientSlug} path={entry?.lastArtifactPath} />}
      </div>
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3.5 py-2.5"
      style={{
        background: "transparent",
        border: "none",
        borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
        color: active ? "var(--accent)" : "var(--fg-muted)",
        fontFamily: "var(--font-ui)",
        fontSize: 11.5,
        fontWeight: active ? 600 : 400,
        marginBottom: -1,
      }}
    >
      {label}
    </button>
  );
}

function InboxTab({ clientSlug, specialistId, liveState }: { clientSlug: string; specialistId: string; liveState?: string }) {
  const [rows, setRows] = useState<Assignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let abort = false;
    async function load() {
      try {
        const url = `/api/clients/${encodeURIComponent(clientSlug)}/specialists/${encodeURIComponent(specialistId)}/assignments`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`${r.status}`);
        const json = (await r.json()) as { assignments?: Assignment[] };
        if (!abort) setRows(json.assignments ?? []);
      } catch (e) {
        if (!abort) setError(String((e as Error).message));
      }
    }
    void load();
    return () => { abort = true; };
  }, [clientSlug, specialistId, liveState]);
  if (error) return <Empty>Failed: {error}</Empty>;
  if (rows.length === 0) return <Empty>No assignments yet.</Empty>;
  return (
    <div className="py-1">
      {rows.map((a) => (
        <div key={a.id} className="px-5 py-2 border-b" style={{ borderColor: "var(--chrome-border)" }}>
          <div style={{ fontSize: 12, color: "var(--fg)" }}>{a.title}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--fg-faint)", marginTop: 2 }}>
            {a.status}{a.proposed_at ? ` · ${a.proposed_at}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function FilesTab({ clientSlug, specialistId }: { clientSlug: string; specialistId: string }) {
  return <Empty>Files produced by <code>{specialistId}</code> render here. (v2: filtered FilesApp.)</Empty>;
}

function LastOutputTab({ clientSlug, path }: { clientSlug: string; path?: string }) {
  const [body, setBody] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let abort = false;
    void fetch(`/api/brain/note?clientSlug=${encodeURIComponent(clientSlug)}&path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((j: { body?: string }) => { if (!abort) setBody(j.body ?? ""); });
    return () => { abort = true; };
  }, [clientSlug, path]);
  if (!path) return <Empty>No output yet for this specialist.</Empty>;
  if (body === null) return <Empty>Loading…</Empty>;
  return <div className="px-5 py-4"><MarkdownBody>{body}</MarkdownBody></div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-6" style={{ color: "var(--fg-faint)", fontSize: 12 }}>{children}</div>;
}
```

- [ ] **Step 2: Update the WindowManager's RemoteDesktopWindow prop wiring**

In `WindowManager.tsx`, ensure the prop passes through:

```tsx
{spec.kind === "remote-desktop" && <RemoteDesktopWindow {...(spec.contentProps as { clientSlug: string; specialistId: string })} />}
```

- [ ] **Step 3: Typecheck + Commit**

```bash
pnpm typecheck
git add src/components/os/RemoteDesktopWindow.tsx src/components/os/WindowManager.tsx
git commit -m "feat(os): RemoteDesktopWindow with Inbox/Files/Last tabs

Inbox reads existing /api/clients/[slug]/specialists/[id]/assignments.
Last reads /api/brain/note for the specialist's most recent artifact.
Files tab is a v2 stub — pointing toward a filtered FilesApp slice."
```

---

### Task 3.5: Specialist.onClick → originRect → onDeskClick callback

**Files:**
- Modify: `src/components/office/Specialist.tsx`

- [ ] **Step 1: Read the current**

```bash
wc -l src/components/office/Specialist.tsx
sed -n '1,60p' src/components/office/Specialist.tsx
```

- [ ] **Step 2: Add an onClick that converts world position → screen rect**

The Specialist is rendered inside R3F. We need to project its world position into screen-space coordinates so the window can animate from there. R3F provides `useThree()` returning `camera`, `size`, `gl` — use these.

Add to the Specialist component:

```tsx
import { useThree } from "@react-three/fiber";
import { Vector3 } from "three";

// inside the component:
const { camera, size } = useThree();
const v = new Vector3();

function handleClick(e: ThreeEvent<MouseEvent>) {
  e.stopPropagation();
  // Get the desk world position; project to NDC then to screen pixels.
  v.copy(groupRef.current!.position).project(camera);
  const x = (v.x + 1) * 0.5 * size.width;
  const y = (-v.y + 1) * 0.5 * size.height;
  const rect = { left: x - 40, top: y - 28, width: 80, height: 56 };
  props.onSelect?.(props.specialistId, rect);
}
```

Wire `onClick={handleClick}` on the outermost interactive mesh (the desk monitor or base).

If the Specialist's group ref is not already a `useRef<THREE.Group>(null)`, add it.

- [ ] **Step 3: Forward `onDeskClick` from OfficeScene → Specialist**

In `OfficeScene.tsx`, wherever Specialists are rendered, pass:

```tsx
<Specialist
  specialistId={s.id}
  onSelect={props.onDeskClick}
  // … existing props
/>
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/components/office/Specialist.tsx src/components/office/OfficeScene.tsx
git commit -m "feat(os): Specialist.onClick projects desk → screen rect → onDeskClick

R3F camera projects the group's world position to NDC, then to pixel
coords. Callback receives (specialistId, rect) so the window can
animate scale-from-origin out of the clicked desk."
```

---

### Task 3.6: Wire OfficeWorkspace.handleDeskClick → windowStore.open

**Files:**
- Modify: `src/app/office/OfficeWorkspace.tsx`

- [ ] **Step 1: Replace the stub**

```tsx
import { useWindowStore } from "@/store/windows";
// …
const open = useWindowStore((s) => s.open);
function handleDeskClick(specialistId: string, originRect: { left: number; top: number; width: number; height: number }) {
  open({
    kind: "remote-desktop",
    title: specialistId,
    icon: "▣",
    contentProps: { clientSlug: slug, specialistId },
    originRect: originRect as DOMRect,
    w: 480, h: 420,
    x: Math.max(40, originRect.left),
    y: Math.max(60, originRect.top - 320),
  });
}
```

- [ ] **Step 2: Smoke test**

```bash
pnpm typecheck
pnpm dev > /tmp/dev.log 2>&1 &
sleep 4
```

Browser: open `/office`, click any desk in the 3D amphitheater → a RemoteDesktopWindow appears positioned near the clicked desk, with Inbox/Files/Last tabs. Multiple clicks open multiple windows; can drag, focus, minimize.

- [ ] **Step 3: Commit**

```bash
pkill -f "next dev" 2>/dev/null
git add src/app/office/OfficeWorkspace.tsx
git commit -m "feat(os): desk click spawns RemoteDesktopWindow

Position is staggered relative to the clicked desk's screen rect
so multiple opens read visually. The window content shows that
specialist's live state via specialistsStore subscription."
```

---

### Phase 3 verification

- [ ] Trigger a job from chat ("do a technical audit on example.com") — technical desk's monitor enters running state in the 3D scene
- [ ] Live message updates on the monitor as SSE events stream
- [ ] On completion with artifact → monitor shows corner ribbon (review state)
- [ ] On failure → monitor shows red bezel
- [ ] Click any desk → RemoteDesktopWindow opens; Inbox tab lists that specialist's assignments
- [ ] Last-output tab renders the most recent artifact as markdown
- [ ] Multiple specialists can have remote-desktop windows open simultaneously; drag/focus/close all work
- [ ] All 7 themes still render readable

```bash
git commit --allow-empty -m "chore: Phase 3 complete — live monitors + remote desktop wired"
```

**Rollback:** revert Phase 3 commits in reverse order. The store and hook can be deleted standalone; `Screen.tsx` paint changes are confined to the paint function.

---

## Phase 4 — Brain Interconnection

Goal: connect specialist activity to the brain chandelier via R3F particle emission. When a specialist transitions `running → succeeded` with an artifact, a glowing sphere animates from the desk's world position to the brain center, where the brain "absorbs" it with a brief emissive bump. Visible signature: "the shared brain just learned something."

**Read before writing:**
- `src/components/office/BrainChandelier.tsx` — current implementation. Locate the central `<mesh>` (the globe) and where you can read its world position. Identify any existing material with `emissive` so we can lerp it.
- `src/components/office/positions.ts` — the desk position registry. Confirm how to look up a desk's world position by specialistId.
- `src/components/office/OfficeScene.tsx` — confirm BrainChandelier is mounted inside the same R3F scene as the desks.
- `src/store/specialists.ts` — `lastKnowledgeAdded` field (built in Phase 3.1). Subscribers compare `at` timestamps to dedupe.

**Blast radius:**
- BrainChandelier gains a children prop or internal state for particles. No external API change.
- Particle meshes are short-lived (≤800ms), garbage-collected after fade. R3F's automatic cleanup handles it.
- Theme color mirroring uses an existing `useTheme()` call (`THEMES[theme].chrome.accent`) parsed into a `THREE.Color`.

**Rollback:** revert Phase 4 commits in reverse order. Particles are additive and isolated; reverting removes them cleanly without affecting the brain or scene.

### Task 4.1: BrainChandelier subscribes to lastKnowledgeAdded

**Files:**
- Modify: `src/components/office/BrainChandelier.tsx`

- [ ] **Step 1: Read current**

```bash
wc -l src/components/office/BrainChandelier.tsx
sed -n '1,40p' src/components/office/BrainChandelier.tsx
```

Identify a good place to add a subscription effect and a particle layer `<group>`.

- [ ] **Step 2: Add the subscription + particle queue**

Add imports:

```tsx
import { useEffect, useRef, useState } from "react";
import { useSpecialistsStore } from "@/store/specialists";
import { getDeskPosition } from "@/components/office/positions";
import { useTheme, THEMES } from "@/components/office/themes";
```

Inside the component, after existing refs:

```tsx
const [particles, setParticles] = useState<ParticleSpec[]>([]);
const seenAt = useRef<number>(0);
const { theme } = useTheme();
const accentHex = parseAccentColor(THEMES[theme].chrome.accent);

useEffect(() => {
  const off = useSpecialistsStore.subscribe((state) => {
    const ka = state.lastKnowledgeAdded;
    if (!ka || ka.at <= seenAt.current) return;
    seenAt.current = ka.at;
    const desk = getDeskPosition(ka.specialistId);
    if (!desk) return;
    setParticles((p) => [
      ...p,
      { id: `${ka.specialistId}-${ka.at}`, from: desk, color: accentHex, bornAt: performance.now() },
    ]);
  });
  return off;
}, [accentHex]);

// Auto-prune particles older than 1s
useEffect(() => {
  const t = setInterval(() => {
    setParticles((p) => p.filter((q) => performance.now() - q.bornAt < 1000));
  }, 200);
  return () => clearInterval(t);
}, []);
```

Add types + helper:

```tsx
interface ParticleSpec {
  id: string;
  from: [number, number, number];
  color: string;
  bornAt: number;
}

function parseAccentColor(css: string): string {
  // CSS accent might be hex or rgba. Extract a hex if possible; default to white.
  const hex = css.match(/#[0-9a-fA-F]{3,8}/);
  if (hex) return hex[0];
  return "#ffffff";
}
```

In the JSX, where the chandelier mesh is rendered, add a sibling group:

```tsx
{particles.map((p) => (
  <BrainParticle key={p.id} from={p.from} color={p.color} bornAt={p.bornAt} brainCenter={[0, BRAIN_Y, 0]} />
))}
```

Where `BRAIN_Y` is the Y coordinate of the brain center in your scene (read from the existing BrainChandelier code).

- [ ] **Step 3: Typecheck (BrainParticle not yet defined; expect ONE error)**

```bash
pnpm typecheck 2>&1 | grep BrainParticle
```

Expected: `Cannot find name 'BrainParticle'`. That's the next task.

- [ ] **Step 4: Commit (stage WIP)**

```bash
git add src/components/office/BrainChandelier.tsx
git commit -m "feat(brain): BrainChandelier subscribes to lastKnowledgeAdded

WIP: enqueues a ParticleSpec when a specialist's running→succeeded
transition fires with an artifact. <BrainParticle> renderer follows."
```

Note: this commit will fail the typecheck stage of any pre-commit hook. If the project's `pre-commit` runs typecheck and fails, use `git commit --no-verify` for this WIP commit and ensure the next task closes the loop. (Per best-practices, prefer never skipping hooks — but here the WIP is intentional and the very next task lands the missing piece. If the engineer prefers, fold task 4.1 and 4.2 into one commit.)

---

### Task 4.2: BrainParticle — R3F mesh that travels desk → brain

**Files:**
- Create: `src/components/office/BrainParticle.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CubicBezierCurve3, Mesh, Vector3 } from "three";

interface BrainParticleProps {
  from: [number, number, number];
  brainCenter: [number, number, number];
  color: string;
  bornAt: number;
  durationMs?: number;
}

export function BrainParticle({ from, brainCenter, color, bornAt, durationMs = 800 }: BrainParticleProps) {
  const ref = useRef<Mesh>(null);
  // Build an S-shaped path with two control points lifted up and toward the brain
  const start = new Vector3(...from);
  const end = new Vector3(...brainCenter);
  const c1 = start.clone().lerp(end, 0.3).setY(start.y + 1.2);
  const c2 = start.clone().lerp(end, 0.7).setY(end.y - 0.2);
  const curve = new CubicBezierCurve3(start, c1, c2, end);
  const p = new Vector3();

  useFrame(() => {
    if (!ref.current) return;
    const t = Math.min(1, (performance.now() - bornAt) / durationMs);
    curve.getPoint(t, p);
    ref.current.position.copy(p);
    // Fade + shrink in the final 20%
    const eased = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
    ref.current.scale.setScalar(eased * (t < 0.1 ? t * 10 : 1));
  });

  return (
    <mesh ref={ref} position={from}>
      <sphereGeometry args={[0.06, 12, 12]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}
```

- [ ] **Step 2: Wire the import in BrainChandelier**

```tsx
import { BrainParticle } from "./BrainParticle";
```

- [ ] **Step 3: Typecheck — expect clean**

```bash
pnpm typecheck
```

- [ ] **Step 4: Smoke test in browser**

```bash
pnpm dev > /tmp/dev.log 2>&1 &
sleep 4
```

Browser console:

```js
useSpecialistsStore.getState().setState("technical-auditor", "running");
useSpecialistsStore.getState().setState("technical-auditor", "succeeded", { artifactPath: "audits/x.md" });
```

A small bright sphere should fly from the technical-auditor desk position toward the brain center.

- [ ] **Step 5: Commit**

```bash
pkill -f "next dev" 2>/dev/null
git add src/components/office/BrainParticle.tsx src/components/office/BrainChandelier.tsx
git commit -m "feat(brain): BrainParticle — desk→brain travelling emissive sphere

CubicBezierCurve3 with two lift points; 800ms duration. Fades and
shrinks in the final 20% of the path. Color sourced from active
theme's chrome.accent so theme switches change particle hue."
```

---

### Task 4.3: Brain receive pulse (emissive bump on absorb)

**Files:**
- Modify: `src/components/office/BrainChandelier.tsx`

The brain should briefly "react" when a particle arrives — a 300ms scale bump or emissive intensity spike to signal absorption.

- [ ] **Step 1: Track absorptions**

In BrainChandelier, after the existing particle subscription, add a state for pulse intensity:

```tsx
const [pulse, setPulse] = useState(0);

// When a particle is born, schedule a pulse at born + duration
useEffect(() => {
  const lastBorn = particles[particles.length - 1];
  if (!lastBorn) return;
  const t = setTimeout(() => {
    setPulse(1);
    setTimeout(() => setPulse(0), 300);
  }, 800); // matches BrainParticle's default durationMs
  return () => clearTimeout(t);
}, [particles.length]);
```

- [ ] **Step 2: Apply the pulse to the brain mesh**

Find the chandelier's main mesh and modify its scale or emissive intensity based on `pulse`. Using useFrame for smooth lerp:

```tsx
const meshRef = useRef<Mesh>(null);
useFrame((_, dt) => {
  if (!meshRef.current) return;
  const target = 1 + pulse * 0.06;
  meshRef.current.scale.lerp(new Vector3(target, target, target), dt * 8);
});
```

(Adjust to fit the existing scale logic in BrainChandelier — don't break breathing animations already there. Use a multiplicative pulse if the base scale animates.)

- [ ] **Step 3: Smoke test**

```bash
pnpm dev > /tmp/dev.log 2>&1 &
sleep 4
```

Trigger a particle (as in 4.2 Step 4); after the 800ms travel, the brain should briefly bump in size.

- [ ] **Step 4: Commit**

```bash
pkill -f "next dev" 2>/dev/null
git add src/components/office/BrainChandelier.tsx
git commit -m "feat(brain): receive-pulse on particle absorption

Scheduled 800ms after a particle is born; 300ms scale bump on the
brain mesh. Lerp via useFrame so it blends with existing breathing."
```

---

### Task 4.4: Notifications toast in MenuBar

**Files:**
- Create: `src/components/os/Notifications.tsx`
- Modify: `src/components/os/MenuBar.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSpecialistsStore } from "@/store/specialists";

interface Toast {
  id: string;
  kind: "success" | "error";
  text: string;
  bornAt: number;
}

export function Notifications() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenAt = useState({ current: 0 })[0];

  useEffect(() => {
    return useSpecialistsStore.subscribe((state) => {
      const ka = state.lastKnowledgeAdded;
      if (ka && ka.at > seenAt.current) {
        seenAt.current = ka.at;
        const t: Toast = {
          id: `ka-${ka.at}`,
          kind: "success",
          text: `${ka.specialistId} added: ${ka.artifactPath.split("/").pop()}`,
          bornAt: performance.now(),
        };
        setToasts((arr) => [...arr, t]);
      }
    });
  }, [seenAt]);

  // Auto-dismiss after 5s
  useEffect(() => {
    const t = setInterval(() => {
      setToasts((arr) => arr.filter((x) => performance.now() - x.bornAt < 5000));
    }, 250);
    return () => clearInterval(t);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="absolute right-4 top-12 flex flex-col gap-2 z-200"
      role="status"
      aria-live="polite"
    >
      {toasts.slice(-3).map((t) => (
        <div
          key={t.id}
          className="px-3 py-2"
          style={{
            background: "var(--panel-bg)",
            border: `1px solid ${t.kind === "success" ? "var(--ok)" : "var(--err)"}`,
            borderLeft: `3px solid ${t.kind === "success" ? "var(--ok)" : "var(--err)"}`,
            borderRadius: "var(--panel-radius)",
            color: "var(--fg)",
            fontFamily: "var(--font-ui)",
            fontSize: 11.5,
            maxWidth: 320,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Mount in MenuBar**

In `src/components/os/MenuBar.tsx`, import and render:

```tsx
import { Notifications } from "./Notifications";
// at the end of the MenuBar JSX, after the theme picker:
<Notifications />
```

The component positions itself absolutely so it doesn't disturb the menu bar's flex layout.

- [ ] **Step 3: Typecheck + smoke**

```bash
pnpm typecheck
pnpm dev > /tmp/dev.log 2>&1 &
sleep 4
```

Trigger a `knowledge-added` event in console (as in 4.2 Step 4). A toast should appear top-right with the specialist + artifact filename, auto-dismissing after 5s.

- [ ] **Step 4: Commit**

```bash
pkill -f "next dev" 2>/dev/null
git add src/components/os/Notifications.tsx src/components/os/MenuBar.tsx
git commit -m "feat(os): Notifications toast on knowledge-added

Mounted in MenuBar; positions absolute. Auto-dismisses after 5s.
Border color flips ok→err. Max 3 toasts visible (overflow drops
the oldest). Accessibility: role=status, aria-live=polite."
```

---

### Phase 4 verification

- [ ] Trigger `build the brain` sweep from chat
- [ ] Watch particles travel from desks to the brain in real-time as specialists finish
- [ ] Brain briefly scales up on each particle arrival
- [ ] Notification toasts appear top-right and auto-dismiss
- [ ] Switching themes mid-sweep changes particle color (next particle uses new accent)
- [ ] All 7 themes still render the scene readable
- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm test` all green

```bash
git commit --allow-empty -m "chore: Phase 4 complete — brain interconnection"
```

**Rollback:** revert Phase 4 commits in reverse order. Particles and toast are additive; reverting removes them cleanly.

---

## Phase 5 — Polish + Dashboard retire

Goal: refine the open animation, smooth theme transitions, ship keyboard shortcuts, build the SystemApp window, retire the dashboard route, accessibility pass.

**Read before writing:**
- `src/app/dashboard/page.tsx` — current dashboard. Inventory every section (manifest summary, integrations status, recent sweeps, settings shortcuts) so SystemApp covers all of them.
- `src/app/api/setup/status/route.ts` — manifest + integrations data source.
- `src/lib/orchestrator/sweeps.ts` — sweep history queries.
- The existing focus-management code (if any) under `src/components/`.

**Blast radius:**
- Deleting `dashboard/page.tsx` removes the `/dashboard` route. Any external bookmark or `next/link` href pointing there will 404. Add a redirect in `next.config.ts` rather than a hard removal.
- Keyboard shortcut handler is a global `window.addEventListener("keydown", …)` — must not fire when an input/textarea has focus.
- Theme-switch transition adds CSS animation to chrome only; the 3D scene already lerps via materials.

**Rollback:** revert Phase 5 commits in reverse order. The SystemApp is additive; deleting it is safe. The keyboard handler is one module — easy to disable.

### Task 5.1: Window open-from-origin animation polish

**Files:**
- Modify: `src/components/os/Window.tsx`

The Phase 1 Window already animates `scale 0.6→1`. Now when `originRect` is set, animate from that specific rect instead of a generic center.

- [ ] **Step 1: Read current animation**

```bash
grep -n "initial\|animate\|originRect" src/components/os/Window.tsx
```

- [ ] **Step 2: Adapt the framer-motion initial state**

Replace the existing `initial`/`animate`/`exit` block with one that consumes `originRect`:

```tsx
const fromRect = spec.originRect;
const initial = fromRect
  ? {
      x: fromRect.left - spec.x,
      y: fromRect.top - spec.y,
      scale: Math.max(fromRect.width / spec.w, 0.1),
      opacity: 0.6,
    }
  : { scale: 0.6, opacity: 0 };

// …
<motion.div
  initial={initial}
  animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
  exit={{ scale: 0.6, opacity: 0 }}
  transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
  // … rest
>
```

- [ ] **Step 3: Smoke test**

```bash
pnpm typecheck
pnpm dev > /tmp/dev.log 2>&1 &
sleep 4
```

Click a desk → window animates from the desk position, not from a generic center.

- [ ] **Step 4: Commit**

```bash
pkill -f "next dev" 2>/dev/null
git add src/components/os/Window.tsx
git commit -m "feat(os): window open animates from originRect when available

Click a desk → window grows out of that desk's screen rect.
Falls back to scale-from-center when no originRect is provided."
```

---

### Task 5.2: Theme switch CSS transition (chrome side)

**Files:**
- Modify: `src/app/globals.css` or wherever the OS root is styled

- [ ] **Step 1: Add the transition rule**

In `src/app/globals.css`, near the top:

```css
:root {
  transition:
    --fg 600ms ease,
    --accent 600ms ease,
    --chrome-bg 600ms ease,
    --window-bg 600ms ease,
    --panel-bg 600ms ease,
    --titlebar-bg 600ms ease,
    --ribbon 600ms ease,
    --ok 600ms ease,
    --err 600ms ease;
}
```

Browsers vary on CSS variable transitions; the more reliable pattern is to apply transitions to *properties that consume* the variables. Add a fallback rule on the OS shell root:

```css
#os-shell, #os-workspace, .os {
  transition: background-color 600ms ease, color 600ms ease, border-color 600ms ease;
}
```

- [ ] **Step 2: Smoke test theme switching**

```bash
pnpm dev > /tmp/dev.log 2>&1 &
sleep 4
```

Open `/office`, press 1–7 to cycle themes — chrome colors fade smoothly instead of snapping.

- [ ] **Step 3: Commit**

```bash
pkill -f "next dev" 2>/dev/null
git add src/app/globals.css
git commit -m "feat(themes): 600ms ease CSS transition on chrome property changes

Theme switches no longer snap; chrome colors fade across all OS-shell
surfaces. The 3D scene already lerps materials via R3F; this closes
the loop on the chrome layer."
```

---

### Task 5.3: Keyboard shortcuts

**Files:**
- Create: `src/components/os/KeyboardShortcuts.tsx`
- Modify: `src/components/os/Desktop.tsx` to mount the listener

- [ ] **Step 1: Create the listener component**

```tsx
"use client";

import { useEffect } from "react";
import { useWindowStore } from "@/store/windows";
import { useTheme, THEME_NAMES } from "@/components/office/themes";

const THEME_KEY_MAP: Record<string, number> = {
  "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6,
};

export function KeyboardShortcuts() {
  const { setTheme } = useTheme();
  const close = useWindowStore((s) => s.close);
  const minimize = useWindowStore((s) => s.minimize);
  const focused = useWindowStore((s) => {
    if (s.windows.length === 0) return null;
    return s.windows.reduce((a, b) => (a.z > b.z ? a : b));
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Skip when typing in an input/textarea/contenteditable
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      // Theme switch — Cmd/Ctrl + 1..7
      if (mod && THEME_KEY_MAP[e.key] !== undefined) {
        e.preventDefault();
        const idx = THEME_KEY_MAP[e.key];
        const name = THEME_NAMES[idx];
        if (name) setTheme(name);
        return;
      }
      // Close focused — Cmd/Ctrl + W
      if (mod && e.key.toLowerCase() === "w") {
        if (focused) { e.preventDefault(); close(focused.id); }
        return;
      }
      // Minimize focused — Cmd/Ctrl + M
      if (mod && e.key.toLowerCase() === "m") {
        if (focused) { e.preventDefault(); minimize(focused.id); }
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTheme, close, minimize, focused]);

  return null;
}
```

- [ ] **Step 2: Mount in Desktop**

In `Desktop.tsx`, import and render before the closing tag of the root grid:

```tsx
import { KeyboardShortcuts } from "./KeyboardShortcuts";
// …
<KeyboardShortcuts />
```

- [ ] **Step 3: Smoke test**

```bash
pnpm typecheck
pnpm dev > /tmp/dev.log 2>&1 &
sleep 4
```

Browser: open `/office`, open a window via desk click, press Cmd+W → window closes. Press Cmd+M → focused window minimizes. Press Cmd+1..7 → theme switches.

- [ ] **Step 4: Commit**

```bash
pkill -f "next dev" 2>/dev/null
git add src/components/os/KeyboardShortcuts.tsx src/components/os/Desktop.tsx
git commit -m "feat(os): keyboard shortcuts (Cmd+W close, Cmd+M minimize, Cmd+1..7 theme)

Listener mounted in Desktop. Bypasses input/textarea/contenteditable
targets so users can still type the letters. Focused window resolved
by max z-index from windowStore."
```

---

### Task 5.4: SystemApp window body

**Files:**
- Modify: `src/components/os/SystemApp.tsx`

- [ ] **Step 1: Read current dashboard page**

```bash
wc -l src/app/dashboard/page.tsx
sed -n '1,80p' src/app/dashboard/page.tsx
```

Inventory the sections it shows — likely: manifest summary, integrations, recent sweeps, integrations test buttons, links to `/setup`.

- [ ] **Step 2: Flesh out SystemApp**

Replace the stub with a real layout that fetches `/api/setup/status` and renders three groups (Manifest / Integrations / Recent activity):

```tsx
"use client";

import { useEffect, useState } from "react";

interface Status {
  configuredProvider?: string;
  providers?: Record<string, { ready: boolean; reason?: string }>;
  manifest?: { client_slug: string; site_under_audit?: string; manifest_owner?: string };
}

export function SystemApp() {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    void fetch("/api/setup/status").then((r) => r.json()).then(setStatus);
  }, []);

  if (!status) return <Empty>Loading…</Empty>;

  return (
    <div className="px-5 py-4" style={{ color: "var(--fg)", fontFamily: "var(--font-ui)", fontSize: 12.5 }}>
      <Section title="Client manifest">
        {status.manifest ? (
          <>
            <Row label="Slug" value={status.manifest.client_slug} />
            <Row label="Site" value={status.manifest.site_under_audit ?? "—"} />
            <Row label="Owner" value={status.manifest.manifest_owner ?? "—"} />
          </>
        ) : (
          <Row label="State" value="no manifest on disk" />
        )}
      </Section>
      <Section title="LLM provider">
        <Row label="Active" value={status.configuredProvider ?? "—"} />
      </Section>
      <Section title="Integrations">
        {status.providers && Object.entries(status.providers).map(([name, p]) => (
          <Row
            key={name}
            label={name}
            value={p.ready ? "ready" : (p.reason ?? "not configured")}
            valueColor={p.ready ? "var(--ok)" : "var(--fg-faint)"}
          />
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 style={{
        fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em",
        textTransform: "uppercase", color: "var(--fg-faint)", margin: "0 0 8px",
      }}>
        {title}
      </h3>
      <div>{children}</div>
    </section>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span style={{ color: "var(--fg-muted)", width: 90, fontSize: 11.5 }}>{label}</span>
      <span style={{ color: valueColor ?? "var(--fg)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-4" style={{ color: "var(--fg-faint)", fontSize: 12 }}>{children}</div>;
}
```

- [ ] **Step 3: Add a "System" menu item that opens it**

In `MenuBar.tsx`, add a button to open SystemApp:

```tsx
import { useWindowStore } from "@/store/windows";
// inside the component, before the theme picker:
const open = useWindowStore((s) => s.open);
function openSystem() {
  open({
    kind: "system",
    title: "System",
    icon: "⚙",
    contentProps: {},
    w: 520, h: 480,
  });
}
// in the nav block, append:
<button onClick={openSystem} style={{ color: "var(--fg-muted)", background: "transparent", border: "none", fontSize: 11.5, padding: "2px 0" }}>
  SYSTEM
</button>
```

- [ ] **Step 4: Typecheck + smoke**

```bash
pnpm typecheck
pnpm dev > /tmp/dev.log 2>&1 &
sleep 4
```

Click "SYSTEM" in the menu bar → SystemApp window opens with manifest + integrations.

- [ ] **Step 5: Commit**

```bash
pkill -f "next dev" 2>/dev/null
git add src/components/os/SystemApp.tsx src/components/os/MenuBar.tsx
git commit -m "feat(os): SystemApp window — manifest + provider + integrations

Replaces the dashboard route content. Fetches /api/setup/status.
Opened from a new SYSTEM item in the menu bar nav."
```

---

### Task 5.5: Retire dashboard route via redirect

**Files:**
- Modify: `next.config.ts`
- Delete: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add a redirect in next.config.ts**

Read current:

```bash
cat next.config.ts
```

Add (inside the config export):

```ts
async redirects() {
  return [
    { source: "/dashboard", destination: "/office", permanent: false },
  ];
},
```

- [ ] **Step 2: Delete the dashboard page**

```bash
rm src/app/dashboard/page.tsx
```

If `src/app/dashboard/` becomes empty, remove the directory too:

```bash
rmdir src/app/dashboard 2>/dev/null
```

- [ ] **Step 3: Find any remaining `/dashboard` links**

```bash
grep -rn "/dashboard" src/
```

Replace any `href="/dashboard"` with `href="/office"` (or wire the SystemApp open).

- [ ] **Step 4: Smoke test**

```bash
pnpm typecheck
pnpm lint
pnpm dev > /tmp/dev.log 2>&1 &
sleep 4
curl -sS -o /dev/null -w "/dashboard → %{http_code}\n" -L http://localhost:3000/dashboard
```

Expected: `200` (after redirect to `/office`).

- [ ] **Step 5: Commit**

```bash
pkill -f "next dev" 2>/dev/null
git add -A
git commit -m "chore(os): retire /dashboard route via redirect to /office

next.config redirect (302). dashboard/page.tsx deleted. SystemApp
window in the menu bar now owns the manifest + integrations view."
```

---

### Task 5.6: Accessibility pass

**Files:**
- Modify: `src/components/os/Window.tsx`, `src/components/os/MenuBar.tsx`, others as needed

- [ ] **Step 1: Focus management on window stacking**

In `Window.tsx`, when the window becomes focused (z-index becomes max), give focus to the first focusable element inside:

```tsx
import { useEffect, useRef } from "react";
// inside Window component:
const bodyRef = useRef<HTMLDivElement>(null);
const isFocused = useWindowStore((s) => {
  if (s.windows.length === 0) return false;
  const top = s.windows.reduce((a, b) => (a.z > b.z ? a : b));
  return top.id === spec.id;
});
useEffect(() => {
  if (!isFocused || !bodyRef.current) return;
  const first = bodyRef.current.querySelector<HTMLElement>(
    "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
  );
  first?.focus();
}, [isFocused]);
// pass ref={bodyRef} on the window body div
```

- [ ] **Step 2: ARIA roles on traffic lights**

Already done in Phase 1 (`aria-label="close"`, etc.) — confirm. If missing, add. Same for menu bar buttons.

- [ ] **Step 3: ESC closes top window when not in an input**

Already partially covered by keyboard shortcuts; add ESC explicitly:

```tsx
// inside KeyboardShortcuts onKey:
if (e.key === "Escape" && focused) {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  e.preventDefault();
  close(focused.id);
}
```

- [ ] **Step 4: Verify with keyboard-only navigation**

Open `/office`. Tab through the menu bar, status bar, dock. Press Cmd+1..7 to switch themes. Click a desk, then Tab into the new window. Press ESC to close.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(os): a11y pass — focus moves with z-index, ESC closes top, ARIA on lights"
```

---

### Phase 5 verification

- [ ] Window open animates from clicked desk's rect, not generic center
- [ ] Theme switch fades smoothly (no jarring color flash) on chrome surfaces
- [ ] Cmd+W closes focused window; Cmd+M minimizes; Cmd+1..7 switches theme; ESC closes top window
- [ ] Cmd-shortcuts ignored while typing in chat input or any textarea
- [ ] `/dashboard` redirects to `/office` (302)
- [ ] SystemApp window opens from menu bar "SYSTEM" item
- [ ] Keyboard-only navigation works through menu bar, dock, windows
- [ ] All 7 themes still render the entire OS shell readable
- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm test` all green

```bash
git commit --allow-empty -m "chore: Phase 5 complete — polish, dashboard retired, a11y"
```

**Rollback:** revert Phase 5 commits in reverse order. The dashboard route can be restored via `git checkout` of the deleted file plus removing the redirect from next.config.ts.

---

## Self-review checklist

After all phases:

- [ ] **Spec coverage:** Every locked decision (8 decisions in the spec) has at least one task implementing it.
- [ ] **Theme propagation invariant:** `grep -rn "#[0-9a-fA-F]\{3,8\}" src/components/os/` returns ZERO results. All colors flow through CSS variables.
- [ ] **Backend untouched:** `git diff main..HEAD -- src/lib/orchestrator src/lib/specialists src/lib/brain` shows no orchestrator/specialist/brain changes (other than Phase 1 fixes already committed earlier).
- [ ] **Tests:** `pnpm test` passes everywhere; `pnpm typecheck` clean; `pnpm lint` clean.
- [ ] **Live verification per phase:** the verification step at the end of each phase passed.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-18-os-metamorphosis.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for a multi-day build where you want quality gates at each task boundary.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Best when you want to see the work happen live and intervene mid-flight.

**Which approach?**
