"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useWindowStore, OFFICE_SIDEBAR_W, findNonOverlappingPosition, type WindowSpec } from "@/store/windows";
import { useSpecialistsStore } from "@/store/specialists";

/**
 * Snap zones for drag-to-edge (Windows-Aero-style auto-arrange).
 * Returned rectangle is in viewport pixels. `null` means no snap.
 */
type SnapZone = "left" | "right" | "top" | "tl" | "tr" | "bl" | "br" | null;
const EDGE_THRESHOLD = 12; // px from the edge that triggers a snap preview
const TITLE_BAR_H = 38;
const STATUS_BAR_H = 32;

function detectSnapZone(
  pointerX: number,
  pointerY: number,
  vw: number,
  vh: number,
): SnapZone {
  const canvasRight = vw - OFFICE_SIDEBAR_W; // sidebar is a no-fly zone
  const nearLeft = pointerX <= EDGE_THRESHOLD;
  const nearRight = pointerX >= canvasRight - EDGE_THRESHOLD;
  const nearTop = pointerY <= EDGE_THRESHOLD + TITLE_BAR_H;
  const nearBottom = pointerY >= vh - EDGE_THRESHOLD - STATUS_BAR_H;
  if (nearTop && nearLeft) return "tl";
  if (nearTop && nearRight) return "tr";
  if (nearBottom && nearLeft) return "bl";
  if (nearBottom && nearRight) return "br";
  if (nearTop) return "top";
  if (nearLeft) return "left";
  if (nearRight) return "right";
  return null;
}

function snapRect(zone: NonNullable<SnapZone>, vw: number, vh: number) {
  const canvasW = vw - OFFICE_SIDEBAR_W;
  const canvasH = vh - TITLE_BAR_H - STATUS_BAR_H;
  // 4×6 grid mental model — each cell is canvasW/4 × canvasH/6. Snap zones
  // occupy small portions of the grid so windows don't dominate the screen.
  // Edge snaps: 1 column wide (canvasW/4) × 4 rows tall (2/3 canvasH).
  // Corner snaps: 1 column × 3 rows (half canvasH).
  // Top snap stays as "maximize" — full canvas.
  const colW = Math.floor(canvasW / 4);     // 1 col
  const edgeW = colW;                       // edge snap = 1 col wide
  const edgeH = Math.floor(canvasH * 2 / 3); // 4 rows tall
  const edgeYOffset = Math.floor((canvasH - edgeH) / 2); // centered vertically
  const cornerW = colW;                     // corner snap = 1 col wide
  const cornerH = Math.floor(canvasH / 2);  // 3 rows tall
  switch (zone) {
    case "left":  return { x: 0,                  y: TITLE_BAR_H + edgeYOffset, w: edgeW, h: edgeH };
    case "right": return { x: canvasW - edgeW,    y: TITLE_BAR_H + edgeYOffset, w: edgeW, h: edgeH };
    case "top":   return { x: 0,                  y: TITLE_BAR_H,               w: canvasW, h: canvasH };
    case "tl":    return { x: 0,                  y: TITLE_BAR_H,               w: cornerW, h: cornerH };
    case "tr":    return { x: canvasW - cornerW,  y: TITLE_BAR_H,               w: cornerW, h: cornerH };
    case "bl":    return { x: 0,                  y: TITLE_BAR_H + cornerH,     w: cornerW, h: cornerH };
    case "br":    return { x: canvasW - cornerW,  y: TITLE_BAR_H + cornerH,     w: cornerW, h: cornerH };
  }
}

interface WindowProps {
  spec: WindowSpec;
  children: ReactNode;
}

/** A single floating window. Frame + title bar (traffic lights + drag) +
 *  children. Position/size/z driven by windowStore. Open animation via
 *  framer-motion. All colors flow from theme CSS variables. */
export function Window({ spec, children }: WindowProps) {
  const close = useWindowStore((s) => s.close);
  const minimize = useWindowStore((s) => s.minimize);
  const toggleMaximize = useWindowStore((s) => s.toggleMaximize);
  const focus = useWindowStore((s) => s.focus);
  const setPosition = useWindowStore((s) => s.setPosition);
  const setSize = useWindowStore((s) => s.setSize);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  // Live snap zone — shown as an accent overlay during drag, applied on drop.
  // The ref mirrors the state so `endDrag` can read the LATEST zone without
  // hitting a stale closure (React batches setState across pointer events).
  const [snapZone, setSnapZone] = useState<SnapZone>(null);
  const snapZoneRef = useRef<SnapZone>(null);
  type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
  const resizeStart = useRef<
    | { x: number; y: number; w: number; h: number; px: number; py: number; edge: ResizeEdge }
    | null
  >(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const isFocused = useWindowStore((s) => {
    if (s.windows.length === 0) return false;
    const top = s.windows.reduce((a, b) => (a.z > b.z ? a : b));
    return top.id === spec.id;
  });

  // Derive the running state for the specialist associated with this window
  // (if any). identityKey pattern: "chat:<id>" or "remote-desktop:<id>".
  const isStreaming = useSpecialistsStore((s) => {
    if (!spec.identityKey) return false;
    const m = spec.identityKey.match(/^(?:chat|remote-desktop):(.+)$/);
    if (!m) return false;
    return (s.byId[m[1]]?.state ?? null) === "running";
  });

  useEffect(() => {
    if (!isFocused || !bodyRef.current) return;
    const first = bodyRef.current.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    );
    first?.focus();
  }, [isFocused]);

  if (spec.minimized) return null;

  const fromRect = spec.originRect;
  const initial = fromRect
    ? {
        x: fromRect.left - spec.x,
        y: fromRect.top - spec.y,
        scale: Math.max(fromRect.width / spec.w, 0.1),
        opacity: 0.6,
      }
    : { scale: 0.6, opacity: 0 };

  const style: React.CSSProperties = spec.maximized
    ? { top: 8, left: 8, right: 8, bottom: 8, zIndex: spec.z }
    : {
        top: spec.y,
        left: spec.x,
        width: spec.w,
        height: spec.h,
        zIndex: spec.z,
      };

  function startDrag(e: React.PointerEvent) {
    if (spec.maximized) return;
    if ((e.target as HTMLElement).closest(".traffic-lights")) return;
    dragOffset.current = { x: e.clientX - spec.x, y: e.clientY - spec.y };
    focus(spec.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function doDrag(e: React.PointerEvent) {
    if (!dragOffset.current) return;
    const nx = e.clientX - dragOffset.current.x;
    const ny = e.clientY - dragOffset.current.y;
    setPosition(spec.id, Math.max(0, nx), Math.max(0, ny));
    // Aero-snap: detect edge proximity from POINTER position (not window
    // position) — feels right because the user is "aiming" with the cursor.
    if (typeof window !== "undefined") {
      const zone = detectSnapZone(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
      snapZoneRef.current = zone;
      setSnapZone(zone);
    }
  }

  function endDrag(e: React.PointerEvent) {
    dragOffset.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // pointer was never captured (e.g. drag never started) — fine.
    }
    // Drop-snap: read from the ref so we get the latest zone (state is
    // batched and stale at this exact callsite).
    const finalZone = snapZoneRef.current;
    if (finalZone && typeof window !== "undefined") {
      const rect = snapRect(finalZone, window.innerWidth, window.innerHeight);
      setPosition(spec.id, rect.x, rect.y);
      setSize(spec.id, rect.w, rect.h);
    } else {
      // No snap fired — but the drag may have landed on top of another
      // window. Shift to the nearest non-overlapping cascade slot so two
      // windows never end up with stacked title bars (open-time avoids
      // this; drop-time was the remaining hole).
      const all = useWindowStore.getState().windows;
      const safe = findNonOverlappingPosition(all, spec.x, spec.y, spec.w, spec.id);
      if (safe.x !== spec.x || safe.y !== spec.y) {
        setPosition(spec.id, safe.x, safe.y);
      }
    }
    snapZoneRef.current = null;
    setSnapZone(null);
  }

  const MIN_W = 260;
  const MIN_H = 180;

  function startResize(e: React.PointerEvent, edge: ResizeEdge) {
    if (spec.maximized) return;
    e.stopPropagation();
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      w: spec.w,
      h: spec.h,
      px: spec.x,
      py: spec.y,
      edge,
    };
    focus(spec.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function doResize(e: React.PointerEvent) {
    const r = resizeStart.current;
    if (!r) return;
    const dx = e.clientX - r.x;
    const dy = e.clientY - r.y;
    let w = r.w;
    let h = r.h;
    let x = r.px;
    let y = r.py;
    if (r.edge.includes("e")) w = r.w + dx;
    if (r.edge.includes("s")) h = r.h + dy;
    if (r.edge.includes("w")) {
      // Clamp first so dragging past MIN_W doesn't drift x off to the right.
      const proposedW = r.w - dx;
      w = Math.max(MIN_W, proposedW);
      x = r.px + (r.w - w);
    }
    if (r.edge.includes("n")) {
      const proposedH = r.h - dy;
      h = Math.max(MIN_H, proposedH);
      y = r.py + (r.h - h);
    }
    w = Math.max(MIN_W, w);
    h = Math.max(MIN_H, h);
    if (x !== r.px || y !== r.py) setPosition(spec.id, Math.max(0, x), Math.max(0, y));
    setSize(spec.id, w, h);
  }

  function endResize(e: React.PointerEvent) {
    resizeStart.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* never captured — fine */
    }
  }

  // Compute the snap-preview rectangle in absolute viewport coords so the
  // overlay can render outside this window's box. We render it as a portal-
  // free fixed-position div appended via the menu/status bar layer.
  const previewRect =
    snapZone && typeof window !== "undefined"
      ? snapRect(snapZone, window.innerWidth, window.innerHeight)
      : null;

  return (
    <>
      {previewRect && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: previewRect.x,
            top: previewRect.y,
            width: previewRect.w,
            height: previewRect.h,
            background: "color-mix(in srgb, var(--accent) 12%, transparent)",
            border: "2px solid var(--accent)",
            borderRadius: "var(--window-radius)",
            pointerEvents: "none",
            zIndex: 9999,
            transition: "all 100ms ease-out",
          }}
        />
      )}
    <motion.div
      className="absolute overflow-hidden backdrop-blur-md"
      style={{
        ...style,
        // panel-bg is the canonical translucent-solid surface (~92% per theme).
        // window-bg never existed in the chrome interface — this gives the
        // window an actual opaque base so the title bar's tint reads.
        background: "var(--panel-bg)",
        border: "1px solid var(--window-border)",
        borderRadius: "var(--window-radius)",
        boxShadow: "var(--window-shadow)",
      }}
      onPointerDown={() => focus(spec.id)}
      initial={initial}
      animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
      exit={{ scale: 0.6, opacity: 0 }}
      transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div
        className={`flex items-center gap-2.5 px-3.5 py-2 cursor-move select-none${isStreaming ? " title-bar-streaming" : ""}`}
        style={{
          // Layered: accent-tint wash on top of a solid panel surface so the
          // title bar reads as a defined band, not a see-through rectangle.
          background: "var(--titlebar-bg), var(--panel-bg)",
          borderBottom: "1px solid var(--window-border)",
          fontFamily: "var(--font-ui)",
          fontSize: 11.5,
        }}
        onPointerDown={startDrag}
        onPointerMove={doDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Icon + title — flush left. `flex-1` claims the slack so the
            traffic lights are pushed to the right edge. */}
        <span
          className="flex items-center gap-2 flex-1 min-w-0 truncate"
          style={{ color: "var(--fg)" }}
        >
          <span style={{ color: "var(--accent)" }}>{spec.icon}</span>
          <span className="truncate">{spec.title}</span>
        </span>
        {/* Window controls — Windows-style cluster on the right.
            Reading left-to-right: maximize ─ minimize ─ close. */}
        <div className="traffic-lights group flex gap-1.5">
          <TrafficLight
            kind="maximize"
            color="var(--tl-max)"
            glyph={spec.maximized ? "❐" : "+"}
            onClick={() => toggleMaximize(spec.id)}
          />
          <TrafficLight
            kind="minimize"
            color="var(--tl-min)"
            glyph="−"
            onClick={() => minimize(spec.id)}
          />
          <TrafficLight
            kind="close"
            color="var(--tl-close)"
            glyph="×"
            onClick={() => close(spec.id)}
          />
        </div>
      </div>
      <div
        ref={bodyRef}
        className="overflow-hidden"
        style={{
          // Title bar is ~38px tall. Body fills the remainder of spec.h.
          height: spec.maximized ? "calc(100vh - 54px)" : "calc(100% - 38px)",
          minHeight: 0,
        }}
      >
        {children}
      </div>
      {!spec.maximized && (
        <>
          {/* Edge handles — 8px-wide invisible strips on each side. */}
          <ResizeHandle edge="n" startResize={startResize} doResize={doResize} endResize={endResize} />
          <ResizeHandle edge="s" startResize={startResize} doResize={doResize} endResize={endResize} />
          <ResizeHandle edge="e" startResize={startResize} doResize={doResize} endResize={endResize} />
          <ResizeHandle edge="w" startResize={startResize} doResize={doResize} endResize={endResize} />
          <ResizeHandle edge="ne" startResize={startResize} doResize={doResize} endResize={endResize} />
          <ResizeHandle edge="nw" startResize={startResize} doResize={doResize} endResize={endResize} />
          <ResizeHandle edge="sw" startResize={startResize} doResize={doResize} endResize={endResize} />
          {/* SE corner stays VISIBLE with diagonal hatches — discoverability anchor. */}
          <div
            aria-label="resize"
            title="drag to resize"
            onPointerDown={(e) => startResize(e, "se")}
            onPointerMove={doResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              width: 18,
              height: 18,
              cursor: "nwse-resize",
              background:
                "linear-gradient(135deg, transparent 0 7px, var(--accent) 7px 8px, transparent 8px 10px, var(--accent) 10px 11px, transparent 11px 13px, var(--accent) 13px 14px, transparent 14px)",
              opacity: 0.85,
              zIndex: 2,
            }}
          />
        </>
      )}
    </motion.div>
    </>
  );
}

/* ── Edge / corner resize handle ────────────────────────────────────────── */

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const EDGE_STYLES: Record<ResizeEdge, React.CSSProperties> = {
  n:  { top: -3,  left: 10,  right: 10,  height: 8,  cursor: "ns-resize" },
  s:  { bottom: -3, left: 10, right: 18, height: 8,  cursor: "ns-resize" },
  e:  { right: -3,  top: 10, bottom: 18, width: 8,   cursor: "ew-resize" },
  w:  { left: -3,   top: 10, bottom: 10, width: 8,   cursor: "ew-resize" },
  ne: { top: -3, right: -3, width: 14, height: 14, cursor: "nesw-resize" },
  nw: { top: -3, left: -3,  width: 14, height: 14, cursor: "nwse-resize" },
  sw: { bottom: -3, left: -3, width: 14, height: 14, cursor: "nesw-resize" },
  se: { bottom: -3, right: -3, width: 14, height: 14, cursor: "nwse-resize" },
};

function ResizeHandle({
  edge,
  startResize,
  doResize,
  endResize,
}: {
  edge: ResizeEdge;
  startResize: (e: React.PointerEvent, edge: ResizeEdge) => void;
  doResize: (e: React.PointerEvent) => void;
  endResize: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      role="separator"
      aria-label={`resize-${edge}`}
      onPointerDown={(e) => startResize(e, edge)}
      onPointerMove={doResize}
      onPointerUp={endResize}
      onPointerCancel={endResize}
      style={{
        position: "absolute",
        background: "transparent",
        // Edge handles are invisible by design — the cursor change is the
        // affordance. Corner handles sit above edges so 14px diagonals win.
        zIndex: edge.length === 2 ? 3 : 1,
        ...EDGE_STYLES[edge],
      }}
    />
  );
}

/* ── Traffic light button ───────────────────────────────────────────────── */

function TrafficLight({
  kind,
  color,
  glyph,
  onClick,
}: {
  kind: "close" | "minimize" | "maximize";
  color: string;
  glyph: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={kind}
      title={kind}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="relative inline-flex h-3 w-3 items-center justify-center rounded-full p-0 transition-transform duration-100 hover:scale-110"
      style={{
        background: color,
        border: "none",
        color: "rgba(0,0,0,0.65)",
        fontSize: 9,
        fontWeight: 700,
        lineHeight: 1,
        // Glyph is invisible by default; the parent `.group:hover` reveals
        // it via the rule below so the dot reads as a clean mac-style chip
        // until the user moves over the title bar.
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-100"
        style={{ display: "inline-block", transform: "translateY(-0.5px)" }}
      >
        {glyph}
      </span>
    </button>
  );
}
