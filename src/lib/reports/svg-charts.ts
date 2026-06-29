/**
 * Pure-function SVG chart generators.
 *
 * Returns strings (NOT React) so the same module powers:
 *   - The standalone HTML report renderer (`src/lib/reports/renderer.ts`),
 *     which string-concats SVG into a complete `<!DOCTYPE html>` document.
 *   - The in-app `<ChartBlock>` component, which calls these via React
 *     wrappers in `src/components/vault/chart-svg.tsx` and injects with
 *     `dangerouslySetInnerHTML` (safe — the strings are server-generated).
 *
 * Single source of truth for the dark visual language: palette, geometry,
 * dimensions. No external deps.
 *
 * Each generator:
 *   - Uses an explicit `viewBox` so SVG scales fluidly into any container.
 *   - Renders dark-mode-native (graphite background, gold/emerald accents).
 *   - Survives empty data with a "(no data)" placeholder rather than throwing.
 */

/* -------------------------------------------------------------------------- */
/* palette                                                                     */
/* -------------------------------------------------------------------------- */

export const CHART_PALETTE = {
  bg: "#0a0a0d",
  card: "#16161a",
  grid: "#27272a",
  axis: "#3f3f46",
  text: "#e5e7eb",
  muted: "#9ca3af",
  accent: "#facc15", // gold
  emerald: "#10b981",
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#10b981",
  info: "#60a5fa",
} as const;

const CHART_W = 760;
const FONT =
  'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
const TITLE_SIZE = 15;
const LABEL_SIZE = 13;
const SMALL_LABEL_SIZE = 12;
const VALUE_SIZE = 14;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* -------------------------------------------------------------------------- */
/* bar chart                                                                   */
/* -------------------------------------------------------------------------- */

export interface BarDatum {
  category: string;
  count: number;
}

export interface BarChartOpts {
  title?: string;
  data: BarDatum[];
  /** Optional per-bar fill, keyed by category. */
  colorByCategory?: Record<string, string>;
  height?: number;
}

export function barChartSvg(opts: BarChartOpts): string {
  const w = CHART_W;
  const h = opts.height ?? 340;
  if (opts.data.length === 0) return emptyPlaceholderSvg(w, h, opts.title);

  const needsHorizontalLayout =
    opts.data.length > 6 || opts.data.some((d) => d.category.length > 14);
  if (needsHorizontalLayout) return horizontalBarChartSvg(opts);

  const padding = { top: 52, right: 28, bottom: 52, left: 58 };
  const inner = {
    w: w - padding.left - padding.right,
    h: h - padding.top - padding.bottom,
  };
  const max = Math.max(1, ...opts.data.map((d) => d.count));
  const barGap = 8;
  const barW = (inner.w - barGap * (opts.data.length - 1)) / opts.data.length;

  const bars = opts.data
    .map((d, i) => {
      const barH = (d.count / max) * inner.h;
      const x = padding.left + i * (barW + barGap);
      const y = padding.top + inner.h - barH;
      const fill =
        opts.colorByCategory?.[d.category] ?? CHART_PALETTE.accent;
      const label = truncateLabel(d.category, Math.max(4, Math.floor(barW / 5)));
      return `
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${fill}" rx="2" />
        <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" fill="${CHART_PALETTE.text}" font-size="${VALUE_SIZE}" text-anchor="middle" font-family="${FONT}" font-weight="600">${d.count}</text>
        <text x="${(x + barW / 2).toFixed(1)}" y="${(padding.top + inner.h + 28).toFixed(1)}" fill="${CHART_PALETTE.muted}" font-size="${SMALL_LABEL_SIZE}" text-anchor="middle" font-family="${FONT}">${escapeXml(label)}</text>`;
    })
    .join("");

  const title = opts.title
    ? `<text x="${padding.left}" y="30" fill="${CHART_PALETTE.text}" font-size="${TITLE_SIZE}" font-family="${FONT}" font-weight="700" letter-spacing="0.04em" text-transform="uppercase">${escapeXml(opts.title)}</text>`
    : "";

  return wrap(
    w,
    h,
    `${title}
     <line x1="${padding.left}" y1="${padding.top + inner.h}" x2="${padding.left + inner.w}" y2="${padding.top + inner.h}" stroke="${CHART_PALETTE.axis}" stroke-width="1" />
     ${bars}`,
  );
}

function horizontalBarChartSvg(opts: BarChartOpts): string {
  const w = CHART_W;
  const rowH = 34;
  const padding = { top: 54, right: 72, bottom: 24, left: 244 };
  const h = Math.max(opts.height ?? 340, padding.top + opts.data.length * rowH + padding.bottom);
  const innerW = w - padding.left - padding.right;
  const max = Math.max(1, ...opts.data.map((d) => d.count));

  const rows = opts.data
    .map((d, i) => {
      const y = padding.top + i * rowH;
      const barH = 14;
      const barW = Math.max(2, (d.count / max) * innerW);
      const fill = opts.colorByCategory?.[d.category] ?? CHART_PALETTE.accent;
      const label = truncateLabel(d.category, 28);
      return `
        <text x="${padding.left - 14}" y="${(y + 14).toFixed(1)}" fill="${CHART_PALETTE.muted}" font-size="${SMALL_LABEL_SIZE}" text-anchor="end" font-family="${FONT}">${escapeXml(label)}</text>
        <rect x="${padding.left}" y="${y.toFixed(1)}" width="${innerW}" height="${barH}" fill="${CHART_PALETTE.grid}" rx="2" opacity="0.55" />
        <rect x="${padding.left}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH}" fill="${fill}" rx="2" />
        <text x="${w - padding.right + 12}" y="${(y + 14).toFixed(1)}" fill="${CHART_PALETTE.text}" font-size="${SMALL_LABEL_SIZE}" font-family="${FONT}" font-weight="600">${d.count}</text>`;
    })
    .join("");

  const title = opts.title
    ? `<text x="24" y="30" fill="${CHART_PALETTE.text}" font-size="${TITLE_SIZE}" font-family="${FONT}" font-weight="700" letter-spacing="0.04em" text-transform="uppercase">${escapeXml(opts.title)}</text>`
    : "";

  return wrap(w, h, `${title}${rows}`);
}

/* -------------------------------------------------------------------------- */
/* donut chart                                                                 */
/* -------------------------------------------------------------------------- */

export interface DonutDatum {
  label: string;
  value: number;
}

export interface DonutChartOpts {
  title?: string;
  data: DonutDatum[];
  height?: number;
}

const DONUT_COLORS = [
  CHART_PALETTE.accent,
  CHART_PALETTE.emerald,
  CHART_PALETTE.info,
  "#a78bfa",
  "#f472b6",
  "#fb923c",
  "#22d3ee",
  "#facc15",
];

export function donutChartSvg(opts: DonutChartOpts): string {
  const w = CHART_W;
  const h = Math.max(opts.height ?? 340, 76 + opts.data.length * 30);
  if (opts.data.length === 0) return emptyPlaceholderSvg(w, h, opts.title);

  const total = opts.data.reduce((acc, d) => acc + Math.max(0, d.value), 0);
  if (total <= 0) return emptyPlaceholderSvg(w, h, opts.title);

  const cx = 156;
  const cy = h / 2 + 6;
  const r = 106;
  const inner = 66;

  let theta = -Math.PI / 2; // start at 12 o'clock
  const slices = opts.data
    .map((d, i) => {
      const frac = Math.max(0, d.value) / total;
      const angle = frac * Math.PI * 2;
      const x1 = cx + Math.cos(theta) * r;
      const y1 = cy + Math.sin(theta) * r;
      const x2 = cx + Math.cos(theta + angle) * r;
      const y2 = cy + Math.sin(theta + angle) * r;
      const xi1 = cx + Math.cos(theta + angle) * inner;
      const yi1 = cy + Math.sin(theta + angle) * inner;
      const xi2 = cx + Math.cos(theta) * inner;
      const yi2 = cy + Math.sin(theta) * inner;
      const large = angle > Math.PI ? 1 : 0;
      const path =
        `M ${x1.toFixed(2)} ${y1.toFixed(2)} ` +
        `A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} ` +
        `L ${xi1.toFixed(2)} ${yi1.toFixed(2)} ` +
        `A ${inner} ${inner} 0 ${large} 0 ${xi2.toFixed(2)} ${yi2.toFixed(2)} Z`;
      theta += angle;
      return `<path d="${path}" fill="${DONUT_COLORS[i % DONUT_COLORS.length]}" />`;
    })
    .join("");

  const legend = opts.data
    .map((d, i) => {
      const y = 52 + i * 28;
      const color = DONUT_COLORS[i % DONUT_COLORS.length];
      const pct = ((Math.max(0, d.value) / total) * 100).toFixed(0);
      const label = truncateLabel(d.label, 32);
      return `
        <rect x="334" y="${y - 12}" width="14" height="14" fill="${color}" rx="2" />
        <text x="358" y="${y}" fill="${CHART_PALETTE.text}" font-size="${LABEL_SIZE}" font-family="${FONT}">${escapeXml(label)}</text>
        <text x="${w - 44}" y="${y}" fill="${CHART_PALETTE.muted}" font-size="${LABEL_SIZE}" text-anchor="end" font-family="${FONT}">${pct}%</text>`;
    })
    .join("");

  const title = opts.title
    ? `<text x="24" y="30" fill="${CHART_PALETTE.text}" font-size="${TITLE_SIZE}" font-family="${FONT}" font-weight="700" letter-spacing="0.04em" text-transform="uppercase">${escapeXml(opts.title)}</text>`
    : "";

  return wrap(w, h, `${title}${slices}${legend}`);
}

/* -------------------------------------------------------------------------- */
/* radar chart                                                                 */
/* -------------------------------------------------------------------------- */

export interface RadarDatum {
  label: string;
  /** 0–100. */
  value: number;
}

export interface RadarChartOpts {
  title?: string;
  data: RadarDatum[];
  height?: number;
  fill?: string;
}

export function radarChartSvg(opts: RadarChartOpts): string {
  const w = CHART_W;
  const h = opts.height ?? 380;
  if (opts.data.length < 3) return emptyPlaceholderSvg(w, h, opts.title);

  const cx = w / 2;
  const cy = h / 2 + 16;
  const r = Math.min(cx, cy) - 82;
  const n = opts.data.length;

  // axis lines + labels
  const axisLines: string[] = [];
  const labels: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const x = cx + Math.cos(t) * r;
    const y = cy + Math.sin(t) * r;
    axisLines.push(
      `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${CHART_PALETTE.axis}" stroke-width="1" />`,
    );
    const lx = cx + Math.cos(t) * (r + 28);
    const ly = cy + Math.sin(t) * (r + 28) + 5;
    const anchor =
      Math.cos(t) > 0.3 ? "start" : Math.cos(t) < -0.3 ? "end" : "middle";
    labels.push(
      `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${CHART_PALETTE.muted}" font-size="${LABEL_SIZE}" text-anchor="${anchor}" font-family="${FONT}">${escapeXml(opts.data[i].label)}</text>`,
    );
  }

  // concentric reference rings
  const rings: string[] = [];
  for (const frac of [0.25, 0.5, 0.75, 1]) {
    const points: string[] = [];
    for (let i = 0; i < n; i++) {
      const t = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const x = cx + Math.cos(t) * r * frac;
      const y = cy + Math.sin(t) * r * frac;
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    rings.push(
      `<polygon points="${points.join(" ")}" fill="none" stroke="${CHART_PALETTE.grid}" stroke-width="1" />`,
    );
  }

  // data polygon
  const dataPoints: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const v = Math.max(0, Math.min(100, opts.data[i].value)) / 100;
    const x = cx + Math.cos(t) * r * v;
    const y = cy + Math.sin(t) * r * v;
    dataPoints.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const fill = opts.fill ?? CHART_PALETTE.accent;
  const polygon = `<polygon points="${dataPoints.join(" ")}" fill="${fill}" fill-opacity="0.2" stroke="${fill}" stroke-width="1.5" />`;

  const title = opts.title
    ? `<text x="24" y="30" fill="${CHART_PALETTE.text}" font-size="${TITLE_SIZE}" font-family="${FONT}" font-weight="700" letter-spacing="0.04em" text-transform="uppercase">${escapeXml(opts.title)}</text>`
    : "";

  return wrap(
    w,
    h,
    `${title}${rings.join("")}${axisLines.join("")}${polygon}${labels.join("")}`,
  );
}

/* -------------------------------------------------------------------------- */
/* sparkline                                                                   */
/* -------------------------------------------------------------------------- */

export interface SparklineOpts {
  title?: string;
  values: number[];
  height?: number;
}

export function sparklineSvg(opts: SparklineOpts): string {
  const w = CHART_W;
  const h = opts.height ?? 100;
  if (opts.values.length === 0) return emptyPlaceholderSvg(w, h, opts.title);
  const padding = { top: 24, right: 12, bottom: 12, left: 12 };
  const inner = {
    w: w - padding.left - padding.right,
    h: h - padding.top - padding.bottom,
  };
  const min = Math.min(...opts.values);
  const max = Math.max(...opts.values);
  const range = max - min || 1;
  const stepX = inner.w / Math.max(1, opts.values.length - 1);
  const points = opts.values
    .map((v, i) => {
      const x = padding.left + i * stepX;
      const y = padding.top + inner.h - ((v - min) / range) * inner.h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const title = opts.title
    ? `<text x="${padding.left}" y="18" fill="${CHART_PALETTE.muted}" font-size="${SMALL_LABEL_SIZE}" font-family="${FONT}" letter-spacing="0.06em" text-transform="uppercase">${escapeXml(opts.title)}</text>`
    : "";

  return wrap(
    w,
    h,
    `${title}<polyline points="${points}" fill="none" stroke="${CHART_PALETTE.emerald}" stroke-width="1.75" />`,
  );
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

function wrap(w: number, h: number, inner: string): string {
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:auto;max-width:${w}px"><rect width="${w}" height="${h}" fill="${CHART_PALETTE.card}" rx="4" />${inner}</svg>`;
}

function emptyPlaceholderSvg(w: number, h: number, title?: string): string {
  const t = title
    ? `<text x="${w / 2}" y="${h / 2 - 8}" fill="${CHART_PALETTE.muted}" font-size="${TITLE_SIZE}" text-anchor="middle" font-family="${FONT}" font-weight="700" letter-spacing="0.04em" text-transform="uppercase">${escapeXml(title)}</text>`
    : "";
  return wrap(
    w,
    h,
    `${t}<text x="${w / 2}" y="${h / 2 + 16}" fill="${CHART_PALETTE.muted}" font-size="${LABEL_SIZE}" text-anchor="middle" font-family="${FONT}">(no data)</text>`,
  );
}

function truncateLabel(label: string, maxChars: number): string {
  if (label.length <= maxChars) return label;
  if (maxChars <= 1) return "…";
  return `${label.slice(0, maxChars - 1)}…`;
}

/* -------------------------------------------------------------------------- */
/* convenience: severity histogram                                             */
/* -------------------------------------------------------------------------- */

export function severityHistogramSvg(counts: {
  high: number;
  medium: number;
  low: number;
  info?: number;
}): string {
  const data: BarDatum[] = [
    { category: "high", count: counts.high },
    { category: "medium", count: counts.medium },
    { category: "low", count: counts.low },
  ];
  if (counts.info && counts.info > 0) {
    data.push({ category: "info", count: counts.info });
  }
  return barChartSvg({
    title: "Severity",
    data,
    colorByCategory: {
      high: CHART_PALETTE.high,
      medium: CHART_PALETTE.medium,
      low: CHART_PALETTE.low,
      info: CHART_PALETTE.info,
    },
  });
}
