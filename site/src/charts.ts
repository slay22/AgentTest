import { z } from 'zod';
import { escapeHtml } from './markdown.ts';

// Charts, generated from a data spec rather than from markup.
//
// The fenced block in a post contains JSON — labels and numbers — and this module
// turns it into SVG. That ordering is the whole point:
//
//   - The model never supplies markup, only data, so a chart cannot become a hole
//     in the escape-first renderer. Raw HTML stays escaped; see markdown.ts.
//   - The numbers are explicit and machine-readable, so a figure in a diagram can
//     be checked the same way a figure in a sentence is.
//   - Mermaid was the obvious alternative and is the wrong tool for this: it needs
//     a ~1MB client script, it runs on the reader's machine, and it can emit its
//     own markup. For a bar chart, SVG generated here is smaller, deterministic,
//     dependency-free, and works with JavaScript disabled.
//   - Diagrams (flowcharts, sequence diagrams) are where mermaid earns its weight
//     and are a separate decision.

const item = z.object({
  label: z.string().min(1).max(40),
  value: z.number().finite(),
  /** Optional per-item note, e.g. the source of this particular figure. */
  note: z.string().max(60).optional(),
});

const barChart = z.object({
  type: z.literal('bar'),
  title: z.string().min(1).max(60),
  /** What the numbers mean, e.g. "USD per 1,000 decisions". */
  unit: z.string().min(1).max(40),
  /** Where the numbers came from. Required — an unsourced figure is a claim. */
  source: z.string().min(1).max(200),
  /**
   * How bar lengths map to values.
   *
   * `linear` is the default and the honest one for anything within a small
   * multiple. `log` exists because cost and latency comparisons routinely span two
   * or three orders of magnitude, and on a linear axis the cheap bar collapses to
   * a sliver indistinguishable from one five times larger. A log chart says so in
   * the caption, and its axis ticks are labelled, so it cannot quietly mislead.
   * All values must be positive.
   */
  scale: z.enum(['linear', 'log']).default('linear'),
  items: z.array(item).min(2).max(8),
});

export const chartSpec = z.discriminatedUnion('type', [barChart]);
export type ChartSpec = z.infer<typeof chartSpec>;

export type ChartResult =
  | { ok: true; svg: string; spec: ChartSpec }
  | { ok: false; error: string };

/** Parse and validate a chart spec. Errors are for the author, not the reader. */
export function parseChartSpec(raw: string): ChartResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return { ok: false, error: `not valid JSON: ${(error as Error).message}` };
  }

  const parsed = chartSpec.safeParse(json);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'spec'} ${issue.message}`)
      .join('; ');
    return { ok: false, error: detail };
  }
  try {
    return { ok: true, svg: renderBarChart(parsed.data), spec: parsed.data };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

const WIDTH = 720;
const LABEL_WIDTH = 190;
const ROW_HEIGHT = 34;
const BAR_HEIGHT = 18;
const PAD = 18;

function renderBarChart(spec: ChartSpec): string {
  const rows = spec.items.length;
  const values = spec.items.map((entry) => entry.value);
  const log = spec.scale === 'log';
  const chartTop = log ? 74 : 54;
  const height = chartTop + rows * ROW_HEIGHT + 40;
  const plotWidth = WIDTH - LABEL_WIDTH - PAD * 2 - 72;

  if (log && values.some((value) => value <= 0)) {
    // A log axis cannot represent zero or a negative value, and silently dropping
    // the bar would hide a figure. Better to refuse and say so.
    throw new Error('a log scale needs every value to be greater than zero');
  }

  // Bars are scaled to the largest value so the comparison is honest: no truncated
  // baseline, because a bar chart with a cut axis misleads. On a log scale the
  // baseline cannot be zero either, which is why the caption says "log scale".
  const max = Math.max(...values);
  const min = Math.min(...values);

  // On a log scale the axis runs between whole decades, and the bars must use the
  // same bounds as the gridlines or they will not line up with their own axis.
  // Scaling from the smallest *value* instead would give that value zero width —
  // it would collapse to the clamp while sitting under a gridline labelled lower.
  const axisLow = log ? Math.floor(Math.log10(min)) : 0;
  const axisHigh = log ? Math.ceil(Math.log10(max)) : 0;
  const axisSpan = axisHigh - axisLow;

  const scale = (value: number): number => {
    if (max <= 0) return 0;
    if (!log) return (value / max) * plotWidth;
    if (axisSpan === 0) return plotWidth;
    return ((Math.log10(value) - axisLow) / axisSpan) * plotWidth;
  };

  // Decade ticks, so the axis is readable rather than implying linear steps.
  const axis = log ? renderLogAxis(chartTop, rows, plotWidth, axisLow, axisSpan) : '';

  const bars = spec.items
    .map((entry, index) => {
      const y = chartTop + index * ROW_HEIGHT;
      const width = Math.max(2, Math.round(scale(entry.value)));
      const value = formatValue(entry.value);
      // Labels sit in their own column so a long one cannot collide with the bar,
      // and the value is placed outside the bar so it stays readable when short.
      return `  <g>
    <text class="chart-label" x="0" y="${y + BAR_HEIGHT - 4}">${escapeHtml(entry.label)}</text>
    <rect class="chart-bar" x="${LABEL_WIDTH}" y="${y}" width="${width}" height="${BAR_HEIGHT}" rx="3" />
    <text class="chart-value" x="${LABEL_WIDTH + width + 8}" y="${y + BAR_HEIGHT - 4}">${escapeHtml(value)}</text>
  </g>`;
    })
    .join('\n');

  // role="img" with a summary label: the figure is one image to a screen reader,
  // and the numbers are also in the surrounding prose because a chart alone is
  // not accessible.
  const summary = spec.items
    .map((entry) => `${entry.label}: ${formatValue(entry.value)} ${spec.unit}`)
    .join('; ');

  return `<figure class="chart">
  <figcaption class="chart-title">${escapeHtml(spec.title)}</figcaption>
  <svg viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${escapeHtml(`${spec.title}. ${summary}`)}" preserveAspectRatio="xMidYMid meet">
${axis}
${bars}
  </svg>
  <figcaption class="chart-meta">${escapeHtml(spec.unit)}${log ? ' · log scale' : ''} · Source: ${escapeHtml(spec.source)}</figcaption>
</figure>`;
}

/** Decade gridlines with their values, drawn behind the bars. */
function renderLogAxis(
  chartTop: number,
  rows: number,
  plotWidth: number,
  axisLow: number,
  axisSpan: number,
): string {
  const bottom = chartTop + rows * ROW_HEIGHT - 6;
  const span = axisSpan || 1;

  const ticks: string[] = [];
  for (let decade = axisLow; decade <= axisLow + axisSpan; decade++) {
    const x = LABEL_WIDTH + ((decade - axisLow) / span) * plotWidth;
    const label = formatDecade(decade);
    ticks.push(
      `  <line class="chart-grid" x1="${x}" y1="${chartTop - 8}" x2="${x}" y2="${bottom}" />\n` +
        `  <text class="chart-tick" x="${x}" y="${bottom + 16}" text-anchor="middle">${escapeHtml(label)}</text>`,
    );
  }
  return ticks.join('\n');
}

function formatDecade(decade: number): string {
  if (decade >= 0) return String(10 ** decade);
  return (10 ** decade).toFixed(-decade).replace(/0+$/, (zeros) => (decade <= -3 ? '' : zeros));
}

/** Trim trailing zeros but keep small values legible. */
function formatValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  if (Math.abs(value) < 0.01) return value.toExponential(1);
  return String(Number(value.toFixed(3)));
}

/** Fallback shown in place of a chart whose spec did not validate. */
export function chartError(raw: string, error: string): string {
  return `<div class="chart chart--error">
  <p><strong>Chart could not be rendered:</strong> ${escapeHtml(error)}</p>
  <pre><code>${escapeHtml(raw)}</code></pre>
</div>`;
}
