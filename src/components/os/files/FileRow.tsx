"use client";

import type { CSSProperties } from "react";
import { ribbonKind, type RibbonKind } from "./ribbon-kind";

export { ribbonKind, type RibbonKind } from "./ribbon-kind";

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
      // Single-click both selects (for visual highlight) AND opens the file
      // window. Files-app-style double-click-to-open felt unresponsive in
      // a sidebar — users expect one click → window appears.
      onClick={() => {
        onSelect();
        onOpen();
      }}
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
