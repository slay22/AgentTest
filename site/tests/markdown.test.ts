import { describe, expect, it } from 'vitest';
import { countWords, escapeHtml, readingMinutes, renderMarkdown } from '../src/markdown';

// The escape-first contract matters because post bodies are written by an agent
// that reads web search results: a passage containing <script> must never reach
// a reader's browser as markup. This mirrors the guarantee
// tests/chat-markdown.test.ts protects in receiptScanner.

describe('renderMarkdown', () => {
  it('renders ordinary markdown', () => {
    expect(renderMarkdown('# Title')).toContain('<h1>Title</h1>');
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
  });

  it('escapes a raw script tag instead of emitting it', () => {
    const html = renderMarkdown('Before\n\n<script>alert(1)</script>\n\nAfter');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes an inline html tag', () => {
    const html = renderMarkdown('Look <img src=x onerror=alert(1)> here');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('drops javascript: link targets but keeps the text', () => {
    const html = renderMarkdown('[click me](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('click me');
  });

  it('keeps http links', () => {
    const html = renderMarkdown('[docs](https://example.com/a)');
    expect(html).toContain('href="https://example.com/a"');
  });

  it('escapes quotes in a link title', () => {
    const html = renderMarkdown('[x](https://example.com "a\\"b")');
    expect(html).not.toMatch(/title="a"b"/);
  });
});

describe('escapeHtml', () => {
  it('escapes the five significant characters', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
});

describe('countWords', () => {
  it('ignores code fences and markdown syntax', () => {
    expect(countWords('one two three')).toBe(3);
    expect(countWords('```\nnot counted at all here\n```')).toBe(0);
    expect(countWords('# Heading\n\nSome words here')).toBe(4);
  });
});

describe('readingMinutes', () => {
  it('never reports less than a minute', () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(10)).toBe(1);
    expect(readingMinutes(440)).toBe(2);
  });
});
