import { getStore } from '@netlify/blobs';
import type { Context } from '@netlify/edge-functions';

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)/);
  if (!match) return context.next();

  const ua = request.headers.get('user-agent') ?? '';
  const isCrawler = /bot|crawl|spider|preview|slack|discord|telegram|whatsapp|facebook|twitter|linkedin|embed|applebot/i.test(ua);
  if (!isCrawler) return context.next();

  const id = match[1];
  let boardName = 'CoachingBoard';
  let hasPreview = false;

  try {
    const store = getStore('shared-boards');
    const entry = await store.getWithMetadata(id);
    if (entry?.metadata) {
      const meta = entry.metadata as Record<string, unknown>;
      if (typeof meta.name === 'string' && meta.name.trim()) {
        boardName = meta.name as string;
      }
    }
    const preview = await store.get(`${id}-preview`, { type: 'arrayBuffer' });
    hasPreview = !!preview;
  } catch { /* blob fetch failed, use defaults */ }

  const ogTitle = boardName !== 'CoachingBoard' ? `${boardName} — CoachingBoard` : 'CoachingBoard';
  const ogDescription = 'Soccer coaching tactical board';
  const ogUrl = url.toString();
  const ogImage = hasPreview ? `${url.origin}/api/share/${id}/image` : `${url.origin}/icon-512.png`;

  const response = await context.next();
  const html = await response.text();

  const injected = html.replace(
    '</head>',
    `<meta property="og:title" content="${ogTitle.replace(/"/g, '&quot;')}">\n` +
    `<meta property="og:description" content="${ogDescription}">\n` +
    `<meta property="og:type" content="website">\n` +
    `<meta property="og:url" content="${ogUrl}">\n` +
    `<meta property="og:image" content="${ogImage}">\n` +
    `<meta name="twitter:card" content="summary_large_image">\n` +
    `<meta name="twitter:title" content="${ogTitle.replace(/"/g, '&quot;')}">\n` +
    `<meta name="twitter:description" content="${ogDescription}">\n` +
    `<meta name="twitter:image" content="${ogImage}">\n` +
    `</head>`
  );

  return new Response(injected, {
    status: response.status,
    headers: response.headers,
  });
};

export const config = {
  path: '/s/*',
};
