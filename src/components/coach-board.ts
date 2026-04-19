import { LitElement, html, svg, css, nothing } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';

import type { Player, Line, Equipment, Shape, TextItem, Tool, LineStyle, EquipmentKind, ShapeKind, ShapeStyle, Team } from '../lib/types.js';
import { getTextColor, SHAPE_STYLES } from '../lib/types.js';
import { renderField, FIELD } from '../lib/field.js';
import { screenToSVG, uid } from '../lib/svg-utils.js';
import { ToolChangedEvent, ClearAllEvent, PlayerUpdateEvent, EquipmentUpdateEvent, LineUpdateEvent, ShapeUpdateEvent, TextUpdateEvent, UndoEvent, RedoEvent, SaveSvgEvent } from './cb-toolbar.js';

import './cb-toolbar.js';

const PLAYER_RADIUS = 1.6;
const TEXT_FONT_SIZE = 2;

function triPoints(cx: number, cy: number, r: number): string {
  const h = r * 1.32;
  return `${cx},${cy - h} ${cx - h * 0.866},${cy + h * 0.5} ${cx + h * 0.866},${cy + h * 0.5}`;
}

const BALL_RADIUS = 1.05;
const CONE_RADIUS = 0.675;
const CONE_BORDER = 0.375;
const GOAL_W = 7.32;
const GOAL_D = 2;
const MINI_GOAL_W = 3.66;
const MINI_GOAL_D = 1;
const GOAL_LINE_W = 0.18;
const CONTROL_HANDLE_R = 0.8;
const ROTATE_HANDLE_R = 0.5;
const HIT_SLOP = 1.2;
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

function isModifier(e: PointerEvent | MouseEvent): boolean {
  return e.shiftKey || e.metaKey || e.ctrlKey;
}

function rad2deg(r: number): number { return r * 180 / Math.PI; }

function isRotatable(item: Player | Equipment): boolean {
  if ('team' in item) return item.team === 'a';
  return item.kind === 'goal' || item.kind === 'mini-goal';
}

function renderRotateHandle(hx: number, hy: number, id: string, cornerAngle: number) {
  return svg`
    <g transform="translate(${hx}, ${hy}) rotate(${cornerAngle})"
       data-kind="rotate" data-id="${id}"
       style="cursor: grab">
      <circle r="${ROTATE_HANDLE_R + 0.2}" fill="transparent" />
      <path d="M -0.35,-0.15 A 0.35,0.35 0 1 1 0.15,-0.35"
            fill="none" stroke="white" stroke-width="0.1" stroke-opacity="0.7" />
      <polygon points="0.15,-0.35 0.3,-0.15 0.0,-0.22" fill="white" fill-opacity="0.7" />
    </g>
  `;
}

@customElement('coach-board')
export class CoachBoard extends LitElement {
  static styles = css`
    :host {
      display: block;
      --color-blue: #4ea8de;
      --color-red: #d43d55;
      --color-yellow: #f0c040;
      --color-purple: #7b2d8e;
      --color-light-gray: #adb5bd;
      --color-dark-gray: #495057;
      --cone-chartreuse: #7fff00;
      --cone-neon-orange: #ff6b1a;
      --cone-bright-pink: #ff3ea5;
      --cone-bright-blue: #00bfff;
      --line-white: #ffffff;
      --line-blue: #83c2e8;
      --line-red: #e17788;
      --line-yellow: #f5d379;
      --line-purple: #a36cb0;
      --line-gray: #808589;
      --field-stripe-light: #2d6a4f;
      --field-stripe-dark: #276749;
    }

    .board-container {
      display: flex;
      flex-direction: column;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }

    svg {
      display: block;
      width: 100%;
      height: auto;
      cursor: default;
      border-radius: 0 0 10px 10px;
      user-select: none;
    }

    svg.tool-add-player,
    svg.tool-add-equipment,
    svg.tool-add-text {
      cursor: none;
    }

    svg.tool-draw-line,
    svg.tool-draw-shape {
      cursor: crosshair;
    }

    .svg-wrap {
      position: relative;
    }
  `;

  @state() accessor activeTool: Tool = 'select';
  @state() accessor players: Player[] = [];
  @state() accessor lines: Line[] = [];
  @state() accessor equipment: Equipment[] = [];
  @state() accessor selectedIds: Set<string> = new Set();
  @state() accessor playerColor: string = '#4ea8de';
  @state() accessor playerTeam: Team = 'a';
  @state() accessor lineStyle: LineStyle = 'solid';
  @state() accessor equipmentKind: EquipmentKind = 'ball';
  @state() accessor shapeKind: ShapeKind = 'rect';
  @state() accessor shapes: Shape[] = [];
  @state() accessor textItems: TextItem[] = [];
  @state() accessor ghost: GhostCursor | null = null;

  @query('svg') accessor svgEl!: SVGSVGElement;

  #groupDrag: GroupDragState | null = null;
  #handleDrag: HandleDragState | null = null;
  #rotateDrag: RotateDragState | null = null;
  #shapeResizeDrag: ShapeResizeDragState | null = null;
  #draw: DrawState | null = null;
  #shapeDraw: ShapeDrawState | null = null;
  #boundKeyDown = this.#onKeyDown.bind(this);
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
    const svgClone = this.svgEl.cloneNode(true) as SVGSVGElement;
    svgClone.querySelectorAll('[data-kind="rotate"]').forEach(el => el.remove());
    svgClone.querySelectorAll('[stroke-dasharray="0.5,0.3"], [stroke-dasharray="0.4,0.25"]').forEach(el => el.remove());
    svgClone.querySelectorAll('[data-kind="line-start"], [data-kind="line-end"], [data-kind="line-control"]').forEach(el => el.remove());
    svgClone.querySelectorAll('[stroke="#ffd166"]').forEach(el => el.remove());
    svgClone.querySelectorAll('[stroke="transparent"]').forEach(el => el.remove());

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgClone);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coach-board.svg';
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
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.#boundKeyDown);
  }

  render() {
    const vbX = -PADDING;
    const vbY = -PADDING;
    const vbW = FIELD.LENGTH + PADDING * 2;
    const vbH = FIELD.WIDTH + PADDING * 2;

    return html`
      <div class="board-container">
        <cb-toolbar
          .activeTool="${this.activeTool}"
          .selectedItems="${this.#selectedItems}"
          .canUndo="${this.#undoStack.length > 0}"
          .canRedo="${this.#redoStack.length > 0}"
          @tool-changed="${this.#onToolChanged}"
          @clear-all="${this.#onClearAll}"
          @player-update="${this.#onPlayerUpdate}"
          @equipment-update="${this.#onEquipmentUpdate}"
          @line-update="${this.#onLineUpdate}"
          @shape-update="${this.#onShapeUpdate}"
          @text-update="${this.#onTextUpdate}"
          @undo="${this.#undo}"
          @redo="${this.#redo}"
          @save-svg="${this.#saveSvg}">
        </cb-toolbar>

        <div class="svg-wrap">
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
                width="${FIELD.LENGTH + PADDING * 2}"
                height="${FIELD.WIDTH + PADDING * 2}"
                fill="#1a1a2e" />

          <rect x="0" y="0"
                width="${FIELD.LENGTH}" height="${FIELD.WIDTH}"
                fill="url(#grass-stripes)" rx="0.5" />

          ${renderField()}

          <g class="shapes-layer">
            ${this.shapes.map(s => this.#renderShape(s))}
            ${this.#shapeDraw ? this.#renderShapeDrawPreview() : nothing}
          </g>

          <g class="lines-layer">
            ${this.lines.map(l => this.#renderLine(l))}
            ${this.#draw ? this.#renderDrawPreview() : nothing}
          </g>

          <g class="players-layer">
            ${this.players.map(p => this.#renderPlayer(p))}
          </g>

          <g class="equipment-layer">
            ${this.equipment.map(eq => this.#renderEquipment(eq))}
          </g>

          <g class="text-layer">
            ${this.textItems.map(t => this.#renderTextItem(t))}
          </g>

          ${this.activeTool === 'add-player' && this.ghost
            ? this.playerTeam === 'a'
              ? svg`
                <polygon points="${triPoints(this.ghost.x, this.ghost.y, PLAYER_RADIUS)}"
                         fill="${this.playerColor}" fill-opacity="0.5"
                         stroke="white" stroke-width="0.15" stroke-linejoin="round"
                         stroke-dasharray="0.4,0.3"
                         style="pointer-events: none" />`
              : svg`
                <circle cx="${this.ghost.x}" cy="${this.ghost.y}" r="${PLAYER_RADIUS}"
                        fill="${this.playerColor}" fill-opacity="0.5"
                        stroke="white" stroke-width="0.15" stroke-dasharray="0.4,0.3"
                        style="pointer-events: none" />`
            : nothing}
          ${this.activeTool === 'add-equipment' && this.ghost
            ? this.#renderGhostEquipment()
            : nothing}
          ${this.activeTool === 'add-text' && this.ghost
            ? svg`
              <text x="${this.ghost.x}" y="${this.ghost.y}"
                    text-anchor="middle" dominant-baseline="central"
                    fill="white" fill-opacity="0.5" font-size="${TEXT_FONT_SIZE}"
                    font-family="system-ui, sans-serif"
                    style="pointer-events: none">
                T
              </text>`
            : nothing}
        </svg>
        </div>
      </div>
    `;
  }

  #renderDefs() {
    return svg`
      <defs>
        <pattern id="grass-stripes" width="10" height="68"
                 patternUnits="userSpaceOnUse">
          <rect width="5" height="68" fill="var(--field-stripe-light, #2d6a4f)" />
          <rect x="5" width="5" height="68" fill="var(--field-stripe-dark, #276749)" />
        </pattern>

        <filter id="player-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0.3" stdDeviation="0.4"
                        flood-color="#000" flood-opacity="0.5" />
        </filter>

        <filter id="text-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0.15" stdDeviation="0.25"
                        flood-color="#000" flood-opacity="0.35" />
        </filter>

        <pattern id="goal-net" width="0.5" height="0.5"
                 patternUnits="userSpaceOnUse">
          <rect width="0.5" height="0.5" fill="#ddd" fill-opacity="0.15" />
          <line x1="0" y1="0" x2="0.5" y2="0.5"
                stroke="white" stroke-width="0.04" opacity="0.3" />
          <line x1="0.5" y1="0" x2="0" y2="0.5"
                stroke="white" stroke-width="0.04" opacity="0.3" />
        </pattern>

        <marker id="arrow-end-white" markerWidth="4" markerHeight="4"
                refX="2" refY="2" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0.3 L 4 2 L 0 3.7 Z" fill="white" />
        </marker>
        <marker id="arrow-end-red" markerWidth="4" markerHeight="4"
                refX="2" refY="2" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0.3 L 4 2 L 0 3.7 Z" fill="#d43d55" />
        </marker>
        <marker id="arrow-end-blue" markerWidth="4" markerHeight="4"
                refX="2" refY="2" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0.3 L 4 2 L 0 3.7 Z" fill="#4ea8de" />
        </marker>
        <marker id="arrow-start-white" markerWidth="4" markerHeight="4"
                refX="2" refY="2" orient="auto" markerUnits="strokeWidth">
          <path d="M 4 0.3 L 0 2 L 4 3.7 Z" fill="white" />
        </marker>
        <marker id="arrow-start-red" markerWidth="4" markerHeight="4"
                refX="2" refY="2" orient="auto" markerUnits="strokeWidth">
          <path d="M 4 0.3 L 0 2 L 4 3.7 Z" fill="#d43d55" />
        </marker>
        <marker id="arrow-start-blue" markerWidth="4" markerHeight="4"
                refX="2" refY="2" orient="auto" markerUnits="strokeWidth">
          <path d="M 4 0.3 L 0 2 L 4 3.7 Z" fill="#4ea8de" />
        </marker>
        ${['#83c2e8', '#e17788', '#f5d379', '#a36cb0', '#808589'].map((c, i) => {
          const name = ['l-blue', 'l-red', 'l-yellow', 'l-purple', 'l-gray'][i];
          return svg`
            <marker id="arrow-end-${name}" markerWidth="4" markerHeight="4"
                    refX="2" refY="2" orient="auto" markerUnits="strokeWidth">
              <path d="M 0 0.3 L 4 2 L 0 3.7 Z" fill="${c}" />
            </marker>
            <marker id="arrow-start-${name}" markerWidth="4" markerHeight="4"
                    refX="2" refY="2" orient="auto" markerUnits="strokeWidth">
              <path d="M 4 0.3 L 0 2 L 4 3.7 Z" fill="${c}" />
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
      const textOff = -PLAYER_RADIUS * 0.15;
      const selR = PLAYER_RADIUS + 0.6;
      return svg`
        <g data-id="${p.id}" data-kind="player"
           transform="translate(${p.x}, ${p.y}) rotate(${angle})">
          ${selected ? svg`
            <polygon points="${triPoints(0, 0, selR)}"
                     fill="none" stroke="white" stroke-width="0.2"
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
                  fill="${textColor}" font-size="1.4" font-weight="bold"
                  font-family="system-ui, sans-serif"
                  transform="rotate(${-angle}, 0, ${textOff})"
                  style="pointer-events: none">
              ${p.label}
            </text>
          ` : nothing}
          ${singleSelected ? this.#renderCircleRotateHandles(p.id, selR + 0.3) : nothing}
        </g>
      `;
    }

    return svg`
      <g class="player"
         data-id="${p.id}"
         data-kind="player">
        ${selected ? svg`
          <circle cx="${p.x}" cy="${p.y}" r="${PLAYER_RADIUS + 0.4}"
                   fill="none" stroke="white" stroke-width="0.2"
                   stroke-dasharray="0.5,0.3" />
        ` : nothing}
        <circle cx="${p.x}" cy="${p.y}" r="${PLAYER_RADIUS}"
                fill="${p.color}" stroke="white" stroke-width="0.15"
                filter="url(#player-shadow)"
                style="cursor: pointer" />
        ${p.label ? svg`
          <text x="${p.x}" y="${p.y}"
                text-anchor="middle" dominant-baseline="central"
                fill="${textColor}" font-size="1.4" font-weight="bold"
                font-family="system-ui, sans-serif"
                style="pointer-events: none">
            ${p.label}
          </text>
        ` : nothing}
      </g>
    `;
  }

  #renderCircleRotateHandles(id: string, r: number) {
    const corners = [
      { x: -r, y: -r, a: 0 },
      { x:  r, y: -r, a: 90 },
      { x:  r, y:  r, a: 180 },
      { x: -r, y:  r, a: 270 },
    ];
    return corners.map(c => renderRotateHandle(c.x, c.y, id, c.a));
  }

  #renderRectRotateHandles(id: string, x1: number, y1: number, x2: number, y2: number) {
    const corners = [
      { x: x1, y: y1, a: 0 },
      { x: x2, y: y1, a: 90 },
      { x: x2, y: y2, a: 180 },
      { x: x1, y: y2, a: 270 },
    ];
    return corners.map(c => renderRotateHandle(c.x, c.y, id, c.a));
  }

  #renderLine(l: Line) {
    const selected = this.selectedIds.has(l.id);
    const singleSelected = selected && this.selectedIds.size === 1;
    const pathD = `M ${l.x1} ${l.y1} Q ${l.cx} ${l.cy} ${l.x2} ${l.y2}`;
    const MARKER_MAP: Record<string, string> = {
      '#d43d55': 'red', '#4ea8de': 'blue',
      '#83c2e8': 'l-blue', '#e17788': 'l-red',
      '#f5d379': 'l-yellow', '#a36cb0': 'l-purple', '#808589': 'l-gray',
    };
    const markerColor = MARKER_MAP[l.color] ?? 'white';

    return svg`
      <g class="line" data-id="${l.id}">
        <path d="${pathD}"
              fill="none" stroke="transparent" stroke-width="${HIT_SLOP * 2}"
              data-id="${l.id}" data-kind="line-body"
              style="cursor: pointer" />

        <path d="${pathD}"
              fill="none" stroke="${l.color}" stroke-width="${selected ? '0.45' : '0.3'}"
              stroke-dasharray="${l.style === 'dashed' ? '1,0.6' : 'none'}"
              marker-start="${l.arrowStart ? `url(#arrow-start-${markerColor})` : ''}"
              marker-end="${l.arrowEnd ? `url(#arrow-end-${markerColor})` : ''}"
              style="pointer-events: none" />

        ${singleSelected ? svg`
          <circle cx="${l.x1}" cy="${l.y1}" r="${CONTROL_HANDLE_R}"
                  fill="white" fill-opacity="0.5" stroke="white" stroke-width="0.1"
                  data-id="${l.id}" data-kind="line-start"
                  style="cursor: grab" />
          <circle cx="${l.x2}" cy="${l.y2}" r="${CONTROL_HANDLE_R}"
                  fill="white" fill-opacity="0.5" stroke="white" stroke-width="0.1"
                  data-id="${l.id}" data-kind="line-end"
                  style="cursor: grab" />
          <circle cx="${l.cx}" cy="${l.cy}" r="${CONTROL_HANDLE_R}"
                  fill="#ffd166" fill-opacity="0.7" stroke="#ffd166" stroke-width="0.1"
                  data-id="${l.id}" data-kind="line-control"
                  style="cursor: grab" />
          <line x1="${l.x1}" y1="${l.y1}" x2="${l.cx}" y2="${l.cy}"
                stroke="#ffd166" stroke-width="0.1" stroke-dasharray="0.4,0.3"
                style="pointer-events: none" />
          <line x1="${l.x2}" y1="${l.y2}" x2="${l.cx}" y2="${l.cy}"
                stroke="#ffd166" stroke-width="0.1" stroke-dasharray="0.4,0.3"
                style="pointer-events: none" />
        ` : nothing}
      </g>
    `;
  }

  #renderDrawPreview() {
    const d = this.#draw!;
    const dashAttr = this.lineStyle === 'dashed' ? '0.8,0.4' : 'none';
    return svg`
      <line x1="${d.x1}" y1="${d.y1}" x2="${d.x2}" y2="${d.y2}"
            stroke="white" stroke-width="0.25" stroke-dasharray="${dashAttr}"
            marker-end="url(#arrow-end-white)"
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
            <circle r="${BALL_RADIUS + 0.4}" fill="none" stroke="white" stroke-width="0.15"
                    stroke-dasharray="0.4,0.25" />
          ` : nothing}
          <circle r="${BALL_RADIUS}" fill="white" stroke="white" stroke-width="0.225"
                  filter="url(#player-shadow)"
                  style="cursor: pointer" />
          <g transform="scale(${s}) translate(-600, -600)" style="pointer-events: none">
            <path fill="#333" d="m1080 600.84c-0.23438 127.31-51 249.28-141.19 339.14s-212.34 140.26-339.66 140.02c-127.31-0.23438-249.28-51-339.14-141.19-89.867-90.191-140.26-212.34-140.02-339.66 0.23438-127.31 51-249.28 141.19-339.14 90.191-89.867 212.34-140.26 339.66-140.02 127.22 0.51562 249.05 51.375 338.86 141.52 89.766 90.094 140.26 212.11 140.29 339.32zm-481.92 153.61c25.781 0 51.609 0.84375 77.297 0 8.3906-0.84375 15.984-5.2031 21-12 25.219-41.578 49.547-83.766 73.078-126.47v-0.046875c3.2344-6.9375 3.2344-14.953 0-21.938-24-42-49.922-84-75.938-124.69h-0.046875c-4.5469-6.2344-11.531-10.219-19.172-11.016-48.703-0.9375-97.5-0.9375-146.29 0-8.3906 0.84375-16.031 5.2031-21 12-26.016 40.688-51.469 82.125-76.453 124.18-3.1875 6.9375-3.1875 14.906 0 21.844 24 42.562 48.422 84.703 73.219 126.47 4.5 6.1875 11.344 10.219 18.938 11.062 25.219 1.3125 50.297 0.60938 75.375 0.60938zm-174.71-426.61c-40.688 3.9375-73.312 6.4688-105.61 10.781-8.5312 1.5-16.125 6.2344-21.234 13.219-24.609 38.625-48 78-71.156 117.7-3.375 6.3281-4.0781 13.734-1.9219 20.531 13.266 32.859 27.469 65.344 42.609 97.453 3.5625 5.7188 9.6562 9.4219 16.406 9.9375 31.922-2.1562 63.703-5.2969 96-9.7031 8.3438-1.5469 15.75-6.2812 20.672-13.219 26.156-41.062 51.422-82.594 75.844-124.69h-0.046875c3.7969-7.4062 4.4062-16.078 1.6875-24-12-28.312-24-56.156-37.781-83.391-4.0781-5.9062-9.375-10.875-15.469-14.625zm352.55 0c-5.5312 3.75-10.266 8.5312-13.922 14.156-13.547 27.375-26.391 55.219-37.922 84-2.6719 7.875-2.2031 16.453 1.3125 24 24 42 49.781 84 75.938 124.55h0.046875c5.5312 7.1719 13.594 11.953 22.547 13.453 30.844 4.4531 62.062 7.4531 93.234 9.375 7.3594-0.75 13.922-4.9219 17.625-11.297 14.625-30.609 28.312-61.781 41.062-93.375 2.6719-7.4062 2.25-15.562-1.0781-22.641-23.062-39.703-46.688-78.938-71.297-117.7v-0.046875c-4.9219-7.0312-12.328-11.906-20.766-13.688-33.094-4.4062-66.703-6.9375-106.78-10.922zm-13.781 562.08c-22.219-30.984-43.828-61.922-66.141-91.688-4.3125-4.125-10.078-6.375-16.078-6.2344-53.297-0.65625-106.83-0.65625-160.69 0-5.9531 0.23438-11.625 2.8125-15.703 7.2188-22.312 30-43.781 60-65.766 91.078 22.547 28.922 43.453 56.625 65.625 84 5.4375 5.7656 12.844 9.2344 20.766 9.7031 50.719 0.79688 101.53 0.79688 152.39 0 7.5-0.51562 14.484-3.9375 19.453-9.6094 22.219-27.328 43.547-55.547 66.141-84.469zm-483.98-593.76c9.9844 2.9062 20.156 4.9688 30.469 6.1406 13.922 0 27.703-2.3906 41.531-3.8438 29.625-3.375 61.688-0.70312 88.547-11.391 46.688-19.828 91.781-43.172 134.9-69.844 7.4531-4.4531 7.0781-24 7.2188-37.312 0-4.0781-9.6094-9.2344-15.703-12-22.453-10.219-44.766-4.0781-67.219 1.3125h-0.046876c-84 20.016-160.36 64.125-219.71 126.94zm643.45 0c-63.047-67.172-145.69-112.78-236.16-130.22-16.969-1.9219-34.172-1.125-50.906 2.2969-5.7656 0.84375-15.375 7.7812-15.375 12 0 12.844 0 32.766 7.4531 37.219 43.547 25.688 89.297 48 134.39 71.062l0.046875-0.046875c3.2344 1.2656 6.7031 1.9219 10.172 2.0625 40.078 4.0781 80.156 8.5312 120 12 10.359-0.9375 20.578-3.2344 30.375-6.8438zm-747.71 192c-24 66.609-20.766 167.06 4.2188 248.86l-0.046876 0.046875c7.6406 25.125 23.109 47.156 44.156 62.859 24-12 24-12 23.391-36.938-1.7812-42.984-3.2344-85.594-5.625-127.82-0.23438-8.2031-1.9219-16.359-4.9219-24-14.719-35.109-30-70.078-45.844-104.86-4.3125-6.9375-9.4688-13.312-15.375-18.984zm804.61 310.78c59.156-48.703 87.375-226.22 46.781-308.53-4.3125 3.8438-9.9375 6.4688-12 10.547-21.141 56.625-60 107.16-56.062 172.31v0.046876c1.1719 29.953-0.09375 59.906-3.8438 89.625-1.5469 18.375 4.0781 29.906 25.078 35.203zm-246.52 223.69c77.578-23.672 146.86-68.859 199.78-130.31 10.594-14.297 18.984-30.047 24.984-46.781 1.6406-5.9062 0.14063-12.234-3.9844-16.828-8.1562-3.9375-20.766-9-26.859-5.3906-75 43.828-149.16 88.688-195.84 166.55-7.4531 12.281-10.078 20.438 1.9219 32.766zm-258 1.9219c0-12 3.1406-21.703 0-27.938-47.062-81.234-122.76-130.08-201.71-174.47-5.3906-3.1406-17.766 2.7656-24.938 7.4531l-0.046874-0.046875c-3.7969 4.8281-4.9219 11.203-3.0938 17.062 4.6406 15.141 11.766 29.438 21 42.328 55.219 64.219 127.64 111.28 208.78 135.61z" />
          </g>
        </g>
      `;
    }
    if (eq.kind === 'cone') {
      const coneColor = eq.color ?? '#7fff00';
      return svg`
        <g data-id="${eq.id}" data-kind="equipment">
          ${selected ? svg`
            <circle cx="${eq.x}" cy="${eq.y}" r="${CONE_RADIUS + CONE_BORDER + 0.15}"
                    fill="none" stroke="white" stroke-width="0.15"
                    stroke-dasharray="0.4,0.25" />
          ` : nothing}
          <circle cx="${eq.x}" cy="${eq.y}" r="${CONE_RADIUS}"
                  fill="#222" stroke="${coneColor}" stroke-width="${CONE_BORDER}"
                  style="cursor: pointer" />
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
                  fill="none" stroke="white" stroke-width="0.15"
                  stroke-dasharray="0.5,0.3" rx="0.2" />
          ` : nothing}
          <rect x="0" y="${-hw}" width="${d}" height="${w}"
                fill="url(#goal-net)" stroke="white" stroke-width="${GOAL_LINE_W}"
                style="cursor: pointer" />
          <line x1="0" y1="${-hw}" x2="0" y2="${-hw - post}"
                stroke="white" stroke-width="${GOAL_LINE_W}" style="pointer-events: none" />
          <line x1="0" y1="${hw}" x2="0" y2="${hw + post}"
                stroke="white" stroke-width="${GOAL_LINE_W}" style="pointer-events: none" />
          ${singleSelected ? this.#renderRectRotateHandles(eq.id, rx1 - 0.3, ry1 - 0.3, rx2 + 0.3, ry2 + 0.3) : nothing}
        </g>
      `;
    }
    return svg`
      <g data-id="${eq.id}" data-kind="equipment">
        ${selected ? svg`
          <circle cx="${eq.x}" cy="${eq.y}" r="${PLAYER_RADIUS + 0.4}"
                  fill="none" stroke="white" stroke-width="0.2"
                  stroke-dasharray="0.5,0.3" />
        ` : nothing}
        <circle cx="${eq.x}" cy="${eq.y}" r="${PLAYER_RADIUS}"
                fill="#151515" stroke="white" stroke-width="0.15"
                filter="url(#player-shadow)"
                style="cursor: pointer" />
        <text x="${eq.x}" y="${eq.y}"
              text-anchor="middle" dominant-baseline="central"
              fill="white" font-size="1.4" font-weight="bold"
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
          <circle r="${BALL_RADIUS}" fill="white" stroke="white" stroke-width="0.225" />
          <g transform="scale(${s}) translate(-600, -600)">
            <path fill="#333" d="m1080 600.84c-0.23438 127.31-51 249.28-141.19 339.14s-212.34 140.26-339.66 140.02c-127.31-0.23438-249.28-51-339.14-141.19-89.867-90.191-140.26-212.34-140.02-339.66 0.23438-127.31 51-249.28 141.19-339.14 90.191-89.867 212.34-140.26 339.66-140.02 127.22 0.51562 249.05 51.375 338.86 141.52 89.766 90.094 140.26 212.11 140.29 339.32zm-481.92 153.61c25.781 0 51.609 0.84375 77.297 0 8.3906-0.84375 15.984-5.2031 21-12 25.219-41.578 49.547-83.766 73.078-126.47v-0.046875c3.2344-6.9375 3.2344-14.953 0-21.938-24-42-49.922-84-75.938-124.69h-0.046875c-4.5469-6.2344-11.531-10.219-19.172-11.016-48.703-0.9375-97.5-0.9375-146.29 0-8.3906 0.84375-16.031 5.2031-21 12-26.016 40.688-51.469 82.125-76.453 124.18-3.1875 6.9375-3.1875 14.906 0 21.844 24 42.562 48.422 84.703 73.219 126.47 4.5 6.1875 11.344 10.219 18.938 11.062 25.219 1.3125 50.297 0.60938 75.375 0.60938zm-174.71-426.61c-40.688 3.9375-73.312 6.4688-105.61 10.781-8.5312 1.5-16.125 6.2344-21.234 13.219-24.609 38.625-48 78-71.156 117.7-3.375 6.3281-4.0781 13.734-1.9219 20.531 13.266 32.859 27.469 65.344 42.609 97.453 3.5625 5.7188 9.6562 9.4219 16.406 9.9375 31.922-2.1562 63.703-5.2969 96-9.7031 8.3438-1.5469 15.75-6.2812 20.672-13.219 26.156-41.062 51.422-82.594 75.844-124.69h-0.046875c3.7969-7.4062 4.4062-16.078 1.6875-24-12-28.312-24-56.156-37.781-83.391-4.0781-5.9062-9.375-10.875-15.469-14.625zm352.55 0c-5.5312 3.75-10.266 8.5312-13.922 14.156-13.547 27.375-26.391 55.219-37.922 84-2.6719 7.875-2.2031 16.453 1.3125 24 24 42 49.781 84 75.938 124.55h0.046875c5.5312 7.1719 13.594 11.953 22.547 13.453 30.844 4.4531 62.062 7.4531 93.234 9.375 7.3594-0.75 13.922-4.9219 17.625-11.297 14.625-30.609 28.312-61.781 41.062-93.375 2.6719-7.4062 2.25-15.562-1.0781-22.641-23.062-39.703-46.688-78.938-71.297-117.7v-0.046875c-4.9219-7.0312-12.328-11.906-20.766-13.688-33.094-4.4062-66.703-6.9375-106.78-10.922zm-13.781 562.08c-22.219-30.984-43.828-61.922-66.141-91.688-4.3125-4.125-10.078-6.375-16.078-6.2344-53.297-0.65625-106.83-0.65625-160.69 0-5.9531 0.23438-11.625 2.8125-15.703 7.2188-22.312 30-43.781 60-65.766 91.078 22.547 28.922 43.453 56.625 65.625 84 5.4375 5.7656 12.844 9.2344 20.766 9.7031 50.719 0.79688 101.53 0.79688 152.39 0 7.5-0.51562 14.484-3.9375 19.453-9.6094 22.219-27.328 43.547-55.547 66.141-84.469zm-483.98-593.76c9.9844 2.9062 20.156 4.9688 30.469 6.1406 13.922 0 27.703-2.3906 41.531-3.8438 29.625-3.375 61.688-0.70312 88.547-11.391 46.688-19.828 91.781-43.172 134.9-69.844 7.4531-4.4531 7.0781-24 7.2188-37.312 0-4.0781-9.6094-9.2344-15.703-12-22.453-10.219-44.766-4.0781-67.219 1.3125h-0.046876c-84 20.016-160.36 64.125-219.71 126.94zm643.45 0c-63.047-67.172-145.69-112.78-236.16-130.22-16.969-1.9219-34.172-1.125-50.906 2.2969-5.7656 0.84375-15.375 7.7812-15.375 12 0 12.844 0 32.766 7.4531 37.219 43.547 25.688 89.297 48 134.39 71.062l0.046875-0.046875c3.2344 1.2656 6.7031 1.9219 10.172 2.0625 40.078 4.0781 80.156 8.5312 120 12 10.359-0.9375 20.578-3.2344 30.375-6.8438zm-747.71 192c-24 66.609-20.766 167.06 4.2188 248.86l-0.046876 0.046875c7.6406 25.125 23.109 47.156 44.156 62.859 24-12 24-12 23.391-36.938-1.7812-42.984-3.2344-85.594-5.625-127.82-0.23438-8.2031-1.9219-16.359-4.9219-24-14.719-35.109-30-70.078-45.844-104.86-4.3125-6.9375-9.4688-13.312-15.375-18.984zm804.61 310.78c59.156-48.703 87.375-226.22 46.781-308.53-4.3125 3.8438-9.9375 6.4688-12 10.547-21.141 56.625-60 107.16-56.062 172.31v0.046876c1.1719 29.953-0.09375 59.906-3.8438 89.625-1.5469 18.375 4.0781 29.906 25.078 35.203zm-246.52 223.69c77.578-23.672 146.86-68.859 199.78-130.31 10.594-14.297 18.984-30.047 24.984-46.781 1.6406-5.9062 0.14063-12.234-3.9844-16.828-8.1562-3.9375-20.766-9-26.859-5.3906-75 43.828-149.16 88.688-195.84 166.55-7.4531 12.281-10.078 20.438 1.9219 32.766zm-258 1.9219c0-12 3.1406-21.703 0-27.938-47.062-81.234-122.76-130.08-201.71-174.47-5.3906-3.1406-17.766 2.7656-24.938 7.4531l-0.046874-0.046875c-3.7969 4.8281-4.9219 11.203-3.0938 17.062 4.6406 15.141 11.766 29.438 21 42.328 55.219 64.219 127.64 111.28 208.78 135.61z" />
          </g>
        </g>
      `;
    }
    if (this.equipmentKind === 'cone') {
      return svg`
        <circle cx="${x}" cy="${y}" r="${CONE_RADIUS}"
                fill="#222" fill-opacity="0.5" stroke="#7fff00" stroke-width="${CONE_BORDER}"
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
                fill="url(#goal-net)" stroke="white" stroke-width="${GOAL_LINE_W}" />
          <line x1="0" y1="${-hw}" x2="0" y2="${-hw - post}"
                stroke="white" stroke-width="${GOAL_LINE_W}" />
          <line x1="0" y1="${hw}" x2="0" y2="${hw + post}"
                stroke="white" stroke-width="${GOAL_LINE_W}" />
        </g>
      `;
    }
    return svg`
      <g opacity="0.5" style="pointer-events: none">
        <circle cx="${x}" cy="${y}" r="${PLAYER_RADIUS}"
                fill="#151515" stroke="white" stroke-width="0.15"
                stroke-dasharray="0.4,0.3" />
        <text x="${x}" y="${y}"
              text-anchor="middle" dominant-baseline="central"
              fill="white" font-size="1.4" font-weight="bold"
              font-family="system-ui, sans-serif">C</text>
      </g>
    `;
  }

  #getShapeVisuals(style: ShapeStyle) {
    const def = SHAPE_STYLES.find(s => s.value === style) ?? SHAPE_STYLES[0];
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
                fill="none" stroke="white" stroke-width="0.12"
                stroke-dasharray="0.5,0.3" rx="0.2" />
        ` : nothing}
        ${singleSelected ? svg`
          ${this.#renderShapeHandles(s)}
          ${this.#renderRectRotateHandles(s.id,
              -s.hw - pad - 0.5, -s.hh - pad - 0.5,
               s.hw + pad + 0.5,  s.hh + pad + 0.5)}
        ` : nothing}
      </g>
    `;
  }

  #renderShapeHandles(s: Shape) {
    const hr = 0.35;
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
        <rect x="${c.x - hr}" y="${c.y - hr}" width="${hr * 2}" height="${hr * 2}"
              fill="white" fill-opacity="0.7" stroke="white" stroke-width="0.08"
              data-id="${s.id}" data-kind="shape-corner" data-handle="${c.h}"
              style="cursor: nwse-resize" />
      `)}
      ${sides.map(c => svg`
        <rect x="${c.x - hr * 0.7}" y="${c.y - hr * 0.7}" width="${hr * 1.4}" height="${hr * 1.4}"
              fill="#4ea8de" fill-opacity="0.7" stroke="white" stroke-width="0.08"
              data-id="${s.id}" data-kind="shape-side" data-handle="${c.h}"
              style="cursor: ${c.h === 'n' || c.h === 's' ? 'ns-resize' : 'ew-resize'}" />
      `)}
    `;
  }

  #renderShapeDrawPreview() {
    const d = this.#shapeDraw!;
    let hw = Math.abs(d.curX - d.startX) / 2;
    let hh = Math.abs(d.curY - d.startY) / 2;
    const cx = (d.startX + d.curX) / 2;
    const cy = (d.startY + d.curY) / 2;
    return svg`
      <g transform="translate(${cx}, ${cy})" style="pointer-events: none">
        ${d.kind === 'rect'
          ? svg`<rect x="${-hw}" y="${-hh}" width="${hw * 2}" height="${hh * 2}"
                      fill="none" stroke="white" stroke-width="0.15"
                      stroke-dasharray="0.5,0.3" />`
          : svg`<ellipse rx="${hw}" ry="${hh}"
                         fill="none" stroke="white" stroke-width="0.15"
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
                fill="none" stroke="white" stroke-width="0.12"
                stroke-dasharray="0.5,0.3" rx="0.2" />
        ` : nothing}
        <text x="0" y="0"
              text-anchor="middle" dominant-baseline="central"
              fill="white" font-size="${fs}"
              font-family="system-ui, sans-serif"
              filter="url(#text-shadow)"
              style="pointer-events: none">
          ${t.text}
        </text>
        ${singleSelected ? this.#renderRectRotateHandles(t.id,
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

  #onShapeUpdate(e: ShapeUpdateEvent) {
    this.#pushUndo();
    const idSet = new Set(e.shapeIds);
    this.shapes = this.shapes.map(s =>
      idSet.has(s.id) ? { ...s, ...e.changes } : s
    );
  }

  // ── Event handlers ──────────────────────────────────────────────

  #onToolChanged(e: ToolChangedEvent) {
    this.activeTool = e.tool;
    this.selectedIds = new Set();
    this.ghost = null;

    if (e.playerColor) this.playerColor = e.playerColor;
    if (e.playerTeam) this.playerTeam = e.playerTeam;
    if (e.lineStyle) this.lineStyle = e.lineStyle;
    if (e.equipmentKind) this.equipmentKind = e.equipmentKind;
    if (e.shapeKind) this.shapeKind = e.shapeKind;
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

    const hit = resolveHit(e.target);
    if (!hit) {
      this.selectedIds = new Set();
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

    // Multi-select with modifier keys
    const mod = isModifier(e);
    if (mod) {
      const next = new Set(this.selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      this.selectedIds = next;
    } else if (!this.selectedIds.has(id)) {
      this.selectedIds = new Set([id]);
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
          color: 'white',
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
