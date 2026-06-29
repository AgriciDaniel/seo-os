"use client";

/**
 * React wrappers around the pure-string SVG generators in
 * `src/lib/reports/svg-charts.ts`. Single source of truth for the visual
 * language between the in-app vault slide-over and the standalone HTML
 * reports — both call the same underlying generators so a bar chart looks
 * identical in either surface.
 *
 * We injection-paint the server-generated SVG string into a div via
 * `dangerouslySetInnerHTML`. This is safe because (a) the strings are
 * produced server-side from typed data, and (b) the SVG generators
 * XML-escape every text value before insertion. The chart spec arriving
 * from the vault is JSON-parsed, not interpreted as code.
 */

import {
  barChartSvg,
  donutChartSvg,
  radarChartSvg,
  severityHistogramSvg,
  sparklineSvg,
  type BarChartOpts,
  type DonutChartOpts,
  type RadarChartOpts,
  type SparklineOpts,
} from "@/lib/reports/svg-charts";

function SvgFromString({ markup }: { markup: string }) {
  return (
    <div
      className="vault-chart"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

export function BarChart(opts: BarChartOpts) {
  return <SvgFromString markup={barChartSvg(opts)} />;
}

export function DonutChart(opts: DonutChartOpts) {
  return <SvgFromString markup={donutChartSvg(opts)} />;
}

export function RadarChart(opts: RadarChartOpts) {
  return <SvgFromString markup={radarChartSvg(opts)} />;
}

export function Sparkline(opts: SparklineOpts) {
  return <SvgFromString markup={sparklineSvg(opts)} />;
}

export function SeverityHistogram(counts: {
  high: number;
  medium: number;
  low: number;
  info?: number;
}) {
  return <SvgFromString markup={severityHistogramSvg(counts)} />;
}
