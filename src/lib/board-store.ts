import { openDB, type IDBPDatabase } from 'idb';
import type { Player, Line, Equipment, Shape, TextItem, AnimationFrame, FieldTheme } from './types.js';
import type { FieldOrientation } from './field.js';

export interface SavedBoard {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  fieldTheme: FieldTheme;
  fieldOrientation: FieldOrientation;
  animationMode: boolean;
  playbackLoop: boolean;
  players: Player[];
  lines: Line[];
  equipment: Equipment[];
  shapes: Shape[];
  textItems: TextItem[];
  animationFrames: AnimationFrame[];
}

const DB_NAME = 'coach-board-db';
const DB_VERSION = 1;
const STORE_NAME = 'boards';
const SESSION_KEY = 'active-board-id';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveBoard(board: SavedBoard): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, { ...board, updatedAt: Date.now() });
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

export function createEmptyBoard(name = 'Untitled Board'): SavedBoard {
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    fieldTheme: 'green',
    fieldOrientation: 'horizontal',
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
