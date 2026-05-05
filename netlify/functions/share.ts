import { getStore } from '@netlify/blobs';
import { nanoid } from 'nanoid';
import type { Context } from '@netlify/functions';

const STORE_NAME = 'shared-boards';
const MAX_BODY = 512_000; // 500 KB max

export default async (request: Request, context: Context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
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
    const data = await store.get(id);
    if (!data) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }
    return new Response(data, {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  }

  if (request.method === 'POST') {
    const body = await request.text();
    if (!body || body.length > MAX_BODY) {
      return new Response(JSON.stringify({ error: 'Payload too large or empty' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const newId = nanoid(10);
    await store.set(newId, body);

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
