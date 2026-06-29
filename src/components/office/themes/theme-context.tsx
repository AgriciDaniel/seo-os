'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { THEMES, type ThemeName } from './theme-config';
import { applyChromeTokens } from './apply-chrome';

interface ThemeContextValue {
  /** The currently active theme. */
  theme: ThemeName;
  /** Switch to a new theme. */
  setTheme: (next: ThemeName) => void;
  /** CSS gradient string for the active theme. Apply to the WebGL container. */
  bgGradient: string;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  /** Initial theme. Defaults to 'cosmos'. */
  defaultTheme?: ThemeName;
  /**
   * If provided, the active theme is persisted to localStorage under this key
   * and restored on next mount.
   */
  persistKey?: string;
}

/**
 * Provides the active theme to descendants and persists user choice.
 *
 * Wrap your office scene's container (the element that has the WebGL Canvas)
 * with this provider, then read `bgGradient` to style the container and
 * pass `theme` to <ThemeBackground theme={theme}/>.
 *
 * @example
 * ```tsx
 * <ThemeProvider persistKey="seo-office-theme">
 *   <OfficeScene />
 * </ThemeProvider>
 * ```
 */
export function ThemeProvider({
  children,
  defaultTheme = 'cosmos',
  persistKey,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeName>(defaultTheme);

  // Hydrate from localStorage on mount (client-side only).
  useEffect(() => {
    if (!persistKey) return;
    try {
      const stored = window.localStorage.getItem(persistKey) as ThemeName | null;
      if (stored && stored in THEMES) {
        // One-shot hydration from localStorage on mount — same pattern the
        // workspace uses for its persisted right-pane width. Skipping this
        // would flash the default theme on every reload before settling.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setThemeState(stored);
      }
    } catch {
      // localStorage may throw in private mode / SSR — ignore.
    }
  }, [persistKey]);

  // Mirror chrome tokens to CSS custom properties on <html>. Triggered
  // on every theme change so OS-shell components reading var(--accent)
  // etc. re-skin immediately. SSR-safe via the typeof check.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const chrome = THEMES[theme].chrome;
    applyChromeTokens(chrome, document.documentElement.style);
  }, [theme]);

  const setTheme = useCallback(
    (next: ThemeName) => {
      setThemeState(next);
      if (persistKey) {
        try {
          window.localStorage.setItem(persistKey, next);
        } catch {
          // ignore
        }
      }
    },
    [persistKey]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      bgGradient: THEMES[theme].bgGradient,
    }),
    [theme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Read the current theme and switcher. Must be called within a ThemeProvider.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside a <ThemeProvider>');
  }
  return ctx;
}
