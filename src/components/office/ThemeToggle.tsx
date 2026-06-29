"use client";

import { useEffect, useRef, useState } from "react";
import { THEMES, THEME_NAMES, useTheme, type ThemeName } from "@/components/office/themes";

/**
 * ThemeToggle — bottom-right icon button that mirrors MusicToggle's chrome.
 *
 * Replaces the menu-bar dropdown so the theme picker lives next to the
 * other "ambience" controls (music + reduced-motion). Click opens an
 * upward-popping list; outside-click / Esc dismisses.
 *
 * Design language: same border-graphite / bg-abyss/85 / backdrop-blur as
 * MusicToggle so the two read as a cluster. Icon = the active theme's
 * dominant hex swatch in a small rounded square, matching the menu-bar
 * chip pattern users already know.
 */

function themeSwatch(name: ThemeName): string {
  const g = THEMES[name].bgGradient;
  const m = g.match(/#[0-9a-fA-F]{6}/);
  return m ? m[0] : "#ffffff";
}

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`Theme: ${THEMES[theme].label}`}
        aria-label={`Theme: ${THEMES[theme].label}. Click to change.`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={
          "inline-flex h-7.5 w-7.5 items-center justify-center border border-graphite bg-abyss/85 backdrop-blur transition-colors hover:bg-graphite/40 " +
          (open ? "text-gold" : "text-ash hover:text-gold")
        }
      >
        <BrushIcon />
      </button>
      {/* Brush icon — inline SVG using currentColor so the parent's text color
       *  drives the stroke. Matches MusicToggle's icon language exactly:
       *  width=14, height=14, viewBox 0 0 24, stroke=currentColor, 2px round.
       */}
      {open && (
        <div
          role="listbox"
          className="absolute right-0 bottom-[110%] z-50 min-w-45 p-1.5"
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
              type="button"
              onClick={() => {
                setTheme(name);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left"
              style={{
                background: name === theme ? "var(--row-selected)" : "transparent",
                borderLeft: `2px solid ${name === theme ? "var(--accent)" : "transparent"}`,
                color: name === theme ? "var(--accent)" : "var(--fg)",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                fontWeight: name === theme ? 600 : 400,
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  background: themeSwatch(name),
                  borderRadius: 3,
                }}
              />
              <span>{THEMES[name].label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* icon — paint brush, currentColor-driven so it matches MusicToggle           */
/* -------------------------------------------------------------------------- */

function BrushIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Brush ferrule + handle */}
      <path d="M9.5 14.5 4 20" />
      {/* Brush head (slanted bristle block) */}
      <path d="M16 3l5 5-7 7-5-5 7-7z" fill="currentColor" fillOpacity="0.15" />
      {/* Splash / paint dot */}
      <circle cx="6.5" cy="17.5" r="1.3" fill="currentColor" />
    </svg>
  );
}
