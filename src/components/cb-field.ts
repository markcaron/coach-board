import { LitElement, html, svg, css, nothing } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';

import type { Player, Line, Equipment, Shape, TextItem, Tool, LineStyle, EquipmentKind, ShapeKind, ShapeStyle, Team, FieldTheme, PitchType, AnimationFrame } from '../lib/types.js';
import { COLORS, getTextColor, SHAPE_STYLES, getShapeStyles, getLineColors } from '../lib/types.js';
import { renderField, renderVerticalField, renderHalfField, renderVerticalHalfField, renderHalfFieldAttacking, renderVerticalHalfFieldAttacking, getFieldDimensions } from '../lib/field.js';
import type { FieldOrientation } from '../lib/field.js';
import { screenToSVG as _screenToSVG } from '../lib/svg-utils.js';
import { getItemPosition, getItemAngle, getItemPositionAtFrame, getItemAngleAtFrame } from '../lib/animation-utils.js';

// ── Shared types exported for coach-board.ts ─────────────────────

export interface GhostCursor { x: number; y: number; }

export interface DrawState { x1: number; y1: number; x2: number; y2: number; }

export interface ShapeDrawState {
  kind: ShapeKind;
  startX: number; startY: number;
  curX: number; curY: number;
}

// ── Module-level constants ────────────────────────────────────────

const PLAYER_RADIUS = 2.16;
const TEXT_FONT_SIZE = 2;
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
const SILVER_CENTER = '#d0d0d0';
const GOAL_W = 7.32;
const GOAL_D = 2;
const MINI_GOAL_W = 3.66;
const MINI_GOAL_D = 1.5;
const POPUP_GOAL_W = 3;
const POPUP_GOAL_D = 1.5;
const POPUP_GOAL_COLOR = COLORS.popupGoal;
const GOAL_LINE_W = 0.18;
const CONTROL_HANDLE_R = 1.6;
const HIT_SLOP = 1.8;
const HIT_SLOP_MOBILE = 3.0;
const PADDING = 4;

const DIAMOND_HH = PLAYER_RADIUS * 1.1;
const DIAMOND_HW = PLAYER_RADIUS * 1.1;

const WHITE_THEME = {
  fieldBg: COLORS.fieldBgWhite,
  fieldArea: COLORS.fieldAreaWhite,
  fieldLine: COLORS.fieldLineWhite,
  fieldNet: COLORS.fieldNetWhite,
  text: COLORS.fieldTextWhite,
  selection: COLORS.fieldSelWhite,
} as const;

// ── Module-level helpers ──────────────────────────────────────────

function triPoints(cx: number, cy: number, r: number): string {
  const h = r * 1.32;
  return `${cx},${cy - h} ${cx - h * 0.866},${cy + h * 0.5} ${cx + h * 0.866},${cy + h * 0.5}`;
}

function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function lightenHex(hex: string, amount = 0.55): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `#${Math.round(r + (255 - r) * amount).toString(16).padStart(2, '0')}${Math.round(g + (255 - g) * amount).toString(16).padStart(2, '0')}${Math.round(b + (255 - b) * amount).toString(16).padStart(2, '0')}`;
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

function diamondHeadPath(): string {
  const cutFrac = 0.25;
  const cutY = -DIAMOND_HH + DIAMOND_HH * 2 * cutFrac;
  const cutHW = DIAMOND_HW * (cutY + DIAMOND_HH) / DIAMOND_HH;
  return `M 0,${-DIAMOND_HH} L ${-cutHW},${cutY} L ${cutHW},${cutY} Z`;
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
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
  return d;
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

// ── Component ─────────────────────────────────────────────────────

@customElement('cb-field')
export class CbField extends LitElement {
  static styles = css`
    :host {
      display: contents;
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

    .svg-wrap > svg.tool-add-player,
    .svg-wrap > svg.tool-add-equipment,
    .svg-wrap > svg.tool-add-text {
      cursor: none;
    }

    .svg-wrap > svg.tool-draw-line,
    .svg-wrap > svg.tool-draw-shape {
      cursor: crosshair;
    }

    @media print {
      .field-area {
        flex: none !important;
      }
      .svg-wrap.vertical {
        max-width: 50% !important;
      }
      :host(.print-white-bg) .field-area {
        background: white !important;
      }
      :host(.print-white-bg) #grass-stripes rect {
        fill: white !important;
      }
    }
  `;

  // ── Board data (canonical, passed from coach-board) ─────────────
  @property({ attribute: false }) accessor players: Player[] = [];
  @property({ attribute: false }) accessor lines: Line[] = [];
  @property({ attribute: false }) accessor equipment: Equipment[] = [];
  @property({ attribute: false }) accessor shapes: Shape[] = [];
  @property({ attribute: false }) accessor textItems: TextItem[] = [];
  @property({ attribute: false }) accessor selectedIds: Set<string> = new Set();
  @property({ attribute: false }) accessor ghost: GhostCursor | null = null;
  @property({ attribute: false }) accessor draw: DrawState | null = null;
  @property({ attribute: false }) accessor shapeDraw: ShapeDrawState | null = null;
  @property({ attribute: false }) accessor marquee: { x1: number; y1: number; x2: number; y2: number } | null = null;

  // ── Tool/editing settings ───────────────────────────────────────
  @property() accessor activeTool: Tool = 'select';
  @property() accessor playerColor: string = COLORS.playerBlue;
  @property() accessor playerTeam: Team = 'a';
  @property() accessor lineStyle: LineStyle = 'solid';
  @property() accessor equipmentKind: EquipmentKind = 'ball';
  @property() accessor shapeKind: ShapeKind = 'rect';

  // ── Field config ────────────────────────────────────────────────
  @property() accessor fieldOrientation: FieldOrientation = 'horizontal';
  @property() accessor fieldTheme: FieldTheme = 'green';
  @property() accessor pitchType: PitchType = 'full';
  @property() accessor viewMode: 'normal' | 'readonly' | 'shared-edit' = 'normal';
  @property({ type: Boolean }) accessor isMobile: boolean = false;
  @property({ attribute: false }) accessor rotateHandleId: string | null = null;

  // ── Animation ───────────────────────────────────────────────────
  @property({ type: Boolean }) accessor animationMode: boolean = false;
  @property({ attribute: false }) accessor animationFrames: AnimationFrame[] = [];
  @property({ type: Number }) accessor activeFrameIndex: number = 0;
  @property({ type: Boolean }) accessor isPlaying: boolean = false;
  @property({ type: Number }) accessor playbackProgress: number = 0;

  // ── Readonly play overlay ───────────────────────────────────────
  @property({ type: Boolean }) accessor showPlayOverlay: boolean = true;
  @property({ type: Boolean }) accessor pauseFlash: boolean = false;
  @property() accessor playBtnAnim: '' | 'press-out' | 'press-in' = '';

  @query('svg') private accessor _svgEl!: SVGSVGElement;

  // Set of item IDs that have at least one position entry across all frames.
  // Items absent from this set never animate — we can return the original
  // object reference immediately, skipping all computation and allocation.
  #animatedIds: Set<string> = new Set();

  willUpdate(changed: Map<string, unknown>) {
    if (changed.has('animationFrames')) {
      this.#animatedIds = new Set(
        this.animationFrames.flatMap(f => Object.keys(f.positions))
      );
    }
  }

  // ── Public methods for coach-board pointer handling ─────────────

  get svgEl(): SVGSVGElement {
    return this._svgEl;
  }

  screenToSVG(clientX: number, clientY: number): { x: number; y: number } {
    return _screenToSVG(this._svgEl, clientX, clientY);
  }

  capturePointer(pointerId: number) {
    this._svgEl?.setPointerCapture(pointerId);
  }

  releasePointer(pointerId: number) {
    this._svgEl?.releasePointerCapture(pointerId);
  }

  // ── Private helpers ─────────────────────────────────────────────

  get #selColor(): string {
    return this.fieldTheme === 'white' ? WHITE_THEME.selection : 'white';
  }

  #shouldShowRotate(id: string, singleSelected: boolean): boolean {
    if (!singleSelected) return false;
    if (this.rotateHandleId === id) return true;
    const p = this.players.find(p => p.id === id);
    if (p) return isRotatable(p);
    const eq = this.equipment.find(eq => eq.id === id);
    if (eq) return isRotatable(eq);
    return this.shapes.some(s => s.id === id) || this.textItems.some(t => t.id === id);
  }

  #getItemPosition(id: string, baseX: number, baseY: number): { x: number; y: number } {
    return getItemPosition(id, baseX, baseY, this.animationFrames, this.activeFrameIndex, this.animationMode);
  }

  #getItemAngle(id: string, baseAngle: number | undefined): number | undefined {
    return getItemAngle(id, baseAngle, this.animationFrames, this.activeFrameIndex, this.animationMode);
  }

  #getItemPositionAtFrame(id: string, baseX: number, baseY: number, frameIndex: number): { x: number; y: number } {
    return getItemPositionAtFrame(id, baseX, baseY, this.animationFrames, frameIndex);
  }

  #getItemAngleAtFrame(id: string, baseAngle: number | undefined, frameIndex: number): number | undefined {
    return getItemAngleAtFrame(id, baseAngle, this.animationFrames, frameIndex);
  }

  #isLineVisible(lineId: string): boolean {
    if (!this.animationMode) return true;
    const line = this.lines.find(l => l.id === lineId);
    if (!line) return false;
    for (let i = 0; i <= this.activeFrameIndex; i++) {
      const frame = this.animationFrames[i];
      if (!frame || i === 0) continue;
      if (frame.visibleLineIds.includes(lineId)) return true;
    }
    const frame0 = this.animationFrames[0];
    if (!frame0) return true;
    const allFrameLineIds = this.animationFrames.slice(1).flatMap(f => f.visibleLineIds);
    if (allFrameLineIds.includes(lineId)) return false;
    return true;
  }

  #isShapeVisible(shapeId: string): boolean {
    if (!this.animationMode || this.activeFrameIndex === 0) return true;
    // Shapes with no frame registration are always visible (backward-compat)
    const allFrameShapeIds = this.animationFrames.slice(1).flatMap(f => f.visibleShapeIds ?? []);
    if (!allFrameShapeIds.includes(shapeId)) return true;
    // Shape is frame-registered: show from the frame it was added on
    for (let i = 1; i <= this.activeFrameIndex; i++) {
      const frame = this.animationFrames[i];
      if (frame?.visibleShapeIds?.includes(shapeId)) return true;
    }
    return false;
  }

  #getFramePlayers(): Player[] {
    if (!this.animationMode) return this.players;
    if (this.isPlaying) return this.#getInterpolatedPlayers();
    return this.players.map(p => {
      if (!this.#animatedIds.has(p.id)) return p;
      const pos = this.#getItemPosition(p.id, p.x, p.y);
      const angle = this.#getItemAngle(p.id, p.angle);
      if (pos.x === p.x && pos.y === p.y && angle === p.angle) return p;
      return { ...p, x: pos.x, y: pos.y, angle };
    });
  }

  #getFrameEquipment(): Equipment[] {
    if (!this.animationMode) return this.equipment;
    if (this.isPlaying) return this.#getInterpolatedEquipment();
    return this.equipment.map(eq => {
      if (!this.#animatedIds.has(eq.id)) return eq;
      const pos = this.#getItemPosition(eq.id, eq.x, eq.y);
      const angle = this.#getItemAngle(eq.id, eq.angle);
      if (pos.x === eq.x && pos.y === eq.y && angle === eq.angle) return eq;
      return { ...eq, x: pos.x, y: pos.y, angle };
    });
  }

  #getInterpolatedPlayers(): Player[] {
    const t = this.playbackProgress;
    const fromIdx = this.activeFrameIndex;
    const toIdx = fromIdx + 1;
    if (toIdx >= this.animationFrames.length) {
      return this.players.map(p => {
        if (!this.#animatedIds.has(p.id)) return p;
        const pos = this.#getItemPositionAtFrame(p.id, p.x, p.y, fromIdx);
        const angle = this.#getItemAngleAtFrame(p.id, p.angle, fromIdx);
        if (pos.x === p.x && pos.y === p.y && angle === p.angle) return p;
        return { ...p, x: pos.x, y: pos.y, angle };
      });
    }
    return this.players.map(p => {
      if (!this.#animatedIds.has(p.id)) return p;
      const from = this.#getItemPositionAtFrame(p.id, p.x, p.y, fromIdx);
      const to = this.#getItemPositionAtFrame(p.id, p.x, p.y, toIdx);
      const fromAngle = this.#getItemAngleAtFrame(p.id, p.angle, fromIdx) ?? 0;
      const toAngle = this.#getItemAngleAtFrame(p.id, p.angle, toIdx) ?? 0;
      const posStatic = from.x === to.x && from.y === to.y;
      const angleStatic = fromAngle === toAngle;
      if (posStatic && angleStatic) {
        return (from.x === p.x && from.y === p.y && fromAngle === (p.angle ?? 0)) ? p
          : { ...p, x: from.x, y: from.y, angle: fromAngle };
      }
      const angleDelta = ((toAngle - fromAngle + 180) % 360 + 360) % 360 - 180;
      const angle = fromAngle + angleDelta * t;
      if (posStatic) return { ...p, x: from.x, y: from.y, angle };
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
    const t = this.playbackProgress;
    const fromIdx = this.activeFrameIndex;
    const toIdx = fromIdx + 1;
    if (toIdx >= this.animationFrames.length) {
      return this.equipment.map(eq => {
        if (!this.#animatedIds.has(eq.id)) return eq;
        const pos = this.#getItemPositionAtFrame(eq.id, eq.x, eq.y, fromIdx);
        const angle = this.#getItemAngleAtFrame(eq.id, eq.angle, fromIdx);
        if (pos.x === eq.x && pos.y === eq.y && angle === eq.angle) return eq;
        return { ...eq, x: pos.x, y: pos.y, angle };
      });
    }
    return this.equipment.map(eq => {
      if (!this.#animatedIds.has(eq.id)) return eq;
      const from = this.#getItemPositionAtFrame(eq.id, eq.x, eq.y, fromIdx);
      const to = this.#getItemPositionAtFrame(eq.id, eq.x, eq.y, toIdx);
      const fromAngle = this.#getItemAngleAtFrame(eq.id, eq.angle, fromIdx) ?? 0;
      const toAngle = this.#getItemAngleAtFrame(eq.id, eq.angle, toIdx) ?? 0;
      const posStatic = from.x === to.x && from.y === to.y;
      const angleStatic = fromAngle === toAngle;
      if (posStatic && angleStatic) {
        return (from.x === eq.x && from.y === eq.y && fromAngle === (eq.angle ?? 0)) ? eq
          : { ...eq, x: from.x, y: from.y, angle: fromAngle };
      }
      const angleDelta = ((toAngle - fromAngle + 180) % 360 + 360) % 360 - 180;
      const angle = fromAngle + angleDelta * t;
      if (posStatic) return { ...eq, x: from.x, y: from.y, angle };
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

  // ── SVG render helpers ────────────────────────────────────────────

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
                  style="pointer-events: none">${p.label}</text>
          ` : nothing}
          ${this.#shouldShowRotate(p.id, singleSelected) ? this.#renderCircleRotateHandles(p.id, PLAYER_RADIUS) : nothing}
        </g>
      `;
    }

    if (p.team === 'neutral') {
      return svg`
        <g data-id="${p.id}" data-kind="player"
           transform="translate(${p.x}, ${p.y}) rotate(${angle})">
          ${selected ? svg`
            <polygon points="0,${-DIAMOND_HH - 0.5} ${DIAMOND_HW + 0.5},0 0,${DIAMOND_HH + 0.5} ${-DIAMOND_HW - 0.5},0"
                     fill="none" stroke="${this.#selColor}" stroke-width="0.2"
                     stroke-linejoin="round" stroke-dasharray="0.5,0.3" />
          ` : nothing}
          <polygon points="0,${-DIAMOND_HH} ${DIAMOND_HW},0 0,${DIAMOND_HH} ${-DIAMOND_HW},0"
                   fill="${p.color}" stroke="white" stroke-width="0.15"
                   stroke-linejoin="round"
                   filter="url(#player-shadow)"
                   style="cursor: pointer" />
          <path d="${diamondHeadPath()}"
                fill="rgba(0,0,0,0.35)" style="pointer-events: none" />
          ${p.label ? svg`
            <text x="0" y="0.3"
                  text-anchor="middle" dominant-baseline="central"
                  fill="${textColor}" font-size="${(p.label?.length ?? 0) > 2 ? '1.4' : '1.9'}" font-weight="bold"
                  font-family="system-ui, sans-serif"
                  style="pointer-events: none">${p.label}</text>
          ` : nothing}
        </g>
      `;
    }

    // Team B: circle
    const selR = PLAYER_RADIUS + 0.5;
    return svg`
      <g data-id="${p.id}" data-kind="player"
         transform="translate(${p.x}, ${p.y}) rotate(${angle})">
        ${selected ? svg`
          <circle r="${selR}"
                  fill="none" stroke="${this.#selColor}" stroke-width="0.2"
                  stroke-dasharray="0.5,0.3" />
        ` : nothing}
        <circle r="${PLAYER_RADIUS}"
                fill="${p.color}" stroke="white" stroke-width="0.15"
                filter="url(#player-shadow)"
                style="cursor: pointer" />
        <path d="${circleHeadPath(PLAYER_RADIUS)}"
              fill="rgba(0,0,0,0.35)" style="pointer-events: none" />
        ${p.label ? svg`
          <text x="0" y="0.15"
                text-anchor="middle" dominant-baseline="central"
                fill="${textColor}" font-size="${(p.label?.length ?? 0) > 2 ? '1.4' : '1.9'}" font-weight="bold"
                font-family="system-ui, sans-serif"
                style="pointer-events: none">${p.label}</text>
        ` : nothing}
        ${this.#shouldShowRotate(p.id, singleSelected) ? this.#renderCircleRotateHandles(p.id, PLAYER_RADIUS) : nothing}
      </g>
    `;
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

    const curveD = `M ${l.x1},${l.y1} Q ${l.cx},${l.cy} ${l.x2},${l.y2}`;
    const visibleD = l.style === 'wavy'
      ? wavyPath(l.x1, l.y1, l.cx, l.cy, l.x2, l.y2)
      : curveD;
    const markerColor = (l.color === 'white' ? COLORS.lineWhite : l.color).replace('#', '');

    return svg`
      <g class="line" data-id="${l.id}">
        <path d="${curveD}"
              fill="none" stroke="transparent" stroke-width="${(this.isMobile ? HIT_SLOP_MOBILE : HIT_SLOP) * 2}"
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
    const d = this.draw!;
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
                  fill="${SILVER_CENTER}" style="cursor: pointer" />
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
                  fill="none" stroke="${SILVER_CENTER}" stroke-width="0.3"
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
      const coneColor = COLORS.coneNeonOrange;
      return svg`
        <g opacity="0.5" style="pointer-events: none">
          <circle cx="${x}" cy="${y}" r="${CONE_OUTER_R}"
                  fill="none" stroke="${coneColor}" stroke-width="${CONE_OUTER_STROKE}" />
          <circle cx="${x}" cy="${y}" r="${CONE_INNER_R}" fill="${SILVER_CENTER}" />
        </g>
      `;
    }
    if (this.equipmentKind === 'dummy') {
      return svg`
        <g transform="translate(${x}, ${y})" opacity="0.5" style="pointer-events: none">
          <rect x="${-DUMMY_OUTER_HW}" y="${-DUMMY_OUTER_HH}"
                width="${DUMMY_OUTER_HW * 2}" height="${DUMMY_OUTER_HH * 2}"
                rx="${DUMMY_OUTER_RX}" fill="none"
                stroke="${COLORS.coneChartreuse}" stroke-width="${DUMMY_OUTER_STROKE}" />
        </g>
      `;
    }
    if (this.equipmentKind === 'pole') {
      return svg`
        <g opacity="0.5" style="pointer-events: none">
          <circle cx="${x}" cy="${y}" r="${POLE_BASE_RADIUS}" fill="none" stroke="${SILVER_CENTER}" stroke-width="0.3" />
          <circle cx="${x}" cy="${y}" r="${POLE_RADIUS}" fill="${COLORS.coneChartreuse}" />
        </g>
      `;
    }
    if (this.equipmentKind === 'goal' || this.equipmentKind === 'mini-goal') {
      const w = this.equipmentKind === 'goal' ? GOAL_W : MINI_GOAL_W;
      const d = this.equipmentKind === 'goal' ? GOAL_D : MINI_GOAL_D;
      const hw = w / 2;
      return svg`
        <g transform="translate(${x}, ${y})" opacity="0.5" style="pointer-events: none">
          <rect x="0" y="${-hw}" width="${d}" height="${w}"
                fill="url(#goal-net)" stroke="${this.fieldTheme === 'white' ? WHITE_THEME.fieldLine : 'white'}" stroke-width="${GOAL_LINE_W}" />
        </g>
      `;
    }
    if (this.equipmentKind === 'popup-goal') {
      const hw = POPUP_GOAL_W / 2;
      return svg`
        <g transform="translate(${x}, ${y})" opacity="0.5" style="pointer-events: none">
          <path d="M 0,${-hw} A ${hw},${hw} 0 0 1 0,${hw}"
                fill="url(#goal-net)" stroke="${POPUP_GOAL_COLOR}" stroke-width="0.25" />
        </g>
      `;
    }
    // Coach
    return svg`
      <g opacity="0.5" style="pointer-events: none">
        <circle cx="${x}" cy="${y}" r="${PLAYER_RADIUS}"
                fill="${COLORS.coachBg}" stroke="white" stroke-width="0.15" />
        <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central"
              fill="white" font-size="1.9" font-weight="bold"
              font-family="system-ui, sans-serif">C</text>
      </g>
    `;
  }

  #getShapeVisuals(style: ShapeStyle): { fill: string; stroke: string } {
    const visuals = getShapeStyles(this.fieldTheme).find(s => s.value === style);
    return { fill: visuals?.fill ?? 'none', stroke: visuals?.stroke ?? COLORS.shapeStrokeGray };
  }

  #renderShape(s: Shape) {
    const selected = this.selectedIds.has(s.id);
    const singleSelected = selected && this.selectedIds.size === 1;
    const angle = s.angle ?? 0;
    const { fill, stroke } = this.#getShapeVisuals(s.style);
    const pad = 0.5;

    return svg`
      <g data-id="${s.id}" data-kind="shape"
         transform="translate(${s.cx}, ${s.cy}) rotate(${angle})">
        ${selected ? svg`
          <${s.kind === 'rect' ? 'rect' : 'ellipse'}
            ${s.kind === 'rect'
              ? svg`x="${-s.hw - pad}" y="${-s.hh - pad}" width="${(s.hw + pad) * 2}" height="${(s.hh + pad) * 2}"`
              : svg`rx="${s.hw + pad}" ry="${s.hh + pad}"`}
            fill="none" stroke="${this.#selColor}" stroke-width="0.12"
            stroke-dasharray="0.5,0.3" rx="0.2" />
        ` : nothing}
        <${s.kind === 'rect' ? 'rect' : 'ellipse'}
          ${s.kind === 'rect'
            ? svg`x="${-s.hw}" y="${-s.hh}" width="${s.hw * 2}" height="${s.hh * 2}"`
            : svg`rx="${s.hw}" ry="${s.hh}"`}
          fill="${fill}" stroke="${stroke}" stroke-width="0.2"
          style="cursor: pointer" />
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
    const d = this.shapeDraw!;
    const hw = Math.abs(d.curX - d.startX) / 2;
    const hh = Math.abs(d.curY - d.startY) / 2;
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

  #renderGhostsAndTrails() {
    const frame = this.animationFrames[this.activeFrameIndex];
    if (!frame) return nothing;

    const trails: ReturnType<typeof svg>[] = [];

    for (const p of this.players) {
      if (!frame.positions[p.id]) continue;
      const curr = this.#getItemPosition(p.id, p.x, p.y);
      const prev = this.#getItemPositionAtFrame(p.id, p.x, p.y, this.activeFrameIndex - 1);
      if (curr.x === prev.x && curr.y === prev.y) continue;

      const prevAngle = this.#getItemAngleAtFrame(p.id, p.angle, this.activeFrameIndex - 1) ?? 0;

      const trail = frame.trails[p.id];
      const cp1x = trail?.cp1x ?? prev.x + (curr.x - prev.x) / 3;
      const cp1y = trail?.cp1y ?? prev.y + (curr.y - prev.y) / 3;
      const cp2x = trail?.cp2x ?? prev.x + (curr.x - prev.x) * 2 / 3;
      const cp2y = trail?.cp2y ?? prev.y + (curr.y - prev.y) * 2 / 3;

      trails.push(svg`
        <g opacity="0.3">
          ${p.team === 'a'
            ? svg`<g transform="translate(${prev.x}, ${prev.y}) rotate(${prevAngle})" style="pointer-events:none">
                    <polygon points="${triPoints(0, 0, PLAYER_RADIUS)}"
                             fill="${p.color}" stroke="white" stroke-width="0.15"
                             stroke-linejoin="round" />
                  </g>`
            : p.team === 'neutral'
            ? svg`<g transform="translate(${prev.x}, ${prev.y}) rotate(${prevAngle})" style="pointer-events:none">
                    <polygon points="0,${-DIAMOND_HH} ${DIAMOND_HW},0 0,${DIAMOND_HH} ${-DIAMOND_HW},0"
                             fill="${p.color}" stroke="white" stroke-width="0.15"
                             stroke-linejoin="round" />
                  </g>`
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

  // ── Template ──────────────────────────────────────────────────────

  render() {
    const fd = getFieldDimensions(this.fieldOrientation, this.pitchType);
    const vbX = -PADDING;
    const vbY = -PADDING;
    const vbW = fd.w + PADDING * 2;
    const vbH = fd.h + PADDING * 2;

    return html`
      <div class="field-area ${this.fieldTheme === 'white' ? 'theme-white' : ''}">
        <div class="svg-wrap ${this.fieldOrientation === 'vertical' ? 'vertical' : ''}">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="${vbX} ${vbY} ${vbW} ${vbH}"
            preserveAspectRatio="xMidYMid meet"
            class="tool-${this.activeTool}">

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
              ${this.shapes.filter(s => !this.selectedIds.has(s.id) && this.#isShapeVisible(s.id)).map(s => this.#renderShape(s))}
              ${this.shapeDraw ? this.#renderShapeDrawPreview() : nothing}
            </g>

            ${this.marquee ? svg`
              <rect
                x="${Math.min(this.marquee.x1, this.marquee.x2)}"
                y="${Math.min(this.marquee.y1, this.marquee.y2)}"
                width="${Math.abs(this.marquee.x2 - this.marquee.x1)}"
                height="${Math.abs(this.marquee.y2 - this.marquee.y1)}"
                fill="rgba(59, 130, 246, 0.15)"
                stroke="rgba(59, 130, 246, 0.6)"
                stroke-width="0.15"
                stroke-dasharray="0.5,0.3"
                style="pointer-events: none" />
            ` : nothing}

            <g class="lines-layer">
              ${this.lines.filter(l => !this.selectedIds.has(l.id) && this.#isLineVisible(l.id)).map(l => this.#renderLine(l))}
              ${this.draw ? this.#renderDrawPreview() : nothing}
            </g>

            ${this.animationMode && this.activeFrameIndex > 0 && !this.isPlaying && this.viewMode !== 'readonly' ? this.#renderGhostsAndTrails() : nothing}

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
              ${this.shapes.filter(s => this.selectedIds.has(s.id) && this.#isShapeVisible(s.id)).map(s => this.#renderShape(s))}
              ${this.lines.filter(l => this.selectedIds.has(l.id) && this.#isLineVisible(l.id)).map(l => this.#renderLine(l))}
              ${this.#getFramePlayers().filter(p => this.selectedIds.has(p.id)).map(p => this.#renderPlayer(p))}
              ${this.#getFrameEquipment().filter(eq => this.selectedIds.has(eq.id)).map(eq => this.#renderEquipment(eq))}
              ${this.textItems.filter(t => this.selectedIds.has(t.id)).map(t => this.#renderTextItem(t))}
            </g>

            ${this.activeTool === 'add-player' && this.ghost
              ? (() => {
                  const ga = this.playerTeam === 'b'
                    ? (this.fieldOrientation === 'horizontal' ? 270 : 180)
                    : (this.fieldOrientation === 'horizontal' ? 90 : 0);
                  return this.playerTeam === 'a'
                    ? svg`
                      <g transform="translate(${this.ghost.x}, ${this.ghost.y}) rotate(${ga})" style="pointer-events: none">
                        <polygon points="${triPoints(0, 0, PLAYER_RADIUS)}"
                                 fill="${this.playerColor}" fill-opacity="0.5"
                                 stroke="${this.#selColor}" stroke-width="0.15" stroke-linejoin="round"
                                 stroke-dasharray="0.4,0.3" />
                      </g>`
                    : this.playerTeam === 'neutral'
                    ? svg`
                      <g transform="translate(${this.ghost.x}, ${this.ghost.y}) rotate(${ga})" style="pointer-events: none">
                        <polygon points="0,${-DIAMOND_HH} ${DIAMOND_HW},0 0,${DIAMOND_HH} ${-DIAMOND_HW},0"
                                 fill="${this.playerColor}" fill-opacity="0.5"
                                 stroke="${this.#selColor}" stroke-width="0.15" stroke-linejoin="round"
                                 stroke-dasharray="0.4,0.3" />
                      </g>`
                    : svg`
                      <g transform="translate(${this.ghost.x}, ${this.ghost.y}) rotate(${ga})" style="pointer-events: none">
                        <circle cx="0" cy="0" r="${PLAYER_RADIUS}"
                                fill="${this.playerColor}" fill-opacity="0.5"
                                stroke="${this.#selColor}" stroke-width="0.15" stroke-dasharray="0.4,0.3" />
                      </g>`;
                })()
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
        ${this.viewMode === 'readonly' && this.animationFrames.length > 1 ? html`
          <div class="play-overlay" @click="${() => this.dispatchEvent(new CustomEvent('cb-field-play-overlay-click', { bubbles: true, composed: true }))}">
            ${this.showPlayOverlay ? html`
              <div class="play-overlay-btn ${this.playBtnAnim}">
                ${this.pauseFlash ? html`
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
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cb-field': CbField;
  }
}
