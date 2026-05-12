import { Marked } from 'marked';
import type { Tokens } from 'marked';

function esc(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const md = new Marked();

md.use({
  // Clamp heading depth: h1 → h2, h4+ → h3
  walkTokens(token) {
    if (token.type === 'heading') {
      if (token.depth < 2) token.depth = 2;
      if (token.depth > 3) token.depth = 3;
    }
  },

  renderer: {
    // Strip images
    image: () => '',

    // Strip HTML pass-through
    html: () => '',

    // Strip code fences — render as plain paragraph
    code: ({ text }: Tokens.Code) => `<p>${esc(text)}</p>\n`,

    // Strip inline code ticks
    codespan: ({ text }: Tokens.Codespan) => esc(text),

    // Strip link href — render link text only
    link: ({ text }: Tokens.Link) => text,
  },
});

/**
 * Parse coach notes from raw Markdown to an HTML string.
 *
 * Allowed: bold, italic, h2, h3, bullet lists, numbered lists, HR.
 * Stripped: images, raw HTML, code blocks, link hrefs.
 * Backward-compatible: plain text is valid Markdown and renders unchanged.
 */
export function parseNotes(raw: string): string {
  if (!raw.trim()) return '';
  return md.parse(raw, { async: false }) as string;
}
