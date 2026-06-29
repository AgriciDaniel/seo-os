"use client";

/**
 * `<ChartBlock>` — renders an inline chart from a fenced ` ```chart ``` `
 * block inside a vault markdown note.
 *
 * Chart-spec format (the contract specialists emit into markdown):
 *
 *   ```chart
 *   {"type":"bar","title":"Severity","x":"category","y":"count",
 *    "data":[{"category":"high","count":7},...]}
 *   ```
 *
 *   ```chart
 *   {"type":"donut","title":"Intent","ref":"./2026-05-13-content.data.json","field":"intent_mix"}
 *   ```
 *
 * When `ref` is present, the data is loaded from the sidecar via the
 * brain note-data endpoint. When `data` is inline, no fetch happens.
 *
 * Falls back to a small "(chart spec invalid)" placeholder rather than
 * throwing — broken charts must never crash the slide-over.
 */

import { useEffect, useMemo, useState } from "react";

import {
  BarChart,
  DonutChart,
  RadarChart,
  SeverityHistogram,
  Sparkline,
} from "./chart-svg";

export type ChartType = "bar" | "donut" | "radar" | "severity" | "sparkline";

export interface ChartSpec {
  type: ChartType;
  title?: string;
  /** Inline data (one of `data` or `ref` is required). */
  data?: unknown;
  /** Sidecar reference: a vault-relative `*.data.json` path. When set,
   *  the block fetches it and looks up `field` (or returns the whole
   *  payload). */
  ref?: string;
  /** Field path inside the sidecar — dot-separated. */
  field?: string;
  /** Optional severity counts for `type: "severity"`. */
  counts?: { high?: number; medium?: number; low?: number; info?: number };
  /** Optional fill colour for radar. */
  fill?: string;
}

interface Props {
  spec: ChartSpec;
  clientSlug: string;
  /** Vault-relative path of the note that hosts this chart — used to
   *  resolve relative `ref` values. */
  notePath: string;
}

export default function ChartBlock({ spec, clientSlug, notePath }: Props) {
  // Sidecar-fetched data only — the inline-data path is derived below
  // via useMemo so we never setState synchronously inside the effect.
  const [fetchedData, setFetchedData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const hasInline = spec.data !== undefined;

  useEffect(() => {
    if (hasInline) return;
    if (!spec.ref) return;
    const target = resolveRefPath(notePath, spec.ref);
    const url = `/api/brain/note-data?slug=${encodeURIComponent(clientSlug)}&path=${encodeURIComponent(target)}`;
    let cancelled = false;
    fetch(url)
      .then((r) => r.json())
      .then((json: { ok: boolean; data?: unknown; error?: string }) => {
        if (cancelled) return;
        if (!json.ok) {
          setError(json.error ?? "sidecar unavailable");
          return;
        }
        const payload = spec.field
          ? getFieldByPath(json.data, spec.field)
          : json.data;
        setError(null);
        setFetchedData(payload);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [clientSlug, notePath, hasInline, spec.ref, spec.field]);

  const resolvedData = hasInline ? spec.data : fetchedData;

  const content = useMemo(() => {
    if (error) {
      return (
        <p className="my-2 px-3 py-2 text-[11px] text-red-300/80 border border-red-900/40 bg-red-950/20">
          chart sidecar error: {error}
        </p>
      );
    }
    switch (spec.type) {
      case "severity": {
        const counts = spec.counts ?? (resolvedData as ChartSpec["counts"]) ?? {};
        return (
          <SeverityHistogram
            high={Number(counts.high ?? 0)}
            medium={Number(counts.medium ?? 0)}
            low={Number(counts.low ?? 0)}
            info={counts.info !== undefined ? Number(counts.info) : undefined}
          />
        );
      }
      case "bar": {
        const data = toBarData(resolvedData);
        if (data.length === 0) return <EmptyChartState title={spec.title} />;
        return <BarChart title={spec.title} data={data} />;
      }
      case "donut": {
        const data = toDonutData(resolvedData);
        if (data.length === 0) return <EmptyChartState title={spec.title} />;
        return <DonutChart title={spec.title} data={data} />;
      }
      case "radar": {
        const data = toRadarData(resolvedData);
        if (data.length === 0) return <EmptyChartState title={spec.title} />;
        return <RadarChart title={spec.title} data={data} fill={spec.fill} />;
      }
      case "sparkline": {
        const values = toNumberArray(resolvedData);
        if (values.length === 0 || values.every((value) => value === 0)) {
          return <EmptyChartState title={spec.title} />;
        }
        return <Sparkline title={spec.title} values={values} />;
      }
      default:
        return (
          <p className="my-2 text-[11px] text-ash">
            unknown chart type: {spec.type}
          </p>
        );
    }
  }, [spec, resolvedData, error]);

  return <div className="my-3">{content}</div>;
}

function EmptyChartState({ title }: { title?: string }) {
  return (
    <div className="my-3 border border-gold/45 bg-gold/10 px-4 py-3">
      <p className="label-micro text-gold">chart unavailable</p>
      <p className="mt-2 text-[13px] font-medium text-white">
        {title ?? "No chartable data"}
      </p>
      <p className="mt-1 text-[12px] leading-5 text-ash">
        The provider returned no rows for this chart. Read the findings below
        before treating the report as evidence.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* coercion                                                                    */
/* -------------------------------------------------------------------------- */

function toBarData(
  raw: unknown,
): Array<{ category: string; count: number }> {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      category: String(o.category ?? o.label ?? o.bin ?? ""),
      count: Number(o.count ?? o.value ?? 0),
    };
  });
}

function toDonutData(raw: unknown): Array<{ label: string; value: number }> {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      label: String(o.label ?? o.category ?? ""),
      value: Number(o.value ?? o.count ?? 0),
    };
  });
}

function toRadarData(raw: unknown): Array<{ label: string; value: number }> {
  if (Array.isArray(raw)) {
    return raw.map((r) => {
      const o = r as Record<string, unknown>;
      return {
        label: String(o.label ?? ""),
        value: Number(o.value ?? 0),
      };
    });
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>).map(([k, v]) => ({
      label: humanize(k),
      value: Number(v ?? 0),
    }));
  }
  return [];
}

function toNumberArray(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw.map((n) => Number(n));
  return [];
}

function humanize(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getFieldByPath(obj: unknown, dotted: string): unknown {
  let cur: unknown = obj;
  for (const part of dotted.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * Resolve a sidecar reference relative to the note's own path. Examples:
 *
 *   notePath = "wiki/audits/2026-05-13-technical.md"
 *   ref     = "./2026-05-13-technical.data.json"
 *   →       = "wiki/audits/2026-05-13-technical.data.json"
 *
 *   ref     = "wiki/audits/2026-05-13-content.data.json"   (absolute)
 *   →       = "wiki/audits/2026-05-13-content.data.json"
 */
function resolveRefPath(notePath: string, ref: string): string {
  if (!ref.startsWith(".")) return ref;
  const noteDir = notePath.includes("/")
    ? notePath.slice(0, notePath.lastIndexOf("/"))
    : "";
  const parts = `${noteDir}/${ref}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}
