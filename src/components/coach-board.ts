import { LitElement, html, svg, css, nothing } from 'lit';
import { toolShortcutHintStyle } from '../lib/shared-styles.js';
import { customElement, state, query } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { guard } from 'lit/directives/guard.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { parseNotes } from '../lib/notes-parser.js';

import type { Player, Line, Equipment, Shape, TextItem, Tool, LineStyle, EquipmentKind, ShapeKind, Team, FieldTheme, PitchType, AnimationFrame, FramePosition, TrailControlPoints } from '../lib/types.js';
import { COLORS, getPlayerColors, getConeColors, getLineColors, PLAYER_COLORS, PLAYER_COLORS_WHITE, CONE_COLORS, CONE_COLORS_WHITE } from '../lib/types.js';
import { FIELD, getFieldDimensions } from '../lib/field.js';
import type { FieldOrientation } from '../lib/field.js';
import { uid, ensureMinId } from '../lib/svg-utils.js';
import { saveBoard, loadBoard, listBoards, deleteBoard, renameBoard, createEmptyBoard, getActiveBoardId, setActiveBoardId, saveUserTemplate, listUserTemplates, deleteUserTemplate, renameUserTemplate, duplicateUserTemplate, type SavedBoard, type UserTemplate } from '../lib/board-store.js';
import { initAuth, openSignIn, signOut, cloudSyncBoard, cloudDeleteBoard, cloudSyncTemplate, cloudDeleteTemplate, type AuthUser } from '../lib/cloud-sync.js';
import { registerSW } from 'virtual:pwa-register';
import { getTemplatesForPitch } from '../lib/templates.js';
import { getItemPosition, getItemAngle, getItemPositionAtFrame, getItemAngleAtFrame } from '../lib/animation-utils.js';
import { ToolChangedEvent, PlayerUpdateEvent, EquipmentUpdateEvent, LineUpdateEvent, ShapeUpdateEvent, TextUpdateEvent, AlignItemsEvent, GroupItemsEvent, UngroupItemsEvent, ZOrderEvent, SaveSvgEvent, DeleteItemsEvent, MultiSelectToggleEvent, RotateItemsEvent, AutoNumberToggleEvent } from './cb-toolbar.js';
import type { AlignAction } from './cb-toolbar.js';

import './cb-toolbar.js';
import './cb-board-bar.js';
import './cb-timeline.js';
import './cb-dialogs.js';
import type { CbDialogs, BoardSummary, PendingBoardAction } from './cb-dialogs.js';
import './cb-field.js';
import type { CbField, GhostCursor, DrawState, ShapeDrawState, MeasureState } from './cb-field.js';
import './cb-share.js';
import type { CbShare } from './cb-share.js';
import type { FrameSelectEvent, FrameDeleteEvent, SpeedChangeEvent } from './cb-timeline.js';
import './cb-side-sheet.js';
import type { CbSideSheet } from './cb-side-sheet.js';
import './cb-my-boards.js';
import type { CbMyBoards } from './cb-my-boards.js';
import './cb-board-summary.js';
import type { CbBoardSummary } from './cb-board-summary.js';

type DragKind = 'player' | 'equipment' | 'shape' | 'text' | 'line-start' | 'line-end' | 'line-control' | 'line-body' | 'rotate' | 'shape-corner' | 'shape-side' | 'trail-cp1' | 'trail-cp2';

interface GroupDragState {
  anchorX: number;
  anchorY: number;
  pointOrigins: Map<string, { x: number; y: number }>;
  lineOrigins: Map<string, { x1: number; y1: number; x2: number; y2: number; cx: number; cy: number }>;
}

interface HandleDragState {
  kind: 'line-start' | 'line-end' | 'line-control';
  id: string;
}

interface RotateDragState {
  id: string;
  cx: number;
  cy: number;
  startAngle: number;
  origRotation: number;
}

interface ShapeResizeDragState {
  id: string;
  handle: string;
  origCx: number;
  origCy: number;
  origHw: number;
  origHh: number;
  startX: number;
  startY: number;
}

function resolveHit(target: EventTarget | null): { kind: DragKind; id: string } | null {
  let el = target as SVGElement | null;
  while (el && el instanceof SVGElement) {
    const kind = el.dataset?.kind as DragKind | undefined;
    const id = el.dataset?.id;
    if (kind && id) return { kind, id };
    el = el.parentElement as SVGElement | null;
  }
  return null;
}

interface Snapshot {
  players: Player[];
  lines: Line[];
  equipment: Equipment[];
  shapes: Shape[];
  textItems: TextItem[];
  animationFrames: AnimationFrame[];
  fieldOrientation: FieldOrientation;
  fieldTheme: FieldTheme;
  pitchType: PitchType;
}

const MAX_HISTORY = 50;

/** Tools housed in the More submenu — drives aria-pressed on the More button */
const MORE_TOOLS: Tool[] = ['add-text', 'measure'];

function isModifier(e: PointerEvent | MouseEvent): boolean {
  return e.shiftKey || e.metaKey || e.ctrlKey;
}

/**
 * Constrains a (dx, dy) displacement to the nearest axis when Shift is held:
 * horizontal (dy=0), vertical (dx=0), or 45° diagonal (|dx|===|dy|).
 * Axis is chosen within ±22.5° of each direction.
 * Returns the original values unchanged when Shift is not held or the
 * displacement is below the 1.5-unit threshold needed to determine direction.
 */
function axisConstrain(dx: number, dy: number, shiftKey: boolean): { dx: number; dy: number } {
  if (!shiftKey) return { dx, dy };
  const absDx = Math.abs(dx), absDy = Math.abs(dy);
  if (absDx < 1.5 && absDy < 1.5) return { dx: 0, dy: 0 };
  const angle = Math.atan2(absDy, absDx) * 180 / Math.PI; // 0°=horizontal, 90°=vertical
  if (angle < 22.5) return { dx, dy: 0 };
  if (angle > 67.5) return { dx: 0, dy };
  // 45° diagonal: lock both components to the larger magnitude
  const d = Math.max(absDx, absDy);
  return { dx: dx < 0 ? -d : d, dy: dy < 0 ? -d : d };
}

function rad2deg(r: number): number { return r * 180 / Math.PI; }

@customElement('coach-board')
export class CoachBoard extends LitElement {
  static styles = [toolShortcutHintStyle, css`
    *, *::before, *::after {
      box-sizing: border-box;
    }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    :host {
      display: block;
      height: 100vh;
      height: 100dvh;
      overflow: hidden;
      overscroll-behavior: none;
      --panel-w: min(280px, 85vw);
      touch-action: manipulation;
      --color-blue: var(--pt-color-blue-400);
      --color-red: var(--pt-color-red-400);
      --color-yellow: var(--pt-color-yellow-400);
      --color-purple: var(--pt-color-purple-600);
      --color-light-gray: var(--pt-color-gray-200);
      --color-dark-gray: var(--pt-color-gray-600);
      --cone-chartreuse: var(--pt-color-chartreuse-400);
      --cone-neon-orange: var(--pt-color-orange-400);
      --cone-bright-pink: var(--pt-color-pink-400);
      --cone-bright-blue: var(--pt-color-blue-200);
      --line-white: var(--pt-color-white);
      --line-blue: var(--pt-color-blue-300);
      --line-red: var(--pt-color-red-300);
      --line-yellow: var(--pt-color-yellow-300);
      --line-purple: var(--pt-color-purple-300);
      --line-gray: var(--pt-color-gray-350);
      --field-stripe-light: var(--pt-field-stripe-light);
      --field-stripe-dark: var(--pt-field-stripe-dark);
    }

    /* ── Push-drawer layout (panel slides in from the LEFT) ──────
       The grid has the panel in column-1 and the board in column-2.
       At rest the whole container is translated left by --panel-w so the
       panel is off-screen; .menu-open resets the translation revealing the
       panel and pushing the board to the right. */

    .app-wrap {
      display: grid;
      grid-template-columns: var(--panel-w) 100dvw;
      height: 100dvh;
      transform: translateX(calc(var(--panel-w) * -1));
      transition: transform 420ms cubic-bezier(0.33, 1, 0.68, 1);
      will-change: transform;
    }

    .app-wrap.menu-open {
      transform: translateX(0);
    }

    /* Side sheet open: whole view slides left by the sheet width */
    .app-wrap.sheet-open {
      transform: translateX(calc(var(--panel-w) * -1 - min(400px, 100vw)));
    }

    .app-board {
      grid-column: 2;
      height: 100dvh;
      display: grid;
      grid-template-areas:
        "topbar"
        "board"
        "timeline"
        "botbar";
      grid-template-rows: auto 1fr auto 60px;
      overflow: hidden;
      position: relative; /* contains the absolute .menu-backdrop */
    }
    .menu-backdrop {
      /* Covers the entire .app-board so any click outside the panel closes the menu */
      position: absolute;
      inset: 0;
      z-index: 25;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    /* ── Menu panel ───────────────────────────────────────────── */

    .menu-panel {
      grid-column: 1;      width: var(--panel-w);
      height: 100dvh;
      background: white;
      color: var(--pt-color-navy-800, #16213e);
      color-scheme: light;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      overflow-x: hidden;
      /* Right border gives a subtle edge separating panel from board */
      border-right: 1px solid rgba(0, 0, 0, 0.08);      box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.03);
    }

    .menu-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 24px 20px 18px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
      flex-shrink: 0;
    }

    .menu-logo {
      width: 36px;
      height: 36px;
      flex-shrink: 0;
    }

    .menu-brand {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--pt-color-navy-800, #16213e);
      flex: 1;
    }

    .menu-nav {
      flex: 1;
      padding: 6px 0;
      display: flex;
      flex-direction: column;
    }

    .menu-nav button {
      display: flex;
      align-items: center;
      gap: 14px;
      width: 100%;
      padding: 13px 20px;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: var(--pt-color-navy-800, #16213e);
      font: inherit;
      font-size: 0.95rem;
      cursor: pointer;
      text-align: left;
      -webkit-tap-highlight-color: transparent;
    }

    .menu-nav button:hover {
      background: rgba(78, 168, 222, 0.08);
    }

    .menu-nav button:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: -4px;
      background: rgba(78, 168, 222, 0.08);
    }

    .menu-nav svg {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      opacity: 0.7;
    }

    .menu-nav-divider {
      height: 1px;
      background: rgba(0, 0, 0, 0.08);
      margin: 6px 0;
    }

    .menu-spacer { flex: 1; }

    /* ── Settings side-sheet content ────────────────────────────────── */
    .settings-content {
      padding: 20px;
    }

    .settings-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .settings-section + .settings-section {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid rgba(0, 0, 0, 0.08);
    }

    .settings-section-heading {
      margin: 0 0 4px;
      font-size: 0.82rem;
      font-weight: 600;
      color: rgba(0, 0, 0, 0.72);
    }

    .settings-field-label {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--pt-text-on-inverted);
    }

    .settings-select {
      width: 100%;
      box-sizing: border-box;
      min-height: 44px;
      padding: 6px 26px 6px 10px;
      font: inherit;
      font-size: 0.85rem;
      border: 1px solid rgba(0, 0, 0, 0.28);
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.03);
      color: var(--pt-text-on-inverted);
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23555'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      cursor: pointer;
    }

    .settings-select:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .settings-hint {
      margin: 2px 0 0;
      font-size: 0.8rem;
      color: var(--pt-text-on-light);
      line-height: 1.4;
    }

    .settings-hint--mt {
      margin-top: 3px;
    }

    /* ── Account section (Cloud Backup) ──────────────────────────────── */
    .settings-account-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 2px 0 4px;
    }

    .settings-account-row svg {
      flex-shrink: 0;
      margin-top: 1px;
      color: var(--pt-accent);
    }

    .settings-account-email {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--pt-text-on-inverted);
      word-break: break-all;
    }

    .settings-account-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 44px;
      padding: 8px 16px;
      border-radius: 6px;
      border: 1px solid var(--pt-success-hover);
      background: var(--pt-success-hover);
      color: var(--pt-text-white);
      font: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      margin-top: 4px;
    }

    .settings-account-btn:hover {
      background: var(--pt-success-btn-hover);
      border-color: var(--pt-success-btn-hover);
    }

    .settings-account-btn:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .settings-account-btn--signout {
      background: transparent;
      color: var(--pt-text-on-inverted);
      border-color: rgba(0, 0, 0, 0.28);
    }

    .settings-account-btn--signout:hover {
      background: var(--pt-danger-hover);
      border-color: var(--pt-danger-hover);
      color: var(--pt-text-white);
    }

    @media (prefers-reduced-motion: reduce) {
      .app-wrap { transition: transform 150ms ease; }
      .sidebar  { transition: none; }
      /* Neutralise toast animations; JS dismiss delay is also skipped (see handler) */
      .update-toast,
      .update-toast.toast-dismissing { animation: none; }
      .select-track cb-toolbar { animation: none; }
    }

    /* ── Locked sidebar (JS-driven, .sidebar-locked class) ────────── */
    /* Applied when the SVG's left edge clears the sidebar's right edge.
       Keeps sidebar floating exactly where it is — no drawer slide. */
    .sidebar.sidebar-locked,
    .sidebar.sidebar-locked.sidebar--collapsed {
      transform: translateY(-50%);
      transition: none;
    }
    .sidebar.sidebar-locked .sidebar-handle { display: none; }

    /* ── Floating left sidebar (tool palette) ─────────────────── */
    /* Absolutely positioned over .board-area so the field canvas
       is one seamless surface — no flex-sibling boundary to seam */

    .sidebar {
      position: absolute;
      left: 8px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 6px 4px;
      gap: 2px;
      background: var(--pt-bg-toolbar);
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      z-index: 5;
      transition: transform 180ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Collapsed: slide left until only the grab handle strip is visible */
    .sidebar.sidebar--collapsed {
      transform: translateX(calc(-100% + 14px)) translateY(-50%);
    }

    /* Grab handle — anchored to the right edge of the sidebar card */
    .sidebar-handle {
      position: absolute;
      right: -14px;
      top: 50%;
      transform: translateY(-50%);
      width: 22px;
      height: 44px;
      background: var(--pt-bg-toolbar);
      border: 0;
      border-radius: 0 8px 8px 0;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
      color: var(--pt-text-muted);
      z-index: 1;
      -webkit-tap-highlight-color: transparent;
    }

    .sidebar-handle svg {
      transform: rotate(90deg);
    }

    .sidebar-handle:hover {
      background: linear-gradient(to right, transparent, var(--pt-border) 8px);
      color: var(--pt-text);
    }

    .sidebar-handle:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: -2px;
    }

    /* Hamburger in context bar */
    .context-hamburger {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      flex-shrink: 0;
      margin: 0 4px 0 8px;
      padding: 0;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 6px;
      color: var(--pt-text);
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: background 0.12s;
    }

    .context-hamburger:hover { background: var(--pt-border); }
    .context-hamburger:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }
    .context-hamburger svg { transition: opacity 0.15s; }

    .sidebar-tool {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      margin: 2px 0;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 8px;
      color: var(--pt-text);
      cursor: pointer;
      padding: 0;
      flex-shrink: 0;
      position: relative;
      -webkit-tap-highlight-color: transparent;
      transition: background 0.12s, border-color 0.12s;
    }

    .sidebar-tool:hover {
      background: var(--pt-border);
    }

    .sidebar-tool:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .sidebar-tool[aria-pressed="true"] {
      background: var(--pt-danger-hover);
      border-color: var(--pt-danger-hover);
      color: var(--pt-text-white);
    }

    .sidebar-badge {
      position: absolute;
      top: 2px;
      right: 2px;
      min-width: 16px;
      height: 16px;
      background: var(--pt-color-yellow-400);
      border: 1.5px solid rgba(0, 0, 0, 0.7);
      color: var(--pt-color-navy-900);
      border-radius: 8px;
      font-size: 0.6rem;
      font-weight: bold;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 3px;
      pointer-events: none;
      z-index: 1;
    }

    /* Adobe-style corner triangle for buttons with submenus */
    .sidebar .has-submenu::after {
      content: '';
      position: absolute;
      bottom: 4px;
      right: 4px;
      width: 0;
      height: 0;
      border-style: solid;
      border-width: 0 0 6px 6px;
      border-color: transparent transparent currentColor transparent;
      opacity: 0.6;
      pointer-events: none;
    }

    .sidebar-tools {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }

    /* Sidebar dropdown wrapper: fills sidebar width so menu opens flush-right */
    .sidebar-dropdown-wrap {
      position: relative;
      width: 48px;
      display: flex;
      justify-content: center;
      flex-shrink: 0;
    }

    .sidebar-dropdown-wrap [role="menu"] {
      position: absolute;
      top: 0;
      left: 100%;
      margin-left: 4px;
      z-index: 100;
      min-width: 160px;
      width: max-content;
      background: var(--pt-bg-surface);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    }

    .sidebar-dropdown-wrap [role="menuitem"],
    .sidebar-dropdown-wrap [role="menuitemradio"] {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px 14px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 4px;
      color: var(--pt-text);
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
      text-align: left;
      white-space: nowrap;
      outline: none;
    }

    .sidebar-dropdown-wrap [role="menuitem"]:hover,
    .sidebar-dropdown-wrap [role="menuitemradio"]:hover,
    .sidebar-dropdown-wrap [role="menuitem"]:focus-visible,
    .sidebar-dropdown-wrap [role="menuitemradio"]:focus-visible {
      background: var(--pt-border);
    }

    .sidebar-dropdown-wrap .sb-menu-separator {
      height: 1px;
      background: rgba(255, 255, 255, 0.12);
      margin: 4px 0;
    }

    /* ── Board area (field + backdrop) ────────────────────────── */

    .board-area {
      grid-area: board;
      display: flex;
      flex-direction: row;
      overflow: hidden;
      min-height: 0;
      position: relative; /* containing block for absolutely-positioned sidebar */
    }

    .field-wrap {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }

    /* ── Context bar (always-visible edit/context strip) ─────── */
    /* Board name (left) → divider → contextual edit tools (right).
       Min-height keeps the bar visible even when nothing is selected. */

    .context-bar {
      grid-area: topbar;
      display: flex;
      align-items: center;
      min-height: calc(60px + env(safe-area-inset-top, 0px));
      padding-top: env(safe-area-inset-top, 0px);
      background: var(--pt-bg-toolbar);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      z-index: 10;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      /* overflow:visible so dropdowns inside cb-toolbar are not clipped */
    }

    .context-bar-right {
      margin-left: auto;
      padding-right: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    /* White field theme — no background needed here; the sidebar floats
       absolutely over .field-area which provides the seamless canvas */

    .context-board-name {
      padding: 0 14px;
      flex-shrink: 1;
      min-width: 0;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--pt-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: min(40%, 30em);
      user-select: none;
    }

    .context-board-name .cb-unsaved {
      font-size: 0.9em;
      color: var(--pt-text-muted);
      font-weight: normal;
      font-style: italic;
      opacity: 0.7;
      margin-left: 2px;
    }

    .context-divider {
      width: 1px;
      height: 28px;
      background: rgba(255, 255, 255, 0.15);
      margin: 0 4px;
      flex-shrink: 0;
    }

    /* Select tool + inline context as one continuous track */
    .select-track {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-block: 2px;
      width: 42px;
      border-radius: 10px;
      overflow: visible; /* dropdown menus escape the track */
      background: none;
    }

    /* Select button sits on toolbar bg, flush with the track edges */
    .select-track .sidebar-tool {
      margin: 0;
    }

    .select-track .sidebar-tool:not([aria-pressed="true"]) {
      background: var(--pt-bg-toolbar);
    }

    /* Give the Select button some breathing room above the context section */
    .select-track:has(cb-toolbar) .sidebar-tool {
      margin-bottom: 4px;
    }

    /* Track body becomes a recessed card when context is present */
    .select-track:has(cb-toolbar) {
      box-shadow: rgba(255, 255, 255, 0.2) 0px -1px 0 inset;
      padding-block: 1px 2px;
      background: var(--pt-bg-primary);
    }

    /* Fade in the inline context on selection */
    .select-track cb-toolbar {
      animation: ctx-slot-in 0.15s ease-out both;
    }

    @keyframes ctx-slot-in {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .context-bar cb-toolbar {
      flex: 1;
      min-width: 0;
      height: 60px;
      /* no overflow:hidden — allows dropdowns to render outside the bar */
    }

    /* In readonly mode we keep the old single-column toolbar layout */    .toolbar-area {
      flex-shrink: 0;
      z-index: 10;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      padding-top: env(safe-area-inset-top);
    }

    /* translateX(-50%) must be present in every stop — the toast uses
       left:50% + translateX(-50%) for centering; omitting it from a
       keyframe would override the centering and cause a horizontal jump */
    @keyframes toast-in {
      from { opacity: 0; transform: translateX(-50%) translateY(12px); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    /* Exit drops 8px (vs entry's 12px) — smaller offset so the
       dismissal feels deliberate rather than falling away dramatically */
    @keyframes toast-out {
      from { opacity: 1; transform: translateX(-50%) translateY(0); }
      to   { opacity: 0; transform: translateX(-50%) translateY(8px); }
    }

    .update-toast {
      position: fixed;
      bottom: calc(env(safe-area-inset-bottom, 0px) + 72px);
      left: 50%;
      transform: translateX(-50%);
      z-index: 200;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      width: min(560px, calc(100vw - 32px));
      background: var(--pt-bg-inverted);
      color: var(--pt-text-on-inverted);
      border: 1px solid var(--pt-border-on-inverted);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      font-size: 0.85rem;
      line-height: 1.5em;
      font-family: system-ui, -apple-system, sans-serif;
      animation: toast-in 220ms cubic-bezier(0.2, 0, 0, 1) both;
    }

    .update-toast.toast-dismissing {
      animation: toast-out 180ms ease-in forwards;
    }

    .update-toast svg {
      flex-shrink: 0;
    }

    .update-toast span {
      flex: 1;
    }

    .update-toast button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 20px;
      min-height: 44px;
      border: 1px solid var(--pt-border-on-inverted);
      border-radius: 6px;
      background: var(--pt-bg-inverted);
      color: var(--pt-text-on-inverted);
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }

    .update-toast button:hover {
      background: var(--pt-field-area-white);
    }

    .update-toast button:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .update-toast .refresh-btn {
      background: var(--pt-success-hover);
      border-color: var(--pt-success-hover);
      color: var(--pt-text-white);
    }

    .update-toast .refresh-btn:hover {
      background: var(--pt-success-btn-hover);
    }

    .update-toast .dismiss-btn {
      background: transparent;
      color: var(--pt-text-on-inverted);
      border-color: var(--pt-border-on-inverted);
    }

    .update-toast .dismiss-btn:hover {
      background: var(--pt-field-area-white);
    }

    .readonly-branding {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      min-height: 60px;
      background: var(--pt-bg-toolbar);
    }

    .readonly-board-name {
      margin-left: auto;
      font-size: 0.85rem;
      color: var(--pt-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 50%;
    }

    .branding-icon {
      width: 28px;
      height: 28px;
    }

    .branding-link {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 4px 0 12px;
      text-decoration: none;
      color: inherit;
      flex-shrink: 0;
    }

    .branding-text {
      font-size: 1rem;
      font-weight: bold;
      color: var(--pt-text);
    }

    cb-timeline {
      grid-area: timeline;
    }

    .bottom-bar {
      grid-area: botbar;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      padding-bottom: calc(8px + env(safe-area-inset-bottom));
      background: var(--pt-bg-toolbar);
      z-index: 10;
      box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.3);
      user-select: none;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .bottom-left {
      display: flex;
      gap: 6px;
      align-items: center;
      justify-self: start;
    }

    .bottom-bar-divider {
      width: 1px;
      height: 24px;
      background: rgba(255, 255, 255, 0.15); /* matches .context-divider */
      flex-shrink: 0;
      margin: 0 2px;
    }

    .bottom-center {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-self: center;
    }

    .bottom-right {
      display: flex;
      gap: 6px;
      align-items: center;
      justify-self: end;
    }

    .bottom-bar button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 6px 14px;
      min-height: 44px;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      background: var(--pt-bg-surface);
      color: var(--pt-text);
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }

    .bottom-bar button:hover {
      background: var(--pt-border);
    }

    .bottom-bar button:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .bottom-bar button[aria-pressed="true"] {
      background: var(--pt-danger-hover);
      border-color: var(--pt-danger-hover);
      color: var(--pt-text-white);
    }

    .bottom-bar button.icon-btn {
      padding: 6px 8px;
      min-width: 44px;
    }

    .auth-avatar-btn {
      width: 34px;
      height: 34px;
      min-width: 44px;
      min-height: 44px;
      padding: 0;
      border-radius: 50%;
      background: var(--pt-color-blue-450);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: var(--pt-text-white);
      /* 1.25rem bold ≈ 15pt bold — qualifies as WCAG large text so
         the 3.97:1 contrast against #2e86c1 clears the 3:1 AA threshold. */
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: 0;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .auth-avatar-btn:hover {
      filter: brightness(0.85);
      border-color: rgba(255, 255, 255, 0.5);
    }

    .auth-avatar-btn:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .bottom-bar button:disabled {
      opacity: 0.35;
      cursor: default;
      pointer-events: none;
    }

    .zoom-level {
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.01em;
      min-width: 40px;
      padding: 4px 6px;
      text-align: center;
      background: none;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 4px;
      color: var(--pt-text-muted);
      cursor: pointer;
      transition: background 0.12s, color 0.12s;
    }

    .zoom-level:hover {
      background: var(--pt-border);
      color: var(--pt-text);
    }

    .zoom-level:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .theme-select {
      background: var(--pt-bg-surface);
      color: var(--pt-text);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      min-height: 44px;
      padding: 6px 26px 6px 10px;
      font: inherit;
      font-size: 0.85rem;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23ccc'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      cursor: pointer;
    }

    .theme-select:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .bottom-bar .caret {
      display: inline-block;
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 5px solid currentColor;
      margin-left: 4px;
      vertical-align: middle;
    }

    .bottom-bar .caret.open {
      border-top: none;
      border-bottom: 5px solid currentColor;
    }

    .bottom-bar .btn-text {
      white-space: nowrap;
    }

    @media (max-width: 767px) {
      .bottom-bar .btn-text {
        display: none;
      }
    }

    .bottom-bar .dropdown-wrap {
      position: relative;
    }

    .bottom-bar [role="menu"] {
      position: absolute;
      bottom: calc(100% + 4px);
      left: 50%;
      transform: translateX(-50%);
      z-index: 10;
      width: max-content;
      background: var(--pt-bg-surface);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    }

    .bottom-bar [role="menuitem"] {
      width: 100%;
      justify-content: flex-start;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 2px;
      color: var(--pt-text);
      gap: 12px;
    }

    .bottom-bar [role="menuitem"]:hover {
      background: var(--pt-border);
    }

    .menu-divider {
      height: 1px;
      background: rgba(255, 255, 255, 0.1);
      margin: 4px 0;
    }

    .menu-heading {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 14px 2px;
      font-size: 0.7rem;
      font-weight: bold;
      color: var(--pt-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .bottom-bar [role="menuitem"].menu-indent {
      padding-left: 40px;
    }

    [role="menu"].menu-right {
      right: 0;
      left: auto;
      transform: none;
      min-width: 240px;
    }

    .rotate-overlay {
      display: none;
    }

    @media (max-height: 500px) and (min-aspect-ratio: 1/1) {
      .rotate-overlay {
        display: flex;
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(0, 0, 0, 0.92);
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 16px;
      }

      .rotate-overlay svg {
        width: 50vw;
        max-width: 200px;
        height: auto;
      }
    }

    .print-summary-block {
      display: none;
    }

    .summary-section {
      margin-bottom: 12px;
    }

    .summary-section h3 {
      font-size: 0.85rem;
      color: var(--pt-text);
      margin: 0 0 4px;
    }

    .summary-section p, .summary-section ul {
      margin: 0;
      padding: 0;
      font-size: 0.8rem;
      color: var(--pt-text-muted);
      list-style: none;
    }

    .summary-section li {
      padding: 2px 0;
    }

    .summary-board-name {
      font-size: 1.1rem;
      font-weight: bold;
      color: var(--pt-text);
      margin-bottom: 16px;
    }

    @media print {
      :host {
        height: auto !important;
        overflow: visible !important;
        background: white !important;
      }
      /* Collapse grid bars so the field fills the page */
      .app-board {
        display: block !important;
        height: auto !important;
        overflow: visible !important;
      }
      .board-area {
        display: block !important;
      }
      .field-wrap {
        display: block !important;
      }
      .toolbar-area, .context-bar, .sidebar, .bottom-bar, cb-board-bar,
      .rotate-overlay, cb-dialogs, cb-timeline, .update-toast { display: none !important;
      }
      cb-field {
        flex: none !important;
      }
      :host(.print-summary) .print-summary-block {
        display: block;
        padding: 16px 4px;
        font-size: 11px;
        color: #333;
        background: white !important;
        page-break-inside: avoid;
      }
    }

    .icon {
      flex-shrink: 0;
      vertical-align: middle;
    }

    .notes-body {
      line-height: 1.55;
    }

    .notes-body h2 {
      font-size: 0.9rem;
      font-weight: 700;
      margin: 8px 0 3px;
    }

    .notes-body h3 {
      font-size: 0.85rem;
      font-weight: 600;
      margin: 6px 0 2px;
    }

    .notes-body p {
      margin: 0 0 5px;
    }

    .notes-body ul,
    .notes-body ol {
      margin: 0 0 5px;
      padding-left: 18px;
    }

    .notes-body li {
      margin: 2px 0;
    }

    .notes-body hr {
      border: none;
      border-top: 1px solid rgba(0, 0, 0, 0.15);
      margin: 8px 0;
    }

  `];

  @state() accessor activeTool: Tool = 'select';
  @state() accessor players: Player[] = [];
  @state() accessor lines: Line[] = [];
  @state() accessor equipment: Equipment[] = [];
  @state() accessor selectedIds: Set<string> = new Set();
  @state() accessor playerColor: string = COLORS.playerBlue;
  @state() accessor playerTeam: Team = 'a';
  @state() accessor autoNumber: boolean = false;
  @state() accessor lineStyle: LineStyle = 'solid';
  @state() accessor equipmentKind: EquipmentKind = 'ball';
  @state() accessor shapeKind: ShapeKind = 'rect';
  @state() accessor shapes: Shape[] = [];
  @state() accessor textItems: TextItem[] = [];
  @state() accessor fieldOrientation: FieldOrientation = window.innerWidth <= 768 ? 'vertical' : 'horizontal';
  @state() accessor fieldTheme: FieldTheme = 'green';
  @state() accessor pitchType: PitchType = 'full';
  @state() accessor ghost: GhostCursor | null = null;
  @state() private accessor _fieldMenuOpen: boolean = false;
  #fieldMenuTrigger: HTMLElement | null = null;
  @state() private accessor _sidebarMenu: 'player' | 'equipment' | 'draw' | 'select' | 'more' | null = null;
  @state() private accessor _sidebarCollapsed: boolean = false; // always starts open; only the grab handle closes it
  @state() private accessor _sidebarFocusIndex: number = 0;
  @state() private accessor _isMobile: boolean = window.innerWidth <= 768;
  @state() private accessor _multiSelect: boolean = false;
  @state() private accessor _menuOpen: boolean = false;
  @state() private accessor _viewTransform = { x: 0, y: 0, scale: 1 };
  @state() private accessor _myBoardsOpen: boolean = false;
  @state() private accessor _myBoards: SavedBoard[] = [];
  @state() private accessor _userTemplates: UserTemplate[] = [];
  /** Template pending deletion — held until the confirm dialog resolves. */
  #pendingDeleteTemplate: UserTemplate | null = null;
  @state() private accessor _boardSummaryOpen: boolean = false;
  @state() private accessor _boardSummaryData: BoardSummary | null = null;
  @state() private accessor _settingsOpen: boolean = false;
  @state() private accessor _authUser: AuthUser | null = null;
  @state() private accessor _rotateHandleId: string | null = null;
  @state() private accessor _animationMode: boolean = false;
  @state() accessor animationFrames: AnimationFrame[] = [];
  @state() accessor activeFrameIndex: number = 0;
  @state() accessor isPlaying: boolean = false;
  @state() private accessor _playbackProgress: number = 0;
  @state() private accessor _playbackSpeed: number = 1;
  @state() private accessor _playbackLoop: boolean = true;

  @query('cb-field') private accessor _field!: CbField;
  @query('.sidebar') private accessor _sidebar!: HTMLElement;
  @query('cb-share') private accessor _share!: CbShare;
  @query('#svg-import-input') accessor _fileInput!: HTMLInputElement;
  @query('cb-dialogs') private accessor _dialogs!: CbDialogs;  @state() private accessor _boardName: string = 'Untitled Board';
  @state() private accessor _boardNotes: string = '';
  @state() private accessor _viewMode: 'normal' | 'readonly' | 'shared-edit' = 'normal';
  @state() private accessor _updateAvailable: boolean = false;
  @state() private accessor _toastDismissing: boolean = false;
  #updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
  @state() private accessor _showPlayOverlay: boolean = true;
  @state() private accessor _pauseFlash: boolean = false;
  @state() private accessor _playBtnAnim: '' | 'press-out' | 'press-in' = '';
  #currentBoard: SavedBoard | null = null;

  #pendingOpenBoardId: string | null = null;
  #pendingDeleteBoard: SavedBoard | null = null;
  #pendingTemplateApply: UserTemplate | null = null;
  #playBtnTimeout: ReturnType<typeof setTimeout> | null = null;
  #groupDrag: GroupDragState | null = null;
  #handleDrag: HandleDragState | null = null;
  #rotateDrag: RotateDragState | null = null;
  #shapeResizeDrag: ShapeResizeDragState | null = null;
  @state() accessor _draw: DrawState | null = null;
  @state() accessor _shapeDraw: ShapeDrawState | null = null;
  @state() private accessor _measureStart: { x: number; y: number } | null = null;
  @state() private accessor _measureEnd: { x: number; y: number } | null = null;
  @state() private accessor _measureUnit: 'm' | 'yd' = (localStorage.getItem('cb-measure-unit') as 'm' | 'yd') ?? 'm';
  @state() accessor _marquee: { x1: number; y1: number; x2: number; y2: number } | null = null;
  #boundKeyDown = this.#onKeyDown.bind(this);
  #boundWheel = (e: WheelEvent) => this.#onWheel(e);
  #boundTouchStart = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };

  // Pan/pinch tracking
  #panDrag: { startClientX: number; startClientY: number; startVx: number; startVy: number; svgPerPx: number } | null = null;
  #activePointers = new Map<number, { clientX: number; clientY: number }>();
  #pinchStartDist = 0;
  #pinchStartScale = 1;
  #pinchStartPan = { x: 0, y: 0 };
  #onDocClickForMenu = (e: PointerEvent) => {
    const path = e.composedPath();
    // Field orientation dropdown still uses a popup, close it on outside click
    if (this._fieldMenuOpen && !path.includes(this.renderRoot.querySelector('.bottom-center .dropdown-wrap') as EventTarget)) {
      this._fieldMenuOpen = false;
    }
    // Close sidebar tool dropdown when clicking outside the sidebar
    if (this._sidebarMenu && !path.includes(this._sidebar as EventTarget)) {
      this._sidebarMenu = null;
    }
  };

  // Opens a sidebar dropdown and focuses its first item; toggles if already open
  #openSidebarMenu(name: 'select' | 'player' | 'equipment' | 'draw' | 'more', focusIndex: number) {
    this._sidebarFocusIndex = focusIndex;
    const isOpening = this._sidebarMenu !== name;
    this._sidebarMenu = isOpening ? name : null;
    if (isOpening) {
      this.updateComplete.then(() => {
        const first = this.renderRoot.querySelector(
          '.sidebar [role="menu"] [role="menuitem"]:not([disabled]), .sidebar [role="menu"] [role="menuitemradio"]:not([disabled])'
        ) as HTMLElement | null;
        first?.focus();
      });
    }
  }

  #onSidebarMenuKeyDown = (e: KeyboardEvent) => {
    const menu = e.currentTarget as HTMLElement;
    const items = Array.from(menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')) as HTMLElement[];
    const current = items.indexOf(e.target as HTMLElement);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        items[(current + 1) % items.length]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        items[(current - 1 + items.length) % items.length]?.focus();
        break;
      case 'Home':
        e.preventDefault();
        items[0]?.focus();
        break;
      case 'End':
        e.preventDefault();
        items[items.length - 1]?.focus();
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this._sidebarMenu = null;
        // Return focus to the trigger button
        this.updateComplete.then(() => {
          (this.renderRoot.querySelectorAll('.sidebar-tools .sidebar-tool')[this._sidebarFocusIndex] as HTMLElement)?.focus();
        });
        break;
      case 'Tab':
        this._sidebarMenu = null;
        break;
    }
  };

  // Builds the ordered navigable item list for the sidebar toolbar, including
  // cb-toolbar[sidebar-context] shadow-DOM buttons inserted after the Select button.
  // This makes .select-track a full participant in the [role="toolbar"] widget.
  #sidebarNavItems(): HTMLElement[] {
    const lightTools = Array.from(
      this.renderRoot.querySelectorAll<HTMLElement>('.sidebar-tools .sidebar-tool')
    );
    const ctxHost = this.renderRoot.querySelector<HTMLElement>('.select-track cb-toolbar');
    const ctxBtns: HTMLElement[] = ctxHost?.shadowRoot
      ? Array.from(ctxHost.shadowRoot.querySelectorAll<HTMLElement>('.ctx-trigger-btn, .ctx-icon-btn'))
      : [];
    // Composite order: Select, [context buttons], Player, Equipment, Line, More
    return lightTools.length ? [lightTools[0], ...ctxBtns, ...lightTools.slice(1)] : lightTools;
  }

  #onSidebarToolKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    // Shadow-DOM keydown events are retargeted to the cb-toolbar host at the boundary
    const isCtxHost = target.hasAttribute('sidebar-context');
    if (!target.classList.contains('sidebar-tool') && !isCtxHost) return;

    const items = this.#sidebarNavItems();
    if (!items.length) return;

    // Pierce shadow root to find the actually-focused button inside cb-toolbar
    const activeEl = (isCtxHost
      ? (target as HTMLElement).shadowRoot?.activeElement ?? target
      : target) as HTMLElement;
    const currentIdx = items.indexOf(activeEl);

    const lightTools = Array.from(
      this.renderRoot.querySelectorAll<HTMLElement>('.sidebar-tools .sidebar-tool')
    );

    const focusItem = (rawIdx: number) => {
      e.preventDefault();
      const next = items[(rawIdx + items.length) % items.length];
      if (!next) return;
      // Keep _sidebarFocusIndex in sync for light-DOM tools (roving tabindex)
      const lightIdx = lightTools.indexOf(next);
      if (lightIdx !== -1) this._sidebarFocusIndex = lightIdx;
      next.focus();
    };

    switch (e.key) {
      case 'ArrowDown': focusItem(currentIdx >= 0 ? currentIdx + 1 : 1); break;
      case 'ArrowUp':   focusItem(currentIdx >= 0 ? currentIdx - 1 : 0); break;
      case 'Home':      focusItem(0); break;
      case 'End':       focusItem(items.length - 1); break;
    }
  };

  #onSidebarPointerEnter = () => {
    if (!window.matchMedia('(hover: hover)').matches) return;
    this._sidebarCollapsed = false;
  };

  #mobileQuery = window.matchMedia('(max-width: 768px)');
  #sidebarLockObserver: ResizeObserver | null = null;

  #updateSidebarLock() {
    // Defer one frame so SVG aspect-ratio layout is settled
    requestAnimationFrame(() => {
      const sidebar = this._sidebar;
      const svgEl = this._field?.svgEl;
      if (!sidebar || !svgEl) return;

      // When zoomed/panned, getScreenCTM().e reflects the shifted SVG origin,
      // not the actual field position on screen. Skip the recalculation so the
      // lock state from zoom=1 is preserved — changing it at high zoom causes
      // spurious `locked` transitions and can cascade into orientation changes.
      if (this._viewTransform.scale !== 1 || this._viewTransform.x !== 0 || this._viewTransform.y !== 0) return;

      const sidebarRight = sidebar.getBoundingClientRect().right;
      // getScreenCTM().e is the screen x of the SVG origin (x=0 = left field
      // boundary line) — this accounts for preserveAspectRatio centering that
      // getBoundingClientRect() on the element itself misses
      const ctm = svgEl.getScreenCTM();
      const fieldLeft = ctm ? ctm.e : svgEl.getBoundingClientRect().left;
      const locked = fieldLeft > sidebarRight + 8; // 8px clearance from field line
      sidebar.classList.toggle('sidebar-locked', locked);
      if (locked) this._sidebarCollapsed = false;
    });
  }
  #onMobileChange = (e: MediaQueryListEvent) => {
    if (this.#isPrinting) return;
    this._isMobile = e.matches;
    // Intentionally does not touch _sidebarCollapsed — sidebar visibility is
    // user-controlled via the grab handle regardless of viewport breakpoint.
    if (this._viewMode === 'readonly') {
      if (e.matches && this.fieldOrientation === 'horizontal') {
        this.#rotateLoadedData('vertical');
        this.fieldOrientation = 'vertical';
      }
      return;
    }
    if (e.matches) {
      this.#requestOrientation('vertical');
    } else if (this.#currentBoard) {
      const saved = this.#currentBoard.fieldOrientation;
      if (saved && saved !== this.fieldOrientation) this.#requestOrientation(saved);
    }
  };
  #undoStack: Snapshot[] = [];
  #redoStack: Snapshot[] = [];
  #playbackRaf: number | null = null;
  #playbackLastTime: number | null = null;
  #trailDrag: { id: string; cp: 'cp1' | 'cp2' } | null = null;
  #lastPlacedId: string | null = null;
  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  #clipboard: { players: Player[]; equipment: Equipment[]; lines: Line[]; shapes: Shape[]; textItems: TextItem[] } | null = null;
  #isPrinting = false;
  #cachedSummary: BoardSummary | null = null;

  #snapshot(): Snapshot {
    return {
      players: structuredClone(this.players),
      lines: structuredClone(this.lines),
      equipment: structuredClone(this.equipment),
      shapes: structuredClone(this.shapes),
      textItems: structuredClone(this.textItems),
      animationFrames: structuredClone(this.animationFrames),
      fieldOrientation: this.fieldOrientation,
      fieldTheme: this.fieldTheme,
      pitchType: this.pitchType,
    };
  }

  get #isBoardEmpty(): boolean {
    return !this.players.length && !this.lines.length && !this.equipment.length
      && !this.shapes.length && !this.textItems.length && !this.animationFrames.length;
  }

  get #isBoardSaved(): boolean {
    return !!this.#currentBoard && this.#currentBoard.name !== 'Untitled Board';
  }

  get #anySheetOpen(): boolean {
    return this._myBoardsOpen || this._boardSummaryOpen || this._settingsOpen;
  }

  get #measureState(): MeasureState | null {
    if (!this._measureStart || !this._measureEnd) return null;
    return { x1: this._measureStart.x, y1: this._measureStart.y, x2: this._measureEnd.x, y2: this._measureEnd.y, unit: this._measureUnit };
  }

  // ── Cloud sync helpers (fire-and-forget; never block the UI) ──────────────

  #cloudSaveBoard(board: SavedBoard): void {
    if (!this._authUser) return;
    cloudSyncBoard(board).catch(() => {});
  }

  #cloudDeleteBoard(id: string): void {
    if (!this._authUser) return;
    cloudDeleteBoard(id).catch(() => {});
  }

  #cloudSaveTemplate(template: UserTemplate): void {
    if (!this._authUser) return;
    cloudSyncTemplate(template).catch(() => {});
  }

  #cloudDeleteTemplate(id: string): void {
    if (!this._authUser) return;
    cloudDeleteTemplate(id).catch(() => {});
  }

  #saveToStorage() {
    if (!this.#currentBoard) return;
    this.#currentBoard = {
      ...this.#currentBoard,
      fieldTheme: this.fieldTheme,
      fieldOrientation: this.fieldOrientation,
      pitchType: this.pitchType,
      animationMode: this._animationMode,
      playbackLoop: this._playbackLoop,
      players: this.players,
      lines: this.lines,
      equipment: this.equipment,
      shapes: this.shapes,
      textItems: this.textItems,
      animationFrames: this.animationFrames,
      notes: this._boardNotes || undefined,
    };
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(async () => {
      if (this.#currentBoard?.name !== 'Untitled Board') {
        const thumb = await this.#generateThumbnail();
        if (thumb && this.#currentBoard) {
          this.#currentBoard = { ...this.#currentBoard, thumbnail: thumb };
        }
      }
      saveBoard(this.#currentBoard!).catch(() => {});
      this.#cloudSaveBoard(this.#currentBoard!);
      this.#saveTimer = null;
    }, 500);
  }

  async #migrateFromLocalStorage(): Promise<SavedBoard | undefined> {
    try {
      const raw = localStorage.getItem('coach-board-state');
      if (!raw) return undefined;
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (!Array.isArray(data.players)) return undefined;

      const themeRaw = localStorage.getItem('coach-board-theme');
      const orientRaw = localStorage.getItem('coach-board-orientation');

      const board = createEmptyBoard();
      board.players = data.players as Player[];
      board.lines = (data.lines ?? []) as Line[];
      board.equipment = (data.equipment ?? []) as Equipment[];
      board.shapes = (data.shapes ?? []) as Shape[];
      board.textItems = (data.textItems ?? []) as TextItem[];
      board.animationFrames = (data.animationFrames ?? []) as AnimationFrame[];
      board.animationMode = typeof data.animationMode === 'boolean' ? data.animationMode : false;
      if (themeRaw === 'green' || themeRaw === 'white') board.fieldTheme = themeRaw;
      if (orientRaw === 'horizontal' || orientRaw === 'vertical') board.fieldOrientation = orientRaw;

      await saveBoard(board);

      localStorage.removeItem('coach-board-state');
      localStorage.removeItem('coach-board-theme');
      localStorage.removeItem('coach-board-orientation');

      return board;
    } catch { return undefined; }
  }

  async #loadFromStorage() {
    try {
      let boardId = getActiveBoardId();
      let board: SavedBoard | undefined;

      if (boardId) {
        board = await loadBoard(boardId);
      }

      if (!board) {
        board = await this.#migrateFromLocalStorage();
      }

      if (!board) {
        board = createEmptyBoard();
        await saveBoard(board);
      }

      this.#currentBoard = board;
      this._boardName = board.name;
      setActiveBoardId(board.id);

      if (board.players.length) this.players = board.players;
      if (board.lines.length) this.lines = board.lines;
      if (board.equipment.length) this.equipment = board.equipment.map(eq =>
        (eq.kind === 'cone' || eq.kind === 'dummy' || eq.kind === 'pole') && !eq.color
          ? { ...eq, color: COLORS.coneChartreuse }
          : eq
      );
      if (board.shapes.length) this.shapes = board.shapes;
      if (board.textItems.length) this.textItems = board.textItems;
      if (board.animationFrames.length) this.animationFrames = board.animationFrames;
      if (board.animationMode) this._animationMode = board.animationMode;
      if (board.playbackLoop) this._playbackLoop = board.playbackLoop;

      if (!this._isMobile && (board.fieldOrientation === 'horizontal' || board.fieldOrientation === 'vertical')) {
        this.fieldOrientation = board.fieldOrientation;
      }
      if (board.fieldTheme === 'green' || board.fieldTheme === 'white') {
        this.fieldTheme = board.fieldTheme;
      }
      this.pitchType = board.pitchType ?? 'full';
      this._boardNotes = board.notes ?? '';

      const allIds = [
        ...this.players, ...this.equipment, ...this.shapes, ...this.textItems,
      ].map(i => i.id)
        .concat(this.lines.map(l => l.id))
        .concat(this.animationFrames.map(f => f.id));
      for (const id of allIds) {
        const num = parseInt(id.split('-').pop() ?? '0', 10);
        if (!isNaN(num)) ensureMinId(num);
      }
    } catch { /* corrupted data */ }
  }

  async #loadFromUrl() {
    const path = window.location.pathname;
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);

    let json: string | null = null;
    let mode: string | null = null;

    const shortMatch = path.match(/^\/s\/([a-zA-Z0-9_-]+)/);
    if (shortMatch) {
      const id = shortMatch[1];
      mode = params.get('mode');
      try {
        const res = await fetch(`/api/share/${id}`);
        if (res.ok) json = await res.text();
      } catch { /* network error */ }
    } else if (hash.startsWith('#board=')) {
      try {
        const { decompressFromEncodedURIComponent } = await import('lz-string');
        const hashContent = hash.slice('#board='.length);
        const parts = hashContent.split('&');
        const compressed = parts[0];
        for (let i = 1; i < parts.length; i++) {
          if (parts[i].startsWith('mode=')) mode = parts[i].slice('mode='.length);
        }
        json = decompressFromEncodedURIComponent(compressed);
      } catch { /* invalid hash */ }
    }

    if (!json) return;

    try {
      const data = JSON.parse(json) as Record<string, unknown>;
      if (!Array.isArray(data.players)) return;

      this.players = data.players as Player[];
      if (Array.isArray(data.lines)) this.lines = data.lines as Line[];
      if (Array.isArray(data.equipment)) this.equipment = data.equipment as Equipment[];
      if (Array.isArray(data.shapes)) this.shapes = data.shapes as Shape[];
      if (Array.isArray(data.textItems)) this.textItems = data.textItems as TextItem[];
      if (Array.isArray(data.animationFrames)) {
        this.animationFrames = data.animationFrames as AnimationFrame[];
        if (this.animationFrames.length > 0) this._animationMode = true;
      }
      if (typeof data.playbackLoop === 'boolean') this._playbackLoop = data.playbackLoop;
      if (data.fieldTheme === 'green' || data.fieldTheme === 'white') {
        this.fieldTheme = data.fieldTheme;
      }
      if (data.pitchType === 'full' || data.pitchType === 'half' || data.pitchType === 'half-attack' || data.pitchType === 'open') {
        this.pitchType = data.pitchType;
      }
      if (data.fieldOrientation === 'horizontal' || data.fieldOrientation === 'vertical') {
        this.fieldOrientation = data.fieldOrientation as FieldOrientation;
      }
      if (this._isMobile && this.fieldOrientation === 'horizontal') {
        this.#rotateLoadedData('vertical');
        this.fieldOrientation = 'vertical';
      }

      if (typeof data.name === 'string' && data.name.trim()) {
        this._boardName = data.name as string;
      }

      if (mode === 'view') this._viewMode = 'readonly';
      else if (mode === 'edit') this._viewMode = 'shared-edit';

      this.selectedIds = new Set();
      if (!shortMatch) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch { /* invalid data */ }
  }

  #pushUndo() {
    this.#undoStack.push(this.#snapshot());
    if (this.#undoStack.length > MAX_HISTORY) this.#undoStack.shift();
    this.#redoStack = [];
    this.requestUpdate();
  }

  // ── View transform (zoom / pan) ────────────────────────────────────────

  #clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
  }

  #getPanLimits() {
    const fd = getFieldDimensions(this.fieldOrientation, this.pitchType);
    return { maxX: fd.w * 0.75, maxY: fd.h * 0.75 };
  }

  #applyZoom(newScale: number) {
    const s = this.#clamp(newScale, 0.25, 8);
    const { maxX, maxY } = this.#getPanLimits();
    this._viewTransform = {
      scale: s,
      x: this.#clamp(this._viewTransform.x, -maxX, maxX),
      y: this.#clamp(this._viewTransform.y, -maxY, maxY),
    };
  }

  #zoomIn()    { this.#applyZoom(this._viewTransform.scale * 1.25); }
  #zoomOut()   { this.#applyZoom(this._viewTransform.scale / 1.25); }
  #resetView() { this._viewTransform = { x: 0, y: 0, scale: 1 }; }

  #onWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      // Always prevent the browser from zoom-scaling the viewport, regardless of
      // where the pinch/ctrl-wheel lands (toolbar, sidebar, etc.)
      e.preventDefault();
      if (this._viewMode === 'readonly') return;
      const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
      this.#applyZoom(this._viewTransform.scale * factor);
    } else {
      // Plain scroll: only pan the field if the event target is within the field area
      if (this._viewMode === 'readonly') return;
      const fieldEl = this._field;
      if (!fieldEl || !e.composedPath().includes(fieldEl)) return;
      const { maxX, maxY } = this.#getPanLimits();
      const ctm = fieldEl.svgEl?.getScreenCTM();
      const svgPerPx = ctm ? 1 / Math.abs(ctm.a) : 1;
      this._viewTransform = {
        ...this._viewTransform,
        x: this.#clamp(this._viewTransform.x + e.deltaX * svgPerPx, -maxX, maxX),
        y: this.#clamp(this._viewTransform.y + e.deltaY * svgPerPx, -maxY, maxY),
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  #undo() {
    if (this.#undoStack.length === 0) return;
    this.#redoStack.push(this.#snapshot());
    const prev = this.#undoStack.pop()!;
    this.players = prev.players;
    this.lines = prev.lines;
    this.equipment = prev.equipment;
    this.shapes = prev.shapes;
    this.textItems = prev.textItems;
    this.animationFrames = prev.animationFrames;
    this.fieldOrientation = prev.fieldOrientation;
    this.fieldTheme = prev.fieldTheme;
    this.pitchType = prev.pitchType;
    this.selectedIds = new Set();
  }

  #redo() {
    if (this.#redoStack.length === 0) return;
    this.#undoStack.push(this.#snapshot());
    const next = this.#redoStack.pop()!;
    this.players = next.players;
    this.lines = next.lines;
    this.equipment = next.equipment;
    this.shapes = next.shapes;
    this.textItems = next.textItems;
    this.animationFrames = next.animationFrames;
    this.fieldOrientation = next.fieldOrientation;
    this.fieldTheme = next.fieldTheme;
    this.pitchType = next.pitchType;
    this.selectedIds = new Set();
  }

  #saveSvg() {
    this._menuOpen = false;
    const svgClone = this._field.svgEl.cloneNode(true) as SVGSVGElement;
    svgClone.querySelectorAll('[data-kind="rotate"]').forEach(el => el.remove());
    svgClone.querySelectorAll('[stroke-dasharray="0.5,0.3"], [stroke-dasharray="0.4,0.25"]').forEach(el => el.remove());
    svgClone.querySelectorAll('[data-kind="line-start"], [data-kind="line-end"], [data-kind="line-control"]').forEach(el => el.remove());
    svgClone.querySelectorAll(`[stroke="${COLORS.annotation}"]`).forEach(el => el.remove());
    svgClone.querySelectorAll('[stroke="transparent"]').forEach(el => el.remove());

    const meta = document.createElementNS('http://www.w3.org/2000/svg', 'desc');
    meta.setAttribute('id', 'coaching-board-data');
    meta.setAttribute('data-version', __APP_VERSION__);
    meta.textContent = JSON.stringify({
      players: this.players,
      lines: this.lines,
      equipment: this.equipment,
      shapes: this.shapes,
      textItems: this.textItems,
      animationFrames: this.animationFrames,
      fieldTheme: this.fieldTheme,
      fieldOrientation: this.fieldOrientation,
      pitchType: this.pitchType,
      playbackLoop: this._playbackLoop,
    });
    svgClone.insertBefore(meta, svgClone.firstChild);

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgClone);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coaching-board.svg';
    a.click();
    URL.revokeObjectURL(url);
  }

  #savePng() {
    this._menuOpen = false;
    const svgClone = this._field.svgEl.cloneNode(true) as SVGSVGElement;
    svgClone.querySelectorAll('[data-kind="rotate"]').forEach(el => el.remove());
    svgClone.querySelectorAll('[stroke-dasharray="0.5,0.3"], [stroke-dasharray="0.4,0.25"]').forEach(el => el.remove());
    svgClone.querySelectorAll('[data-kind="line-start"], [data-kind="line-end"], [data-kind="line-control"]').forEach(el => el.remove());
    svgClone.querySelectorAll(`[stroke="${COLORS.annotation}"]`).forEach(el => el.remove());
    svgClone.querySelectorAll('[stroke="transparent"]').forEach(el => el.remove());

    const vb = this._field.svgEl.viewBox.baseVal;
    const scale = 10;
    const w = vb.width * scale;
    const h = vb.height * scale;

    svgClone.setAttribute('width', String(w));
    svgClone.setAttribute('height', String(h));

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgClone);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob(blob => {
        if (!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = 'coaching-board.png';
        a.click();
        URL.revokeObjectURL(pngUrl);
      }, 'image/png');
    };
    img.src = svgUrl;
  }

  async #generateThumbnail(): Promise<string | undefined> {
    try {
      const svgEl = this._field?.svgEl;
      if (!svgEl) return undefined;
      const vb = svgEl.viewBox.baseVal;
      if (!vb.width || !vb.height) return undefined;

      const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
      svgClone.querySelectorAll('[data-kind="rotate"]').forEach(el => el.remove());
      svgClone.querySelectorAll('[stroke-dasharray="0.5,0.3"], [stroke-dasharray="0.4,0.25"]').forEach(el => el.remove());
      svgClone.querySelectorAll('[data-kind="line-start"], [data-kind="line-end"], [data-kind="line-control"]').forEach(el => el.remove());
      svgClone.querySelectorAll(`[stroke="${COLORS.annotation}"]`).forEach(el => el.remove());
      svgClone.querySelectorAll('[stroke="transparent"]').forEach(el => el.remove());

      const ZOOM = 0.8;
      const cropW = vb.width * ZOOM;
      const cropH = vb.height * ZOOM;
      const cropX = vb.x + (vb.width - cropW) / 2;
      const cropY = vb.y + (vb.height - cropH) / 2;
      svgClone.setAttribute('viewBox', `${cropX} ${cropY} ${cropW} ${cropH}`);

      const THUMB_W = 320;
      const w = THUMB_W;
      const h = Math.round(cropH * (THUMB_W / cropW));
      svgClone.setAttribute('width', String(w));
      svgClone.setAttribute('height', String(h));

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgClone);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      return new Promise<string | undefined>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(svgUrl);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => { URL.revokeObjectURL(svgUrl); resolve(undefined); };
        img.src = svgUrl;
      });
    } catch {
      return undefined;
    }
  }

  async #saveGif() {
    this._menuOpen = false;
    if (this.animationFrames.length < 2) return;

    const { encode } = await import('modern-gif');

    const vb = this._field.svgEl.viewBox.baseVal;
    const scale = 10;
    const w = Math.round(vb.width * scale);
    const h = Math.round(vb.height * scale);
    const fps = 20;
    const frameDuration = 1000 / this._playbackSpeed;
    const stepsPerTransition = Math.round((frameDuration / 1000) * fps);
    const delayPerStep = Math.round(1000 / fps);

    const frames: Array<{ data: ImageData; delay: number }> = [];

    const savedPlaying = this.isPlaying;
    const savedFrame = this.activeFrameIndex;
    const savedProgress = this._playbackProgress;
    const savedSelection = this.selectedIds;
    this.selectedIds = new Set();
    this.isPlaying = true;

    const captureFrame = async (): Promise<ImageData> => {
      await this.updateComplete;
      const svgClone = this._field.svgEl.cloneNode(true) as SVGSVGElement;
      svgClone.querySelectorAll('[data-kind="rotate"]').forEach(el => el.remove());
      svgClone.querySelectorAll('[stroke-dasharray="0.5,0.3"], [stroke-dasharray="0.4,0.25"]').forEach(el => el.remove());
      svgClone.querySelectorAll('[data-kind="line-start"], [data-kind="line-end"], [data-kind="line-control"]').forEach(el => el.remove());
      svgClone.querySelectorAll(`[stroke="${COLORS.annotation}"]`).forEach(el => el.remove());
      svgClone.querySelectorAll('[stroke="transparent"]').forEach(el => el.remove());
      svgClone.querySelectorAll('[data-kind="trail-cp1"], [data-kind="trail-cp2"]').forEach(el => el.remove());
      svgClone.setAttribute('width', String(w));
      svgClone.setAttribute('height', String(h));

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgClone);
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(ctx.getImageData(0, 0, w, h));
        };
        img.src = url;
      });
    };

    try {
      for (let fi = 0; fi < this.animationFrames.length - 1; fi++) {
        for (let step = 0; step < stepsPerTransition; step++) {
          const t = step / stepsPerTransition;
          this.activeFrameIndex = fi;
          this._playbackProgress = t;
          const imageData = await captureFrame();
          frames.push({ data: imageData, delay: delayPerStep });
        }
      }

      this.activeFrameIndex = this.animationFrames.length - 1;
      this._playbackProgress = 0;
      const lastFrame = await captureFrame();
      frames.push({ data: lastFrame, delay: delayPerStep * 10 });
    } finally {
      this.isPlaying = savedPlaying;
      this.activeFrameIndex = savedFrame;
      this._playbackProgress = savedProgress;
      this.selectedIds = savedSelection;
    }

    const gifBlob = await encode({
      width: w,
      height: h,
      frames: frames.map(f => ({
        data: f.data.data,
        delay: f.delay,
      })),
      format: 'blob',
    }) as Blob;

    const url = URL.createObjectURL(gifBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coaching-board.gif';
    a.click();
    URL.revokeObjectURL(url);
  }


  get #selectedItems(): Array<Player | Equipment | Line | Shape | TextItem> {
    const ids = this.selectedIds;
    if (ids.size === 0) return [];
    const items: Array<Player | Equipment | Line | Shape | TextItem> = [];
    for (const p of this.players) if (ids.has(p.id)) items.push(p);
    for (const eq of this.equipment) if (ids.has(eq.id)) items.push(eq);
    for (const l of this.lines) if (ids.has(l.id)) items.push(l);
    for (const s of this.shapes) if (ids.has(s.id)) items.push(s);
    for (const t of this.textItems) if (ids.has(t.id)) items.push(t);
    return items;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.#boundKeyDown);
    document.addEventListener('pointerdown', this.#onDocClickForMenu);
    this.#mobileQuery.addEventListener('change', this.#onMobileChange);
    this._isMobile = this.#mobileQuery.matches;
    this._sidebarCollapsed = false;
    this.updateComplete.then(() => {
      this.#sidebarLockObserver = new ResizeObserver(() => this.#updateSidebarLock());
      const boardArea = this.renderRoot.querySelector('.board-area');
      if (boardArea) this.#sidebarLockObserver.observe(boardArea);
      // Also observe the SVG directly — its rendered size changes on both
      // width and height resizes (aspect-ratio scaling)
      const svgEl = this._field?.svgEl;
      if (svgEl) this.#sidebarLockObserver.observe(svgEl);
      // Prevent browser-level pinch/zoom across the ENTIRE page, not just the field.
      // A ctrlKey+wheel anywhere on chrome (toolbar, sidebar) would otherwise still
      // change the viewport and trigger orientation media queries.
      // passive:false is required so e.preventDefault() is honoured.
      document.addEventListener('wheel', this.#boundWheel, { passive: false });
      // Belt-and-suspenders for touch devices (older Safari ignores touch-action on SVG)
      document.addEventListener('touchstart', this.#boundTouchStart, { passive: false });
    });
    // Extend double-tap zoom prevention to the full document. touch-action on
    // :host only covers shadow DOM descendants; light DOM elements (bottom bar,
    // toolbar) would still be reachable by iOS double-tap without this.
    document.body.style.touchAction = 'manipulation';
    if (this._isMobile) {
      this.fieldOrientation = 'vertical';
    }
    const isSharedUrl = /^\/s\//.test(window.location.pathname);
    if (!isSharedUrl) {
      this.#loadFromStorage().then(() => this.#loadFromUrl());
    } else {
      this.#loadFromUrl();
    }

    this.#updateSW = registerSW({
      onNeedRefresh: () => { this._updateAvailable = true; },
    });

    initAuth(user => { this._authUser = user; });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.#boundKeyDown);
    document.removeEventListener('pointerdown', this.#onDocClickForMenu);
    document.removeEventListener('wheel', this.#boundWheel);
    document.removeEventListener('touchstart', this.#boundTouchStart);
    this.#mobileQuery.removeEventListener('change', this.#onMobileChange);
    document.body.style.touchAction = '';
    this.#sidebarLockObserver?.disconnect();
    this.#sidebarLockObserver = null;
    this.#stopPlayback();
  }

  protected override updated(changedProperties: Map<PropertyKey, unknown>) {
    if (changedProperties.has('players') || changedProperties.has('lines') ||
        changedProperties.has('equipment') || changedProperties.has('shapes') ||
        changedProperties.has('textItems') || changedProperties.has('animationFrames') ||
        changedProperties.has('_playbackLoop')) {
      this.#saveToStorage();
    }
    if (changedProperties.has('selectedIds') && this._rotateHandleId && !this.selectedIds.has(this._rotateHandleId)) {
      this._rotateHandleId = null;
    }
    if (changedProperties.has('activeTool')) {
      this._sidebarCollapsed = false;
      if (this.activeTool !== 'measure') {
        this._measureStart = null;
        this._measureEnd = null;
      }
    }
  }

  #renderMenuPanel() {
    const menuItem = (label: string, icon: ReturnType<typeof html>, handler: () => void) => html`
      <button @click="${handler}">
        ${icon}
        ${label}
      </button>
    `;

    return html`
      <div class="menu-panel"
           aria-hidden="${ifDefined(!this._menuOpen ? 'true' : undefined)}"
           ?inert="${!this._menuOpen}"
           role="navigation"
           aria-label="Main menu">

        <div class="menu-header">
          <svg class="menu-logo" viewBox="0 0 1600 1600" aria-hidden="true">
            <path d="M1600 801C1600 1242.28 1242.28 1600 801 1600C359.724 1600 2 1242.28 2 801C2 359.724 359.724 2 801 2C1242.28 2 1600 359.724 1600 801Z" fill="var(--pt-color-brand-green-dark)"/>
            <path d="M801 2C1241.94 2 1599.46 359.184 1600 800H2.00195C2.54191 359.184 360.058 2 801 2Z" fill="var(--pt-color-brand-green-light)"/>
            <path d="M407.703 634.189C414.778 641.264 424.03 644.802 433.374 644.802C442.626 644.802 451.969 641.264 459.044 634.189L541.044 552.099L623.134 634.189C630.209 641.264 639.461 644.802 648.805 644.802C658.057 644.802 667.4 641.264 674.475 634.189C688.626 620.039 688.626 597.09 674.475 582.849L592.385 500.759L674.475 418.669C688.626 404.519 688.626 381.57 674.475 367.33C660.325 353.179 637.376 353.179 623.136 367.33L541.046 449.511L458.955 367.42C444.805 353.27 421.856 353.27 407.616 367.42C393.465 381.571 393.465 404.52 407.616 418.76L489.706 500.85L407.616 582.94C393.465 597 393.465 619.949 407.706 634.189H407.703Z" fill="white"/>
            <path d="M912.405 1144.4C912.405 1232.51 984.12 1304.24 1072.2 1304.24C1160.29 1304.24 1232 1232.51 1232 1144.4C1232 1056.29 1160.29 984.65 1072.2 984.65C984.12 984.56 912.405 1056.29 912.405 1144.4ZM1159.66 1144.4C1159.66 1192.62 1120.41 1231.88 1072.21 1231.88C1024.01 1231.88 984.761 1192.62 984.761 1144.4C984.761 1096.19 1024.01 1057.02 1072.21 1057.02C1120.41 1056.93 1159.66 1096.19 1159.66 1144.4Z" fill="white"/>
            <path d="M812.403 834.487L700.593 877.625C605.61 914.252 541.835 1007.22 541.835 1108.88V1268.14C541.835 1288.13 558.027 1304.32 578.019 1304.32C598.011 1304.32 614.203 1288.13 614.203 1268.14V1108.88C614.203 1036.89 659.344 971.049 726.646 945.093L838.456 901.955C933.349 865.328 997.124 772.446 997.124 670.701V480.418L1042.72 525.999C1049.77 533.053 1059 536.58 1068.32 536.58C1077.54 536.58 1086.86 533.053 1093.92 525.999C1108.03 511.89 1108.03 489.009 1093.92 474.811L986.45 367.368C972.338 353.26 949.451 353.26 935.25 367.368L827.782 474.811C813.67 488.919 813.67 511.891 827.782 525.999C834.838 533.053 844.065 536.58 853.383 536.58C862.61 536.58 871.927 533.053 878.984 525.999L924.757 480.236V670.792C924.757 742.691 879.615 808.531 812.403 834.487Z" fill="white"/>
          </svg>
          <span class="menu-brand">CoachingBoard</span>
        </div>

        <nav class="menu-nav">
          ${menuItem('Home', html`<svg viewBox="0 0 1600 1600" width="20" height="20" fill="currentColor"><path d="M1214.45 54.9997H385.56C309.309 54.9997 247.16 117.052 247.16 193.346V1406.75C247.16 1483 309.259 1545.09 385.56 1545.09H1214.47C1290.72 1545.09 1352.87 1483.04 1352.87 1406.75L1352.86 193.293C1352.86 117.042 1290.71 54.9863 1214.46 54.9863L1214.45 54.9997ZM639.4 145H960.2L958.997 292.2L639.397 290.601L639.4 145ZM960.6 1455H639.8L641.05 1307.85L960.65 1309.45L960.655 1455L960.6 1455ZM1262.8 1406.7C1262.8 1433.35 1241.1 1455 1214.45 1455H1050.65V1309.45C1050.65 1258.9 1009.55 1217.8 959 1217.8L641 1217.81C590.448 1217.81 549.349 1258.91 549.349 1309.46V1455H385.549C358.899 1455 337.2 1433.35 337.2 1406.7L337.195 845.009H569.941C591.04 952.858 686.092 1034.61 799.995 1034.61C913.897 1034.61 1008.99 952.86 1030.05 845.009H1262.79L1262.8 1406.7ZM936.693 845.004C917.641 902.602 863.944 944.556 800 944.556C736.056 944.556 682.349 902.608 663.307 845.004H936.693ZM663.293 755.004C682.345 697.405 736.043 655.452 799.987 655.452C863.931 655.452 917.637 697.4 936.68 755.004H663.293ZM1262.79 755.004H1030.04C1008.94 647.154 913.889 565.404 799.987 565.404C686.084 565.404 590.987 647.153 569.933 755.004H337.187V193.31C337.187 166.66 358.884 145.008 385.536 145.008H549.336V290.554C549.336 341.106 590.435 382.205 640.987 382.205H958.933C1009.49 382.205 1050.58 341.106 1050.58 290.554V145.008H1214.38C1241.03 145.008 1262.73 166.658 1262.73 193.31V755.004H1262.79Z" /></svg>`,
            () => { this.#toggleMenu(); })}
          <div class="menu-nav-divider"></div>

          ${this._viewMode !== 'readonly' ? html`
            ${menuItem('My Boards', html`<svg viewBox="0 0 1200 1200" fill="currentColor"><path d="m250 1087.5h700c49.707-0.066406 97.359-19.84 132.51-54.992 35.152-35.148 54.926-82.801 54.992-132.51v-450c-0.066406-49.707-19.84-97.359-54.992-132.51-35.148-35.152-82.801-54.926-132.51-54.992h-287.9c-29.824-0.074219-58.41-11.918-79.551-32.949l-62.102-62.102c-35.199-35.098-82.84-54.863-132.55-55h-137.9c-49.715 0.066406-97.375 19.848-132.53 55.008-35.148 35.16-54.918 82.828-54.973 132.54v600c0.066406 49.707 19.84 97.359 54.992 132.51 35.148 35.152 82.801 54.926 132.51 54.992zm-112.5-787.5c0.039062-29.824 11.906-58.418 32.996-79.504 21.086-21.09 49.68-32.957 79.504-32.996h137.9c29.824 0.074219 58.41 11.918 79.551 32.949l62.102 62.102c35.199 35.098 82.84 54.863 132.55 55h287.9c29.816 0.039063 58.398 11.898 79.488 32.977 21.086 21.078 32.957 49.656 33.012 79.473v450c-0.039062 29.824-11.906 58.418-32.996 79.504-21.086 21.09-49.68 32.957-79.504 32.996h-700c-29.824-0.039062-58.418-11.906-79.504-32.996-21.09-21.086-32.957-49.68-32.996-79.504z"/></svg>`,
              this.#showMyBoards)}
            ${menuItem('New Board', html`<svg viewBox="0 0 1200 1200" fill="currentColor"><path d="m300 1137.5h600c62.965-0.078125 123.33-25.129 167.85-69.648 44.52-44.523 69.57-104.89 69.648-167.85v-600c-0.078125-62.965-25.129-123.33-69.648-167.85-44.523-44.52-104.89-69.57-167.85-69.648h-600c-62.965 0.078125-123.33 25.129-167.85 69.648-44.52 44.523-69.57 104.89-69.648 167.85v600c0.078125 62.965 25.129 123.33 69.648 167.85 44.523 44.52 104.89 69.57 167.85 69.648zm-162.5-837.5c0.054688-43.082 17.191-84.383 47.652-114.85 30.465-30.461 71.766-47.598 114.85-47.652h600c43.082 0.054688 84.383 17.191 114.85 47.652 30.461 30.465 47.598 71.766 47.652 114.85v600c-0.054688 43.082-17.191 84.383-47.652 114.85-30.465 30.461-71.766 47.598-114.85 47.652h-600c-43.082-0.054688-84.383-17.191-114.85-47.652-30.461-30.465-47.598-71.766-47.652-114.85z"/><path d="m400 637.5h162.5v162.5c0 13.398 7.1484 25.777 18.75 32.477 11.602 6.6992 25.898 6.6992 37.5 0 11.602-6.6992 18.75-19.078 18.75-32.477v-162.5h162.5c13.398 0 25.777-7.1484 32.477-18.75 6.6992-11.602 6.6992-25.898 0-37.5-6.6992-11.602-19.078-18.75-32.477-18.75h-162.5v-162.5c0-13.398-7.1484-25.777-18.75-32.477-11.602-6.6992-25.898-6.6992-37.5 0-11.602 6.6992-18.75 19.078-18.75 32.477v162.5h-162.5c-13.398 0-25.777 7.1484-32.477 18.75-6.6992 11.602-6.6992 25.898 0 37.5 6.6992 11.602 19.078 18.75 32.477 18.75z"/></svg>`,
              this.#handleNewBoard)}
            ${menuItem('Save Board', html`<svg viewBox="0 0 1200 1200" fill="currentColor"><path d="m112.5 200v800c0.027344 36.461 14.523 71.418 40.301 97.199 25.781 25.777 60.738 40.273 97.199 40.301h700c36.461-0.027344 71.418-14.523 97.199-40.301 25.777-25.781 40.273-60.738 40.301-97.199v-615c0.027344-31.207-10.551-61.496-30-85.898l-148.05-185c-26.07-32.719-65.664-51.723-107.5-51.602h-551.95c-36.461 0.027344-71.418 14.523-97.199 40.301-25.777 25.781-40.273 60.738-40.301 97.199zm225 862.5v-362.5c0-6.9023 5.5977-12.5 12.5-12.5h500c3.3164 0 6.4961 1.3164 8.8398 3.6602s3.6602 5.5234 3.6602 8.8398v362.5zm375-925v112.5c0 3.3164-1.3164 6.4961-3.6602 8.8398s-5.5234 3.6602-8.8398 3.6602h-300c-6.9023 0-12.5-5.5977-12.5-12.5v-112.5zm-525 62.5c0.027344-16.566 6.6211-32.449 18.336-44.164 11.715-11.715 27.598-18.309 44.164-18.336h62.5v112.5c0.027344 23.199 9.2539 45.438 25.656 61.844 16.406 16.402 38.645 25.629 61.844 25.656h300c23.199-0.027344 45.438-9.2539 61.844-25.656 16.402-16.406 25.629-38.645 25.656-61.844v-112.5h14.449c18.996-0.042969 36.969 8.5938 48.801 23.449l148.1 185c8.8086 11.113 13.617 24.871 13.648 39.051v615c-0.027344 16.566-6.6211 32.449-18.336 44.164-11.715 11.715-27.598 18.309-44.164 18.336h-12.5v-362.5c-0.027344-23.199-9.2539-45.438-25.656-61.844-16.406-16.402-38.645-25.629-61.844-25.656h-500c-23.199 0.027344-45.438 9.2539-61.844 25.656-16.402 16.406-25.629 38.645-25.656 61.844v362.5h-12.5c-16.566-0.027344-32.449-6.6211-44.164-18.336-11.715-11.715-18.309-27.598-18.336-44.164z"/></svg>`,
              this.#showSaveBoard)}
            ${menuItem('Save As\u2026', html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="5" y="5" width="8" height="8" rx="1"/><path d="M3 11V3a1 1 0 0 1 1-1h8" stroke-linecap="round"/></svg>`,
              this.#handleSaveAs)}
            <div class="menu-nav-divider"></div>
          ` : nothing}

          ${this._viewMode !== 'readonly' ? html`
            ${menuItem('Board Summary', html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 5h6M5 8h6M5 11h4" stroke-linecap="round"/></svg>`,
              this.#showBoardSummary)}
            ${menuItem('Print Board', html`<svg viewBox="0 0 1600 1600" width="20" height="20" fill="currentColor"><path d="M995.402 150.155C1031.17 150.588 1064.67 164.658 1089.83 189.816L1203.83 303.816C1229.44 329.424 1243.55 363.588 1243.55 399.947V648.853H1346V648.851H1350C1459.71 648.851 1549 738.142 1549 847.851V1250.9C1549 1360.61 1459.71 1449.9 1350 1449.9H250C140.291 1449.9 51 1360.61 51 1250.9V847.851C51 738.142 140.291 648.851 250 648.851L356.297 648.855V290.203C356.297 212.992 419.142 150.149 496.351 150.149L993.697 150.144L995.402 150.155ZM250.001 746.855C194.263 746.855 149.001 792.162 149.001 847.855V1250.91C149.001 1306.65 194.308 1351.91 250.001 1351.91H314.054V1209.6C314.054 1155.04 358.442 1110.6 413.054 1110.6H1187C1241.56 1110.6 1286 1154.99 1286 1209.6V1351.91H1350C1405.74 1351.91 1451 1306.6 1451 1250.91L1451 847.855C1451 792.117 1405.69 746.855 1350 746.855H250.001ZM413.054 1208.55C412.724 1208.55 412.488 1208.67 412.331 1208.83C412.174 1208.98 412.054 1209.22 412.054 1209.55V1351.86H1188V1209.55C1188 1209.22 1187.88 1208.98 1187.72 1208.83C1187.57 1208.67 1187.33 1208.55 1187 1208.55H413.054ZM385.946 848.853C413.01 848.853 434.946 870.795 434.946 897.853C434.946 924.911 413.005 946.853 385.946 946.853H299.999C272.941 946.853 250.999 924.912 250.999 897.853C250.999 870.795 272.941 848.853 299.999 848.853H385.946ZM496.347 248.203C473.155 248.203 454.347 267.01 454.347 290.203L454.35 648.853H1145.5V493.853H1025.44C956.434 493.853 900.293 437.714 900.293 368.703V248.203H496.347ZM998.347 368.708C998.347 383.65 1010.5 395.807 1025.45 395.807H1145.28C1144.36 387.147 1140.62 379.241 1134.52 373.135L1020.52 259.135C1014.57 253.19 1006.83 249.538 998.347 248.566V368.708Z"/></svg>`,
              this.#showPrintDialog)}
          ` : nothing}
          ${menuItem('Export Current Board', html`<svg viewBox="0 0 1200 1200" fill="currentColor"><path d="m1100 787.5c-16.566 0.027344-32.449 6.6211-44.164 18.336-11.715 11.715-18.309 27.598-18.336 44.164v150c-0.027344 9.9375-3.9844 19.461-11.012 26.488-7.0273 7.0273-16.551 10.984-26.488 11.012h-800c-9.9375-0.027344-19.461-3.9844-26.488-11.012-7.0273-7.0273-10.984-16.551-11.012-26.488v-150c0-22.328-11.914-42.961-31.25-54.125-19.336-11.168-43.164-11.168-62.5 0-19.336 11.164-31.25 31.797-31.25 54.125v150c0.054688 43.082 17.191 84.383 47.652 114.85 30.465 30.461 71.766 47.598 114.85 47.652h800c43.082-0.054688 84.383-17.191 114.85-47.652 30.461-30.465 47.598-71.766 47.652-114.85v-150c-0.027344-16.566-6.6211-32.449-18.336-44.164-11.715-11.715-27.598-18.309-44.164-18.336z"/><path d="m600 37.5c-16.566 0.027344-32.449 6.6211-44.164 18.336-11.715 11.715-18.309 27.598-18.336 44.164v566.55l-197.5-164.55c-12.738-10.59-29.156-15.695-45.656-14.199-16.496 1.5-31.727 9.4844-42.344 22.199-10.59 12.738-15.695 29.156-14.199 45.656 1.5 16.496 9.4844 31.727 22.199 42.344l300 250c3.1484 2.2344 6.4961 4.1758 10 5.8008 2.2852 1.5312 4.6758 2.9023 7.1484 4.0977 14.566 6.1328 30.988 6.1328 45.551 0 2.4141-1.2031 4.7539-2.5547 7-4.0469 3.5039-1.6289 6.8477-3.5703 10-5.8008l300-250c13.23-11.004 21.336-26.977 22.41-44.148 1.0742-17.176-4.9766-34.031-16.73-46.598-11.758-12.566-28.172-19.73-45.379-19.805-14.613 0.027344-28.762 5.1562-40 14.5l-197.5 164.55v-566.55c-0.027344-16.566-6.6211-32.449-18.336-44.164-11.715-11.715-27.598-18.309-44.164-18.336z"/></svg>`,
              this.#showExportDialog)}

          <div class="menu-spacer"></div>
          <div class="menu-nav-divider"></div>

          ${this._viewMode !== 'readonly' ? html`
            ${menuItem('Settings', html`<svg viewBox="0 0 1200 1200" width="20" height="20" fill="currentColor"><path d="m112.5 637.5h117.84c16.781 66.188 76.359 112.5 144.66 112.5 68.301 0 127.87-46.312 144.66-112.5h567.84c20.719 0 37.5-16.781 37.5-37.5s-16.781-37.5-37.5-37.5h-567.84c-16.781-66.188-76.359-112.5-144.66-112.5-68.301 0-127.87 46.312-144.66 112.5h-117.84c-20.719 0-37.5 16.781-37.5 37.5s16.781 37.5 37.5 37.5zm262.5-112.5c30.328 0 57.703 18.281 69.281 46.312 11.625 28.031 5.2031 60.281-16.266 81.703-21.422 21.469-53.672 27.891-81.703 16.266-28.031-11.578-46.312-38.953-46.312-69.281 0.046875-41.391 33.609-74.953 75-75z"/><path d="m112.5 262.5h567.84c16.781 66.188 76.359 112.5 144.66 112.5s127.87-46.312 144.66-112.5h117.84c20.719 0 37.5-16.781 37.5-37.5s-16.781-37.5-37.5-37.5h-117.84c-16.781-66.188-76.359-112.5-144.66-112.5s-127.87 46.312-144.66 112.5h-567.84c-20.719 0-37.5 16.781-37.5 37.5s16.781 37.5 37.5 37.5zm712.5-112.5c30.328 0 57.703 18.281 69.281 46.312 11.625 28.031 5.2031 60.281-16.266 81.703-21.422 21.469-53.672 27.891-81.703 16.266-28.031-11.578-46.312-38.953-46.312-69.281 0.046875-41.391 33.609-74.953 75-75z"/><path d="m112.5 1012.5h567.84c16.781 66.188 76.359 112.5 144.66 112.5s127.87-46.312 144.66-112.5h117.84c20.719 0 37.5-16.781 37.5-37.5s-16.781-37.5-37.5-37.5h-117.84c-16.781-66.188-76.359-112.5-144.66-112.5s-127.87 46.312-144.66 112.5h-567.84c-20.719 0-37.5 16.781-37.5 37.5s16.781 37.5 37.5 37.5zm712.5-112.5c30.328 0 57.703 18.281 69.281 46.312 11.625 28.031 5.2031 60.281-16.266 81.703-21.422 21.469-53.672 27.891-81.703 16.266-28.031-11.578-46.312-38.953-46.312-69.281 0.046875-41.391 33.609-74.953 75-75z"/></svg>`,
              () => this.#showSettings())}
            <div class="menu-nav-divider"></div>
          ` : nothing}

          ${menuItem('About', html`<svg viewBox="0 0 1200 1200" fill="currentColor"><path d="m600 112.5c-129.29 0-253.29 51.363-344.71 142.79-91.422 91.426-142.79 215.42-142.79 344.71s51.363 253.29 142.79 344.71c91.426 91.422 215.42 142.79 344.71 142.79s253.29-51.363 344.71-142.79c91.422-91.426 142.79-215.42 142.79-344.71-0.14453-129.25-51.555-253.16-142.95-344.55-91.395-91.391-215.3-142.8-344.55-142.95zm0 900c-109.4 0-214.32-43.461-291.68-120.82-77.359-77.355-120.82-182.28-120.82-291.68s43.461-214.32 120.82-291.68c77.355-77.359 182.28-120.82 291.68-120.82s214.32 43.461 291.68 120.82c77.359 77.355 120.82 182.28 120.82 291.68-0.11719 109.37-43.617 214.22-120.95 291.55s-182.18 120.83-291.55 120.95z"/><path d="m675 812.5h-37.5v-312.5c0-9.9453-3.9492-19.484-10.984-26.516-7.0312-7.0352-16.57-10.984-26.516-10.984h-25c-11.887 0.003906-23.066 5.6445-30.137 15.203-7.0664 9.5586-9.1836 21.898-5.707 33.266s12.137 20.414 23.344 24.383v277.15h-37.5c-13.398 0-25.777 7.1484-32.477 18.75-6.6992 11.602-6.6992 25.898 0 37.5 6.6992 11.602 19.078 18.75 32.477 18.75h150c13.398 0 25.777-7.1484 32.477-18.75 6.6992-11.602 6.6992-25.898 0-37.5-6.6992-11.602-19.078-18.75-32.477-18.75z"/><path d="m650 350c0 27.613-22.387 50-50 50s-50-22.387-50-50 22.387-50 50-50 50 22.387 50 50z"/></svg>`,
              this.#showAbout)}
        </nav>
      </div>
    `;
  }

  render() {
    const t = this.activeTool;
    const isReadonly = this._viewMode === 'readonly';
    return html`
      <div class="app-wrap ${this._menuOpen ? 'menu-open' : ''} ${this.#anySheetOpen ? 'sheet-open' : ''}">
      ${this.#renderMenuPanel()}<!-- grid col 1: left panel -->
      <div class="app-board" ?inert="${this.#anySheetOpen}"><!-- grid col 2 -->

      ${isReadonly ? html`
        <!-- Readonly mode: no sidebar, context bar + field fill grid col 2 -->
        <div class="context-bar">
          <a href="/" class="branding-link" title="Open CoachingBoard">
            <svg class="branding-icon" viewBox="0 0 1600 1600" aria-hidden="true">
              <path d="M1600 801C1600 1242.28 1242.28 1600 801 1600C359.724 1600 2 1242.28 2 801C2 359.724 359.724 2 801 2C1242.28 2 1600 359.724 1600 801Z" fill="var(--pt-color-brand-green-dark)"/>
              <path d="M801 2C1241.94 2 1599.46 359.184 1600 800H2.00195C2.54191 359.184 360.058 2 801 2Z" fill="var(--pt-color-brand-green-light)"/>
              <path d="M407.703 634.189C414.778 641.264 424.03 644.802 433.374 644.802C442.626 644.802 451.969 641.264 459.044 634.189L541.044 552.099L623.134 634.189C630.209 641.264 639.461 644.802 648.805 644.802C658.057 644.802 667.4 641.264 674.475 634.189C688.626 620.039 688.626 597.09 674.475 582.849L592.385 500.759L674.475 418.669C688.626 404.519 688.626 381.57 674.475 367.33C660.325 353.179 637.376 353.179 623.136 367.33L541.046 449.511L458.955 367.42C444.805 353.27 421.856 353.27 407.616 367.42C393.465 381.571 393.465 404.52 407.616 418.76L489.706 500.85L407.616 582.94C393.465 597 393.465 619.949 407.706 634.189H407.703Z" fill="white"/>
              <path d="M912.405 1144.4C912.405 1232.51 984.12 1304.24 1072.2 1304.24C1160.29 1304.24 1232 1232.51 1232 1144.4C1232 1056.29 1160.29 984.65 1072.2 984.65C984.12 984.56 912.405 1056.29 912.405 1144.4ZM1159.66 1144.4C1159.66 1192.62 1120.41 1231.88 1072.21 1231.88C1024.01 1231.88 984.761 1192.62 984.761 1144.4C984.761 1096.19 1024.01 1057.02 1072.21 1057.02C1120.41 1056.93 1159.66 1096.19 1159.66 1144.4Z" fill="white"/>
              <path d="M812.403 834.487L700.593 877.625C605.61 914.252 541.835 1007.22 541.835 1108.88V1268.14C541.835 1288.13 558.027 1304.32 578.019 1304.32C598.011 1304.32 614.203 1288.13 614.203 1268.14V1108.88C614.203 1036.89 659.344 971.049 726.646 945.093L838.456 901.955C933.349 865.328 997.124 772.446 997.124 670.701V480.418L1042.72 525.999C1049.77 533.053 1059 536.58 1068.32 536.58C1077.54 536.58 1086.86 533.053 1093.92 525.999C1108.03 511.89 1108.03 489.009 1093.92 474.811L986.45 367.368C972.338 353.26 949.451 353.26 935.25 367.368L827.782 474.811C813.67 488.919 813.67 511.891 827.782 525.999C834.838 533.053 844.065 536.58 853.383 536.58C862.61 536.58 871.927 533.053 878.984 525.999L924.757 480.236V670.792C924.757 742.691 879.615 808.531 812.403 834.487Z" fill="white"/>
            </svg>
            <span class="branding-text">CoachingBoard</span>
          </a>
          ${this._boardName && this._boardName !== 'Untitled Board' ? html`
            <span class="context-divider" role="separator" aria-hidden="true"></span>
            <div class="context-board-name" title="${this._boardName}">${this._boardName}</div>
          ` : nothing}
          <div class="context-bar-right">
            <label class="visually-hidden" for="ctx-theme-select">Pitch theme</label>
            <select id="ctx-theme-select" class="theme-select"
                    @change="${this.#onThemeChange}">
              <option value="green" ?selected="${this.fieldTheme === 'green'}">Grass</option>
              <option value="white" ?selected="${this.fieldTheme === 'white'}">Whiteboard</option>
            </select>
          </div>
        </div>
        <div class="board-area">

          <cb-field
            .players="${this.players}"
            .lines="${this.lines}"
            .equipment="${this.equipment}"
            .shapes="${this.shapes}"
            .textItems="${this.textItems}"
            .selectedIds="${this.selectedIds}"
            .ghost="${this.ghost}"
            .draw="${this._draw}"
            .shapeDraw="${this._shapeDraw}"
            .measure="${this.#measureState}"
            .marquee="${this._marquee}"
            .activeTool="${this.activeTool}"
            .viewTransform="${this._viewTransform}"
            .playerColor="${this.playerColor}"
            .playerTeam="${this.playerTeam}"
            .lineStyle="${this.lineStyle}"
            .equipmentKind="${this.equipmentKind}"
            .shapeKind="${this.shapeKind}"
            .fieldOrientation="${this.fieldOrientation}"
            .fieldTheme="${this.fieldTheme}"
            .pitchType="${this.pitchType}"
            .viewMode="${this._viewMode}"
            .isMobile="${this._isMobile}"
            .rotateHandleId="${this._rotateHandleId}"
            .animationMode="${this._animationMode}"
            .animationFrames="${this.animationFrames}"
            .activeFrameIndex="${this.activeFrameIndex}"
            .isPlaying="${this.isPlaying}"
            .playbackProgress="${this._playbackProgress}"
            .showPlayOverlay="${this._showPlayOverlay}"
            .pauseFlash="${this._pauseFlash}"
            .playBtnAnim="${this._playBtnAnim}"
            @pointerdown="${this.#onPointerDown}"
            @pointermove="${this.#onPointerMove}"
            @pointerup="${this.#onPointerUp}"
            @pointerleave="${this.#onPointerLeave}"
            @cb-field-play-overlay-click="${this.#toggleReadonlyPlayback}"
          ></cb-field>

        </div><!-- .board-area readonly -->

      ` : html`
        <!-- Normal / shared-edit mode -->
        ${this._menuOpen ? html`
          <div class="menu-backdrop" @click="${this.#toggleMenu}" aria-hidden="true"></div>
        ` : nothing}
        <div class="context-bar">
          <button class="context-hamburger"
                  aria-label="${this._menuOpen ? 'Close menu' : 'Open menu'}"
                  aria-haspopup="true"
                  aria-expanded="${this._menuOpen}"
                  title="${this._menuOpen ? 'Close menu' : 'Open menu'}"
                  @click="${this.#toggleMenu}">
            ${this._menuOpen
              ? svg`<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="4" x2="16" y2="16"/><line x1="16" y1="4" x2="4" y2="16"/></svg>`
              : svg`<svg viewBox="0 0 1200 1200" width="18" height="18" fill="currentColor" fill-rule="evenodd"><path d="m158.52 305.64h883.08c34.23-1.1992 65.363-20.152 82.141-50.016 16.781-29.859 16.781-66.309 0-96.172-16.777-29.859-47.91-48.816-82.141-50.012h-883.08c-26.613-0.93359-52.461 8.9883-71.617 27.484-19.156 18.5-29.973 43.984-29.973 70.613 0 26.629 10.816 52.117 29.973 70.613s45.004 28.418 71.617 27.488zm883.08 196.2h-883.08c-35.07 0-67.473 18.711-85.008 49.082-17.535 30.367-17.535 67.789 0 98.156 17.535 30.371 49.938 49.082 85.008 49.082h883.08c35.066 0 67.473-18.711 85.008-49.082 17.535-30.367 17.535-67.789 0-98.156-17.535-30.371-49.941-49.082-85.008-49.082zm0 392.52h-883.08c-26.613-0.92969-52.461 8.9922-71.617 27.488s-29.973 43.984-29.973 70.613c0 26.629 10.816 52.113 29.973 70.613 19.156 18.496 45.004 28.418 71.617 27.484h883.08c34.23-1.1953 65.363-20.152 82.141-50.012 16.781-29.863 16.781-66.312 0-96.172-16.777-29.863-47.91-48.816-82.141-50.016z"/></svg>`}
          </button>
          <div class="context-board-name" title="${this._boardName}">
            ${this._boardName}
            ${!this.#isBoardSaved ? html`<span class="cb-unsaved">*</span>` : nothing}
          </div>
          ${this.#selectedItems.length > 0 && this.#selectedItems.every(i => 'text' in i) ? html`
            <span class="context-divider" role="separator" aria-hidden="true"></span>
            <cb-toolbar
              hide-tool-selector
              icon-only
              .activeTool="${this.activeTool}"
              .selectedItems="${this.#selectedItems}"
              .fieldTheme="${this.fieldTheme}"
              .multiSelect="${this._multiSelect}"
              .autoNumber="${this.autoNumber}"
              @tool-changed="${this.#onToolChanged}"
              @multi-select-toggle="${this.#onMultiSelectToggle}"
              @player-update="${this.#onPlayerUpdate}"
              @equipment-update="${this.#onEquipmentUpdate}"
              @line-update="${this.#onLineUpdate}"
              @shape-update="${this.#onShapeUpdate}"
              @text-update="${this.#onTextUpdate}"
              @align-items="${this.#onAlignItems}"
              @group-items="${this.#onGroupItems}"
              @ungroup-items="${this.#onUngroupItems}"
              @delete-items="${this.#onDeleteItems}"
              @rotate-items="${this.#onRotateItems}"
              @z-order="${this.#onZOrder}"
              @auto-number-toggle="${this.#onAutoNumberToggle}">
            </cb-toolbar>
          ` : nothing}
          <div class="context-bar-right">
            <label class="visually-hidden" for="ctx-theme-select">Pitch theme</label>
            <select id="ctx-theme-select" class="theme-select"
                    @change="${this.#onThemeChange}">
              <option value="green" ?selected="${this.fieldTheme === 'green'}">Grass</option>
              <option value="white" ?selected="${this.fieldTheme === 'white'}">Whiteboard</option>
            </select>
            ${this._authUser ? html`
              <button class="auth-avatar-btn"
                      aria-label="Account — ${this._authUser.email}. Open Settings."
                      title="${this._authUser.email}"
                      @click="${() => this.#showSettings()}">
                ${(this._authUser.name ?? this._authUser.email).charAt(0).toUpperCase()}
              </button>
            ` : nothing}
          </div>
        </div><!-- .context-bar -->

        <div class="board-area">
          <nav class="sidebar ${this._sidebarCollapsed ? 'sidebar--collapsed' : ''}"
               aria-label="Tool palette"
               @pointerenter="${this.#onSidebarPointerEnter}">
            <button class="sidebar-handle"
                    aria-label="${this._sidebarCollapsed ? 'Show tools' : 'Hide tools'}"
                    aria-expanded="${!this._sidebarCollapsed}"
                    @click="${() => { this._sidebarCollapsed = !this._sidebarCollapsed; }}">
              ${svg`<svg viewBox="0 0 1200 1200" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="m272.48 676.5c-66.984 0-121.5 54.516-121.5 121.5 0 66.516 54.516 120.98 121.5 120.98 66.516 0 120.98-54.516 120.98-120.98 0.046875-66.984-54.469-121.5-120.98-121.5z"/>
                <path d="m600 676.5c-66.984 0-121.5 54.516-121.5 121.5 0 66.516 54.516 120.98 121.5 120.98s121.5-54.516 121.5-120.98c0-66.984-54.516-121.5-121.5-121.5z"/>
                <path d="m927.52 676.5c-66.516 0-120.98 54.516-120.98 121.5 0 66.516 54.516 120.98 120.98 120.98 66.984 0 121.5-54.516 121.5-120.98 0-66.984-54.516-121.5-121.5-121.5z"/>
                <path d="m272.48 281.02c-66.984 0-121.5 54.516-121.5 120.98 0 66.984 54.516 121.5 121.5 121.5 66.516 0 120.98-54.516 120.98-121.5 0.046875-66.516-54.469-120.98-120.98-120.98z"/>
                <path d="m600 281.02c-66.984 0-121.5 54.516-121.5 120.98 0 66.984 54.516 121.5 121.5 121.5s121.5-54.516 121.5-121.5c0-66.516-54.516-120.98-121.5-120.98z"/>
                <path d="m927.52 281.02c-66.516 0-120.98 54.516-120.98 120.98 0 66.984 54.516 121.5 120.98 121.5 66.984 0 121.5-54.516 121.5-120.98 0-66.516-54.516-120.98-121.5-120.98z"/>
              </svg>`}
            </button>

          <div class="sidebar-tools" role="toolbar" aria-label="Tools" aria-orientation="vertical"
               ?inert="${this._sidebarCollapsed}"
               @keydown="${this.#onSidebarToolKeyDown}">

          <!-- Select + inline context track -->
          <div class="select-track">
          <div class="sidebar-dropdown-wrap">
            <button class="sidebar-tool has-submenu"
                    title="${t === 'pan' ? 'Hand' : this._multiSelect ? 'Multi-select' : 'Select'}"
                    aria-label="${t === 'pan' ? 'Hand' : this._multiSelect ? 'Multi-select' : 'Select'}"
                    aria-pressed="${t === 'select' || t === 'pan'}"
                    aria-haspopup="menu"
                    aria-expanded="${this._sidebarMenu === 'select'}"
                    aria-controls="sidebar-menu-select"
                    tabindex="${this._sidebarFocusIndex === 0 ? 0 : -1}"
                    @click="${(e: Event) => { e.stopPropagation(); this.#openSidebarMenu('select', 0); }}">
              ${t === 'pan'
                ? svg`<svg viewBox="0 0 1600 1600" width="20" height="20" fill="currentColor"><path d="M832.829 -5.65527C907.857 -18.2921 979.337 25.9844 1003.09 95.7441C1018.15 90.7944 1033.93 88.2408 1049.86 88.166H1049.97C1133.94 88.2271 1202.13 155.692 1203.25 239.421L1203.26 241.402V241.414L1203.27 313.792C1217.36 311.529 1231.71 310.954 1246.01 312.121H1246.01C1246.03 312.123 1246.05 312.124 1246.07 312.126C1246.08 312.127 1246.09 312.128 1246.11 312.129H1246.11C1325.81 318.344 1385.93 386.946 1381.77 466.699C1381.78 594.398 1385.19 664.706 1388.44 724.716L1389.09 736.609V736.614C1391.95 789.107 1394.67 839.092 1394.67 917.302C1394.67 1202.22 1357.98 1312.42 1328.23 1401.15L1328.1 1401.54L1327.96 1401.92C1314.61 1436.94 1305.55 1473.45 1300.89 1510.66C1295.54 1565.62 1249.44 1607.61 1194.19 1607.79H679.454L679.297 1607.79C629.191 1607 586.131 1572.26 574.76 1523.55C559.821 1483.88 534.811 1448.79 502.155 1421.75L501.563 1421.26L501.011 1420.73C411.233 1333.97 341.36 1228.77 296.26 1112.37V1112.37C250.038 995.329 222.588 911.857 210.263 872.296L210.264 872.295C201.258 843.593 204.62 812.389 219.757 786.308L219.764 786.31C234.708 760.543 259.723 742.085 288.767 735.468C347.605 721.264 409.713 733.616 458.643 769.319L459.415 769.883L460.13 770.518C480.326 788.442 498.305 808.583 513.755 830.513V304.994C513.87 220.417 582.402 151.884 666.979 151.771H667.041L667.104 151.771C680.003 151.835 692.809 153.56 705.203 156.868V145.468C705.099 70.646 759.108 6.7681 832.827 -5.65527H832.829ZM679.611 1587.79H1194.12V1587.79H679.611V1587.79ZM671.043 1587.25C671.083 1587.25 671.123 1587.26 671.163 1587.26C671.104 1587.26 671.044 1587.25 670.984 1587.24L671.043 1587.25ZM858.308 107.396C837.166 107.397 820.058 124.532 820.058 145.647L820.052 783.9C820.052 815.643 794.294 841.4 762.552 841.4C730.809 841.4 705.052 815.643 705.052 783.9V304.68L705.074 304.207C705.096 303.753 705.098 303.219 705.072 302.656L705.065 302.499L705.061 302.342C704.438 281.239 686.809 264.622 665.693 265.244C644.59 265.866 627.973 283.495 628.596 304.611L628.604 304.905V305.2L628.614 1007.35V1007.35C628.614 1023.82 621.559 1039.5 609.189 1050.4C596.933 1061.21 580.66 1066.33 564.42 1064.48V1064.48C544.878 1062.38 526.433 1054.83 510.99 1042.84L509.806 1041.92L508.771 1040.83C482.581 1013.31 461.507 981.357 446.566 946.407L446.525 946.312L446.486 946.216C433.346 914.574 414.215 885.842 390.077 861.599C370.393 847.706 346.107 842.147 322.491 845.966C335.292 886.405 361.272 963.834 403.218 1070.42L403.241 1070.48L403.265 1070.54C442.546 1172.24 503.613 1264.09 582.208 1339.59C629.93 1380.29 665.573 1433.29 685.337 1492.81L1187.05 1492.81C1192.78 1448.84 1203.52 1405.66 1219.1 1364.13C1245.87 1284.2 1279.46 1184.4 1279.46 917.158C1279.46 842.172 1276.93 796.209 1274.04 742.692V742.691C1270.53 678.542 1266.56 605.642 1266.56 466.064V465.023L1266.67 463.988C1268.6 445.452 1255.31 428.853 1236.91 426.622C1225.26 426.203 1213.7 428.399 1203.06 432.995V815.86C1203.06 847.603 1177.3 873.36 1145.56 873.36C1113.82 873.36 1088.06 847.603 1088.06 815.86V241.407C1088.06 220.265 1070.92 203.157 1049.81 203.156C1028.67 203.156 1011.56 220.292 1011.56 241.407V783.954C1011.56 815.697 985.801 841.454 954.059 841.454C922.316 841.454 896.559 815.697 896.559 783.954V145.647C896.559 124.505 879.423 107.397 858.308 107.396ZM656.929 1474.18C657.197 1474.81 657.462 1475.44 657.726 1476.07C657.462 1475.44 657.197 1474.81 656.929 1474.18V1474.18ZM1315.09 1377.36C1313.13 1383.29 1311.18 1389.09 1309.27 1394.79L1309.27 1394.79C1311.18 1389.09 1313.13 1383.29 1315.09 1377.36ZM422.692 1161.14C422.915 1161.56 423.138 1161.97 423.361 1162.39C423.029 1161.77 422.698 1161.15 422.367 1160.52L422.692 1161.14ZM385.558 1080.2C386.525 1082.67 387.505 1085.15 388.497 1087.61C387.505 1085.15 386.525 1082.67 385.559 1080.2H385.558ZM566.562 1044.6C567.219 1044.67 567.875 1044.73 568.531 1044.77C567.875 1044.73 567.218 1044.67 566.562 1044.6C566.068 1044.54 565.575 1044.49 565.083 1044.42C565.575 1044.49 566.069 1044.54 566.562 1044.6ZM1374.67 917.301C1374.67 922.387 1374.66 927.416 1374.63 932.39C1374.65 929.575 1374.66 926.742 1374.67 923.891C1374.67 921.705 1374.67 919.509 1374.67 917.302L1374.67 917.301ZM302.362 848.632C302.568 849.285 302.777 849.949 302.99 850.624C302.777 849.949 302.568 849.285 302.362 848.632ZM300.956 844.146C301.054 844.461 301.155 844.78 301.256 845.102C301.155 844.78 301.055 844.461 300.957 844.146C300.947 844.118 300.938 844.09 300.929 844.062C300.938 844.09 300.946 844.118 300.956 844.146ZM300.764 843.545C300.775 843.584 300.788 843.623 300.8 843.662C300.788 843.623 300.775 843.584 300.764 843.545ZM300.611 842.972C300.619 843.003 300.626 843.034 300.634 843.065C300.626 843.034 300.619 843.003 300.611 842.972ZM300.485 842.381C300.492 842.415 300.497 842.449 300.504 842.482C300.497 842.449 300.492 842.415 300.485 842.381ZM225.316 840.562C225.319 840.961 225.324 841.359 225.332 841.757L225.317 840.63C225.317 840.607 225.317 840.585 225.316 840.562ZM394.877 840.861C394.818 840.826 394.758 840.79 394.699 840.755C394.758 840.79 394.818 840.826 394.877 840.861ZM225.33 838.377C225.324 838.721 225.32 839.064 225.317 839.408C225.32 839.064 225.324 838.721 225.33 838.377ZM392.383 839.399C392.275 839.338 392.166 839.279 392.059 839.218C392.166 839.279 392.275 839.338 392.383 839.399ZM391.125 838.695C390.964 838.606 390.802 838.52 390.641 838.432C390.802 838.52 390.964 838.607 391.125 838.695ZM388.592 837.34C388.141 837.106 387.69 836.876 387.236 836.648C387.69 836.876 388.141 837.106 388.592 837.34ZM307.691 828.845H307.692H307.691ZM308.681 828.481C308.658 828.489 308.636 828.496 308.613 828.503C308.636 828.496 308.658 828.489 308.681 828.481ZM309.114 828.354C309.046 828.372 308.979 828.391 308.911 828.411C308.979 828.391 309.046 828.372 309.114 828.354ZM309.422 828.272C309.354 828.289 309.286 828.307 309.218 828.325C309.286 828.307 309.354 828.289 309.422 828.272ZM323.294 825.649C322.898 825.699 322.502 825.751 322.105 825.805C322.502 825.751 322.898 825.699 323.294 825.649ZM324.888 825.462C324.422 825.513 323.956 825.568 323.49 825.625C323.956 825.568 324.422 825.513 324.888 825.462ZM1109.19 825.039C1109.23 825.195 1109.27 825.351 1109.31 825.507C1109.27 825.351 1109.23 825.195 1109.19 825.039ZM326.431 825.303C325.992 825.345 325.553 825.39 325.114 825.438C325.553 825.39 325.992 825.345 326.431 825.303ZM327.97 825.166C327.491 825.205 327.013 825.247 326.535 825.293C327.013 825.247 327.491 825.205 327.97 825.166ZM329.083 825.08C328.793 825.101 328.504 825.123 328.214 825.146C328.504 825.123 328.793 825.101 329.083 825.08ZM330.098 825.012C329.867 825.026 329.635 825.042 329.404 825.058C329.635 825.042 329.867 825.026 330.098 825.012ZM331.242 824.945C331.035 824.956 330.827 824.967 330.619 824.979C330.827 824.967 331.035 824.956 331.242 824.945ZM1109.05 824.471C1109.09 824.625 1109.13 824.779 1109.17 824.933C1109.13 824.779 1109.09 824.625 1109.05 824.471ZM332.517 824.886C332.229 824.898 331.941 824.911 331.653 824.925C331.941 824.911 332.229 824.898 332.517 824.886ZM333.48 824.85C333.217 824.858 332.954 824.867 332.69 824.878C332.954 824.867 333.217 824.858 333.48 824.85ZM334.56 824.82C334.359 824.825 334.159 824.829 333.959 824.835C334.159 824.829 334.359 824.825 334.56 824.82ZM335.891 824.797C335.589 824.8 335.288 824.805 334.986 824.811C335.288 824.805 335.589 824.8 335.891 824.797ZM1108.82 823.414C1108.83 823.48 1108.85 823.545 1108.86 823.61C1108.85 823.53 1108.83 823.45 1108.81 823.37C1108.82 823.385 1108.82 823.399 1108.82 823.414ZM1108.62 822.328C1108.63 822.422 1108.65 822.516 1108.67 822.61C1108.65 822.516 1108.63 822.422 1108.62 822.328ZM953.091 821.441L953.225 821.442C953.113 821.44 953.002 821.437 952.891 821.434C952.957 821.436 953.024 821.44 953.091 821.441ZM952.044 821.398C952.127 821.403 952.21 821.406 952.293 821.41C952.21 821.406 952.127 821.403 952.044 821.398ZM747.124 818.085C747.678 818.336 748.239 818.573 748.807 818.797L747.961 818.451C747.68 818.332 747.401 818.21 747.124 818.085ZM234.859 800.368C234.512 801.046 234.175 801.729 233.847 802.414L234.347 801.389C234.516 801.048 234.686 800.707 234.859 800.368ZM726.217 793.202C726.248 793.325 726.28 793.447 726.312 793.569C726.28 793.447 726.248 793.325 726.217 793.202ZM726.048 792.517C726.085 792.675 726.124 792.833 726.163 792.991C726.124 792.833 726.085 792.675 726.048 792.517ZM725.813 791.454C725.823 791.501 725.834 791.548 725.844 791.595C725.831 791.533 725.817 791.472 725.805 791.41C725.808 791.425 725.81 791.439 725.813 791.454ZM725.608 790.368C725.626 790.47 725.644 790.572 725.663 790.674C725.644 790.572 725.626 790.47 725.608 790.368ZM916.674 786.912C916.696 787.202 916.722 787.491 916.751 787.778C916.722 787.491 916.696 787.202 916.674 786.912ZM916.616 786.029C916.628 786.249 916.641 786.468 916.657 786.687C916.642 786.468 916.628 786.249 916.616 786.029ZM916.559 783.954L916.57 784.921C916.577 785.2 916.588 785.478 916.602 785.756C916.573 785.158 916.559 784.557 916.559 783.953V783.954ZM712.886 267.812L712.453 267.262C712.412 267.211 712.371 267.16 712.33 267.109C712.517 267.343 712.703 267.576 712.886 267.812ZM712.086 266.808C711.97 266.665 711.854 266.523 711.736 266.381C711.854 266.523 711.97 266.665 712.086 266.808ZM710.887 265.376C710.658 265.112 710.428 264.85 710.195 264.591C710.428 264.85 710.658 265.112 710.887 265.376ZM708.767 263.056C708.928 263.223 709.088 263.392 709.248 263.562H709.249C708.831 263.118 708.405 262.681 707.974 262.251C708.24 262.517 708.505 262.785 708.767 263.056ZM707.87 262.147C707.624 261.903 707.375 261.661 707.124 261.421C707.375 261.661 707.624 261.903 707.87 262.147ZM692.944 251.402C693.194 251.528 693.442 251.653 693.689 251.782L693.063 251.461C693.024 251.441 692.984 251.422 692.944 251.402ZM692.243 251.056C692.161 251.016 692.078 250.975 691.995 250.936C692.078 250.975 692.161 251.016 692.243 251.056ZM685.226 248.195C685.451 248.27 685.676 248.346 685.9 248.424C685.452 248.268 685.001 248.118 684.548 247.974L685.226 248.195ZM679.003 246.502C678.673 246.432 678.342 246.364 678.01 246.3C678.342 246.364 678.673 246.432 679.003 246.502ZM677.784 246.257C677.52 246.207 677.256 246.158 676.991 246.111C677.256 246.158 677.52 246.207 677.784 246.257ZM676.771 246.073C676.466 246.021 676.159 245.97 675.852 245.922C676.159 245.97 676.466 246.021 676.771 246.073ZM673.988 245.662C674.231 245.692 674.472 245.723 674.714 245.756C675.068 245.804 675.422 245.855 675.774 245.909C675.045 245.797 674.311 245.699 673.573 245.613C673.712 245.629 673.85 245.645 673.988 245.662ZM673.141 245.564C673.019 245.551 672.897 245.539 672.774 245.526C672.897 245.539 673.019 245.551 673.141 245.564ZM672.411 245.49C672.241 245.474 672.071 245.459 671.9 245.444C672.071 245.459 672.241 245.474 672.411 245.49ZM671.676 245.426C671.452 245.407 671.228 245.39 671.003 245.374C671.228 245.39 671.452 245.407 671.676 245.426ZM670.725 245.355C670.538 245.343 670.352 245.332 670.165 245.321C670.352 245.332 670.538 245.343 670.725 245.355ZM669.771 245.3C669.567 245.29 669.362 245.281 669.156 245.272C669.362 245.281 669.567 245.29 669.771 245.3ZM666.2 245.23C665.835 245.234 665.47 245.241 665.104 245.252C664.852 245.259 664.602 245.269 664.352 245.279L665.104 245.253C665.47 245.242 665.835 245.235 666.2 245.23ZM668.956 245.265C668.709 245.256 668.461 245.249 668.213 245.243C668.461 245.249 668.709 245.256 668.956 245.265ZM668.006 245.238C667.857 245.235 667.708 245.233 667.559 245.231C667.708 245.233 667.857 245.235 668.006 245.238ZM666.315 245.229C666.604 245.227 666.892 245.227 667.18 245.229C666.892 245.227 666.604 245.227 666.315 245.229ZM722.651 184.52C723.506 184.927 724.356 185.344 725.202 185.771V185.77C724.356 185.343 723.506 184.927 722.651 184.52ZM1033.05 185.603C1032.99 185.619 1032.94 185.635 1032.89 185.651C1032.94 185.635 1032.99 185.619 1033.05 185.603ZM1034.34 185.23C1034.25 185.257 1034.15 185.285 1034.05 185.312C1034.15 185.285 1034.25 185.257 1034.34 185.23ZM1035.52 184.921C1035.36 184.961 1035.2 185.003 1035.04 185.045C1035.2 185.003 1035.36 184.961 1035.52 184.921ZM1041.42 183.756C1041.34 183.767 1041.27 183.777 1041.19 183.788C1041.27 183.777 1041.34 183.767 1041.42 183.756ZM714.989 181.16L714.859 181.107C714.739 181.059 714.617 181.013 714.496 180.965C714.66 181.03 714.825 181.094 714.989 181.16ZM713.381 180.528C713.288 180.492 713.195 180.456 713.102 180.42C712.998 180.38 712.894 180.342 712.791 180.303C712.988 180.378 713.184 180.453 713.381 180.528ZM711.712 179.899C711.511 179.825 711.309 179.75 711.107 179.677C711.309 179.75 711.511 179.825 711.712 179.899ZM709.281 179.025C708.881 178.886 708.481 178.749 708.08 178.614C708.481 178.749 708.881 178.886 709.281 179.025ZM707.69 178.484C707.339 178.367 706.987 178.251 706.635 178.137C706.987 178.251 707.339 178.367 707.69 178.484ZM706.242 178.011C705.921 177.908 705.599 177.806 705.277 177.705C705.599 177.806 705.921 177.908 706.242 178.011ZM627.587 177.744C627.451 177.786 627.315 177.829 627.18 177.872C627.315 177.829 627.451 177.786 627.587 177.744ZM704.739 177.539C704.442 177.448 704.144 177.357 703.846 177.268C704.144 177.357 704.442 177.448 704.739 177.539ZM629.196 177.256C629.099 177.285 629.001 177.314 628.903 177.343C629.001 177.314 629.099 177.285 629.196 177.256ZM703.248 177.091C702.995 177.016 702.741 176.942 702.487 176.869C702.741 176.942 702.995 177.016 703.248 177.091ZM630.664 176.829C630.519 176.87 630.375 176.913 630.23 176.954C630.375 176.913 630.519 176.87 630.664 176.829ZM701.754 176.66C701.549 176.602 701.344 176.545 701.139 176.488C701.344 176.545 701.549 176.602 701.754 176.66ZM632.132 176.422C632.039 176.447 631.946 176.474 631.853 176.499C632.055 176.444 632.258 176.389 632.461 176.334L632.132 176.422ZM700.399 176.286C700.088 176.202 699.776 176.12 699.464 176.038C699.776 176.12 700.088 176.202 700.399 176.286ZM699.051 175.931C698.946 175.904 698.842 175.875 698.737 175.849C698.611 175.816 698.485 175.787 698.358 175.755C698.589 175.813 698.82 175.871 699.051 175.931ZM697.11 175.445C697.043 175.429 696.976 175.412 696.908 175.396C696.849 175.381 696.79 175.368 696.73 175.354C696.857 175.384 696.984 175.415 697.11 175.445ZM695.403 175.044C695.243 175.007 695.082 174.97 694.921 174.934C695.082 174.97 695.242 175.007 695.403 175.044ZM687.789 173.542C688.991 173.742 690.191 173.959 691.387 174.192L689.535 173.844C688.954 173.739 688.372 173.639 687.789 173.542ZM687.484 173.492C687.026 173.417 686.567 173.345 686.107 173.274C686.567 173.345 687.026 173.417 687.484 173.492ZM685.618 173.199C685.063 173.116 684.507 173.037 683.951 172.961C684.507 173.037 685.063 173.116 685.618 173.199ZM676.448 172.16V172.159V172.16ZM800.602 137.661C800.589 137.752 800.576 137.843 800.564 137.934C800.576 137.843 800.589 137.752 800.602 137.661ZM800.749 136.645C800.731 136.761 800.714 136.877 800.696 136.993C800.714 136.877 800.731 136.761 800.749 136.645ZM800.917 135.615C800.899 135.72 800.882 135.825 800.864 135.931C800.882 135.825 800.899 135.72 800.917 135.615ZM801.71 131.817C801.66 132.022 801.61 132.228 801.562 132.434C801.61 132.228 801.66 132.022 801.71 131.817ZM801.922 130.975C801.876 131.15 801.831 131.326 801.787 131.502C801.831 131.326 801.876 131.15 801.922 130.975ZM802.161 130.084C802.119 130.238 802.076 130.392 802.035 130.546C802.076 130.392 802.119 130.238 802.161 130.084ZM802.425 129.16C802.378 129.32 802.331 129.481 802.285 129.642C802.331 129.481 802.378 129.32 802.425 129.16ZM802.708 128.227C802.653 128.401 802.6 128.575 802.547 128.75C802.6 128.575 802.654 128.401 802.708 128.227ZM802.991 127.343C802.928 127.533 802.868 127.724 802.807 127.915C802.868 127.724 802.928 127.533 802.991 127.343ZM805.439 121.157C805.42 121.199 805.402 121.241 805.383 121.283C805.402 121.241 805.42 121.199 805.439 121.157ZM806.009 119.968C805.973 120.042 805.936 120.115 805.9 120.189C805.936 120.115 805.972 120.042 806.009 119.968ZM806.593 118.813C806.548 118.899 806.503 118.984 806.459 119.07C806.503 118.984 806.548 118.899 806.593 118.813ZM808.483 115.451C808.24 115.851 808.002 116.255 807.769 116.661L808.123 116.054C808.242 115.852 808.362 115.651 808.483 115.451ZM1009.36 114.736C1009.25 114.774 1009.13 114.814 1009.02 114.853C1009.28 114.767 1009.54 114.682 1009.8 114.598L1009.36 114.736ZM812.224 110.011C812.085 110.191 811.947 110.371 811.81 110.553C811.947 110.371 812.084 110.19 812.224 110.011ZM812.73 109.365C812.583 109.551 812.436 109.737 812.29 109.925C812.436 109.737 812.583 109.551 812.73 109.365ZM812.907 109.145C812.881 109.177 812.854 109.21 812.828 109.243C813 109.028 813.174 108.815 813.35 108.603L812.907 109.145ZM861.072 87.4609C860.754 87.446 860.434 87.4337 860.114 87.4238C860.434 87.4335 860.754 87.446 861.072 87.4609ZM858.308 87.3965C858.559 87.3965 858.81 87.3982 859.061 87.4014C859.382 87.4054 859.702 87.4127 860.022 87.4219C859.453 87.4051 858.881 87.3955 858.308 87.3955V87.3965ZM808.837 21.7197C808.705 21.7722 808.575 21.826 808.443 21.8789C809.03 21.6424 809.618 21.4091 810.209 21.1807L808.837 21.7197ZM840.294 13.4346C839.98 13.4775 839.666 13.5221 839.352 13.5674C839.666 13.5222 839.98 13.4775 840.294 13.4346ZM841.375 13.292C841.109 13.3261 840.844 13.3607 840.578 13.3965C840.844 13.3607 841.109 13.3261 841.375 13.292ZM842.637 13.1357C842.376 13.1667 842.116 13.1979 841.855 13.2305C842.116 13.1979 842.376 13.1667 842.637 13.1357ZM845.41 12.834C844.616 12.9118 843.822 12.9975 843.026 13.0898C843.822 12.9976 844.616 12.9117 845.41 12.834ZM846.309 12.749C846.074 12.7704 845.84 12.7928 845.605 12.8154C845.921 12.785 846.236 12.7566 846.551 12.7285L846.309 12.749ZM225.316 839.556C225.315 839.891 225.314 840.227 225.316 840.562C225.314 840.227 225.315 839.891 225.316 839.556ZM389.863 838.01C389.517 837.824 389.169 837.642 388.821 837.461C389.169 837.642 389.517 837.825 389.863 838.01ZM1108.92 823.898C1108.96 824.057 1109 824.216 1109.03 824.374C1109 824.216 1108.96 824.057 1108.92 823.898ZM725.917 791.938C725.952 792.097 725.988 792.256 726.024 792.414C725.988 792.256 725.952 792.097 725.917 791.938ZM711.447 266.034C711.28 265.835 711.112 265.637 710.942 265.44C711.112 265.637 711.28 265.835 711.447 266.034ZM710.022 179.287C709.867 179.232 709.713 179.175 709.558 179.121C709.524 179.109 709.491 179.098 709.458 179.087C709.646 179.153 709.834 179.22 710.022 179.287Z"/></svg>`
                : this._multiSelect
                ? svg`<svg viewBox="0 0 1600 1600" width="20" height="20"><path d="M87.5712 346.734C84.8837 339.234 92.1337 331.796 99.8212 334.608L469.249 467.508L647.075 961.824L471.447 1365.05C468.322 1372.3 456.822 1373.61 453.385 1363.61L87.5712 346.734Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M1506.44 616.688C1514.62 619.625 1514.87 631.063 1507.06 634.437L1056.63 830.624L860.447 1281.05C857.322 1288.3 845.822 1289.61 842.384 1279.61L476.571 262.733C473.884 255.233 481.134 247.796 488.821 250.608L1506.44 616.688Z" fill="currentColor"/></svg>`
                : svg`<svg viewBox="0 0 1600 1600" width="20" height="20"><path fill-rule="evenodd" clip-rule="evenodd" d="M1394.44 730.688C1402.62 733.625 1402.87 745.063 1395.06 748.437L944.634 944.624L748.447 1395.05C745.322 1402.3 733.822 1403.61 730.384 1393.61L364.571 376.733C361.884 369.233 369.134 361.796 376.821 364.608L1394.44 730.688Z" fill="currentColor"/></svg>`}
              ${this.selectedIds.size > 0 ? html`<span class="sidebar-badge">${this.selectedIds.size}</span>` : nothing}
            </button>
            ${this._sidebarMenu === 'select' ? html`
              <div id="sidebar-menu-select" role="menu" aria-label="Select tool" @keydown="${this.#onSidebarMenuKeyDown}">
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'select'; this._multiSelect = false; this.selectedIds = new Set(); this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 1600 1600" width="16" height="16"><path fill-rule="evenodd" clip-rule="evenodd" d="M1394.44 730.688C1402.62 733.625 1402.87 745.063 1395.06 748.437L944.634 944.624L748.447 1395.05C745.322 1402.3 733.822 1403.61 730.384 1393.61L364.571 376.733C361.884 369.233 369.134 361.796 376.821 364.608L1394.44 730.688Z" fill="currentColor"/></svg>
                  Select <span class="tool-shortcut-hint">(V)</span>
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'select'; this._multiSelect = true; this.ghost = null; this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 1600 1600" width="16" height="16">
                    <path d="M87.5712 346.734C84.8837 339.234 92.1337 331.796 99.8212 334.608L469.249 467.508L647.075 961.824L471.447 1365.05C468.322 1372.3 456.822 1373.61 453.385 1363.61L87.5712 346.734Z" fill="currentColor"/>
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M1506.44 616.688C1514.62 619.625 1514.87 631.063 1507.06 634.437L1056.63 830.624L860.447 1281.05C857.322 1288.3 845.822 1289.61 842.384 1279.61L476.571 262.733C473.884 255.233 481.134 247.796 488.821 250.608L1506.44 616.688Z" fill="currentColor"/>
                  </svg>
                  Multi-select
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'pan'; this._multiSelect = false; this.selectedIds = new Set(); this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 1600 1600" width="16" height="16" fill="currentColor"><path d="M832.829 -5.65527C907.857 -18.2921 979.337 25.9844 1003.09 95.7441C1018.15 90.7944 1033.93 88.2408 1049.86 88.166H1049.97C1133.94 88.2271 1202.13 155.692 1203.25 239.421L1203.26 241.402V241.414L1203.27 313.792C1217.36 311.529 1231.71 310.954 1246.01 312.121H1246.01C1246.03 312.123 1246.05 312.124 1246.07 312.126C1246.08 312.127 1246.09 312.128 1246.11 312.129H1246.11C1325.81 318.344 1385.93 386.946 1381.77 466.699C1381.78 594.398 1385.19 664.706 1388.44 724.716L1389.09 736.609V736.614C1391.95 789.107 1394.67 839.092 1394.67 917.302C1394.67 1202.22 1357.98 1312.42 1328.23 1401.15L1328.1 1401.54L1327.96 1401.92C1314.61 1436.94 1305.55 1473.45 1300.89 1510.66C1295.54 1565.62 1249.44 1607.61 1194.19 1607.79H679.454L679.297 1607.79C629.191 1607 586.131 1572.26 574.76 1523.55C559.821 1483.88 534.811 1448.79 502.155 1421.75L501.563 1421.26L501.011 1420.73C411.233 1333.97 341.36 1228.77 296.26 1112.37V1112.37C250.038 995.329 222.588 911.857 210.263 872.296L210.264 872.295C201.258 843.593 204.62 812.389 219.757 786.308L219.764 786.31C234.708 760.543 259.723 742.085 288.767 735.468C347.605 721.264 409.713 733.616 458.643 769.319L459.415 769.883L460.13 770.518C480.326 788.442 498.305 808.583 513.755 830.513V304.994C513.87 220.417 582.402 151.884 666.979 151.771H667.041L667.104 151.771C680.003 151.835 692.809 153.56 705.203 156.868V145.468C705.099 70.646 759.108 6.7681 832.827 -5.65527H832.829ZM679.611 1587.79H1194.12V1587.79H679.611V1587.79ZM671.043 1587.25C671.083 1587.25 671.123 1587.26 671.163 1587.26C671.104 1587.26 671.044 1587.25 670.984 1587.24L671.043 1587.25ZM858.308 107.396C837.166 107.397 820.058 124.532 820.058 145.647L820.052 783.9C820.052 815.643 794.294 841.4 762.552 841.4C730.809 841.4 705.052 815.643 705.052 783.9V304.68L705.074 304.207C705.096 303.753 705.098 303.219 705.072 302.656L705.065 302.499L705.061 302.342C704.438 281.239 686.809 264.622 665.693 265.244C644.59 265.866 627.973 283.495 628.596 304.611L628.604 304.905V305.2L628.614 1007.35V1007.35C628.614 1023.82 621.559 1039.5 609.189 1050.4C596.933 1061.21 580.66 1066.33 564.42 1064.48V1064.48C544.878 1062.38 526.433 1054.83 510.99 1042.84L509.806 1041.92L508.771 1040.83C482.581 1013.31 461.507 981.357 446.566 946.407L446.525 946.312L446.486 946.216C433.346 914.574 414.215 885.842 390.077 861.599C370.393 847.706 346.107 842.147 322.491 845.966C335.292 886.405 361.272 963.834 403.218 1070.42L403.241 1070.48L403.265 1070.54C442.546 1172.24 503.613 1264.09 582.208 1339.59C629.93 1380.29 665.573 1433.29 685.337 1492.81L1187.05 1492.81C1192.78 1448.84 1203.52 1405.66 1219.1 1364.13C1245.87 1284.2 1279.46 1184.4 1279.46 917.158C1279.46 842.172 1276.93 796.209 1274.04 742.692V742.691C1270.53 678.542 1266.56 605.642 1266.56 466.064V465.023L1266.67 463.988C1268.6 445.452 1255.31 428.853 1236.91 426.622C1225.26 426.203 1213.7 428.399 1203.06 432.995V815.86C1203.06 847.603 1177.3 873.36 1145.56 873.36C1113.82 873.36 1088.06 847.603 1088.06 815.86V241.407C1088.06 220.265 1070.92 203.157 1049.81 203.156C1028.67 203.156 1011.56 220.292 1011.56 241.407V783.954C1011.56 815.697 985.801 841.454 954.059 841.454C922.316 841.454 896.559 815.697 896.559 783.954V145.647C896.559 124.505 879.423 107.397 858.308 107.396ZM656.929 1474.18C657.197 1474.81 657.462 1475.44 657.726 1476.07C657.462 1475.44 657.197 1474.81 656.929 1474.18V1474.18ZM1315.09 1377.36C1313.13 1383.29 1311.18 1389.09 1309.27 1394.79L1309.27 1394.79C1311.18 1389.09 1313.13 1383.29 1315.09 1377.36ZM422.692 1161.14C422.915 1161.56 423.138 1161.97 423.361 1162.39C423.029 1161.77 422.698 1161.15 422.367 1160.52L422.692 1161.14ZM385.558 1080.2C386.525 1082.67 387.505 1085.15 388.497 1087.61C387.505 1085.15 386.525 1082.67 385.559 1080.2H385.558ZM566.562 1044.6C567.219 1044.67 567.875 1044.73 568.531 1044.77C567.875 1044.73 567.218 1044.67 566.562 1044.6C566.068 1044.54 565.575 1044.49 565.083 1044.42C565.575 1044.49 566.069 1044.54 566.562 1044.6ZM1374.67 917.301C1374.67 922.387 1374.66 927.416 1374.63 932.39C1374.65 929.575 1374.66 926.742 1374.67 923.891C1374.67 921.705 1374.67 919.509 1374.67 917.302L1374.67 917.301ZM302.362 848.632C302.568 849.285 302.777 849.949 302.99 850.624C302.777 849.949 302.568 849.285 302.362 848.632ZM300.956 844.146C301.054 844.461 301.155 844.78 301.256 845.102C301.155 844.78 301.055 844.461 300.957 844.146C300.947 844.118 300.938 844.09 300.929 844.062C300.938 844.09 300.946 844.118 300.956 844.146ZM300.764 843.545C300.775 843.584 300.788 843.623 300.8 843.662C300.788 843.623 300.775 843.584 300.764 843.545ZM300.611 842.972C300.619 843.003 300.626 843.034 300.634 843.065C300.626 843.034 300.619 843.003 300.611 842.972ZM300.485 842.381C300.492 842.415 300.497 842.449 300.504 842.482C300.497 842.449 300.492 842.415 300.485 842.381ZM225.316 840.562C225.319 840.961 225.324 841.359 225.332 841.757L225.317 840.63C225.317 840.607 225.317 840.585 225.316 840.562ZM394.877 840.861C394.818 840.826 394.758 840.79 394.699 840.755C394.758 840.79 394.818 840.826 394.877 840.861ZM225.33 838.377C225.324 838.721 225.32 839.064 225.317 839.408C225.32 839.064 225.324 838.721 225.33 838.377ZM392.383 839.399C392.275 839.338 392.166 839.279 392.059 839.218C392.166 839.279 392.275 839.338 392.383 839.399ZM391.125 838.695C390.964 838.606 390.802 838.52 390.641 838.432C390.802 838.52 390.964 838.607 391.125 838.695ZM388.592 837.34C388.141 837.106 387.69 836.876 387.236 836.648C387.69 836.876 388.141 837.106 388.592 837.34ZM307.691 828.845H307.692H307.691ZM308.681 828.481C308.658 828.489 308.636 828.496 308.613 828.503C308.636 828.496 308.658 828.489 308.681 828.481ZM309.114 828.354C309.046 828.372 308.979 828.391 308.911 828.411C308.979 828.391 309.046 828.372 309.114 828.354ZM309.422 828.272C309.354 828.289 309.286 828.307 309.218 828.325C309.286 828.307 309.354 828.289 309.422 828.272ZM323.294 825.649C322.898 825.699 322.502 825.751 322.105 825.805C322.502 825.751 322.898 825.699 323.294 825.649ZM324.888 825.462C324.422 825.513 323.956 825.568 323.49 825.625C323.956 825.568 324.422 825.513 324.888 825.462ZM1109.19 825.039C1109.23 825.195 1109.27 825.351 1109.31 825.507C1109.27 825.351 1109.23 825.195 1109.19 825.039ZM326.431 825.303C325.992 825.345 325.553 825.39 325.114 825.438C325.553 825.39 325.992 825.345 326.431 825.303ZM327.97 825.166C327.491 825.205 327.013 825.247 326.535 825.293C327.013 825.247 327.491 825.205 327.97 825.166ZM329.083 825.08C328.793 825.101 328.504 825.123 328.214 825.146C328.504 825.123 328.793 825.101 329.083 825.08ZM330.098 825.012C329.867 825.026 329.635 825.042 329.404 825.058C329.635 825.042 329.867 825.026 330.098 825.012ZM331.242 824.945C331.035 824.956 330.827 824.967 330.619 824.979C330.827 824.967 331.035 824.956 331.242 824.945ZM1109.05 824.471C1109.09 824.625 1109.13 824.779 1109.17 824.933C1109.13 824.779 1109.09 824.625 1109.05 824.471ZM332.517 824.886C332.229 824.898 331.941 824.911 331.653 824.925C331.941 824.911 332.229 824.898 332.517 824.886ZM333.48 824.85C333.217 824.858 332.954 824.867 332.69 824.878C332.954 824.867 333.217 824.858 333.48 824.85ZM334.56 824.82C334.359 824.825 334.159 824.829 333.959 824.835C334.159 824.829 334.359 824.825 334.56 824.82ZM335.891 824.797C335.589 824.8 335.288 824.805 334.986 824.811C335.288 824.805 335.589 824.8 335.891 824.797ZM1108.82 823.414C1108.83 823.48 1108.85 823.545 1108.86 823.61C1108.85 823.53 1108.83 823.45 1108.81 823.37C1108.82 823.385 1108.82 823.399 1108.82 823.414ZM1108.62 822.328C1108.63 822.422 1108.65 822.516 1108.67 822.61C1108.65 822.516 1108.63 822.422 1108.62 822.328ZM953.091 821.441L953.225 821.442C953.113 821.44 953.002 821.437 952.891 821.434C952.957 821.436 953.024 821.44 953.091 821.441ZM952.044 821.398C952.127 821.403 952.21 821.406 952.293 821.41C952.21 821.406 952.127 821.403 952.044 821.398ZM747.124 818.085C747.678 818.336 748.239 818.573 748.807 818.797L747.961 818.451C747.68 818.332 747.401 818.21 747.124 818.085ZM234.859 800.368C234.512 801.046 234.175 801.729 233.847 802.414L234.347 801.389C234.516 801.048 234.686 800.707 234.859 800.368ZM726.217 793.202C726.248 793.325 726.28 793.447 726.312 793.569C726.28 793.447 726.248 793.325 726.217 793.202ZM726.048 792.517C726.085 792.675 726.124 792.833 726.163 792.991C726.124 792.833 726.085 792.675 726.048 792.517ZM725.813 791.454C725.823 791.501 725.834 791.548 725.844 791.595C725.831 791.533 725.817 791.472 725.805 791.41C725.808 791.425 725.81 791.439 725.813 791.454ZM725.608 790.368C725.626 790.47 725.644 790.572 725.663 790.674C725.644 790.572 725.626 790.47 725.608 790.368ZM916.674 786.912C916.696 787.202 916.722 787.491 916.751 787.778C916.722 787.491 916.696 787.202 916.674 786.912ZM916.616 786.029C916.628 786.249 916.641 786.468 916.657 786.687C916.642 786.468 916.628 786.249 916.616 786.029ZM916.559 783.954L916.57 784.921C916.577 785.2 916.588 785.478 916.602 785.756C916.573 785.158 916.559 784.557 916.559 783.953V783.954ZM712.886 267.812L712.453 267.262C712.412 267.211 712.371 267.16 712.33 267.109C712.517 267.343 712.703 267.576 712.886 267.812ZM712.086 266.808C711.97 266.665 711.854 266.523 711.736 266.381C711.854 266.523 711.97 266.665 712.086 266.808ZM710.887 265.376C710.658 265.112 710.428 264.85 710.195 264.591C710.428 264.85 710.658 265.112 710.887 265.376ZM708.767 263.056C708.928 263.223 709.088 263.392 709.248 263.562H709.249C708.831 263.118 708.405 262.681 707.974 262.251C708.24 262.517 708.505 262.785 708.767 263.056ZM707.87 262.147C707.624 261.903 707.375 261.661 707.124 261.421C707.375 261.661 707.624 261.903 707.87 262.147ZM692.944 251.402C693.194 251.528 693.442 251.653 693.689 251.782L693.063 251.461C693.024 251.441 692.984 251.422 692.944 251.402ZM692.243 251.056C692.161 251.016 692.078 250.975 691.995 250.936C692.078 250.975 692.161 251.016 692.243 251.056ZM685.226 248.195C685.451 248.27 685.676 248.346 685.9 248.424C685.452 248.268 685.001 248.118 684.548 247.974L685.226 248.195ZM679.003 246.502C678.673 246.432 678.342 246.364 678.01 246.3C678.342 246.364 678.673 246.432 679.003 246.502ZM677.784 246.257C677.52 246.207 677.256 246.158 676.991 246.111C677.256 246.158 677.52 246.207 677.784 246.257ZM676.771 246.073C676.466 246.021 676.159 245.97 675.852 245.922C676.159 245.97 676.466 246.021 676.771 246.073ZM673.988 245.662C674.231 245.692 674.472 245.723 674.714 245.756C675.068 245.804 675.422 245.855 675.774 245.909C675.045 245.797 674.311 245.699 673.573 245.613C673.712 245.629 673.85 245.645 673.988 245.662ZM673.141 245.564C673.019 245.551 672.897 245.539 672.774 245.526C672.897 245.539 673.019 245.551 673.141 245.564ZM672.411 245.49C672.241 245.474 672.071 245.459 671.9 245.444C672.071 245.459 672.241 245.474 672.411 245.49ZM671.676 245.426C671.452 245.407 671.228 245.39 671.003 245.374C671.228 245.39 671.452 245.407 671.676 245.426ZM670.725 245.355C670.538 245.343 670.352 245.332 670.165 245.321C670.352 245.332 670.538 245.343 670.725 245.355ZM669.771 245.3C669.567 245.29 669.362 245.281 669.156 245.272C669.362 245.281 669.567 245.29 669.771 245.3ZM666.2 245.23C665.835 245.234 665.47 245.241 665.104 245.252C664.852 245.259 664.602 245.269 664.352 245.279L665.104 245.253C665.47 245.242 665.835 245.235 666.2 245.23ZM668.956 245.265C668.709 245.256 668.461 245.249 668.213 245.243C668.461 245.249 668.709 245.256 668.956 245.265ZM668.006 245.238C667.857 245.235 667.708 245.233 667.559 245.231C667.708 245.233 667.857 245.235 668.006 245.238ZM666.315 245.229C666.604 245.227 666.892 245.227 667.18 245.229C666.892 245.227 666.604 245.227 666.315 245.229ZM722.651 184.52C723.506 184.927 724.356 185.344 725.202 185.771V185.77C724.356 185.343 723.506 184.927 722.651 184.52ZM1033.05 185.603C1032.99 185.619 1032.94 185.635 1032.89 185.651C1032.94 185.635 1032.99 185.619 1033.05 185.603ZM1034.34 185.23C1034.25 185.257 1034.15 185.285 1034.05 185.312C1034.15 185.285 1034.25 185.257 1034.34 185.23ZM1035.52 184.921C1035.36 184.961 1035.2 185.003 1035.04 185.045C1035.2 185.003 1035.36 184.961 1035.52 184.921ZM1041.42 183.756C1041.34 183.767 1041.27 183.777 1041.19 183.788C1041.27 183.777 1041.34 183.767 1041.42 183.756ZM714.989 181.16L714.859 181.107C714.739 181.059 714.617 181.013 714.496 180.965C714.66 181.03 714.825 181.094 714.989 181.16ZM713.381 180.528C713.288 180.492 713.195 180.456 713.102 180.42C712.998 180.38 712.894 180.342 712.791 180.303C712.988 180.378 713.184 180.453 713.381 180.528ZM711.712 179.899C711.511 179.825 711.309 179.75 711.107 179.677C711.309 179.75 711.511 179.825 711.712 179.899ZM709.281 179.025C708.881 178.886 708.481 178.749 708.08 178.614C708.481 178.749 708.881 178.886 709.281 179.025ZM707.69 178.484C707.339 178.367 706.987 178.251 706.635 178.137C706.987 178.251 707.339 178.367 707.69 178.484ZM706.242 178.011C705.921 177.908 705.599 177.806 705.277 177.705C705.599 177.806 705.921 177.908 706.242 178.011ZM627.587 177.744C627.451 177.786 627.315 177.829 627.18 177.872C627.315 177.829 627.451 177.786 627.587 177.744ZM704.739 177.539C704.442 177.448 704.144 177.357 703.846 177.268C704.144 177.357 704.442 177.448 704.739 177.539ZM629.196 177.256C629.099 177.285 629.001 177.314 628.903 177.343C629.001 177.314 629.099 177.285 629.196 177.256ZM703.248 177.091C702.995 177.016 702.741 176.942 702.487 176.869C702.741 176.942 702.995 177.016 703.248 177.091ZM630.664 176.829C630.519 176.87 630.375 176.913 630.23 176.954C630.375 176.913 630.519 176.87 630.664 176.829ZM701.754 176.66C701.549 176.602 701.344 176.545 701.139 176.488C701.344 176.545 701.549 176.602 701.754 176.66ZM632.132 176.422C632.039 176.447 631.946 176.474 631.853 176.499C632.055 176.444 632.258 176.389 632.461 176.334L632.132 176.422ZM700.399 176.286C700.088 176.202 699.776 176.12 699.464 176.038C699.776 176.12 700.088 176.202 700.399 176.286ZM699.051 175.931C698.946 175.904 698.842 175.875 698.737 175.849C698.611 175.816 698.485 175.787 698.358 175.755C698.589 175.813 698.82 175.871 699.051 175.931ZM697.11 175.445C697.043 175.429 696.976 175.412 696.908 175.396C696.849 175.381 696.79 175.368 696.73 175.354C696.857 175.384 696.984 175.415 697.11 175.445ZM695.403 175.044C695.243 175.007 695.082 174.97 694.921 174.934C695.082 174.97 695.242 175.007 695.403 175.044ZM687.789 173.542C688.991 173.742 690.191 173.959 691.387 174.192L689.535 173.844C688.954 173.739 688.372 173.639 687.789 173.542ZM687.484 173.492C687.026 173.417 686.567 173.345 686.107 173.274C686.567 173.345 687.026 173.417 687.484 173.492ZM685.618 173.199C685.063 173.116 684.507 173.037 683.951 172.961C684.507 173.037 685.063 173.116 685.618 173.199ZM676.448 172.16V172.159V172.16ZM800.602 137.661C800.589 137.752 800.576 137.843 800.564 137.934C800.576 137.843 800.589 137.752 800.602 137.661ZM800.749 136.645C800.731 136.761 800.714 136.877 800.696 136.993C800.714 136.877 800.731 136.761 800.749 136.645ZM800.917 135.615C800.899 135.72 800.882 135.825 800.864 135.931C800.882 135.825 800.899 135.72 800.917 135.615ZM801.71 131.817C801.66 132.022 801.61 132.228 801.562 132.434C801.61 132.228 801.66 132.022 801.71 131.817ZM801.922 130.975C801.876 131.15 801.831 131.326 801.787 131.502C801.831 131.326 801.876 131.15 801.922 130.975ZM802.161 130.084C802.119 130.238 802.076 130.392 802.035 130.546C802.076 130.392 802.119 130.238 802.161 130.084ZM802.425 129.16C802.378 129.32 802.331 129.481 802.285 129.642C802.331 129.481 802.378 129.32 802.425 129.16ZM802.708 128.227C802.653 128.401 802.6 128.575 802.547 128.75C802.6 128.575 802.654 128.401 802.708 128.227ZM802.991 127.343C802.928 127.533 802.868 127.724 802.807 127.915C802.868 127.724 802.928 127.533 802.991 127.343ZM805.439 121.157C805.42 121.199 805.402 121.241 805.383 121.283C805.402 121.241 805.42 121.199 805.439 121.157ZM806.009 119.968C805.973 120.042 805.936 120.115 805.9 120.189C805.936 120.115 805.972 120.042 806.009 119.968ZM806.593 118.813C806.548 118.899 806.503 118.984 806.459 119.07C806.503 118.984 806.548 118.899 806.593 118.813ZM808.483 115.451C808.24 115.851 808.002 116.255 807.769 116.661L808.123 116.054C808.242 115.852 808.362 115.651 808.483 115.451ZM1009.36 114.736C1009.25 114.774 1009.13 114.814 1009.02 114.853C1009.28 114.767 1009.54 114.682 1009.8 114.598L1009.36 114.736ZM812.224 110.011C812.085 110.191 811.947 110.371 811.81 110.553C811.947 110.371 812.084 110.19 812.224 110.011ZM812.73 109.365C812.583 109.551 812.436 109.737 812.29 109.925C812.436 109.737 812.583 109.551 812.73 109.365ZM812.907 109.145C812.881 109.177 812.854 109.21 812.828 109.243C813 109.028 813.174 108.815 813.35 108.603L812.907 109.145ZM861.072 87.4609C860.754 87.446 860.434 87.4337 860.114 87.4238C860.434 87.4335 860.754 87.446 861.072 87.4609ZM858.308 87.3965C858.559 87.3965 858.81 87.3982 859.061 87.4014C859.382 87.4054 859.702 87.4127 860.022 87.4219C859.453 87.4051 858.881 87.3955 858.308 87.3955V87.3965ZM808.837 21.7197C808.705 21.7722 808.575 21.826 808.443 21.8789C809.03 21.6424 809.618 21.4091 810.209 21.1807L808.837 21.7197ZM840.294 13.4346C839.98 13.4775 839.666 13.5221 839.352 13.5674C839.666 13.5222 839.98 13.4775 840.294 13.4346ZM841.375 13.292C841.109 13.3261 840.844 13.3607 840.578 13.3965C840.844 13.3607 841.109 13.3261 841.375 13.292ZM842.637 13.1357C842.376 13.1667 842.116 13.1979 841.855 13.2305C842.116 13.1979 842.376 13.1667 842.637 13.1357ZM845.41 12.834C844.616 12.9118 843.822 12.9975 843.026 13.0898C843.822 12.9976 844.616 12.9117 845.41 12.834ZM846.309 12.749C846.074 12.7704 845.84 12.7928 845.605 12.8154C845.921 12.785 846.236 12.7566 846.551 12.7285L846.309 12.749ZM225.316 839.556C225.315 839.891 225.314 840.227 225.316 840.562C225.314 840.227 225.315 839.891 225.316 839.556ZM389.863 838.01C389.517 837.824 389.169 837.642 388.821 837.461C389.169 837.642 389.517 837.825 389.863 838.01ZM1108.92 823.898C1108.96 824.057 1109 824.216 1109.03 824.374C1109 824.216 1108.96 824.057 1108.92 823.898ZM725.917 791.938C725.952 792.097 725.988 792.256 726.024 792.414C725.988 792.256 725.952 792.097 725.917 791.938ZM711.447 266.034C711.28 265.835 711.112 265.637 710.942 265.44C711.112 265.637 711.28 265.835 711.447 266.034ZM710.022 179.287C709.867 179.232 709.713 179.175 709.558 179.121C709.524 179.109 709.491 179.098 709.458 179.087C709.646 179.153 709.834 179.22 710.022 179.287Z"/></svg>
                  Hand <span class="tool-shortcut-hint">(H)</span>
                </button>
              </div>
            ` : nothing}
          </div><!-- .sidebar-dropdown-wrap (select) -->

          ${this.selectedIds.size > 0 ? html`
            <cb-toolbar
              sidebar-context
              .selectedItems="${this.#selectedItems}"
              .fieldTheme="${this.fieldTheme}"
              @player-update="${this.#onPlayerUpdate}"
              @equipment-update="${this.#onEquipmentUpdate}"
              @line-update="${this.#onLineUpdate}"
              @shape-update="${this.#onShapeUpdate}"
              @text-update="${this.#onTextUpdate}"
              @align-items="${this.#onAlignItems}"
              @group-items="${this.#onGroupItems}"
              @ungroup-items="${this.#onUngroupItems}"
              @delete-items="${this.#onDeleteItems}"
              @rotate-items="${this.#onRotateItems}"
              @z-order="${this.#onZOrder}">
            </cb-toolbar>
          ` : nothing}
          </div><!-- .select-track -->

          <!-- Player (with submenu: Team A / Team B / Neutral) -->
          <div class="sidebar-dropdown-wrap">
            <button class="sidebar-tool has-submenu"
                    title="Player (P)"
                    aria-label="Player"
                    aria-pressed="${t === 'add-player'}"
                    aria-haspopup="menu"
                    aria-expanded="${this._sidebarMenu === 'player'}"
                    aria-controls="sidebar-menu-player"
                    tabindex="${this._sidebarFocusIndex === 1 ? 0 : -1}"
                    @click="${(e: Event) => { e.stopPropagation(); this.#openSidebarMenu('player', 1); }}">
              <svg viewBox="0 0 1200 1200" width="20" height="20" fill="currentColor"><path d="m0 431.26 225 168.74v-200.16l-120.14-165.19z"/><path d="m1095.1 234.66-120.14 165.19v198.56l225-167.16z"/><path d="m1065.7 179.39c-9.9844-18.703-27.422-32.344-48-37.453l-267.71-66.938c0 82.828-67.172 150-150 150s-150-67.172-150-150l-267.71 66.938c-20.578 5.1562-38.016 18.75-48 37.453l-9.8438 18.469 134.44 184.87c2.3438 3.1875 3.5625 7.0781 3.5625 11.062v731.26h675l0.09375-731.29c0-3.9844 1.2656-7.8281 3.5625-11.062l134.44-184.87-9.8438-18.469zm-615.66 870.61h-112.5v-75h112.5zm318.74-581.26c-31.078 0-56.25-25.172-56.25-56.25 0-31.078 25.172-56.25 56.25-56.25 31.078 0 56.25 25.172 56.25 56.25 0 31.078-25.172 56.25-56.25 56.25z"/></svg>
            </button>
            ${this._sidebarMenu === 'player' ? html`
              <div id="sidebar-menu-player" role="menu" aria-label="Add Player" @keydown="${this.#onSidebarMenuKeyDown}">
                ${(this.fieldTheme === 'white'
                  ? [{ label: 'Team A', color: COLORS.playerBlueW, team: 'a' as const }, { label: 'Team B', color: COLORS.playerRedW, team: 'b' as const }, { label: 'Neutral', color: COLORS.playerYellowW, team: 'neutral' as const }]
                  : [{ label: 'Team A', color: COLORS.playerBlue, team: 'a' as const }, { label: 'Team B', color: COLORS.playerRed, team: 'b' as const }, { label: 'Neutral', color: COLORS.playerYellow, team: 'neutral' as const }]
                ).map(tm => html`
                  <button role="menuitem" tabindex="-1"
                          @click="${() => { this.activeTool = 'add-player'; this.playerColor = tm.color; this.playerTeam = tm.team; this.selectedIds = new Set(); this._multiSelect = false; this._sidebarMenu = null; }}">
                    ${tm.team === 'a' ? html`<svg viewBox="0 0 14 14" width="12" height="12"><polygon points="7,1 13,13 1,13" fill="${tm.color}" stroke="white" stroke-width="1" stroke-linejoin="round"/></svg>`
                    : tm.team === 'neutral' ? html`<svg viewBox="0 0 14 14" width="12" height="12"><rect x="2" y="2" width="10" height="10" rx="1" fill="${tm.color}" stroke="white" stroke-width="1" transform="rotate(45 7 7)"/></svg>`
                    : html`<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${tm.color};border:1px solid white;flex-shrink:0"></span>`}
                    ${tm.label}
                  </button>
                `)}
                <div class="sb-menu-separator"></div>
                <label style="display:flex;align-items:center;gap:8px;padding:8px 14px;font-size:0.85rem;color:var(--pt-text);cursor:pointer;">
                  <input type="checkbox" .checked="${this.autoNumber}"
                         @change="${(e: Event) => { this.autoNumber = (e.target as HTMLInputElement).checked; }}"
                         style="width:16px;height:16px;accent-color:var(--pt-accent);cursor:pointer;">
                  Auto-number
                </label>
              </div>
            ` : nothing}
          </div>

          <!-- Equipment (with submenu) -->
          <div class="sidebar-dropdown-wrap">
            <button class="sidebar-tool has-submenu"
                    title="Equipment (E)"
                    aria-label="Equipment"
                    aria-pressed="${t === 'add-equipment'}"
                    aria-haspopup="menu"
                    aria-expanded="${this._sidebarMenu === 'equipment'}"
                    aria-controls="sidebar-menu-equipment"
                    tabindex="${this._sidebarFocusIndex === 2 ? 0 : -1}"
                    @click="${(e: Event) => { e.stopPropagation(); this.#openSidebarMenu('equipment', 2); }}">
              <svg viewBox="0 0 1200 1200" width="20" height="20"><path d="m1125 1050v75h-1050v-75c0-63.75 48.75-112.5 112.5-112.5h825c63.75 0 112.5 48.75 112.5 112.5zm-461.26-975h-131.26l-285 825h708.74z" fill="currentColor"/></svg>
            </button>
            ${this._sidebarMenu === 'equipment' ? html`
              <div id="sidebar-menu-equipment" role="menu" aria-label="Add Equipment" @keydown="${this.#onSidebarMenuKeyDown}">
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'add-equipment'; this.equipmentKind = 'ball'; this.selectedIds = new Set(); this._multiSelect = false; this._sidebarMenu = null; }}">
                  <svg class="icon" viewBox="0 0 1200 1200" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="600" cy="600" r="560" fill="white" />
                    <path fill="${COLORS.ballDetail}" d="m1080 600.84c-0.23438 127.31-51 249.28-141.19 339.14s-212.34 140.26-339.66 140.02c-127.31-0.23438-249.28-51-339.14-141.19-89.867-90.191-140.26-212.34-140.02-339.66 0.23438-127.31 51-249.28 141.19-339.14 90.191-89.867 212.34-140.26 339.66-140.02 127.22 0.51562 249.05 51.375 338.86 141.52 89.766 90.094 140.26 212.11 140.29 339.32zm-481.92 153.61c25.781 0 51.609 0.84375 77.297 0 8.3906-0.84375 15.984-5.2031 21-12 25.219-41.578 49.547-83.766 73.078-126.47v-0.046875c3.2344-6.9375 3.2344-14.953 0-21.938-24-42-49.922-84-75.938-124.69h-0.046875c-4.5469-6.2344-11.531-10.219-19.172-11.016-48.703-0.9375-97.5-0.9375-146.29 0-8.3906 0.84375-16.031 5.2031-21 12-26.016 40.688-51.469 82.125-76.453 124.18-3.1875 6.9375-3.1875 14.906 0 21.844 24 42.562 48.422 84.703 73.219 126.47 4.5 6.1875 11.344 10.219 18.938 11.062 25.219 1.3125 50.297 0.60938 75.375 0.60938zm-174.71-426.61c-40.688 3.9375-73.312 6.4688-105.61 10.781-8.5312 1.5-16.125 6.2344-21.234 13.219-24.609 38.625-48 78-71.156 117.7-3.375 6.3281-4.0781 13.734-1.9219 20.531 13.266 32.859 27.469 65.344 42.609 97.453 3.5625 5.7188 9.6562 9.4219 16.406 9.9375 31.922-2.1562 63.703-5.2969 96-9.7031 8.3438-1.5469 15.75-6.2812 20.672-13.219 26.156-41.062 51.422-82.594 75.844-124.69h-0.046875c3.7969-7.4062 4.4062-16.078 1.6875-24-12-28.312-24-56.156-37.781-83.391-4.0781-5.9062-9.375-10.875-15.469-14.625zm352.55 0c-5.5312 3.75-10.266 8.5312-13.922 14.156-13.547 27.375-26.391 55.219-37.922 84-2.6719 7.875-2.2031 16.453 1.3125 24 24 42 49.781 84 75.938 124.55h0.046875c5.5312 7.1719 13.594 11.953 22.547 13.453 30.844 4.4531 62.062 7.4531 93.234 9.375 7.3594-0.75 13.922-4.9219 17.625-11.297 14.625-30.609 28.312-61.781 41.062-93.375 2.6719-7.4062 2.25-15.562-1.0781-22.641-23.062-39.703-46.688-78.938-71.297-117.7v-0.046875c-4.9219-7.0312-12.328-11.906-20.766-13.688-33.094-4.4062-66.703-6.9375-106.78-10.922zm-13.781 562.08c-22.219-30.984-43.828-61.922-66.141-91.688-4.3125-4.125-10.078-6.375-16.078-6.2344-53.297-0.65625-106.83-0.65625-160.69 0-5.9531 0.23438-11.625 2.8125-15.703 7.2188-22.312 30-43.781 60-65.766 91.078 22.547 28.922 43.453 56.625 65.625 84 5.4375 5.7656 12.844 9.2344 20.766 9.7031 50.719 0.79688 101.53 0.79688 152.39 0 7.5-0.51562 14.484-3.9375 19.453-9.6094 22.219-27.328 43.547-55.547 66.141-84.469zm-483.98-593.76c9.9844 2.9062 20.156 4.9688 30.469 6.1406 13.922 0 27.703-2.3906 41.531-3.8438 29.625-3.375 61.688-0.70312 88.547-11.391 46.688-19.828 91.781-43.172 134.9-69.844 7.4531-4.4531 7.0781-24 7.2188-37.312 0-4.0781-9.6094-9.2344-15.703-12-22.453-10.219-44.766-4.0781-67.219 1.3125h-0.046876c-84 20.016-160.36 64.125-219.71 126.94zm643.45 0c-63.047-67.172-145.69-112.78-236.16-130.22-16.969-1.9219-34.172-1.125-50.906 2.2969-5.7656 0.84375-15.375 7.7812-15.375 12 0 12.844 0 32.766 7.4531 37.219 43.547 25.688 89.297 48 134.39 71.062l0.046875-0.046875c3.2344 1.2656 6.7031 1.9219 10.172 2.0625 40.078 4.0781 80.156 8.5312 120 12 10.359-0.9375 20.578-3.2344 30.375-6.8438zm-747.71 192c-24 66.609-20.766 167.06 4.2188 248.86l-0.046876 0.046875c7.6406 25.125 23.109 47.156 44.156 62.859 24-12 24-12 23.391-36.938-1.7812-42.984-3.2344-85.594-5.625-127.82-0.23438-8.2031-1.9219-16.359-4.9219-24-14.719-35.109-30-70.078-45.844-104.86-4.3125-6.9375-9.4688-13.312-15.375-18.984zm804.61 310.78c59.156-48.703 87.375-226.22 46.781-308.53-4.3125 3.8438-9.9375 6.4688-12 10.547-21.141 56.625-60 107.16-56.062 172.31v0.046876c1.1719 29.953-0.09375 59.906-3.8438 89.625-1.5469 18.375 4.0781 29.906 25.078 35.203zm-246.52 223.69c77.578-23.672 146.86-68.859 199.78-130.31 10.594-14.297 18.984-30.047 24.984-46.781 1.6406-5.9062 0.14063-12.234-3.9844-16.828-8.1562-3.9375-20.766-9-26.859-5.3906-75 43.828-149.16 88.688-195.84 166.55-7.4531 12.281-10.078 20.438 1.9219 32.766zm-258 1.9219c0-12 3.1406-21.703 0-27.938-47.062-81.234-122.76-130.08-201.71-174.47-5.3906-3.1406-17.766 2.7656-24.938 7.4531l-0.046874-0.046875c-3.7969 4.8281-4.9219 11.203-3.0938 17.062 4.6406 15.141 11.766 29.438 21 42.328 55.219 64.219 127.64 111.28 208.78 135.61z" />
                  </svg>
                  Ball
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'add-equipment'; this.equipmentKind = 'cone'; this.selectedIds = new Set(); this._multiSelect = false; this._sidebarMenu = null; }}">
                  <svg class="icon" viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="8" cy="8" r="5" fill="none" stroke="${COLORS.coneNeonOrange}" stroke-width="3.5" />
                    <circle cx="8" cy="8" r="2" fill="#d0d0d0" />
                  </svg>
                  Cone
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'add-equipment'; this.equipmentKind = 'dummy'; this.selectedIds = new Set(); this._multiSelect = false; this._sidebarMenu = null; }}">
                  <svg class="icon" viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                    <rect x="4.5" y="1.5" width="7" height="13" rx="3.5"
                          fill="none" stroke="${COLORS.coneChartreuse}" stroke-width="1.8" />
                    <rect x="6.5" y="3.5" width="3" height="9" rx="1.5"
                          fill="${COLORS.coneChartreuse}" fill-opacity="0.6" />
                  </svg>
                  Dummy
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'add-equipment'; this.equipmentKind = 'pole'; this.selectedIds = new Set(); this._multiSelect = false; this._sidebarMenu = null; }}">
                  <svg class="icon" viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="8" cy="8" r="5.5" fill="none" stroke="#d0d0d0" stroke-width="1.5" />
                    <circle cx="8" cy="8" r="3" fill="${COLORS.coneChartreuse}" />
                  </svg>
                  Pole
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'add-equipment'; this.equipmentKind = 'goal'; this.selectedIds = new Set(); this._multiSelect = false; this._sidebarMenu = null; }}">
                  <svg class="icon" viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="1" width="7" height="14" fill="none" stroke="white" stroke-width="1.3"
                          stroke-dasharray="1.8,1" />
                    <line x1="3" y1="1" x2="3" y2="15" stroke="white" stroke-width="1.3" stroke-dasharray="none" />
                  </svg>
                  Goal
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'add-equipment'; this.equipmentKind = 'mini-goal'; this.selectedIds = new Set(); this._multiSelect = false; this._sidebarMenu = null; }}">
                  <svg class="icon" viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                    <rect x="3" y="3" width="5" height="10" fill="none" stroke="white" stroke-width="1.3"
                          stroke-dasharray="1.8,1" />
                    <line x1="3" y1="3" x2="3" y2="13" stroke="white" stroke-width="1.3" stroke-dasharray="none" />
                  </svg>
                  Mini Goal
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'add-equipment'; this.equipmentKind = 'popup-goal'; this.selectedIds = new Set(); this._multiSelect = false; this._sidebarMenu = null; }}">
                  <svg class="icon" viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                    <path d="M 5,1.5 A 6.5,6.5 0 0 1 5,14.5" fill="none" stroke="${COLORS.popupGoal}" stroke-width="1.3"
                          stroke-dasharray="1.8,1" />
                    <line x1="5" y1="1.5" x2="5" y2="14.5" stroke="${COLORS.popupGoal}" stroke-width="1.3" stroke-dasharray="none" />
                  </svg>
                  Pop-up Goal
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'add-equipment'; this.equipmentKind = 'coach'; this.selectedIds = new Set(); this._multiSelect = false; this._sidebarMenu = null; }}">
                  <svg class="icon" viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="8" cy="8" r="7" fill="${COLORS.coachBg}" stroke="white" stroke-width="0.8" />
                    <text x="8" y="8" text-anchor="middle" dominant-baseline="central"
                          fill="white" font-size="8" font-weight="bold" font-family="system-ui, sans-serif">C</text>
                  </svg>
                  Coach
                </button>
              </div>
            ` : nothing}
          </div>

          <!-- Draw (with submenu: line styles + shapes) -->
          <div class="sidebar-dropdown-wrap">
            <button class="sidebar-tool has-submenu"
                    title="Draw (D)"
                    aria-label="Draw"
                    aria-pressed="${t === 'draw-line' || t === 'draw-shape'}"
                    aria-haspopup="menu"
                    aria-expanded="${this._sidebarMenu === 'draw'}"
                    aria-controls="sidebar-menu-draw"
                    tabindex="${this._sidebarFocusIndex === 3 ? 0 : -1}"
                    @click="${(e: Event) => { e.stopPropagation(); this.#openSidebarMenu('draw', 3); }}">
              <svg viewBox="0 0 1200 1200" width="20" height="20" fill="currentColor"><path d="m349.6 604.3-88.301 88.551c-9.75 9.6992-9.75 25.613 0.050781 35.352l17.699 17.699-123.65 123.95c-4.6992 4.6992-7.3008 11.113-7.3008 17.699 0 6.6016 2.6484 12.949 7.3516 17.699l53.102 53-79.602 79.75c-9.75 9.75-9.75 25.602 0.050781 35.352 4.8984 4.8984 11.25 7.3008 17.648 7.3008 6.3984 0 12.801-2.4492 17.699-7.3516l79.602-79.801 53.102 53c4.8984 4.8867 11.25 7.3008 17.648 7.3008s12.801-2.4609 17.699-7.3008l123.6-123.95 17.699 17.699c4.6992 4.6875 11.051 7.3008 17.648 7.3008 6.6484 0 13-2.7109 17.699-7.3008l88.301-88.562z"/><path d="m1060.9 325.05-150.74-150.3c-19.262-19.449-43.211-43.648-70.461-43.648-11.789 0-22.551 4.5-31.051 13.051l-70.637 70.801-88.551-88.301c-4.6992-4.6484-11.051-7.3008-17.648-7.3008-6.6484 0-13 2.6484-17.699 7.3516l-282.42 283.2c-9.6992 9.75-9.6992 25.602 0.050781 35.352 9.8008 9.6992 25.602 9.8008 35.352-0.050781l264.8-265.5 70.801 70.648-317.75 318.55 247.85 247.2 428.15-429.25c9-8.8008 17.488-17.148 17.488-30.898-0.035157-13.754-8.5352-22.102-17.535-30.902z"/></svg>
            </button>
            ${this._sidebarMenu === 'draw' ? html`
              <div id="sidebar-menu-draw" role="menu" aria-label="Draw" @keydown="${this.#onSidebarMenuKeyDown}">
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'draw-line'; this.lineStyle = 'solid'; this.selectedIds = new Set(); this._sidebarMenu = null; }}">
                  <svg class="icon" viewBox="0 0 32 12" width="32" height="12">
                    <line x1="2" y1="6" x2="22" y2="6" stroke="${COLORS.previewStroke}" stroke-width="2" />
                    <polygon points="20,2 28,6 20,10" fill="${COLORS.previewStroke}" />
                  </svg>
                  Pass / Shot
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'draw-line'; this.lineStyle = 'dashed'; this.selectedIds = new Set(); this._sidebarMenu = null; }}">
                  <svg class="icon" viewBox="0 0 32 12" width="32" height="12">
                    <line x1="2" y1="6" x2="22" y2="6" stroke="${COLORS.previewStroke}" stroke-width="2" stroke-dasharray="4,3" />
                    <polygon points="20,2 28,6 20,10" fill="${COLORS.previewStroke}" />
                  </svg>
                  Run
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'draw-line'; this.lineStyle = 'wavy'; this.selectedIds = new Set(); this._sidebarMenu = null; }}">
                  <svg class="icon" viewBox="0 0 32 12" width="32" height="12">
                    <path d="M 2,6 Q 5,2 8,6 Q 11,10 14,6 Q 17,2 22,6" fill="none" stroke="${COLORS.previewStroke}" stroke-width="2" />
                    <polygon points="20,2 28,6 20,10" fill="${COLORS.previewStroke}" />
                  </svg>
                  Dribble
                </button>
                <div class="sb-menu-separator"></div>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'draw-shape'; this.shapeKind = 'rect'; this.selectedIds = new Set(); this._sidebarMenu = null; }}">
                  <svg class="icon" viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="3" width="12" height="10" fill="none" stroke="${COLORS.previewStroke}" stroke-width="1.2" rx="0.5" />
                  </svg>
                  Rectangle
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'draw-shape'; this.shapeKind = 'ellipse'; this.selectedIds = new Set(); this._sidebarMenu = null; }}">
                  <svg class="icon" viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                    <ellipse cx="8" cy="8" rx="7" ry="5" fill="none" stroke="${COLORS.previewStroke}" stroke-width="1.2" />
                  </svg>
                  Ellipse
                </button>
              </div>
            ` : nothing}
          </div>

          <!-- More (secondary tools: Text, Measure) -->
          <div class="sidebar-dropdown-wrap">
            <button class="sidebar-tool has-submenu"
                    title="More tools"
                    aria-label="More tools"
                    aria-pressed="${MORE_TOOLS.includes(t)}"
                    aria-haspopup="menu"
                    aria-expanded="${this._sidebarMenu === 'more'}"
                    aria-controls="sidebar-menu-more"
                    tabindex="${this._sidebarFocusIndex === 4 ? 0 : -1}"
                    @click="${(e: Event) => { e.stopPropagation(); this.#openSidebarMenu('more', 4); }}">
              <svg viewBox="0 0 1200 1200" width="20" height="20" fill="currentColor">
                <circle cx="200" cy="600" r="120"/>
                <circle cx="600" cy="600" r="120"/>
                <circle cx="1000" cy="600" r="120"/>
              </svg>
            </button>
            ${this._sidebarMenu === 'more' ? html`
              <div id="sidebar-menu-more" role="menu" aria-label="More tools" @keydown="${this.#onSidebarMenuKeyDown}">
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'add-text'; this.selectedIds = new Set(); this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 1200 1200" width="20" height="20" fill="currentColor"><path d="m1010.5 347.39c17.438 0 31.594-14.156 31.594-31.594v-126.32c0-17.438-14.156-31.594-31.594-31.594h-126.32c-17.438 0-31.594 14.156-31.594 31.594v31.594h-505.22v-31.594c0-17.438-14.156-31.594-31.594-31.594h-126.32c-17.438 0-31.594 14.156-31.594 31.594v126.32c0 17.438 14.156 31.594 31.594 31.594h31.594v505.26h-31.594c-17.438 0-31.594 14.156-31.594 31.594v126.32c0 17.438 14.156 31.594 31.594 31.594h126.32c17.438 0 31.594-14.156 31.594-31.594v-31.594h505.26v31.594c0 17.438 14.156 31.594 31.594 31.594h126.32c17.438 0 31.594-14.156 31.594-31.594v-126.32c0-17.438-14.156-31.594-31.594-31.594h-31.594l-0.046874-505.26zm-94.734-126.32h63.141v63.141h-63.141zm-694.74 0h63.141v63.141h-63.141zm63.141 757.87h-63.141v-63.141h63.141zm694.74 0h-63.141v-63.141h63.141zm-63.141-126.32h-31.594c-17.438 0-31.594 14.156-31.594 31.594v31.594h-505.22v-31.594c0-17.438-14.156-31.594-31.594-31.594h-31.594v-505.22h31.594c17.438 0 31.594-14.156 31.594-31.594v-31.594h505.26v31.594c0 17.438 14.156 31.594 31.594 31.594h31.594v505.26z"/><path d="m789.47 378.94h-378.94c-17.438 0-31.594 14.156-31.594 31.594v63.141c0 17.438 14.156 31.594 31.594 31.594s31.594-14.156 31.594-31.594v-31.594h126.32v378.94c0 17.438 14.156 31.594 31.594 31.594s31.594-14.156 31.594-31.594v-378.94h126.32v31.594c0 17.438 14.156 31.594 31.594 31.594s31.594-14.156 31.594-31.594v-63.141c0-17.438-14.156-31.594-31.594-31.594z"/></svg>
                  Text <span class="tool-shortcut-hint">(T)</span>
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'measure'; this.selectedIds = new Set(); this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 1200 1200" width="17" height="17" fill="currentColor"><path d="m1139.3 40.5c-14.25-5.625-30-2.625-40.875 8.25l-1050 1049.6c-10.875 10.875-13.875 27-8.25 40.875s19.5 23.25 34.5 23.25h1050c20.625 0 37.5-16.875 37.5-37.5v-1050c0-15-9-28.875-23.25-34.5zm-51.75 1047h-922.13l97.125-97.125 38.625 38.625c7.5 7.5 16.875 10.875 26.625 10.875s19.125-3.75 26.625-10.875c14.625-14.625 14.625-38.25 0-52.875l-38.625-38.625 59.625-59.625 38.625 38.625c7.5 7.5 16.875 10.875 26.625 10.875s19.125-3.75 26.625-10.875c14.625-14.625 14.625-38.25 0-52.875l-38.625-38.625 59.625-59.625 38.625 38.625c7.5 7.5 16.875 10.875 26.625 10.875s19.125-3.75 26.625-10.875c14.625-14.625 14.625-38.25 0-52.875l-38.625-38.625 59.625-59.625 38.625 38.625c7.5 7.5 16.875 10.875 26.625 10.875s19.125-3.75 26.625-10.875c14.625-14.625 14.625-38.25 0-52.875l-38.625-38.625 59.625-59.625 38.625 38.625c7.5 7.5 16.875 10.875 26.625 10.875s19.125-3.75 26.625-10.875c14.625-14.625 14.625-38.25 0-52.875l-38.625-38.625 59.625-59.625 38.625 38.625c7.5 7.5 16.875 10.875 26.625 10.875s19.125-3.75 26.625-10.875c14.625-14.625 14.625-38.25 0-52.875l-38.625-38.625 59.625-59.625 38.625 38.625c7.5 7.5 16.875 10.875 26.625 10.875s19.125-3.75 26.625-10.875c14.625-14.625 14.625-38.25 0-52.875l-38.625-38.625 97.125-97.125v922.13z"/><path d="m951.74 565.5c-13.875-5.625-30-2.625-40.875 8.25l-337.5 337.5c-10.875 10.875-13.875 27-8.25 40.875s19.5 23.25 34.5 23.25h337.5c20.625 0 37.5-16.875 37.5-37.5v-337.5c0-15-9-28.875-23.25-34.5zm-51.75 334.5h-209.63l209.63-209.63z"/><path d="m75 750h98.625c20.625 0 37.5-16.875 37.5-37.5s-16.875-37.5-37.5-37.5h-8.25l509.63-509.63v8.25c0 20.625 16.875 37.5 37.5 37.5s37.5-16.875 37.5-37.5v-98.625c0-20.625-16.875-37.5-37.5-37.5h-98.625c-20.625 0-37.5 16.875-37.5 37.5s16.875 37.5 37.5 37.5h8.25l-509.63 509.63v-8.25c0-20.625-16.875-37.5-37.5-37.5s-37.5 16.875-37.5 37.5v98.625c0 20.625 16.875 37.5 37.5 37.5z"/></svg>
                  Measure <span class="tool-shortcut-hint">(M)</span>
                </button>
              </div>
            ` : nothing}
          </div>

          </div><!-- .sidebar-tools -->

        </nav><!-- .sidebar -->

        <!-- Screen reader announcement when context controls become available -->
        <div role="status" aria-live="polite" aria-atomic="true" class="visually-hidden">
          ${this.selectedIds.size > 0
            ? `${this.selectedIds.size} item${this.selectedIds.size > 1 ? 's' : ''} selected. Edit controls available.`
            : ''}
        </div>

          <div class="field-wrap">
            <cb-field
              .players="${this.players}"
              .lines="${this.lines}"
              .equipment="${this.equipment}"
              .shapes="${this.shapes}"
              .textItems="${this.textItems}"
              .selectedIds="${this.selectedIds}"
              .ghost="${this.ghost}"
              .draw="${this._draw}"
              .shapeDraw="${this._shapeDraw}"
              .measure="${this.#measureState}"
              .marquee="${this._marquee}"
              .activeTool="${this.activeTool}"
              .viewTransform="${this._viewTransform}"
              .playerColor="${this.playerColor}"
              .playerTeam="${this.playerTeam}"
              .lineStyle="${this.lineStyle}"
              .equipmentKind="${this.equipmentKind}"
              .shapeKind="${this.shapeKind}"
              .fieldOrientation="${this.fieldOrientation}"
              .fieldTheme="${this.fieldTheme}"
              .pitchType="${this.pitchType}"
              .viewMode="${this._viewMode}"
              .isMobile="${this._isMobile}"
              .rotateHandleId="${this._rotateHandleId}"
              .animationMode="${this._animationMode}"
              .animationFrames="${this.animationFrames}"
              .activeFrameIndex="${this.activeFrameIndex}"
              .isPlaying="${this.isPlaying}"
              .playbackProgress="${this._playbackProgress}"
              .showPlayOverlay="${this._showPlayOverlay}"
              .pauseFlash="${this._pauseFlash}"
              .playBtnAnim="${this._playBtnAnim}"
              @pointerdown="${this.#onPointerDown}"
              @pointermove="${this.#onPointerMove}"
              @pointerup="${this.#onPointerUp}"
              @pointerleave="${this.#onPointerLeave}"
              @cb-field-play-overlay-click="${this.#toggleReadonlyPlayback}"
            ></cb-field>

          <div class="print-summary-block">
            ${this.#cachedSummary ? html`
              <div class="summary-board-name">${this.#cachedSummary.name}</div>
              <div class="summary-section">
                <h3>Pitch</h3><p>${this.#cachedSummary.pitchLabel} · ${this.#cachedSummary.orientation}</p>
              </div>
              ${this.#cachedSummary.playersByColor.size > 0 || this.#cachedSummary.coachCount > 0 ? html`
                <div class="summary-section"><h3>Players</h3><p>${[...this.#cachedSummary.playersByColor.entries()].map(([c, n]) => `${n} ${c}`).join(', ')}${this.#cachedSummary.coachCount > 0 ? `${this.#cachedSummary.playersByColor.size > 0 ? ', ' : ''}${this.#cachedSummary.coachCount} Coach${this.#cachedSummary.coachCount > 1 ? 'es' : ''}` : ''}</p></div>
              ` : nothing}
              ${this.#cachedSummary.equipByKind.size > 0 || this.#cachedSummary.conesByColor.size > 0 || this.#cachedSummary.dummiesByColor.size > 0 || this.#cachedSummary.polesByColor.size > 0 ? html`
                <div class="summary-section"><h3>Equipment</h3><p>${[
                  ...this.#cachedSummary.equipByKind.entries()].map(([k, n]) => `${n} ${k}${n > 1 ? 's' : ''}`).concat(
                  this.#cachedSummary.conesByColor.size > 0 ? [`${[...this.#cachedSummary.conesByColor.values()].reduce((a, b) => a + b, 0)} Cone${[...this.#cachedSummary.conesByColor.values()].reduce((a, b) => a + b, 0) > 1 ? 's' : ''}`] : []).concat(
                  this.#cachedSummary.dummiesByColor.size > 0 ? [`${[...this.#cachedSummary.dummiesByColor.values()].reduce((a, b) => a + b, 0)} Dumm${[...this.#cachedSummary.dummiesByColor.values()].reduce((a, b) => a + b, 0) > 1 ? 'ies' : 'y'}`] : []).concat(
                  this.#cachedSummary.polesByColor.size > 0 ? [`${[...this.#cachedSummary.polesByColor.values()].reduce((a, b) => a + b, 0)} Pole${[...this.#cachedSummary.polesByColor.values()].reduce((a, b) => a + b, 0) > 1 ? 's' : ''}`] : []
                ).join(', ')}</p></div>
              ` : nothing}
              ${this.#cachedSummary.linesByStyle.size > 0 ? html`
                <div class="summary-section"><h3>Lines</h3><p>${[...this.#cachedSummary.linesByStyle.entries()].map(([st, n]) => `${n} ${st}`).join(', ')}</p></div>
              ` : nothing}
              ${this.#cachedSummary.shapesByKind.size > 0 ? html`<div class="summary-section"><h3>Shapes</h3><p>${[...this.#cachedSummary.shapesByKind.entries()].map(([k, n]) => `${n} ${k}${n > 1 ? 's' : ''}`).join(', ')}</p></div>` : nothing}
              ${this.#cachedSummary.textCount > 0 ? html`<div class="summary-section"><h3>Text</h3><p>${this.#cachedSummary.textCount} text item${this.#cachedSummary.textCount > 1 ? 's' : ''}</p></div>` : nothing}
              ${this.#cachedSummary.frameCount > 0 ? html`<div class="summary-section"><h3>Animation</h3><p>${this.#cachedSummary.frameCount} frame${this.#cachedSummary.frameCount > 1 ? 's' : ''}</p></div>` : nothing}
              ${this._boardNotes ? html`<div class="summary-section"><h3>Notes &amp; Instructions</h3><div class="notes-body">${unsafeHTML(parseNotes(this._boardNotes))}</div></div>` : nothing}
            ` : nothing}
          </div>
          </div><!-- .field-wrap -->
        </div><!-- .board-area -->

        ${this._animationMode && !this._isMobile ? html`
          <cb-timeline
            .frameCount="${this.animationFrames.length}"
            .activeFrame="${this.activeFrameIndex}"
            .isPlaying="${this.isPlaying}"
            .playbackProgress="${this._playbackProgress}"
            .speed="${this._playbackSpeed}"
            @frame-select="${this.#onFrameSelect}"
            @frame-add="${this.#onFrameAdd}"
            @frame-delete="${this.#onFrameDelete}"
            @play-toggle="${this.#onPlayToggle}"
            @speed-change="${this.#onSpeedChange}"
            @loop-toggle="${this.#onLoopToggle}"
            .loop="${this._playbackLoop}">
          </cb-timeline>
        ` : nothing}

        <div class="bottom-bar">
            <div class="bottom-left">
              <button class="icon-btn" title="Undo (Cmd+Z)" aria-label="Undo"
                      ?disabled="${this.#undoStack.length === 0}"
                      @click="${this.#undo}">
                <svg viewBox="0 0 16 16" width="14" height="14">
                  <path d="M 5,3 L 2,6 L 5,9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M 2,6 L 10,6 A 4,4 0 0 1 10,14 L 7,14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </button>
              <button class="icon-btn" title="Redo (Cmd+Shift+Z)" aria-label="Redo"
                      ?disabled="${this.#redoStack.length === 0}"
                      @click="${this.#redo}">
                <svg viewBox="0 0 16 16" width="14" height="14">
                  <path d="M 11,3 L 14,6 L 11,9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M 14,6 L 6,6 A 4,4 0 0 0 6,14 L 9,14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </button>

              ${this._viewMode !== 'readonly' ? html`
                <div class="bottom-bar-divider" role="separator" aria-hidden="true"></div>
                <button class="icon-btn" aria-label="Zoom out (-)" title="Zoom out (-)"
                        @click="${this.#zoomOut}">
                  <svg class="icon" viewBox="0 0 1200 1200" width="18" height="18" fill="currentColor">
                    <path d="m1091.1 1078.1-241.31-309.38c76.914-79.898 120.61-186.03 122.25-296.92 1.6406-110.89-38.902-218.27-113.43-300.4-74.52-82.133-177.46-132.9-287.98-142.02-110.53-9.1211-220.39 24.082-307.37 92.887-86.98 68.805-144.57 168.08-161.14 277.74-16.562 109.66 9.1445 221.52 71.922 312.94 62.777 91.422 157.94 155.59 266.23 179.52 108.29 23.93 221.63 5.832 317.08-50.629l240.94 308.81c9.6836 12.352 23.883 20.344 39.469 22.207 15.586 1.8672 31.27-2.5508 43.594-12.27 12.16-9.6953 20.004-23.801 21.832-39.246 1.8242-15.445-2.5156-30.988-12.082-43.254zm-521.81-277.69c-69.402 7.3633-139.38-6.9688-200.3-41.023-60.918-34.059-109.78-86.164-139.86-149.14-30.078-62.98-39.895-133.73-28.09-202.52 11.801-68.789 44.637-132.23 93.988-181.58s112.79-82.188 181.58-93.988c68.789-11.805 139.54-1.9883 202.52 28.09 62.977 30.078 115.08 78.941 149.14 139.86 34.055 60.922 48.387 130.9 41.023 200.3-8.1484 76.777-42.371 148.44-96.969 203.03-54.594 54.598-126.25 88.82-203.03 96.969z"/>
                    <path d="m334.69 416.62h399.94c26.715 0 48.375 26.664 48.375 48.281 0 26.664-21.66 48.281-48.375 48.281h-399.94c-26.715 0-48.375-26.664-48.375-48.281 0-26.664 21.66-48.281 48.375-48.281z"/>
                  </svg>
                </button>
                <button class="zoom-level"
                      aria-label="Reset zoom to 100% (0)"
                      title="Reset zoom to 100% (0)"
                        @click="${this.#resetView}">
                  ${Math.round(this._viewTransform.scale * 100)}%
                </button>
                <button class="icon-btn" aria-label="Zoom in (=)" title="Zoom in (=)"
                        @click="${this.#zoomIn}">
                  <svg class="icon" viewBox="0 0 1200 1200" width="18" height="18" fill="currentColor">
                    <path d="m1091.1 1078.1-241.31-309.38c76.914-79.898 120.61-186.03 122.25-296.92 1.6406-110.89-38.902-218.27-113.43-300.4-74.52-82.133-177.46-132.9-287.98-142.02-110.53-9.1211-220.39 24.082-307.37 92.887-86.98 68.805-144.57 168.08-161.14 277.74-16.562 109.66 9.1445 221.52 71.922 312.94 62.777 91.422 157.94 155.59 266.23 179.52 108.29 23.93 221.63 5.832 317.08-50.629l240.94 308.81c9.6836 12.352 23.883 20.344 39.469 22.207 15.586 1.8672 31.27-2.5508 43.594-12.27 12.16-9.6953 20.004-23.801 21.832-39.246 1.8242-15.445-2.5156-30.988-12.082-43.254zm-521.81-277.69c-69.402 7.3633-139.38-6.9688-200.3-41.023-60.918-34.059-109.78-86.164-139.86-149.14-30.078-62.98-39.895-133.73-28.09-202.52 11.801-68.789 44.637-132.23 93.988-181.58s112.79-82.188 181.58-93.988c68.789-11.805 139.54-1.9883 202.52 28.09 62.977 30.078 115.08 78.941 149.14 139.86 34.055 60.922 48.387 130.9 41.023 200.3-8.1484 76.777-42.371 148.44-96.969 203.03-54.594 54.598-126.25 88.82-203.03 96.969z"/>
                    <path d="m710.25 434.81h-144.38v-148.31c0.66797-8.4961-2.2422-16.883-8.0273-23.141s-13.922-9.8125-22.441-9.8125-16.656 3.5547-22.441 9.8125-8.6953 14.645-8.0273 23.141v148.31h-144.38c-11.055 0-21.266 5.8984-26.793 15.469-5.5273 9.5703-5.5273 21.367 0 30.938 5.5273 9.5703 15.738 15.469 26.793 15.469h144.38v148.31c0.80859 10.32 6.7891 19.527 15.883 24.465 9.0977 4.9414 20.074 4.9414 29.172 0 9.0938-4.9375 15.074-14.145 15.883-24.465v-148.31h144.38c11.055 0 21.266-5.8984 26.793-15.469 5.5273-9.5703 5.5273-21.367 0-30.938-5.5273-9.5703-15.738-15.469-26.793-15.469z"/>
                  </svg>
                </button>
              ` : nothing}
            </div>
            <div class="bottom-center">
              ${!this._isMobile ? html`
                <button aria-pressed="${this._animationMode}"
                        title="Animate" aria-label="Animate"
                        @click="${this.#toggleAnimationMode}">
                  <svg class="icon" viewBox="0 0 1200 1200" width="24" height="24">
                    <path d="m846.12 420.12c-59.641-2.6406-113.88 35.16-131.88 92.039l-2.0391 6.6016-6.7188 1.4414c-81.84 18-141.24 91.922-141.24 175.68v93.84c0 31.68-23.762 58.922-54 61.801-16.801 1.6797-33.719-3.9609-46.199-15.238-12.48-11.398-19.68-27.602-19.68-44.398v-336c0-99.238-80.762-180-180-180-19.801 0-36 16.199-36 36s16.199 36 36 36c59.52 0 108 48.48 108 108v331.8c0 69.719 52.32 129.36 119.28 135.6 37.559 3.6016 73.68-8.3984 101.52-33.84 27.48-24.961 43.199-60.602 43.199-97.559v-96c0-43.68 26.039-82.801 66.48-99.719l11.039-4.6797 4.6797 11.039c20.641 49.32 68.52 81.238 121.8 81.238 36.238 0 69.961-14.398 95.16-40.559 25.078-26.16 38.16-60.48 36.719-96.719-2.6406-67.922-57.961-123.48-125.76-126.6zm-6.1211 191.88c-33.121 0-60-26.879-60-60s26.879-60 60-60 60 26.879 60 60-26.879 60-60 60z" fill="currentColor"/>
                  </svg>
                  <span class="btn-text">Animate</span>
                </button>
              ` : nothing}
              ${!this._isMobile ? html`
                <div class="dropdown-wrap">
                  <button aria-label="${this.fieldOrientation === 'horizontal' ? 'Horizontal pitch' : 'Vertical pitch'}"
                          title="Pitch orientation"
                          aria-haspopup="menu"
                          aria-expanded="${this._fieldMenuOpen}"
                          aria-controls="field-orientation-menu"
                          @click="${this.#toggleFieldMenu}">
                    <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14">
                      ${this.fieldOrientation === 'horizontal'
                        ? svg`<path d="m1152 555.6-168-168c-24-24-63.602-24-87.602 0s-24 63.602 0 87.602l62.398 62.398h-716.4l62.398-62.398c24-24 24-63.602 0-87.602s-63.602-24-87.602 0l-168 168c-24 24-24 63.602 0 87.602l168 168c12 12 27.602 18 44.398 18 15.602 0 31.199-6 44.398-18 24-24 24-63.602 0-87.602l-62.398-62.398h716.4l-62.398 62.398c-24 24-24 63.602 0 87.602 12 12 27.602 18 44.398 18 16.801 0 31.199-6 44.398-18l168-168c21.609-24.004 21.609-62.402-2.3906-87.602z" fill="currentColor"/>`
                        : svg`<path d="m732 878.4-66 66v-690l66 66c13.199 13.199 30 19.199 46.801 19.199s33.602-6 46.801-19.199c26.398-26.398 26.398-67.199 0-93.602l-178.8-178.8c-25.199-24-68.402-24-93.602 0l-178.8 180c-26.398 26.398-26.398 67.199 0 93.602 26.398 26.398 67.199 25.199 93.602 0l66-66v690l-66-67.203c-26.398-26.398-67.199-26.398-93.602 0-26.398 26.398-26.398 67.199 0 93.602l178.8 178.8c13.199 13.199 30 19.199 46.801 19.199s33.602-6 46.801-19.199l178.8-178.8c26.398-26.398 26.398-67.199 0-93.602-25.203-26.398-67.203-26.398-93.602 0z" fill="currentColor"/>`}
                    </svg>
                    <span class="btn-text">${this.fieldOrientation === 'horizontal' ? 'Horizontal' : 'Vertical'} Pitch</span>
                    <span class="caret ${this._fieldMenuOpen ? 'open' : ''}"></span>
                  </button>
                  ${this._fieldMenuOpen ? html`
                    <div id="field-orientation-menu" role="menu" aria-label="Pitch orientation"
                         @keydown="${this.#onFieldMenuKeyDown}">
                      <button role="menuitem"
                              @click="${() => this.#requestOrientation('horizontal')}">
                        <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14">
                          <path d="m1152 555.6-168-168c-24-24-63.602-24-87.602 0s-24 63.602 0 87.602l62.398 62.398h-716.4l62.398-62.398c24-24 24-63.602 0-87.602s-63.602-24-87.602 0l-168 168c-24 24-24 63.602 0 87.602l168 168c12 12 27.602 18 44.398 18 15.602 0 31.199-6 44.398-18 24-24 24-63.602 0-87.602l-62.398-62.398h716.4l-62.398 62.398c-24 24-24 63.602 0 87.602 12 12 27.602 18 44.398 18 16.801 0 31.199-6 44.398-18l168-168c21.609-24.004 21.609-62.402-2.3906-87.602z" fill="currentColor"/>
                        </svg>
                        Horizontal Pitch
                      </button>
                      <button role="menuitem"
                              @click="${() => this.#requestOrientation('vertical')}">
                        <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14">
                          <path d="m732 878.4-66 66v-690l66 66c13.199 13.199 30 19.199 46.801 19.199s33.602-6 46.801-19.199c26.398-26.398 26.398-67.199 0-93.602l-178.8-178.8c-25.199-24-68.402-24-93.602 0l-178.8 180c-26.398 26.398-26.398 67.199 0 93.602 26.398 26.398 67.199 25.199 93.602 0l66-66v690l-66-67.203c-26.398-26.398-67.199-26.398-93.602 0-26.398 26.398-26.398 67.199 0 93.602l178.8 178.8c13.199 13.199 30 19.199 46.801 19.199s33.602-6 46.801-19.199l178.8-178.8c26.398-26.398 26.398-67.199 0-93.602-25.203-26.398-67.203-26.398-93.602 0z" fill="currentColor"/>
                        </svg>
                        Vertical Pitch
                      </button>
                    </div>
                  ` : nothing}
                </div>
              ` : nothing}
            </div>
            <div class="bottom-right">
              <button class="icon-btn" aria-label="Share Board" title="Share Board"
                      @click="${() => this._share.triggerShare()}">
                <svg class="icon" viewBox="0 0 1200 1200" width="18" height="18" fill="currentColor">
                  <path d="m12.141 1065.2c24.141-696.05 564.37-780.94 692.44-791.29l0.09375-140.06c0.09375-6.2344 2.1562-12.469 6.5156-17.672 9.75-11.578 27.094-13.078 38.672-3.3281l428.06 360.14c1.3125 1.0781 2.5312 2.25 3.6562 3.6094 9.75 11.578 8.25 28.922-3.3281 38.672l-426.32 358.69c-5.0156 5.1094-12 8.2969-19.688 8.2969-15.234 0-27.562-12.328-27.562-27.562v-157.26c-509.53-48.328-632.9 356.81-638.39 375.56-3.1406 12.141-14.344 20.953-27.422 20.531-15.141-0.46875-27.094-13.125-26.625-28.312z" fill-rule="evenodd"/>
                </svg>
              </button>
            </div>
        </div><!-- .bottom-bar -->
      `}
      <input type="file" accept=".svg,image/svg+xml" class="visually-hidden" id="svg-import-input"
             tabindex="-1" aria-label="Import SVG file"
             @change="${this.#onFileSelected}" />

      <cb-dialogs
        .viewMode="${this._viewMode}"
        .animationFrameCount="${this.animationFrames.length}"
        .userTemplates="${this._userTemplates}"
        @cb-import-confirm="${this.#confirmImport}"
        @cb-save-board-confirm="${this.#confirmSaveBoard}"
        @cb-save-board-skip="${this.#skipSaveBoard}"
        @cb-save-board-closed="${this.#onSaveBoardClosed}"
        @cb-new-board-confirm="${this.#confirmNewBoard}"
        @cb-confirm-delete-board="${this.#confirmDeleteBoard}"
        @cb-confirm-delete-template="${this.#onConfirmDeleteTemplate}"
        @cb-export-svg="${this.#exportSvg}"
        @cb-export-png="${this.#exportPng}"
        @cb-export-gif="${this.#exportGif}"
        @cb-print-confirm="${this.#handlePrint}"
      ></cb-dialogs>

      <cb-share
        .players="${this.players}"
        .lines="${this.lines}"
        .equipment="${this.equipment}"
        .shapes="${this.shapes}"
        .textItems="${this.textItems}"
        .animationFrames="${this.animationFrames}"
        .fieldTheme="${this.fieldTheme}"
        .fieldOrientation="${this.fieldOrientation}"
        .pitchType="${this.pitchType}"
        .boardName="${this._boardName}"
        .playbackLoop="${this._playbackLoop}"
        .svgEl="${this._field?.svgEl ?? null}"
      ></cb-share>
      </div><!-- .app-board -->
      </div><!-- .app-wrap -->

      <!-- position:fixed elements must live OUTSIDE .app-wrap — the transform on
           .app-wrap creates a new containing block, so anything fixed inside it
           is positioned relative to .app-wrap, not the viewport. -->
      <div class="rotate-overlay" aria-hidden="true">
        <svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg">
          <path d="M880.71 163.3V163.32L740.23 163.16L738.09 127.98L882.89 128L880.71 163.3ZM106.9 438.69H106.88L105.81 458.31L105.78 459.55L105.99 479.2C106.11 489.65 114.67 498.03 125.12 497.92C135.5 497.81 143.84 489.35 143.84 479L143.63 459.77L144.64 441.37L146.85 423.11L150.26 405.01L154.85 387.19L160.6 369.72L167.5 352.63L175.49 336.07L184.57 320.03L194.67 304.65L205.76 289.97L217.8 276.04L230.73 262.93L244.27 250.89L258.55 239.75L273.53 229.55L289.13 220.35L305.29 212.18L321.96 205.07L339.06 199.05L356.5 194.15L374.21 190.39L392.15 187.78L409.75 186.38L388.69 203.43C384.01 207.22 381.58 212.76 381.58 218.35C381.58 222.59 382.98 226.86 385.86 230.41C392.52 238.64 404.61 239.91 412.84 233.25L475.4 182.59C479.9 178.95 482.51 173.47 482.53 167.68V167.59C482.53 161.81 479.9 156.42 475.4 152.77L413.16 102.35C404.93 95.68 392.85 96.95 386.18 105.18C383.3 108.73 381.9 113 381.9 117.25C381.9 122.84 384.33 128.38 389.01 132.17L409.17 148.5H409.04L407.82 148.56L388.53 150.1L387.31 150.24L368.17 153.02L366.96 153.24L348.04 157.26L346.85 157.55L328.23 162.78L327.06 163.15L308.81 169.58L307.67 170.03L289.88 177.62L288.77 178.14L271.51 186.87L270.44 187.46L253.78 197.29L252.74 197.95L236.75 208.83L235.76 209.55L220.51 221.45L219.57 222.23L205.11 235.09L204.22 235.94L190.42 249.93L189.58 250.84L176.73 265.71L175.95 266.68L164.1 282.36L163.39 283.38L152.6 299.81L151.95 300.87L142.27 317.97L141.69 319.07L133.15 336.77L132.64 337.91L125.28 356.13L124.85 357.3L118.71 375.97L118.36 377.17L113.45 396.2L113.18 397.41L109.54 416.72L109.35 417.95L106.98 437.46L106.93 438.7H106.88H106.9V438.69ZM1034.12 127.99H1035.01C1048.17 128.42 1058.72 139.24 1058.72 152.52V850.85L562.25 850.87V152.52C562.25 139.24 572.79 128.42 585.96 127.99L699.84 128.01L703.25 183.42C703.87 193.49 712.21 201.33 722.3 201.33L898.64 201.38C908.72 201.36 917.06 193.52 917.69 183.46L921.13 127.99H1034.12ZM165.32 878.25V878.27L130.31 880.29L130.22 735.5L165.38 737.71V737.73L165.32 878.26V878.25ZM810.51 955.19H810.54C821.5 955.19 830.33 964.07 830.33 975.02C830.33 985.97 821.45 994.85 810.5 994.85C799.55 994.85 790.67 985.97 790.67 975.02C790.67 964.07 799.52 955.19 810.47 955.19H810.52H810.51ZM810.5 916.95H810.46C778.39 916.95 752.43 942.95 752.43 975.02C752.43 1007.09 778.42 1033.08 810.49 1033.08C842.56 1033.08 868.56 1007.08 868.56 975.02C868.56 942.96 842.59 916.95 810.52 916.95H810.5ZM1058.75 1031.75V1031.8C1058.75 1045.02 1048.2 1056.26 1035.04 1056.28L585.98 1056.3C572.82 1055.87 562.26 1045.04 562.26 1031.76V889.07L1058.74 889.11V1031.75H1058.75ZM153.36 521.44V521.46C153.47 521.44 153.36 521.44 153.36 521.44C121.46 522.14 95.39 546.56 92.24 577.77V577.84C92.01 580 91.87 1031.59 91.87 1031.59C91.87 1055.47 105.03 1076.19 124.65 1086.81L124.74 1086.86C133.33 1091.56 143.14 1094.56 153.58 1094.56L481.57 1094.36C492.12 1094.36 500.68 1085.81 500.68 1075.26C500.68 1064.71 492.23 1056.26 481.77 1056.16C481.51 1056.16 154.65 1056.16 154.65 1056.16C150.38 1056.16 146.37 1055.07 142.87 1053.15L142.82 1053.12C135.64 1049 130.71 1041.43 130.42 1032.66L130.35 918.55L185.58 915.17C195.64 914.55 203.48 906.22 203.5 896.15C203.5 896.06 203.57 719.78 203.57 719.78C203.57 709.7 195.73 701.35 185.67 700.73L130.22 697.28L130.29 581.75C131.64 569.45 142.04 559.9 154.67 559.89L481.58 559.71C492.13 559.69 500.69 551.14 500.69 540.59C500.69 530.04 492.14 521.48 481.58 521.48H153.36V521.5V521.47V521.44ZM586.84 89.74H586.79C552.59 89.74 524.79 117.08 524.04 151.11V1033.18C524.81 1067.22 552.62 1094.56 586.81 1094.56H1034.2C1068.39 1094.54 1096.21 1067.2 1096.96 1033.17V151.11C1096.19 117.07 1068.38 89.73 1034.19 89.73H586.84V89.74Z" fill="white"/>
        </svg>
      </div>

      <!-- Side sheets: must live OUTSIDE .app-wrap for the same reason -->
      <cb-side-sheet
        ?open="${this._myBoardsOpen}"
        heading="My Boards"
        @close="${() => { this._myBoardsOpen = false; }}">
        <cb-my-boards
          .boards="${this._myBoards}"
          .userTemplates="${this._userTemplates}"
          .authUser="${this._authUser}"
          @cb-open-board="${this.#onOpenBoard}"
          @cb-rename-board="${this.#onRenameBoard}"
          @cb-duplicate-board="${this.#onDuplicateBoard}"
          @cb-handle-delete-board="${this.#onHandleDeleteBoard}"
          @cb-import-svg="${this.#importSvgFromMyBoards}"
          @cb-export-all-boards="${this.#exportAllBoards}"
          @cb-use-template="${this.#onUseTemplate}"
          @cb-duplicate-template="${this.#onDuplicateTemplate}"
          @cb-rename-template="${this.#onRenameTemplate}"
          @cb-export-board="${this.#onExportBoard}"
          @cb-export-template="${this.#onExportTemplate}"
          @cb-handle-delete-template="${this.#onHandleDeleteTemplate}"
          @cb-open-settings="${() => this.#showSettings()}">
        </cb-my-boards>
      </cb-side-sheet>

      <cb-side-sheet
        ?open="${this._boardSummaryOpen}"
        heading="Board Summary"
        @close="${() => { this._boardSummaryOpen = false; this.#saveToStorage(); }}">
        <cb-board-summary
          .summary="${this._boardSummaryData}"
          .boardNotes="${this._boardNotes}"
          @cb-board-notes-input="${this.#onBoardNotesInput}"
          @cb-board-summary-save="${() => { this._boardSummaryOpen = false; this.#saveToStorage(); }}">
        </cb-board-summary>
      </cb-side-sheet>

      <cb-side-sheet
        ?open="${this._settingsOpen}"
        heading="Settings"
        @close="${() => { this._settingsOpen = false; }}">
        <div class="settings-content">
          <div class="settings-section">
            <h3 class="settings-section-heading">Units</h3>
            <label class="settings-field-label" for="settings-distance-unit">Distance</label>
            <select id="settings-distance-unit" class="settings-select"
                    aria-describedby="settings-distance-hint"
                    @change="${(e: Event) => this.#setMeasureUnit((e.target as HTMLSelectElement).value as 'm' | 'yd')}">
              <option value="m" ?selected="${this._measureUnit === 'm'}">Meters (m)</option>
              <option value="yd" ?selected="${this._measureUnit === 'yd'}">Yards (yd)</option>
            </select>
            <p id="settings-distance-hint" class="settings-hint">Applies to the Measure tool.</p>
          </div>

          <div class="settings-section">
            <h3 class="settings-section-heading">Cloud Backup</h3>
            <div role="status" aria-live="polite" aria-atomic="false">
              ${this._authUser ? html`
                <div class="settings-account-row">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M20 16.5A4.5 4.5 0 0 0 15.5 12H14a6 6 0 1 0-6 6h8a4.5 4.5 0 0 0 4-1.5z"/>
                    <polyline points="9 12 11 14 15 10"/>
                  </svg>
                  <div>
                    <div class="settings-account-email">${this._authUser.email}</div>
                    <p class="settings-hint settings-hint--mt">
                      Boards and templates are backed up automatically.
                    </p>
                  </div>
                </div>
                <button class="settings-account-btn settings-account-btn--signout"
                        @click="${() => signOut()}">
                  Sign out
                </button>
              ` : html`
                <p class="settings-hint">
                  Sign in to back up your boards and templates to the cloud.
                </p>
                <button class="settings-account-btn" @click="${() => openSignIn()}">
                  Sign in
                </button>
              `}
            </div>
          </div>
        </div>
      </cb-side-sheet>

      ${this._updateAvailable ? html`
        <div class="update-toast ${this._toastDismissing ? 'toast-dismissing' : ''}"
             role="status" aria-live="polite" aria-atomic="true">
          <svg viewBox="0 0 1200 1200" width="18" height="18" fill="currentColor">
            <path d="m855.52 688.45c-248.88-56.199-287.43-94.75-343.62-343.62-2.5742-11.375-12.699-19.477-24.398-19.477s-21.824 8.1016-24.398 19.477c-56.227 248.88-94.75 287.43-343.62 343.62-11.398 2.6016-19.5 12.699-19.5 24.398 0 11.699 8.1016 21.801 19.5 24.398 248.88 56.227 287.4 94.773 343.62 343.62 2.5742 11.375 12.699 19.477 24.398 19.477s21.824-8.1016 24.398-19.477c56.227-248.85 94.75-287.4 343.62-343.62 11.398-2.6016 19.477-12.699 19.477-24.398 0-11.699-8.1016-21.801-19.477-24.398z"/>
            <path d="m1080.5 300.98c-132.3-29.875-150.88-48.449-180.75-180.73-2.6016-11.398-12.699-19.477-24.398-19.477s-21.801 8.0742-24.398 19.477c-29.875 132.27-48.449 150.85-180.73 180.73-11.398 2.6016-19.477 12.699-19.477 24.398s8.0742 21.801 19.477 24.398c132.27 29.875 150.85 48.449 180.73 180.75 2.6016 11.375 12.699 19.477 24.398 19.477s21.801-8.1016 24.398-19.477c29.875-132.3 48.449-150.88 180.75-180.75 11.375-2.6016 19.477-12.699 19.477-24.398s-8.1016-21.801-19.477-24.398z"/>
          </svg>
          <span>A new version of CoachingBoard is available.</span>
          <button class="dismiss-btn" ?disabled="${this._toastDismissing}"
                  @click="${() => {
                    this._toastDismissing = true;
                    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
                    setTimeout(() => { this._updateAvailable = false; this._toastDismissing = false; }, delay);
                  }}">Dismiss</button>
          <button class="refresh-btn" @click="${() => this.#updateSW?.(true)}">Refresh</button>
        </div>
      ` : nothing}
    `;
  }

  #onTextUpdate(e: TextUpdateEvent) {
    this.#pushUndo();
    const idSet = new Set(e.textIds);
    this.textItems = this.textItems.map(t =>
      idSet.has(t.id) ? { ...t, ...e.changes } : t
    );
  }

  #onAlignItems(e: AlignItemsEvent) {
    const ids = this.selectedIds;
    if (ids.size < 2) return;

    interface ItemPos { id: string; x: number; y: number }
    const items: ItemPos[] = [];

    for (const p of this.players) if (ids.has(p.id)) items.push({ id: p.id, x: p.x, y: p.y });
    for (const eq of this.equipment) if (ids.has(eq.id)) items.push({ id: eq.id, x: eq.x, y: eq.y });
    for (const s of this.shapes) if (ids.has(s.id)) items.push({ id: s.id, x: s.cx, y: s.cy });
    for (const t of this.textItems) if (ids.has(t.id)) items.push({ id: t.id, x: t.x, y: t.y });
    for (const l of this.lines) if (ids.has(l.id)) items.push({ id: l.id, x: (l.x1 + l.x2) / 2, y: (l.y1 + l.y2) / 2 });

    if (items.length < 2) return;

    const deltas = new Map<string, { dx: number; dy: number }>();
    const action: AlignAction = e.action;

    if (action === 'distribute-h' || action === 'distribute-v') {
      if (items.length < 3) return;
      const axis = action === 'distribute-h' ? 'x' : 'y';
      const sorted = [...items].sort((a, b) => a[axis] - b[axis]);
      const first = sorted[0][axis];
      const last = sorted[sorted.length - 1][axis];
      const step = (last - first) / (sorted.length - 1);
      for (let i = 0; i < sorted.length; i++) {
        const target = first + step * i;
        const d = target - sorted[i][axis];
        if (axis === 'x') deltas.set(sorted[i].id, { dx: d, dy: 0 });
        else deltas.set(sorted[i].id, { dx: 0, dy: d });
      }
    } else {
      let target: number;
      const xs = items.map(i => i.x);
      const ys = items.map(i => i.y);
      switch (action) {
        case 'left':     target = Math.min(...xs); break;
        case 'right':    target = Math.max(...xs); break;
        case 'center-h': target = xs.reduce((a, b) => a + b, 0) / xs.length; break;
        case 'top':      target = Math.min(...ys); break;
        case 'bottom':   target = Math.max(...ys); break;
        case 'center-v': target = ys.reduce((a, b) => a + b, 0) / ys.length; break;
      }
      const isX = action === 'left' || action === 'right' || action === 'center-h';
      for (const item of items) {
        const d = target - (isX ? item.x : item.y);
        deltas.set(item.id, isX ? { dx: d, dy: 0 } : { dx: 0, dy: d });
      }
    }

    this.#pushUndo();
    this.players = this.players.map(p => {
      const d = deltas.get(p.id);
      return d ? { ...p, x: p.x + d.dx, y: p.y + d.dy } : p;
    });
    this.equipment = this.equipment.map(eq => {
      const d = deltas.get(eq.id);
      return d ? { ...eq, x: eq.x + d.dx, y: eq.y + d.dy } : eq;
    });
    this.shapes = this.shapes.map(s => {
      const d = deltas.get(s.id);
      return d ? { ...s, cx: s.cx + d.dx, cy: s.cy + d.dy } : s;
    });
    this.textItems = this.textItems.map(t => {
      const d = deltas.get(t.id);
      return d ? { ...t, x: t.x + d.dx, y: t.y + d.dy } : t;
    });
    this.lines = this.lines.map(l => {
      const d = deltas.get(l.id);
      return d ? { ...l, x1: l.x1 + d.dx, y1: l.y1 + d.dy, x2: l.x2 + d.dx, y2: l.y2 + d.dy, cx: l.cx + d.dx, cy: l.cy + d.dy } : l;
    });
  }

  #onGroupItems(_e: GroupItemsEvent) {
    const ids = this.selectedIds;
    if (ids.size < 2) return;
    this.#pushUndo();
    const gid = uid('group');
    this.players = this.players.map(p => ids.has(p.id) ? { ...p, groupId: gid } : p);
    this.equipment = this.equipment.map(eq => ids.has(eq.id) ? { ...eq, groupId: gid } : eq);
    this.shapes = this.shapes.map(s => ids.has(s.id) ? { ...s, groupId: gid } : s);
    this.textItems = this.textItems.map(t => ids.has(t.id) ? { ...t, groupId: gid } : t);
    this.lines = this.lines.map(l => ids.has(l.id) ? { ...l, groupId: gid } : l);
  }

  #onUngroupItems(_e: UngroupItemsEvent) {
    const ids = this.selectedIds;
    if (ids.size === 0) return;
    this.#pushUndo();
    this.players = this.players.map(p => ids.has(p.id) ? { ...p, groupId: undefined } : p);
    this.equipment = this.equipment.map(eq => ids.has(eq.id) ? { ...eq, groupId: undefined } : eq);
    this.shapes = this.shapes.map(s => ids.has(s.id) ? { ...s, groupId: undefined } : s);
    this.textItems = this.textItems.map(t => ids.has(t.id) ? { ...t, groupId: undefined } : t);
    this.lines = this.lines.map(l => ids.has(l.id) ? { ...l, groupId: undefined } : l);
  }

  #onZOrder(e: ZOrderEvent) {
    const ids = this.selectedIds;
    if (ids.size === 0) return;
    this.#pushUndo();
    const reorder = <T extends { id: string }>(arr: T[], toFront: boolean): T[] => {
      const sel = arr.filter(i => ids.has(i.id));
      const rest = arr.filter(i => !ids.has(i.id));
      return toFront ? [...rest, ...sel] : [...sel, ...rest];
    };
    const front = e.direction === 'front';
    this.players   = reorder(this.players, front);
    this.equipment = reorder(this.equipment, front);
    this.lines     = reorder(this.lines, front);
    this.shapes    = reorder(this.shapes, front);
    this.textItems = reorder(this.textItems, front);
  }

  #expandSelectionToGroups(ids: Set<string>): Set<string> {
    const groupIds = new Set<string>();
    const allItems = [
      ...this.players, ...this.equipment, ...this.shapes,
      ...this.textItems, ...this.lines,
    ];
    for (const item of allItems) {
      if (ids.has(item.id) && item.groupId) groupIds.add(item.groupId);
    }
    if (groupIds.size === 0) return ids;
    const expanded = new Set(ids);
    for (const item of allItems) {
      if (item.groupId && groupIds.has(item.groupId)) expanded.add(item.id);
    }
    return expanded;
  }

  #onShapeUpdate(e: ShapeUpdateEvent) {
    this.#pushUndo();
    const idSet = new Set(e.shapeIds);
    this.shapes = this.shapes.map(s =>
      idSet.has(s.id) ? { ...s, ...e.changes } : s
    );
  }

  // ── Hamburger menu ────────────────────────────────────────────

  #toggleMenu() {
    this._menuOpen = !this._menuOpen;
    if (this._menuOpen) {
      this.updateComplete.then(() => {
        const first = this.renderRoot.querySelector('.menu-nav button') as HTMLElement | null;
        first?.focus({ preventScroll: true });
      });
    }
  }

  #showAbout() {
    this._menuOpen = false;
    this._dialogs?.showAbout();
  }

  #showSaveBoard() {
    this._menuOpen = false;
    this.#pendingOpenBoardId = null;
    const name = this.#currentBoard?.name === 'Untitled Board' ? '' : (this.#currentBoard?.name ?? '');
    this._dialogs?.openSaveBoard(name, null);
  }

  #handleSaveAs() {
    this._menuOpen = false;
    this.#pendingOpenBoardId = null;
    this._dialogs?.openSaveBoard(`Copy of ${this.#currentBoard?.name ?? 'Untitled Board'}`, 'save-as');
  }

  async #openNewBoardDialog() {
    this._userTemplates = await listUserTemplates();
    this._dialogs?.openNewBoard();
  }

  #skipSaveBoard(e: CustomEvent<{ pendingAction: PendingBoardAction }>) {
    const pendingAction = e.detail.pendingAction;
    const pendingId = this.#pendingOpenBoardId;
    this._dialogs?.closeSaveBoard();
    if (pendingAction === 'new') {
      const tmpl = this.#pendingTemplateApply;
      this.#pendingTemplateApply = null;
      tmpl ? this.#applyUserTemplate(tmpl) : this.#openNewBoardDialog();
    } else if (pendingAction === 'open') {
      this.#doOpenBoard(pendingId!);
    }
  }

  async #confirmSaveBoard(e: CustomEvent<{ name: string; pendingAction: PendingBoardAction; saveAsTemplate: boolean }>) {
    const name = e.detail.name.trim();
    if (!name || !this.#currentBoard) return;
    const pendingAction = e.detail.pendingAction;
    const pendingId = this.#pendingOpenBoardId;
    this._dialogs?.closeSaveBoard();

    const thumbnail = await this.#generateThumbnail();

    if (e.detail.saveAsTemplate) {
      // Either/or: save as template only — do NOT add to Saved Boards
      const tmpl: UserTemplate = {
        id: crypto.randomUUID(),
        name,
        pitchType: this.#currentBoard.pitchType,
        createdAt: Date.now(),
        players: structuredClone(this.players),
        lines: structuredClone(this.lines),
        equipment: structuredClone(this.equipment),
        shapes: structuredClone(this.shapes),
        textItems: structuredClone(this.textItems),
        thumbnail: thumbnail ?? this.#currentBoard.thumbnail,
      };
      await saveUserTemplate(tmpl);
      this.#cloudSaveTemplate(tmpl);
      this._userTemplates = await listUserTemplates();
      // Continue pending navigation; don't rename the working board
      if (pendingAction === 'new') {
        const pendingTmpl = this.#pendingTemplateApply;
        this.#pendingTemplateApply = null;
        pendingTmpl ? this.#applyUserTemplate(pendingTmpl) : this.#openNewBoardDialog();
      } else if (pendingAction === 'open') {
        this.#doOpenBoard(pendingId!);
      }
      return;
    }

    if (pendingAction === 'save-as') {
      const newBoard: SavedBoard = {
        ...this.#currentBoard,
        id: crypto.randomUUID(),
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        players: structuredClone(this.players),
        lines: structuredClone(this.lines),
        equipment: structuredClone(this.equipment),
        shapes: structuredClone(this.shapes),
        textItems: structuredClone(this.textItems),
        animationFrames: structuredClone(this.animationFrames),
        notes: this._boardNotes || undefined,
        thumbnail: thumbnail ?? this.#currentBoard.thumbnail,
      };
      saveBoard(newBoard).catch(() => {});
      this.#cloudSaveBoard(newBoard);
      this.#currentBoard = newBoard;
      this._boardName = name;
      setActiveBoardId(newBoard.id);
    } else {
      this.#currentBoard = { ...this.#currentBoard, name, ...(thumbnail && { thumbnail }) };
      this._boardName = name;
      saveBoard(this.#currentBoard).catch(() => {});
      this.#cloudSaveBoard(this.#currentBoard);
      if (pendingAction === 'new') {
        const pendingTmpl = this.#pendingTemplateApply;
        this.#pendingTemplateApply = null;
        pendingTmpl ? this.#applyUserTemplate(pendingTmpl) : this.#openNewBoardDialog();
      } else if (pendingAction === 'open') {
        this.#doOpenBoard(pendingId!);
      }
    }
  }

  #getBoardSummary() {
    const allPlayerColors = [...PLAYER_COLORS, ...PLAYER_COLORS_WHITE];
    const allConeColors = [...CONE_COLORS, ...CONE_COLORS_WHITE];

    const playersByColor = new Map<string, number>();
    let coachCount = 0;
    for (const p of this.players) {
      const name = allPlayerColors.find(c => c.color === p.color)?.name ?? 'Other';
      playersByColor.set(name, (playersByColor.get(name) ?? 0) + 1);
    }

    const equipByKind = new Map<string, number>();
    const conesByColor = new Map<string, number>();
    const dummiesByColor = new Map<string, number>();
    const polesByColor = new Map<string, number>();
    for (const e of this.equipment) {
      if (e.kind === 'coach') {
        coachCount++;
      } else if (e.kind === 'cone') {
        const name = allConeColors.find(c => c.color === (e.color ?? COLORS.coneNeonOrange))?.name ?? 'Other';
        conesByColor.set(name, (conesByColor.get(name) ?? 0) + 1);
      } else if (e.kind === 'dummy') {
        const name = allConeColors.find(c => c.color === (e.color ?? COLORS.coneChartreuse))?.name ?? 'Other';
        dummiesByColor.set(name, (dummiesByColor.get(name) ?? 0) + 1);
      } else if (e.kind === 'pole') {
        const name = allConeColors.find(c => c.color === (e.color ?? COLORS.coneChartreuse))?.name ?? 'Other';
        polesByColor.set(name, (polesByColor.get(name) ?? 0) + 1);
      } else {
        const label = e.kind === 'ball' ? 'Ball' : e.kind === 'goal' ? 'Goal' : e.kind === 'mini-goal' ? 'Mini Goal' : 'Pop-up Goal';
        equipByKind.set(label, (equipByKind.get(label) ?? 0) + 1);
      }
    }

    const linesByStyle = new Map<string, number>();
    for (const l of this.lines) {
      const hasArrow = l.arrowStart || l.arrowEnd;
      const style = l.style === 'solid' ? 'Pass/Shoot' : l.style === 'dashed' ? 'Run' : 'Dribble';
      const label = `${style}${hasArrow ? ' w/ Arrow' : ''}`;
      linesByStyle.set(label, (linesByStyle.get(label) ?? 0) + 1);
    }

    const shapesByKind = new Map<string, number>();
    for (const sh of this.shapes) {
      const label = sh.kind === 'rect' ? 'Rectangle' : 'Ellipse';
      shapesByKind.set(label, (shapesByKind.get(label) ?? 0) + 1);
    }

    const pitchLabel = this.pitchType === 'half' ? 'Half Pitch (Def.)'
      : this.pitchType === 'half-attack' ? 'Half Pitch (Att.)'
      : this.pitchType === 'open' ? 'Open Grass'
      : 'Full Pitch';

    return {
      name: this._boardName || 'Untitled Board',
      pitchLabel,
      orientation: this.fieldOrientation === 'vertical' ? 'Vertical' : 'Horizontal',
      playersByColor,
      coachCount,
      equipByKind,
      conesByColor,
      dummiesByColor,
      polesByColor,
      linesByStyle,
      shapesByKind,
      textCount: this.textItems.length,
      frameCount: this.animationFrames.length,
    };
  }

  #showBoardSummary() {
    this._menuOpen = false;
    this._boardSummaryData = this.#getBoardSummary();
    this._boardSummaryOpen = true;
  }

  #showSettings() {
    this._menuOpen = false;
    this._settingsOpen = true;
  }

  #setMeasureUnit(unit: 'm' | 'yd') {
    this._measureUnit = unit;
    localStorage.setItem('cb-measure-unit', unit);
  }

  #showPrintDialog() {
    this._menuOpen = false;
    this._dialogs?.showPrint();
  }

  #handlePrint(e: CustomEvent<{ printSummary: boolean; printWhiteBg: boolean }>) {
    this._dialogs?.closePrint();
    const { printSummary, printWhiteBg } = e.detail;
    this.#isPrinting = true;
    this.#cachedSummary = this.#getBoardSummary();
    const host = this as unknown as HTMLElement;
    const savedTheme = this.fieldTheme;
    const savedTransform = this._viewTransform;
    this._viewTransform = { x: 0, y: 0, scale: 1 };
    if (printSummary) host.classList.add('print-summary');
    if (printWhiteBg) {
      host.classList.add('print-white-bg');
      this.fieldTheme = 'white';
    }

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      host.classList.remove('print-summary', 'print-white-bg');
      if (printWhiteBg) this.fieldTheme = savedTheme;
      this._viewTransform = savedTransform;
      this.#isPrinting = false;
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(() => {
      window.print();
      setTimeout(cleanup, 2000);
    }, 100);
  }

  #showExportDialog() {
    this._menuOpen = false;
    this._dialogs?.showExport();
  }

  #exportSvg() { this._dialogs?.closeExport(); this.#saveSvg(); }
  #exportPng() { this._dialogs?.closeExport(); this.#savePng(); }
  #exportGif() { this._dialogs?.closeExport(); this.#saveGif(); }

  #handleNewBoard() {
    this._menuOpen = false;
    if (!this.#isBoardSaved && !this.#isBoardEmpty) {
      this._dialogs?.openSaveBoard('', 'new');
      return;
    }
    if (this.#isBoardEmpty && !this.#isBoardSaved && this.#currentBoard) {
      deleteBoard(this.#currentBoard.id).catch(() => {});
    }
    this.#openNewBoardDialog();
  }

  async #confirmNewBoard(e: CustomEvent<{ pitchType: PitchType; template: string }>) {
    this._dialogs?.closeNewBoard();
    const { pitchType, template: templateId } = e.detail;
    const board = createEmptyBoard('Untitled Board', pitchType);
    await saveBoard(board);
    this.#currentBoard = board;
    this._boardName = board.name;
    setActiveBoardId(board.id);

    // User templates are prefixed with "user:" to distinguish from built-in IDs
    const isUserTemplate = templateId.startsWith('user:');
    const userTmplId = isUserTemplate ? templateId.slice(5) : null;
    const builtInTemplate = (!isUserTemplate && templateId)
      ? getTemplatesForPitch(pitchType).find(t => t.id === templateId)
      : null;
    const userTemplate = userTmplId
      ? this._userTemplates.find(t => t.id === userTmplId)
      : null;
    const template = builtInTemplate ?? userTemplate ?? null;

    const angleOrient = (this._isMobile && template) ? 'horizontal' : (this._isMobile ? 'vertical' : 'horizontal');
    const playerAngle = (team: string) => team === 'b'
      ? (angleOrient === 'horizontal' ? 270 : 180)
      : (angleOrient === 'horizontal' ? 90 : 0);

    this.players = template ? template.players.map(p => ({ ...p, id: uid('player'), angle: p.angle ?? playerAngle(p.team) })) : [];
    this.lines = template ? template.lines.map(l => ({ ...l, id: uid('line') })) : [];
    this.equipment = template ? template.equipment.map(e => ({ ...e, id: uid('eq') })) : [];
    this.shapes = template ? template.shapes.map(s => ({ ...s, id: uid('shape') })) : [];
    this.textItems = template ? template.textItems.map(t => ({ ...t, id: uid('text') })) : [];
    this.animationFrames = [];
    this.activeFrameIndex = 0;
    this._animationMode = false;
    this.#stopPlayback();
    this._playbackProgress = 0;
    this._playbackLoop = board.playbackLoop;
    this.selectedIds = new Set();
    this.#undoStack = [];
    this.#redoStack = [];
    this.fieldTheme = 'green';
    this.pitchType = board.pitchType;
    this._boardNotes = '';
    this.fieldOrientation = 'horizontal';
    if (this._isMobile && template) {
      this.#rotateLoadedData('vertical');
    }
    this.fieldOrientation = this._isMobile ? 'vertical' : 'horizontal';
  }

  async #showMyBoards() {
    this._menuOpen = false;
    if (this.#currentBoard && !this.#currentBoard.thumbnail && this.#currentBoard.name !== 'Untitled Board') {
      const thumb = await this.#generateThumbnail();
      if (thumb && this.#currentBoard) {
        this.#currentBoard = { ...this.#currentBoard, thumbnail: thumb };
        saveBoard(this.#currentBoard).catch(() => {});
        this.#cloudSaveBoard(this.#currentBoard);
      }
    }
    [this._myBoards, this._userTemplates] = await Promise.all([listBoards(), listUserTemplates()]);
    this._myBoardsOpen = true;
  }

  #handleOpenBoard(id: string) {
    if (id === this.#currentBoard?.id) {
      this._myBoardsOpen = false;
      return;
    }
    if (!this.#isBoardSaved && !this.#isBoardEmpty) {
      this.#pendingOpenBoardId = id;
      this._myBoardsOpen = false;
      this._dialogs?.openSaveBoard('', 'open');
      return;
    }
    if (this.#isBoardEmpty && !this.#isBoardSaved && this.#currentBoard) {
      deleteBoard(this.#currentBoard.id).catch(() => {});
    }
    this._myBoardsOpen = false;
    this.#doOpenBoard(id);
  }

  async #doOpenBoard(id: string) {
    const board = await loadBoard(id);
    if (!board) return;
    this.#currentBoard = board;
    this._boardName = board.name;
    setActiveBoardId(board.id);
    this.players = board.players;
    this.lines = board.lines;
    this.equipment = board.equipment.map(eq =>
      (eq.kind === 'cone' || eq.kind === 'dummy' || eq.kind === 'pole') && !eq.color
        ? { ...eq, color: COLORS.coneChartreuse }
        : eq
    );
    this.shapes = board.shapes;
    this.textItems = board.textItems;
    this.animationFrames = board.animationFrames;
    this._animationMode = board.animationMode;
    this._playbackLoop = board.playbackLoop;
    this.activeFrameIndex = 0;
    this.#stopPlayback();
    this._playbackProgress = 0;
    this.selectedIds = new Set();
    this.#undoStack = [];
    this.#redoStack = [];
    if (!this._isMobile) this.fieldOrientation = board.fieldOrientation;
    this.fieldTheme = board.fieldTheme;
    this.pitchType = board.pitchType ?? 'full';
    this._boardNotes = board.notes ?? '';
    const allIds = [
      ...this.players, ...this.equipment, ...this.shapes, ...this.textItems,
    ].map(i => i.id)
      .concat(this.lines.map(l => l.id))
      .concat(this.animationFrames.map(f => f.id));
    for (const aid of allIds) {
      const num = parseInt(aid.split('-').pop() ?? '0', 10);
      if (!isNaN(num)) ensureMinId(num);
    }
  }

  async #duplicateBoard(board: SavedBoard) {
    const dup: SavedBoard = {
      ...board,
      id: crypto.randomUUID(),
      name: `Copy of ${board.name}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      players: structuredClone(board.players),
      lines: structuredClone(board.lines),
      equipment: structuredClone(board.equipment),
      shapes: structuredClone(board.shapes),
      textItems: structuredClone(board.textItems),
      animationFrames: structuredClone(board.animationFrames),
    };
    await saveBoard(dup);
    this.#cloudSaveBoard(dup);
    this._myBoards = await listBoards();
  }

  #handleDeleteBoard(board: SavedBoard) {
    this.#pendingDeleteBoard = board;
    this._dialogs?.openDeleteConfirm(board.name);
  }

  async #confirmDeleteBoard() {
    if (!this.#pendingDeleteBoard) return;
    const id = this.#pendingDeleteBoard.id;
    this.#pendingDeleteBoard = null;
    this._dialogs?.closeDeleteBoard();
    await deleteBoard(id);
    this.#cloudDeleteBoard(id);
    this._myBoards = await listBoards();
    if (id === this.#currentBoard?.id) {
      await this.#confirmNewBoard(new CustomEvent('', { detail: { pitchType: 'full' as PitchType, template: '' } }));
    }
  }

  #applyUserTemplate(template: UserTemplate) {
    this.#confirmNewBoard(new CustomEvent('', {
      detail: { pitchType: template.pitchType, template: `user:${template.id}` },
    }));
  }

  #onUseTemplate(e: CustomEvent<{ template: UserTemplate }>) {
    const { template } = e.detail;
    this._myBoardsOpen = false;
    if (!this.#isBoardSaved && !this.#isBoardEmpty) {
      this.#pendingTemplateApply = template;
      this._dialogs?.openSaveBoard('', 'new');
      return;
    }
    if (this.#isBoardEmpty && !this.#isBoardSaved && this.#currentBoard) {
      deleteBoard(this.#currentBoard.id).catch(() => {});
    }
    this.#applyUserTemplate(template);
  }

  #onDuplicateTemplate(e: CustomEvent<{ template: UserTemplate }>) {
    duplicateUserTemplate(e.detail.template)
      .then(copy => { this.#cloudSaveTemplate(copy); return listUserTemplates(); })
      .then(list => { this._userTemplates = list; })
      .catch(() => {});
  }

  #onRenameTemplate(e: CustomEvent<{ template: UserTemplate; name: string }>) {
    const { template, name } = e.detail;
    renameUserTemplate(template.id, name)
      .then(() => listUserTemplates())
      .then(list => {
        this._userTemplates = list;
        const updated = list.find(t => t.id === template.id);
        if (updated) this.#cloudSaveTemplate(updated);
      })
      .catch(() => {});
  }

  #onHandleDeleteTemplate(e: CustomEvent<{ template: UserTemplate }>) {
    this.#pendingDeleteTemplate = e.detail.template;
    this._dialogs?.openDeleteTemplate(e.detail.template.name);
  }

  async #onConfirmDeleteTemplate() {
    if (!this.#pendingDeleteTemplate) return;
    const id = this.#pendingDeleteTemplate.id;
    this.#pendingDeleteTemplate = null;
    this._dialogs?.closeDeleteTemplate();
    await deleteUserTemplate(id);
    this.#cloudDeleteTemplate(id);
    this._userTemplates = await listUserTemplates();
  }

  #importSvgFromMyBoards() {
    this._myBoardsOpen = false;
    this.#importSvg();
  }

  #exportBoardData(item: SavedBoard | UserTemplate) {
    const data: Record<string, unknown> = {
      players: item.players,
      lines: item.lines,
      equipment: item.equipment,
      shapes: item.shapes,
      textItems: item.textItems,
      pitchType: item.pitchType,
    };
    if ('fieldTheme' in item) {
      data.animationFrames = item.animationFrames;
      data.fieldTheme = item.fieldTheme;
      data.fieldOrientation = item.fieldOrientation;
      data.playbackLoop = item.playbackLoop;
      if (item.notes) data.notes = item.notes;
    }
    const json = JSON.stringify(data).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105 68">\n  <desc id="coaching-board-data" data-version="${__APP_VERSION__}">${json}</desc>\n</svg>`;
    const safeName = item.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'board';
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  #onExportBoard(e: CustomEvent<{ board: SavedBoard }>) {
    this.#exportBoardData(e.detail.board);
  }

  #onExportTemplate(e: CustomEvent<{ template: UserTemplate }>) {
    this.#exportBoardData(e.detail.template);
  }

  async #exportAllBoards() {
    const boards = (await listBoards()).filter(b => b.name !== 'Untitled Board');
    if (!boards.length) return;

    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const usedNames = new Set<string>();

      for (const board of boards) {
        const json = JSON.stringify({
          players: board.players,
          lines: board.lines,
          equipment: board.equipment,
          shapes: board.shapes,
          textItems: board.textItems,
          animationFrames: board.animationFrames,
          fieldTheme: board.fieldTheme,
          fieldOrientation: board.fieldOrientation,
          pitchType: board.pitchType,
          playbackLoop: board.playbackLoop,
        }).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105 68">
  <desc id="coaching-board-data" data-version="${__APP_VERSION__}">${json}</desc>
</svg>`;
        let safeName = board.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        if (usedNames.has(safeName)) safeName = `${safeName}_${board.id.slice(0, 8)}`;
        usedNames.add(safeName);
        zip.file(`${safeName}.svg`, svgContent);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'coaching-boards.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* jszip load failure or generation error */ }
  }

  #pendingImportData: Record<string, unknown> | null = null;

  #onSaveBoardClosed() {
    this.#pendingOpenBoardId = null;
    this.#pendingTemplateApply = null;
  }

  #onOpenBoard(e: CustomEvent<{ id: string }>) {
    this.#handleOpenBoard(e.detail.id);
  }

  #onRenameBoard(e: CustomEvent<{ board: SavedBoard; name: string }>) {
    const { board, name } = e.detail;
    renameBoard(board.id, name)
      .then(() => listBoards())
      .then(list => {
        this._myBoards = list;
        if (board.id === this.#currentBoard?.id) {
          this.#currentBoard = { ...this.#currentBoard, name };
          this._boardName = name;
        }
        const updated = list.find(b => b.id === board.id);
        if (updated) this.#cloudSaveBoard(updated);
      })
      .catch(() => {});
  }

  #onDuplicateBoard(e: CustomEvent<{ board: SavedBoard }>) {
    this.#duplicateBoard(e.detail.board);
  }

  #onHandleDeleteBoard(e: CustomEvent<{ board: SavedBoard }>) {
    this.#handleDeleteBoard(e.detail.board);
  }

  #onBoardNotesInput(e: CustomEvent<{ value: string }>) {
    this._boardNotes = e.detail.value;
  }

  #importSvg() {
    this._menuOpen = false;
    if (this._fileInput) {
      this._fileInput.value = '';
      this._fileInput.type = '';
      this._fileInput.type = 'file';
    }
    this._fileInput?.click();
  }

  #onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'image/svg+xml');
      const wrapper = doc.querySelector('#coaching-board-data, desc[data-version]');
      if (!wrapper || !wrapper.textContent) {
        this._dialogs?.showImportError();
        return;
      }
      try {
        const data = JSON.parse(wrapper.textContent) as Record<string, unknown>;
        if (!Array.isArray(data.players)) {
          this._dialogs?.showImportError();
          return;
        }
        this.#pendingImportData = data;
        this._dialogs?.showImportConfirm();
      } catch {
        this._dialogs?.showImportError();
      }
    };
    reader.readAsText(file);
  }

  async #confirmImport() {
    this._dialogs?.closeImportConfirm();
    const data = this.#pendingImportData;
    if (!data) return;
    this.#pendingImportData = null;

    const board = createEmptyBoard('Imported Board');
    if (Array.isArray(data.players)) board.players = data.players as Player[];
    if (Array.isArray(data.lines)) board.lines = data.lines as Line[];
    if (Array.isArray(data.equipment)) board.equipment = data.equipment as Equipment[];
    if (Array.isArray(data.shapes)) board.shapes = data.shapes as Shape[];
    if (Array.isArray(data.textItems)) board.textItems = data.textItems as TextItem[];
    if (Array.isArray(data.animationFrames)) {
      board.animationFrames = data.animationFrames as AnimationFrame[];
      if (board.animationFrames.length > 0) board.animationMode = true;
    }
    if (typeof data.playbackLoop === 'boolean') board.playbackLoop = data.playbackLoop;
    if (data.fieldTheme === 'green' || data.fieldTheme === 'white') board.fieldTheme = data.fieldTheme;
    if (data.pitchType === 'full' || data.pitchType === 'half' || data.pitchType === 'half-attack' || data.pitchType === 'open') board.pitchType = data.pitchType;
    if (data.fieldOrientation === 'horizontal' || data.fieldOrientation === 'vertical') board.fieldOrientation = data.fieldOrientation as FieldOrientation;

    await saveBoard(board);
    this.#doOpenBoard(board.id);
  }

  #closeMenu() {
    if (!this._menuOpen) return;
    this._menuOpen = false;
    const trigger = this.renderRoot.querySelector('[aria-haspopup="true"][aria-label="Menu"]') as HTMLElement | null;
    trigger?.focus();
  }

  // ── Animation mode ────────────────────────────────────────────

  #toggleAnimationMode() {
    this._animationMode = !this._animationMode;
    if (!this._animationMode) {
      this.#stopPlayback();
      this.activeFrameIndex = 0;
      this._playbackProgress = 0;
    }
    if (this._animationMode && this.animationFrames.length === 0) {
      this.animationFrames = [{ id: uid('frame'), positions: {}, trails: {}, visibleLineIds: [] }];
      this.activeFrameIndex = 0;
    }
  }

  #stopPlayback() {
    this.isPlaying = false;
    if (this.#playbackRaf != null) {
      cancelAnimationFrame(this.#playbackRaf);
      this.#playbackRaf = null;
    }
    this.#playbackLastTime = null;
  }

  #getItemPosition(id: string, baseX: number, baseY: number): { x: number; y: number } {
    return getItemPosition(id, baseX, baseY, this.animationFrames, this.activeFrameIndex, this._animationMode);
  }

  #getItemAngle(id: string, baseAngle: number | undefined): number | undefined {
    return getItemAngle(id, baseAngle, this.animationFrames, this.activeFrameIndex, this._animationMode);
  }

  #getItemPositionAtFrame(id: string, baseX: number, baseY: number, frameIndex: number): { x: number; y: number } {
    return getItemPositionAtFrame(id, baseX, baseY, this.animationFrames, frameIndex);
  }

  #getItemAngleAtFrame(id: string, baseAngle: number | undefined, frameIndex: number): number | undefined {
    return getItemAngleAtFrame(id, baseAngle, this.animationFrames, frameIndex);
  }

  #onFrameSelect(e: FrameSelectEvent) {
    this.#stopPlayback();
    this.activeFrameIndex = e.frameIndex;
    this._playbackProgress = 0;
  }

  #onFrameAdd() {
    const newFrame: AnimationFrame = {
      id: uid('frame'),
      positions: {},
      trails: {},
      visibleLineIds: [],
    };
    this.animationFrames = [...this.animationFrames, newFrame];
    this.activeFrameIndex = this.animationFrames.length - 1;
  }

  #onFrameDelete(e: FrameDeleteEvent) {
    const idx = e.frameIndex;
    if (idx <= 0) return;
    this.animationFrames = this.animationFrames.filter((_, i) => i !== idx);
    if (this.activeFrameIndex >= this.animationFrames.length) {
      this.activeFrameIndex = this.animationFrames.length - 1;
    }
  }

  #onPlayToggle() {
    if (this.isPlaying) {
      this.#stopPlayback();
    } else {
      if (this.animationFrames.length < 2) return;
      this.isPlaying = true;
      this.selectedIds = new Set();
      this._playbackProgress = 0;
      this.activeFrameIndex = 0;
      this.#playbackLastTime = null;
      this.#playbackRaf = requestAnimationFrame(this.#playbackTick);
    }
  }

  #toggleReadonlyPlayback() {
    if (this.animationFrames.length < 2) return;
    if (this._playBtnAnim !== '') return;

    if (this.#playBtnTimeout != null) clearTimeout(this.#playBtnTimeout);

    if (this.isPlaying) {
      this.#stopPlayback();
      this._pauseFlash = true;
      this._showPlayOverlay = true;
      this._playBtnAnim = 'press-in';
      this.#playBtnTimeout = setTimeout(() => {
        this._pauseFlash = false;
        this._playBtnAnim = '';
        this.#playBtnTimeout = null;
      }, 1000);
    } else {
      this._playBtnAnim = 'press-out';
      this.#playBtnTimeout = setTimeout(() => {
        this._showPlayOverlay = false;
        this._playBtnAnim = '';
        this.#playBtnTimeout = null;
        this.isPlaying = true;
        this.selectedIds = new Set();
        this._playbackProgress = 0;
        this.activeFrameIndex = 0;
        this.#playbackLastTime = null;
        this.#playbackRaf = requestAnimationFrame(this.#playbackTick);
      }, 300);
    }
  }

  #onSpeedChange(e: SpeedChangeEvent) {
    this._playbackSpeed = e.speed;
  }

  #onLoopToggle() {
    this._playbackLoop = !this._playbackLoop;
  }

  #playbackTick = (timestamp: number) => {
    if (!this.isPlaying) return;
    if (this.#playbackLastTime == null) {
      this.#playbackLastTime = timestamp;
      this.#playbackRaf = requestAnimationFrame(this.#playbackTick);
      return;
    }
    const elapsed = timestamp - this.#playbackLastTime;
    const duration = 1000 / this._playbackSpeed;
    this._playbackProgress += elapsed / duration;
    this.#playbackLastTime = timestamp;

    if (this._playbackProgress >= 1) {
      this._playbackProgress = 0;
      const nextFrame = this.activeFrameIndex + 1;
      if (nextFrame >= this.animationFrames.length) {
        if (this._playbackLoop) {
          this.activeFrameIndex = 0;
          this.#playbackLastTime = null;
        } else {
          this.activeFrameIndex = this.animationFrames.length - 1;
          this.#stopPlayback();
          if (this._viewMode === 'readonly') {
            this._showPlayOverlay = true;
          }
          return;
        }
      } else {
        this.activeFrameIndex = nextFrame;
      }
    }
    this.#playbackRaf = requestAnimationFrame(this.#playbackTick);
  };

  // ── Field orientation ──────────────────────────────────────────

  #toggleFieldMenu(e: Event) {
    const isOpening = !this._fieldMenuOpen;
    this.#fieldMenuTrigger = e.currentTarget as HTMLElement;
    this._fieldMenuOpen = isOpening;
    if (isOpening) {
      this.updateComplete.then(() => {
        (this.renderRoot.querySelector('#field-orientation-menu [role="menuitem"]') as HTMLElement | null)?.focus();
      });
    }
  }

  #onFieldMenuKeyDown = (e: KeyboardEvent) => {
    const menu = e.currentTarget as HTMLElement;
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
    const current = items.indexOf(e.target as HTMLElement);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        items[(current + 1) % items.length]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        items[(current - 1 + items.length) % items.length]?.focus();
        break;
      case 'Home': e.preventDefault(); items[0]?.focus(); break;
      case 'End':  e.preventDefault(); items[items.length - 1]?.focus(); break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this._fieldMenuOpen = false;
        this.#fieldMenuTrigger?.focus();
        this.#fieldMenuTrigger = null;
        break;
    }
  };

  #requestOrientation(orientation: FieldOrientation) {
    this._fieldMenuOpen = false;
    if (this._viewMode === 'readonly') return;
    if (orientation === this.fieldOrientation) return;
    const hasItems = !!(this.players.length || this.lines.length || this.equipment.length || this.shapes.length || this.textItems.length || this.animationFrames.length);
    this.#applyOrientation(orientation, hasItems);
  }


  // Supports both directions, but currently only called for horizontal→vertical
  // (mobile forces vertical). Also used by #applyOrientation for manual changes.
  #rotateLoadedData(targetOrientation: FieldOrientation) {
    const oldDim = getFieldDimensions(this.fieldOrientation, this.pitchType);
    const toVertical = targetOrientation === 'vertical';

    const rotatePoint = toVertical
      ? (x: number, y: number) => ({ x: y, y: oldDim.w - x })
      : (x: number, y: number) => ({ x: oldDim.h - y, y: x });
    const angleDelta = toVertical ? -90 : 90;
    const rotateAngle = (a?: number) => (a ?? 0) + angleDelta;

    this.players = this.players.map(p => {
      const r = rotatePoint(p.x, p.y);
      return { ...p, x: r.x, y: r.y, angle: rotateAngle(p.angle) };
    });
    this.equipment = this.equipment.map(eq => {
      const r = rotatePoint(eq.x, eq.y);
      return { ...eq, x: r.x, y: r.y, angle: rotateAngle(eq.angle) };
    });
    this.shapes = this.shapes.map(s => {
      const r = rotatePoint(s.cx, s.cy);
      return { ...s, cx: r.x, cy: r.y, hw: s.hh, hh: s.hw, angle: rotateAngle(s.angle) };
    });
    this.textItems = this.textItems.map(t => {
      const r = rotatePoint(t.x, t.y);
      return { ...t, x: r.x, y: r.y, angle: rotateAngle(t.angle) };
    });
    this.lines = this.lines.map(l => {
      const r1 = rotatePoint(l.x1, l.y1);
      const r2 = rotatePoint(l.x2, l.y2);
      const rc = rotatePoint(l.cx, l.cy);
      return { ...l, x1: r1.x, y1: r1.y, x2: r2.x, y2: r2.y, cx: rc.x, cy: rc.y };
    });
    this.animationFrames = this.animationFrames.map(frame => {
      const newPositions: Record<string, FramePosition> = {};
      for (const [id, pos] of Object.entries(frame.positions)) {
        const r = rotatePoint(pos.x, pos.y);
        newPositions[id] = { x: r.x, y: r.y, angle: rotateAngle(pos.angle) };
      }
      const newTrails: Record<string, { cp1x: number; cp1y: number; cp2x: number; cp2y: number }> = {};
      for (const [id, trail] of Object.entries(frame.trails)) {
        const r1 = rotatePoint(trail.cp1x, trail.cp1y);
        const r2 = rotatePoint(trail.cp2x, trail.cp2y);
        newTrails[id] = { cp1x: r1.x, cp1y: r1.y, cp2x: r2.x, cp2y: r2.y };
      }
      return { ...frame, positions: newPositions, trails: newTrails };
    });
  }

  #applyOrientation(orientation: FieldOrientation, remap: boolean) {
    this.#pushUndo();
    if (remap) this.#rotateLoadedData(orientation);
    this.selectedIds = new Set();
    this.fieldOrientation = orientation;
    this.#saveOrientationToStorage();
  }

  #saveOrientationToStorage() {
    this.#saveToStorage();
  }

  #saveThemeToStorage() {
    this.#saveToStorage();
  }

  #onThemeChange(e: Event) {
    const newTheme = (e.target as HTMLSelectElement).value as FieldTheme;
    const oldTheme = this.fieldTheme;
    if (newTheme === oldTheme) return;
    this.#remapColors(oldTheme, newTheme);
    this.fieldTheme = newTheme;

    const playerColors = getPlayerColors(newTheme);
    const oldPlayerColors = getPlayerColors(oldTheme);
    const idx = oldPlayerColors.findIndex(c => c.color === this.playerColor);
    if (idx >= 0 && idx < playerColors.length) {
      this.playerColor = playerColors[idx].color;
    } else {
      this.playerColor = playerColors[0].color;
    }

    // Force SVG marker re-render by cycling lines
    const savedLines = this.lines;
    this.lines = [];
    this.updateComplete.then(() => { this.lines = savedLines; });

    this.#saveThemeToStorage();
  }

  #remapColors(from: FieldTheme, to: FieldTheme) {
    const fromPlayers = getPlayerColors(from);
    const toPlayers = getPlayerColors(to);
    const fromCones = getConeColors(from);
    const toCones = getConeColors(to);
    const fromLines = getLineColors(from);
    const toLines = getLineColors(to);

    const playerMap = new Map<string, string>();
    for (let i = 0; i < fromPlayers.length && i < toPlayers.length; i++) {
      playerMap.set(fromPlayers[i].color, toPlayers[i].color);
    }
    const coneMap = new Map<string, string>();
    for (let i = 0; i < fromCones.length && i < toCones.length; i++) {
      coneMap.set(fromCones[i].color, toCones[i].color);
    }
    const lineMap = new Map<string, string>();
    for (let i = 0; i < fromLines.length && i < toLines.length; i++) {
      lineMap.set(fromLines[i].color, toLines[i].color);
    }

    this.players = this.players.map(p => {
      const newColor = playerMap.get(p.color);
      return newColor ? { ...p, color: newColor } : p;
    });
    this.equipment = this.equipment.map(eq => {
      if (eq.kind === 'cone' && eq.color) {
        const newColor = coneMap.get(eq.color);
        return newColor ? { ...eq, color: newColor } : eq;
      }
      return eq;
    });
    this.lines = this.lines.map(l => {
      const color = l.color === 'white' ? COLORS.lineWhite : l.color;
      const newColor = lineMap.get(color);
      return newColor ? { ...l, color: newColor } : l;
    });
  }

  // ── Event handlers ──────────────────────────────────────────────

  #onToolChanged(e: ToolChangedEvent) {
    this.activeTool = e.tool;
    this.selectedIds = new Set();
    this.ghost = null;
    this._multiSelect = false;
    this.#lastPlacedId = null;

    if (e.playerColor) this.playerColor = e.playerColor;
    if (e.playerTeam) this.playerTeam = e.playerTeam;
    if (e.lineStyle) this.lineStyle = e.lineStyle;
    if (e.equipmentKind) this.equipmentKind = e.equipmentKind;
    if (e.shapeKind) this.shapeKind = e.shapeKind;
  }

  #onMultiSelectToggle(_e: MultiSelectToggleEvent) {
    this._multiSelect = !this._multiSelect;
    if (this._multiSelect && this.activeTool !== 'select') {
      this.activeTool = 'select';
      this.ghost = null;
    }
  }

  #onAutoNumberToggle(e: AutoNumberToggleEvent) {
    this.autoNumber = e.enabled;
  }

  #onRotateItems(e: RotateItemsEvent) {
    if (this.selectedIds.size === 0) return;
    this.#pushUndo();
    const ids = this.selectedIds;
    const delta = e.delta;

    if (this._animationMode && this.activeFrameIndex > 0) {
      const frame = this.animationFrames[this.activeFrameIndex];
      if (!frame) return;
      const newPositions = { ...frame.positions };
      for (const id of ids) {
        const base = this.players.find(p => p.id === id) ?? this.equipment.find(eq => eq.id === id);
        if (!base) continue;
        const pos = newPositions[id] ?? this.#getItemPositionAtFrame(id, base.x, base.y, this.activeFrameIndex);
        const currentAngle = this.#getItemAngleAtFrame(id, (base as { angle?: number }).angle, this.activeFrameIndex) ?? 0;
        newPositions[id] = { ...pos, angle: ((currentAngle + delta) + 360) % 360 };
      }
      this.animationFrames = this.animationFrames.map((f, i) =>
        i === this.activeFrameIndex ? { ...f, positions: newPositions } : f
      );
      return;
    }

    this.players = this.players.map(p =>
      ids.has(p.id) ? { ...p, angle: ((p.angle ?? 0) + delta + 360) % 360 } : p
    );
    this.equipment = this.equipment.map(eq => {
      if (!ids.has(eq.id)) return eq;
      if (eq.kind === 'goal' || eq.kind === 'mini-goal' || eq.kind === 'popup-goal' || eq.kind === 'dummy') {
        return { ...eq, angle: ((eq.angle ?? 0) + delta + 360) % 360 };
      }
      return eq;
    });
    this.shapes = this.shapes.map(s =>
      ids.has(s.id) ? { ...s, angle: ((s.angle ?? 0) + delta + 360) % 360 } : s
    );
    this.textItems = this.textItems.map(t =>
      ids.has(t.id) ? { ...t, angle: ((t.angle ?? 0) + delta + 360) % 360 } : t
    );
  }

  #onDeleteItems(_e: DeleteItemsEvent) {
    if (this.selectedIds.size === 0) return;
    this.#pushUndo();
    const ids = this.selectedIds;
    this.players = this.players.filter(p => !ids.has(p.id));
    this.lines = this.lines.filter(l => !ids.has(l.id));
    this.equipment = this.equipment.filter(eq => !ids.has(eq.id));
    this.shapes = this.shapes.filter(s => !ids.has(s.id));
    this.textItems = this.textItems.filter(t => !ids.has(t.id));
    this.selectedIds = new Set();
  }


  #onPlayerUpdate(e: PlayerUpdateEvent) {
    this.#pushUndo();
    const idSet = new Set(e.playerIds);
    this.players = this.players.map(p =>
      idSet.has(p.id) ? { ...p, ...e.changes } : p
    );
  }

  #onEquipmentUpdate(e: EquipmentUpdateEvent) {
    this.#pushUndo();
    const idSet = new Set(e.equipmentIds);
    this.equipment = this.equipment.map(eq =>
      idSet.has(eq.id) ? { ...eq, ...e.changes } : eq
    );
  }

  #onLineUpdate(e: LineUpdateEvent) {
    this.#pushUndo();
    const idSet = new Set(e.lineIds);
    this.lines = this.lines.map(l => {
      if (!idSet.has(l.id)) return l;
      const updated = { ...l };
      if (e.changes.style != null) updated.style = e.changes.style;
      if (e.changes.arrowStart != null) updated.arrowStart = e.changes.arrowStart;
      if (e.changes.arrowEnd != null) updated.arrowEnd = e.changes.arrowEnd;
      if (e.changes.color != null) updated.color = e.changes.color;
      return updated;
    });
  }

  #onPointerDown(e: PointerEvent) {
    // Track all active pointers — used for pinch-to-zoom
    this.#activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    // Two-finger pinch — gated on non-readonly so shared/readonly views stay
    // at the default view (zoom controls are hidden there too)
    if (this.#activePointers.size === 2 && this._viewMode !== 'readonly') {
      const pts = [...this.#activePointers.values()];
      this.#pinchStartDist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
      this.#pinchStartScale = this._viewTransform.scale;
      this.#pinchStartPan = { x: this._viewTransform.x, y: this._viewTransform.y };
      this.#panDrag = null;
      return;
    }

    if (this._viewMode === 'readonly') {
      this.#toggleReadonlyPlayback();
      return;
    }
    if (this.isPlaying) return;
    const pt = this._field.screenToSVG(e.clientX, e.clientY);

    // Pan tool — use client-pixel delta so the SVG-unit/pixel ratio stays constant
    // across the drag even as the viewBox shifts
    if (this.activeTool === 'pan') {
      const ctm = this._field.svgEl?.getScreenCTM();
      this.#panDrag = {
        startClientX: e.clientX, startClientY: e.clientY,
        startVx: this._viewTransform.x, startVy: this._viewTransform.y,
        svgPerPx: ctm ? 1 / Math.abs(ctm.a) : 1,
      };
      this._field.capturePointer(e.pointerId);
      return;
    }

    if (this.activeTool === 'add-player' || this.activeTool === 'add-equipment' || this.activeTool === 'add-text') {
      const hit = resolveHit(e.composedPath()[0]);
      if (hit && hit.id === this.#lastPlacedId) {
        this.activeTool = 'select';
        this.#lastPlacedId = null;
      } else {
        this.#pushUndo();
        if (this.activeTool === 'add-player') this.#addPlayer(pt.x, pt.y);
        else if (this.activeTool === 'add-equipment') this.#addEquipment(pt.x, pt.y);
        else this.#addTextItem(pt.x, pt.y, 'Text');
        return;
      }
    }

    if (this.activeTool === 'measure') {
      this._measureStart = { x: pt.x, y: pt.y };
      this._measureEnd = { x: pt.x, y: pt.y };
      this._field.capturePointer(e.pointerId);
      return;
    }

    if (this.activeTool === 'draw-line') {
      this._draw = { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
      this._field.capturePointer(e.pointerId);
      return;
    }

    if (this.activeTool === 'draw-shape') {
      this._shapeDraw = { kind: this.shapeKind, startX: pt.x, startY: pt.y, curX: pt.x, curY: pt.y };
      this._field.capturePointer(e.pointerId);
      return;
    }

    this._menuOpen = false;

    const hit = resolveHit(e.composedPath()[0]);
    if (!hit) {
      if (this.activeTool === 'select' && !this._isMobile) {
        this._marquee = { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
        this._field.capturePointer(e.pointerId);
        if (!isModifier(e) && !this._multiSelect) {
          this.selectedIds = new Set();
        }
      } else {
        this.selectedIds = new Set();
        // _multiSelect intentionally preserved — a miss should not exit
        // the mode; user can exit explicitly via the toolbar or Escape
      }
      return;
    }

    const { kind, id } = hit;

    // Trail control point handles
    if (kind === 'trail-cp1' || kind === 'trail-cp2') {
      this.#trailDrag = { id, cp: kind === 'trail-cp1' ? 'cp1' : 'cp2' };
      this._field.capturePointer(e.pointerId);
      return;
    }

    // Rotate handle
    if (kind === 'rotate') {
      this.#pushUndo();
      const p = this.players.find(p => p.id === id);
      const eq = this.equipment.find(eq => eq.id === id);
      const sh = this.shapes.find(s => s.id === id);
      const ti = this.textItems.find(t => t.id === id);
      let cx: number, cy: number, origRotation: number;
      if (p) {
        const pos = this.#getItemPosition(p.id, p.x, p.y);
        cx = pos.x; cy = pos.y;
        origRotation = this.#getItemAngle(p.id, p.angle) ?? 0;
      } else if (eq) {
        const pos = this.#getItemPosition(eq.id, eq.x, eq.y);
        cx = pos.x; cy = pos.y;
        origRotation = this.#getItemAngle(eq.id, eq.angle) ?? 0;
      } else if (sh) {
        cx = sh.cx; cy = sh.cy;
        origRotation = sh.angle ?? 0;
      } else {
        cx = ti!.x; cy = ti!.y;
        origRotation = ti!.angle ?? 0;
      }
      const startAngle = rad2deg(Math.atan2(pt.y - cy, pt.x - cx));
      this.#rotateDrag = { id, cx, cy, startAngle, origRotation };
      this._field.capturePointer(e.pointerId);
      return;
    }

    // Shape resize handles
    if (kind === 'shape-corner' || kind === 'shape-side') {
      this.#pushUndo();
      const target = e.composedPath()[0] as SVGElement;
      const handle = target.dataset.handle ?? 'se';
      const sh = this.shapes.find(s => s.id === id)!;
      this.#shapeResizeDrag = {
        id, handle,
        origCx: sh.cx, origCy: sh.cy,
        origHw: sh.hw, origHh: sh.hh,
        startX: pt.x, startY: pt.y,
      };
      this._field.capturePointer(e.pointerId);
      return;
    }

    // Line control-point handles: single-item only
    if (kind === 'line-start' || kind === 'line-end' || kind === 'line-control') {
      this.#pushUndo();
      this.selectedIds = new Set([id]);
      this.#handleDrag = { kind, id };
      this._field.capturePointer(e.pointerId);
      return;
    }

    // Multi-select with modifier keys or toggle mode
    const mod = isModifier(e) || this._multiSelect;
    if (mod) {
      const next = new Set(this.selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      this.selectedIds = this.#expandSelectionToGroups(next);
    } else if (!this.selectedIds.has(id)) {
      this.selectedIds = this.#expandSelectionToGroups(new Set([id]));
    }

    // Clear rotate handle if selecting a different item
    if (this._rotateHandleId && !this.selectedIds.has(this._rotateHandleId)) {
      this._rotateHandleId = null;
    }

    // Start group drag for all selected items
    this.#pushUndo();
    this._field.capturePointer(e.pointerId);
    this.#startGroupDrag(pt.x, pt.y);
  }

  #startGroupDrag(anchorX: number, anchorY: number) {
    const pointOrigins = new Map<string, { x: number; y: number }>();
    const lineOrigins = new Map<string, { x1: number; y1: number; x2: number; y2: number; cx: number; cy: number }>();

    for (const id of this.selectedIds) {
      const p = this.players.find(p => p.id === id);
      if (p) {
        const pos = this.#getItemPosition(p.id, p.x, p.y);
        pointOrigins.set(id, pos);
        continue;
      }
      const eq = this.equipment.find(eq => eq.id === id);
      if (eq) {
        const pos = this.#getItemPosition(eq.id, eq.x, eq.y);
        pointOrigins.set(id, pos);
        continue;
      }
      const sh = this.shapes.find(s => s.id === id);
      if (sh) { pointOrigins.set(id, { x: sh.cx, y: sh.cy }); continue; }
      const ti = this.textItems.find(t => t.id === id);
      if (ti) { pointOrigins.set(id, { x: ti.x, y: ti.y }); continue; }
      const l = this.lines.find(l => l.id === id);
      if (l) { lineOrigins.set(id, { x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, cx: l.cx, cy: l.cy }); }
    }

    this.#groupDrag = { anchorX, anchorY, pointOrigins, lineOrigins };
  }

  #onPointerMove(e: PointerEvent) {
    this.#activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    // Two-finger pinch
    if (this.#activePointers.size === 2 && this.#pinchStartDist > 0) {
      const pts = [...this.#activePointers.values()];
      const dist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
      const { maxX, maxY } = this.#getPanLimits();
      const newScale = this.#clamp(this.#pinchStartScale * (dist / this.#pinchStartDist), 0.25, 8);
      this._viewTransform = {
        scale: newScale,
        x: this.#clamp(this.#pinchStartPan.x, -maxX, maxX),
        y: this.#clamp(this.#pinchStartPan.y, -maxY, maxY),
      };
      return;
    }

    // Pan drag
    if (this.#panDrag) {
      const dx = -(e.clientX - this.#panDrag.startClientX) * this.#panDrag.svgPerPx;
      const dy = -(e.clientY - this.#panDrag.startClientY) * this.#panDrag.svgPerPx;
      const { maxX, maxY } = this.#getPanLimits();
      this._viewTransform = {
        ...this._viewTransform,
        x: this.#clamp(this.#panDrag.startVx + dx, -maxX, maxX),
        y: this.#clamp(this.#panDrag.startVy + dy, -maxY, maxY),
      };
      return;
    }

    const pt = this._field.screenToSVG(e.clientX, e.clientY);

    if (this.activeTool === 'add-player' || this.activeTool === 'add-equipment' || this.activeTool === 'add-text') {
      const hover = resolveHit(e.composedPath()[0]);
      if (hover && hover.id === this.#lastPlacedId) {
        this.ghost = null;
      } else {
        this.ghost = { x: pt.x, y: pt.y };
      }
      return;
    }

    if (this.activeTool === 'measure' && this._measureStart) {
      if (e.shiftKey) {
        const raw = axisConstrain(pt.x - this._measureStart.x, pt.y - this._measureStart.y, true);
        this._measureEnd = { x: this._measureStart.x + raw.dx, y: this._measureStart.y + raw.dy };
      } else {
        this._measureEnd = { x: pt.x, y: pt.y };
      }
      return;
    }

    if (this._marquee) {
      this._marquee = { ...this._marquee, x2: pt.x, y2: pt.y };
      return;
    }

    if (this._draw) {
      if (e.shiftKey) {
        const raw = axisConstrain(pt.x - this._draw.x1, pt.y - this._draw.y1, true);
        this._draw = { ...this._draw, x2: this._draw.x1 + raw.dx, y2: this._draw.y1 + raw.dy };
      } else {
        this._draw = { ...this._draw, x2: pt.x, y2: pt.y };
      }
      return;
    }

    if (this._shapeDraw) {
      let curX = pt.x;
      let curY = pt.y;
      if (e.shiftKey) {
        const dx = Math.abs(pt.x - this._shapeDraw.startX);
        const dy = Math.abs(pt.y - this._shapeDraw.startY);
        const size = Math.min(dx, dy);
        curX = this._shapeDraw.startX + Math.sign(pt.x - this._shapeDraw.startX) * size;
        curY = this._shapeDraw.startY + Math.sign(pt.y - this._shapeDraw.startY) * size;
      }
      this._shapeDraw = { ...this._shapeDraw, curX, curY };
      return;
    }

    if (this.#shapeResizeDrag) {
      const { id, handle, origCx, origCy, origHw, origHh, startX, startY } = this.#shapeResizeDrag;
      const dx = pt.x - startX;
      const dy = pt.y - startY;
      let newHw = origHw;
      let newHh = origHh;
      let newCx = origCx;
      let newCy = origCy;

      if (handle === 'e' || handle === 'w' || handle === 'ne' || handle === 'se' || handle === 'nw' || handle === 'sw') {
        if (handle.includes('e')) { newHw = Math.max(0.5, origHw + dx / 2); newCx = origCx + dx / 2; }
        if (handle.includes('w')) { newHw = Math.max(0.5, origHw - dx / 2); newCx = origCx + dx / 2; }
      }
      if (handle === 'n' || handle === 's' || handle === 'ne' || handle === 'se' || handle === 'nw' || handle === 'sw') {
        if (handle.includes('s')) { newHh = Math.max(0.5, origHh + dy / 2); newCy = origCy + dy / 2; }
        if (handle.includes('n')) { newHh = Math.max(0.5, origHh - dy / 2); newCy = origCy + dy / 2; }
      }

      if (e.altKey) {
        newCx = origCx;
        newCy = origCy;
        if (handle.includes('e') || handle.includes('w')) newHw = Math.max(0.5, origHw + Math.abs(dx) * Math.sign(handle.includes('e') ? dx : -dx));
        if (handle.includes('s') || handle.includes('n')) newHh = Math.max(0.5, origHh + Math.abs(dy) * Math.sign(handle.includes('s') ? dy : -dy));
      }

      if (e.shiftKey) {
        const ratio = origHw / origHh;
        if (newHw / newHh > ratio) {
          newHh = newHw / ratio;
        } else {
          newHw = newHh * ratio;
        }
      }

      this.shapes = this.shapes.map(s =>
        s.id === id ? { ...s, cx: newCx, cy: newCy, hw: newHw, hh: newHh } : s
      );
      return;
    }

    if (this.#rotateDrag) {
      const { id, cx, cy, startAngle, origRotation } = this.#rotateDrag;
      const currentAngle = rad2deg(Math.atan2(pt.y - cy, pt.x - cx));
      let newAngle = origRotation + (currentAngle - startAngle);
      if (e.shiftKey) {
        newAngle = Math.round(newAngle / 15) * 15;
      }

      if (this._animationMode && this.activeFrameIndex > 0) {
        const frame = this.animationFrames[this.activeFrameIndex];
        if (frame) {
          const base = this.players.find(p => p.id === id) ?? this.equipment.find(e => e.id === id);
          const pos = frame.positions[id] ?? this.#getItemPositionAtFrame(id, base?.x ?? 0, base?.y ?? 0, this.activeFrameIndex);
          const newPositions = { ...frame.positions, [id]: { ...pos, angle: newAngle } };
          this.animationFrames = this.animationFrames.map((f, i) =>
            i === this.activeFrameIndex ? { ...f, positions: newPositions } : f
          );
        }
      } else {
        const p = this.players.find(p => p.id === id);
        if (p) {
          this.players = this.players.map(pl =>
            pl.id === id ? { ...pl, angle: newAngle } : pl
          );
        } else {
          const sh = this.shapes.find(s => s.id === id);
          if (sh) {
            this.shapes = this.shapes.map(s =>
              s.id === id ? { ...s, angle: newAngle } : s
            );
          } else {
            const ti = this.textItems.find(t => t.id === id);
            if (ti) {
              this.textItems = this.textItems.map(t =>
                t.id === id ? { ...t, angle: newAngle } : t
              );
            } else {
              this.equipment = this.equipment.map(eq =>
                eq.id === id ? { ...eq, angle: newAngle } : eq
              );
            }
          }
        }
      }
      return;
    }

    if (this.#trailDrag) {
      const { id, cp } = this.#trailDrag;
      const frame = this.animationFrames[this.activeFrameIndex];
      if (frame) {
        const existing = frame.trails[id] ?? this.#defaultTrailCP(id);
        const newTrails = { ...frame.trails };
        // Shift constrains control point to horizontal/vertical/45° from its anchor
        let cpX = pt.x, cpY = pt.y;
        if (e.shiftKey) {
          const anchorX = cp === 'cp1' ? existing.cp2x : existing.cp1x;
          const anchorY = cp === 'cp1' ? existing.cp2y : existing.cp1y;
          const c = axisConstrain(pt.x - anchorX, pt.y - anchorY, true);
          cpX = anchorX + c.dx; cpY = anchorY + c.dy;
        }
        if (cp === 'cp1') {
          newTrails[id] = { ...existing, cp1x: cpX, cp1y: cpY };
        } else {
          newTrails[id] = { ...existing, cp2x: cpX, cp2y: cpY };
        }
        this.animationFrames = this.animationFrames.map((f, i) =>
          i === this.activeFrameIndex ? { ...f, trails: newTrails } : f
        );
      }
      return;
    }

    if (this.#handleDrag) {
      const { kind, id } = this.#handleDrag;
      if (kind === 'line-start') {
        this.lines = this.lines.map(l => {
          if (l.id !== id) return l;
          if (e.shiftKey) {
            const c = axisConstrain(pt.x - l.x2, pt.y - l.y2, true);
            return { ...l, x1: l.x2 + c.dx, y1: l.y2 + c.dy };
          }
          return { ...l, x1: pt.x, y1: pt.y };
        });
      } else if (kind === 'line-end') {
        this.lines = this.lines.map(l => {
          if (l.id !== id) return l;
          if (e.shiftKey) {
            const c = axisConstrain(pt.x - l.x1, pt.y - l.y1, true);
            return { ...l, x2: l.x1 + c.dx, y2: l.y1 + c.dy };
          }
          return { ...l, x2: pt.x, y2: pt.y };
        });
      } else if (kind === 'line-control') {
        this.lines = this.lines.map(l => {
          if (l.id !== id) return l;
          if (e.shiftKey) {
            return { ...l, cx: (l.x1 + l.x2) / 2, cy: (l.y1 + l.y2) / 2 };
          }
          return { ...l, cx: pt.x, cy: pt.y };
        });
      }
      return;
    }

    if (!this.#groupDrag) return;

    const { anchorX, anchorY, pointOrigins, lineOrigins } = this.#groupDrag;
    const { dx, dy } = axisConstrain(pt.x - anchorX, pt.y - anchorY, e.shiftKey);

    if (pointOrigins.size > 0) {
      if (this._animationMode && this.activeFrameIndex > 0) {
        const frame = this.animationFrames[this.activeFrameIndex];
        if (frame) {
          const newPositions = { ...frame.positions };
          for (const [id, orig] of pointOrigins) {
            const player = this.players.find(p => p.id === id);
            const equip = player ? undefined : this.equipment.find(e => e.id === id);
            const angle = this.#getItemAngle(id, player?.angle ?? equip?.angle);
            newPositions[id] = { x: orig.x + dx, y: orig.y + dy, angle };
          }
          this.animationFrames = this.animationFrames.map((f, i) =>
            i === this.activeFrameIndex ? { ...f, positions: newPositions } : f
          );
        }
      } else {
        this.players = this.players.map(p => {
          const orig = pointOrigins.get(p.id);
          return orig ? { ...p, x: orig.x + dx, y: orig.y + dy } : p;
        });
        this.equipment = this.equipment.map(eq => {
          const orig = pointOrigins.get(eq.id);
          return orig ? { ...eq, x: orig.x + dx, y: orig.y + dy } : eq;
        });
      }
      this.shapes = this.shapes.map(s => {
        const orig = pointOrigins.get(s.id);
        return orig ? { ...s, cx: orig.x + dx, cy: orig.y + dy } : s;
      });
      this.textItems = this.textItems.map(t => {
        const orig = pointOrigins.get(t.id);
        return orig ? { ...t, x: orig.x + dx, y: orig.y + dy } : t;
      });
    }

    if (lineOrigins.size > 0) {
      this.lines = this.lines.map(l => {
        const orig = lineOrigins.get(l.id);
        return orig ? {
          ...l,
          x1: orig.x1 + dx, y1: orig.y1 + dy,
          x2: orig.x2 + dx, y2: orig.y2 + dy,
          cx: orig.cx + dx, cy: orig.cy + dy,
        } : l;
      });
    }
  }

  #onPointerUp(e: PointerEvent) {
    this.#activePointers.delete(e.pointerId);
    if (this.#activePointers.size < 2) this.#pinchStartDist = 0;
    this.#panDrag = null;

    if (this._marquee) {
      const m = this._marquee;
      this._marquee = null;
      const minX = Math.min(m.x1, m.x2);
      const maxX = Math.max(m.x1, m.x2);
      const minY = Math.min(m.y1, m.y2);
      const maxY = Math.max(m.y1, m.y2);
      if (maxX - minX > 0.5 || maxY - minY > 0.5) {
        const hit = new Set(this.selectedIds);
        const inRect = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY;
        for (const p of this.players) {
          const pos = this.#getItemPosition(p.id, p.x, p.y);
          if (inRect(pos.x, pos.y)) hit.add(p.id);
        }
        for (const eq of this.equipment) {
          const pos = this.#getItemPosition(eq.id, eq.x, eq.y);
          if (inRect(pos.x, pos.y)) hit.add(eq.id);
        }
        for (const s of this.shapes) {
          if (inRect(s.cx, s.cy)) hit.add(s.id);
        }
        for (const t of this.textItems) {
          if (inRect(t.x, t.y)) hit.add(t.id);
        }
        for (const l of this.lines) {
          if (inRect(l.cx, l.cy)) hit.add(l.id);
        }
        this.selectedIds = hit;
      }
    }

    if (this._draw) {
      const d = this._draw;
      const dx = d.x2 - d.x1;
      const dy = d.y2 - d.y1;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        this.#pushUndo();
        const newLine: Line = {
          id: uid('line'),
          x1: d.x1, y1: d.y1,
          x2: d.x2, y2: d.y2,
          cx: (d.x1 + d.x2) / 2,
          cy: (d.y1 + d.y2) / 2,
          color: getLineColors(this.fieldTheme)[0].color,
          style: this.lineStyle,
          arrowStart: false,
          arrowEnd: true,
        };
        this.lines = [...this.lines, newLine];
        this.selectedIds = new Set([newLine.id]);
        if (this._animationMode && this.activeFrameIndex > 0) {
          this.animationFrames = this.animationFrames.map((f, i) =>
            i === this.activeFrameIndex
              ? { ...f, visibleLineIds: [...f.visibleLineIds, newLine.id] }
              : f
          );
        }
      }
      this._draw = null;
    }

    if (this._shapeDraw) {
      const d = this._shapeDraw;
      const hw = Math.abs(d.curX - d.startX) / 2;
      const hh = Math.abs(d.curY - d.startY) / 2;
      if (hw > 0.5 && hh > 0.5) {
        this.#pushUndo();
        const newShape: Shape = {
          id: uid('shape'),
          cx: (d.startX + d.curX) / 2,
          cy: (d.startY + d.curY) / 2,
          hw, hh,
          kind: d.kind,
          style: 'outline',
        };
        this.shapes = [...this.shapes, newShape];
        this.selectedIds = new Set([newShape.id]);
        this.activeTool = 'select';
        if (this._animationMode && this.activeFrameIndex > 0) {
          this.animationFrames = this.animationFrames.map((f, i) =>
            i === this.activeFrameIndex
              ? { ...f, visibleShapeIds: [...(f.visibleShapeIds ?? []), newShape.id] }
              : f
          );
        }
      }
      this._shapeDraw = null;
    }


    this.#groupDrag = null;
    this.#handleDrag = null;
    this.#rotateDrag = null;
    this.#shapeResizeDrag = null;
    this.#trailDrag = null;
  }

  #defaultTrailCP(id: string): TrailControlPoints {
    const p = this.players.find(pl => pl.id === id);
    const eq = this.equipment.find(e => e.id === id);
    const baseX = p ? p.x : eq ? eq.x : 0;
    const baseY = p ? p.y : eq ? eq.y : 0;
    const curr = this.#getItemPosition(id, baseX, baseY);
    const prev = this.#getItemPositionAtFrame(id, baseX, baseY, this.activeFrameIndex - 1);
    return {
      cp1x: prev.x + (curr.x - prev.x) / 3,
      cp1y: prev.y + (curr.y - prev.y) / 3,
      cp2x: prev.x + (curr.x - prev.x) * 2 / 3,
      cp2y: prev.y + (curr.y - prev.y) * 2 / 3,
    };
  }

  #recordFramePositions() {
    const frame = this.animationFrames[this.activeFrameIndex];
    if (!frame) return;
    const newPositions = { ...frame.positions };

    for (const id of this.selectedIds) {
      const p = this.players.find(pl => pl.id === id);
      if (p) {
        const pos = this.#getItemPosition(p.id, p.x, p.y);
        const existing = frame.positions[id];
        newPositions[id] = { x: pos.x, y: pos.y, ...(existing?.angle != null ? { angle: existing.angle } : {}) };
        continue;
      }
      const eq = this.equipment.find(e => e.id === id);
      if (eq) {
        const pos = this.#getItemPosition(eq.id, eq.x, eq.y);
        const existing = frame.positions[id];
        newPositions[id] = { x: pos.x, y: pos.y, ...(existing?.angle != null ? { angle: existing.angle } : {}) };
        continue;
      }
    }

    this.animationFrames = this.animationFrames.map((f, i) =>
      i === this.activeFrameIndex ? { ...f, positions: newPositions } : f
    );
  }

  #onPointerLeave(e: PointerEvent) {
    this.#activePointers.delete(e.pointerId);
    if (this.#activePointers.size < 2) this.#pinchStartDist = 0;
    this.#panDrag = null;
    this.ghost = null;
    this._draw = null;
    this._shapeDraw = null;
    this.#groupDrag = null;
    this.#handleDrag = null;
    this.#rotateDrag = null;
    this.#shapeResizeDrag = null;
    this.#trailDrag = null;
  }

  #onKeyDown(e: KeyboardEvent) {
    const tag = (e.composedPath()[0] as HTMLElement)?.tagName;
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.#undo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      this.#redo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'a' && !inInput) {
      e.preventDefault();
      this.selectedIds = new Set([
        ...this.players.map(p => p.id),
        ...this.equipment.map(eq => eq.id),
        ...this.lines.map(l => l.id),
        ...this.shapes.map(s => s.id),
        ...this.textItems.map(t => t.id),
      ]);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'c' && this.selectedIds.size > 0 && !inInput) {
      const ids = this.selectedIds;
      this.#clipboard = {
        players: this.players.filter(p => ids.has(p.id)),
        equipment: this.equipment.filter(eq => ids.has(eq.id)),
        lines: this.lines.filter(l => ids.has(l.id)),
        shapes: this.shapes.filter(s => ids.has(s.id)),
        textItems: this.textItems.filter(t => ids.has(t.id)),
      };
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'v' && this.#clipboard && !inInput) {
      e.preventDefault();
      this.#pasteClipboard(3, 3);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'd' && this.selectedIds.size > 0 && !inInput) {
      e.preventDefault();
      const ids = this.selectedIds;
      this.#clipboard = {
        players: this.players.filter(p => ids.has(p.id)),
        equipment: this.equipment.filter(eq => ids.has(eq.id)),
        lines: this.lines.filter(l => ids.has(l.id)),
        shapes: this.shapes.filter(s => ids.has(s.id)),
        textItems: this.textItems.filter(t => ids.has(t.id)),
      };
      this.#pasteClipboard(3, 3);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'g' && !e.shiftKey && this.selectedIds.size >= 2 && !inInput) {
      e.preventDefault();
      this.#onGroupItems(new GroupItemsEvent());
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'G' && e.shiftKey && this.selectedIds.size > 0 && !inInput) {
      e.preventDefault();
      this.#onUngroupItems(new UngroupItemsEvent());
      return;
    }
    // Cmd+] / Cmd+Shift+] = bring to front  (industry standard: Figma, Sketch, Canva)
    if ((e.metaKey || e.ctrlKey) && e.key === ']' && this.selectedIds.size > 0 && !inInput) {
      e.preventDefault();
      this.#onZOrder(new ZOrderEvent('front'));
      return;
    }
    // Cmd+[ / Cmd+Shift+[ = send to back
    if ((e.metaKey || e.ctrlKey) && e.key === '[' && this.selectedIds.size > 0 && !inInput) {
      e.preventDefault();
      this.#onZOrder(new ZOrderEvent('back'));
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'A' && e.shiftKey && !inInput) {
      e.preventDefault();
      this.selectedIds = new Set();
      return;
    }
    // Zoom via the UI buttons only — Cmd+=/- conflicts with the browser's own zoom
    // shortcuts, which change the viewport and break orientation media queries.
    // Coaches can use the −/100%/+ controls in the bottom bar instead.
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedIds.size > 0) {
      if (inInput) return;
      this.#pushUndo();
      const ids = this.selectedIds;
      this.players = this.players.filter(p => !ids.has(p.id));
      this.lines = this.lines.filter(l => !ids.has(l.id));
      this.equipment = this.equipment.filter(eq => !ids.has(eq.id));
      this.shapes = this.shapes.filter(s => !ids.has(s.id));
      this.textItems = this.textItems.filter(t => !ids.has(t.id));
      this.selectedIds = new Set();
      return;
    }
    if (e.key === 'Escape') {
      if (this._menuOpen) { this.#closeMenu(); return; }
      if (this.activeTool === 'measure' && this._measureStart) {
        this._measureStart = null;
        this._measureEnd = null;
        return;
      }
      this.activeTool = 'select';
      this.ghost = null;
      this.selectedIds = new Set();
      this._multiSelect = false;
      this.#lastPlacedId = null;
      return;
    }

    if (this.selectedIds.size > 0 && !inInput && this._viewMode !== 'readonly'
        && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const step = e.shiftKey ? 5 : 1;
      let dx = 0, dy = 0;
      if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      if (dx || dy) {
        e.preventDefault();
        if (!e.repeat) this.#pushUndo();
        const ids = this.selectedIds;
        if (this._animationMode && this.activeFrameIndex > 0) {
          // In animation mode write nudge to frame positions, not base arrays
          const frame = this.animationFrames[this.activeFrameIndex];
          if (frame) {
            const newPositions = { ...frame.positions };
            for (const id of ids) {
              const p = this.players.find(pl => pl.id === id);
              if (p) {
                const pos = this.#getItemPosition(p.id, p.x, p.y);
                const existing = frame.positions[id];
                newPositions[id] = { x: pos.x + dx, y: pos.y + dy, ...(existing?.angle != null ? { angle: existing.angle } : {}) };
                continue;
              }
              const eq = this.equipment.find(e => e.id === id);
              if (eq) {
                const pos = this.#getItemPosition(eq.id, eq.x, eq.y);
                const existing = frame.positions[id];
                newPositions[id] = { x: pos.x + dx, y: pos.y + dy, ...(existing?.angle != null ? { angle: existing.angle } : {}) };
              }
            }
            this.animationFrames = this.animationFrames.map((f, i) =>
              i === this.activeFrameIndex ? { ...f, positions: newPositions } : f
            );
          }
        } else {
          this.players = this.players.map(p => ids.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p);
          this.equipment = this.equipment.map(eq => ids.has(eq.id) ? { ...eq, x: eq.x + dx, y: eq.y + dy } : eq);
        }
        // Lines, shapes and text always write to base arrays (not frame-specific)
        this.shapes = this.shapes.map(s => ids.has(s.id) ? { ...s, cx: s.cx + dx, cy: s.cy + dy } : s);
        this.textItems = this.textItems.map(t => ids.has(t.id) ? { ...t, x: t.x + dx, y: t.y + dy } : t);
        this.lines = this.lines.map(l => ids.has(l.id) ? { ...l, x1: l.x1 + dx, y1: l.y1 + dy, x2: l.x2 + dx, y2: l.y2 + dy, cx: l.cx + dx, cy: l.cy + dy } : l);
        return;
      }
    }

    if (inInput || e.metaKey || e.ctrlKey || e.altKey || this._viewMode === 'readonly') return;

    switch (e.key.toLowerCase()) {
      case 'v':
        this.activeTool = 'select'; this.ghost = null;
        this.selectedIds = new Set(); this.#lastPlacedId = null;
        break;
      case 'p':
        this.activeTool = 'add-player';
        this.selectedIds = new Set(); this.#lastPlacedId = null;
        break;
      case 'e':
        this.activeTool = 'add-equipment';
        this.selectedIds = new Set(); this.#lastPlacedId = null;
        break;
      case 'd':
        this.activeTool = 'draw-line';
        this.selectedIds = new Set(); this.#lastPlacedId = null;
        break;
      case 't':
        this.activeTool = 'add-text';
        this.selectedIds = new Set(); this.#lastPlacedId = null;
        break;
      case 'm':
        this.activeTool = 'measure';
        this.selectedIds = new Set(); this.#lastPlacedId = null;
        break;
      case 'h':
        this.activeTool = 'pan';
        this.selectedIds = new Set(); this.#lastPlacedId = null;
        break;
      case ',':
        if (this.selectedIds.size > 0) {
          this.#onRotateItems(new RotateItemsEvent(-45));
        }
        break;
      case '.':
        if (this.selectedIds.size > 0) {
          this.#onRotateItems(new RotateItemsEvent(45));
        }
        break;
      case '=': this.#zoomIn();    break;
      case '-': this.#zoomOut();   break;
      case '0': this.#resetView(); break;
    }
  }

  #pasteClipboard(dx: number, dy: number) {
    if (!this.#clipboard) return;
    this.#pushUndo();
    const newIds = new Set<string>();
    const newPlayers = this.#clipboard.players.map(p => {
      const id = uid('player');
      newIds.add(id);
      return { ...p, id, x: p.x + dx, y: p.y + dy };
    });
    const newEquipment = this.#clipboard.equipment.map(eq => {
      const id = uid('eq');
      newIds.add(id);
      return { ...eq, id, x: eq.x + dx, y: eq.y + dy };
    });
    const newLines = this.#clipboard.lines.map(l => {
      const id = uid('line');
      newIds.add(id);
      return { ...l, id, x1: l.x1 + dx, y1: l.y1 + dy, x2: l.x2 + dx, y2: l.y2 + dy, cx: l.cx + dx, cy: l.cy + dy };
    });
    const newShapes = this.#clipboard.shapes.map(s => {
      const id = uid('shape');
      newIds.add(id);
      return { ...s, id, cx: s.cx + dx, cy: s.cy + dy };
    });
    const newTextItems = this.#clipboard.textItems.map(t => {
      const id = uid('text');
      newIds.add(id);
      return { ...t, id, x: t.x + dx, y: t.y + dy };
    });
    this.players = [...this.players, ...newPlayers];
    this.equipment = [...this.equipment, ...newEquipment];
    this.lines = [...this.lines, ...newLines];
    this.shapes = [...this.shapes, ...newShapes];
    this.textItems = [...this.textItems, ...newTextItems];
    this.selectedIds = newIds;
  }

  #addPlayer(x: number, y: number) {
    const color = this.playerColor;
    const team = this.playerTeam;
    let label: string | undefined;
    if (team === 'neutral') {
      label = 'N';
    } else if (this.autoNumber) {
      const sameTeamCount = this.players.filter(p => p.team === team).length;
      label = String(sameTeamCount + 1);
    }
    const isHorizontal = this.fieldOrientation === 'horizontal';
    const angle = team === 'b'
      ? (isHorizontal ? 270 : 180)
      : (isHorizontal ? 90 : 0);
    const newPlayer: Player = {
      id: uid('player'),
      x, y,
      team,
      color,
      label,
      angle,
    };
    this.players = [...this.players, newPlayer];
    this.selectedIds = new Set([newPlayer.id]);
    this.#lastPlacedId = newPlayer.id;
  }

  #addEquipment(x: number, y: number) {
    const kind = this.equipmentKind;
    const needsAngle = kind === 'dummy' || kind === 'goal' || kind === 'mini-goal' || kind === 'popup-goal';
    const newEq: Equipment = {
      id: uid('eq'),
      x, y,
      kind,
      ...(needsAngle ? { angle: 0 } : {}),
    };
    this.equipment = [...this.equipment, newEq];
    this.selectedIds = new Set([newEq.id]);
    this.#lastPlacedId = newEq.id;
  }

  #addTextItem(x: number, y: number, text: string) {
    const newText: TextItem = {
      id: uid('text'),
      x, y,
      text,
    };
    this.textItems = [...this.textItems, newText];
    this.selectedIds = new Set([newText.id]);
    this.#lastPlacedId = newText.id;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'coach-board': CoachBoard;
  }
}
