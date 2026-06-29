"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useWindowStore } from "@/store/windows";
import { Window } from "./Window";
import { NoteWindow } from "./NoteWindow";
import { RemoteDesktopWindow } from "./RemoteDesktopWindow";
import { ChatWindow } from "./ChatWindow";
import { SystemApp } from "./SystemApp";
import { TaskFeedWindow } from "./TaskFeedWindow";
import { EdgeLayer } from "./EdgeLayer";

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
    // One-shot mount: create the portal layer DOM node and remember it.
    // Same precedent as theme-context.tsx — setState-in-effect rule is
    // intended for derived/reactive state, not lifecycle DOM creation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayer(el);
    return () => {
      el.remove();
    };
  }, []);

  if (!layer) return null;

  return (
    <>
      <EdgeLayer />
      {createPortal(
        <AnimatePresence>
          {windows.map((spec) => (
            <div key={spec.id} style={{ pointerEvents: "auto" }}>
              <Window spec={spec}>
                {spec.kind === "note" && (
                  <NoteWindow {...(spec.contentProps as React.ComponentProps<typeof NoteWindow>)} />
                )}
                {spec.kind === "remote-desktop" && (
                  <RemoteDesktopWindow {...(spec.contentProps as React.ComponentProps<typeof RemoteDesktopWindow>)} />
                )}
                {spec.kind === "chat" && (
                  <ChatWindow {...(spec.contentProps as React.ComponentProps<typeof ChatWindow>)} />
                )}
                {spec.kind === "system" && <SystemApp />}
                {spec.kind === "task-feed" && (
                  <TaskFeedWindow {...(spec.contentProps as React.ComponentProps<typeof TaskFeedWindow>)} />
                )}
              </Window>
            </div>
          ))}
        </AnimatePresence>,
        layer,
      )}
    </>
  );
}
