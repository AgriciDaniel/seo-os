"use client";

/**
 * Wraps the /setup page in the same chrome-token + background system the
 * OS office uses. Without it, /setup renders against the bare legacy
 * palette and feels like a different app.
 *
 * Responsibilities:
 *   - Mount ThemeProvider with the same persistKey the office uses, so
 *     the active theme (cosmos / clouds / retro / etc.) carries across.
 *   - Paint a fixed full-viewport gradient using the active theme's
 *     `bgGradient` so the setup card sits on the same atmosphere as
 *     the 3D office canvas.
 *   - Center the content panel with OS-styled scaffolding (border,
 *     subtle backdrop, brand-orange accents flowing through CSS vars).
 *
 * The page body still uses some legacy Tailwind tokens internally — that
 * is fine: with CSS variables now mirrored from the theme, the page
 * inherits the right accent / fg / muted family wherever it reads vars.
 * Targeted retheming of the inner cards happens in setup/page.tsx.
 */

import { type ReactNode } from "react";
import {
  ThemeProvider,
  useTheme,
} from "@/components/office/themes";

interface SetupShellProps {
  children: ReactNode;
}

export function SetupShell({ children }: SetupShellProps) {
  return (
    <ThemeProvider persistKey="seo-office:theme" defaultTheme="cosmos">
      <SetupShellInner>{children}</SetupShellInner>
    </ThemeProvider>
  );
}

function SetupShellInner({ children }: SetupShellProps) {
  const { bgGradient } = useTheme();
  return (
    <div
      style={{
        minHeight: "100vh",
        background: bgGradient,
        position: "relative",
        color: "var(--fg)",
        fontFamily: "var(--font-ui)",
      }}
    >
      {/* Soft brand-orange wash overlay so the cosmos gradient picks up
          the same warm undertone the office spotlight has. Pointer-events
          disabled so it never blocks input. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% -10%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 60%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}
