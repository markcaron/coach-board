/**
 * Cloud sync via Netlify Identity + Netlify Blobs.
 *
 * All operations are fire-and-forget — they never throw and never block the UI.
 * IndexedDB is always the source of truth; the cloud is backup/sync only.
 */
import netlifyIdentity, { type User } from 'netlify-identity-widget';
import type { SavedBoard, UserTemplate } from './board-store.js';

// ── Public auth types ─────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

// ── Auth initialisation ───────────────────────────────────────────────────────

/**
 * Call once at app startup. Fires `onAuthChange(user)` immediately with the
 * current auth state (null = signed out), and again whenever it changes.
 */
export function initAuth(onAuthChange: (user: AuthUser | null) => void): void {
  netlifyIdentity.on('login', u => { netlifyIdentity.close(); onAuthChange(toAuthUser(u)); });
  netlifyIdentity.on('logout', () => onAuthChange(null));
  netlifyIdentity.on('init', u => onAuthChange(u ? toAuthUser(u) : null));
  netlifyIdentity.init();
  // The GoTrue client restores a cached session from localStorage synchronously
  // when the module is imported — before connectedCallback registers this handler,
  // meaning the 'init' event is always missed on page reload. Read the current
  // user directly as a belt-and-suspenders fallback.
  const cached = netlifyIdentity.currentUser();
  if (cached) onAuthChange(toAuthUser(cached));
}

export function openSignIn(): void {
  netlifyIdentity.open('login');
}

export function signOut(): void {
  netlifyIdentity.logout();
}

function toAuthUser(u: User): AuthUser {
  return {
    id: u.id,
    email: u.email,
    name: u.user_metadata?.full_name,
  };
}

// ── Token helper ──────────────────────────────────────────────────────────────

async function getBearerToken(): Promise<string | null> {
  if (!netlifyIdentity.currentUser()) return null;
  try {
    return await netlifyIdentity.refresh();
  } catch {
    return null;
  }
}

// ── Low-level sync requests ───────────────────────────────────────────────────

async function syncRequest(
  method: 'GET' | 'PUT' | 'DELETE',
  path: string,
  body?: BodyInit,
  contentType?: string,
): Promise<boolean> {
  const token = await getBearerToken();
  if (!token) return false;
  try {
    const res = await fetch(`/api/sync${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        ...(contentType ? { 'Content-Type': contentType } : {}),
      },
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function syncRequestJson<T>(path: string): Promise<T | null> {
  const token = await getBearerToken();
  if (!token) return null;
  try {
    const res = await fetch(`/api/sync${path}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

// ── Board sync ────────────────────────────────────────────────────────────────

/** Upsert a board to the cloud. Thumbnails are uploaded separately. */
export async function cloudSyncBoard(board: SavedBoard): Promise<void> {
  if (!netlifyIdentity.currentUser()) return;

  const { thumbnail, ...boardData } = board;
  await syncRequest('PUT', `/boards/${board.id}`, JSON.stringify(boardData), 'application/json');

    if (thumbnail?.startsWith('data:')) {
      const bytes = dataUrlToBytes(thumbnail);
      if (bytes) await syncRequest('PUT', `/boards/${board.id}/thumb`, bytes.buffer as ArrayBuffer, 'image/jpeg');
    }
  }

export async function cloudDeleteBoard(id: string): Promise<void> {
  if (!netlifyIdentity.currentUser()) return;
  await syncRequest('DELETE', `/boards/${id}`);
}

/**
 * Fetch all boards stored in the cloud for the current user.
 * Returns an empty array if unauthenticated, offline, or on error.
 */
export async function cloudFetchBoards(): Promise<SavedBoard[]> {
  const data = await syncRequestJson<{ items: SavedBoard[] }>('/boards');
  return data?.items ?? [];
}

// ── Template sync ─────────────────────────────────────────────────────────────

/** Upsert a user template to the cloud. */
export async function cloudSyncTemplate(template: UserTemplate): Promise<void> {
  if (!netlifyIdentity.currentUser()) return;

  const { thumbnail, ...templateData } = template;
  await syncRequest('PUT', `/templates/${template.id}`, JSON.stringify(templateData), 'application/json');

  if (thumbnail?.startsWith('data:')) {
    const bytes = dataUrlToBytes(thumbnail);
    if (bytes) await syncRequest('PUT', `/templates/${template.id}/thumb`, bytes.buffer as ArrayBuffer, 'image/jpeg');
  }
}

export async function cloudDeleteTemplate(id: string): Promise<void> {
  if (!netlifyIdentity.currentUser()) return;
  await syncRequest('DELETE', `/templates/${id}`);
}

/**
 * Fetch all user templates stored in the cloud for the current user.
 * Returns an empty array if unauthenticated, offline, or on error.
 */
export async function cloudFetchTemplates(): Promise<UserTemplate[]> {
  const data = await syncRequestJson<{ items: UserTemplate[] }>('/templates');
  return data?.items ?? [];
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  try {
    const b64 = dataUrl.split(',')[1];
    if (!b64) return null;
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}
