"use client";

import { type ReactNode } from "react";

interface FolderRowProps {
  name: string;
  depth: number;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
}

export function FolderRow({ name, depth, expanded, onToggle, children }: FolderRowProps) {
  const indent = 14 + depth * 18;
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 text-left"
        style={{
          paddingLeft: indent, paddingRight: 14,
          paddingTop: 3.5, paddingBottom: 3.5,
          color: "var(--fg)", fontFamily: "var(--font-ui)",
          fontSize: 12, fontWeight: 600,
          background: "transparent", border: "none",
        }}
        aria-expanded={expanded}
      >
        <span style={{ color: "var(--fg-faint)", fontSize: 8.5, width: 10, textAlign: "center" }}>
          {expanded ? "▼" : "▶"}
        </span>
        <span style={{ color: "var(--accent)" }}>📁</span>
        <span>{name}</span>
      </button>
      {expanded && children}
    </>
  );
}
