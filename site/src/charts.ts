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
  return { ok: true, svg: renderBarChart(parsed.data), spec: parsed.data };
}

const WIDTH = 720;
const LABEL_WIDTH = 190;
const ROW_HEIGHT = 34;
const BAR_HEIGHT = 18;
const PAD = 18;

function renderBarChart(spec: ChartSpec): string {
  const rows = spec.items.length;
  const chartTop = 54;
  const height = chartTop + rows * ROW_HEIGHT + 40;
  const plotWidth = WIDTH - LABEL_WIDTH - PAD * 2 - 72;

  // Bars are scaled to the largest value so the comparison is honest: no
  // truncated baseline, because a bar chart with a cut axis misleads.
  const max = Math.max(...spec.items.map((entry) => entry.value));
  const scale = (value: number): number => (max <= 0 ? 0 : (value / max) * plotWidth);

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
${bars}
  </svg>
  <figcaption class="chart-meta">${escapeHtml(spec.unit)} · Source: ${escapeHtml(spec.source)}</figcaption>
</figure>`;
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
