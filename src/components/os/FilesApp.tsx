"use client";

import { useEffect, useState } from "react";
import { buildFolderTree } from "@/lib/brain/folder-tree";
import { useWindowStore } from "@/store/windows";
import { FolderView } from "./files/FolderView";
import { FileRow } from "./files/FileRow";

interface VaultNote {
  path: string;
  title: string;
  type: string;
  approval_status: string | null;
  risk_level: string | null;
  confidence: string | null;
  owner: string | null;
  created: string;
  updated: string;
}

interface FilesAppProps {
  clientSlug: string;
}

function fileIcon(path: string): string {
  const ext = (path.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
  if (ext === ".md" || ext === ".markdown") return "📄";
  if (ext === ".pdf") return "📕";
  if (ext === ".html" || ext === ".htm") return "🌐";
  if (ext === ".json" || ext === ".yaml" || ext === ".yml") return "🧾";
  if (ext === ".csv" || ext === ".tsv") return "📊";
  if (ext === ".xlsx" || ext === ".xls") return "📊";
  if (ext === ".docx" || ext === ".doc") return "📝";
  if (ext === ".mp3" || ext === ".wav" || ext === ".ogg" || ext === ".m4a" || ext === ".flac") return "🔊";
  if (ext === ".mp4" || ext === ".webm" || ext === ".mov" || ext === ".m4v") return "🎬";
  if (ext === ".zip" || ext === ".tar" || ext === ".gz" || ext === ".tgz") return "🗜";
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp" || ext === ".gif") return "🖼";
  return "📄";
}

function defaultSize(path: string): { w: number; h: number } {
  const ext = (path.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
  if (ext === ".pdf") return { w: 720, h: 800 };
  if (ext === ".html" || ext === ".htm") return { w: 800, h: 620 };
  if (ext === ".docx" || ext === ".doc") return { w: 720, h: 800 };
  if (ext === ".xlsx" || ext === ".xls") return { w: 900, h: 600 };
  if (ext === ".mp4" || ext === ".webm" || ext === ".mov" || ext === ".m4v") return { w: 800, h: 540 };
  if (ext === ".mp3" || ext === ".wav" || ext === ".ogg" || ext === ".m4a" || ext === ".flac") return { w: 540, h: 200 };
  if (ext === ".zip" || ext === ".tar" || ext === ".gz" || ext === ".tgz") return { w: 600, h: 520 };
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") return { w: 640, h: 560 };
  return { w: 560, h: 540 };
}

export function FilesApp({ clientSlug }: FilesAppProps) {
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const openWindow = useWindowStore((s) => s.open);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/brain?slug=${encodeURIComponent(clientSlug)}`)
      .then(async (res) => {
        if (cancelled) return;
        const data = await res.json();
        if (!data.ok) throw new Error(data.error ?? "Failed to load vault");
        setNotes(data.notes ?? []);
      })
      .catch((e) => { if (!cancelled) setError(String(e?.message ?? e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientSlug]);

  const openFile = (path: string, title?: string) => {
    const { w, h } = defaultSize(path);
    openWindow({
      kind: "note",
      title: title ?? path.split("/").pop() ?? path,
      icon: fileIcon(path),
      identityKey: `note:${clientSlug}:${path}`,
      contentProps: { clientSlug, path },
      w,
      h,
    });
  };

  const tree = buildFolderTree(
    notes.map((n) => ({
      ...n,
      approval_status: n.approval_status ?? undefined,
    }))
  );

  if (loading) {
    return (
      <div style={{ padding: 16, color: "var(--fg-muted)", fontFamily: "var(--font-ui)", fontSize: 12 }}>
        Loading vault…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16, color: "var(--err)", fontFamily: "var(--font-ui)", fontSize: 12 }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      {tree.folders.map((folder) => (
        <FolderView
          key={folder.path}
          folder={folder}
          depth={0}
          selectedPath={selectedPath}
          onSelect={(note) => setSelectedPath(note.path)}
          onOpen={(note) => openFile(note.path, note.title)}
          defaultExpanded
        />
      ))}
      {tree.files.map(({ note }) => (
        <FileRow
          key={note.path}
          title={note.title ?? note.path.split("/").pop()!}
          path={note.path}
          approvalStatus={note.approval_status}
          selected={selectedPath === note.path}
          depth={0}
          onSelect={() => setSelectedPath(note.path)}
          onOpen={() => openFile(note.path, note.title)}
        />
      ))}
    </div>
  );
}
