import { getStore } from '@netlify/blobs';
import { nanoid } from 'nanoid';
import type { Context } from '@netlify/functions';

const STORE_NAME = 'shared-boards';
const MAX_BODY = 512_000; // 500 KB max
const TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
const RATE_WINDOW_MS = 60_000; // 1 minute
const RATE_MAX_POSTS = 10; // max POSTs per window per IP

// Per-instance only; serverless horizontal scaling means the effective
// limit is ~10×N where N is the number of warm instances.
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) ?? [];
  const recent = timestamps.filter(t => now - t < RATE_WINDOW_MS);
  if (recent.length === 0) { rateLimitMap.delete(ip); }
  if (recent.length >= RATE_MAX_POSTS) return true;
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return false;
}

export default async (request: Request, _context: Context) => {
  const origin = request.headers.get('Origin') ?? '';
  const allowedOrigin = origin.includes('coachingboard.netlify.app') || origin.includes('localhost')
    ? origin
    : 'https://coachingboard.netlify.app';

  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  const store = getStore(STORE_NAME);
  const url = new URL(request.url);
  const segments = url.pathname.replace(/^\/api\/share\/?/, '').split('/').filter(Boolean);
  const id = segments[0];

  if (request.method === 'GET' && id) {
    const entry = await store.getWithMetadata(id);
    if (!entry) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }
    const created = (entry.metadata as Record<string, unknown>)?.created as number | undefined;
    if (created && Date.now() - created > TTL_SECONDS * 1000) {
      await store.delete(id);
      return new Response(JSON.stringify({ error: 'Link expired' }), {
        status: 410,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }
    return new Response(entry.data, {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' },
    });
  }

  if (request.method === 'POST') {
    const clientIp = request.headers.get('x-nf-client-connection-ip')
      ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? 'unknown';
    if (isRateLimited(clientIp)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { ...headers, 'Content-Type': 'application/json', 'Retry-After': '60' },
      });
    }

    const body = await request.text();
    if (!body || body.length > MAX_BODY) {
      return new Response(JSON.stringify({ error: 'Payload too large or empty' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const newId = nanoid(10);
    await store.set(newId, body, { metadata: { created: Date.now() } });

    return new Response(JSON.stringify({ id: newId }), {
      status: 201,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
};
