"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MenuBar } from "./MenuBar";
import { StatusBar } from "./StatusBar";
import { WindowManager } from "./WindowManager";
import { KeyboardShortcuts } from "./KeyboardShortcuts";

interface DesktopProps {
  /** Legacy prop — MenuBar now reads the active client from the OS-themed
   *  picker (which has its own URL/localStorage fallback). Kept here so
   *  callers don't break, but the value is intentionally ignored. */
  clientName?: string;
  wallpaper: ReactNode;
  dock: ReactNode;
  /** Optional extra row rendered at the bottom of the dock, above the MinimizedTray.
   *  Phase 1.9 uses this to preserve the LiveAgentsHud + recent-jobs footer until
   *  Phase 4/5 reintegrates them into Notifications + SystemApp. */
  dockFooter?: ReactNode;
  statusBarProps?: React.ComponentProps<typeof StatusBar>;
}

const DOCK_OPEN_KEY = "seo-office:dock-open";
const DOCK_WIDTH = 340;

export function Desktop({ wallpaper, dock, dockFooter, statusBarProps }: DesktopProps) {
  // Single-pane dock: Files gets the full 1fr row; MinimizedTray + optional
  // dockFooter sit beneath as auto rows. Chat moved to popup windows
  // (ChatWindow / RemoteDesktopWindow→Chat tab) per OS metaphor.
  const dockRows = dockFooter ? "1fr auto auto" : "1fr auto";

  // Collapsible right dock. SSR renders the default-open layout, then we
  // reconcile from localStorage after mount — initializing from storage in
  // useState would diverge from the server HTML and trip a hydration warning.
  const [dockOpen, setDockOpen] = useState(true);
  useEffect(() => {
    const saved = window.localStorage.getItem(DOCK_OPEN_KEY);
    // Reconcile from the external store (localStorage) once, after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved !== null) setDockOpen(saved === "1");
  }, []);
  useEffect(() => {
    window.localStorage.setItem(DOCK_OPEN_KEY, dockOpen ? "1" : "0");
  }, [dockOpen]);

  return (
    <div
      id="os-shell"
      className="grid h-screen"
      style={{ gridTemplateRows: "38px 1fr 32px", overflow: "hidden" }}
    >
      <MenuBar />
      <div
        id="os-workspace"
        className="grid relative"
        style={{
          gridTemplateColumns: dockOpen ? `1fr ${DOCK_WIDTH}px` : "1fr 0px",
          minHeight: 0,
          transition: "grid-template-columns 180ms ease",
        }}
      >
        <div className="relative overflow-hidden h-full w-full" id="os-wallpaper" style={{ minHeight: 0 }}>
          {wallpaper}
        </div>
        <aside
          id="os-dock"
          className="grid overflow-hidden"
          aria-hidden={!dockOpen}
          style={{
            gridTemplateRows: dockRows,
            borderLeft: dockOpen ? "1px solid var(--chrome-border)" : "none",
            background: "var(--chrome-bg)",
            minHeight: 0,
            // When collapsed the column is 0px wide; suppress interaction with
            // the clipped contents so a stray click can't hit a hidden control.
            pointerEvents: dockOpen ? "auto" : "none",
          }}
        >
          {dock}
          {dockFooter}
        </aside>
        <button
          type="button"
          onClick={() => setDockOpen((open) => !open)}
          aria-label={dockOpen ? "Collapse the side panel" : "Open the side panel"}
          aria-expanded={dockOpen}
          title={dockOpen ? "Collapse panel" : "Open panel"}
          style={{
            position: "absolute",
            top: 10,
            right: dockOpen ? DOCK_WIDTH : 0,
            zIndex: 30,
            width: 22,
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--chrome-border)",
            borderRight: dockOpen ? "none" : "1px solid var(--chrome-border)",
            borderTopLeftRadius: 6,
            borderBottomLeftRadius: 6,
            borderTopRightRadius: dockOpen ? 0 : 6,
            borderBottomRightRadius: dockOpen ? 0 : 6,
            background: "var(--chrome-bg)",
            color: "var(--text-muted, currentColor)",
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1,
            transition: "right 180ms ease",
          }}
        >
          {dockOpen ? "⟩" : "⟨"}
        </button>
        <WindowManager />
      </div>
      <StatusBar {...statusBarProps} />
      <KeyboardShortcuts />
    </div>
  );
}
