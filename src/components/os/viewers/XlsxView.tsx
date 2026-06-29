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

interface SheetView {
  name: string;
  html: string;
}

/**
 * XlsxView — fetch raw .xlsx/.xls bytes and convert each sheet to an HTML
 * table via SheetJS. Sheet tabs let the user switch between sheets.
 * Tables render inside a sandboxed iframe srcDoc so the document can't
 * execute scripts.
 */
export function XlsxView({ clientSlug, path }: Props) {
  const [sheets, setSheets] = useState<SheetView[] | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSheets(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIdx(0);

    (async () => {
      try {
        const res = await fetch(fileApiUrl(clientSlug, path));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(buf, { type: "array" });
        const parsed: SheetView[] = workbook.SheetNames.map((name) => {
          const ws = workbook.Sheets[name];
          const html = XLSX.utils.sheet_to_html(ws, { editable: false });
          return { name, html: wrapInDocument(html) };
        });
        if (cancelled) return;
        setSheets(parsed);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientSlug, path]);

  if (error) return <div style={{ ...stateStyle, color: "var(--err)" }}>{error}</div>;
  if (sheets == null) {
    return <div style={{ ...stateStyle, color: "var(--fg-muted)" }}>Converting xlsx…</div>;
  }
  if (sheets.length === 0) {
    return (
      <div style={{ ...stateStyle, color: "var(--fg-muted)" }}>
        Workbook has no sheets.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {sheets.length > 1 && (
        <div
          role="tablist"
          style={{
            display: "flex",
            gap: 0,
            borderBottom: "1px solid var(--chrome-border)",
            background: "var(--titlebar-bg)",
            overflowX: "auto",
            flexShrink: 0,
          }}
        >
          {sheets.map((s, i) => (
            <button
              key={s.name}
              role="tab"
              aria-selected={i === activeIdx}
              onClick={() => setActiveIdx(i)}
              style={{
                padding: "5px 12px",
                fontSize: 11,
                fontFamily: "var(--font-ui)",
                background: "transparent",
                border: "none",
                borderBottom:
                  i === activeIdx
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                color: i === activeIdx ? "var(--fg)" : "var(--fg-muted)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <iframe
        title={`Sheet: ${sheets[activeIdx].name}`}
        srcDoc={sheets[activeIdx].html}
        sandbox=""
        style={{ flex: 1, width: "100%", border: 0, background: "white" }}
      />
    </div>
  );
}

function wrapInDocument(tableHtml: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 12px; color: #111; margin: 0; padding: 12px; }
  table { border-collapse: collapse; }
  td, th { border: 1px solid #cbd5e1; padding: 4px 8px; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
</style></head><body>${tableHtml}</body></html>`;
}
