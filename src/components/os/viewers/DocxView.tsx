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

/**
 * DocxView — fetch the raw .docx bytes and convert to HTML on the client
 * via Mammoth. Renders inside a sandboxed iframe srcDoc so the converted
 * HTML can't execute scripts or fetch external resources.
 *
 * For legacy .doc (binary), Mammoth cannot read those — caller should
 * route those to the download fallback.
 */
export function DocxView({ clientSlug, path }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHtml(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);

    (async () => {
      try {
        const res = await fetch(fileApiUrl(clientSlug, path));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        // Dynamic import keeps mammoth out of the main bundle; it only
        // loads when a user actually opens a .docx file.
        const mammoth = await import("mammoth/mammoth.browser");
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        if (cancelled) return;
        setHtml(wrapInDocument(result.value));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientSlug, path]);

  if (error) return <div style={{ ...stateStyle, color: "var(--err)" }}>{error}</div>;
  if (html == null) {
    return (
      <div style={{ ...stateStyle, color: "var(--fg-muted)" }}>
        Converting docx…
      </div>
    );
  }

  return (
    <iframe
      title="DOCX preview"
      srcDoc={html}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      style={{ width: "100%", height: "100%", border: 0, background: "white" }}
    />
  );
}

/** Wrap the converted body HTML in a minimal document with sane typography. */
function wrapInDocument(body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #111; margin: 24px 36px; max-width: 780px; }
  h1,h2,h3,h4 { line-height: 1.3; margin-top: 1.4em; }
  p { margin: 0.6em 0; }
  table { border-collapse: collapse; margin: 0.8em 0; }
  td, th { border: 1px solid #ccc; padding: 6px 10px; }
  img { max-width: 100%; height: auto; }
  pre { background: #f4f4f4; padding: 10px; overflow-x: auto; }
  code { background: #f4f4f4; padding: 0 4px; }
  a { color: #1d4ed8; }
</style></head><body>${body}</body></html>`;
}
