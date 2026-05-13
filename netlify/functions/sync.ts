/**
 * /api/sync — cloud backup for boards and user templates.
 *
 * Auth: Netlify Identity JWT (Authorization: Bearer <token>).
 * Verified with HMAC-SHA256 using JWT_SECRET (set automatically by Netlify
 * on Identity-enabled sites). Netlify Functions v2 does not auto-populate
 * context.clientContext.user — that was a v1/Lambda-style API.
 *
 * Routes:
 *   PUT    /api/sync/boards/:id         upsert board JSON
 *   PUT    /api/sync/boards/:id/thumb   upsert board thumbnail (JPEG bytes)
 *   DELETE /api/sync/boards/:id         delete board + thumbnail
 *   PUT    /api/sync/templates/:id      upsert template JSON
 *   PUT    /api/sync/templates/:id/thumb upsert template thumbnail
 *   DELETE /api/sync/templates/:id      delete template + thumbnail
 *
 * Blob key structure:
 *   user/{userId}/board/{id}         → board JSON
 *   user/{userId}/board/{id}-thumb   → JPEG ArrayBuffer
 *   user/{userId}/template/{id}      → template JSON
 *   user/{userId}/template/{id}-thumb → JPEG ArrayBuffer
 */
import { createHmac } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import type { Context } from '@netlify/functions';

const STORE_NAME = 'user-boards';
const MAX_JSON   = 512_000;   // 500 KB max per board/template JSON
const MAX_THUMB  = 200_000;   // 200 KB max per thumbnail

// ── Rate limiting (per-user, per-instance — same caveat as share.ts) ──────────
const rateLimitMap = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX       = 120;

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) ?? [];
  const recent = timestamps.filter(t => now - t < RATE_WINDOW_MS);
  if (recent.length === 0) { rateLimitMap.delete(userId); }
  if (recent.length >= RATE_MAX) return true;
  recent.push(now);
  rateLimitMap.set(userId, recent);
  return false;
}

// ── CORS helpers ──────────────────────────────────────────────────────────────

function corsHeaders(origin: string): Record<string, string> {
  const allowed = origin.includes('coachingboard.netlify.app') || origin.includes('localhost')
    ? origin
    : 'https://coachingboard.netlify.app';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

// ── JWT helper ────────────────────────────────────────────────────────────────

/**
 * Verify and decode a Netlify Identity JWT.
 * Netlify sets JWT_SECRET automatically on Identity-enabled sites.
 * Returns the payload (including `sub`) only if the HMAC-SHA256 signature
 * is valid — rejects crafted tokens with arbitrary `sub` claims.
 */
function verifyAndDecodeJwt(token: string, secret: string): { sub?: string; email?: string } | null {
  try {
    const [header, payload, sig] = token.split('.');
    if (!header || !payload || !sig) return null;
    const expected = createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    if (sig !== expected) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as { sub?: string; email?: string };
  } catch {
    return null;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async (request: Request, context: Context): Promise<Response> => {
  const origin = request.headers.get('Origin') ?? '';
  const headers = corsHeaders(origin);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  // Netlify Functions v2 does not auto-populate context.clientContext.user.
  // Verify the Identity JWT from the Authorization header using JWT_SECRET,
  // which Netlify sets automatically on Identity-enabled sites.
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('[sync] JWT_SECRET is not set — Identity is not configured for this site');
    return json({ error: 'Server misconfigured' }, 500, headers);
  }
  const authHeader = request.headers.get('Authorization');
  const rawToken   = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const userId     = rawToken ? verifyAndDecodeJwt(rawToken, jwtSecret)?.sub : null;
  if (!userId) {
    return json({ error: 'Unauthorized' }, 401, headers);
  }

  if (isRateLimited(userId)) {
    return json({ error: 'Too many requests' }, 429, { ...headers, 'Retry-After': '60' });
  }

  // ── Route parsing ─────────────────────────────────────────────────────────
  const url = new URL(request.url);
  const pathPart = url.pathname.replace(/^\/api\/sync\/?/, '');
  // Expected patterns:
  //   boards                  ← GET list all boards
  //   boards/:id
  //   boards/:id/thumb
  //   templates               ← GET list all templates
  //   templates/:id
  //   templates/:id/thumb
  const listMatch = pathPart.match(/^(boards|templates)$/);
  const itemMatch = pathPart.match(/^(boards|templates)\/([a-zA-Z0-9_-]+)(\/thumb)?$/);

  if (!listMatch && !itemMatch) {
    return json({ error: 'Not found' }, 404, headers);
  }

  const kind       = (listMatch ?? itemMatch)![1] as 'boards' | 'templates';
  const blobPrefix = kind === 'boards' ? 'board' : 'template';
  const store      = getStore(STORE_NAME);

  // ── GET list ──────────────────────────────────────────────────────────────
  if (request.method === 'GET' && listMatch) {
    const prefix = `user/${userId}/${blobPrefix}/`;
    let allKeys: string[];
    try {
      const { blobs } = await store.list({ prefix });
      allKeys = blobs.map(b => b.key).filter(k => !k.endsWith('-thumb'));
    } catch (err) {
      console.error('[sync] store.list failed', err);
      return json({ error: 'Storage unavailable' }, 503, headers);
    }

    const LIMIT = 200; // TODO: paginate if user volume grows
    const truncated = allKeys.length > LIMIT;
    const jsonKeys = allKeys.slice(0, LIMIT);

    const items = await Promise.all(
      jsonKeys.map(async key => {
        const text = await store.get(key, { type: 'text' });
        if (!text) return null;
        try { return JSON.parse(text) as unknown; }
        catch { return null; }
      }),
    );

    return json({ items: items.filter(Boolean), truncated }, 200, headers);
  }

  if (!itemMatch) {
    return json({ error: 'Method not allowed' }, 405, headers);
  }

  const [, , itemId, isThumb] = itemMatch;
  const baseKey = `user/${userId}/${blobPrefix}/${itemId}`;
  const blobKey = isThumb ? `${baseKey}-thumb` : baseKey;

  // ── GET individual item (JSON or thumbnail) ───────────────────────────────
  if (request.method === 'GET' && itemMatch) {
    if (isThumb) {
      const bytes = await store.get(blobKey, { type: 'arrayBuffer' });
      if (!bytes) return json({ error: 'Not found' }, 404, headers);
      return new Response(bytes as ArrayBuffer, {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg', ...headers },
      });
    }
    const text = await store.get(blobKey, { type: 'text' });
    if (!text) return json({ error: 'Not found' }, 404, headers);
    return new Response(text, {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }

  // ── PUT ───────────────────────────────────────────────────────────────────
  if (request.method === 'PUT') {
    if (isThumb) {
      const bytes = await request.arrayBuffer();
      if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_THUMB) {
        return json({ error: 'Thumbnail too large or empty' }, 400, headers);
      }
      await store.set(blobKey, bytes);
      return json({ ok: true }, 200, headers);
    }

    const body = await request.text();
    if (!body || body.length > MAX_JSON) {
      return json({ error: 'Payload too large or empty' }, 400, headers);
    }
    await store.set(blobKey, body);
    return json({ ok: true }, 200, headers);
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (request.method === 'DELETE') {
    await store.delete(blobKey);
    await store.delete(`${baseKey}-thumb`).catch(() => {});
    return json({ ok: true }, 200, headers);
  }

  return json({ error: 'Method not allowed' }, 405, headers);
};
