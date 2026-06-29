/**
 * Public API for the office theme system.
 *
 * Drop the entire `themes/` folder under `src/components/office/`. Then in
 * the office workspace:
 *
 *  1. Wrap the office container in `<ThemeProvider persistKey="...">` so
 *     children can read the active theme and changes survive reloads.
 *  2. Apply `useTheme().bgGradient` as the inline background of the WebGL
 *     container element.
 *  3. Drop `<ThemeBackground theme={theme} />` inside the `<Canvas>` so the
 *     theme's lights, fog, particles, and horizon get added to the scene.
 *  4. Render `<ThemePopover>` from `src/components/ThemePopover.tsx` next to
 *     the music toggle — the in-house picker that matches the rest of the
 *     office UI (the shipped bottom-bar `ThemePicker` is intentionally not
 *     re-exported).
 */

export {
  THEMES,
  THEME_NAMES,
  type ThemeName,
  type ThemeConfig,
  type ParticleKind,
  type HorizonKind,
} from "./theme-config";

export { ThemeBackground } from "./ThemeBackground";
export { ThemeProvider, useTheme } from "./theme-context";
