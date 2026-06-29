"use client";

import { useState } from "react";
import { FolderRow } from "./FolderRow";
import { FileRow } from "./FileRow";
import type { FolderNode } from "@/lib/brain/folder-tree";

interface VaultNote {
  path: string;
  title?: string;
  approval_status?: string;
}

interface FolderViewProps<TNote extends VaultNote> {
  folder: FolderNode<TNote>;
  depth: number;
  selectedPath: string | null;
  onSelect: (note: TNote) => void;
  onOpen: (note: TNote) => void;
  defaultExpanded?: boolean;
}

export function FolderView<TNote extends VaultNote>({
  folder, depth, selectedPath, onSelect, onOpen, defaultExpanded = false,
}: FolderViewProps<TNote>) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <FolderRow name={folder.name} depth={depth} expanded={expanded} onToggle={() => setExpanded((v) => !v)}>
      {folder.folders.map((sub) => (
        <FolderView key={sub.path} folder={sub} depth={depth + 1}
          selectedPath={selectedPath} onSelect={onSelect} onOpen={onOpen} />
      ))}
      {folder.files.map(({ note }) => (
        <FileRow
          key={note.path}
          title={note.title ?? note.path.split("/").pop()!}
          path={note.path}
          approvalStatus={note.approval_status}
          selected={selectedPath === note.path}
          depth={depth + 1}
          onSelect={() => onSelect(note)}
          onOpen={() => onOpen(note)}
        />
      ))}
    </FolderRow>
  );
}
