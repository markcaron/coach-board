import { openDB, type IDBPDatabase } from 'idb';
import type { Player, Line, Equipment, Shape, TextItem, AnimationFrame, FieldTheme, PitchType } from './types.js';
import type { FieldOrientation } from './field.js';

export interface SavedBoard {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  fieldTheme: FieldTheme;
  fieldOrientation: FieldOrientation;
  pitchType: PitchType;
  animationMode: boolean;
  playbackLoop: boolean;
  players: Player[];
  lines: Line[];
  equipment: Equipment[];
  shapes: Shape[];
  textItems: TextItem[];
  animationFrames: AnimationFrame[];
  notes?: string;
  /** Base64 JPEG data URL (~160 px wide) generated on every auto-save. */
  thumbnail?: string;
}

/** A coach-authored reusable starting-point saved from the Save dialog. */
export interface UserTemplate {
  id: string;
  name: string;
  pitchType: PitchType;
  createdAt: number;
  /** Stamped on create and on every rename. Used for last-write-wins cloud sync. */
  updatedAt?: number;
  players: Player[];
  lines: Line[];
  equipment: Equipment[];
  shapes: Shape[];
  textItems: TextItem[];
  /** Base64 JPEG thumbnail captured at save time (same dimensions as board thumbs). */
  thumbnail?: string;
}

const DB_NAME = 'coach-board-db';
const DB_VERSION = 2;
const STORE_NAME = 'boards';
const TEMPLATES_STORE = 'user-templates';
const SESSION_KEY = 'active-board-id';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(TEMPLATES_STORE)) {
          db.createObjectStore(TEMPLATES_STORE, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// ── Boards ────────────────────────────────────────────────────────────────────

export async function saveBoard(board: SavedBoard): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, { ...board, updatedAt: Date.now() });
}

/**
 * Write a board to IDB preserving its original `updatedAt` timestamp.
 * Use `saveBoard()` for user-initiated saves (which stamp the current time).
 * Use `putBoard()` for cloud restore — preserving the author-device timestamp
 * ensures the last-write-wins comparison works correctly on subsequent restores.
 */
export async function putBoard(board: SavedBoard): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, board);
}

export async function loadBoard(id: string): Promise<SavedBoard | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, id);
}

export async function listBoards(): Promise<SavedBoard[]> {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME) as SavedBoard[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteBoard(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

export async function renameBoard(id: string, name: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get(STORE_NAME, id) as SavedBoard | undefined;
  if (existing) await db.put(STORE_NAME, { ...existing, name, updatedAt: Date.now() });
}

export function createEmptyBoard(name = 'Untitled Board', pitchType: PitchType = 'full'): SavedBoard {
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    fieldTheme: 'green',
    fieldOrientation: 'horizontal',
    pitchType,
    animationMode: false,
    playbackLoop: true,
    players: [],
    lines: [],
    equipment: [],
    shapes: [],
    textItems: [],
    animationFrames: [],
  };
}

export function getActiveBoardId(): string | null {
  try { return sessionStorage.getItem(SESSION_KEY); }
  catch { return null; }
}

export function setActiveBoardId(id: string): void {
  try { sessionStorage.setItem(SESSION_KEY, id); }
  catch { /* private browsing */ }
}

// ── User templates ────────────────────────────────────────────────────────────

export async function saveUserTemplate(template: UserTemplate): Promise<void> {
  const db = await getDB();
  await db.put(TEMPLATES_STORE, template);
}

export async function listUserTemplates(): Promise<UserTemplate[]> {
  const db = await getDB();
  const all = await db.getAll(TEMPLATES_STORE) as UserTemplate[];
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteUserTemplate(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(TEMPLATES_STORE, id);
}

export async function renameUserTemplate(id: string, name: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get(TEMPLATES_STORE, id) as UserTemplate | undefined;
  if (existing) await db.put(TEMPLATES_STORE, { ...existing, name, updatedAt: Date.now() });
}

export async function duplicateUserTemplate(template: UserTemplate): Promise<UserTemplate> {
  const copy: UserTemplate = {
    ...template,
    id: crypto.randomUUID(),
    name: `${template.name} copy`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveUserTemplate(copy);
  return copy;
}
