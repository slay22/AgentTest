import { Marked } from 'marked';

// Markdown -> HTML, used only on the publish path.
//
// This runs once per publish, never per page view: the Workers free plan allows
// 10 ms of CPU per request and parsing markdown does not fit in that budget. The
// rendered HTML is stored alongside the markdown source.
//
// Raw HTML in a post is escaped rather than emitted. Post bodies are written by
// an agent that reads web search results, so a passage containing <script> could
// otherwise reach a reader's browser as stored XSS. Escaping costs nothing and
// removes the whole class of problem — the same escape-first contract as
// public/js/markdown.mjs in receiptScanner.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SAFE_PROTOCOL = /^(https?:|mailto:|#|\/)/i;

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    // Raw HTML blocks and inline tags become visible text.
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!SAFE_PROTOCOL.test(href)) return text;
      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="${escapeHtml(href)}"${titleAttribute}>${text}</a>`;
    },
  },
});

export function renderMarkdown(markdown: string): string {
  return marked.parse(markdown, { async: false });
}

export function countWords(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>~-]/g, ' ');
  return text.split(/\s+/).filter(Boolean).length;
}

export const readingMinutes = (wordCount: number): number =>
  Math.max(1, Math.round(wordCount / 220));
