import { LitElement, html, svg, css, nothing } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { guard } from 'lit/directives/guard.js';

import type { Player, Line, Equipment, Shape, TextItem, Tool, LineStyle, EquipmentKind, ShapeKind, Team, FieldTheme, PitchType, AnimationFrame, FramePosition, TrailControlPoints } from '../lib/types.js';
import { COLORS, getPlayerColors, getConeColors, getLineColors, PLAYER_COLORS, PLAYER_COLORS_WHITE, CONE_COLORS, CONE_COLORS_WHITE } from '../lib/types.js';
import { FIELD, getFieldDimensions } from '../lib/field.js';
import type { FieldOrientation } from '../lib/field.js';
import { uid, ensureMinId } from '../lib/svg-utils.js';
import { saveBoard, loadBoard, listBoards, deleteBoard, createEmptyBoard, getActiveBoardId, setActiveBoardId, type SavedBoard } from '../lib/board-store.js';
import { registerSW } from 'virtual:pwa-register';
import { getTemplatesForPitch } from '../lib/templates.js';
import { getItemPosition, getItemAngle, getItemPositionAtFrame, getItemAngleAtFrame } from '../lib/animation-utils.js';
import { ToolChangedEvent, PlayerUpdateEvent, EquipmentUpdateEvent, LineUpdateEvent, ShapeUpdateEvent, TextUpdateEvent, AlignItemsEvent, GroupItemsEvent, UngroupItemsEvent, SaveSvgEvent, DeleteItemsEvent, MultiSelectToggleEvent, RotateItemsEvent, AutoNumberToggleEvent } from './cb-toolbar.js';
import type { AlignAction } from './cb-toolbar.js';

import './cb-toolbar.js';
import './cb-board-bar.js';
import './cb-timeline.js';
import './cb-dialogs.js';
import type { CbDialogs, BoardSummary, PendingBoardAction } from './cb-dialogs.js';
import './cb-field.js';
import type { CbField, GhostCursor, DrawState, ShapeDrawState } from './cb-field.js';
import './cb-share.js';
import type { CbShare } from './cb-share.js';
import type { FrameSelectEvent, FrameDeleteEvent, SpeedChangeEvent } from './cb-timeline.js';

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
  static styles = css`
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

    .app-board {
      grid-column: 2;
      height: 100dvh;
      display: grid;
      grid-template-areas:
        "topbar"
        "board"
        "timeline"
        "botbar";
      grid-template-rows: 60px 1fr auto 60px;
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

    @media (prefers-reduced-motion: reduce) {
      .app-wrap { transition: transform 150ms ease; }
    }

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
      height: 60px;
      background: var(--pt-bg-toolbar);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      z-index: 10;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      /* overflow:visible so dropdowns inside cb-toolbar are not clipped */
    }

    /* White field theme — no background needed here; the sidebar floats
       absolutely over .field-area which provides the seamless canvas */

    .context-board-name {
      padding: 0 14px;
      flex-shrink: 0;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--pt-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 200px;
      display: flex;
      align-items: center;
      gap: 6px;
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

    .sidebar-divider {
      width: 40px;
      border: none;
      border-top: 1px solid rgba(0, 0, 0, 0.35);
      border-bottom: 1px solid rgba(255, 255, 255, 0.15);
      margin: 4px 0;
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

    .update-toast {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: white;
      color: var(--pt-color-navy-800, #16213e);
      font-size: 0.85rem;
      font-family: system-ui, -apple-system, sans-serif;
      z-index: 100;
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
      border: 1px solid rgba(0, 0, 0, 0.15);
      border-radius: 6px;
      background: white;
      color: var(--pt-color-navy-800, #16213e);
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }

    .update-toast button:hover {
      background: #f0f0f0;
    }

    .update-toast button:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .update-toast .refresh-btn {
      background: var(--pt-success-hover);
      border-color: var(--pt-success-hover);
      color: white;
    }

    .update-toast .refresh-btn:hover {
      background: var(--pt-success-btn-hover);
    }

    .update-toast .dismiss-btn {
      background: transparent;
      color: var(--pt-color-navy-800, #16213e);
      border-color: var(--pt-color-navy-600, #1c3a5c);
    }

    .update-toast .dismiss-btn:hover {
      background: rgba(0, 0, 0, 0.05);
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
      text-decoration: none;
      color: inherit;
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

    .bottom-bar button:disabled {
      opacity: 0.35;
      cursor: default;
      pointer-events: none;
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
      .rotate-overlay, cb-dialogs, cb-timeline {        display: none !important;
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

  `;

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
  @state() private accessor _sidebarMenu: 'player' | 'equipment' | 'draw' | 'select' | null = null;
  @state() private accessor _sidebarFocusIndex: number = 0;
  @state() private accessor _isMobile: boolean = window.innerWidth <= 768;
  @state() private accessor _multiSelect: boolean = false;
  @state() private accessor _menuOpen: boolean = false;
  @state() private accessor _rotateHandleId: string | null = null;
  @state() private accessor _animationMode: boolean = false;
  @state() accessor animationFrames: AnimationFrame[] = [];
  @state() accessor activeFrameIndex: number = 0;
  @state() accessor isPlaying: boolean = false;
  @state() private accessor _playbackProgress: number = 0;
  @state() private accessor _playbackSpeed: number = 1;
  @state() private accessor _playbackLoop: boolean = true;

  @query('cb-field') private accessor _field!: CbField;
  @query('cb-share') private accessor _share!: CbShare;
  @query('#svg-import-input') accessor _fileInput!: HTMLInputElement;
  @query('cb-dialogs') private accessor _dialogs!: CbDialogs;  @state() private accessor _boardName: string = 'Untitled Board';
  @state() private accessor _boardNotes: string = '';
  @state() private accessor _viewMode: 'normal' | 'readonly' | 'shared-edit' = 'normal';
  @state() private accessor _updateAvailable: boolean = false;
  #updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
  @state() private accessor _showPlayOverlay: boolean = true;
  @state() private accessor _pauseFlash: boolean = false;
  @state() private accessor _playBtnAnim: '' | 'press-out' | 'press-in' = '';
  #currentBoard: SavedBoard | null = null;

  #pendingOpenBoardId: string | null = null;
  #pendingDeleteBoard: SavedBoard | null = null;
  #playBtnTimeout: ReturnType<typeof setTimeout> | null = null;
  #groupDrag: GroupDragState | null = null;
  #handleDrag: HandleDragState | null = null;
  #rotateDrag: RotateDragState | null = null;
  #shapeResizeDrag: ShapeResizeDragState | null = null;
  @state() accessor _draw: DrawState | null = null;
  @state() accessor _shapeDraw: ShapeDrawState | null = null;
  @state() accessor _marquee: { x1: number; y1: number; x2: number; y2: number } | null = null;
  #boundKeyDown = this.#onKeyDown.bind(this);
  #onDocClickForMenu = (e: PointerEvent) => {
    const path = e.composedPath();
    // Field orientation dropdown still uses a popup, close it on outside click
    if (this._fieldMenuOpen && !path.includes(this.renderRoot.querySelector('.bottom-center .dropdown-wrap') as EventTarget)) {
      this._fieldMenuOpen = false;
    }
    // Close sidebar tool dropdown when clicking outside the sidebar
    if (this._sidebarMenu && !path.includes(this.renderRoot.querySelector('.sidebar') as EventTarget)) {
      this._sidebarMenu = null;
    }
  };

  // Opens a sidebar dropdown and focuses its first item; toggles if already open
  #openSidebarMenu(name: 'select' | 'player' | 'equipment' | 'draw', focusIndex: number) {
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

  #onSidebarToolKeyDown = (e: KeyboardEvent) => {
    if (!(e.target as HTMLElement).classList.contains('sidebar-tool')) return;
    const toolbar = e.currentTarget as HTMLElement;
    const tools = Array.from(toolbar.querySelectorAll('.sidebar-tool')) as HTMLElement[];
    const toolCount = tools.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this._sidebarFocusIndex = (this._sidebarFocusIndex + 1) % toolCount;
        this.updateComplete.then(() => {
          (this.renderRoot.querySelectorAll('.sidebar-tools .sidebar-tool')[this._sidebarFocusIndex] as HTMLElement)?.focus();
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        this._sidebarFocusIndex = (this._sidebarFocusIndex - 1 + toolCount) % toolCount;
        this.updateComplete.then(() => {
          (this.renderRoot.querySelectorAll('.sidebar-tools .sidebar-tool')[this._sidebarFocusIndex] as HTMLElement)?.focus();
        });
        break;
      case 'Home':
        e.preventDefault();
        this._sidebarFocusIndex = 0;
        this.updateComplete.then(() => {
          (this.renderRoot.querySelectorAll('.sidebar-tools .sidebar-tool')[0] as HTMLElement)?.focus();
        });
        break;
      case 'End':
        e.preventDefault();
        this._sidebarFocusIndex = toolCount - 1;
        this.updateComplete.then(() => {
          (this.renderRoot.querySelectorAll('.sidebar-tools .sidebar-tool')[this._sidebarFocusIndex] as HTMLElement)?.focus();
        });
        break;
    }
  };

  #mobileQuery = window.matchMedia('(max-width: 768px)');
  #onMobileChange = (e: MediaQueryListEvent) => {
    if (this.#isPrinting) return;
    this._isMobile = e.matches;
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
    this.#saveTimer = setTimeout(() => {
      saveBoard(this.#currentBoard!).catch(() => {});
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
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.#boundKeyDown);
    document.removeEventListener('pointerdown', this.#onDocClickForMenu);
    this.#mobileQuery.removeEventListener('change', this.#onMobileChange);
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
  }

  #renderMenuPanel() {
    const menuItem = (label: string, icon: ReturnType<typeof html>, handler: () => void) => html`
      <button @click="${handler}">
        ${icon}
        ${label}
      </button>
    `;

    return html`
      <div class="menu-panel" aria-hidden="${!this._menuOpen}" role="navigation" aria-label="Main menu">

        <div class="menu-header">
          <svg class="menu-logo" viewBox="0 0 1600 1600" aria-hidden="true">
            <path d="M1600 801C1600 1242.28 1242.28 1600 801 1600C359.724 1600 2 1242.28 2 801C2 359.724 359.724 2 801 2C1242.28 2 1600 359.724 1600 801Z" fill="#55964D"/>
            <path d="M801 2C1241.94 2 1599.46 359.184 1600 800H2.00195C2.54191 359.184 360.058 2 801 2Z" fill="#60A957"/>
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
            ${menuItem('Print Board', html`<svg viewBox="0 0 1200 1200" fill="currentColor"><path d="m1012.5 489.64h-82.836v-189.68c0-26.477-10.273-51.336-28.914-69.977l-85.5-85.5c-18.602-18.602-43.461-28.875-69.977-28.875l-373.01 0.003906c-56.25 0-102.04 45.789-102.04 102.04v271.99l-82.723-0.003906c-80.625 0-146.25 65.625-146.25 146.25v302.29c0 80.625 65.625 146.25 146.25 146.25h825c80.625 0 146.25-65.625 146.25-146.25v-302.29c0-80.625-65.625-146.25-146.25-146.25zm-159.49-211.91c5.8516 5.8516 9.0742 13.688 9.1133 22.125h-93.039c-12.863 0-23.324-10.461-23.324-23.324v-93.301c8.2891 0.11328 16.012 3.2617 21.75 9zm-515.25-60.078c0-19.051 15.449-34.5 34.5-34.5h305.96v93.375c0 50.102 40.762 90.863 90.863 90.863h93.039v122.25h-524.36zm556.2 799.24h-587.92v-109.73c0-2.1016 1.6484-3.75 3.75-3.75h580.46c2.1016 0 3.75 1.6484 3.75 3.75v109.73zm197.29-78.711c0 43.426-35.289 78.75-78.75 78.75h-51v-109.73c0-39.301-31.988-71.25-71.25-71.25h-580.46c-39.301 0-71.25 31.988-71.25 71.25v109.73h-51.039c-43.426 0-78.75-35.289-78.75-78.75v-302.29c0-43.426 35.289-78.75 78.75-78.75h825c43.426 0 78.75 35.289 78.75 78.75z"/></svg>`,
              this.#showPrintDialog)}
          ` : nothing}
          ${menuItem('Export Board', html`<svg viewBox="0 0 1200 1200" fill="currentColor"><path d="m1100 787.5c-16.566 0.027344-32.449 6.6211-44.164 18.336-11.715 11.715-18.309 27.598-18.336 44.164v150c-0.027344 9.9375-3.9844 19.461-11.012 26.488-7.0273 7.0273-16.551 10.984-26.488 11.012h-800c-9.9375-0.027344-19.461-3.9844-26.488-11.012-7.0273-7.0273-10.984-16.551-11.012-26.488v-150c0-22.328-11.914-42.961-31.25-54.125-19.336-11.168-43.164-11.168-62.5 0-19.336 11.164-31.25 31.797-31.25 54.125v150c0.054688 43.082 17.191 84.383 47.652 114.85 30.465 30.461 71.766 47.598 114.85 47.652h800c43.082-0.054688 84.383-17.191 114.85-47.652 30.461-30.465 47.598-71.766 47.652-114.85v-150c-0.027344-16.566-6.6211-32.449-18.336-44.164-11.715-11.715-27.598-18.309-44.164-18.336z"/><path d="m600 37.5c-16.566 0.027344-32.449 6.6211-44.164 18.336-11.715 11.715-18.309 27.598-18.336 44.164v566.55l-197.5-164.55c-12.738-10.59-29.156-15.695-45.656-14.199-16.496 1.5-31.727 9.4844-42.344 22.199-10.59 12.738-15.695 29.156-14.199 45.656 1.5 16.496 9.4844 31.727 22.199 42.344l300 250c3.1484 2.2344 6.4961 4.1758 10 5.8008 2.2852 1.5312 4.6758 2.9023 7.1484 4.0977 14.566 6.1328 30.988 6.1328 45.551 0 2.4141-1.2031 4.7539-2.5547 7-4.0469 3.5039-1.6289 6.8477-3.5703 10-5.8008l300-250c13.23-11.004 21.336-26.977 22.41-44.148 1.0742-17.176-4.9766-34.031-16.73-46.598-11.758-12.566-28.172-19.73-45.379-19.805-14.613 0.027344-28.762 5.1562-40 14.5l-197.5 164.55v-566.55c-0.027344-16.566-6.6211-32.449-18.336-44.164-11.715-11.715-27.598-18.309-44.164-18.336z"/></svg>`,
              this.#showExportDialog)}

          <div class="menu-spacer"></div>
          <div class="menu-nav-divider"></div>

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
      <div class="app-wrap ${this._menuOpen ? 'menu-open' : ''}">
      ${this.#renderMenuPanel()}<!-- grid col 1: left panel -->
      <div class="app-board"><!-- grid col 2 -->
      ${this._updateAvailable ? html`
        <div class="update-toast">
          <svg viewBox="0 0 1200 1200" width="18" height="18" fill="currentColor" style="flex-shrink:0">
            <path d="m855.52 688.45c-248.88-56.199-287.43-94.75-343.62-343.62-2.5742-11.375-12.699-19.477-24.398-19.477s-21.824 8.1016-24.398 19.477c-56.227 248.88-94.75 287.43-343.62 343.62-11.398 2.6016-19.5 12.699-19.5 24.398 0 11.699 8.1016 21.801 19.5 24.398 248.88 56.227 287.4 94.773 343.62 343.62 2.5742 11.375 12.699 19.477 24.398 19.477s21.824-8.1016 24.398-19.477c56.227-248.85 94.75-287.4 343.62-343.62 11.398-2.6016 19.477-12.699 19.477-24.398 0-11.699-8.1016-21.801-19.477-24.398z"/>
            <path d="m1080.5 300.98c-132.3-29.875-150.88-48.449-180.75-180.73-2.6016-11.398-12.699-19.477-24.398-19.477s-21.801 8.0742-24.398 19.477c-29.875 132.27-48.449 150.85-180.73 180.73-11.398 2.6016-19.477 12.699-19.477 24.398s8.0742 21.801 19.477 24.398c132.27 29.875 150.85 48.449 180.73 180.75 2.6016 11.375 12.699 19.477 24.398 19.477s21.801-8.1016 24.398-19.477c29.875-132.3 48.449-150.88 180.75-180.75 11.375-2.6016 19.477-12.699 19.477-24.398s-8.1016-21.801-19.477-24.398z"/>
          </svg>
          <span>A new version of CoachingBoard is available.</span>
          <button class="dismiss-btn" @click="${() => { this._updateAvailable = false; }}">Dismiss</button>
          <button class="refresh-btn" @click="${() => this.#updateSW?.(true)}">Refresh</button>
        </div>
      ` : nothing}

      ${isReadonly ? html`
        <!-- Readonly mode: no sidebar, context bar + field + bottom bar fill grid col 2 -->
        <div class="context-bar" style="padding-top: env(safe-area-inset-top)">
          <div class="context-board-name" title="${this._boardName}">
            ${this._boardName}
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
            .marquee="${this._marquee}"
            .activeTool="${this.activeTool}"
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
        <div class="bottom-bar readonly">
          <div class="bottom-left"></div>
          <div class="bottom-center">
            <label class="visually-hidden" for="field-theme-select">Pitch theme</label>
            <select id="field-theme-select" class="theme-select" aria-label="Pitch theme"
                    @change="${this.#onThemeChange}">
              <option value="green" ?selected="${this.fieldTheme === 'green'}">Green</option>
              <option value="white" ?selected="${this.fieldTheme === 'white'}">White</option>
            </select>
          </div>
          <div class="bottom-right"></div>
        </div>

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
              @auto-number-toggle="${this.#onAutoNumberToggle}">
            </cb-toolbar>
          ` : nothing}
        </div><!-- .context-bar -->

        <div class="board-area">
          <nav class="sidebar" aria-label="Tool palette">

          <div class="sidebar-tools" role="toolbar" aria-label="Tools" aria-orientation="vertical"
               @keydown="${this.#onSidebarToolKeyDown}">

          <!-- Select (with submenu: Select / Multi-select) -->
          <div class="sidebar-dropdown-wrap">
            <button class="sidebar-tool has-submenu"
                    title="${this._multiSelect ? 'Multi-select' : 'Select'}"
                    aria-label="${this._multiSelect ? 'Multi-select' : 'Select'}"
                    aria-pressed="${t === 'select'}"
                    aria-haspopup="menu"
                    aria-expanded="${this._sidebarMenu === 'select'}"
                    tabindex="${this._sidebarFocusIndex === 0 ? 0 : -1}"
                    @click="${(e: Event) => { e.stopPropagation(); this.#openSidebarMenu('select', 0); }}">
              ${this._multiSelect
                ? svg`<svg viewBox="0 0 1600 1600" width="20" height="20"><path d="M87.5712 346.734C84.8837 339.234 92.1337 331.796 99.8212 334.608L469.249 467.508L647.075 961.824L471.447 1365.05C468.322 1372.3 456.822 1373.61 453.385 1363.61L87.5712 346.734Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M1506.44 616.688C1514.62 619.625 1514.87 631.063 1507.06 634.437L1056.63 830.624L860.447 1281.05C857.322 1288.3 845.822 1289.61 842.384 1279.61L476.571 262.733C473.884 255.233 481.134 247.796 488.821 250.608L1506.44 616.688Z" fill="currentColor"/></svg>`
                : svg`<svg viewBox="0 0 1600 1600" width="20" height="20"><path fill-rule="evenodd" clip-rule="evenodd" d="M1394.44 730.688C1402.62 733.625 1402.87 745.063 1395.06 748.437L944.634 944.624L748.447 1395.05C745.322 1402.3 733.822 1403.61 730.384 1393.61L364.571 376.733C361.884 369.233 369.134 361.796 376.821 364.608L1394.44 730.688Z" fill="currentColor"/></svg>`}
              ${this.selectedIds.size > 0 ? html`<span class="sidebar-badge">${this.selectedIds.size}</span>` : nothing}
            </button>
            ${this._sidebarMenu === 'select' ? html`
              <div role="menu" aria-label="Select tool" @keydown="${this.#onSidebarMenuKeyDown}">
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'select'; this._multiSelect = false; this.selectedIds = new Set(); this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 1600 1600" width="16" height="16"><path fill-rule="evenodd" clip-rule="evenodd" d="M1394.44 730.688C1402.62 733.625 1402.87 745.063 1395.06 748.437L944.634 944.624L748.447 1395.05C745.322 1402.3 733.822 1403.61 730.384 1393.61L364.571 376.733C361.884 369.233 369.134 361.796 376.821 364.608L1394.44 730.688Z" fill="currentColor"/></svg>
                  Select <span style="opacity:0.5;font-size:0.8em">(V)</span>
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'select'; this._multiSelect = true; this.ghost = null; this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 1600 1600" width="16" height="16">
                    <path d="M87.5712 346.734C84.8837 339.234 92.1337 331.796 99.8212 334.608L469.249 467.508L647.075 961.824L471.447 1365.05C468.322 1372.3 456.822 1373.61 453.385 1363.61L87.5712 346.734Z" fill="currentColor"/>
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M1506.44 616.688C1514.62 619.625 1514.87 631.063 1507.06 634.437L1056.63 830.624L860.447 1281.05C857.322 1288.3 845.822 1289.61 842.384 1279.61L476.571 262.733C473.884 255.233 481.134 247.796 488.821 250.608L1506.44 616.688Z" fill="currentColor"/>
                  </svg>
                  Multi-select
                </button>
              </div>
            ` : nothing}
          </div>

          <!-- Player (with submenu: Team A / Team B / Neutral) -->
          <div class="sidebar-dropdown-wrap">
            <button class="sidebar-tool has-submenu"
                    title="Player (P)"
                    aria-label="Player"
                    aria-pressed="${t === 'add-player'}"
                    aria-haspopup="menu"
                    aria-expanded="${this._sidebarMenu === 'player'}"
                    tabindex="${this._sidebarFocusIndex === 1 ? 0 : -1}"
                    @click="${(e: Event) => { e.stopPropagation(); this.#openSidebarMenu('player', 1); }}">
              <svg viewBox="0 0 1200 1200" width="20" height="20" fill="currentColor"><path d="m0 431.26 225 168.74v-200.16l-120.14-165.19z"/><path d="m1095.1 234.66-120.14 165.19v198.56l225-167.16z"/><path d="m1065.7 179.39c-9.9844-18.703-27.422-32.344-48-37.453l-267.71-66.938c0 82.828-67.172 150-150 150s-150-67.172-150-150l-267.71 66.938c-20.578 5.1562-38.016 18.75-48 37.453l-9.8438 18.469 134.44 184.87c2.3438 3.1875 3.5625 7.0781 3.5625 11.062v731.26h675l0.09375-731.29c0-3.9844 1.2656-7.8281 3.5625-11.062l134.44-184.87-9.8438-18.469zm-615.66 870.61h-112.5v-75h112.5zm318.74-581.26c-31.078 0-56.25-25.172-56.25-56.25 0-31.078 25.172-56.25 56.25-56.25 31.078 0 56.25 25.172 56.25 56.25 0 31.078-25.172 56.25-56.25 56.25z"/></svg>
            </button>
            ${this._sidebarMenu === 'player' ? html`
              <div role="menu" aria-label="Add Player" @keydown="${this.#onSidebarMenuKeyDown}">
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
                    tabindex="${this._sidebarFocusIndex === 2 ? 0 : -1}"
                    @click="${(e: Event) => { e.stopPropagation(); this.#openSidebarMenu('equipment', 2); }}">
              <svg viewBox="0 0 1200 1200" width="20" height="20"><path d="m1125 1050v75h-1050v-75c0-63.75 48.75-112.5 112.5-112.5h825c63.75 0 112.5 48.75 112.5 112.5zm-461.26-975h-131.26l-285 825h708.74z" fill="currentColor"/></svg>
            </button>
            ${this._sidebarMenu === 'equipment' ? html`
              <div role="menu" aria-label="Add Equipment" @keydown="${this.#onSidebarMenuKeyDown}">
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'add-equipment'; this.equipmentKind = 'ball'; this.selectedIds = new Set(); this._multiSelect = false; this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 1200 1200" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                    <circle cx="600" cy="600" r="560" fill="white" />
                    <path fill="${COLORS.ballDetail}" d="m1080 600.84c-0.23438 127.31-51 249.28-141.19 339.14s-212.34 140.26-339.66 140.02c-127.31-0.23438-249.28-51-339.14-141.19-89.867-90.191-140.26-212.34-140.02-339.66 0.23438-127.31 51-249.28 141.19-339.14 90.191-89.867 212.34-140.26 339.66-140.02 127.22 0.51562 249.05 51.375 338.86 141.52 89.766 90.094 140.26 212.11 140.29 339.32zm-481.92 153.61c25.781 0 51.609 0.84375 77.297 0 8.3906-0.84375 15.984-5.2031 21-12 25.219-41.578 49.547-83.766 73.078-126.47v-0.046875c3.2344-6.9375 3.2344-14.953 0-21.938-24-42-49.922-84-75.938-124.69h-0.046875c-4.5469-6.2344-11.531-10.219-19.172-11.016-48.703-0.9375-97.5-0.9375-146.29 0-8.3906 0.84375-16.031 5.2031-21 12-26.016 40.688-51.469 82.125-76.453 124.18-3.1875 6.9375-3.1875 14.906 0 21.844 24 42.562 48.422 84.703 73.219 126.47 4.5 6.1875 11.344 10.219 18.938 11.062 25.219 1.3125 50.297 0.60938 75.375 0.60938zm-174.71-426.61c-40.688 3.9375-73.312 6.4688-105.61 10.781-8.5312 1.5-16.125 6.2344-21.234 13.219-24.609 38.625-48 78-71.156 117.7-3.375 6.3281-4.0781 13.734-1.9219 20.531 13.266 32.859 27.469 65.344 42.609 97.453 3.5625 5.7188 9.6562 9.4219 16.406 9.9375 31.922-2.1562 63.703-5.2969 96-9.7031 8.3438-1.5469 15.75-6.2812 20.672-13.219 26.156-41.062 51.422-82.594 75.844-124.69h-0.046875c3.7969-7.4062 4.4062-16.078 1.6875-24-12-28.312-24-56.156-37.781-83.391-4.0781-5.9062-9.375-10.875-15.469-14.625zm352.55 0c-5.5312 3.75-10.266 8.5312-13.922 14.156-13.547 27.375-26.391 55.219-37.922 84-2.6719 7.875-2.2031 16.453 1.3125 24 24 42 49.781 84 75.938 124.55h0.046875c5.5312 7.1719 13.594 11.953 22.547 13.453 30.844 4.4531 62.062 7.4531 93.234 9.375 7.3594-0.75 13.922-4.9219 17.625-11.297 14.625-30.609 28.312-61.781 41.062-93.375 2.6719-7.4062 2.25-15.562-1.0781-22.641-23.062-39.703-46.688-78.938-71.297-117.7v-0.046875c-4.9219-7.0312-12.328-11.906-20.766-13.688-33.094-4.4062-66.703-6.9375-106.78-10.922zm-13.781 562.08c-22.219-30.984-43.828-61.922-66.141-91.688-4.3125-4.125-10.078-6.375-16.078-6.2344-53.297-0.65625-106.83-0.65625-160.69 0-5.9531 0.23438-11.625 2.8125-15.703 7.2188-22.312 30-43.781 60-65.766 91.078 22.547 28.922 43.453 56.625 65.625 84 5.4375 5.7656 12.844 9.2344 20.766 9.7031 50.719 0.79688 101.53 0.79688 152.39 0 7.5-0.51562 14.484-3.9375 19.453-9.6094 22.219-27.328 43.547-55.547 66.141-84.469zm-483.98-593.76c9.9844 2.9062 20.156 4.9688 30.469 6.1406 13.922 0 27.703-2.3906 41.531-3.8438 29.625-3.375 61.688-0.70312 88.547-11.391 46.688-19.828 91.781-43.172 134.9-69.844 7.4531-4.4531 7.0781-24 7.2188-37.312 0-4.0781-9.6094-9.2344-15.703-12-22.453-10.219-44.766-4.0781-67.219 1.3125h-0.046876c-84 20.016-160.36 64.125-219.71 126.94zm643.45 0c-63.047-67.172-145.69-112.78-236.16-130.22-16.969-1.9219-34.172-1.125-50.906 2.2969-5.7656 0.84375-15.375 7.7812-15.375 12 0 12.844 0 32.766 7.4531 37.219 43.547 25.688 89.297 48 134.39 71.062l0.046875-0.046875c3.2344 1.2656 6.7031 1.9219 10.172 2.0625 40.078 4.0781 80.156 8.5312 120 12 10.359-0.9375 20.578-3.2344 30.375-6.8438zm-747.71 192c-24 66.609-20.766 167.06 4.2188 248.86l-0.046876 0.046875c7.6406 25.125 23.109 47.156 44.156 62.859 24-12 24-12 23.391-36.938-1.7812-42.984-3.2344-85.594-5.625-127.82-0.23438-8.2031-1.9219-16.359-4.9219-24-14.719-35.109-30-70.078-45.844-104.86-4.3125-6.9375-9.4688-13.312-15.375-18.984zm804.61 310.78c59.156-48.703 87.375-226.22 46.781-308.53-4.3125 3.8438-9.9375 6.4688-12 10.547-21.141 56.625-60 107.16-56.062 172.31v0.046876c1.1719 29.953-0.09375 59.906-3.8438 89.625-1.5469 18.375 4.0781 29.906 25.078 35.203zm-246.52 223.69c77.578-23.672 146.86-68.859 199.78-130.31 10.594-14.297 18.984-30.047 24.984-46.781 1.6406-5.9062 0.14063-12.234-3.9844-16.828-8.1562-3.9375-20.766-9-26.859-5.3906-75 43.828-149.16 88.688-195.84 166.55-7.4531 12.281-10.078 20.438 1.9219 32.766zm-258 1.9219c0-12 3.1406-21.703 0-27.938-47.062-81.234-122.76-130.08-201.71-174.47-5.3906-3.1406-17.766 2.7656-24.938 7.4531l-0.046874-0.046875c-3.7969 4.8281-4.9219 11.203-3.0938 17.062 4.6406 15.141 11.766 29.438 21 42.328 55.219 64.219 127.64 111.28 208.78 135.61z" />
                  </svg>
                  Ball
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'add-equipment'; this.equipmentKind = 'cone'; this.selectedIds = new Set(); this._multiSelect = false; this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                    <circle cx="8" cy="8" r="5" fill="none" stroke="${COLORS.coneNeonOrange}" stroke-width="3.5" />
                    <circle cx="8" cy="8" r="2" fill="#d0d0d0" />
                  </svg>
                  Cone
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'add-equipment'; this.equipmentKind = 'dummy'; this.selectedIds = new Set(); this._multiSelect = false; this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                    <rect x="4.5" y="1.5" width="7" height="13" rx="3.5"
                          fill="none" stroke="${COLORS.coneChartreuse}" stroke-width="1.8" />
                    <rect x="6.5" y="3.5" width="3" height="9" rx="1.5"
                          fill="${COLORS.coneChartreuse}" fill-opacity="0.6" />
                  </svg>
                  Dummy
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'add-equipment'; this.equipmentKind = 'pole'; this.selectedIds = new Set(); this._multiSelect = false; this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                    <circle cx="8" cy="8" r="5.5" fill="none" stroke="#d0d0d0" stroke-width="1.5" />
                    <circle cx="8" cy="8" r="3" fill="${COLORS.coneChartreuse}" />
                  </svg>
                  Pole
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'add-equipment'; this.equipmentKind = 'goal'; this.selectedIds = new Set(); this._multiSelect = false; this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                    <rect x="3" y="1" width="7" height="14" fill="none" stroke="white" stroke-width="1.3"
                          stroke-dasharray="1.8,1" />
                    <line x1="3" y1="1" x2="3" y2="15" stroke="white" stroke-width="1.3" stroke-dasharray="none" />
                  </svg>
                  Goal
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'add-equipment'; this.equipmentKind = 'mini-goal'; this.selectedIds = new Set(); this._multiSelect = false; this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                    <rect x="3" y="3" width="5" height="10" fill="none" stroke="white" stroke-width="1.3"
                          stroke-dasharray="1.8,1" />
                    <line x1="3" y1="3" x2="3" y2="13" stroke="white" stroke-width="1.3" stroke-dasharray="none" />
                  </svg>
                  Mini Goal
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'add-equipment'; this.equipmentKind = 'popup-goal'; this.selectedIds = new Set(); this._multiSelect = false; this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                    <path d="M 5,1.5 A 6.5,6.5 0 0 1 5,14.5" fill="none" stroke="${COLORS.popupGoal}" stroke-width="1.3"
                          stroke-dasharray="1.8,1" />
                    <line x1="5" y1="1.5" x2="5" y2="14.5" stroke="${COLORS.popupGoal}" stroke-width="1.3" stroke-dasharray="none" />
                  </svg>
                  Pop-up Goal
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'add-equipment'; this.equipmentKind = 'coach'; this.selectedIds = new Set(); this._multiSelect = false; this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
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
                    tabindex="${this._sidebarFocusIndex === 3 ? 0 : -1}"
                    @click="${(e: Event) => { e.stopPropagation(); this.#openSidebarMenu('draw', 3); }}">
              <svg viewBox="0 0 1200 1200" width="20" height="20" fill="currentColor"><path d="m349.6 604.3-88.301 88.551c-9.75 9.6992-9.75 25.613 0.050781 35.352l17.699 17.699-123.65 123.95c-4.6992 4.6992-7.3008 11.113-7.3008 17.699 0 6.6016 2.6484 12.949 7.3516 17.699l53.102 53-79.602 79.75c-9.75 9.75-9.75 25.602 0.050781 35.352 4.8984 4.8984 11.25 7.3008 17.648 7.3008 6.3984 0 12.801-2.4492 17.699-7.3516l79.602-79.801 53.102 53c4.8984 4.8867 11.25 7.3008 17.648 7.3008s12.801-2.4609 17.699-7.3008l123.6-123.95 17.699 17.699c4.6992 4.6875 11.051 7.3008 17.648 7.3008 6.6484 0 13-2.7109 17.699-7.3008l88.301-88.562z"/><path d="m1060.9 325.05-150.74-150.3c-19.262-19.449-43.211-43.648-70.461-43.648-11.789 0-22.551 4.5-31.051 13.051l-70.637 70.801-88.551-88.301c-4.6992-4.6484-11.051-7.3008-17.648-7.3008-6.6484 0-13 2.6484-17.699 7.3516l-282.42 283.2c-9.6992 9.75-9.6992 25.602 0.050781 35.352 9.8008 9.6992 25.602 9.8008 35.352-0.050781l264.8-265.5 70.801 70.648-317.75 318.55 247.85 247.2 428.15-429.25c9-8.8008 17.488-17.148 17.488-30.898-0.035157-13.754-8.5352-22.102-17.535-30.902z"/></svg>
            </button>
            ${this._sidebarMenu === 'draw' ? html`
              <div role="menu" aria-label="Draw" @keydown="${this.#onSidebarMenuKeyDown}">
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'draw-line'; this.lineStyle = 'solid'; this.selectedIds = new Set(); this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 32 12" width="32" height="12" style="flex-shrink:0">
                    <line x1="2" y1="6" x2="22" y2="6" stroke="${COLORS.previewStroke}" stroke-width="2" />
                    <polygon points="20,2 28,6 20,10" fill="${COLORS.previewStroke}" />
                  </svg>
                  Pass / Shot
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'draw-line'; this.lineStyle = 'dashed'; this.selectedIds = new Set(); this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 32 12" width="32" height="12" style="flex-shrink:0">
                    <line x1="2" y1="6" x2="22" y2="6" stroke="${COLORS.previewStroke}" stroke-width="2" stroke-dasharray="4,3" />
                    <polygon points="20,2 28,6 20,10" fill="${COLORS.previewStroke}" />
                  </svg>
                  Run
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'draw-line'; this.lineStyle = 'wavy'; this.selectedIds = new Set(); this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 32 12" width="32" height="12" style="flex-shrink:0">
                    <path d="M 2,6 Q 5,2 8,6 Q 11,10 14,6 Q 17,2 20,6" fill="none" stroke="${COLORS.previewStroke}" stroke-width="2" />
                  </svg>
                  Dribble
                </button>
                <div class="sb-menu-separator"></div>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'draw-shape'; this.shapeKind = 'rect'; this.selectedIds = new Set(); this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                    <rect x="2" y="3" width="12" height="10" fill="none" stroke="${COLORS.previewStroke}" stroke-width="1.2" rx="0.5" />
                  </svg>
                  Rectangle
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this.activeTool = 'draw-shape'; this.shapeKind = 'ellipse'; this.selectedIds = new Set(); this._sidebarMenu = null; }}">
                  <svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                    <ellipse cx="8" cy="8" rx="7" ry="5" fill="none" stroke="${COLORS.previewStroke}" stroke-width="1.2" />
                  </svg>
                  Ellipse
                </button>
              </div>
            ` : nothing}
          </div>

          <!-- Text -->
          <button class="sidebar-tool"
                  title="Text (T)"
                  aria-label="Text"
                  aria-pressed="${t === 'add-text'}"
                  tabindex="${this._sidebarFocusIndex === 4 ? 0 : -1}"
                  @click="${() => { this.activeTool = 'add-text'; this.selectedIds = new Set(); this._sidebarFocusIndex = 4; }}">
            <svg viewBox="0 0 1200 1200" width="26" height="26" fill="currentColor">
              <path d="m1010.5 347.39c17.438 0 31.594-14.156 31.594-31.594v-126.32c0-17.438-14.156-31.594-31.594-31.594h-126.32c-17.438 0-31.594 14.156-31.594 31.594v31.594h-505.22v-31.594c0-17.438-14.156-31.594-31.594-31.594h-126.32c-17.438 0-31.594 14.156-31.594 31.594v126.32c0 17.438 14.156 31.594 31.594 31.594h31.594v505.26h-31.594c-17.438 0-31.594 14.156-31.594 31.594v126.32c0 17.438 14.156 31.594 31.594 31.594h126.32c17.438 0 31.594-14.156 31.594-31.594v-31.594h505.26v31.594c0 17.438 14.156 31.594 31.594 31.594h126.32c17.438 0 31.594-14.156 31.594-31.594v-126.32c0-17.438-14.156-31.594-31.594-31.594h-31.594l-0.046874-505.26zm-94.734-126.32h63.141v63.141h-63.141zm-694.74 0h63.141v63.141h-63.141zm63.141 757.87h-63.141v-63.141h63.141zm694.74 0h-63.141v-63.141h63.141zm-63.141-126.32h-31.594c-17.438 0-31.594 14.156-31.594 31.594v31.594h-505.22v-31.594c0-17.438-14.156-31.594-31.594-31.594h-31.594v-505.22h31.594c17.438 0 31.594-14.156 31.594-31.594v-31.594h505.26v31.594c0 17.438 14.156 31.594 31.594 31.594h31.594v505.26z"/>
              <path d="m789.47 378.94h-378.94c-17.438 0-31.594 14.156-31.594 31.594v63.141c0 17.438 14.156 31.594 31.594 31.594s31.594-14.156 31.594-31.594v-31.594h126.32v378.94c0 17.438 14.156 31.594 31.594 31.594s31.594-14.156 31.594-31.594v-378.94h126.32v31.594c0 17.438 14.156 31.594 31.594 31.594s31.594-14.156 31.594-31.594v-63.141c0-17.438-14.156-31.594-31.594-31.594z"/>
            </svg>
          </button>

          </div><!-- .sidebar-tools -->

          ${this.selectedIds.size > 0 ? html`
            <hr class="sidebar-divider" />
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
              @rotate-items="${this.#onRotateItems}">
            </cb-toolbar>
          ` : nothing}

        </nav><!-- .sidebar -->
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
              .marquee="${this._marquee}"
              .activeTool="${this.activeTool}"
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
                <div class="summary-section"><h3>Lines</h3><p>${[...this.#cachedSummary.linesByStyle.entries()].map(([st, n]) => `${n} ${st}${n > 1 ? 's' : ''}`).join(', ')}</p></div>
              ` : nothing}
              ${this.#cachedSummary.shapeCount > 0 ? html`<div class="summary-section"><h3>Shapes</h3><p>${this.#cachedSummary.shapeCount} shape${this.#cachedSummary.shapeCount > 1 ? 's' : ''}</p></div>` : nothing}
              ${this.#cachedSummary.textCount > 0 ? html`<div class="summary-section"><h3>Text</h3><p>${this.#cachedSummary.textCount} text item${this.#cachedSummary.textCount > 1 ? 's' : ''}</p></div>` : nothing}
              ${this.#cachedSummary.frameCount > 0 ? html`<div class="summary-section"><h3>Animation</h3><p>${this.#cachedSummary.frameCount} frame${this.#cachedSummary.frameCount > 1 ? 's' : ''}</p></div>` : nothing}
              ${this._boardNotes ? html`<div class="summary-section"><h3>Notes &amp; Instructions</h3><p style="white-space:pre-wrap">${this._boardNotes}</p></div>` : nothing}
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
            </div>
            <div class="bottom-center">
              ${!this._isMobile ? html`
                <button aria-pressed="${this._animationMode}"
                        title="Animate" aria-label="Animate"
                        @click="${this.#toggleAnimationMode}">
                  <svg viewBox="0 0 1200 1200" width="24" height="24" style="flex-shrink:0">
                    <path d="m846.12 420.12c-59.641-2.6406-113.88 35.16-131.88 92.039l-2.0391 6.6016-6.7188 1.4414c-81.84 18-141.24 91.922-141.24 175.68v93.84c0 31.68-23.762 58.922-54 61.801-16.801 1.6797-33.719-3.9609-46.199-15.238-12.48-11.398-19.68-27.602-19.68-44.398v-336c0-99.238-80.762-180-180-180-19.801 0-36 16.199-36 36s16.199 36 36 36c59.52 0 108 48.48 108 108v331.8c0 69.719 52.32 129.36 119.28 135.6 37.559 3.6016 73.68-8.3984 101.52-33.84 27.48-24.961 43.199-60.602 43.199-97.559v-96c0-43.68 26.039-82.801 66.48-99.719l11.039-4.6797 4.6797 11.039c20.641 49.32 68.52 81.238 121.8 81.238 36.238 0 69.961-14.398 95.16-40.559 25.078-26.16 38.16-60.48 36.719-96.719-2.6406-67.922-57.961-123.48-125.76-126.6zm-6.1211 191.88c-33.121 0-60-26.879-60-60s26.879-60 60-60 60 26.879 60 60-26.879 60-60 60z" fill="currentColor"/>
                  </svg>
                  <span class="btn-text">Animate</span>
                </button>
              ` : nothing}
              <label class="visually-hidden" for="field-theme-select">Pitch theme</label>
              <select id="field-theme-select" class="theme-select" aria-label="Pitch theme"
                      @change="${this.#onThemeChange}">
                <option value="green" ?selected="${this.fieldTheme === 'green'}">Green</option>
                <option value="white" ?selected="${this.fieldTheme === 'white'}">White</option>
              </select>
              ${!this._isMobile ? html`
                <div class="dropdown-wrap">
                  <button aria-label="${this.fieldOrientation === 'horizontal' ? 'Horizontal pitch' : 'Vertical pitch'}"
                          title="Pitch orientation"
                          @click="${this.#toggleFieldMenu}">
                    <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0">
                      ${this.fieldOrientation === 'horizontal'
                        ? svg`<path d="m1152 555.6-168-168c-24-24-63.602-24-87.602 0s-24 63.602 0 87.602l62.398 62.398h-716.4l62.398-62.398c24-24 24-63.602 0-87.602s-63.602-24-87.602 0l-168 168c-24 24-24 63.602 0 87.602l168 168c12 12 27.602 18 44.398 18 15.602 0 31.199-6 44.398-18 24-24 24-63.602 0-87.602l-62.398-62.398h716.4l-62.398 62.398c-24 24-24 63.602 0 87.602 12 12 27.602 18 44.398 18 16.801 0 31.199-6 44.398-18l168-168c21.609-24.004 21.609-62.402-2.3906-87.602z" fill="currentColor"/>`
                        : svg`<path d="m732 878.4-66 66v-690l66 66c13.199 13.199 30 19.199 46.801 19.199s33.602-6 46.801-19.199c26.398-26.398 26.398-67.199 0-93.602l-178.8-178.8c-25.199-24-68.402-24-93.602 0l-178.8 180c-26.398 26.398-26.398 67.199 0 93.602 26.398 26.398 67.199 25.199 93.602 0l66-66v690l-66-67.203c-26.398-26.398-67.199-26.398-93.602 0-26.398 26.398-26.398 67.199 0 93.602l178.8 178.8c13.199 13.199 30 19.199 46.801 19.199s33.602-6 46.801-19.199l178.8-178.8c26.398-26.398 26.398-67.199 0-93.602-25.203-26.398-67.203-26.398-93.602 0z" fill="currentColor"/>`}
                    </svg>
                    <span class="btn-text">${this.fieldOrientation === 'horizontal' ? 'Horizontal' : 'Vertical'} Pitch</span>
                    <span class="caret ${this._fieldMenuOpen ? 'open' : ''}"></span>
                  </button>
                  ${this._fieldMenuOpen ? html`
                    <div role="menu" aria-label="Pitch orientation">
                      <button role="menuitem"
                              @click="${() => this.#requestOrientation('horizontal')}">
                        <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0">
                          <path d="m1152 555.6-168-168c-24-24-63.602-24-87.602 0s-24 63.602 0 87.602l62.398 62.398h-716.4l62.398-62.398c24-24 24-63.602 0-87.602s-63.602-24-87.602 0l-168 168c-24 24-24 63.602 0 87.602l168 168c12 12 27.602 18 44.398 18 15.602 0 31.199-6 44.398-18 24-24 24-63.602 0-87.602l-62.398-62.398h716.4l-62.398 62.398c-24 24-24 63.602 0 87.602 12 12 27.602 18 44.398 18 16.801 0 31.199-6 44.398-18l168-168c21.609-24.004 21.609-62.402-2.3906-87.602z" fill="currentColor"/>
                        </svg>
                        Horizontal Pitch
                      </button>
                      <button role="menuitem"
                              @click="${() => this.#requestOrientation('vertical')}">
                        <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0">
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
                <svg viewBox="0 0 1200 1200" width="18" height="18" style="flex-shrink:0" fill="currentColor">
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
        .boardNotes="${this._boardNotes}"
        @cb-import-confirm="${this.#confirmImport}"
        @cb-save-board-confirm="${this.#confirmSaveBoard}"
        @cb-save-board-skip="${this.#skipSaveBoard}"
        @cb-save-board-closed="${this.#onSaveBoardClosed}"
        @cb-new-board-confirm="${this.#confirmNewBoard}"
        @cb-open-board="${this.#onOpenBoard}"
        @cb-duplicate-board="${this.#onDuplicateBoard}"
        @cb-handle-delete-board="${this.#onHandleDeleteBoard}"
        @cb-import-svg="${this.#importSvgFromMyBoards}"
        @cb-export-all-boards="${this.#exportAllBoards}"
        @cb-confirm-delete-board="${this.#confirmDeleteBoard}"
        @cb-export-svg="${this.#exportSvg}"
        @cb-export-png="${this.#exportPng}"
        @cb-export-gif="${this.#exportGif}"
        @cb-board-notes-input="${this.#onBoardNotesInput}"
        @cb-board-summary-closed="${() => this.#saveToStorage()}"
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
      <div class="rotate-overlay">
        <svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg">
          <path d="M880.71 163.3V163.32L740.23 163.16L738.09 127.98L882.89 128L880.71 163.3ZM106.9 438.69H106.88L105.81 458.31L105.78 459.55L105.99 479.2C106.11 489.65 114.67 498.03 125.12 497.92C135.5 497.81 143.84 489.35 143.84 479L143.63 459.77L144.64 441.37L146.85 423.11L150.26 405.01L154.85 387.19L160.6 369.72L167.5 352.63L175.49 336.07L184.57 320.03L194.67 304.65L205.76 289.97L217.8 276.04L230.73 262.93L244.27 250.89L258.55 239.75L273.53 229.55L289.13 220.35L305.29 212.18L321.96 205.07L339.06 199.05L356.5 194.15L374.21 190.39L392.15 187.78L409.75 186.38L388.69 203.43C384.01 207.22 381.58 212.76 381.58 218.35C381.58 222.59 382.98 226.86 385.86 230.41C392.52 238.64 404.61 239.91 412.84 233.25L475.4 182.59C479.9 178.95 482.51 173.47 482.53 167.68V167.59C482.53 161.81 479.9 156.42 475.4 152.77L413.16 102.35C404.93 95.68 392.85 96.95 386.18 105.18C383.3 108.73 381.9 113 381.9 117.25C381.9 122.84 384.33 128.38 389.01 132.17L409.17 148.5H409.04L407.82 148.56L388.53 150.1L387.31 150.24L368.17 153.02L366.96 153.24L348.04 157.26L346.85 157.55L328.23 162.78L327.06 163.15L308.81 169.58L307.67 170.03L289.88 177.62L288.77 178.14L271.51 186.87L270.44 187.46L253.78 197.29L252.74 197.95L236.75 208.83L235.76 209.55L220.51 221.45L219.57 222.23L205.11 235.09L204.22 235.94L190.42 249.93L189.58 250.84L176.73 265.71L175.95 266.68L164.1 282.36L163.39 283.38L152.6 299.81L151.95 300.87L142.27 317.97L141.69 319.07L133.15 336.77L132.64 337.91L125.28 356.13L124.85 357.3L118.71 375.97L118.36 377.17L113.45 396.2L113.18 397.41L109.54 416.72L109.35 417.95L106.98 437.46L106.93 438.7H106.88H106.9V438.69ZM1034.12 127.99H1035.01C1048.17 128.42 1058.72 139.24 1058.72 152.52V850.85L562.25 850.87V152.52C562.25 139.24 572.79 128.42 585.96 127.99L699.84 128.01L703.25 183.42C703.87 193.49 712.21 201.33 722.3 201.33L898.64 201.38C908.72 201.36 917.06 193.52 917.69 183.46L921.13 127.99H1034.12ZM165.32 878.25V878.27L130.31 880.29L130.22 735.5L165.38 737.71V737.73L165.32 878.26V878.25ZM810.51 955.19H810.54C821.5 955.19 830.33 964.07 830.33 975.02C830.33 985.97 821.45 994.85 810.5 994.85C799.55 994.85 790.67 985.97 790.67 975.02C790.67 964.07 799.52 955.19 810.47 955.19H810.52H810.51ZM810.5 916.95H810.46C778.39 916.95 752.43 942.95 752.43 975.02C752.43 1007.09 778.42 1033.08 810.49 1033.08C842.56 1033.08 868.56 1007.08 868.56 975.02C868.56 942.96 842.59 916.95 810.52 916.95H810.5ZM1058.75 1031.75V1031.8C1058.75 1045.02 1048.2 1056.26 1035.04 1056.28L585.98 1056.3C572.82 1055.87 562.26 1045.04 562.26 1031.76V889.07L1058.74 889.11V1031.75H1058.75ZM153.36 521.44V521.46C153.47 521.44 153.36 521.44 153.36 521.44C121.46 522.14 95.39 546.56 92.24 577.77V577.84C92.01 580 91.87 1031.59 91.87 1031.59C91.87 1055.47 105.03 1076.19 124.65 1086.81L124.74 1086.86C133.33 1091.56 143.14 1094.56 153.58 1094.56L481.57 1094.36C492.12 1094.36 500.68 1085.81 500.68 1075.26C500.68 1064.71 492.23 1056.26 481.77 1056.16C481.51 1056.16 154.65 1056.16 154.65 1056.16C150.38 1056.16 146.37 1055.07 142.87 1053.15L142.82 1053.12C135.64 1049 130.71 1041.43 130.42 1032.66L130.35 918.55L185.58 915.17C195.64 914.55 203.48 906.22 203.5 896.15C203.5 896.06 203.57 719.78 203.57 719.78C203.57 709.7 195.73 701.35 185.67 700.73L130.22 697.28L130.29 581.75C131.64 569.45 142.04 559.9 154.67 559.89L481.58 559.71C492.13 559.69 500.69 551.14 500.69 540.59C500.69 530.04 492.14 521.48 481.58 521.48H153.36V521.5V521.47V521.44ZM586.84 89.74H586.79C552.59 89.74 524.79 117.08 524.04 151.11V1033.18C524.81 1067.22 552.62 1094.56 586.81 1094.56H1034.2C1068.39 1094.54 1096.21 1067.2 1096.96 1033.17V151.11C1096.19 117.07 1068.38 89.73 1034.19 89.73H586.84V89.74Z" fill="white"/>
        </svg>
      </div>
      </div><!-- .app-board -->
      </div><!-- .app-wrap -->
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

  #skipSaveBoard(e: CustomEvent<{ pendingAction: PendingBoardAction }>) {
    const pendingAction = e.detail.pendingAction;
    const pendingId = this.#pendingOpenBoardId;
    this._dialogs?.closeSaveBoard();
    if (pendingAction === 'new') {
      this._dialogs?.openNewBoard();
    } else if (pendingAction === 'open') {
      this.#doOpenBoard(pendingId!);
    }
  }

  async #confirmSaveBoard(e: CustomEvent<{ name: string; pendingAction: PendingBoardAction }>) {
    const name = e.detail.name.trim();
    if (!name || !this.#currentBoard) return;
    const pendingAction = e.detail.pendingAction;
    const pendingId = this.#pendingOpenBoardId;
    this._dialogs?.closeSaveBoard();

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
      };
      await saveBoard(newBoard);
      this.#currentBoard = newBoard;
      this._boardName = name;
      setActiveBoardId(newBoard.id);
    } else {
      this.#currentBoard = { ...this.#currentBoard, name };
      this._boardName = name;
      saveBoard(this.#currentBoard).catch(() => {});
      if (pendingAction === 'new') {
        this._dialogs?.openNewBoard();
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
      const label = `${l.style === 'solid' ? 'Solid' : l.style === 'dashed' ? 'Dashed' : 'Wavy'}${hasArrow ? ' arrow' : ''}`;
      linesByStyle.set(label, (linesByStyle.get(label) ?? 0) + 1);
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
      shapeCount: this.shapes.length,
      textCount: this.textItems.length,
      frameCount: this.animationFrames.length,
    };
  }

  #showBoardSummary() {
    this._menuOpen = false;
    this._dialogs?.openBoardSummary(this.#getBoardSummary());
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
    this._dialogs?.openNewBoard();
  }

  async #confirmNewBoard(e: CustomEvent<{ pitchType: PitchType; template: string }>) {
    this._dialogs?.closeNewBoard();
    const { pitchType, template: templateId } = e.detail;
    const board = createEmptyBoard('Untitled Board', pitchType);
    await saveBoard(board);
    this.#currentBoard = board;
    this._boardName = board.name;
    setActiveBoardId(board.id);
    const template = templateId
      ? getTemplatesForPitch(pitchType).find(t => t.id === templateId)
      : null;
    const angleOrient = (this._isMobile && template) ? 'horizontal' : (this._isMobile ? 'vertical' : 'horizontal');
    const playerAngle = (team: string) => team === 'b'
      ? (angleOrient === 'horizontal' ? 270 : 180)
      : (angleOrient === 'horizontal' ? 90 : 0);

    this.players = template ? template.players.map(p => ({ ...p, id: uid('player'), angle: playerAngle(p.team) })) : [];
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
    this._dialogs?.openMyBoards(await listBoards());
  }

  #handleOpenBoard(id: string) {
    if (id === this.#currentBoard?.id) {
      this._dialogs?.closeMyBoards();
      return;
    }
    if (!this.#isBoardSaved && !this.#isBoardEmpty) {
      this.#pendingOpenBoardId = id;
      this._dialogs?.closeMyBoards();
      this._dialogs?.openSaveBoard('', 'open');
      return;
    }
    if (this.#isBoardEmpty && !this.#isBoardSaved && this.#currentBoard) {
      deleteBoard(this.#currentBoard.id).catch(() => {});
    }
    this._dialogs?.closeMyBoards();
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
    this._dialogs?.setMyBoards(await listBoards());
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
    this._dialogs?.setMyBoards(await listBoards());
    if (id === this.#currentBoard?.id) {
      await this.#confirmNewBoard(new CustomEvent('', { detail: { pitchType: 'full' as PitchType, template: '' } }));
    }
  }

  #importSvgFromMyBoards() {
    this._dialogs?.closeMyBoards();
    this.#importSvg();
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
  }

  #onOpenBoard(e: CustomEvent<{ id: string }>) {
    this.#handleOpenBoard(e.detail.id);
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

  #toggleFieldMenu() {
    this._fieldMenuOpen = !this._fieldMenuOpen;
  }

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
    if (this._viewMode === 'readonly') {
      this.#toggleReadonlyPlayback();
      return;
    }
    if (this.isPlaying) return;
    const pt = this._field.screenToSVG(e.clientX, e.clientY);

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
        this._multiSelect = false;
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

  #onPointerUp(_e: PointerEvent) {
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

  #onPointerLeave(_e: PointerEvent) {
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
      this.activeTool = 'select';
      this.ghost = null;
      this.selectedIds = new Set();
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
      case 'r':
        if (this.selectedIds.size > 0) {
          this.#onRotateItems(new RotateItemsEvent(-45));
        }
        break;
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
