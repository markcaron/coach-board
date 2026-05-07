import { LitElement, html, svg, css, nothing } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';

import type { Player, Line, Equipment, Shape, TextItem, Tool, LineStyle, EquipmentKind, ShapeKind, ShapeStyle, Team, FieldTheme, PitchType, AnimationFrame, FramePosition, TrailControlPoints } from '../lib/types.js';
import { COLORS, getTextColor, SHAPE_STYLES, getShapeStyles, getPlayerColors, getConeColors, getLineColors, PLAYER_COLORS, PLAYER_COLORS_WHITE, CONE_COLORS, CONE_COLORS_WHITE } from '../lib/types.js';
import { renderField, renderVerticalField, renderHalfField, renderVerticalHalfField, renderHalfFieldAttacking, renderVerticalHalfFieldAttacking, getFieldDimensions, FIELD } from '../lib/field.js';
import type { FieldOrientation } from '../lib/field.js';
import { screenToSVG, uid, ensureMinId } from '../lib/svg-utils.js';
import { saveBoard, loadBoard, listBoards, deleteBoard, createEmptyBoard, getActiveBoardId, setActiveBoardId, type SavedBoard } from '../lib/board-store.js';
import { ToolChangedEvent, ClearAllEvent, PlayerUpdateEvent, EquipmentUpdateEvent, LineUpdateEvent, ShapeUpdateEvent, TextUpdateEvent, AlignItemsEvent, GroupItemsEvent, UngroupItemsEvent, SaveSvgEvent, DeleteItemsEvent, MultiSelectToggleEvent, RotateItemsEvent, AutoNumberToggleEvent } from './cb-toolbar.js';
import type { AlignAction } from './cb-toolbar.js';

import './cb-toolbar.js';
import './cb-timeline.js';
import type { FrameSelectEvent, FrameDeleteEvent, SpeedChangeEvent } from './cb-timeline.js';

const PLAYER_RADIUS = 2.16;
const TEXT_FONT_SIZE = 2;

const WHITE_THEME = {
  fieldBg: COLORS.fieldBgWhite,
  fieldArea: COLORS.fieldAreaWhite,
  fieldLine: COLORS.fieldLineWhite,
  fieldNet: COLORS.fieldNetWhite,
  text: COLORS.fieldTextWhite,
  selection: COLORS.fieldSelWhite,
} as const;

function triPoints(cx: number, cy: number, r: number): string {
  const h = r * 1.32;
  return `${cx},${cy - h} ${cx - h * 0.866},${cy + h * 0.5} ${cx + h * 0.866},${cy + h * 0.5}`;
}

const BALL_RADIUS = 1.4175;
const CONE_OUTER_R = 1.0;
const CONE_OUTER_STROKE = 0.7;
const CONE_INNER_R = 0.35;
const DUMMY_OUTER_HW = 0.9;
const DUMMY_OUTER_HH = 1.65;
const DUMMY_OUTER_RX = 0.9;
const DUMMY_OUTER_STROKE = 0.35;
const DUMMY_INNER_HW = 0.5;
const DUMMY_INNER_HH = 1.25;
const DUMMY_INNER_RX = 0.5;
const POLE_RADIUS = 0.55;
const POLE_BASE_RADIUS = 0.85;
const POLE_BASE_COLOR = '#d0d0d0';
const GOAL_W = 7.32;
const GOAL_D = 2;
const MINI_GOAL_W = 3.66;
const MINI_GOAL_D = 1.5;
const POPUP_GOAL_W = 3;
const POPUP_GOAL_D = 1.5;
const POPUP_GOAL_COLOR = COLORS.popupGoal;
const GOAL_LINE_W = 0.18;
const CONTROL_HANDLE_R = 1.6;
const ROTATE_HANDLE_R = 0.875;
const HIT_SLOP = 1.8;
const HIT_SLOP_MOBILE = 3.0;
const PADDING = 4;

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

interface DrawState {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface ShapeDrawState {
  kind: ShapeKind;
  startX: number;
  startY: number;
  curX: number;
  curY: number;
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

interface GhostCursor {
  x: number;
  y: number;
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
}

const MAX_HISTORY = 50;

function wavyPath(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, amp = 0.48): string {
  const sampleCount = 64;
  const arcLengths: number[] = [0];
  let prevX = x1, prevY = y1;
  for (let i = 1; i <= sampleCount; i++) {
    const t = i / sampleCount;
    const bx = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
    const by = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;
    arcLengths.push(arcLengths[i - 1] + Math.hypot(bx - prevX, by - prevY));
    prevX = bx;
    prevY = by;
  }
  const totalLen = arcLengths[sampleCount];
  const waveLen = 3.5;
  const waves = Math.max(Math.round(totalLen / waveLen), 1);
  const tailFrac = 0.06;
  const waveFrac = 1 - tailFrac;
  const steps = Math.max(waves * 8, 32);

  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const bx = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
    const by = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;
    const dx = 2 * (1 - t) * (cx - x1) + 2 * t * (x2 - cx);
    const dy = 2 * (1 - t) * (cy - y1) + 2 * t * (y2 - cy);
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const waveProg = t < waveFrac ? t / waveFrac : 1;
    const fade = t < waveFrac ? 1 : 1 - ((t - waveFrac) / tailFrac);
    const wave = Math.sin(waveProg * waves * 2 * Math.PI) * amp * fade;
    pts.push({ x: bx + nx * wave, y: by + ny * wave });
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function isModifier(e: PointerEvent | MouseEvent): boolean {
  return e.shiftKey || e.metaKey || e.ctrlKey;
}

function rad2deg(r: number): number { return r * 180 / Math.PI; }

function lightenHex(hex: string, amount = 0.55): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

function isRotatable(item: Player | Equipment): boolean {
  if ('team' in item) return true;
  return item.kind === 'goal' || item.kind === 'mini-goal' || item.kind === 'popup-goal' || item.kind === 'dummy';
}

function circleHeadPath(r: number): string {
  const cutFrac = 0.22;
  const cutY = -r + r * cutFrac * 2;
  const dx = Math.sqrt(r * r - cutY * cutY);
  return `M ${-dx},${cutY} A ${r},${r} 0 0 1 ${dx},${cutY} Z`;
}

function diamondHeadPath(r: number): string {
  const s = r * 0.95;
  const cutFrac = 0.22;
  const cutY = -s + s * cutFrac * 2;
  return `M 0,${-s} L ${-(cutY + s)},${cutY} L ${(cutY + s)},${cutY} Z`;
}

function triHeadPath(r: number): string {
  const h = r * 1.32;
  const apex = -h;
  const baseY = h * 0.5;
  const hw = h * 0.866;
  const cutFrac = 0.3;
  const cutY = apex + (baseY - apex) * cutFrac;
  const slope = hw / (baseY - apex);
  const cutHW = slope * (cutY - apex);
  return `M 0,${apex} L ${-cutHW},${cutY} L ${cutHW},${cutY} Z`;
}

function renderRotateHandle(hx: number, hy: number, id: string, color = 'white') {
  const r = 0.875;
  return svg`
    <g transform="translate(${hx}, ${hy})"
       data-kind="rotate" data-id="${id}"
       style="cursor: grab">
      <circle r="${r + 0.6}" fill="transparent" />
      <path d="M ${-r * 0.5},${-r * 0.866} A ${r},${r} 0 0 1 ${r * 0.866},${r * 0.5}"
            fill="none" stroke="${color}" stroke-width="0.275" stroke-opacity="0.85" />
      <g transform="translate(${-r * 0.5},${-r * 0.866}) rotate(150)">
        <polygon points="0,-0.44 -0.375,0.25 0.375,0.25" fill="${color}" fill-opacity="0.85" />
      </g>
      <g transform="translate(${r * 0.866},${r * 0.5}) rotate(-30)">
        <polygon points="0,-0.44 -0.375,0.25 0.375,0.25" fill="${color}" fill-opacity="0.85" />
      </g>
    </g>
  `;
}

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
      display: flex;
      flex-direction: column;
      height: 100vh;
      height: 100dvh;
      overflow: hidden;
      overscroll-behavior: none;
      touch-action: none;
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

    .toolbar-area {
      flex-shrink: 0;
      z-index: 10;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      padding-top: env(safe-area-inset-top);
    }

    .readonly-branding {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      min-height: 60px;
      background: var(--pt-bg-toolbar);
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

    .board-name-bar {
      text-align: center;
      padding: 12px 12px 0;
      font-size: 0.75rem;
      color: var(--pt-text-muted);
      background: var(--pt-bg-body);
      user-select: none;
    }

    .board-name-bar.theme-white {
      background: var(--pt-field-area-white);
      color: var(--pt-color-gray-600);
    }

    .board-name-bar.theme-white .unsaved {
      color: var(--pt-color-gray-500);
    }

    .board-name-bar .unsaved {
      opacity: 0.6;
      font-style: italic;
    }

    .boards-list {
      list-style: none;
      margin: 0;
      padding: 0 0 32px;
      border-bottom: 1px solid var(--pt-border);
      max-height: 300px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .boards-list li {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .boards-list .board-info {
      flex: 1;
      min-width: 0;
    }

    .boards-list .board-open-btn {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--pt-bg-surface);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      color: inherit;
      cursor: pointer;
      text-align: left;
      min-width: 0;
      transition: background 0.15s;
    }

    .boards-list .board-open-btn:hover {
      background: var(--pt-border);
    }

    .boards-list .board-open-btn:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .boards-list .board-icon {
      flex-shrink: 0;
      color: white;
    }

    .boards-list .board-title {
      font-size: 0.85rem;
      color: var(--pt-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .boards-list .board-date {
      font-size: 0.7rem;
      color: var(--pt-text-muted);
      margin-top: 4px;
    }

    .item-description {
      font-size: 0.7rem;
      color: var(--pt-text-muted);
      margin-top: 4px;
    }

    .alert-warning {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 16px;
      background: rgba(180, 130, 20, 0.15);
      border: 1px solid rgba(255, 200, 60, 0.5);
      border-radius: 8px;
      color: #fdd835;
      font-size: 0.85rem;
      line-height: 1.4;
    }

    .alert-warning svg {
      flex-shrink: 0;
      margin-top: 1px;
    }

    .alert-info {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 16px;
      background: rgba(126, 87, 194, 0.12);
      border: 1px solid rgba(179, 157, 219, 0.45);
      border-radius: 8px;
      color: #b39ddb;
      font-size: 0.85rem;
      line-height: 1.4;
      margin-top: 32px;
    }

    .alert-info svg {
      flex-shrink: 0;
      margin-top: 1px;
    }

    .boards-list .action-btn {
      flex-shrink: 0;
      background: transparent;
      border: none;
      color: var(--pt-text-muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      min-width: 32px;
      min-height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .boards-list .action-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .boards-list .action-btn:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .boards-list .delete-btn {
      flex-shrink: 0;
      background: transparent;
      border: none;
      color: var(--pt-danger-lightest);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      min-width: 32px;
      min-height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .boards-list .delete-btn:hover {
      background: rgba(248, 113, 113, 0.15);
    }

    .export-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .export-options button {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 16px;
      background: var(--pt-bg-surface);
      border: 1px solid var(--pt-border);
      border-radius: 6px;
      color: var(--pt-text);
      font-size: 0.85rem;
      cursor: pointer;
      transition: background 0.15s;
      text-align: left;
    }

    .export-options button:hover {
      background: var(--pt-border);
    }

    .export-options button:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .boards-list .delete-btn:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .import-svg-btn:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .save-board-label {
      display: block;
      font-size: 0.8rem;
      color: var(--pt-text-muted);
      margin-top: 16px;
      margin-bottom: 6px;
    }

    .save-board-input {
      width: 100%;
      padding: 10px 12px;
      background: var(--pt-bg-primary);
      border: 1.5px solid var(--pt-border-ui);
      border-radius: 6px;
      color: var(--pt-text);
      font-size: 0.85rem;
      font-family: system-ui, -apple-system, sans-serif;
      box-sizing: border-box;
    }

    .save-board-input:focus {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .boards-action-row {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }

    .boards-action-row .import-svg-btn {
      margin-top: 0;
    }

    .import-svg-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 20px;
      min-height: 44px;
      margin-top: 16px;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      color: var(--pt-text-white);
      font-size: 0.85rem;
      cursor: pointer;
      width: 100%;
      justify-content: center;
    }

    .import-svg-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .field-area {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      touch-action: none;
      min-height: 0;
      padding: 12px;
      background: var(--pt-bg-body);
      transition: background 0.2s;
      position: relative;
    }

    .play-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 5;
      cursor: pointer;
    }

    .play-overlay-btn {
      width: 96px;
      height: 96px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .play-overlay-btn.press-out {
      animation: pressOut 0.3s ease-in forwards;
    }

    .play-overlay-btn.press-in {
      animation: pressIn 0.3s ease-out forwards;
    }

    @keyframes pressOut {
      0% { transform: scale(1); opacity: 1; }
      40% { transform: scale(0.85); opacity: 1; }
      100% { transform: scale(0.85); opacity: 0; }
    }

    @keyframes pressIn {
      0% { transform: scale(0.7); opacity: 0; }
      60% { transform: scale(1.05); opacity: 1; }
      100% { transform: scale(1); opacity: 1; }
    }

    .field-area.theme-white {
      background: var(--pt-field-area-white);
    }

    .svg-wrap {
      position: relative;
      width: 100%;
      max-width: 1100px;
      height: 100%;
    }

    .svg-wrap.vertical {
      max-width: 768px;
    }

    .svg-wrap > svg {
      display: block;
      width: 100%;
      height: 100%;
      cursor: default;
      user-select: none;
      touch-action: none;
    }

    .bottom-bar {
      flex-shrink: 0;
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

    .bottom-bar button.danger {
      background: transparent;
      color: var(--pt-danger-lightest);
      border-color: var(--pt-danger-lightest);
    }

    .bottom-bar button.danger:hover {
      background: rgba(248, 113, 113, 0.1);
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

    .svg-wrap > svg.tool-add-player,
    .svg-wrap > svg.tool-add-equipment,
    .svg-wrap > svg.tool-add-text {
      cursor: none;
    }

    .svg-wrap > svg.tool-draw-line,
    .svg-wrap > svg.tool-draw-shape {
      cursor: crosshair;
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

    .share-url-wrap {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }

    .share-editable-label {
      display: flex;
      align-items: center;
      margin-top: 12px;
      gap: 8px;
      font-size: 0.85rem;
      color: var(--pt-text);
      cursor: pointer;
      margin-right: auto;
    }

    .copied-label {
      font-size: 0.75rem;
      color: var(--pt-success-light);
      opacity: 0;
      transition: opacity 0.3s;
    }

    .copied-label.visible {
      opacity: 1;
    }

    .copy-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      color: var(--pt-text-muted);
      cursor: pointer;
      transition: color 0.15s, background 0.15s;
    }

    .copy-btn:hover {
      color: var(--pt-text-white);
      background: var(--pt-border);
    }

    .copy-btn:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .share-url {
      display: block;
      margin-top: 24px;
      padding: 10px 12px;
      background: var(--pt-bg-primary);
      border: 1px solid var(--pt-border);
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.7rem;
      color: var(--pt-text-muted);
      word-break: break-all;
      max-height: 80px;
      overflow-y: auto;
      user-select: all;
    }

    .bottom-bar [role="menuitem"].menu-indent {
      padding-left: 40px;
    }

    dialog:not([open]) {
      display: none;
    }

    dialog {
      background: var(--pt-bg-surface);
      border: 1px solid var(--pt-border);
      border-radius: 10px;
      padding: 0;
      max-width: 480px;
      width: calc(100% - 32px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      color: var(--pt-text);
      display: flex;
      flex-direction: column;
    }

    dialog::backdrop {
      background: rgba(0, 0, 0, 0.6);
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      flex-shrink: 0;
    }

    .dialog-header h2 {
      margin: 0;
      font-size: 0.95rem;
      font-weight: bold;
      color: var(--pt-text);
    }

    .dialog-close {
      background: transparent;
      border: none;
      color: var(--pt-text-muted);
      cursor: pointer;
      min-width: 44px;
      min-height: 44px;
      padding: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: color 0.15s;
      font: inherit;
    }

    .dialog-close:hover { color: var(--pt-text-white); }

    .dialog-close svg {
      width: 14px;
      height: 14px;
    }

    .dialog-body {
      padding: 20px 16px;
    }

    .dialog-body p {
      margin: 0;
      font-size: 0.85rem;
      color: var(--pt-text);
      line-height: 1.4;
    }

    .confirm-actions {
      display: flex;
      gap: 8px;
      justify-content: space-between;
      margin-top: 32px;
    }

    .confirm-actions.centered {
      justify-content: center;
      margin-top: 0;
    }

    .confirm-actions.end {
      justify-content: flex-end;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      font-size: 0.85rem;
      color: var(--pt-text);
      cursor: pointer;
    }

    .checkbox-label input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: var(--pt-accent);
      cursor: pointer;
    }

    .confirm-actions-right {
      display: flex;
      gap: 8px;
    }

    .about-close-row {
      display: flex;
      justify-content: flex-end;
      padding: 8px 8px 0;
    }

    .about-body {
      text-align: center;
      padding: 0 16px 32px;
    }

    .about-icon {
      width: 48px;
      height: 48px;
      margin-bottom: 12px;
      border: 2px solid #fff;
      border-radius: 50%;
    }

    .about-title {
      font-size: 1.2rem;
      font-weight: bold;
      color: var(--pt-text);
      margin-bottom: 12px;
    }

    .about-meta {
      font-size: 0.8rem;
      color: var(--pt-text-muted);
      margin-bottom: 2px;
    }

    .about-meta.last {
      margin-bottom: 24px;
    }

    .about-feedback {
      margin-top: 12px;
    }

    .about-link {
      color: var(--pt-accent);
      text-decoration: underline;
    }

    .about-link:hover {
      color: var(--pt-accent-hover);
    }

    .about-link:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    [role="menu"].menu-right {
      right: 0;
      left: auto;
      transform: none;
      min-width: 240px;
    }

    .confirm-actions button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 20px;
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

    .confirm-actions button:hover {
      background: var(--pt-border);
    }

    .confirm-actions button:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .dialog-close:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .confirm-actions .cancel-btn {
      border: 1px solid var(--pt-accent);
      color: var(--pt-text-white);
      background: transparent;
    }

    .confirm-actions .cancel-btn:hover {
      background: rgba(78, 168, 222, 0.15);
    }

    .confirm-actions .confirm-success {
      background: var(--pt-success-hover);
      border-color: var(--pt-success-hover);
      color: var(--pt-text-white);
    }

    .confirm-actions .confirm-success:hover {
      background: var(--pt-success-btn-hover);
    }

    .confirm-actions .confirm-danger {
      background: var(--pt-danger-hover);
      border-color: var(--pt-danger-hover);
      color: var(--pt-text-white);
    }

    .confirm-actions .confirm-danger:hover {
      background: var(--pt-danger);
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

    .notes-textarea {
      width: 100%;
      box-sizing: border-box;
      padding: 8px;
      font-size: 0.85rem;
      font-family: inherit;
      border: 1.5px solid var(--pt-border-ui);
      border-radius: 6px;
      background: var(--pt-surface);
      color: var(--pt-text);
      resize: vertical;
      min-height: 60px;
    }

    .notes-textarea::placeholder {
      color: var(--pt-text-muted);
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
      .toolbar-area, .bottom-bar, .board-name-bar,
      .play-overlay, .rotate-overlay, dialog {
        display: none !important;
      }
      .field-area {
        flex: none !important;
      }
      .svg-wrap.vertical {
        max-width: 50% !important;
      }
      :host(.print-summary) .print-summary-block {
        display: block;
        padding: 16px 4px;
        font-size: 11px;
        color: #333;
        background: white !important;
        page-break-inside: avoid;
      }
      :host(.print-white-bg) .field-area {
        background: white !important;
      }
      :host(.print-white-bg) #grass-stripes rect {
        fill: white !important;
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

  @query('svg') accessor svgEl!: SVGSVGElement;
  @query('#reset-dialog') accessor _resetDialog!: HTMLDialogElement;
  @query('#about-dialog') accessor _aboutDialog!: HTMLDialogElement;
  @query('#import-confirm-dialog') accessor _importConfirmDialog!: HTMLDialogElement;
  @query('#import-error-dialog') accessor _importErrorDialog!: HTMLDialogElement;
  @query('#svg-import-input') accessor _fileInput!: HTMLInputElement;
  @query('#share-dialog') accessor _shareDialog!: HTMLDialogElement;
  @query('#save-board-dialog') accessor _saveBoardDialog!: HTMLDialogElement;
  @query('#new-board-dialog') accessor _newBoardDialog!: HTMLDialogElement;
  @query('#my-boards-dialog') accessor _myBoardsDialog!: HTMLDialogElement;
  @query('#delete-board-dialog') accessor _deleteBoardDialog!: HTMLDialogElement;
  @query('#export-dialog') accessor _exportDialog!: HTMLDialogElement;
  @query('#board-summary-dialog') accessor _boardSummaryDialog!: HTMLDialogElement;
  @query('#print-dialog') accessor _printDialog!: HTMLDialogElement;
  @state() private accessor _boardName: string = 'Untitled Board';
  @state() private accessor _myBoards: SavedBoard[] = [];
  @state() private accessor _saveBoardName: string = '';
  @state() private accessor _newBoardPitchType: PitchType = 'full';
  @state() private accessor _deleteBoardName: string = '';
  @state() private accessor _printSummary: boolean = true;
  @state() private accessor _printWhiteBg: boolean = true;
  @state() private accessor _boardNotes: string = '';
  @state() private accessor _viewMode: 'normal' | 'readonly' | 'shared-edit' = 'normal';
  @state() private accessor _shareEditable: boolean = false;
  @state() private accessor _showPlayOverlay: boolean = true;
  @state() private accessor _pauseFlash: boolean = false;
  @state() private accessor _playBtnAnim: '' | 'press-out' | 'press-in' = '';
  @state() private accessor _shareMessage: string = '';
  @state() private accessor _shareUrl: string = '';
  #currentBoard: SavedBoard | null = null;
  #pendingBoardAction: 'new' | 'open' | 'save-as' | null = null;
  #pendingOpenBoardId: string | null = null;
  #pendingDeleteBoard: SavedBoard | null = null;
  #playBtnTimeout: ReturnType<typeof setTimeout> | null = null;
  #shareCompressed: string = '';
  #shareShortId: string = '';
  #lastSharedData: string = '';

  #groupDrag: GroupDragState | null = null;
  #handleDrag: HandleDragState | null = null;
  #rotateDrag: RotateDragState | null = null;
  #shapeResizeDrag: ShapeResizeDragState | null = null;
  #draw: DrawState | null = null;
  #shapeDraw: ShapeDrawState | null = null;
  #boundKeyDown = this.#onKeyDown.bind(this);
  #onDocClickForMenu = (e: PointerEvent) => {
    if (this._menuOpen && !e.composedPath().includes(this.renderRoot.querySelector('.bottom-right .dropdown-wrap') as EventTarget)) {
      this._menuOpen = false;
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
  #lastTapTime = 0;
  #lastTapId: string | null = null;
  #undoStack: Snapshot[] = [];
  #redoStack: Snapshot[] = [];
  #playbackRaf: number | null = null;
  #playbackLastTime: number | null = null;
  #trailDrag: { id: string; cp: 'cp1' | 'cp2' } | null = null;
  #isPrinting = false;
  #cachedSummary: {
    name: string; pitchLabel: string; orientation: string;
    playersByColor: Map<string, number>; coachCount: number;
    equipByKind: Map<string, number>; conesByColor: Map<string, number>;
    dummiesByColor: Map<string, number>; polesByColor: Map<string, number>;
    linesByStyle: Map<string, number>;
    shapeCount: number; textCount: number; frameCount: number;
  } | null = null;

  #snapshot(): Snapshot {
    return {
      players: structuredClone(this.players),
      lines: structuredClone(this.lines),
      equipment: structuredClone(this.equipment),
      shapes: structuredClone(this.shapes),
      textItems: structuredClone(this.textItems),
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
    saveBoard(this.#currentBoard).catch(() => { /* storage error */ });
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
      if (board.equipment.length) this.equipment = board.equipment;
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
    this.selectedIds = new Set();
  }

  #saveSvg() {
    this._menuOpen = false;
    const svgClone = this.svgEl.cloneNode(true) as SVGSVGElement;
    svgClone.querySelectorAll('[data-kind="rotate"]').forEach(el => el.remove());
    svgClone.querySelectorAll('[stroke-dasharray="0.5,0.3"], [stroke-dasharray="0.4,0.25"]').forEach(el => el.remove());
    svgClone.querySelectorAll('[data-kind="line-start"], [data-kind="line-end"], [data-kind="line-control"]').forEach(el => el.remove());
    svgClone.querySelectorAll(`[stroke="${COLORS.annotation}"]`).forEach(el => el.remove());
    svgClone.querySelectorAll('[stroke="transparent"]').forEach(el => el.remove());

    const meta = document.createElementNS('http://www.w3.org/2000/svg', 'desc');
    meta.setAttribute('id', 'coaching-board-data');
    meta.setAttribute('data-version', '1.0.1');
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
    const svgClone = this.svgEl.cloneNode(true) as SVGSVGElement;
    svgClone.querySelectorAll('[data-kind="rotate"]').forEach(el => el.remove());
    svgClone.querySelectorAll('[stroke-dasharray="0.5,0.3"], [stroke-dasharray="0.4,0.25"]').forEach(el => el.remove());
    svgClone.querySelectorAll('[data-kind="line-start"], [data-kind="line-end"], [data-kind="line-control"]').forEach(el => el.remove());
    svgClone.querySelectorAll(`[stroke="${COLORS.annotation}"]`).forEach(el => el.remove());
    svgClone.querySelectorAll('[stroke="transparent"]').forEach(el => el.remove());

    const vb = this.svgEl.viewBox.baseVal;
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

    const vb = this.svgEl.viewBox.baseVal;
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
      const svgClone = this.svgEl.cloneNode(true) as SVGSVGElement;
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

  get #selColor(): string {
    return this.fieldTheme === 'white' ? WHITE_THEME.selection : 'white';
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

  render() {
    const fd = getFieldDimensions(this.fieldOrientation, this.pitchType);
    const vbX = -PADDING;
    const vbY = -PADDING;
    const vbW = fd.w + PADDING * 2;
    const vbH = fd.h + PADDING * 2;

    return html`
      ${this._viewMode === 'readonly' ? html`
        <div class="toolbar-area readonly-branding">
          <a href="/" class="branding-link" title="Open CoachingBoard">
            <svg class="branding-icon" viewBox="0 0 1600 1600"><path d="M1600 801C1600 1242.28 1242.28 1600 801 1600C359.724 1600 2 1242.28 2 801C2 359.724 359.724 2 801 2C1242.28 2 1600 359.724 1600 801Z" fill="#55964D"/><path d="M801 2C1241.94 2 1599.46 359.184 1600 800H2.00195C2.54191 359.184 360.058 2 801 2Z" fill="#60A957"/><path d="M407.703 634.189C414.778 641.264 424.03 644.802 433.374 644.802C442.626 644.802 451.969 641.264 459.044 634.189L541.044 552.099L623.134 634.189C630.209 641.264 639.461 644.802 648.805 644.802C658.057 644.802 667.4 641.264 674.475 634.189C688.626 620.039 688.626 597.09 674.475 582.849L592.385 500.759L674.475 418.669C688.626 404.519 688.626 381.57 674.475 367.33C660.325 353.179 637.376 353.179 623.136 367.33L541.046 449.511L458.955 367.42C444.805 353.27 421.856 353.27 407.616 367.42C393.465 381.571 393.465 404.52 407.616 418.76L489.706 500.85L407.616 582.94C393.465 597 393.465 619.949 407.706 634.189H407.703Z" fill="white"/><path d="M912.405 1144.4C912.405 1232.51 984.12 1304.24 1072.2 1304.24C1160.29 1304.24 1232 1232.51 1232 1144.4C1232 1056.29 1160.29 984.65 1072.2 984.65C984.12 984.56 912.405 1056.29 912.405 1144.4ZM1159.66 1144.4C1159.66 1192.62 1120.41 1231.88 1072.21 1231.88C1024.01 1231.88 984.761 1192.62 984.761 1144.4C984.761 1096.19 1024.01 1057.02 1072.21 1057.02C1120.41 1056.93 1159.66 1096.19 1159.66 1144.4Z" fill="white"/><path d="M812.403 834.487L700.593 877.625C605.61 914.252 541.835 1007.22 541.835 1108.88V1268.14C541.835 1288.13 558.027 1304.32 578.019 1304.32C598.011 1304.32 614.203 1288.13 614.203 1268.14V1108.88C614.203 1036.89 659.344 971.049 726.646 945.093L838.456 901.955C933.349 865.328 997.124 772.446 997.124 670.701V480.418L1042.72 525.999C1049.77 533.053 1059 536.58 1068.32 536.58C1077.54 536.58 1086.86 533.053 1093.92 525.999C1108.03 511.89 1108.03 489.009 1093.92 474.811L986.45 367.368C972.338 353.26 949.451 353.26 935.25 367.368L827.782 474.811C813.67 488.919 813.67 511.891 827.782 525.999C834.838 533.053 844.065 536.58 853.383 536.58C862.61 536.58 871.927 533.053 878.984 525.999L924.757 480.236V670.792C924.757 742.691 879.615 808.531 812.403 834.487Z" fill="white"/></svg>
            <span class="branding-text">CoachingBoard</span>
          </a>
        </div>
      ` : html`
        <div class="toolbar-area">
          <cb-toolbar
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
        </div>
      `}

      ${this._viewMode !== 'readonly' ? html`
        <div class="board-name-bar ${this.fieldTheme === 'white' ? 'theme-white' : ''}">
          Board: ${this.#isBoardSaved
            ? this._boardName
            : html`<span class="unsaved">${this._boardName} (unsaved)</span>`}
        </div>
      ` : nothing}

      <div class="field-area ${this.fieldTheme === 'white' ? 'theme-white' : ''}">
        <div class="svg-wrap ${this.fieldOrientation === 'vertical' ? 'vertical' : ''}">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="${vbX} ${vbY} ${vbW} ${vbH}"
          preserveAspectRatio="xMidYMid meet"
          class="tool-${this.activeTool}"
          @pointerdown="${this.#onPointerDown}"
          @pointermove="${this.#onPointerMove}"
          @pointerup="${this.#onPointerUp}"
          @pointerleave="${this.#onPointerLeave}">

          ${this.#renderDefs()}

          <rect x="${-PADDING}" y="${-PADDING}"
                width="${fd.w + PADDING * 2}"
                height="${fd.h + PADDING * 2}"
                fill="${this.fieldTheme === 'white' ? 'white' : 'var(--pt-bg-body)'}" />

          <rect x="0" y="0"
                width="${fd.w}" height="${fd.h}"
                fill="${this.fieldTheme === 'white' ? 'white' : 'url(#grass-stripes)'}" rx="0.5" />

          ${(() => {
            const lc = this.fieldTheme === 'white' ? WHITE_THEME.fieldLine : 'white';
            const v = this.fieldOrientation === 'vertical';
            switch (this.pitchType) {
              case 'open': return nothing;
              case 'half': return v ? renderVerticalHalfField(lc) : renderHalfField(lc);
              case 'half-attack': return v ? renderVerticalHalfFieldAttacking(lc) : renderHalfFieldAttacking(lc);
              default: return v ? renderVerticalField(lc) : renderField(lc);
            }
          })()}

          <g class="shapes-layer">
            ${this.shapes.filter(s => !this.selectedIds.has(s.id)).map(s => this.#renderShape(s))}
            ${this.#shapeDraw ? this.#renderShapeDrawPreview() : nothing}
          </g>

          <g class="lines-layer">
            ${this.lines.filter(l => !this.selectedIds.has(l.id) && this.#isLineVisible(l.id)).map(l => this.#renderLine(l))}
            ${this.#draw ? this.#renderDrawPreview() : nothing}
          </g>

          ${this._animationMode && this.activeFrameIndex > 0 && !this.isPlaying && this._viewMode !== 'readonly' ? this.#renderGhostsAndTrails() : nothing}

          <g class="players-layer">
            ${this.#getFramePlayers().filter(p => !this.selectedIds.has(p.id)).map(p => this.#renderPlayer(p))}
          </g>

          <g class="equipment-layer">
            ${this.#getFrameEquipment().filter(eq => !this.selectedIds.has(eq.id)).map(eq => this.#renderEquipment(eq))}
          </g>

          <g class="text-layer">
            ${this.textItems.filter(t => !this.selectedIds.has(t.id)).map(t => this.#renderTextItem(t))}
          </g>

          <g class="selected-layer">
            ${this.shapes.filter(s => this.selectedIds.has(s.id)).map(s => this.#renderShape(s))}
            ${this.lines.filter(l => this.selectedIds.has(l.id) && this.#isLineVisible(l.id)).map(l => this.#renderLine(l))}
            ${this.#getFramePlayers().filter(p => this.selectedIds.has(p.id)).map(p => this.#renderPlayer(p))}
            ${this.#getFrameEquipment().filter(eq => this.selectedIds.has(eq.id)).map(eq => this.#renderEquipment(eq))}
            ${this.textItems.filter(t => this.selectedIds.has(t.id)).map(t => this.#renderTextItem(t))}
          </g>

          ${this.activeTool === 'add-player' && this.ghost
            ? this.playerTeam === 'a'
              ? svg`
                <polygon points="${triPoints(this.ghost.x, this.ghost.y, PLAYER_RADIUS)}"
                         fill="${this.playerColor}" fill-opacity="0.5"
                         stroke="${this.#selColor}" stroke-width="0.15" stroke-linejoin="round"
                         stroke-dasharray="0.4,0.3"
                         style="pointer-events: none" />`
              : this.playerTeam === 'neutral'
              ? svg`
                <rect x="${this.ghost.x - PLAYER_RADIUS * 0.95}" y="${this.ghost.y - PLAYER_RADIUS * 0.95}"
                      width="${PLAYER_RADIUS * 0.95 * 2}" height="${PLAYER_RADIUS * 0.95 * 2}"
                      rx="0.3" fill="${this.playerColor}" fill-opacity="0.5"
                      stroke="${this.#selColor}" stroke-width="0.15" stroke-dasharray="0.4,0.3"
                      transform="rotate(45 ${this.ghost.x} ${this.ghost.y})"
                      style="pointer-events: none" />`
              : svg`
                <circle cx="${this.ghost.x}" cy="${this.ghost.y}" r="${PLAYER_RADIUS}"
                        fill="${this.playerColor}" fill-opacity="0.5"
                        stroke="${this.#selColor}" stroke-width="0.15" stroke-dasharray="0.4,0.3"
                        style="pointer-events: none" />`
            : nothing}
          ${this.activeTool === 'add-equipment' && this.ghost
            ? this.#renderGhostEquipment()
            : nothing}
          ${this.activeTool === 'add-text' && this.ghost
            ? svg`
              <text x="${this.ghost.x}" y="${this.ghost.y}"
                    text-anchor="middle" dominant-baseline="central"
                    fill="${this.fieldTheme === 'white' ? WHITE_THEME.text : 'white'}" fill-opacity="0.5" font-size="${TEXT_FONT_SIZE}"
                    font-family="system-ui, sans-serif"
                    style="pointer-events: none">
                T
              </text>`
            : nothing}
        </svg>
        </div>
        ${this._viewMode === 'readonly' && this.animationFrames.length > 1 ? html`
          <div class="play-overlay" @click="${this.#toggleReadonlyPlayback}">
            ${this._showPlayOverlay ? html`
              <div class="play-overlay-btn ${this._playBtnAnim}">
                ${this._pauseFlash ? html`
                  <svg viewBox="0 0 16 16" width="42" height="42">
                    <rect x="4" y="3" width="3" height="10" rx="0.5" fill="white"/>
                    <rect x="9" y="3" width="3" height="10" rx="0.5" fill="white"/>
                  </svg>
                ` : html`
                  <svg viewBox="0 0 16 16" width="42" height="42">
                    <path d="M4.5 2l9 6-9 6z" fill="white"/>
                  </svg>
                `}
              </div>
            ` : nothing}
          </div>
        ` : nothing}
      </div>

      ${this._animationMode && !this._isMobile && this._viewMode !== 'readonly' ? html`
        <cb-timeline
          .frameCount="${this.animationFrames.length}"
          .activeFrame="${this.activeFrameIndex}"
          .isPlaying="${this.isPlaying}"
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

      <div class="bottom-bar${this._viewMode === 'readonly' ? ' readonly' : ''}">
        ${this._viewMode !== 'readonly' ? html`
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
        ` : html`<div class="bottom-left"></div>`}
        <div class="bottom-center">
          ${this._viewMode !== 'readonly' && !this._isMobile ? html`
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
          ${this._viewMode !== 'readonly' && !this._isMobile ? html`
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
          ${this._viewMode !== 'readonly' ? html`
          <button class="danger" aria-label="Reset all" title="Reset all"
                  @click="${this.#requestClearAll}">
            <svg viewBox="0 0 1600 1600" width="18" height="18" style="flex-shrink:0">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M515.399 422.213C594.372 362.859 692.519 327.687 798.799 327.687C1059.49 327.687 1271.12 539.313 1271.12 800.007C1271.12 1060.7 1059.49 1272.33 798.799 1272.33C550.319 1272.33 346.439 1080.03 327.866 836.273C325.22 801.607 351.199 771.347 385.866 768.7C420.532 766.053 450.792 792.033 453.439 826.7C467.075 1005.43 616.612 1146.37 798.799 1146.37C989.959 1146.37 1145.16 991.167 1145.16 799.993C1145.16 608.833 989.959 453.633 798.799 453.633C724.736 453.633 656.066 476.931 599.732 516.607H641.358C676.118 516.607 704.331 544.82 704.331 579.58C704.331 614.345 676.118 642.559 641.358 642.559H452.424C417.627 642.559 389.446 614.376 389.446 579.58V390.647C389.446 355.887 417.659 327.673 452.424 327.673C487.184 327.673 515.398 355.887 515.398 390.647L515.399 422.213Z" fill="currentColor"/>
            </svg>
            <span class="btn-text">Reset All</span>
          </button>
          ` : nothing}
          <div class="dropdown-wrap">
            <button aria-label="Menu" title="Menu"
                    aria-haspopup="menu"
                    aria-expanded="${this._menuOpen}"
                    @click="${this.#toggleMenu}"
                    @keydown="${this.#onMenuBtnKeyDown}">
              <svg viewBox="0 0 1200 1200" width="16" height="16" style="flex-shrink:0">
                <path d="m158.52 305.64h883.08c34.23-1.1992 65.363-20.152 82.141-50.016 16.781-29.859 16.781-66.309 0-96.172-16.777-29.859-47.91-48.816-82.141-50.012h-883.08c-26.613-0.93359-52.461 8.9883-71.617 27.484-19.156 18.5-29.973 43.984-29.973 70.613 0 26.629 10.816 52.117 29.973 70.613s45.004 28.418 71.617 27.488zm883.08 196.2h-883.08c-35.07 0-67.473 18.711-85.008 49.082-17.535 30.367-17.535 67.789 0 98.156 17.535 30.371 49.938 49.082 85.008 49.082h883.08c35.066 0 67.473-18.711 85.008-49.082 17.535-30.367 17.535-67.789 0-98.156-17.535-30.371-49.941-49.082-85.008-49.082zm0 392.52h-883.08c-26.613-0.92969-52.461 8.9922-71.617 27.488s-29.973 43.984-29.973 70.613c0 26.629 10.816 52.113 29.973 70.613 19.156 18.496 45.004 28.418 71.617 27.484h883.08c34.23-1.1953 65.363-20.152 82.141-50.012 16.781-29.863 16.781-66.312 0-96.172-16.777-29.863-47.91-48.816-82.141-50.016z" fill="currentColor" fill-rule="evenodd"/>
              </svg>
            </button>
            ${this._menuOpen ? html`
              <div role="menu" aria-label="Options" class="menu-right"
                   @keydown="${this.#onMenuKeyDown}">
                <button role="menuitem" tabindex="-1"
                        @click="${this.#showAbout}">
                  <svg viewBox="0 0 1200 1200" width="16" height="16" style="flex-shrink:0" fill="currentColor">
                    <path d="m600 112.5c-129.29 0-253.29 51.363-344.71 142.79-91.422 91.426-142.79 215.42-142.79 344.71s51.363 253.29 142.79 344.71c91.426 91.422 215.42 142.79 344.71 142.79s253.29-51.363 344.71-142.79c91.422-91.426 142.79-215.42 142.79-344.71-0.14453-129.25-51.555-253.16-142.95-344.55-91.395-91.391-215.3-142.8-344.55-142.95zm0 900c-109.4 0-214.32-43.461-291.68-120.82-77.359-77.355-120.82-182.28-120.82-291.68s43.461-214.32 120.82-291.68c77.355-77.359 182.28-120.82 291.68-120.82s214.32 43.461 291.68 120.82c77.359 77.355 120.82 182.28 120.82 291.68-0.11719 109.37-43.617 214.22-120.95 291.55s-182.18 120.83-291.55 120.95z"/>
                    <path d="m675 812.5h-37.5v-312.5c0-9.9453-3.9492-19.484-10.984-26.516-7.0312-7.0352-16.57-10.984-26.516-10.984h-25c-11.887 0.003906-23.066 5.6445-30.137 15.203-7.0664 9.5586-9.1836 21.898-5.707 33.266s12.137 20.414 23.344 24.383v277.15h-37.5c-13.398 0-25.777 7.1484-32.477 18.75-6.6992 11.602-6.6992 25.898 0 37.5 6.6992 11.602 19.078 18.75 32.477 18.75h150c13.398 0 25.777-7.1484 32.477-18.75 6.6992-11.602 6.6992-25.898 0-37.5-6.6992-11.602-19.078-18.75-32.477-18.75z"/>
                    <path d="m650 350c0 27.613-22.387 50-50 50s-50-22.387-50-50 22.387-50 50-50 50 22.387 50 50z"/>
                  </svg>
                  About
                </button>

                ${this._viewMode !== 'readonly' ? html`
                <div class="menu-divider"></div>
                <button role="menuitem" tabindex="-1"
                        @click="${this.#showMyBoards}">
                  <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0" fill="currentColor">
                    <path d="m250 1087.5h700c49.707-0.066406 97.359-19.84 132.51-54.992 35.152-35.148 54.926-82.801 54.992-132.51v-450c-0.066406-49.707-19.84-97.359-54.992-132.51-35.148-35.152-82.801-54.926-132.51-54.992h-287.9c-29.824-0.074219-58.41-11.918-79.551-32.949l-62.102-62.102c-35.199-35.098-82.84-54.863-132.55-55h-137.9c-49.715 0.066406-97.375 19.848-132.53 55.008-35.148 35.16-54.918 82.828-54.973 132.54v600c0.066406 49.707 19.84 97.359 54.992 132.51 35.148 35.152 82.801 54.926 132.51 54.992zm-112.5-787.5c0.039062-29.824 11.906-58.418 32.996-79.504 21.086-21.09 49.68-32.957 79.504-32.996h137.9c29.824 0.074219 58.41 11.918 79.551 32.949l62.102 62.102c35.199 35.098 82.84 54.863 132.55 55h287.9c29.816 0.039063 58.398 11.898 79.488 32.977 21.086 21.078 32.957 49.656 33.012 79.473v450c-0.039062 29.824-11.906 58.418-32.996 79.504-21.086 21.09-49.68 32.957-79.504 32.996h-700c-29.824-0.039062-58.418-11.906-79.504-32.996-21.09-21.086-32.957-49.68-32.996-79.504z"/>
                  </svg>
                  My Boards
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${this.#handleNewBoard}">
                  <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0" fill="currentColor">
                    <path d="m300 1137.5h600c62.965-0.078125 123.33-25.129 167.85-69.648 44.52-44.523 69.57-104.89 69.648-167.85v-600c-0.078125-62.965-25.129-123.33-69.648-167.85-44.523-44.52-104.89-69.57-167.85-69.648h-600c-62.965 0.078125-123.33 25.129-167.85 69.648-44.52 44.523-69.57 104.89-69.648 167.85v600c0.078125 62.965 25.129 123.33 69.648 167.85 44.523 44.52 104.89 69.57 167.85 69.648zm-162.5-837.5c0.054688-43.082 17.191-84.383 47.652-114.85 30.465-30.461 71.766-47.598 114.85-47.652h600c43.082 0.054688 84.383 17.191 114.85 47.652 30.461 30.465 47.598 71.766 47.652 114.85v600c-0.054688 43.082-17.191 84.383-47.652 114.85-30.465 30.461-71.766 47.598-114.85 47.652h-600c-43.082-0.054688-84.383-17.191-114.85-47.652-30.461-30.465-47.598-71.766-47.652-114.85z"/>
                    <path d="m400 637.5h162.5v162.5c0 13.398 7.1484 25.777 18.75 32.477 11.602 6.6992 25.898 6.6992 37.5 0 11.602-6.6992 18.75-19.078 18.75-32.477v-162.5h162.5c13.398 0 25.777-7.1484 32.477-18.75 6.6992-11.602 6.6992-25.898 0-37.5-6.6992-11.602-19.078-18.75-32.477-18.75h-162.5v-162.5c0-13.398-7.1484-25.777-18.75-32.477-11.602-6.6992-25.898-6.6992-37.5 0-11.602 6.6992-18.75 19.078-18.75 32.477v162.5h-162.5c-13.398 0-25.777 7.1484-32.477 18.75-6.6992 11.602-6.6992 25.898 0 37.5 6.6992 11.602 19.078 18.75 32.477 18.75z"/>
                  </svg>
                  New Board
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${this.#showSaveBoard}">
                  <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0" fill="currentColor">
                    <path d="m112.5 200v800c0.027344 36.461 14.523 71.418 40.301 97.199 25.781 25.777 60.738 40.273 97.199 40.301h700c36.461-0.027344 71.418-14.523 97.199-40.301 25.777-25.781 40.273-60.738 40.301-97.199v-615c0.027344-31.207-10.551-61.496-30-85.898l-148.05-185c-26.07-32.719-65.664-51.723-107.5-51.602h-551.95c-36.461 0.027344-71.418 14.523-97.199 40.301-25.777 25.781-40.273 60.738-40.301 97.199zm225 862.5v-362.5c0-6.9023 5.5977-12.5 12.5-12.5h500c3.3164 0 6.4961 1.3164 8.8398 3.6602s3.6602 5.5234 3.6602 8.8398v362.5zm375-925v112.5c0 3.3164-1.3164 6.4961-3.6602 8.8398s-5.5234 3.6602-8.8398 3.6602h-300c-6.9023 0-12.5-5.5977-12.5-12.5v-112.5zm-525 62.5c0.027344-16.566 6.6211-32.449 18.336-44.164 11.715-11.715 27.598-18.309 44.164-18.336h62.5v112.5c0.027344 23.199 9.2539 45.438 25.656 61.844 16.406 16.402 38.645 25.629 61.844 25.656h300c23.199-0.027344 45.438-9.2539 61.844-25.656 16.402-16.406 25.629-38.645 25.656-61.844v-112.5h14.449c18.996-0.042969 36.969 8.5938 48.801 23.449l148.1 185c8.8086 11.113 13.617 24.871 13.648 39.051v615c-0.027344 16.566-6.6211 32.449-18.336 44.164-11.715 11.715-27.598 18.309-44.164 18.336h-12.5v-362.5c-0.027344-23.199-9.2539-45.438-25.656-61.844-16.406-16.402-38.645-25.629-61.844-25.656h-500c-23.199 0.027344-45.438 9.2539-61.844 25.656-16.402 16.406-25.629 38.645-25.656 61.844v362.5h-12.5c-16.566-0.027344-32.449-6.6211-44.164-18.336-11.715-11.715-18.309-27.598-18.336-44.164z"/>
                    <path d="m750 762.5h-300c-13.398 0-25.777 7.1484-32.477 18.75-6.6992 11.602-6.6992 25.898 0 37.5 6.6992 11.602 19.078 18.75 32.477 18.75h300c13.398 0 25.777-7.1484 32.477-18.75 6.6992-11.602 6.6992-25.898 0-37.5-6.6992-11.602-19.078-18.75-32.477-18.75z"/>
                    <path d="m750 912.5h-300c-13.398 0-25.777 7.1484-32.477 18.75-6.6992 11.602-6.6992 25.898 0 37.5 6.6992 11.602 19.078 18.75 32.477 18.75h300c13.398 0 25.777-7.1484 32.477-18.75 6.6992-11.602 6.6992-25.898 0-37.5-6.6992-11.602-19.078-18.75-32.477-18.75z"/>
                  </svg>
                  Save Board
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${this.#handleSaveAs}">
                  <svg viewBox="0 0 16 16" width="14" height="14" style="flex-shrink:0" fill="none" stroke="currentColor" stroke-width="1.3">
                    <rect x="5" y="5" width="8" height="8" rx="1"/>
                    <path d="M3 11V3a1 1 0 0 1 1-1h8" stroke-linecap="round"/>
                  </svg>
                  Save As…
                </button>
                ` : nothing}

                <div class="menu-divider"></div>
                <button role="menuitem" tabindex="-1"
                        @click="${this.#shareLink}">
                  <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0" fill="currentColor">
                    <path d="m300 837.5c36.375-0.11328 72.234-8.625 104.79-24.867 32.547-16.242 60.906-39.781 82.863-68.781l233.15 125.6 0.003906-0.003906c-5.2422 18.062-8.0352 36.746-8.3008 55.551-0.25 51.039 17.758 100.48 50.77 139.41 33.012 38.922 78.852 64.762 129.25 72.844 50.395 8.0859 102.02-2.1172 145.55-28.762s76.102-67.973 91.828-116.53c15.727-48.555 13.57-101.13-6.0703-148.24-19.645-47.105-55.484-85.637-101.05-108.63-45.562-22.992-97.848-28.938-147.41-16.762-49.566 12.18-93.141 41.68-122.86 83.172l-229.45-123.6c18.93-50.207 18.93-105.59 0-155.8l229.7-123.6c29.523 40.945 72.699 70 121.75 81.93 49.047 11.93 100.75 5.9492 145.77-16.867 45.031-22.816 80.43-60.961 99.824-107.57 19.391-46.605 21.5-98.605 5.9453-146.63-15.551-48.023-47.746-88.91-90.781-115.3-43.031-26.387-94.074-36.539-143.93-28.621s-95.242 33.379-127.98 71.801c-32.742 38.418-50.688 87.27-50.598 137.75 0.26562 18.805 3.0586 37.488 8.3008 55.551l-233.4 125.6c-32.859-42.824-79.348-73.152-131.79-85.969-52.438-12.816-107.68-7.3516-156.59 15.488-48.91 22.84-88.559 61.688-112.39 110.12-23.832 48.434-30.422 103.55-18.676 156.24 11.742 52.688 41.117 99.785 83.266 133.51 42.148 33.727 94.543 52.055 148.52 51.961zm625-50c36.469 0 71.441 14.488 97.227 40.273 25.785 25.785 40.273 60.758 40.273 97.227s-14.488 71.441-40.273 97.227c-25.785 25.785-60.758 40.273-97.227 40.273s-71.441-14.488-97.227-40.273c-25.785-25.785-40.273-60.758-40.273-97.227 0.027344-36.461 14.523-71.418 40.301-97.199 25.781-25.777 60.738-40.273 97.199-40.301zm0-650c36.469 0 71.441 14.488 97.227 40.273 25.785 25.785 40.273 60.758 40.273 97.227s-14.488 71.441-40.273 97.227c-25.785 25.785-60.758 40.273-97.227 40.273s-71.441-14.488-97.227-40.273c-25.785-25.785-40.273-60.758-40.273-97.227 0.027344-36.461 14.523-71.418 40.301-97.199 25.781-25.777 60.738-40.273 97.199-40.301zm-625 300c43.098 0 84.43 17.121 114.91 47.594 30.473 30.477 47.594 71.809 47.594 114.91s-17.121 84.43-47.594 114.91c-30.477 30.473-71.809 47.594-114.91 47.594s-84.43-17.121-114.91-47.594c-30.473-30.477-47.594-71.809-47.594-114.91 0.054688-43.082 17.191-84.383 47.652-114.85 30.465-30.461 71.766-47.598 114.85-47.652z"/>
                  </svg>
                  Share Link
                </button>

                <div class="menu-divider"></div>
                ${this._viewMode !== 'readonly' ? html`
                <button role="menuitem" tabindex="-1"
                        @click="${this.#showBoardSummary}">
                  <svg viewBox="0 0 16 16" width="14" height="14" style="flex-shrink:0" fill="none" stroke="currentColor" stroke-width="1.3">
                    <rect x="2" y="2" width="12" height="12" rx="2"/>
                    <path d="M5 5h6M5 8h6M5 11h4" stroke-linecap="round"/>
                  </svg>
                  Board Summary
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${this.#showPrintDialog}">
                  <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0" fill="currentColor">
                    <path d="m1012.5 489.64h-82.836v-189.68c0-26.477-10.273-51.336-28.914-69.977l-85.5-85.5c-18.602-18.602-43.461-28.875-69.977-28.875l-373.01 0.003906c-56.25 0-102.04 45.789-102.04 102.04v271.99l-82.723-0.003906c-80.625 0-146.25 65.625-146.25 146.25v302.29c0 80.625 65.625 146.25 146.25 146.25h825c80.625 0 146.25-65.625 146.25-146.25v-302.29c0-80.625-65.625-146.25-146.25-146.25zm-159.49-211.91c5.8516 5.8516 9.0742 13.688 9.1133 22.125h-93.039c-12.863 0-23.324-10.461-23.324-23.324v-93.301c8.2891 0.11328 16.012 3.2617 21.75 9zm-515.25-60.078c0-19.051 15.449-34.5 34.5-34.5h305.96v93.375c0 50.102 40.762 90.863 90.863 90.863h93.039v122.25h-524.36zm556.2 799.24h-587.92v-109.73c0-2.1016 1.6484-3.75 3.75-3.75h580.46c2.1016 0 3.75 1.6484 3.75 3.75v109.73zm197.29-78.711c0 43.426-35.289 78.75-78.75 78.75h-51v-109.73c0-39.301-31.988-71.25-71.25-71.25h-580.46c-39.301 0-71.25 31.988-71.25 71.25v109.73h-51.039c-43.426 0-78.75-35.289-78.75-78.75v-302.29c0-43.426 35.289-78.75 78.75-78.75h825c43.426 0 78.75 35.289 78.75 78.75z"/>
                    <path d="m289.46 639.64h-64.461c-18.637 0-33.75 15.113-33.75 33.75s15.113 33.75 33.75 33.75h64.461c18.637 0 33.75-15.113 33.75-33.75s-15.109-33.75-33.75-33.75z"/>
                  </svg>
                  Print Board
                </button>
                ` : nothing}
                <button role="menuitem" tabindex="-1"
                        @click="${this.#showExportDialog}">
                  <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0" fill="currentColor">
                    <path d="m1100 787.5c-16.566 0.027344-32.449 6.6211-44.164 18.336-11.715 11.715-18.309 27.598-18.336 44.164v150c-0.027344 9.9375-3.9844 19.461-11.012 26.488-7.0273 7.0273-16.551 10.984-26.488 11.012h-800c-9.9375-0.027344-19.461-3.9844-26.488-11.012-7.0273-7.0273-10.984-16.551-11.012-26.488v-150c0-22.328-11.914-42.961-31.25-54.125-19.336-11.168-43.164-11.168-62.5 0-19.336 11.164-31.25 31.797-31.25 54.125v150c0.054688 43.082 17.191 84.383 47.652 114.85 30.465 30.461 71.766 47.598 114.85 47.652h800c43.082-0.054688 84.383-17.191 114.85-47.652 30.461-30.465 47.598-71.766 47.652-114.85v-150c-0.027344-16.566-6.6211-32.449-18.336-44.164-11.715-11.715-27.598-18.309-44.164-18.336z"/>
                    <path d="m600 37.5c-16.566 0.027344-32.449 6.6211-44.164 18.336-11.715 11.715-18.309 27.598-18.336 44.164v566.55l-197.5-164.55c-12.738-10.59-29.156-15.695-45.656-14.199-16.496 1.5-31.727 9.4844-42.344 22.199-10.59 12.738-15.695 29.156-14.199 45.656 1.5 16.496 9.4844 31.727 22.199 42.344l300 250c3.1484 2.2344 6.4961 4.1758 10 5.8008 2.2852 1.5312 4.6758 2.9023 7.1484 4.0977 14.566 6.1328 30.988 6.1328 45.551 0 2.4141-1.2031 4.7539-2.5547 7-4.0469 3.5039-1.6289 6.8477-3.5703 10-5.8008l300-250c13.23-11.004 21.336-26.977 22.41-44.148 1.0742-17.176-4.9766-34.031-16.73-46.598-11.758-12.566-28.172-19.73-45.379-19.805-14.613 0.027344-28.762 5.1562-40 14.5l-197.5 164.55v-566.55c-0.027344-16.566-6.6211-32.449-18.336-44.164-11.715-11.715-27.598-18.309-44.164-18.336z"/>
                  </svg>
                  Export Board
                </button>
              </div>
            ` : nothing}
          </div>
        </div>
      </div>

      <input type="file" accept=".svg,image/svg+xml" class="visually-hidden" id="svg-import-input"
             tabindex="-1" aria-label="Import SVG file"
             @change="${this.#onFileSelected}" />

      <dialog id="import-confirm-dialog">
        <div class="dialog-header">
          <h2>Import SVG</h2>
          <button class="dialog-close" aria-label="Close" title="Close" @click="${() => this._importConfirmDialog?.close()}">
            <svg viewBox="0 0 16 16"><path d="M 4,4 L 12,12 M 12,4 L 4,12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </button>
        </div>
        <div class="dialog-body">
          <p>Import this SVG as a new board?</p>
          <div class="confirm-actions">
            <button class="cancel-btn" @click="${() => this._importConfirmDialog?.close()}">Cancel</button>
            <button class="confirm-success" @click="${this.#confirmImport}">Import</button>
          </div>
        </div>
      </dialog>

      <dialog id="import-error-dialog">
        <div class="dialog-header">
          <h2>Import Error</h2>
          <button class="dialog-close" aria-label="Close" title="Close" @click="${() => this._importErrorDialog?.close()}">
            <svg viewBox="0 0 16 16"><path d="M 4,4 L 12,12 M 12,4 L 4,12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </button>
        </div>
        <div class="dialog-body">
          <p>This SVG was not exported from CoachingBoard and cannot be imported.</p>
          <div class="confirm-actions end">
            <button class="cancel-btn" @click="${() => this._importErrorDialog?.close()}">OK</button>
          </div>
        </div>
      </dialog>

      <dialog id="share-dialog">
        <div class="dialog-header">
          <h2>Share</h2>
          <button class="dialog-close" aria-label="Close" title="Close" @click="${() => this._shareDialog?.close()}">
            <svg viewBox="0 0 16 16"><path d="M 4,4 L 12,12 M 12,4 L 4,12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </button>
        </div>
        <div class="dialog-body">
          <p>${this._shareMessage}</p>
          ${this._shareUrl ? html`
            <code class="share-url">${this._shareUrl}</code>
            <label class="share-editable-label">
              <input type="checkbox" .checked="${this._shareEditable}" @change="${this.#onShareEditableChange}" />
              Keep editable
            </label>
          ` : nothing}
          <div class="confirm-actions">
            <button class="cancel-btn" @click="${() => this._shareDialog?.close()}">Close</button>
            ${this._shareUrl ? html`
              <button class="confirm-success" @click="${this.#copyAndClose}">
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style="flex-shrink:0">
                  <rect x="5" y="5" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M3 11V3a1 1 0 0 1 1-1h8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg>
                Copy link
              </button>
            ` : nothing}
          </div>
        </div>
      </dialog>

      <dialog id="reset-dialog">
        <div class="dialog-header">
          <h2>Reset all</h2>
          <button class="dialog-close" aria-label="Close" title="Close" @click="${this.#cancelClearAll}">
            <svg viewBox="0 0 16 16"><path d="M 4,4 L 12,12 M 12,4 L 4,12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </button>
        </div>
        <div class="dialog-body">
          <p>Are you sure you want to reset all items on the board?</p>
          <div class="confirm-actions">
            <button class="cancel-btn" @click="${this.#cancelClearAll}">Cancel</button>
            <button class="confirm-danger" @click="${this.#confirmClearAll}">Yes, reset all</button>
          </div>
        </div>
      </dialog>

      <dialog id="about-dialog">
        <div class="about-close-row">
          <button class="dialog-close" aria-label="Close" title="Close" @click="${() => this._aboutDialog?.close()}">
            <svg viewBox="0 0 16 16"><path d="M 4,4 L 12,12 M 12,4 L 4,12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </button>
        </div>
        <div class="dialog-body about-body">
          <svg class="about-icon" viewBox="0 0 1600 1600"><path d="M1600 801C1600 1242.28 1242.28 1600 801 1600C359.724 1600 2 1242.28 2 801C2 359.724 359.724 2 801 2C1242.28 2 1600 359.724 1600 801Z" fill="#55964D"/><path d="M801 2C1241.94 2 1599.46 359.184 1600 800H2.00195C2.54191 359.184 360.058 2 801 2Z" fill="#60A957"/><path d="M407.703 634.189C414.778 641.264 424.03 644.802 433.374 644.802C442.626 644.802 451.969 641.264 459.044 634.189L541.044 552.099L623.134 634.189C630.209 641.264 639.461 644.802 648.805 644.802C658.057 644.802 667.4 641.264 674.475 634.189C688.626 620.039 688.626 597.09 674.475 582.849L592.385 500.759L674.475 418.669C688.626 404.519 688.626 381.57 674.475 367.33C660.325 353.179 637.376 353.179 623.136 367.33L541.046 449.511L458.955 367.42C444.805 353.27 421.856 353.27 407.616 367.42C393.465 381.571 393.465 404.52 407.616 418.76L489.706 500.85L407.616 582.94C393.465 597 393.465 619.949 407.706 634.189H407.703Z" fill="white"/><path d="M912.405 1144.4C912.405 1232.51 984.12 1304.24 1072.2 1304.24C1160.29 1304.24 1232 1232.51 1232 1144.4C1232 1056.29 1160.29 984.65 1072.2 984.65C984.12 984.56 912.405 1056.29 912.405 1144.4ZM1159.66 1144.4C1159.66 1192.62 1120.41 1231.88 1072.21 1231.88C1024.01 1231.88 984.761 1192.62 984.761 1144.4C984.761 1096.19 1024.01 1057.02 1072.21 1057.02C1120.41 1056.93 1159.66 1096.19 1159.66 1144.4Z" fill="white"/><path d="M812.403 834.487L700.593 877.625C605.61 914.252 541.835 1007.22 541.835 1108.88V1268.14C541.835 1288.13 558.027 1304.32 578.019 1304.32C598.011 1304.32 614.203 1288.13 614.203 1268.14V1108.88C614.203 1036.89 659.344 971.049 726.646 945.093L838.456 901.955C933.349 865.328 997.124 772.446 997.124 670.701V480.418L1042.72 525.999C1049.77 533.053 1059 536.58 1068.32 536.58C1077.54 536.58 1086.86 533.053 1093.92 525.999C1108.03 511.89 1108.03 489.009 1093.92 474.811L986.45 367.368C972.338 353.26 949.451 353.26 935.25 367.368L827.782 474.811C813.67 488.919 813.67 511.891 827.782 525.999C834.838 533.053 844.065 536.58 853.383 536.58C862.61 536.58 871.927 533.053 878.984 525.999L924.757 480.236V670.792C924.757 742.691 879.615 808.531 812.403 834.487Z" fill="white"/></svg>
          <div class="about-title">CoachingBoard</div>
          <div class="about-meta">Version 1.0.1</div>
          <div class="about-meta">by Mark Caron</div>
          <div class="about-meta last about-feedback"><a href="https://github.com/markcaron/coach-board/issues/new" target="_blank" rel="noopener" class="about-link">Feedback</a></div>
          <div class="confirm-actions centered">
            <button class="cancel-btn" @click="${() => this._aboutDialog?.close()}">OK</button>
          </div>
        </div>
      </dialog>

      <dialog id="save-board-dialog" @close="${() => { this.#pendingBoardAction = null; this.#pendingOpenBoardId = null; }}">
        <div class="dialog-header">
          <h2>${this.#pendingBoardAction === 'save-as' ? 'Save As' : this.#pendingBoardAction ? 'Save Current Board' : 'Save Board'}</h2>
          <button class="dialog-close" aria-label="Close" title="Close" @click="${() => this._saveBoardDialog?.close()}">
            <svg viewBox="0 0 16 16"><path d="M 4,4 L 12,12 M 12,4 L 4,12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </button>
        </div>
        <div class="dialog-body">
          <p>${this.#pendingBoardAction === 'save-as' ? 'Save a copy of this board with a new name.' : this.#pendingBoardAction ? 'Give your current board a name to save it, first.' : 'Give your board a name to save it.'}</p>
          <label class="save-board-label" for="save-board-input">Board name</label>
          <input class="save-board-input" id="save-board-input" type="text" placeholder="Board name"
                 .value="${this._saveBoardName}"
                 @input="${(e: Event) => { this._saveBoardName = (e.target as HTMLInputElement).value; }}"
                 @keydown="${(e: KeyboardEvent) => { if (e.key === 'Enter' && this._saveBoardName.trim()) this.#confirmSaveBoard(); }}" />
          <div class="confirm-actions">
            <button class="cancel-btn" @click="${() => this._saveBoardDialog?.close()}">Cancel</button>
            <button class="confirm-success" ?disabled="${!this._saveBoardName.trim()}" @click="${this.#confirmSaveBoard}">Save</button>
          </div>
        </div>
      </dialog>

      <dialog id="new-board-dialog">
        <div class="dialog-header">
          <h2>New Board</h2>
          <button class="dialog-close" aria-label="Close" title="Close" @click="${() => this._newBoardDialog?.close()}">
            <svg viewBox="0 0 16 16"><path d="M 4,4 L 12,12 M 12,4 L 4,12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </button>
        </div>
        <div class="dialog-body">
          <p>Create a new empty board?</p>
          <label class="save-board-label" for="new-board-pitch-type">Pitch type</label>
          <select class="theme-select" id="new-board-pitch-type"
                  @change="${(e: Event) => { this._newBoardPitchType = (e.target as HTMLSelectElement).value as PitchType; }}">
            <option value="full" ?selected="${this._newBoardPitchType === 'full'}">Full Pitch</option>
            <option value="half" ?selected="${this._newBoardPitchType === 'half'}">Half Pitch (Defensive)</option>
            <option value="half-attack" ?selected="${this._newBoardPitchType === 'half-attack'}">Half Pitch (Attacking)</option>
            <option value="open" ?selected="${this._newBoardPitchType === 'open'}">Open Grass</option>
          </select>
          <div class="confirm-actions">
            <button class="cancel-btn" @click="${() => this._newBoardDialog?.close()}">Cancel</button>
            <button class="confirm-success" @click="${this.#confirmNewBoard}">Create New Board</button>
          </div>
        </div>
      </dialog>

      <dialog id="my-boards-dialog">
        <div class="dialog-header">
          <h2>My Boards</h2>
          <button class="dialog-close" aria-label="Close" title="Close" @click="${() => this._myBoardsDialog?.close()}">
            <svg viewBox="0 0 16 16"><path d="M 4,4 L 12,12 M 12,4 L 4,12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </button>
        </div>
        <div class="dialog-body">
          ${this._myBoards.filter(b => b.name !== 'Untitled Board').length ? html`
            <h3 style="font-size: 0.8rem; color: var(--pt-text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 8px;">Saved Boards</h3>
            <ul class="boards-list">
              ${this._myBoards.filter(b => b.name !== 'Untitled Board').map(b => html`
                <li>
                  <button class="board-open-btn" aria-label="Open ${b.name}" @click="${() => this.#handleOpenBoard(b.id)}">
                    <svg class="board-icon" viewBox="0 0 1200 1200" width="28" height="28" aria-hidden="true" fill="currentColor" style="transform: rotate(90deg)">
                      <path d="m1050.2 206.34h-900.37c-50.016 0-90.703 40.688-90.703 90.703v605.86c0 50.016 40.688 90.703 90.703 90.703h900.42c50.016 0 90.703-40.688 90.703-90.703v-605.81c0-50.062-40.734-90.75-90.75-90.75zm58.875 696.56c0 32.484-26.391 58.875-58.875 58.875h-900.37c-32.484 0-58.875-26.391-58.875-58.875v-605.81c0-32.484 26.391-58.875 58.875-58.875h900.42c32.484 0 58.875 26.391 58.875 58.875v605.81z"/>
                      <path d="m1031.3 300.1h-862.5c-8.8125 0-15.938 7.125-15.938 15.938v568.03c0 8.8125 7.125 15.938 15.938 15.938h862.5c8.8125 0 15.938-7.125 15.938-15.938v-568.03c0-8.8125-7.125-15.938-15.938-15.938zm-447.19 410.48c-54.281-7.8281-96.281-54.188-96.281-110.58s42-102.75 96.281-110.58zm31.875-221.16c54.281 7.8281 96.281 54.188 96.281 110.58s-42 102.75-96.281 110.58zm-431.26 20.719h53.062c11.719 0 21.328 9.5625 21.328 21.328v137.02c0 11.719-9.5625 21.328-21.328 21.328l-53.062 0.046875zm0 211.6h53.062c29.344 0 53.156-23.859 53.156-53.156v-137.02c0-29.344-23.859-53.156-53.156-53.156l-53.062-0.046875v-146.39h399.37v125.63c-71.859 8.0625-128.16 68.484-128.16 142.4 0 73.969 56.25 134.39 128.16 142.4v125.63h-399.37zm431.26 146.29v-125.63c71.859-8.0625 128.16-68.484 128.16-142.4 0-73.969-56.25-134.39-128.16-142.4v-125.63h399.37v146.34l-53.062-0.046875c-29.344 0-53.156 23.859-53.156 53.156v137.02c0 29.344 23.859 53.156 53.156 53.156h53.062v146.34l-399.37 0.046874zm399.37-178.18h-53.062c-11.719 0-21.328-9.5625-21.328-21.328v-137.02c0-11.719 9.5625-21.328 21.328-21.328h53.062z"/>
                    </svg>
                    <div class="board-info">
                      <div class="board-title">${b.name}</div>
                      <div class="board-date">${new Date(b.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${b.pitchType === 'half' ? 'Half (Def.)' : b.pitchType === 'half-attack' ? 'Half (Att.)' : b.pitchType === 'open' ? 'Open Grass' : 'Full Pitch'}</div>
                    </div>
                  </button>
                  <button class="action-btn" title="Duplicate ${b.name}" aria-label="Duplicate ${b.name}"
                          @click="${() => this.#duplicateBoard(b)}">
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                      <rect x="5" y="5" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/>
                      <path d="M3 11V3a1 1 0 0 1 1-1h8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                    </svg>
                  </button>
                  <button class="delete-btn" title="Delete ${b.name}" aria-label="Delete ${b.name}"
                          @click="${() => this.#handleDeleteBoard(b)}">
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                      <path d="M4 4h8l-1 10H5L4 4z" fill="none" stroke="currentColor" stroke-width="1.2"/>
                      <path d="M3 4h10M6 2h4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                    </svg>
                  </button>
                </li>
              `)}
            </ul>
          ` : html`
            <div class="alert-warning">
              <svg viewBox="0 0 1200 1200" width="20" height="20" style="flex-shrink:0" fill="#fdd835">
                <path d="m600 431.77c-18.637 0-33.75 15.113-33.75 33.75v233.36c0 18.637 15.113 33.75 33.75 33.75s33.75-15.113 33.75-33.75v-233.36c0-18.637-15.113-33.75-33.75-33.75z"/>
                <path d="m600 789.56c-18.637 0-33.75 15.113-33.75 33.75v20.625c0 18.637 15.113 33.75 33.75 33.75s33.75-15.113 33.75-33.75v-20.625c0-18.637-15.113-33.75-33.75-33.75z"/>
                <path d="m1102.7 847.57-401.81-624.9c-22.164-34.426-59.887-55.012-100.88-55.012s-78.711 20.586-100.88 55.051v0.039062l-401.81 624.82c-24.113 37.461-25.762 83.211-4.3867 122.36 21.336 39.113 60.711 62.477 105.3 62.477h803.62c44.551 0 83.926-23.363 105.3-62.477 21.297-39.188 19.648-84.898-4.4648-122.36zm-54.863 89.965c-9.3359 17.137-26.551 27.336-46.051 27.336h-803.59c-19.5 0-36.711-10.164-46.051-27.336-9.3359-17.102-8.625-37.086 1.9141-53.512l401.81-624.83c19.688-30.523 68.551-30.523 88.273 0l401.81 624.82c10.539 16.426 11.215 36.414 1.875 53.516z"/>
              </svg>
              <span>No saved boards yet.</span>
            </div>
          `}
          <div class="alert-info">
            <svg viewBox="0 0 1200 1200" width="20" height="20" style="flex-shrink:0" fill="#b39ddb">
              <path d="m600 112.5c-129.29 0-253.29 51.363-344.71 142.79-91.422 91.426-142.79 215.42-142.79 344.71s51.363 253.29 142.79 344.71c91.426 91.422 215.42 142.79 344.71 142.79s253.29-51.363 344.71-142.79c91.422-91.426 142.79-215.42 142.79-344.71-0.14453-129.25-51.555-253.16-142.95-344.55-91.395-91.391-215.3-142.8-344.55-142.95zm0 900c-109.4 0-214.32-43.461-291.68-120.82-77.359-77.355-120.82-182.28-120.82-291.68s43.461-214.32 120.82-291.68c77.355-77.359 182.28-120.82 291.68-120.82s214.32 43.461 291.68 120.82c77.359 77.355 120.82 182.28 120.82 291.68-0.11719 109.37-43.617 214.22-120.95 291.55s-182.18 120.83-291.55 120.95z"/>
              <path d="m675 812.5h-37.5v-312.5c0-9.9453-3.9492-19.484-10.984-26.516-7.0312-7.0352-16.57-10.984-26.516-10.984h-25c-11.887 0.003906-23.066 5.6445-30.137 15.203-7.0664 9.5586-9.1836 21.898-5.707 33.266s12.137 20.414 23.344 24.383v277.15h-37.5c-13.398 0-25.777 7.1484-32.477 18.75-6.6992 11.602-6.6992 25.898 0 37.5 6.6992 11.602 19.078 18.75 32.477 18.75h150c13.398 0 25.777-7.1484 32.477-18.75 6.6992-11.602 6.6992-25.898 0-37.5-6.6992-11.602-19.078-18.75-32.477-18.75z"/>
              <path d="m650 350c0 27.613-22.387 50-50 50s-50-22.387-50-50 22.387-50 50-50 50 22.387 50 50z"/>
            </svg>
            <span>All board data is saved to your browser's local storage. Exporting boards as backup SVGs is the best way to keep backups.</span>
          </div>
          <div class="boards-action-row">
            <button class="import-svg-btn" @click="${this.#importSvgFromMyBoards}">
              <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0" fill="currentColor">
                <path d="m1100 787.5c-16.566 0.027344-32.449 6.6211-44.164 18.336-11.715 11.715-18.309 27.598-18.336 44.164v150c-0.027344 9.9375-3.9844 19.461-11.012 26.488-7.0273 7.0273-16.551 10.984-26.488 11.012h-800c-9.9375-0.027344-19.461-3.9844-26.488-11.012-7.0273-7.0273-10.984-16.551-11.012-26.488v-150c0-22.328-11.914-42.961-31.25-54.125-19.336-11.168-43.164-11.168-62.5 0-19.336 11.164-31.25 31.797-31.25 54.125v150c0.054688 43.082 17.191 84.383 47.652 114.85 30.465 30.461 71.766 47.598 114.85 47.652h800c43.082-0.054688 84.383-17.191 114.85-47.652 30.461-30.465 47.598-71.766 47.652-114.85v-150c-0.027344-16.566-6.6211-32.449-18.336-44.164-11.715-11.715-27.598-18.309-44.164-18.336z"/>
                <path d="m600 862.5c16.566-0.027344 32.449-6.6211 44.164-18.336 11.715-11.715 18.309-27.598 18.336-44.164v-566.55l197.5 164.55c12.738 10.59 29.156 15.695 45.656 14.199 16.496-1.5 31.727-9.4844 42.344-22.199 10.59-12.738 15.695-29.156 14.199-45.656-1.5-16.496-9.4844-31.727-22.199-42.344l-300-250c-3.1562-2.2227-6.5039-4.1641-10-5.8008-2.2656-1.4922-4.6172-2.8477-7.0508-4.0508-14.562-6.1289-30.984-6.1289-45.551 0-2.5508 1.1875-5.0234 2.5391-7.3984 4.0508-3.5 1.6328-6.8438 3.5742-10 5.8008l-300 250c-13.23 11.031-21.32 27.035-22.359 44.23-1.0391 17.195 5.0664 34.055 16.871 46.602 11.805 12.543 28.262 19.66 45.488 19.668 14.613-0.035156 28.758-5.1641 40-14.5l197.5-164.55v566.55c0.027344 16.566 6.6211 32.449 18.336 44.164 11.715 11.715 27.598 18.309 44.164 18.336z"/>
              </svg>
              Import from SVG
            </button>
            <button class="import-svg-btn" @click="${this.#exportAllBoards}">
              <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0" fill="currentColor">
                <path d="m1100 787.5c-16.566 0.027344-32.449 6.6211-44.164 18.336-11.715 11.715-18.309 27.598-18.336 44.164v150c-0.027344 9.9375-3.9844 19.461-11.012 26.488-7.0273 7.0273-16.551 10.984-26.488 11.012h-800c-9.9375-0.027344-19.461-3.9844-26.488-11.012-7.0273-7.0273-10.984-16.551-11.012-26.488v-150c0-22.328-11.914-42.961-31.25-54.125-19.336-11.168-43.164-11.168-62.5 0-19.336 11.164-31.25 31.797-31.25 54.125v150c0.054688 43.082 17.191 84.383 47.652 114.85 30.465 30.461 71.766 47.598 114.85 47.652h800c43.082-0.054688 84.383-17.191 114.85-47.652 30.461-30.465 47.598-71.766 47.652-114.85v-150c-0.027344-16.566-6.6211-32.449-18.336-44.164-11.715-11.715-27.598-18.309-44.164-18.336z"/>
                <path d="m600 37.5c-16.566 0.027344-32.449 6.6211-44.164 18.336-11.715 11.715-18.309 27.598-18.336 44.164v566.55l-197.5-164.55c-12.738-10.59-29.156-15.695-45.656-14.199-16.496 1.5-31.727 9.4844-42.344 22.199-10.59 12.738-15.695 29.156-14.199 45.656 1.5 16.496 9.4844 31.727 22.199 42.344l300 250c3.1484 2.2344 6.4961 4.1758 10 5.8008 2.2852 1.5312 4.6758 2.9023 7.1484 4.0977 14.566 6.1328 30.988 6.1328 45.551 0 2.4141-1.2031 4.7539-2.5547 7-4.0469 3.5039-1.6289 6.8477-3.5703 10-5.8008l300-250c13.23-11.004 21.336-26.977 22.41-44.148 1.0742-17.176-4.9766-34.031-16.73-46.598-11.758-12.566-28.172-19.73-45.379-19.805-14.613 0.027344-28.762 5.1562-40 14.5l-197.5 164.55v-566.55c-0.027344-16.566-6.6211-32.449-18.336-44.164-11.715-11.715-27.598-18.309-44.164-18.336z"/>
              </svg>
              Export All Boards
            </button>
          </div>
          <div class="confirm-actions end">
            <button class="cancel-btn" @click="${() => this._myBoardsDialog?.close()}">Close</button>
          </div>
        </div>
      </dialog>

      <dialog id="delete-board-dialog">
        <div class="dialog-header">
          <h2>Delete Board</h2>
          <button class="dialog-close" aria-label="Close" title="Close" @click="${() => this._deleteBoardDialog?.close()}">
            <svg viewBox="0 0 16 16"><path d="M 4,4 L 12,12 M 12,4 L 4,12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </button>
        </div>
        <div class="dialog-body">
          <p>Are you sure you want to delete "${this._deleteBoardName}"? This cannot be undone.</p>
          <div class="confirm-actions">
            <button class="cancel-btn" @click="${() => this._deleteBoardDialog?.close()}">Cancel</button>
            <button class="confirm-danger" @click="${this.#confirmDeleteBoard}">Delete</button>
          </div>
        </div>
      </dialog>

      <dialog id="export-dialog">
        <div class="dialog-header">
          <h2>Export Board</h2>
          <button class="dialog-close" aria-label="Close" title="Close" @click="${() => this._exportDialog?.close()}">
            <svg viewBox="0 0 16 16"><path d="M 4,4 L 12,12 M 12,4 L 4,12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </button>
        </div>
        <div class="dialog-body">
          <div class="export-options">
            ${this._viewMode !== 'readonly' ? html`
              <button @click="${this.#exportSvg}">
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" style="flex-shrink:0">
                  <rect x="2" y="1" width="12" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>
                  <text x="8" y="11" text-anchor="middle" fill="currentColor" font-size="5" font-weight="bold" font-family="system-ui">SVG</text>
                </svg>
                <div>
                  <div>Export as SVG</div>
                  <div class="item-description">Vector format with full board data. Can be reimported later.</div>
                </div>
              </button>
            ` : nothing}
            <button @click="${this.#exportPng}">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" style="flex-shrink:0">
                <rect x="2" y="1" width="12" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>
                <text x="8" y="11" text-anchor="middle" fill="currentColor" font-size="5" font-weight="bold" font-family="system-ui">PNG</text>
              </svg>
              <div>
                <div>Save as PNG</div>
                <div class="item-description">High-resolution image for sharing or printing.</div>
              </div>
            </button>
            ${this.animationFrames.length > 1 ? html`
              <button @click="${this.#exportGif}">
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" style="flex-shrink:0">
                  <rect x="2" y="1" width="12" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>
                  <text x="8" y="11" text-anchor="middle" fill="currentColor" font-size="5" font-weight="bold" font-family="system-ui">GIF</text>
                </svg>
                <div>
                  <div>Save as GIF</div>
                  <div class="item-description">Animated image of the playback sequence.</div>
                </div>
              </button>
            ` : nothing}
          </div>
          <div class="confirm-actions end">
            <button class="cancel-btn" @click="${() => this._exportDialog?.close()}">Close</button>
          </div>
        </div>
      </dialog>

      <dialog id="board-summary-dialog" @close="${() => this.#saveToStorage()}">
        <div class="dialog-header">
          <h2>Board Summary</h2>
          <button class="dialog-close" aria-label="Close" title="Close" @click="${() => this._boardSummaryDialog?.close()}">
            <svg viewBox="0 0 16 16"><path d="M 4,4 L 12,12 M 12,4 L 4,12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </button>
        </div>
        <div class="dialog-body">
          ${this.#cachedSummary ? html`
            <div class="summary-board-name">${this.#cachedSummary.name}</div>
            <div class="summary-section">
              <h3>Pitch</h3>
              <p>${this.#cachedSummary.pitchLabel} · ${this.#cachedSummary.orientation}</p>
            </div>
            ${this.#cachedSummary.playersByColor.size > 0 || this.#cachedSummary.coachCount > 0 ? html`
              <div class="summary-section">
                <h3>Players</h3>
                <ul>
                  ${[...this.#cachedSummary.playersByColor.entries()].map(([color, count]) => html`<li>${count} ${color}</li>`)}
                  ${this.#cachedSummary.coachCount > 0 ? html`<li>${this.#cachedSummary.coachCount} Coach${this.#cachedSummary.coachCount > 1 ? 'es' : ''}</li>` : nothing}
                </ul>
              </div>
            ` : nothing}
            ${this.#cachedSummary.equipByKind.size > 0 || this.#cachedSummary.conesByColor.size > 0 || this.#cachedSummary.dummiesByColor.size > 0 || this.#cachedSummary.polesByColor.size > 0 ? html`
              <div class="summary-section">
                <h3>Equipment</h3>
                <ul>
                  ${[...this.#cachedSummary.equipByKind.entries()].map(([kind, count]) => html`<li>${count} ${kind}${count > 1 ? 's' : ''}</li>`)}
                  ${this.#cachedSummary.conesByColor.size > 0 ? html`<li>${[...this.#cachedSummary.conesByColor.values()].reduce((a, b) => a + b, 0)} Cone${[...this.#cachedSummary.conesByColor.values()].reduce((a, b) => a + b, 0) > 1 ? 's' : ''} (${[...this.#cachedSummary.conesByColor.entries()].map(([color, count]) => `${count} ${color}`).join(', ')})</li>` : nothing}
                  ${this.#cachedSummary.dummiesByColor.size > 0 ? html`<li>${[...this.#cachedSummary.dummiesByColor.values()].reduce((a, b) => a + b, 0)} Dumm${[...this.#cachedSummary.dummiesByColor.values()].reduce((a, b) => a + b, 0) > 1 ? 'ies' : 'y'} (${[...this.#cachedSummary.dummiesByColor.entries()].map(([color, count]) => `${count} ${color}`).join(', ')})</li>` : nothing}
                  ${this.#cachedSummary.polesByColor.size > 0 ? html`<li>${[...this.#cachedSummary.polesByColor.values()].reduce((a, b) => a + b, 0)} Pole${[...this.#cachedSummary.polesByColor.values()].reduce((a, b) => a + b, 0) > 1 ? 's' : ''} (${[...this.#cachedSummary.polesByColor.entries()].map(([color, count]) => `${count} ${color}`).join(', ')})</li>` : nothing}
                </ul>
              </div>
            ` : nothing}
            ${this.#cachedSummary.linesByStyle.size > 0 ? html`
              <div class="summary-section">
                <h3>Lines</h3>
                <ul>
                  ${[...this.#cachedSummary.linesByStyle.entries()].map(([style, count]) => html`<li>${count} ${style}${count > 1 ? 's' : ''}</li>`)}
                </ul>
              </div>
            ` : nothing}
            ${this.#cachedSummary.shapeCount > 0 ? html`
              <div class="summary-section">
                <h3>Shapes</h3>
                <p>${this.#cachedSummary.shapeCount} shape${this.#cachedSummary.shapeCount > 1 ? 's' : ''}</p>
              </div>
            ` : nothing}
            ${this.#cachedSummary.textCount > 0 ? html`
              <div class="summary-section">
                <h3>Text</h3>
                <p>${this.#cachedSummary.textCount} text item${this.#cachedSummary.textCount > 1 ? 's' : ''}</p>
              </div>
            ` : nothing}
            ${this.#cachedSummary.frameCount > 0 ? html`
              <div class="summary-section">
                <h3>Animation</h3>
                <p>${this.#cachedSummary.frameCount} frame${this.#cachedSummary.frameCount > 1 ? 's' : ''}</p>
              </div>
            ` : nothing}
          ` : nothing}
          <div class="summary-section">
            <h3>Notes &amp; Instructions</h3>
            <textarea class="notes-textarea" rows="4" placeholder="Add notes, drills, instructions…"
                      .value="${this._boardNotes}"
                      @input="${(e: Event) => { this._boardNotes = (e.target as HTMLTextAreaElement).value; }}"></textarea>
          </div>
          <div class="confirm-actions">
            <button class="cancel-btn" @click="${() => this._boardSummaryDialog?.close()}">Close</button>
            <button class="confirm-success" @click="${this.#saveBoardNotes}">Save</button>
          </div>
        </div>
      </dialog>

      <dialog id="print-dialog">
        <div class="dialog-header">
          <h2>Print Board</h2>
          <button class="dialog-close" aria-label="Close" title="Close" @click="${() => this._printDialog?.close()}">
            <svg viewBox="0 0 16 16"><path d="M 4,4 L 12,12 M 12,4 L 4,12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </button>
        </div>
        <div class="dialog-body">
          <label class="checkbox-label">
            <input type="checkbox" .checked="${this._printSummary}" @change="${(e: Event) => { this._printSummary = (e.target as HTMLInputElement).checked; }}">
            Include board summary
          </label>
          <label class="checkbox-label">
            <input type="checkbox" .checked="${this._printWhiteBg}" @change="${(e: Event) => { this._printWhiteBg = (e.target as HTMLInputElement).checked; }}">
            Use white background for printing
          </label>
          <div class="confirm-actions">
            <button class="cancel-btn" @click="${() => this._printDialog?.close()}">Cancel</button>
            <button class="confirm-success" @click="${this.#handlePrint}">Print</button>
          </div>
        </div>
      </dialog>

      <div class="rotate-overlay">
        <svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg">
          <path d="M880.71 163.3V163.32L740.23 163.16L738.09 127.98L882.89 128L880.71 163.3ZM106.9 438.69H106.88L105.81 458.31L105.78 459.55L105.99 479.2C106.11 489.65 114.67 498.03 125.12 497.92C135.5 497.81 143.84 489.35 143.84 479L143.63 459.77L144.64 441.37L146.85 423.11L150.26 405.01L154.85 387.19L160.6 369.72L167.5 352.63L175.49 336.07L184.57 320.03L194.67 304.65L205.76 289.97L217.8 276.04L230.73 262.93L244.27 250.89L258.55 239.75L273.53 229.55L289.13 220.35L305.29 212.18L321.96 205.07L339.06 199.05L356.5 194.15L374.21 190.39L392.15 187.78L409.75 186.38L388.69 203.43C384.01 207.22 381.58 212.76 381.58 218.35C381.58 222.59 382.98 226.86 385.86 230.41C392.52 238.64 404.61 239.91 412.84 233.25L475.4 182.59C479.9 178.95 482.51 173.47 482.53 167.68V167.59C482.53 161.81 479.9 156.42 475.4 152.77L413.16 102.35C404.93 95.68 392.85 96.95 386.18 105.18C383.3 108.73 381.9 113 381.9 117.25C381.9 122.84 384.33 128.38 389.01 132.17L409.17 148.5H409.04L407.82 148.56L388.53 150.1L387.31 150.24L368.17 153.02L366.96 153.24L348.04 157.26L346.85 157.55L328.23 162.78L327.06 163.15L308.81 169.58L307.67 170.03L289.88 177.62L288.77 178.14L271.51 186.87L270.44 187.46L253.78 197.29L252.74 197.95L236.75 208.83L235.76 209.55L220.51 221.45L219.57 222.23L205.11 235.09L204.22 235.94L190.42 249.93L189.58 250.84L176.73 265.71L175.95 266.68L164.1 282.36L163.39 283.38L152.6 299.81L151.95 300.87L142.27 317.97L141.69 319.07L133.15 336.77L132.64 337.91L125.28 356.13L124.85 357.3L118.71 375.97L118.36 377.17L113.45 396.2L113.18 397.41L109.54 416.72L109.35 417.95L106.98 437.46L106.93 438.7H106.88H106.9V438.69ZM1034.12 127.99H1035.01C1048.17 128.42 1058.72 139.24 1058.72 152.52V850.85L562.25 850.87V152.52C562.25 139.24 572.79 128.42 585.96 127.99L699.84 128.01L703.25 183.42C703.87 193.49 712.21 201.33 722.3 201.33L898.64 201.38C908.72 201.36 917.06 193.52 917.69 183.46L921.13 127.99H1034.12ZM165.32 878.25V878.27L130.31 880.29L130.22 735.5L165.38 737.71V737.73L165.32 878.26V878.25ZM810.51 955.19H810.54C821.5 955.19 830.33 964.07 830.33 975.02C830.33 985.97 821.45 994.85 810.5 994.85C799.55 994.85 790.67 985.97 790.67 975.02C790.67 964.07 799.52 955.19 810.47 955.19H810.52H810.51ZM810.5 916.95H810.46C778.39 916.95 752.43 942.95 752.43 975.02C752.43 1007.09 778.42 1033.08 810.49 1033.08C842.56 1033.08 868.56 1007.08 868.56 975.02C868.56 942.96 842.59 916.95 810.52 916.95H810.5ZM1058.75 1031.75V1031.8C1058.75 1045.02 1048.2 1056.26 1035.04 1056.28L585.98 1056.3C572.82 1055.87 562.26 1045.04 562.26 1031.76V889.07L1058.74 889.11V1031.75H1058.75ZM153.36 521.44V521.46C153.47 521.44 153.36 521.44 153.36 521.44C121.46 522.14 95.39 546.56 92.24 577.77V577.84C92.01 580 91.87 1031.59 91.87 1031.59C91.87 1055.47 105.03 1076.19 124.65 1086.81L124.74 1086.86C133.33 1091.56 143.14 1094.56 153.58 1094.56L481.57 1094.36C492.12 1094.36 500.68 1085.81 500.68 1075.26C500.68 1064.71 492.23 1056.26 481.77 1056.16C481.51 1056.16 154.65 1056.16 154.65 1056.16C150.38 1056.16 146.37 1055.07 142.87 1053.15L142.82 1053.12C135.64 1049 130.71 1041.43 130.42 1032.66L130.35 918.55L185.58 915.17C195.64 914.55 203.48 906.22 203.5 896.15C203.5 896.06 203.57 719.78 203.57 719.78C203.57 709.7 195.73 701.35 185.67 700.73L130.22 697.28L130.29 581.75C131.64 569.45 142.04 559.9 154.67 559.89L481.58 559.71C492.13 559.69 500.69 551.14 500.69 540.59C500.69 530.04 492.14 521.48 481.58 521.48H153.36V521.5V521.47V521.44ZM586.84 89.74H586.79C552.59 89.74 524.79 117.08 524.04 151.11V1033.18C524.81 1067.22 552.62 1094.56 586.81 1094.56H1034.2C1068.39 1094.54 1096.21 1067.2 1096.96 1033.17V151.11C1096.19 117.07 1068.38 89.73 1034.19 89.73H586.84V89.74Z" fill="white"/>
        </svg>
      </div>
    `;
  }

  #renderDefs() {
    const vertical = this.fieldOrientation === 'vertical';
    return svg`
      <defs>
        ${vertical ? svg`
          <pattern id="grass-stripes" width="68" height="13.125"
                   patternUnits="userSpaceOnUse">
            <rect width="68" height="6.6125" fill="var(--field-stripe-light, ${COLORS.fieldStripeLight})" />
            <rect y="6.5125" width="68" height="6.6125" fill="var(--field-stripe-dark, ${COLORS.fieldStripeDark})" />
          </pattern>
        ` : svg`
          <pattern id="grass-stripes" width="13.125" height="68"
                   patternUnits="userSpaceOnUse">
            <rect width="6.6125" height="68" fill="var(--field-stripe-light, ${COLORS.fieldStripeLight})" />
            <rect x="6.5125" width="6.6125" height="68" fill="var(--field-stripe-dark, ${COLORS.fieldStripeDark})" />
          </pattern>
        `}

        <filter id="player-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="${this.fieldTheme === 'white' ? '0.15' : '0.3'}" stdDeviation="${this.fieldTheme === 'white' ? '0.2' : '0.4'}"
                        flood-color="#000" flood-opacity="${this.fieldTheme === 'white' ? '0.15' : '0.5'}" />
        </filter>

        <filter id="text-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="${this.fieldTheme === 'white' ? '0.08' : '0.15'}" stdDeviation="${this.fieldTheme === 'white' ? '0.12' : '0.25'}"
                        flood-color="#000" flood-opacity="${this.fieldTheme === 'white' ? '0.1' : '0.35'}" />
        </filter>

        <pattern id="goal-net" width="0.5" height="0.5"
                 patternUnits="userSpaceOnUse">
          <rect width="0.5" height="0.5" fill="${this.fieldTheme === 'white' ? COLORS.previewStroke : COLORS.fieldLineWhite}" fill-opacity="${this.fieldTheme === 'white' ? '0.6' : '0.15'}" />
          <line x1="0" y1="0" x2="0.5" y2="0.5"
                stroke="${this.fieldTheme === 'white' ? WHITE_THEME.fieldNet : 'white'}" stroke-width="0.04" opacity="${this.fieldTheme === 'white' ? '0.5' : '0.3'}" />
          <line x1="0.5" y1="0" x2="0" y2="0.5"
                stroke="${this.fieldTheme === 'white' ? WHITE_THEME.fieldNet : 'white'}" stroke-width="0.04" opacity="${this.fieldTheme === 'white' ? '0.5' : '0.3'}" />
        </pattern>

        ${[...new Set([
          COLORS.lineWhite, COLORS.playerRed, COLORS.playerBlue,
          COLORS.lineBlue, COLORS.lineRed, COLORS.lineYellow, COLORS.linePurple, COLORS.lineGray,
          COLORS.lineBlack, COLORS.lineBlueW, COLORS.lineRedW, COLORS.lineYellowW, COLORS.linePurpleW, COLORS.playerYellowW,
        ])].map(c => {
          const safeId = c.replace('#', '');
          return svg`
            <marker id="arrow-end-${safeId}" markerWidth="6" markerHeight="8"
                    refX="3" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M 0 1.45 L 6 4 L 0 6.55 Z" fill="${c}" />
            </marker>
            <marker id="arrow-start-${safeId}" markerWidth="6" markerHeight="8"
                    refX="3" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M 6 1.45 L 0 4 L 6 6.55 Z" fill="${c}" />
            </marker>
          `;
        })}
      </defs>
    `;
  }

  #renderPlayer(p: Player) {
    const selected = this.selectedIds.has(p.id);
    const singleSelected = selected && this.selectedIds.size === 1;
    const isTriangle = p.team === 'a';
    const textColor = getTextColor(p.color);
    const angle = p.angle ?? 0;

    if (isTriangle) {
      const textOff = -PLAYER_RADIUS * 0.03;
      const selR = PLAYER_RADIUS + 0.6;
      return svg`
        <g data-id="${p.id}" data-kind="player"
           transform="translate(${p.x}, ${p.y}) rotate(${angle})">
          ${selected ? svg`
            <polygon points="${triPoints(0, 0, selR)}"
                     fill="none" stroke="${this.#selColor}" stroke-width="0.2"
                     stroke-linejoin="round" stroke-dasharray="0.5,0.3" />
          ` : nothing}
          <polygon points="${triPoints(0, 0, PLAYER_RADIUS)}"
                   fill="${p.color}" stroke="white" stroke-width="0.15"
                   stroke-linejoin="round"
                   filter="url(#player-shadow)"
                   style="cursor: pointer" />
          <path d="${triHeadPath(PLAYER_RADIUS)}"
                fill="rgba(0,0,0,0.35)" style="pointer-events: none" />
          ${p.label ? svg`
            <text x="0" y="${textOff}"
                  text-anchor="middle" dominant-baseline="central"
                  fill="${textColor}" font-size="${(p.label?.length ?? 0) > 2 ? '1.4' : '1.9'}" font-weight="bold"
                  font-family="system-ui, sans-serif"
                  transform="rotate(${-angle}, 0, ${textOff})"
                  style="pointer-events: none">
              ${p.label}
            </text>
          ` : nothing}
          ${this.#shouldShowRotate(p.id, singleSelected) ? this.#renderCircleRotateHandles(p.id, selR + 0.3) : nothing}
        </g>
      `;
    }

    if (p.team === 'neutral') {
      const ds = PLAYER_RADIUS * 0.95;
      const selDs = ds + 0.5;
      const fontSize = (p.label?.length ?? 0) > 2 ? '1.4' : '1.9';
      return svg`
        <g data-id="${p.id}" data-kind="player"
           transform="translate(${p.x}, ${p.y}) rotate(${angle})">
          ${selected ? svg`
            <rect x="${-selDs}" y="${-selDs}" width="${selDs * 2}" height="${selDs * 2}"
                  rx="0.3" fill="none" stroke="${this.#selColor}" stroke-width="0.2"
                  stroke-dasharray="0.5,0.3" transform="rotate(45)" />
          ` : nothing}
          <rect x="${-ds}" y="${-ds}" width="${ds * 2}" height="${ds * 2}"
                rx="0.3" fill="${p.color}" stroke="white" stroke-width="0.15"
                transform="rotate(45)"
                filter="url(#player-shadow)"
                style="cursor: pointer" />
          <path d="${diamondHeadPath(PLAYER_RADIUS)}"
                fill="rgba(0,0,0,0.35)" style="pointer-events: none" />
          ${p.label ? svg`
            <text x="0" y="0"
                  text-anchor="middle" dominant-baseline="central"
                  fill="${textColor}" font-size="${fontSize}" font-weight="bold"
                  font-family="system-ui, sans-serif"
                  transform="rotate(${-angle})"
                  style="pointer-events: none">
              ${p.label}
            </text>
          ` : nothing}
          ${this.#shouldShowRotate(p.id, singleSelected) ? this.#renderCircleRotateHandles(p.id, PLAYER_RADIUS + 0.7) : nothing}
        </g>
      `;
    }

    const fontSize = (p.label?.length ?? 0) > 2 ? '1.4' : '1.9';
    return svg`
      <g class="player"
         data-id="${p.id}"
         data-kind="player"
         transform="translate(${p.x}, ${p.y}) rotate(${angle})">
        ${selected ? svg`
          <circle cx="0" cy="0" r="${PLAYER_RADIUS + 0.4}"
                   fill="none" stroke="${this.#selColor}" stroke-width="0.2"
                   stroke-dasharray="0.5,0.3" />
        ` : nothing}
        <circle cx="0" cy="0" r="${PLAYER_RADIUS}"
                fill="${p.color}" stroke="white" stroke-width="0.15"
                filter="url(#player-shadow)"
                style="cursor: pointer" />
        <path d="${circleHeadPath(PLAYER_RADIUS)}"
              fill="rgba(0,0,0,0.35)" style="pointer-events: none" />
        ${p.label ? svg`
          <text x="0" y="0"
                text-anchor="middle" dominant-baseline="central"
                fill="${textColor}" font-size="${fontSize}" font-weight="bold"
                font-family="system-ui, sans-serif"
                transform="rotate(${-angle})"
                style="pointer-events: none">
            ${p.label}
          </text>
        ` : nothing}
        ${this.#shouldShowRotate(p.id, singleSelected) ? this.#renderCircleRotateHandles(p.id, PLAYER_RADIUS + 0.7) : nothing}
      </g>
    `;
  }

  #shouldShowRotate(id: string, singleSelected: boolean): boolean {
    if (!singleSelected) return false;
    if (this._isMobile) return this._rotateHandleId === id;
    return true;
  }

  #renderCircleRotateHandles(id: string, r: number) {
    return renderRotateHandle(r, -r, id, this.#selColor);
  }

  #renderRectRotateHandles(id: string, x1: number, y1: number, x2: number, y2: number) {
    return renderRotateHandle(x2, y1, id, this.#selColor);
  }

  #renderLine(l: Line) {
    const selected = this.selectedIds.has(l.id);
    const singleSelected = selected && this.selectedIds.size === 1;
    const curveD = `M ${l.x1} ${l.y1} Q ${l.cx} ${l.cy} ${l.x2} ${l.y2}`;
    const visibleD = l.style === 'wavy'
      ? wavyPath(l.x1, l.y1, l.cx, l.cy, l.x2, l.y2)
      : curveD;
    const markerColor = (l.color === 'white' ? COLORS.lineWhite : l.color).replace('#', '');

    return svg`
      <g class="line" data-id="${l.id}">
        <path d="${curveD}"
              fill="none" stroke="transparent" stroke-width="${(this._isMobile ? HIT_SLOP_MOBILE : HIT_SLOP) * 2}"
              data-id="${l.id}" data-kind="line-body"
              style="cursor: pointer;${singleSelected ? ' pointer-events: none' : ''}" />

        <path d="${visibleD}"
              fill="none" stroke="${l.color}" stroke-width="${selected ? '0.45' : '0.3'}"
              stroke-dasharray="${l.style === 'dashed' ? '1,0.6' : 'none'}"
              marker-start="${l.arrowStart ? `url(#arrow-start-${markerColor})` : ''}"
              marker-end="${l.arrowEnd ? `url(#arrow-end-${markerColor})` : ''}"
              style="pointer-events: none" />

        ${singleSelected ? svg`
          <circle cx="${l.x1}" cy="${l.y1}" r="${CONTROL_HANDLE_R + 1}"
                  fill="transparent"
                  data-id="${l.id}" data-kind="line-start"
                  style="cursor: grab" />
          <circle cx="${l.x1}" cy="${l.y1}" r="${CONTROL_HANDLE_R}"
                  fill="${this.#selColor}" fill-opacity="0.5" stroke="${this.#selColor}" stroke-width="0.1"
                  style="pointer-events: none" />
          <circle cx="${l.x2}" cy="${l.y2}" r="${CONTROL_HANDLE_R + 1}"
                  fill="transparent"
                  data-id="${l.id}" data-kind="line-end"
                  style="cursor: grab" />
          <circle cx="${l.x2}" cy="${l.y2}" r="${CONTROL_HANDLE_R}"
                  fill="${this.#selColor}" fill-opacity="0.5" stroke="${this.#selColor}" stroke-width="0.1"
                  style="pointer-events: none" />
          <circle cx="${l.cx}" cy="${l.cy}" r="${CONTROL_HANDLE_R + 1}"
                  fill="transparent"
                  data-id="${l.id}" data-kind="line-control"
                  style="cursor: grab" />
          <circle cx="${l.cx}" cy="${l.cy}" r="${CONTROL_HANDLE_R}"
                  fill="${COLORS.annotation}" fill-opacity="0.7" stroke="${COLORS.annotation}" stroke-width="0.1"
                  style="pointer-events: none" />
          <line x1="${l.x1}" y1="${l.y1}" x2="${l.cx}" y2="${l.cy}"
                stroke="${COLORS.annotation}" stroke-width="0.1" stroke-dasharray="0.4,0.3"
                style="pointer-events: none" />
          <line x1="${l.x2}" y1="${l.y2}" x2="${l.cx}" y2="${l.cy}"
                stroke="${COLORS.annotation}" stroke-width="0.1" stroke-dasharray="0.4,0.3"
                style="pointer-events: none" />
        ` : nothing}
      </g>
    `;
  }

  #renderDrawPreview() {
    const d = this.#draw!;
    const previewColor = this.fieldTheme === 'white' ? WHITE_THEME.text : COLORS.lineWhite;
    const previewMarkerId = previewColor.replace('#', '');
    const mx = (d.x1 + d.x2) / 2;
    const my = (d.y1 + d.y2) / 2;
    if (this.lineStyle === 'wavy') {
      const pathD = wavyPath(d.x1, d.y1, mx, my, d.x2, d.y2);
      return svg`
        <path d="${pathD}"
              fill="none" stroke="${previewColor}" stroke-width="0.25"
              marker-end="url(#arrow-end-${previewMarkerId})"
              style="pointer-events: none" />
      `;
    }
    const dashAttr = this.lineStyle === 'dashed' ? '0.8,0.4' : 'none';
    return svg`
      <line x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}"
            stroke="${previewColor}" stroke-width="0.25" stroke-dasharray="${dashAttr}"
            marker-end="url(#arrow-end-${previewMarkerId})"
            style="pointer-events: none" />
    `;
  }

  #renderEquipment(eq: Equipment) {
    const selected = this.selectedIds.has(eq.id);
    const singleSelected = selected && this.selectedIds.size === 1;

    if (eq.kind === 'ball') {
      const s = BALL_RADIUS / 480;
      return svg`
        <g data-id="${eq.id}" data-kind="equipment"
           transform="translate(${eq.x}, ${eq.y})">
          ${selected ? svg`
            <circle r="${BALL_RADIUS + 0.4}" fill="none" stroke="${this.#selColor}" stroke-width="0.15"
                    stroke-dasharray="0.4,0.25" />
          ` : nothing}
          <circle r="${BALL_RADIUS}" fill="white"
                  stroke="white" stroke-width="0.225"
                  filter="url(#player-shadow)"
                  style="cursor: pointer" />
          <g transform="scale(${s}) translate(-600, -600)" style="pointer-events: none">
            <path fill="${COLORS.ballDetail}" d="m1080 600.84c-0.23438 127.31-51 249.28-141.19 339.14s-212.34 140.26-339.66 140.02c-127.31-0.23438-249.28-51-339.14-141.19-89.867-90.191-140.26-212.34-140.02-339.66 0.23438-127.31 51-249.28 141.19-339.14 90.191-89.867 212.34-140.26 339.66-140.02 127.22 0.51562 249.05 51.375 338.86 141.52 89.766 90.094 140.26 212.11 140.29 339.32zm-481.92 153.61c25.781 0 51.609 0.84375 77.297 0 8.3906-0.84375 15.984-5.2031 21-12 25.219-41.578 49.547-83.766 73.078-126.47v-0.046875c3.2344-6.9375 3.2344-14.953 0-21.938-24-42-49.922-84-75.938-124.69h-0.046875c-4.5469-6.2344-11.531-10.219-19.172-11.016-48.703-0.9375-97.5-0.9375-146.29 0-8.3906 0.84375-16.031 5.2031-21 12-26.016 40.688-51.469 82.125-76.453 124.18-3.1875 6.9375-3.1875 14.906 0 21.844 24 42.562 48.422 84.703 73.219 126.47 4.5 6.1875 11.344 10.219 18.938 11.062 25.219 1.3125 50.297 0.60938 75.375 0.60938zm-174.71-426.61c-40.688 3.9375-73.312 6.4688-105.61 10.781-8.5312 1.5-16.125 6.2344-21.234 13.219-24.609 38.625-48 78-71.156 117.7-3.375 6.3281-4.0781 13.734-1.9219 20.531 13.266 32.859 27.469 65.344 42.609 97.453 3.5625 5.7188 9.6562 9.4219 16.406 9.9375 31.922-2.1562 63.703-5.2969 96-9.7031 8.3438-1.5469 15.75-6.2812 20.672-13.219 26.156-41.062 51.422-82.594 75.844-124.69h-0.046875c3.7969-7.4062 4.4062-16.078 1.6875-24-12-28.312-24-56.156-37.781-83.391-4.0781-5.9062-9.375-10.875-15.469-14.625zm352.55 0c-5.5312 3.75-10.266 8.5312-13.922 14.156-13.547 27.375-26.391 55.219-37.922 84-2.6719 7.875-2.2031 16.453 1.3125 24 24 42 49.781 84 75.938 124.55h0.046875c5.5312 7.1719 13.594 11.953 22.547 13.453 30.844 4.4531 62.062 7.4531 93.234 9.375 7.3594-0.75 13.922-4.9219 17.625-11.297 14.625-30.609 28.312-61.781 41.062-93.375 2.6719-7.4062 2.25-15.562-1.0781-22.641-23.062-39.703-46.688-78.938-71.297-117.7v-0.046875c-4.9219-7.0312-12.328-11.906-20.766-13.688-33.094-4.4062-66.703-6.9375-106.78-10.922zm-13.781 562.08c-22.219-30.984-43.828-61.922-66.141-91.688-4.3125-4.125-10.078-6.375-16.078-6.2344-53.297-0.65625-106.83-0.65625-160.69 0-5.9531 0.23438-11.625 2.8125-15.703 7.2188-22.312 30-43.781 60-65.766 91.078 22.547 28.922 43.453 56.625 65.625 84 5.4375 5.7656 12.844 9.2344 20.766 9.7031 50.719 0.79688 101.53 0.79688 152.39 0 7.5-0.51562 14.484-3.9375 19.453-9.6094 22.219-27.328 43.547-55.547 66.141-84.469zm-483.98-593.76c9.9844 2.9062 20.156 4.9688 30.469 6.1406 13.922 0 27.703-2.3906 41.531-3.8438 29.625-3.375 61.688-0.70312 88.547-11.391 46.688-19.828 91.781-43.172 134.9-69.844 7.4531-4.4531 7.0781-24 7.2188-37.312 0-4.0781-9.6094-9.2344-15.703-12-22.453-10.219-44.766-4.0781-67.219 1.3125h-0.046876c-84 20.016-160.36 64.125-219.71 126.94zm643.45 0c-63.047-67.172-145.69-112.78-236.16-130.22-16.969-1.9219-34.172-1.125-50.906 2.2969-5.7656 0.84375-15.375 7.7812-15.375 12 0 12.844 0 32.766 7.4531 37.219 43.547 25.688 89.297 48 134.39 71.062l0.046875-0.046875c3.2344 1.2656 6.7031 1.9219 10.172 2.0625 40.078 4.0781 80.156 8.5312 120 12 10.359-0.9375 20.578-3.2344 30.375-6.8438zm-747.71 192c-24 66.609-20.766 167.06 4.2188 248.86l-0.046876 0.046875c7.6406 25.125 23.109 47.156 44.156 62.859 24-12 24-12 23.391-36.938-1.7812-42.984-3.2344-85.594-5.625-127.82-0.23438-8.2031-1.9219-16.359-4.9219-24-14.719-35.109-30-70.078-45.844-104.86-4.3125-6.9375-9.4688-13.312-15.375-18.984zm804.61 310.78c59.156-48.703 87.375-226.22 46.781-308.53-4.3125 3.8438-9.9375 6.4688-12 10.547-21.141 56.625-60 107.16-56.062 172.31v0.046876c1.1719 29.953-0.09375 59.906-3.8438 89.625-1.5469 18.375 4.0781 29.906 25.078 35.203zm-246.52 223.69c77.578-23.672 146.86-68.859 199.78-130.31 10.594-14.297 18.984-30.047 24.984-46.781 1.6406-5.9062 0.14063-12.234-3.9844-16.828-8.1562-3.9375-20.766-9-26.859-5.3906-75 43.828-149.16 88.688-195.84 166.55-7.4531 12.281-10.078 20.438 1.9219 32.766zm-258 1.9219c0-12 3.1406-21.703 0-27.938-47.062-81.234-122.76-130.08-201.71-174.47-5.3906-3.1406-17.766 2.7656-24.938 7.4531l-0.046874-0.046875c-3.7969 4.8281-4.9219 11.203-3.0938 17.062 4.6406 15.141 11.766 29.438 21 42.328 55.219 64.219 127.64 111.28 208.78 135.61z" />
          </g>
        </g>
      `;
    }
    if (eq.kind === 'cone') {
      const coneColor = eq.color ?? COLORS.coneNeonOrange;
      return svg`
        <g data-id="${eq.id}" data-kind="equipment">
          ${selected ? svg`
            <circle cx="${eq.x}" cy="${eq.y}" r="${CONE_OUTER_R + CONE_OUTER_STROKE / 2 + 0.2}"
                    fill="none" stroke="${this.#selColor}" stroke-width="0.15"
                    stroke-dasharray="0.4,0.25" />
          ` : nothing}
          <circle cx="${eq.x}" cy="${eq.y}" r="${CONE_OUTER_R}"
                  fill="none" stroke="${coneColor}" stroke-width="${CONE_OUTER_STROKE}"
                  style="cursor: pointer" />
          <circle cx="${eq.x}" cy="${eq.y}" r="${CONE_INNER_R}"
                  fill="${POLE_BASE_COLOR}" style="cursor: pointer" />
        </g>
      `;
    }
    if (eq.kind === 'dummy') {
      const dummyColor = eq.color ?? COLORS.coneChartreuse;
      const angle = eq.angle ?? 0;
      const pad = 0.5;
      const rx1 = -DUMMY_OUTER_HW - pad;
      const ry1 = -DUMMY_OUTER_HH - pad;
      const rx2 = DUMMY_OUTER_HW + pad;
      const ry2 = DUMMY_OUTER_HH + pad;
      return svg`
        <g data-id="${eq.id}" data-kind="equipment"
           transform="translate(${eq.x}, ${eq.y}) rotate(${angle})">
          ${selected ? svg`
            <rect x="${-DUMMY_OUTER_HW - DUMMY_OUTER_STROKE / 2 - 0.25}" y="${-DUMMY_OUTER_HH - DUMMY_OUTER_STROKE / 2 - 0.25}"
                  width="${(DUMMY_OUTER_HW + DUMMY_OUTER_STROKE / 2 + 0.25) * 2}" height="${(DUMMY_OUTER_HH + DUMMY_OUTER_STROKE / 2 + 0.25) * 2}"
                  rx="${DUMMY_OUTER_RX + 0.4}" fill="none" stroke="${this.#selColor}"
                  stroke-width="0.15" stroke-dasharray="0.4,0.25" />
          ` : nothing}
          <rect x="${-DUMMY_OUTER_HW}" y="${-DUMMY_OUTER_HH}"
                width="${DUMMY_OUTER_HW * 2}" height="${DUMMY_OUTER_HH * 2}"
                rx="${DUMMY_OUTER_RX}" fill="none"
                stroke="${dummyColor}" stroke-width="${DUMMY_OUTER_STROKE}"
                style="cursor: pointer" />
          <rect x="${-DUMMY_INNER_HW}" y="${-DUMMY_INNER_HH}"
                width="${DUMMY_INNER_HW * 2}" height="${DUMMY_INNER_HH * 2}"
                rx="${DUMMY_INNER_RX}" fill="${lightenHex(dummyColor)}"
                style="cursor: pointer" />
          ${this.#shouldShowRotate(eq.id, singleSelected)
            ? this.#renderRectRotateHandles(eq.id, rx1, ry1, rx2, ry2)
            : nothing}
        </g>
      `;
    }
    if (eq.kind === 'pole') {
      const poleColor = eq.color ?? COLORS.coneChartreuse;
      return svg`
        <g data-id="${eq.id}" data-kind="equipment">
          ${selected ? svg`
            <circle cx="${eq.x}" cy="${eq.y}" r="${POLE_BASE_RADIUS + 0.3}"
                    fill="none" stroke="${this.#selColor}" stroke-width="0.15"
                    stroke-dasharray="0.4,0.25" />
          ` : nothing}
          <circle cx="${eq.x}" cy="${eq.y}" r="${POLE_BASE_RADIUS}"
                  fill="none" stroke="${POLE_BASE_COLOR}" stroke-width="0.3"
                  style="cursor: pointer" />
          <circle cx="${eq.x}" cy="${eq.y}" r="${POLE_RADIUS}"
                  fill="${poleColor}" style="cursor: pointer" />
        </g>
      `;
    }
    if (eq.kind === 'popup-goal') {
      const hw = POPUP_GOAL_W / 2;
      const d = POPUP_GOAL_D;
      const pad = 0.5;
      const angle = eq.angle ?? 0;
      const rx1 = -pad;
      const ry1 = -hw - pad;
      const rx2 = d + pad;
      const ry2 = hw + pad;
      return svg`
        <g data-id="${eq.id}" data-kind="equipment"
           transform="translate(${eq.x}, ${eq.y}) rotate(${angle})">
          ${selected ? svg`
            <rect x="${rx1}" y="${ry1}" width="${rx2 - rx1}" height="${ry2 - ry1}"
                  fill="none" stroke="${this.#selColor}" stroke-width="0.15"
                  stroke-dasharray="0.5,0.3" rx="0.2" />
          ` : nothing}
          <rect x="${-1}" y="${-hw - 1}" width="${d + 2}" height="${POPUP_GOAL_W + 2}"
                fill="transparent" style="cursor: pointer" />
          <path d="M 0,${-hw} A ${hw},${hw} 0 0 1 0,${hw}"
                fill="url(#goal-net)" stroke="${POPUP_GOAL_COLOR}" stroke-width="0.25"
                style="pointer-events: none" />
          <line x1="0" y1="${-hw}" x2="0" y2="${hw}"
                stroke="${POPUP_GOAL_COLOR}" stroke-width="0.25" style="pointer-events: none" />
          ${this.#shouldShowRotate(eq.id, singleSelected) ? this.#renderRectRotateHandles(eq.id, rx1 - 0.3, ry1 - 0.3, rx2 + 0.3, ry2 + 0.3) : nothing}
        </g>
      `;
    }
    if (eq.kind === 'goal' || eq.kind === 'mini-goal') {
      const w = eq.kind === 'goal' ? GOAL_W : MINI_GOAL_W;
      const d = eq.kind === 'goal' ? GOAL_D : MINI_GOAL_D;
      const hw = w / 2;
      const post = 0.4;
      const pad = 0.5;
      const angle = eq.angle ?? 0;
      const rx1 = -post - pad;
      const ry1 = -hw - pad;
      const rx2 = d + pad;
      const ry2 = hw + pad;
      return svg`
        <g data-id="${eq.id}" data-kind="equipment"
           transform="translate(${eq.x}, ${eq.y}) rotate(${angle})">
          ${selected ? svg`
            <rect x="${rx1}" y="${ry1}" width="${rx2 - rx1}" height="${ry2 - ry1}"
                  fill="none" stroke="${this.#selColor}" stroke-width="0.15"
                  stroke-dasharray="0.5,0.3" rx="0.2" />
          ` : nothing}
          <rect x="${-1}" y="${-hw - 1}" width="${d + 2}" height="${w + 2}"
                fill="transparent" style="cursor: pointer" />
          <rect x="0" y="${-hw}" width="${d}" height="${w}"
                fill="url(#goal-net)" stroke="${this.fieldTheme === 'white' ? WHITE_THEME.fieldLine : 'white'}" stroke-width="${GOAL_LINE_W}"
                style="pointer-events: none" />
          <line x1="0" y1="${-hw}" x2="0" y2="${-hw - post}"
                stroke="${this.fieldTheme === 'white' ? WHITE_THEME.fieldLine : 'white'}" stroke-width="${GOAL_LINE_W}" style="pointer-events: none" />
          <line x1="0" y1="${hw}" x2="0" y2="${hw + post}"
                stroke="${this.fieldTheme === 'white' ? WHITE_THEME.fieldLine : 'white'}" stroke-width="${GOAL_LINE_W}" style="pointer-events: none" />
          ${this.#shouldShowRotate(eq.id, singleSelected) ? this.#renderRectRotateHandles(eq.id, rx1 - 0.3, ry1 - 0.3, rx2 + 0.3, ry2 + 0.3) : nothing}
        </g>
      `;
    }
    return svg`
      <g data-id="${eq.id}" data-kind="equipment">
        ${selected ? svg`
          <circle cx="${eq.x}" cy="${eq.y}" r="${PLAYER_RADIUS + 0.4}"
                  fill="none" stroke="${this.#selColor}" stroke-width="0.2"
                  stroke-dasharray="0.5,0.3" />
        ` : nothing}
        <circle cx="${eq.x}" cy="${eq.y}" r="${PLAYER_RADIUS}"
                fill="${COLORS.coachBg}" stroke="white" stroke-width="0.15"
                filter="url(#player-shadow)"
                style="cursor: pointer" />
        <text x="${eq.x}" y="${eq.y}"
              text-anchor="middle" dominant-baseline="central"
              fill="white" font-size="1.9" font-weight="bold"
              font-family="system-ui, sans-serif"
              style="pointer-events: none">C</text>
      </g>
    `;
  }

  #renderGhostEquipment() {
    if (!this.ghost) return nothing;
    const { x, y } = this.ghost;
    if (this.equipmentKind === 'ball') {
      const s = BALL_RADIUS / 480;
      return svg`
        <g transform="translate(${x}, ${y})" opacity="0.5"
           style="pointer-events: none">
          <circle r="${BALL_RADIUS}" fill="white"
                  stroke="white" stroke-width="0.225" />
          <g transform="scale(${s}) translate(-600, -600)">
            <path fill="${COLORS.ballDetail}" d="m1080 600.84c-0.23438 127.31-51 249.28-141.19 339.14s-212.34 140.26-339.66 140.02c-127.31-0.23438-249.28-51-339.14-141.19-89.867-90.191-140.26-212.34-140.02-339.66 0.23438-127.31 51-249.28 141.19-339.14 90.191-89.867 212.34-140.26 339.66-140.02 127.22 0.51562 249.05 51.375 338.86 141.52 89.766 90.094 140.26 212.11 140.29 339.32zm-481.92 153.61c25.781 0 51.609 0.84375 77.297 0 8.3906-0.84375 15.984-5.2031 21-12 25.219-41.578 49.547-83.766 73.078-126.47v-0.046875c3.2344-6.9375 3.2344-14.953 0-21.938-24-42-49.922-84-75.938-124.69h-0.046875c-4.5469-6.2344-11.531-10.219-19.172-11.016-48.703-0.9375-97.5-0.9375-146.29 0-8.3906 0.84375-16.031 5.2031-21 12-26.016 40.688-51.469 82.125-76.453 124.18-3.1875 6.9375-3.1875 14.906 0 21.844 24 42.562 48.422 84.703 73.219 126.47 4.5 6.1875 11.344 10.219 18.938 11.062 25.219 1.3125 50.297 0.60938 75.375 0.60938zm-174.71-426.61c-40.688 3.9375-73.312 6.4688-105.61 10.781-8.5312 1.5-16.125 6.2344-21.234 13.219-24.609 38.625-48 78-71.156 117.7-3.375 6.3281-4.0781 13.734-1.9219 20.531 13.266 32.859 27.469 65.344 42.609 97.453 3.5625 5.7188 9.6562 9.4219 16.406 9.9375 31.922-2.1562 63.703-5.2969 96-9.7031 8.3438-1.5469 15.75-6.2812 20.672-13.219 26.156-41.062 51.422-82.594 75.844-124.69h-0.046875c3.7969-7.4062 4.4062-16.078 1.6875-24-12-28.312-24-56.156-37.781-83.391-4.0781-5.9062-9.375-10.875-15.469-14.625zm352.55 0c-5.5312 3.75-10.266 8.5312-13.922 14.156-13.547 27.375-26.391 55.219-37.922 84-2.6719 7.875-2.2031 16.453 1.3125 24 24 42 49.781 84 75.938 124.55h0.046875c5.5312 7.1719 13.594 11.953 22.547 13.453 30.844 4.4531 62.062 7.4531 93.234 9.375 7.3594-0.75 13.922-4.9219 17.625-11.297 14.625-30.609 28.312-61.781 41.062-93.375 2.6719-7.4062 2.25-15.562-1.0781-22.641-23.062-39.703-46.688-78.938-71.297-117.7v-0.046875c-4.9219-7.0312-12.328-11.906-20.766-13.688-33.094-4.4062-66.703-6.9375-106.78-10.922zm-13.781 562.08c-22.219-30.984-43.828-61.922-66.141-91.688-4.3125-4.125-10.078-6.375-16.078-6.2344-53.297-0.65625-106.83-0.65625-160.69 0-5.9531 0.23438-11.625 2.8125-15.703 7.2188-22.312 30-43.781 60-65.766 91.078 22.547 28.922 43.453 56.625 65.625 84 5.4375 5.7656 12.844 9.2344 20.766 9.7031 50.719 0.79688 101.53 0.79688 152.39 0 7.5-0.51562 14.484-3.9375 19.453-9.6094 22.219-27.328 43.547-55.547 66.141-84.469zm-483.98-593.76c9.9844 2.9062 20.156 4.9688 30.469 6.1406 13.922 0 27.703-2.3906 41.531-3.8438 29.625-3.375 61.688-0.70312 88.547-11.391 46.688-19.828 91.781-43.172 134.9-69.844 7.4531-4.4531 7.0781-24 7.2188-37.312 0-4.0781-9.6094-9.2344-15.703-12-22.453-10.219-44.766-4.0781-67.219 1.3125h-0.046876c-84 20.016-160.36 64.125-219.71 126.94zm643.45 0c-63.047-67.172-145.69-112.78-236.16-130.22-16.969-1.9219-34.172-1.125-50.906 2.2969-5.7656 0.84375-15.375 7.7812-15.375 12 0 12.844 0 32.766 7.4531 37.219 43.547 25.688 89.297 48 134.39 71.062l0.046875-0.046875c3.2344 1.2656 6.7031 1.9219 10.172 2.0625 40.078 4.0781 80.156 8.5312 120 12 10.359-0.9375 20.578-3.2344 30.375-6.8438zm-747.71 192c-24 66.609-20.766 167.06 4.2188 248.86l-0.046876 0.046875c7.6406 25.125 23.109 47.156 44.156 62.859 24-12 24-12 23.391-36.938-1.7812-42.984-3.2344-85.594-5.625-127.82-0.23438-8.2031-1.9219-16.359-4.9219-24-14.719-35.109-30-70.078-45.844-104.86-4.3125-6.9375-9.4688-13.312-15.375-18.984zm804.61 310.78c59.156-48.703 87.375-226.22 46.781-308.53-4.3125 3.8438-9.9375 6.4688-12 10.547-21.141 56.625-60 107.16-56.062 172.31v0.046876c1.1719 29.953-0.09375 59.906-3.8438 89.625-1.5469 18.375 4.0781 29.906 25.078 35.203zm-246.52 223.69c77.578-23.672 146.86-68.859 199.78-130.31 10.594-14.297 18.984-30.047 24.984-46.781 1.6406-5.9062 0.14063-12.234-3.9844-16.828-8.1562-3.9375-20.766-9-26.859-5.3906-75 43.828-149.16 88.688-195.84 166.55-7.4531 12.281-10.078 20.438 1.9219 32.766zm-258 1.9219c0-12 3.1406-21.703 0-27.938-47.062-81.234-122.76-130.08-201.71-174.47-5.3906-3.1406-17.766 2.7656-24.938 7.4531l-0.046874-0.046875c-3.7969 4.8281-4.9219 11.203-3.0938 17.062 4.6406 15.141 11.766 29.438 21 42.328 55.219 64.219 127.64 111.28 208.78 135.61z" />
          </g>
        </g>
      `;
    }
    if (this.equipmentKind === 'cone') {
      return svg`
        <g opacity="0.5" style="pointer-events: none">
          <circle cx="${x}" cy="${y}" r="${CONE_OUTER_R}"
                  fill="none" stroke="${COLORS.coneNeonOrange}" stroke-width="${CONE_OUTER_STROKE}"
                  stroke-dasharray="0.3,0.2" />
          <circle cx="${x}" cy="${y}" r="${CONE_INNER_R}"
                  fill="${POLE_BASE_COLOR}" />
        </g>
      `;
    }
    if (this.equipmentKind === 'dummy') {
      return svg`
        <g transform="translate(${x}, ${y})" opacity="0.5"
           style="pointer-events: none">
          <rect x="${-DUMMY_OUTER_HW}" y="${-DUMMY_OUTER_HH}"
                width="${DUMMY_OUTER_HW * 2}" height="${DUMMY_OUTER_HH * 2}"
                rx="${DUMMY_OUTER_RX}" fill="none"
                stroke="${COLORS.coneChartreuse}" stroke-width="${DUMMY_OUTER_STROKE}"
                stroke-dasharray="0.3,0.2" />
          <rect x="${-DUMMY_INNER_HW}" y="${-DUMMY_INNER_HH}"
                width="${DUMMY_INNER_HW * 2}" height="${DUMMY_INNER_HH * 2}"
                rx="${DUMMY_INNER_RX}" fill="${lightenHex(COLORS.coneChartreuse)}" />
        </g>
      `;
    }
    if (this.equipmentKind === 'pole') {
      return svg`
        <g opacity="0.5" style="pointer-events: none">
          <circle cx="${x}" cy="${y}" r="${POLE_BASE_RADIUS}"
                  fill="none" stroke="${POLE_BASE_COLOR}" stroke-width="0.3" />
          <circle cx="${x}" cy="${y}" r="${POLE_RADIUS}"
                  fill="${COLORS.coneChartreuse}" />
        </g>
      `;
    }
    if (this.equipmentKind === 'goal' || this.equipmentKind === 'mini-goal') {
      const w = this.equipmentKind === 'goal' ? GOAL_W : MINI_GOAL_W;
      const d = this.equipmentKind === 'goal' ? GOAL_D : MINI_GOAL_D;
      const hw = w / 2;
      const post = 0.4;
      return svg`
        <g transform="translate(${x}, ${y})" opacity="0.5"
           style="pointer-events: none">
          <rect x="0" y="${-hw}" width="${d}" height="${w}"
                fill="url(#goal-net)" stroke="${this.fieldTheme === 'white' ? WHITE_THEME.fieldLine : 'white'}" stroke-width="${GOAL_LINE_W}" />
          <line x1="0" y1="${-hw}" x2="0" y2="${-hw - post}"
                stroke="${this.fieldTheme === 'white' ? WHITE_THEME.fieldLine : 'white'}" stroke-width="${GOAL_LINE_W}" />
          <line x1="0" y1="${hw}" x2="0" y2="${hw + post}"
                stroke="${this.fieldTheme === 'white' ? WHITE_THEME.fieldLine : 'white'}" stroke-width="${GOAL_LINE_W}" />
        </g>
      `;
    }
    if (this.equipmentKind === 'popup-goal') {
      const hw = POPUP_GOAL_W / 2;
      return svg`
        <g transform="translate(${x}, ${y})" opacity="0.5"
           style="pointer-events: none">
          <path d="M 0,${-hw} A ${hw},${hw} 0 0 1 0,${hw}"
                fill="url(#goal-net)" stroke="${POPUP_GOAL_COLOR}" stroke-width="0.25" />
          <line x1="0" y1="${-hw}" x2="0" y2="${hw}"
                stroke="${POPUP_GOAL_COLOR}" stroke-width="0.25" />
        </g>
      `;
    }
    return svg`
      <g opacity="0.5" style="pointer-events: none">
        <circle cx="${x}" cy="${y}" r="${PLAYER_RADIUS}"
                fill="${COLORS.coachBg}" stroke="white" stroke-width="0.15"
                stroke-dasharray="0.4,0.3" />
        <text x="${x}" y="${y}"
              text-anchor="middle" dominant-baseline="central"
              fill="white" font-size="1.9" font-weight="bold"
              font-family="system-ui, sans-serif">C</text>
      </g>
    `;
  }

  #getShapeVisuals(style: ShapeStyle) {
    const styles = getShapeStyles(this.fieldTheme);
    const def = styles.find(s => s.value === style) ?? styles[0];
    return def;
  }

  #renderShape(s: Shape) {
    const selected = this.selectedIds.has(s.id);
    const singleSelected = selected && this.selectedIds.size === 1;
    const vis = this.#getShapeVisuals(s.style);
    const angle = s.angle ?? 0;
    const pad = 0.3;

    return svg`
      <g data-id="${s.id}" data-kind="shape"
         transform="translate(${s.cx}, ${s.cy}) rotate(${angle})">
        ${s.kind === 'rect'
          ? svg`<rect x="${-s.hw}" y="${-s.hh}" width="${s.hw * 2}" height="${s.hh * 2}"
                      fill="${vis.fill}" fill-opacity="${vis.fillOpacity}"
                      stroke="${vis.stroke}" stroke-width="${vis.strokeWidth}"
                      stroke-dasharray="${vis.strokeDasharray ?? 'none'}"
                      style="cursor: pointer" />`
          : svg`<ellipse rx="${s.hw}" ry="${s.hh}"
                         fill="${vis.fill}" fill-opacity="${vis.fillOpacity}"
                         stroke="${vis.stroke}" stroke-width="${vis.strokeWidth}"
                         stroke-dasharray="${vis.strokeDasharray ?? 'none'}"
                         style="cursor: pointer" />`
        }
        ${selected ? svg`
          <rect x="${-s.hw - pad}" y="${-s.hh - pad}"
                width="${(s.hw + pad) * 2}" height="${(s.hh + pad) * 2}"
                fill="none" stroke="${this.#selColor}" stroke-width="0.12"
                stroke-dasharray="0.5,0.3" rx="0.2" />
        ` : nothing}
        ${singleSelected ? svg`
          ${this.#renderShapeHandles(s)}
          ${this.#shouldShowRotate(s.id, singleSelected) ? this.#renderRectRotateHandles(s.id,
              -s.hw - pad - 0.5, -s.hh - pad - 0.5,
               s.hw + pad + 0.5,  s.hh + pad + 0.5) : nothing}
        ` : nothing}
      </g>
    `;
  }

  #renderShapeHandles(s: Shape) {
    const hr = 0.5;
    const hitR = 1.0;
    const corners = [
      { x: -s.hw, y: -s.hh, h: 'nw' },
      { x:  s.hw, y: -s.hh, h: 'ne' },
      { x:  s.hw, y:  s.hh, h: 'se' },
      { x: -s.hw, y:  s.hh, h: 'sw' },
    ];
    const sides = [
      { x: 0, y: -s.hh, h: 'n' },
      { x: s.hw, y: 0, h: 'e' },
      { x: 0, y: s.hh, h: 's' },
      { x: -s.hw, y: 0, h: 'w' },
    ];
    return svg`
      ${corners.map(c => svg`
        <rect x="${c.x - hitR}" y="${c.y - hitR}" width="${hitR * 2}" height="${hitR * 2}"
              fill="transparent"
              data-id="${s.id}" data-kind="shape-corner" data-handle="${c.h}"
              style="cursor: nwse-resize" />
        <rect x="${c.x - hr}" y="${c.y - hr}" width="${hr * 2}" height="${hr * 2}"
              fill="${this.#selColor}" fill-opacity="0.7" stroke="${this.#selColor}" stroke-width="0.08"
              style="pointer-events: none" />
      `)}
      ${sides.map(c => svg`
        <rect x="${c.x - hitR}" y="${c.y - hitR}" width="${hitR * 2}" height="${hitR * 2}"
              fill="transparent"
              data-id="${s.id}" data-kind="shape-side" data-handle="${c.h}"
              style="cursor: ${c.h === 'n' || c.h === 's' ? 'ns-resize' : 'ew-resize'}" />
        <rect x="${c.x - hr * 0.7}" y="${c.y - hr * 0.7}" width="${hr * 1.4}" height="${hr * 1.4}"
              fill="${COLORS.accent}" fill-opacity="0.7" stroke="${this.#selColor}" stroke-width="0.08"
              style="pointer-events: none" />
      `)}
    `;
  }

  #renderShapeDrawPreview() {
    const d = this.#shapeDraw!;
    let hw = Math.abs(d.curX - d.startX) / 2;
    let hh = Math.abs(d.curY - d.startY) / 2;
    const cx = (d.startX + d.curX) / 2;
    const cy = (d.startY + d.curY) / 2;
    const previewColor = this.fieldTheme === 'white' ? COLORS.shapeStrokeGray : 'white';
    return svg`
      <g transform="translate(${cx}, ${cy})" style="pointer-events: none">
        ${d.kind === 'rect'
          ? svg`<rect x="${-hw}" y="${-hh}" width="${hw * 2}" height="${hh * 2}"
                      fill="none" stroke="${previewColor}" stroke-width="0.15"
                      stroke-dasharray="0.5,0.3" />`
          : svg`<ellipse rx="${hw}" ry="${hh}"
                         fill="none" stroke="${previewColor}" stroke-width="0.15"
                         stroke-dasharray="0.5,0.3" />`
        }
      </g>
    `;
  }

  #renderTextItem(t: TextItem) {
    const selected = this.selectedIds.has(t.id);
    const singleSelected = selected && this.selectedIds.size === 1;
    const angle = t.angle ?? 0;
    const fs = t.fontSize ?? TEXT_FONT_SIZE;
    const approxCharW = fs * 0.6;
    const hw = Math.max(t.text.length * approxCharW, fs) / 2;
    const hh = fs * 0.7;
    const pad = 0.4;

    return svg`
      <g data-id="${t.id}" data-kind="text"
         transform="translate(${t.x}, ${t.y}) rotate(${angle})">
        <rect x="${-hw - pad}" y="${-hh - pad}"
              width="${(hw + pad) * 2}" height="${(hh + pad) * 2}"
              fill="transparent"
              style="cursor: pointer" />
        ${selected ? svg`
          <rect x="${-hw - pad}" y="${-hh - pad}"
                width="${(hw + pad) * 2}" height="${(hh + pad) * 2}"
                fill="none" stroke="${this.#selColor}" stroke-width="0.12"
                stroke-dasharray="0.5,0.3" rx="0.2" />
        ` : nothing}
        <text x="0" y="0"
              text-anchor="middle" dominant-baseline="central"
              fill="${this.fieldTheme === 'white' ? WHITE_THEME.text : 'white'}" font-size="${fs}"
              font-family="system-ui, sans-serif"
              filter="${this.fieldTheme === 'white' ? '' : 'url(#text-shadow)'}"
              style="pointer-events: none">
          ${t.text}
        </text>
        ${this.#shouldShowRotate(t.id, singleSelected) ? this.#renderRectRotateHandles(t.id,
            -hw - pad - 0.5, -hh - pad - 0.5,
             hw + pad + 0.5,  hh + pad + 0.5) : nothing}
      </g>
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
        const first = this.renderRoot.querySelector('[role="menu"][aria-label="Options"] [role="menuitem"]') as HTMLElement | null;
        first?.focus();
      });
    }
  }

  #showAbout() {
    this._menuOpen = false;
    requestAnimationFrame(() => this._aboutDialog?.showModal());
  }

  #showSaveBoard() {
    this._menuOpen = false;
    this.#pendingBoardAction = null;
    this.#pendingOpenBoardId = null;
    this._saveBoardName = this.#currentBoard?.name === 'Untitled Board' ? '' : (this.#currentBoard?.name ?? '');
    this.#openSaveBoardDialog();
  }

  #openSaveBoardDialog() {
    requestAnimationFrame(() => {
      this._saveBoardDialog?.showModal();
      this.updateComplete.then(() => {
        const input = this.renderRoot.querySelector('#save-board-input') as HTMLInputElement | null;
        input?.focus();
      });
    });
  }

  #handleSaveAs() {
    this._menuOpen = false;
    this.#pendingBoardAction = 'save-as';
    this.#pendingOpenBoardId = null;
    this._saveBoardName = `Copy of ${this.#currentBoard?.name ?? 'Untitled Board'}`;
    this.#openSaveBoardDialog();
  }

  async #confirmSaveBoard() {
    const name = this._saveBoardName.trim();
    if (!name || !this.#currentBoard) return;
    const pendingAction = this.#pendingBoardAction;
    const pendingId = this.#pendingOpenBoardId;
    this._saveBoardDialog?.close();

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
        requestAnimationFrame(() => this._newBoardDialog?.showModal());
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
    this.#cachedSummary = this.#getBoardSummary();
    requestAnimationFrame(() => this._boardSummaryDialog?.showModal());
  }

  #saveBoardNotes() {
    this._boardSummaryDialog?.close();
  }

  #showPrintDialog() {
    this._menuOpen = false;
    requestAnimationFrame(() => this._printDialog?.showModal());
  }

  #handlePrint() {
    this._printDialog?.close();
    this.#isPrinting = true;
    this.#cachedSummary = this.#getBoardSummary();
    const host = this as unknown as HTMLElement;
    const savedTheme = this.fieldTheme;
    if (this._printSummary) host.classList.add('print-summary');
    if (this._printWhiteBg) {
      host.classList.add('print-white-bg');
      this.fieldTheme = 'white';
    }

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      host.classList.remove('print-summary', 'print-white-bg');
      if (this._printWhiteBg) this.fieldTheme = savedTheme;
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
    requestAnimationFrame(() => this._exportDialog?.showModal());
  }

  #exportSvg() { this._exportDialog?.close(); this.#saveSvg(); }
  #exportPng() { this._exportDialog?.close(); this.#savePng(); }
  #exportGif() { this._exportDialog?.close(); this.#saveGif(); }

  #handleNewBoard() {
    this._menuOpen = false;
    this._newBoardPitchType = 'full';
    if (!this.#isBoardSaved && !this.#isBoardEmpty) {
      this.#pendingBoardAction = 'new';
      this._saveBoardName = '';
      this.#openSaveBoardDialog();
      return;
    }
    if (this.#isBoardEmpty && !this.#isBoardSaved && this.#currentBoard) {
      deleteBoard(this.#currentBoard.id).catch(() => {});
    }
    requestAnimationFrame(() => this._newBoardDialog?.showModal());
  }

  async #confirmNewBoard() {
    this._newBoardDialog?.close();
    const board = createEmptyBoard('Untitled Board', this._newBoardPitchType);
    await saveBoard(board);
    this.#currentBoard = board;
    this._boardName = board.name;
    setActiveBoardId(board.id);
    this.players = [];
    this.lines = [];
    this.equipment = [];
    this.shapes = [];
    this.textItems = [];
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
    this.fieldOrientation = this._isMobile ? 'vertical' : 'horizontal';
  }

  async #showMyBoards() {
    this._menuOpen = false;
    this._myBoards = await listBoards();
    requestAnimationFrame(() => this._myBoardsDialog?.showModal());
  }

  #handleOpenBoard(id: string) {
    if (id === this.#currentBoard?.id) {
      this._myBoardsDialog?.close();
      return;
    }
    if (!this.#isBoardSaved && !this.#isBoardEmpty) {
      this.#pendingBoardAction = 'open';
      this.#pendingOpenBoardId = id;
      this._myBoardsDialog?.close();
      this._saveBoardName = '';
      this.#openSaveBoardDialog();
      return;
    }
    if (this.#isBoardEmpty && !this.#isBoardSaved && this.#currentBoard) {
      deleteBoard(this.#currentBoard.id).catch(() => {});
    }
    this._myBoardsDialog?.close();
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
    this.equipment = board.equipment;
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
    this._myBoards = await listBoards();
  }

  #handleDeleteBoard(board: SavedBoard) {
    this.#pendingDeleteBoard = board;
    this._deleteBoardName = board.name;
    requestAnimationFrame(() => this._deleteBoardDialog?.showModal());
  }

  async #confirmDeleteBoard() {
    if (!this.#pendingDeleteBoard) return;
    const id = this.#pendingDeleteBoard.id;
    this.#pendingDeleteBoard = null;
    this._deleteBoardDialog?.close();
    await deleteBoard(id);
    this._myBoards = await listBoards();
    if (id === this.#currentBoard?.id) {
      await this.#confirmNewBoard();
    }
  }

  #importSvgFromMyBoards() {
    this._myBoardsDialog?.close();
    this.#importSvg();
  }

  async #exportAllBoards() {
    const boards = this._myBoards.filter(b => b.name !== 'Untitled Board');
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
  <desc id="coaching-board-data" data-version="1.0.1">${json}</desc>
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

  #buildShareUrl() {
    const mode = this._shareEditable ? 'edit' : 'view';
    if (this.#shareShortId) {
      return `${window.location.origin}/s/${this.#shareShortId}?mode=${mode}`;
    }
    return `${window.location.origin}${window.location.pathname}#board=${this.#shareCompressed}&mode=${mode}`;
  }

  async #shareLink() {
    this._menuOpen = false;

    const data = JSON.stringify({
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

    const boardChanged = data !== this.#lastSharedData;
    if (boardChanged) {
      this.#shareShortId = '';
      this.#shareCompressed = '';
    }

    if (!this.#shareShortId) {
      this._shareMessage = 'Generating link\u2026';
      this._shareUrl = '';
      requestAnimationFrame(() => this._shareDialog?.showModal());

      try {
        const res = await fetch('/api/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: data,
        });
        if (res.ok) {
          const { id } = await res.json() as { id: string };
          this.#shareShortId = id;
          this.#lastSharedData = data;
        }
      } catch { /* API unavailable, fall back to hash */ }
    }

    if (!this.#shareShortId) {
      const { compressToEncodedURIComponent } = await import('lz-string');
      this.#shareCompressed = compressToEncodedURIComponent(data);
      this.#lastSharedData = data;
      const url = this.#buildShareUrl();
      if (url.length > 8000) {
        this._shareMessage = 'This board is too large to share as a link. Use "Export as SVG" instead and share the file.';
        this._shareUrl = '';
        return;
      }
    }

    this._shareUrl = this.#buildShareUrl();
    this._shareMessage = 'Copy the link to share with players, other coaches, etc.';
    if (!this._shareDialog?.open) {
      requestAnimationFrame(() => this._shareDialog?.showModal());
    }
  }

  #onShareEditableChange(e: Event) {
    this._shareEditable = (e.target as HTMLInputElement).checked;
    this._shareUrl = this.#buildShareUrl();
  }

  async #copyAndClose() {
    try {
      await navigator.clipboard.writeText(this._shareUrl);
      this._shareDialog?.close();
    } catch { /* leave dialog open so URL remains visible for manual copy */ }
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
        requestAnimationFrame(() => this._importErrorDialog?.showModal());
        return;
      }
      try {
        const data = JSON.parse(wrapper.textContent) as Record<string, unknown>;
        if (!Array.isArray(data.players)) {
          requestAnimationFrame(() => this._importErrorDialog?.showModal());
          return;
        }
        this.#pendingImportData = data;
        requestAnimationFrame(() => this._importConfirmDialog?.showModal());
      } catch {
        requestAnimationFrame(() => this._importErrorDialog?.showModal());
      }
    };
    reader.readAsText(file);
  }

  async #confirmImport() {
    this._importConfirmDialog?.close();
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
    const trigger = this.renderRoot.querySelector('[aria-haspopup="menu"][aria-label="Menu"]') as HTMLElement | null;
    trigger?.focus();
  }

  #onMenuBtnKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!this._menuOpen) this.#toggleMenu();
    }
  }

  #onMenuKeyDown(e: KeyboardEvent) {
    const items = Array.from(
      (e.currentTarget as HTMLElement).querySelectorAll('[role="menuitem"]')
    ) as HTMLElement[];
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
        this.#closeMenu();
        break;
      case 'Tab':
        this._menuOpen = false;
        break;
    }
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
    if (!this._animationMode) return { x: baseX, y: baseY };
    for (let i = this.activeFrameIndex; i >= 0; i--) {
      const pos = this.animationFrames[i]?.positions[id];
      if (pos) return { x: pos.x, y: pos.y };
    }
    return { x: baseX, y: baseY };
  }

  #getItemAngle(id: string, baseAngle: number | undefined): number | undefined {
    if (!this._animationMode) return baseAngle;
    for (let i = this.activeFrameIndex; i >= 0; i--) {
      const pos = this.animationFrames[i]?.positions[id];
      if (pos && pos.angle != null) return pos.angle;
    }
    return baseAngle;
  }

  #getItemPositionAtFrame(id: string, baseX: number, baseY: number, frameIndex: number): { x: number; y: number } {
    for (let i = frameIndex; i >= 0; i--) {
      const pos = this.animationFrames[i]?.positions[id];
      if (pos) return { x: pos.x, y: pos.y };
    }
    return { x: baseX, y: baseY };
  }

  #getItemAngleAtFrame(id: string, baseAngle: number | undefined, frameIndex: number): number | undefined {
    for (let i = frameIndex; i >= 0; i--) {
      const pos = this.animationFrames[i]?.positions[id];
      if (pos && pos.angle != null) return pos.angle;
    }
    return baseAngle;
  }

  #isLineVisible(lineId: string): boolean {
    if (!this._animationMode) return true;
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return false;
    for (let i = 0; i <= this.activeFrameIndex; i++) {
      const frame = this.animationFrames[i];
      if (!frame) continue;
      if (i === 0) continue;
      if (frame.visibleLineIds.includes(lineId)) return true;
    }
    const frame0 = this.animationFrames[0];
    if (!frame0) return true;
    const allFrameLineIds = this.animationFrames.slice(1).flatMap(f => f.visibleLineIds);
    if (allFrameLineIds.includes(lineId)) {
      return false;
    }
    return true;
  }

  #getFramePlayers(): Player[] {
    if (!this._animationMode) return this.players;
    if (this.isPlaying) return this.#getInterpolatedPlayers();
    return this.players.map(p => {
      const pos = this.#getItemPosition(p.id, p.x, p.y);
      const angle = this.#getItemAngle(p.id, p.angle);
      return { ...p, x: pos.x, y: pos.y, angle };
    });
  }

  #getFrameEquipment(): Equipment[] {
    if (!this._animationMode) return this.equipment;
    if (this.isPlaying) return this.#getInterpolatedEquipment();
    return this.equipment.map(eq => {
      const pos = this.#getItemPosition(eq.id, eq.x, eq.y);
      const angle = this.#getItemAngle(eq.id, eq.angle);
      return { ...eq, x: pos.x, y: pos.y, angle };
    });
  }

  #getInterpolatedPlayers(): Player[] {
    const t = this._playbackProgress;
    const fromIdx = this.activeFrameIndex;
    const toIdx = fromIdx + 1;
    if (toIdx >= this.animationFrames.length) {
      return this.players.map(p => {
        const pos = this.#getItemPositionAtFrame(p.id, p.x, p.y, fromIdx);
        const angle = this.#getItemAngleAtFrame(p.id, p.angle, fromIdx);
        return { ...p, x: pos.x, y: pos.y, angle };
      });
    }
    return this.players.map(p => {
      const from = this.#getItemPositionAtFrame(p.id, p.x, p.y, fromIdx);
      const to = this.#getItemPositionAtFrame(p.id, p.x, p.y, toIdx);
      const fromAngle = this.#getItemAngleAtFrame(p.id, p.angle, fromIdx) ?? 0;
      const toAngle = this.#getItemAngleAtFrame(p.id, p.angle, toIdx) ?? 0;
      const angleDelta = ((toAngle - fromAngle + 180) % 360 + 360) % 360 - 180;
      const angle = fromAngle + angleDelta * t;
      if (from.x === to.x && from.y === to.y) return { ...p, x: from.x, y: from.y, angle };
      const toFrame = this.animationFrames[toIdx];
      const trail = toFrame?.trails[p.id];
      const cp1x = trail?.cp1x ?? from.x + (to.x - from.x) / 3;
      const cp1y = trail?.cp1y ?? from.y + (to.y - from.y) / 3;
      const cp2x = trail?.cp2x ?? from.x + (to.x - from.x) * 2 / 3;
      const cp2y = trail?.cp2y ?? from.y + (to.y - from.y) * 2 / 3;
      return {
        ...p,
        x: cubicBezier(t, from.x, cp1x, cp2x, to.x),
        y: cubicBezier(t, from.y, cp1y, cp2y, to.y),
        angle,
      };
    });
  }

  #getInterpolatedEquipment(): Equipment[] {
    const t = this._playbackProgress;
    const fromIdx = this.activeFrameIndex;
    const toIdx = fromIdx + 1;
    if (toIdx >= this.animationFrames.length) {
      return this.equipment.map(eq => {
        const pos = this.#getItemPositionAtFrame(eq.id, eq.x, eq.y, fromIdx);
        const angle = this.#getItemAngleAtFrame(eq.id, eq.angle, fromIdx);
        return { ...eq, x: pos.x, y: pos.y, angle };
      });
    }
    return this.equipment.map(eq => {
      const from = this.#getItemPositionAtFrame(eq.id, eq.x, eq.y, fromIdx);
      const to = this.#getItemPositionAtFrame(eq.id, eq.x, eq.y, toIdx);
      const fromAngle = this.#getItemAngleAtFrame(eq.id, eq.angle, fromIdx) ?? 0;
      const toAngle = this.#getItemAngleAtFrame(eq.id, eq.angle, toIdx) ?? 0;
      const angleDelta = ((toAngle - fromAngle + 180) % 360 + 360) % 360 - 180;
      const angle = fromAngle + angleDelta * t;
      if (from.x === to.x && from.y === to.y) return { ...eq, x: from.x, y: from.y, angle };
      const toFrame = this.animationFrames[toIdx];
      const trail = toFrame?.trails[eq.id];
      const cp1x = trail?.cp1x ?? from.x + (to.x - from.x) / 3;
      const cp1y = trail?.cp1y ?? from.y + (to.y - from.y) / 3;
      const cp2x = trail?.cp2x ?? from.x + (to.x - from.x) * 2 / 3;
      const cp2y = trail?.cp2y ?? from.y + (to.y - from.y) * 2 / 3;
      return {
        ...eq,
        x: cubicBezier(t, from.x, cp1x, cp2x, to.x),
        y: cubicBezier(t, from.y, cp1y, cp2y, to.y),
        angle,
      };
    });
  }

  #renderGhostsAndTrails() {
    const frame = this.animationFrames[this.activeFrameIndex];
    if (!frame) return nothing;

    const trails: ReturnType<typeof svg>[] = [];

    for (const p of this.players) {
      if (!frame.positions[p.id]) continue;
      const curr = this.#getItemPosition(p.id, p.x, p.y);
      const prev = this.#getItemPositionAtFrame(p.id, p.x, p.y, this.activeFrameIndex - 1);
      if (curr.x === prev.x && curr.y === prev.y) continue;

      const trail = frame.trails[p.id];
      const cp1x = trail?.cp1x ?? prev.x + (curr.x - prev.x) / 3;
      const cp1y = trail?.cp1y ?? prev.y + (curr.y - prev.y) / 3;
      const cp2x = trail?.cp2x ?? prev.x + (curr.x - prev.x) * 2 / 3;
      const cp2y = trail?.cp2y ?? prev.y + (curr.y - prev.y) * 2 / 3;

      trails.push(svg`
        <g opacity="0.3">
          ${p.team === 'a'
            ? svg`<polygon points="${triPoints(prev.x, prev.y, PLAYER_RADIUS)}"
                           fill="${p.color}" stroke="white" stroke-width="0.15"
                           stroke-linejoin="round" style="pointer-events:none" />`
            : p.team === 'neutral'
            ? svg`<rect x="${prev.x - PLAYER_RADIUS * 0.95}" y="${prev.y - PLAYER_RADIUS * 0.95}"
                        width="${PLAYER_RADIUS * 0.95 * 2}" height="${PLAYER_RADIUS * 0.95 * 2}"
                        rx="0.3" fill="${p.color}" stroke="white" stroke-width="0.15"
                        transform="rotate(45 ${prev.x} ${prev.y})"
                        style="pointer-events:none" />`
            : svg`<circle cx="${prev.x}" cy="${prev.y}" r="${PLAYER_RADIUS}"
                          fill="${p.color}" stroke="white" stroke-width="0.15"
                          style="pointer-events:none" />`
          }
        </g>
        <path d="M ${prev.x},${prev.y} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${curr.x},${curr.y}"
              fill="none" stroke="${p.color}" stroke-width="0.25" stroke-opacity="0.5"
              stroke-dasharray="1,0.6" style="pointer-events:none" />
        <circle cx="${cp1x}" cy="${cp1y}" r="${CONTROL_HANDLE_R}"
                fill="${COLORS.annotation}" fill-opacity="0.7" stroke="${COLORS.annotation}" stroke-width="0.1"
                data-id="${p.id}" data-kind="trail-cp1"
                style="cursor:grab" />
        <circle cx="${cp2x}" cy="${cp2y}" r="${CONTROL_HANDLE_R}"
                fill="${COLORS.annotation}" fill-opacity="0.7" stroke="${COLORS.annotation}" stroke-width="0.1"
                data-id="${p.id}" data-kind="trail-cp2"
                style="cursor:grab" />
      `);
    }

    for (const eq of this.equipment) {
      if (!frame.positions[eq.id]) continue;
      const curr = this.#getItemPosition(eq.id, eq.x, eq.y);
      const prev = this.#getItemPositionAtFrame(eq.id, eq.x, eq.y, this.activeFrameIndex - 1);
      if (curr.x === prev.x && curr.y === prev.y) continue;

      const trail = frame.trails[eq.id];
      const cp1x = trail?.cp1x ?? prev.x + (curr.x - prev.x) / 3;
      const cp1y = trail?.cp1y ?? prev.y + (curr.y - prev.y) / 3;
      const cp2x = trail?.cp2x ?? prev.x + (curr.x - prev.x) * 2 / 3;
      const cp2y = trail?.cp2y ?? prev.y + (curr.y - prev.y) * 2 / 3;

      const color = eq.color ?? COLORS.accent;
      trails.push(svg`
        <g opacity="0.3">
          <circle cx="${prev.x}" cy="${prev.y}" r="${BALL_RADIUS}"
                  fill="white" stroke="white" stroke-width="0.15"
                  style="pointer-events:none" />
        </g>
        <path d="M ${prev.x},${prev.y} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${curr.x},${curr.y}"
              fill="none" stroke="${color}" stroke-width="0.25" stroke-opacity="0.5"
              stroke-dasharray="1,0.6" style="pointer-events:none" />
        <circle cx="${cp1x}" cy="${cp1y}" r="${CONTROL_HANDLE_R}"
                fill="${COLORS.annotation}" fill-opacity="0.7" stroke="${COLORS.annotation}" stroke-width="0.1"
                data-id="${eq.id}" data-kind="trail-cp1"
                style="cursor:grab" />
        <circle cx="${cp2x}" cy="${cp2y}" r="${CONTROL_HANDLE_R}"
                fill="${COLORS.annotation}" fill-opacity="0.7" stroke="${COLORS.annotation}" stroke-width="0.1"
                data-id="${eq.id}" data-kind="trail-cp2"
                style="cursor:grab" />
      `);
    }

    return svg`<g class="ghosts-trails-layer">${trails}</g>`;
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

  #requestClearAll() {
    const hasItems = this.players.length || this.lines.length || this.equipment.length || this.shapes.length || this.textItems.length || this.animationFrames.length;
    if (hasItems) {
      requestAnimationFrame(() => this._resetDialog?.showModal());
    }
  }

  #cancelClearAll() {
    this._resetDialog?.close();
  }

  #confirmClearAll() {
    this._resetDialog?.close();
    this.#onClearAll(new ClearAllEvent());
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

  #onClearAll(_e: ClearAllEvent) {
    if (this.players.length || this.lines.length || this.equipment.length || this.shapes.length || this.textItems.length || this.animationFrames.length) {
      this.#pushUndo();
    }
    this.players = [];
    this.lines = [];
    this.equipment = [];
    this.shapes = [];
    this.textItems = [];
    this.animationFrames = [];
    this.activeFrameIndex = 0;
    this._animationMode = false;
    this.#stopPlayback();
    this._playbackProgress = 0;
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
    const pt = screenToSVG(this.svgEl, e.clientX, e.clientY);

    if (this.activeTool === 'add-player') {
      this.#pushUndo();
      this.#addPlayer(pt.x, pt.y);
      return;
    }

    if (this.activeTool === 'add-equipment') {
      this.#pushUndo();
      this.#addEquipment(pt.x, pt.y);
      return;
    }

    if (this.activeTool === 'add-text') {
      this.#pushUndo();
      this.#addTextItem(pt.x, pt.y, 'Text');
      return;
    }

    if (this.activeTool === 'draw-line') {
      this.#draw = { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
      this.svgEl.setPointerCapture(e.pointerId);
      this.requestUpdate();
      return;
    }

    if (this.activeTool === 'draw-shape') {
      this.#shapeDraw = { kind: this.shapeKind, startX: pt.x, startY: pt.y, curX: pt.x, curY: pt.y };
      this.svgEl.setPointerCapture(e.pointerId);
      this.requestUpdate();
      return;
    }

    this._menuOpen = false;

    const hit = resolveHit(e.target);
    if (!hit) {
      this.selectedIds = new Set();
      this._multiSelect = false;
      return;
    }

    const { kind, id } = hit;

    // Trail control point handles
    if (kind === 'trail-cp1' || kind === 'trail-cp2') {
      this.#trailDrag = { id, cp: kind === 'trail-cp1' ? 'cp1' : 'cp2' };
      this.svgEl.setPointerCapture(e.pointerId);
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
      this.svgEl.setPointerCapture(e.pointerId);
      return;
    }

    // Shape resize handles
    if (kind === 'shape-corner' || kind === 'shape-side') {
      this.#pushUndo();
      const target = e.target as SVGElement;
      const handle = target.dataset.handle ?? 'se';
      const sh = this.shapes.find(s => s.id === id)!;
      this.#shapeResizeDrag = {
        id, handle,
        origCx: sh.cx, origCy: sh.cy,
        origHw: sh.hw, origHh: sh.hh,
        startX: pt.x, startY: pt.y,
      };
      this.svgEl.setPointerCapture(e.pointerId);
      return;
    }

    // Line control-point handles: single-item only
    if (kind === 'line-start' || kind === 'line-end' || kind === 'line-control') {
      this.#pushUndo();
      this.selectedIds = new Set([id]);
      this.#handleDrag = { kind, id };
      this.svgEl.setPointerCapture(e.pointerId);
      return;
    }

    // Double-tap detection for rotate handles on mobile
    if (this._isMobile) {
      const now = Date.now();
      if (this.#lastTapId === id && now - this.#lastTapTime < 300) {
        this.#lastTapTime = 0;
        this.#lastTapId = null;
        let canRotate = false;
        if (kind === 'player') {
          const p = this.players.find(p => p.id === id);
          canRotate = !!p && isRotatable(p);
        } else if (kind === 'equipment') {
          const eq = this.equipment.find(eq => eq.id === id);
          canRotate = !!eq && isRotatable(eq);
        } else if (kind === 'shape' || kind === 'text') {
          canRotate = true;
        }
        if (canRotate) {
          this.selectedIds = new Set([id]);
          this._rotateHandleId = this._rotateHandleId === id ? null : id;
          return;
        }
      }
      this.#lastTapTime = now;
      this.#lastTapId = id;
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
    this.svgEl.setPointerCapture(e.pointerId);
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
    const pt = screenToSVG(this.svgEl, e.clientX, e.clientY);

    if (this.activeTool === 'add-player' || this.activeTool === 'add-equipment' || this.activeTool === 'add-text') {
      this.ghost = { x: pt.x, y: pt.y };
      return;
    }

    if (this.#draw) {
      this.#draw.x2 = pt.x;
      this.#draw.y2 = pt.y;
      this.requestUpdate();
      return;
    }

    if (this.#shapeDraw) {
      this.#shapeDraw.curX = pt.x;
      this.#shapeDraw.curY = pt.y;
      if (e.shiftKey) {
        const dx = Math.abs(pt.x - this.#shapeDraw.startX);
        const dy = Math.abs(pt.y - this.#shapeDraw.startY);
        const size = Math.min(dx, dy);
        this.#shapeDraw.curX = this.#shapeDraw.startX + Math.sign(pt.x - this.#shapeDraw.startX) * size;
        this.#shapeDraw.curY = this.#shapeDraw.startY + Math.sign(pt.y - this.#shapeDraw.startY) * size;
      }
      this.requestUpdate();
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
        if (cp === 'cp1') {
          newTrails[id] = { ...existing, cp1x: pt.x, cp1y: pt.y };
        } else {
          newTrails[id] = { ...existing, cp2x: pt.x, cp2y: pt.y };
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
        this.lines = this.lines.map(l => l.id === id ? { ...l, x1: pt.x, y1: pt.y } : l);
      } else if (kind === 'line-end') {
        this.lines = this.lines.map(l => l.id === id ? { ...l, x2: pt.x, y2: pt.y } : l);
      } else if (kind === 'line-control') {
        this.lines = this.lines.map(l => l.id === id ? { ...l, cx: pt.x, cy: pt.y } : l);
      }
      return;
    }

    if (!this.#groupDrag) return;

    const { anchorX, anchorY, pointOrigins, lineOrigins } = this.#groupDrag;
    const dx = pt.x - anchorX;
    const dy = pt.y - anchorY;

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
    if (this.#draw) {
      const d = this.#draw;
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
      this.#draw = null;
      this.requestUpdate();
    }

    if (this.#shapeDraw) {
      const d = this.#shapeDraw;
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
      }
      this.#shapeDraw = null;
      this.requestUpdate();
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
        newPositions[id] = { x: pos.x, y: pos.y, angle: this.#getItemAngle(p.id, p.angle) };
        continue;
      }
      const eq = this.equipment.find(e => e.id === id);
      if (eq) {
        const pos = this.#getItemPosition(eq.id, eq.x, eq.y);
        newPositions[id] = { x: pos.x, y: pos.y, angle: this.#getItemAngle(eq.id, eq.angle) };
        continue;
      }
    }

    this.animationFrames = this.animationFrames.map((f, i) =>
      i === this.activeFrameIndex ? { ...f, positions: newPositions } : f
    );
  }

  #onPointerLeave(_e: PointerEvent) {
    this.ghost = null;
    if (this.#draw) {
      this.#draw = null;
      this.requestUpdate();
    }
    if (this.#shapeDraw) {
      this.#shapeDraw = null;
      this.requestUpdate();
    }
    this.#groupDrag = null;
    this.#handleDrag = null;
    this.#rotateDrag = null;
    this.#shapeResizeDrag = null;
    this.#trailDrag = null;
  }

  #onKeyDown(e: KeyboardEvent) {
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
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedIds.size > 0) {
      if (document.activeElement?.tagName === 'INPUT') return;
      this.#pushUndo();
      const ids = this.selectedIds;
      this.players = this.players.filter(p => !ids.has(p.id));
      this.lines = this.lines.filter(l => !ids.has(l.id));
      this.equipment = this.equipment.filter(eq => !ids.has(eq.id));
      this.shapes = this.shapes.filter(s => !ids.has(s.id));
      this.textItems = this.textItems.filter(t => !ids.has(t.id));
      this.selectedIds = new Set();
    }
    if (e.key === 'Escape') {
      this.activeTool = 'select';
      this.ghost = null;
      this.selectedIds = new Set();
    }
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
    const newPlayer: Player = {
      id: uid('player'),
      x, y,
      team,
      color,
      label,
    };
    this.players = [...this.players, newPlayer];
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
  }

  #addTextItem(x: number, y: number, text: string) {
    const newText: TextItem = {
      id: uid('text'),
      x, y,
      text,
    };
    this.textItems = [...this.textItems, newText];
    this.selectedIds = new Set([newText.id]);
    this.activeTool = 'select';
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'coach-board': CoachBoard;
  }
}
