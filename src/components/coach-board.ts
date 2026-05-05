import { LitElement, html, svg, css, nothing } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';

import type { Player, Line, Equipment, Shape, TextItem, Tool, LineStyle, EquipmentKind, ShapeKind, ShapeStyle, Team, FieldTheme } from '../lib/types.js';
import { COLORS, getTextColor, SHAPE_STYLES, getShapeStyles, getPlayerColors, getConeColors, getLineColors } from '../lib/types.js';
import { renderField, renderVerticalField, getFieldDimensions, FIELD } from '../lib/field.js';
import type { FieldOrientation } from '../lib/field.js';
import { screenToSVG, uid, ensureMinId } from '../lib/svg-utils.js';
import { ToolChangedEvent, ClearAllEvent, PlayerUpdateEvent, EquipmentUpdateEvent, LineUpdateEvent, ShapeUpdateEvent, TextUpdateEvent, AlignItemsEvent, GroupItemsEvent, UngroupItemsEvent, SaveSvgEvent, DeleteItemsEvent, MultiSelectToggleEvent } from './cb-toolbar.js';
import type { AlignAction } from './cb-toolbar.js';

import './cb-toolbar.js';

const PLAYER_RADIUS = 2.4;
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

const BALL_RADIUS = 1.575;
const CONE_RADIUS = 0.9;
const CONE_BORDER = 0.675;
const GOAL_W = 7.32;
const GOAL_D = 2;
const MINI_GOAL_W = 3.66;
const MINI_GOAL_D = 1;
const POPUP_GOAL_W = 3;
const POPUP_GOAL_D = 1.5;
const POPUP_GOAL_COLOR = COLORS.popupGoal;
const GOAL_LINE_W = 0.18;
const CONTROL_HANDLE_R = 1.6;
const ROTATE_HANDLE_R = 0.875;
const HIT_SLOP = 1.8;
const HIT_SLOP_MOBILE = 3.0;
const PADDING = 4;

type DragKind = 'player' | 'equipment' | 'shape' | 'text' | 'line-start' | 'line-end' | 'line-control' | 'line-body' | 'rotate' | 'shape-corner' | 'shape-side';

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
const STORAGE_KEY = 'coach-board-state';

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

function isModifier(e: PointerEvent | MouseEvent): boolean {
  return e.shiftKey || e.metaKey || e.ctrlKey;
}

function rad2deg(r: number): number { return r * 180 / Math.PI; }

function isRotatable(item: Player | Equipment): boolean {
  if ('team' in item) return item.team === 'a';
  return item.kind === 'goal' || item.kind === 'mini-goal' || item.kind === 'popup-goal';
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

    .field-area {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      min-height: 0;
      padding: 12px;
      background: var(--pt-bg-body);
      transition: background 0.2s;
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
      background: var(--pt-bg-primary);
      z-index: 10;
      box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.3);
      user-select: none;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .bottom-left {
      display: flex;
      gap: 4px;
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
      gap: 4px;
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
      color: var(--pt-danger-light);
      border-color: var(--pt-danger-light);
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
      margin-bottom: 12px;
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
    }

    .confirm-actions button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
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
      background: var(--pt-danger);
      border-color: var(--pt-danger);
      color: var(--pt-text-white);
    }

    .confirm-actions .confirm-danger:hover {
      background: var(--pt-danger-hover);
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

  `;

  @state() accessor activeTool: Tool = 'select';
  @state() accessor players: Player[] = [];
  @state() accessor lines: Line[] = [];
  @state() accessor equipment: Equipment[] = [];
  @state() accessor selectedIds: Set<string> = new Set();
  @state() accessor playerColor: string = COLORS.playerBlue;
  @state() accessor playerTeam: Team = 'a';
  @state() accessor lineStyle: LineStyle = 'solid';
  @state() accessor equipmentKind: EquipmentKind = 'ball';
  @state() accessor shapeKind: ShapeKind = 'rect';
  @state() accessor shapes: Shape[] = [];
  @state() accessor textItems: TextItem[] = [];
  @state() accessor fieldOrientation: FieldOrientation = window.innerWidth <= 768 ? 'vertical' : 'horizontal';
  @state() accessor fieldTheme: FieldTheme = 'green';
  @state() accessor ghost: GhostCursor | null = null;
  @state() private accessor _pendingOrientation: FieldOrientation | null = null;
  @state() private accessor _fieldMenuOpen: boolean = false;
  @state() private accessor _isMobile: boolean = window.innerWidth <= 768;
  @state() private accessor _multiSelect: boolean = false;
  @state() private accessor _menuOpen: boolean = false;
  @state() private accessor _rotateHandleId: string | null = null;

  @query('svg') accessor svgEl!: SVGSVGElement;
  @query('#orientation-dialog') accessor _orientationDialog!: HTMLDialogElement;
  @query('#reset-dialog') accessor _resetDialog!: HTMLDialogElement;
  @query('#about-dialog') accessor _aboutDialog!: HTMLDialogElement;

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
    this._isMobile = e.matches;
    if (e.matches) {
      this.#requestOrientation('vertical');
    } else {
      const saved = this.#loadOrientationFromStorage();
      if (saved) this.#requestOrientation(saved);
    }
  };
  #lastTapTime = 0;
  #lastTapId: string | null = null;
  #undoStack: Snapshot[] = [];
  #redoStack: Snapshot[] = [];

  #snapshot(): Snapshot {
    return {
      players: structuredClone(this.players),
      lines: structuredClone(this.lines),
      equipment: structuredClone(this.equipment),
      shapes: structuredClone(this.shapes),
      textItems: structuredClone(this.textItems),
    };
  }

  #saveToStorage() {
    try {
      const data: Snapshot = {
        players: this.players,
        lines: this.lines,
        equipment: this.equipment,
        shapes: this.shapes,
        textItems: this.textItems,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* quota exceeded or private browsing */ }
  }

  #loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<Snapshot>;
      if (data.players) this.players = data.players;
      if (data.lines) this.lines = data.lines;
      if (data.equipment) this.equipment = data.equipment;
      if (data.shapes) this.shapes = data.shapes;
      if (data.textItems) this.textItems = data.textItems;

      const allIds = [
        ...this.players, ...this.equipment, ...this.shapes, ...this.textItems,
      ].map(i => i.id).concat(this.lines.map(l => l.id));
      for (const id of allIds) {
        const num = parseInt(id.split('-').pop() ?? '0', 10);
        if (!isNaN(num)) ensureMinId(num);
      }
    } catch { /* corrupted data */ }
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
    } else {
      const savedOrientation = this.#loadOrientationFromStorage();
      if (savedOrientation) {
        this.fieldOrientation = savedOrientation;
      }
    }
    this.#loadThemeFromStorage();
    this.#loadFromStorage();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.#boundKeyDown);
    document.removeEventListener('pointerdown', this.#onDocClickForMenu);
    this.#mobileQuery.removeEventListener('change', this.#onMobileChange);
  }

  protected override updated(changedProperties: Map<PropertyKey, unknown>) {
    if (changedProperties.has('players') || changedProperties.has('lines') ||
        changedProperties.has('equipment') || changedProperties.has('shapes') ||
        changedProperties.has('textItems')) {
      this.#saveToStorage();
    }
    if (changedProperties.has('selectedIds') && this._rotateHandleId && !this.selectedIds.has(this._rotateHandleId)) {
      this._rotateHandleId = null;
    }
  }

  render() {
    const fd = getFieldDimensions(this.fieldOrientation);
    const vbX = -PADDING;
    const vbY = -PADDING;
    const vbW = fd.w + PADDING * 2;
    const vbH = fd.h + PADDING * 2;

    return html`
      <div class="toolbar-area">
        <cb-toolbar
          .activeTool="${this.activeTool}"
          .selectedItems="${this.#selectedItems}"
          .fieldTheme="${this.fieldTheme}"
          .multiSelect="${this._multiSelect}"
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
          @delete-items="${this.#onDeleteItems}">
        </cb-toolbar>
      </div>

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

          ${this.fieldOrientation === 'vertical'
            ? renderVerticalField(this.fieldTheme === 'white' ? WHITE_THEME.fieldLine : 'white')
            : renderField(this.fieldTheme === 'white' ? WHITE_THEME.fieldLine : 'white')}

          <g class="shapes-layer">
            ${this.shapes.filter(s => !this.selectedIds.has(s.id)).map(s => this.#renderShape(s))}
            ${this.#shapeDraw ? this.#renderShapeDrawPreview() : nothing}
          </g>

          <g class="lines-layer">
            ${this.lines.filter(l => !this.selectedIds.has(l.id)).map(l => this.#renderLine(l))}
            ${this.#draw ? this.#renderDrawPreview() : nothing}
          </g>

          <g class="players-layer">
            ${this.players.filter(p => !this.selectedIds.has(p.id)).map(p => this.#renderPlayer(p))}
          </g>

          <g class="equipment-layer">
            ${this.equipment.filter(eq => !this.selectedIds.has(eq.id)).map(eq => this.#renderEquipment(eq))}
          </g>

          <g class="text-layer">
            ${this.textItems.filter(t => !this.selectedIds.has(t.id)).map(t => this.#renderTextItem(t))}
          </g>

          <g class="selected-layer">
            ${this.shapes.filter(s => this.selectedIds.has(s.id)).map(s => this.#renderShape(s))}
            ${this.lines.filter(l => this.selectedIds.has(l.id)).map(l => this.#renderLine(l))}
            ${this.players.filter(p => this.selectedIds.has(p.id)).map(p => this.#renderPlayer(p))}
            ${this.equipment.filter(eq => this.selectedIds.has(eq.id)).map(eq => this.#renderEquipment(eq))}
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
      </div>

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
          <label class="visually-hidden" for="field-theme-select">Field theme</label>
          <select id="field-theme-select" class="theme-select"
                  @change="${this.#onThemeChange}">
            <option value="green" ?selected="${this.fieldTheme === 'green'}">Green</option>
            <option value="white" ?selected="${this.fieldTheme === 'white'}">White</option>
          </select>
          ${!this._isMobile ? html`
            <div class="dropdown-wrap">
              <button aria-label="${this.fieldOrientation === 'horizontal' ? 'Horizontal field' : 'Vertical field'}"
                      title="Field orientation"
                      @click="${this.#toggleFieldMenu}">
                <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0">
                  ${this.fieldOrientation === 'horizontal'
                    ? svg`<path d="m1152 555.6-168-168c-24-24-63.602-24-87.602 0s-24 63.602 0 87.602l62.398 62.398h-716.4l62.398-62.398c24-24 24-63.602 0-87.602s-63.602-24-87.602 0l-168 168c-24 24-24 63.602 0 87.602l168 168c12 12 27.602 18 44.398 18 15.602 0 31.199-6 44.398-18 24-24 24-63.602 0-87.602l-62.398-62.398h716.4l-62.398 62.398c-24 24-24 63.602 0 87.602 12 12 27.602 18 44.398 18 16.801 0 31.199-6 44.398-18l168-168c21.609-24.004 21.609-62.402-2.3906-87.602z" fill="currentColor"/>`
                    : svg`<path d="m732 878.4-66 66v-690l66 66c13.199 13.199 30 19.199 46.801 19.199s33.602-6 46.801-19.199c26.398-26.398 26.398-67.199 0-93.602l-178.8-178.8c-25.199-24-68.402-24-93.602 0l-178.8 180c-26.398 26.398-26.398 67.199 0 93.602 26.398 26.398 67.199 25.199 93.602 0l66-66v690l-66-67.203c-26.398-26.398-67.199-26.398-93.602 0-26.398 26.398-26.398 67.199 0 93.602l178.8 178.8c13.199 13.199 30 19.199 46.801 19.199s33.602-6 46.801-19.199l178.8-178.8c26.398-26.398 26.398-67.199 0-93.602-25.203-26.398-67.203-26.398-93.602 0z" fill="currentColor"/>`}
                </svg>
                <span class="btn-text">${this.fieldOrientation === 'horizontal' ? 'Horizontal' : 'Vertical'} Field</span>
                <span class="caret ${this._fieldMenuOpen ? 'open' : ''}"></span>
              </button>
              ${this._fieldMenuOpen ? html`
                <div role="menu" aria-label="Field orientation">
                  <button role="menuitem"
                          @click="${() => this.#requestOrientation('horizontal')}">
                    <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0">
                      <path d="m1152 555.6-168-168c-24-24-63.602-24-87.602 0s-24 63.602 0 87.602l62.398 62.398h-716.4l62.398-62.398c24-24 24-63.602 0-87.602s-63.602-24-87.602 0l-168 168c-24 24-24 63.602 0 87.602l168 168c12 12 27.602 18 44.398 18 15.602 0 31.199-6 44.398-18 24-24 24-63.602 0-87.602l-62.398-62.398h716.4l-62.398 62.398c-24 24-24 63.602 0 87.602 12 12 27.602 18 44.398 18 16.801 0 31.199-6 44.398-18l168-168c21.609-24.004 21.609-62.402-2.3906-87.602z" fill="currentColor"/>
                    </svg>
                    Horizontal Field
                  </button>
                  <button role="menuitem"
                          @click="${() => this.#requestOrientation('vertical')}">
                    <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0">
                      <path d="m732 878.4-66 66v-690l66 66c13.199 13.199 30 19.199 46.801 19.199s33.602-6 46.801-19.199c26.398-26.398 26.398-67.199 0-93.602l-178.8-178.8c-25.199-24-68.402-24-93.602 0l-178.8 180c-26.398 26.398-26.398 67.199 0 93.602 26.398 26.398 67.199 25.199 93.602 0l66-66v690l-66-67.203c-26.398-26.398-67.199-26.398-93.602 0-26.398 26.398-26.398 67.199 0 93.602l178.8 178.8c13.199 13.199 30 19.199 46.801 19.199s33.602-6 46.801-19.199l178.8-178.8c26.398-26.398 26.398-67.199 0-93.602-25.203-26.398-67.203-26.398-93.602 0z" fill="currentColor"/>
                    </svg>
                    Vertical Field
                  </button>
                </div>
              ` : nothing}
            </div>
          ` : nothing}
        </div>
        <div class="bottom-right">
          <button class="danger" aria-label="Reset all" title="Reset all"
                  @click="${this.#requestClearAll}">
            <svg viewBox="0 0 1600 1600" width="18" height="18" style="flex-shrink:0">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M515.399 422.213C594.372 362.859 692.519 327.687 798.799 327.687C1059.49 327.687 1271.12 539.313 1271.12 800.007C1271.12 1060.7 1059.49 1272.33 798.799 1272.33C550.319 1272.33 346.439 1080.03 327.866 836.273C325.22 801.607 351.199 771.347 385.866 768.7C420.532 766.053 450.792 792.033 453.439 826.7C467.075 1005.43 616.612 1146.37 798.799 1146.37C989.959 1146.37 1145.16 991.167 1145.16 799.993C1145.16 608.833 989.959 453.633 798.799 453.633C724.736 453.633 656.066 476.931 599.732 516.607H641.358C676.118 516.607 704.331 544.82 704.331 579.58C704.331 614.345 676.118 642.559 641.358 642.559H452.424C417.627 642.559 389.446 614.376 389.446 579.58V390.647C389.446 355.887 417.659 327.673 452.424 327.673C487.184 327.673 515.398 355.887 515.398 390.647L515.399 422.213Z" fill="currentColor"/>
            </svg>
            <span class="btn-text">Reset All</span>
          </button>
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
                  <svg viewBox="0 0 16 16" width="14" height="14" style="flex-shrink:0">
                    <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5" />
                    <text x="8" y="12" text-anchor="middle" fill="currentColor" font-size="11" font-weight="bold" font-family="system-ui, sans-serif">i</text>
                  </svg>
                  About
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${this.#saveSvg}">
                  <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0">
                    <path d="m1076.4 816.6v210.9c0 4.1992-0.60156 8.1016-1.5 11.699-4.1992 20.699-22.5 36.301-44.102 36.301h-861.9c-23.102 0-42.301-17.699-44.699-40.199-0.60156-2.6992-0.60156-5.1016-0.60156-8.1016v-210.9c0-24.898 20.398-45 45-45 12.301 0 23.699 5.1016 31.801 13.199 8.1016 8.1016 13.199 19.5 13.199 31.801v168.9h773.1v-168.9c0-24.898 20.398-45 45-45 12.301 0 23.699 5.1016 31.801 13.199 7.8008 8.3984 12.898 19.801 12.898 32.102z" fill="currentColor"/>
                    <path d="m859.5 605.4-221.1 221.1c-0.30078 0.60156-0.89844 0.89844-1.1992 1.1992-8.1016 8.1016-18.602 13.199-29.102 14.699-0.89844 0-1.8008 0.30078-2.6992 0.30078-1.8008 0.30078-3.6016 0.30078-5.3984 0.30078l-5.1016-0.30078c-0.89844 0-1.8008-0.30078-2.6992-0.30078-10.801-1.5-21-6.6016-29.102-14.699-0.30078-0.30078-0.89844-0.89844-1.1992-1.1992l-221.1-221.1c-10.199-10.199-15.301-23.699-15.301-37.199s5.1016-27 15.301-37.199c20.398-20.398 53.699-20.398 74.398 0l132.9 132.9 0.007812-486.9c0-28.801 23.699-52.5 52.5-52.5 14.398 0 27.602 6 37.199 15.301 9.6016 9.6016 15.301 22.5 15.301 37.199v486.9l132.9-132.9c20.398-20.398 53.699-20.398 74.398 0 19.5 20.699 19.5 54-0.89844 74.398z" fill="currentColor"/>
                  </svg>
                  Save as SVG
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${this.#savePng}">
                  <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0">
                    <path d="m1076.4 816.6v210.9c0 4.1992-0.60156 8.1016-1.5 11.699-4.1992 20.699-22.5 36.301-44.102 36.301h-861.9c-23.102 0-42.301-17.699-44.699-40.199-0.60156-2.6992-0.60156-5.1016-0.60156-8.1016v-210.9c0-24.898 20.398-45 45-45 12.301 0 23.699 5.1016 31.801 13.199 8.1016 8.1016 13.199 19.5 13.199 31.801v168.9h773.1v-168.9c0-24.898 20.398-45 45-45 12.301 0 23.699 5.1016 31.801 13.199 7.8008 8.3984 12.898 19.801 12.898 32.102z" fill="currentColor"/>
                    <path d="m859.5 605.4-221.1 221.1c-0.30078 0.60156-0.89844 0.89844-1.1992 1.1992-8.1016 8.1016-18.602 13.199-29.102 14.699-0.89844 0-1.8008 0.30078-2.6992 0.30078-1.8008 0.30078-3.6016 0.30078-5.3984 0.30078l-5.1016-0.30078c-0.89844 0-1.8008-0.30078-2.6992-0.30078-10.801-1.5-21-6.6016-29.102-14.699-0.30078-0.30078-0.89844-0.89844-1.1992-1.1992l-221.1-221.1c-10.199-10.199-15.301-23.699-15.301-37.199s5.1016-27 15.301-37.199c20.398-20.398 53.699-20.398 74.398 0l132.9 132.9 0.007812-486.9c0-28.801 23.699-52.5 52.5-52.5 14.398 0 27.602 6 37.199 15.301 9.6016 9.6016 15.301 22.5 15.301 37.199v486.9l132.9-132.9c20.398-20.398 53.699-20.398 74.398 0 19.5 20.699 19.5 54-0.89844 74.398z" fill="currentColor"/>
                  </svg>
                  Save as PNG
                </button>
              </div>
            ` : nothing}
          </div>
        </div>
      </div>

      <dialog id="orientation-dialog">
        <div class="dialog-header">
          <h2>Change field orientation</h2>
          <button class="dialog-close" aria-label="Close" title="Close" @click="${this.#cancelOrientationChange}">
            <svg viewBox="0 0 16 16"><path d="M 4,4 L 12,12 M 12,4 L 4,12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </button>
        </div>
        <div class="dialog-body">
          <p>What would you like to do with existing items? If you keep the items, some shifting may occur.</p>
          <div class="confirm-actions">
            <button class="cancel-btn" @click="${this.#cancelOrientationChange}">Cancel</button>
            <div class="confirm-actions-right">
              <button class="confirm-success" @click="${this.#applyOrientationKeep}">Keep items</button>
              <button class="confirm-danger" @click="${this.#applyOrientationClear}">Clear all</button>
            </div>
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
          <svg class="about-icon" viewBox="0 0 1200 1200" width="48" height="48">
            <path d="M600 1127C891.054 1127 1127 891.054 1127 600C1127 308.946 891.054 73 600 73C308.946 73 73 308.946 73 600C73 891.054 308.946 1127 600 1127Z" fill="white"/>
            <path d="M1080 600.84C1079.77 728.15 1029 850.12 938.81 939.98C848.62 1029.84 726.47 1080.24 599.15 1080C471.84 1079.77 349.87 1029 260.01 938.81C170.143 848.619 119.75 726.47 119.99 599.15C120.224 471.84 170.99 349.87 261.18 260.01C351.371 170.143 473.52 119.75 600.84 119.99C728.06 120.506 849.89 171.365 939.7 261.51C1029.47 351.604 1079.96 473.62 1079.99 600.83L1080 600.84ZM598.08 754.45C623.861 754.45 649.689 755.294 675.377 754.45C683.768 753.606 691.361 749.247 696.377 742.45C721.596 700.872 745.924 658.684 769.455 615.98V615.933C772.69 608.996 772.69 600.98 769.455 593.995C745.455 551.995 719.533 509.995 693.517 469.305H693.47C688.923 463.071 681.939 459.086 674.298 458.289C625.595 457.352 576.798 457.352 528.008 458.289C519.618 459.133 511.977 463.492 507.008 470.289C480.992 510.977 455.539 552.414 430.555 594.469C427.368 601.407 427.368 609.375 430.555 616.313C454.555 658.875 478.977 701.016 503.774 742.783C508.274 748.971 515.118 753.002 522.712 753.845C547.931 755.158 573.009 754.455 598.087 754.455L598.08 754.45ZM423.37 327.84C382.682 331.778 350.058 334.309 317.76 338.621C309.229 340.121 301.635 344.856 296.526 351.84C271.917 390.465 248.526 429.84 225.37 469.54C221.995 475.868 221.292 483.274 223.448 490.071C236.714 522.93 250.917 555.415 266.057 587.524C269.62 593.243 275.713 596.946 282.463 597.462C314.385 595.305 346.166 592.165 378.463 587.759C386.807 586.212 394.213 581.477 399.135 574.54C425.291 533.478 450.557 491.946 474.979 449.85H474.932C478.729 442.443 479.339 433.772 476.62 425.85C464.62 397.538 452.62 369.694 438.839 342.459C434.761 336.552 429.464 331.584 423.37 327.834L423.37 327.84ZM775.92 327.84C770.389 331.59 765.654 336.371 761.998 341.996C748.451 369.371 735.607 397.215 724.076 425.996C721.404 433.871 721.873 442.449 725.389 449.996C749.389 491.996 775.17 533.996 801.327 574.546H801.373C806.905 581.718 814.967 586.499 823.92 587.999C854.764 592.452 885.982 595.452 917.154 597.374C924.514 596.624 931.076 592.452 934.779 586.077C949.404 555.468 963.091 524.296 975.841 492.702C978.513 485.296 978.091 477.14 974.763 470.061C951.701 430.358 928.075 391.123 903.466 352.361V352.314C898.544 345.283 891.138 340.408 882.7 338.626C849.606 334.22 815.997 331.689 775.92 327.704L775.92 327.84ZM762.139 889.92C739.92 858.936 718.311 827.998 695.998 798.232C691.686 794.107 685.92 791.857 679.92 791.998C626.623 791.341 573.09 791.341 519.23 791.998C513.277 792.232 507.605 794.81 503.527 799.216C481.215 829.216 459.746 859.216 437.761 890.294C460.308 919.216 481.214 946.919 503.386 974.294C508.824 980.06 516.23 983.529 524.152 983.998C574.871 984.794 625.682 984.794 676.542 983.998C684.042 983.482 691.026 980.06 695.995 974.388C718.214 947.06 739.542 918.841 762.136 889.919L762.139 889.92ZM278.159 296.16C288.144 299.066 298.315 301.129 308.628 302.301C322.55 302.301 336.331 299.91 350.159 298.457C379.784 295.082 411.847 297.754 438.706 287.066C485.394 267.238 530.487 243.894 573.606 217.222C581.059 212.769 580.684 193.222 580.825 179.91C580.825 175.832 571.216 170.676 565.122 167.91C542.669 157.691 520.356 163.832 497.903 169.222H497.856C413.856 189.238 337.496 233.347 278.146 296.162L278.159 296.16ZM921.609 296.16C858.562 228.988 775.919 183.38 685.449 165.94C668.48 164.018 651.277 164.815 634.543 168.237C628.778 169.081 619.168 176.018 619.168 180.237C619.168 193.081 619.168 213.003 626.621 217.456C670.168 243.144 715.918 265.456 761.011 288.518L761.058 288.471C764.293 289.737 767.761 290.393 771.23 290.534C811.308 294.612 851.386 299.065 891.23 302.534C901.589 301.596 911.808 299.299 921.605 295.69L921.609 296.16ZM173.899 488.16C149.899 554.769 153.133 655.22 178.118 737.02L178.071 737.067C185.712 762.192 201.18 784.223 222.227 799.926C246.227 787.926 246.227 787.926 245.618 762.988C243.837 720.004 242.384 677.394 239.993 635.168C239.759 626.965 238.071 618.809 235.071 611.168C220.352 576.059 205.071 541.09 189.227 506.308C184.915 499.37 179.758 492.996 173.852 487.324L173.899 488.16ZM978.509 798.94C1037.67 750.237 1065.88 572.72 1025.29 490.41C1020.98 494.254 1015.35 496.879 1013.29 500.957C992.149 557.582 953.29 608.117 957.228 673.267V673.314C958.4 703.267 957.134 733.22 953.384 762.939C951.837 781.314 957.462 792.845 978.462 798.142L978.509 798.94ZM731.989 1022.63C809.567 998.958 878.849 953.771 931.769 892.32C942.363 878.023 950.753 862.273 956.753 845.539C958.394 839.633 956.894 833.305 952.769 828.711C944.613 824.774 932.003 819.711 925.91 823.32C850.91 867.148 776.75 912.009 730.07 989.871C722.617 1002.15 719.992 1010.31 731.992 1022.64L731.989 1022.63ZM473.989 1024.55C473.989 1012.55 477.13 1002.85 473.989 996.614C426.927 915.38 351.229 866.534 272.279 822.144C266.888 819.003 254.513 824.91 247.341 829.597L247.294 829.55C243.497 834.378 242.372 840.753 244.2 846.612C248.841 861.753 255.966 876.05 265.2 888.94C320.419 953.159 392.84 1000.22 473.98 1024.55L473.989 1024.55Z" fill="${COLORS.bgPrimary}"/>
          </svg>
          <div class="about-title">CoachingBoard</div>
          <div class="about-meta">Version 1.0.0-beta</div>
          <div class="about-meta">by Mark Caron</div>
          <div class="about-meta last about-feedback"><a href="https://github.com/markcaron/coach-board/issues/new" target="_blank" rel="noopener" class="about-link">Feedback</a></div>
          <div class="confirm-actions centered">
            <button class="cancel-btn" @click="${() => this._aboutDialog?.close()}">OK</button>
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
          ${p.label ? svg`
            <text x="0" y="${textOff}"
                  text-anchor="middle" dominant-baseline="central"
                  fill="${textColor}" font-size="1.9" font-weight="bold"
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

    return svg`
      <g class="player"
         data-id="${p.id}"
         data-kind="player">
        ${selected ? svg`
          <circle cx="${p.x}" cy="${p.y}" r="${PLAYER_RADIUS + 0.4}"
                   fill="none" stroke="${this.#selColor}" stroke-width="0.2"
                   stroke-dasharray="0.5,0.3" />
        ` : nothing}
        <circle cx="${p.x}" cy="${p.y}" r="${PLAYER_RADIUS}"
                fill="${p.color}" stroke="white" stroke-width="0.15"
                filter="url(#player-shadow)"
                style="cursor: pointer" />
        ${p.label ? svg`
          <text x="${p.x}" y="${p.y}"
                text-anchor="middle" dominant-baseline="central"
                fill="${textColor}" font-size="1.9" font-weight="bold"
                font-family="system-ui, sans-serif"
                style="pointer-events: none">
            ${p.label}
          </text>
        ` : nothing}
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
      const coneColor = eq.color ?? COLORS.coneChartreuse;
      return svg`
        <g data-id="${eq.id}" data-kind="equipment">
          ${selected ? svg`
            <circle cx="${eq.x}" cy="${eq.y}" r="${CONE_RADIUS + CONE_BORDER + 0.15}"
                    fill="none" stroke="${this.#selColor}" stroke-width="0.15"
                    stroke-dasharray="0.4,0.25" />
          ` : nothing}
          <circle cx="${eq.x}" cy="${eq.y}" r="${CONE_RADIUS}"
                  fill="${COLORS.equipmentBody}" stroke="${coneColor}" stroke-width="${CONE_BORDER}"
                  style="cursor: pointer" />
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
        <circle cx="${x}" cy="${y}" r="${CONE_RADIUS}"
                fill="${COLORS.equipmentBody}" fill-opacity="0.5" stroke="${COLORS.coneChartreuse}" stroke-width="${CONE_BORDER}"
                stroke-dasharray="0.3,0.2" opacity="0.5"
                style="pointer-events: none" />
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

  // ── Field orientation ──────────────────────────────────────────

  #toggleFieldMenu() {
    this._fieldMenuOpen = !this._fieldMenuOpen;
  }

  #requestOrientation(orientation: FieldOrientation) {
    this._fieldMenuOpen = false;
    if (orientation === this.fieldOrientation) return;
    const hasItems = this.players.length || this.lines.length || this.equipment.length || this.shapes.length || this.textItems.length;
    if (!hasItems) {
      this.#applyOrientation(orientation, false);
    } else {
      this._pendingOrientation = orientation;
      requestAnimationFrame(() => this._orientationDialog?.showModal());
    }
  }

  #cancelOrientationChange() {
    this._pendingOrientation = null;
    this._orientationDialog?.close();
  }

  #applyOrientationKeep() {
    if (!this._pendingOrientation) return;
    this.#applyOrientation(this._pendingOrientation, true);
    this._pendingOrientation = null;
    this._orientationDialog?.close();
  }

  #applyOrientationClear() {
    if (!this._pendingOrientation) return;
    this.#pushUndo();
    this.players = [];
    this.lines = [];
    this.equipment = [];
    this.shapes = [];
    this.textItems = [];
    this.selectedIds = new Set();
    this.fieldOrientation = this._pendingOrientation;
    this._pendingOrientation = null;
    this._orientationDialog?.close();
    this.#saveOrientationToStorage();
  }

  #requestClearAll() {
    const hasItems = this.players.length || this.lines.length || this.equipment.length || this.shapes.length || this.textItems.length;
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

  #applyOrientation(orientation: FieldOrientation, remap: boolean) {
    this.#pushUndo();
    if (remap) {
      const oldDim = getFieldDimensions(this.fieldOrientation);
      const toVertical = orientation === 'vertical';

      const rotatePoint = toVertical
        ? (x: number, y: number) => ({ x: y, y: oldDim.w - x })
        : (x: number, y: number) => ({ x: oldDim.h - y, y: x });
      const angleDelta = toVertical ? -90 : 90;
      const rotateAngle = (a?: number) => a != null ? a + angleDelta : undefined;

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
    }
    this.selectedIds = new Set();
    this.fieldOrientation = orientation;
    this.#saveOrientationToStorage();
  }

  #saveOrientationToStorage() {
    try {
      localStorage.setItem('coach-board-orientation', this.fieldOrientation);
    } catch { /* ignore */ }
  }

  #loadOrientationFromStorage(): FieldOrientation | null {
    try {
      const v = localStorage.getItem('coach-board-orientation');
      if (v === 'horizontal' || v === 'vertical') return v;
    } catch { /* ignore */ }
    return null;
  }

  #saveThemeToStorage() {
    try {
      localStorage.setItem('coach-board-theme', this.fieldTheme);
    } catch { /* ignore */ }
  }

  #loadThemeFromStorage() {
    try {
      const v = localStorage.getItem('coach-board-theme');
      if (v === 'green' || v === 'white') this.fieldTheme = v;
    } catch { /* ignore */ }
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
    if (this.players.length || this.lines.length || this.equipment.length || this.shapes.length || this.textItems.length) {
      this.#pushUndo();
    }
    this.players = [];
    this.lines = [];
    this.equipment = [];
    this.shapes = [];
    this.textItems = [];
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

    // Rotate handle
    if (kind === 'rotate') {
      this.#pushUndo();
      const p = this.players.find(p => p.id === id);
      const eq = this.equipment.find(eq => eq.id === id);
      const sh = this.shapes.find(s => s.id === id);
      const ti = this.textItems.find(t => t.id === id);
      const cx = p ? p.x : eq ? eq.x : sh ? sh.cx : ti!.x;
      const cy = p ? p.y : eq ? eq.y : sh ? sh.cy : ti!.y;
      const origRotation = p ? (p.angle ?? 0) : eq ? (eq.angle ?? 0) : sh ? (sh.angle ?? 0) : (ti!.angle ?? 0);
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
      if (p) { pointOrigins.set(id, { x: p.x, y: p.y }); continue; }
      const eq = this.equipment.find(eq => eq.id === id);
      if (eq) { pointOrigins.set(id, { x: eq.x, y: eq.y }); continue; }
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
      this.players = this.players.map(p => {
        const orig = pointOrigins.get(p.id);
        return orig ? { ...p, x: orig.x + dx, y: orig.y + dy } : p;
      });
      this.equipment = this.equipment.map(eq => {
        const orig = pointOrigins.get(eq.id);
        return orig ? { ...eq, x: orig.x + dx, y: orig.y + dy } : eq;
      });
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
    const sameTeamCount = this.players.filter(p => p.team === team).length;
    const newPlayer: Player = {
      id: uid('player'),
      x, y,
      team,
      color,
      label: String(sameTeamCount + 1),
    };
    this.players = [...this.players, newPlayer];
  }

  #addEquipment(x: number, y: number) {
    const newEq: Equipment = {
      id: uid('eq'),
      x, y,
      kind: this.equipmentKind,
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
