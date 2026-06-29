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
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && THEME_KEY_MAP[e.key] !== undefined) {
        e.preventDefault();
        const idx = THEME_KEY_MAP[e.key];
        const name = THEME_NAMES[idx];
        if (name) setTheme(name);
        return;
      }
      if (mod && e.key.toLowerCase() === "w") {
        if (focused) { e.preventDefault(); close(focused.id); }
        return;
      }
      if (mod && e.key.toLowerCase() === "m") {
        if (focused) { e.preventDefault(); minimize(focused.id); }
        return;
      }
      if (e.key === "Escape" && focused) {
        e.preventDefault();
        close(focused.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTheme, close, minimize, focused]);

  return null;
}
