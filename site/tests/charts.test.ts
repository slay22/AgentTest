import { describe, expect, it } from 'vitest';
import { parseChartSpec } from '../src/charts';
import { renderMarkdown } from '../src/markdown';

const spec = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'bar',
    title: 'Cost per 1,000 decisions',
    unit: 'USD',
    source: 'typesafe.ai pricing, retrieved 2026-09-21',
    items: [
      { label: 'Standard LLM call', value: 12.4 },
      { label: 'Jev', value: 0.9 },
    ],
    ...over,
  });

describe('parseChartSpec', () => {
  it('renders a bar chart with a label, a value and an accessible summary', () => {
    const result = parseChartSpec(spec());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('Standard LLM call');
    expect(result.svg).toContain('12.4');
    expect(result.svg).toContain('role="img"');
    // A chart is one image to a screen reader, so the numbers go in the label.
    expect(result.svg).toContain('aria-label="Cost per 1,000 decisions. Standard LLM call: 12.4 USD; Jev: 0.9 USD"');
  });

  it('requires a source, because an unsourced figure is a claim', () => {
    const result = parseChartSpec(spec({ source: undefined }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('source');
  });

  it('rejects a chart with fewer than two items, which is not a comparison', () => {
    const result = parseChartSpec(spec({ items: [{ label: 'Only', value: 1 }] }));
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown chart type', () => {
    expect(parseChartSpec(spec({ type: 'pie' })).ok).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(parseChartSpec('{"type":"bar","title":"t","unit":"u","source":"s","items":[{"label":"a","value":1},{"label":"b","value":null}]}').ok).toBe(false);
  });

  it('reports invalid JSON with the reason', () => {
    const result = parseChartSpec('{oops');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not valid JSON');
  });

  it('scales bars to the largest value, so the comparison is not distorted', () => {
    const result = parseChartSpec(spec());
    if (!result.ok) throw new Error('expected ok');
    const widths = [...result.svg.matchAll(/class="chart-bar"[^>]*width="(\d+)"/g)].map((m) => Number(m[1]));
    expect(widths).toHaveLength(2);
    expect(widths[0]).toBeGreaterThan(widths[1]);
    // The largest bar is the full plot width; the smaller one is proportional.
    expect(widths[1] / widths[0]).toBeCloseTo(0.9 / 12.4, 2);
  });
});

describe('chart specs cannot inject markup', () => {
  it('escapes a script tag in a label', () => {
    const result = parseChartSpec(spec({ items: [{ label: '<script>alert(1)</script>', value: 2 }, { label: 'b', value: 1 }] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain('<script');
    expect(result.svg).toContain('&lt;script&gt;');
  });

  it('escapes quotes and angle brackets in the source line', () => {
    const result = parseChartSpec(spec({ source: '" onload="alert(1)" <b>' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toContain('" onload="');
    expect(result.svg).not.toContain('<b>');
  });

  it('escapes the unit and title', () => {
    const result = parseChartSpec(spec({ unit: '<img src=x onerror=alert(1)>' }));
    if (!result.ok) return;
    expect(result.svg).not.toContain('<img');
  });
});

describe('the markdown chart fence', () => {
  it('turns a chart fence into a figure', () => {
    const html = renderMarkdown('```chart\n' + spec() + '\n```');
    expect(html).toContain('<figure class="chart">');
    expect(html).toContain('<svg');
  });

  it('leaves other code fences alone', () => {
    const html = renderMarkdown('```js\nconst x = 1;\n```');
    expect(html).toContain('<pre><code class="language-js">');
    expect(html).not.toContain('<figure');
  });

  it('shows a broken spec rather than dropping it silently', () => {
    const html = renderMarkdown('```chart\n{nope\n```');
    expect(html).toContain('chart--error');
    expect(html).toContain('could not be rendered');
  });
});

describe('the escape-first guarantee still holds', () => {
  // The whole reason charts come from data rather than markup: raw HTML in a post
  // must never become markup, because post bodies derive from web search results.
  it('escapes raw html, svg, iframes and scripts', () => {
    for (const raw of [
      '<script>alert(1)</script>',
      '<svg onload="alert(1)"></svg>',
      '<iframe src="https://evil.example"></iframe>',
      '<img src=x onerror=alert(1)>',
      '<div class="mermaid">graph LR; A-->B</div>',
    ]) {
      const html = renderMarkdown(raw);
      // The dangerous thing is an unescaped tag opener. Attribute text like
      // `onerror=` surviving as escaped characters is fine and expected — it is
      // rendered as visible text, not parsed as an attribute.
      expect(html).not.toMatch(/<(script|svg|iframe|img|div)\b/i);
      expect(html).toContain('&lt;');
    }
  });

  it('renders an escaped img as visible text, not an element', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img');
    // Present as characters; it cannot become an attribute without a real tag.
    expect(html.indexOf('<img')).toBe(-1);
  });

  it('drops javascript: link targets', () => {
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('javascript:');
  });
});

describe('log scale', () => {
  const wide = (over: Record<string, unknown> = {}) =>
    // A 238x spread, which on a linear axis renders two indistinguishable slivers.
    JSON.stringify({
      type: 'bar',
      title: 'Input price',
      unit: 'USD per million tokens',
      source: 'typesafe.ai, retrieved 2026-09-21',
      scale: 'log',
      items: [
        { label: 'Jev', value: 0.042 },
        { label: 'Typical', value: 0.2 },
        { label: 'Frontier', value: 10 },
      ],
      ...over,
    });

  it('makes values two orders of magnitude apart distinguishable', () => {
    const result = parseChartSpec(wide());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const widths = [...result.svg.matchAll(/class="chart-bar"[^>]*width="(\d+)"/g)].map((m) => Number(m[1]));
    expect(widths).toHaveLength(3);
    // Ordered, and the two small values differ visibly instead of both being
    // clamped to the minimum.
    expect(widths[0]).toBeLessThan(widths[1]);
    expect(widths[1]).toBeLessThan(widths[2]);
    expect(widths[1] - widths[0]).toBeGreaterThan(30);
  });

  it('labels the axis by decade, so it cannot be read as linear', () => {
    const result = parseChartSpec(wide());
    if (!result.ok) return;
    expect(result.svg).toContain('class="chart-tick"');
    expect(result.svg).toContain('0.01');
    expect(result.svg).toContain('10');
  });

  it('says "log scale" in the caption', () => {
    const result = parseChartSpec(wide());
    if (!result.ok) return;
    expect(result.svg).toContain('log scale');
  });

  it('refuses a log scale with a zero or negative value rather than hiding the bar', () => {
    const zero = parseChartSpec(wide({ items: [{ label: 'a', value: 0 }, { label: 'b', value: 10 }] }));
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.error).toContain('greater than zero');
    expect(parseChartSpec(wide({ items: [{ label: 'a', value: -1 }, { label: 'b', value: 10 }] })).ok).toBe(false);
  });

  it('defaults to linear, which stays the honest choice at small ratios', () => {
    const result = parseChartSpec(JSON.stringify({
      type: 'bar', title: 't', unit: 'u', source: 's',
      items: [{ label: 'a', value: 10 }, { label: 'b', value: 5 }],
    }));
    if (!result.ok) return;
    expect(result.svg).not.toContain('log scale');
    const widths = [...result.svg.matchAll(/class="chart-bar"[^>]*width="(\d+)"/g)].map((m) => Number(m[1]));
    expect(widths[0] / widths[1]).toBeCloseTo(2, 1);
  });
});

describe('log axis alignment', () => {
  it('gives the smallest value a real bar, not the clamp', () => {
    const result = parseChartSpec(JSON.stringify({
      type: 'bar', title: 't', unit: 'u', source: 's', scale: 'log',
      items: [{ label: 'cheap', value: 0.042 }, { label: 'dear', value: 10 }],
    }));
    if (!result.ok) throw new Error('expected ok');
    const widths = [...result.svg.matchAll(/class="chart-bar"[^>]*width="(\d+)"/g)].map((m) => Number(m[1]));
    // 0.042 sits between the 0.01 and 0.1 decades, so it is a substantial fraction
    // of the width rather than a 2px sliver.
    expect(widths[0]).toBeGreaterThan(50);
  });

  it('ends the largest bar at the top decade gridline', () => {
    const result = parseChartSpec(JSON.stringify({
      type: 'bar', title: 't', unit: 'u', source: 's', scale: 'log',
      items: [{ label: 'cheap', value: 0.042 }, { label: 'dear', value: 10 }],
    }));
    if (!result.ok) throw new Error('expected ok');
    const bars = [...result.svg.matchAll(/class="chart-bar" x="(\d+)"[^>]*width="(\d+)"/g)]
      .map((m) => [Number(m[1]), Number(m[2])] as const);
    const ticks = [...result.svg.matchAll(/class="chart-grid" x1="([\d.]+)"/g)].map((m) => Number(m[1]));
    const lastBarEnd = bars.at(-1)![0] + bars.at(-1)![1];
    const lastTick = ticks.at(-1)!;
    // The largest value is exactly the top decade, so its bar ends on that gridline.
    expect(Math.abs(lastBarEnd - lastTick)).toBeLessThan(1.5);
  });
});
