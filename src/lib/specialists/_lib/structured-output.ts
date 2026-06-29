/**
 * Shared helpers for specialists that emit a structured `data` payload
 * alongside their markdown body.
 *
 * The pattern: the LLM is instructed to emit a trailing fenced
 * ` ```data ``` ` block containing JSON that matches one of the
 * `ReportData` discriminated-union members. This module extracts that
 * block, Zod-validates it via `safeParseReportData`, and produces:
 *
 *   - `data` — the typed payload (or null on parse/validation failure)
 *   - `cleanedBody` — the prose with the data block stripped
 *   - `bodyWithChart` — the prose with an inline ` ```chart ``` ` block
 *     prepended, referencing the `.data.json` sidecar
 *
 * Three real callers when the rollout finishes: technical-auditor (pilot,
 * proved the pattern), the 9 originally-flagged specialists, and the
 * 2 gcloud-branch specialists. That's why the helper exists at all —
 * the kernel rule "no abstraction without three real callers" is met.
 *
 * Forward-compat: if the model nudges the format slightly (extra
 * trailing whitespace, wrong heading prefix), the helpers degrade
 * gracefully — they return null data and full prose, so the markdown
 * still ships and the user is no worse off than the pre-upgrade
 * specialists.
 */
import "server-only";

import {
  safeParseReportData,
  type ReportData,
} from "./report-data";

const DATA_BLOCK_RE = /\n?```data\s*\n([\s\S]*?)\n```\s*$/i;
const TRAILING_HEADER_RE = /\n#{1,4}\s*Structured findings[^\n]*\n?\s*$/i;

/**
 * Extract the trailing ` ```data ``` ` block from `rawText`, parse it
 * with the discriminated union, and check the kind matches what the
 * caller expects.
 *
 * `expectedKind` is the discriminator the caller knows their specialist
 * emits. If the parsed kind doesn't match, we treat the whole thing as
 * "no valid data" so a model that emits the wrong shape doesn't
 * smuggle a mismatched payload into the wrong renderer.
 */
export function extractDataBlock<K extends ReportData["kind"]>(
  rawText: string,
  expectedKind: K,
): {
  data: Extract<ReportData, { kind: K }> | null;
  cleanedBody: string;
} {
  const match = rawText.match(DATA_BLOCK_RE);
  if (!match) return { data: null, cleanedBody: rawText };

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    return { data: null, cleanedBody: rawText };
  }

  const validated = safeParseReportData(parsed);
  if (!validated || validated.kind !== expectedKind) {
    return { data: null, cleanedBody: rawText };
  }

  const cleanedBody = rawText
    .replace(DATA_BLOCK_RE, "")
    .replace(TRAILING_HEADER_RE, "")
    .trimEnd();

  return {
    data: validated as Extract<ReportData, { kind: K }>,
    cleanedBody,
  };
}

/**
 * The shape of a fenced ` ```chart ``` ` block. The renderer (both
 * server-side `renderer.ts` and client-side `ChartBlock.tsx`) reads
 * `type` + `data` for inline data, or `type` + `ref` + `field` for a
 * sidecar reference.
 */
export interface ChartSpec {
  /** "bar" | "donut" | "radar" | "sparkline" | "severity" | "gauge" | "kpi" */
  type: string;
  title?: string;
  /** Inline data array — when present, `ref`/`field` are ignored. */
  data?: unknown;
  /** Relative path (`./<file>.data.json`) to the sidecar JSON. */
  ref?: string;
  /** Field name on the sidecar JSON to read. */
  field?: string;
  /** Free-form extras (e.g. height, palette) the renderer may consume. */
  [k: string]: unknown;
}

/**
 * Build the inline ` ```chart ``` ` block that gets prepended to the
 * markdown so the vault slide-over renders the chart above the prose.
 * The block is a fenced markdown code block with `language-chart` so
 * `MarkdownBody.tsx` routes it to `<ChartBlock>`.
 */
export function buildInlineChartBlock(spec: ChartSpec): string {
  return `\`\`\`chart\n${JSON.stringify(spec)}\n\`\`\``;
}

/**
 * Convenience wrapper: extract + validate + prepend chart in one call.
 * Returns the data (for passing to `writeArtifact`) and the final
 * `body` ready to ship.
 *
 * When `data` is null (parse failure), `body` is the raw text minus
 * any stripped block headers — same content the user would have seen
 * pre-upgrade. The caller passes `body` straight to `writeArtifact`
 * and omits the `data` field, which skips the sidecar + HTML report.
 */
export function applyStructuredOutput<K extends ReportData["kind"]>(opts: {
  rawText: string;
  expectedKind: K;
  /** When `data` parses successfully, this builder is called to make
   *  the inline chart block. Receives the typed data so it can derive
   *  the sidecar `ref` path or inline values. */
  chartSpec: (data: Extract<ReportData, { kind: K }>) => ChartSpec;
}): {
  data: Extract<ReportData, { kind: K }> | null;
  body: string;
} {
  const { data, cleanedBody } = extractDataBlock(opts.rawText, opts.expectedKind);
  if (!data) return { data: null, body: cleanedBody };

  const spec = opts.chartSpec(data);
  const body = `${buildInlineChartBlock(spec)}\n\n${cleanedBody}`;
  return { data, body };
}

/**
 * Helper used by every Slice 3.2 specialist to build the standard
 * sidecar reference path. The convention is
 * `./<date>-<type>.data.json` — same dir as the markdown.
 */
export function sidecarRef(today: string, type: string): string {
  return `./${today}-${type}.data.json`;
}
