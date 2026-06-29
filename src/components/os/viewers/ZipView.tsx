"use client";

import { useEffect, useState } from "react";

interface Props {
  clientSlug: string;
  path: string;
}

const fileApiUrl = (slug: string, p: string) =>
  `/api/brain/file?slug=${encodeURIComponent(slug)}&path=${encodeURIComponent(p)}`;

const stateStyle: React.CSSProperties = {
  padding: 16,
  fontFamily: "var(--font-ui)",
  fontSize: 12,
};

interface ZipEntry {
  name: string;
  isDir: boolean;
  size: number;
}

/**
 * ZipView — load a .zip's central directory in the browser via JSZip and
 * render a sorted tree-style listing. We don't extract; this is a read-
 * only metadata view. The user can click any entry to download the
 * archive via the file API.
 */
export function ZipView({ clientSlug, path }: Props) {
  const [entries, setEntries] = useState<ZipEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);

    (async () => {
      try {
        const res = await fetch(fileApiUrl(clientSlug, path));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(buf);
        const list: ZipEntry[] = [];
        zip.forEach((entryPath, entry) => {
          list.push({
            name: entryPath,
            isDir: entry.dir,
            // jszip doesn't expose uncompressed size on the public API in
            // all versions; fall back to 0 if unavailable. The metadata
            // listing remains useful regardless.
            size:
              (entry as unknown as { _data?: { uncompressedSize?: number } })
                ._data?.uncompressedSize ?? 0,
          });
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        if (cancelled) return;
        setEntries(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientSlug, path]);

  if (error) return <div style={{ ...stateStyle, color: "var(--err)" }}>{error}</div>;
  if (entries == null) {
    return <div style={{ ...stateStyle, color: "var(--fg-muted)" }}>Reading archive…</div>;
  }

  const fileCount = entries.filter((e) => !e.isDir).length;
  const dirCount = entries.filter((e) => e.isDir).length;
  const totalBytes = entries.reduce((acc, e) => acc + e.size, 0);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: "var(--font-ui)",
        background: "var(--panel-bg)",
        color: "var(--fg)",
      }}
    >
      <header
        style={{
          padding: "8px 14px",
          borderBottom: "1px solid var(--chrome-border)",
          background: "var(--titlebar-bg)",
          fontSize: 11,
          color: "var(--fg-muted)",
          display: "flex",
          gap: 14,
        }}
      >
        <span>{fileCount} files</span>
        <span>{dirCount} folders</span>
        <span style={{ marginLeft: "auto" }}>{prettyBytes(totalBytes)}</span>
        <a
          href={fileApiUrl(clientSlug, path)}
          download={path.split("/").pop()}
          style={{ color: "var(--accent)", textDecoration: "underline" }}
        >
          download archive
        </a>
      </header>
      <ul
        style={{
          flex: 1,
          overflowY: "auto",
          margin: 0,
          padding: "6px 0",
          listStyle: "none",
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
          fontSize: 11.5,
        }}
      >
        {entries.map((e) => (
          <li
            key={e.name}
            style={{
              display: "flex",
              gap: 8,
              padding: "2px 14px",
              color: e.isDir ? "var(--accent)" : "var(--fg)",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ width: 14, textAlign: "center" }}>
              {e.isDir ? "📁" : "📄"}
            </span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
              {e.name}
            </span>
            {!e.isDir && e.size > 0 && (
              <span style={{ color: "var(--fg-faint)" }}>{prettyBytes(e.size)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
