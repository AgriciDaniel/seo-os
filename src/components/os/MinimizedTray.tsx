"use client";

import { useWindowStore } from "@/store/windows";

export function MinimizedTray() {
  const windows = useWindowStore((s) => s.windows);
  const restore = useWindowStore((s) => s.restore);
  const minimized = windows.filter((w) => w.minimized);

  // Collapse the tray entirely when nothing is minimized — no empty placeholder.
  if (minimized.length === 0) return null;

  return (
    <div
      className="flex gap-1.5 px-2.5 py-2 overflow-x-auto"
      style={{
        borderTop: "1px solid var(--chrome-border)",
        background: "var(--titlebar-bg)",
        minHeight: 38,
      }}
    >
      {minimized.map((w) => (
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
        ))}
    </div>
  );
}
