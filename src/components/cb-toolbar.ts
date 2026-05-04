import { LitElement, html, svg, css, nothing } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';

import type { Tool, LineStyle, EquipmentKind, Player, Equipment, Line, Shape, TextItem, Team, ShapeKind, ShapeStyle, FieldTheme } from '../lib/types.js';
import { COLORS, PLAYER_COLORS, CONE_COLORS, LINE_COLORS, SHAPE_STYLES, TEXT_SIZES, getPlayerColors, getConeColors, getLineColors, getShapeStyles } from '../lib/types.js';

export class ToolChangedEvent extends Event {
  static readonly eventName = 'tool-changed' as const;
  constructor(
    public tool: Tool,
    public playerColor?: string,
    public playerTeam?: Team,
    public lineStyle?: LineStyle,
    public equipmentKind?: EquipmentKind,
    public shapeKind?: ShapeKind,
  ) {
    super(ToolChangedEvent.eventName, { bubbles: true, composed: true });
  }
}

export class ClearAllEvent extends Event {
  static readonly eventName = 'clear-all' as const;
  constructor() {
    super(ClearAllEvent.eventName, { bubbles: true, composed: true });
  }
}

export class UndoEvent extends Event {
  static readonly eventName = 'undo' as const;
  constructor() { super(UndoEvent.eventName, { bubbles: true, composed: true }); }
}

export class RedoEvent extends Event {
  static readonly eventName = 'redo' as const;
  constructor() { super(RedoEvent.eventName, { bubbles: true, composed: true }); }
}

export class SaveSvgEvent extends Event {
  static readonly eventName = 'save-svg' as const;
  constructor() { super(SaveSvgEvent.eventName, { bubbles: true, composed: true }); }
}

export class PlayerUpdateEvent extends Event {
  static readonly eventName = 'player-update' as const;
  constructor(
    public playerIds: string[],
    public changes: { label?: string; color?: string },
  ) {
    super(PlayerUpdateEvent.eventName, { bubbles: true, composed: true });
  }
}

export class EquipmentUpdateEvent extends Event {
  static readonly eventName = 'equipment-update' as const;
  constructor(
    public equipmentIds: string[],
    public changes: { color?: string },
  ) {
    super(EquipmentUpdateEvent.eventName, { bubbles: true, composed: true });
  }
}

export class LineUpdateEvent extends Event {
  static readonly eventName = 'line-update' as const;
  constructor(
    public lineIds: string[],
    public changes: { style?: LineStyle; arrowStart?: boolean; arrowEnd?: boolean; color?: string },
  ) {
    super(LineUpdateEvent.eventName, { bubbles: true, composed: true });
  }
}

export class ShapeUpdateEvent extends Event {
  static readonly eventName = 'shape-update' as const;
  constructor(
    public shapeIds: string[],
    public changes: { style?: ShapeStyle },
  ) {
    super(ShapeUpdateEvent.eventName, { bubbles: true, composed: true });
  }
}

export class TextUpdateEvent extends Event {
  static readonly eventName = 'text-update' as const;
  constructor(
    public textIds: string[],
    public changes: { text?: string; fontSize?: number },
  ) {
    super(TextUpdateEvent.eventName, { bubbles: true, composed: true });
  }
}

export type AlignAction = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom' | 'distribute-h' | 'distribute-v';

export class AlignItemsEvent extends Event {
  static readonly eventName = 'align-items' as const;
  constructor(public action: AlignAction) {
    super(AlignItemsEvent.eventName, { bubbles: true, composed: true });
  }
}

export class GroupItemsEvent extends Event {
  static readonly eventName = 'group-items' as const;
  constructor() {
    super(GroupItemsEvent.eventName, { bubbles: true, composed: true });
  }
}

export class UngroupItemsEvent extends Event {
  static readonly eventName = 'ungroup-items' as const;
  constructor() {
    super(UngroupItemsEvent.eventName, { bubbles: true, composed: true });
  }
}

export class DeleteItemsEvent extends Event {
  static readonly eventName = 'delete-items' as const;
  constructor() {
    super(DeleteItemsEvent.eventName, { bubbles: true, composed: true });
  }
}

export class MultiSelectToggleEvent extends Event {
  static readonly eventName = 'multi-select-toggle' as const;
  constructor() {
    super(MultiSelectToggleEvent.eventName, { bubbles: true, composed: true });
  }
}

type SelectionType = 'none' | 'single-player' | 'players' | 'single-cone' | 'cones' | 'lines' | 'shapes' | 'single-text' | 'texts' | 'mixed';

type AnyItem = Player | Equipment | Line | Shape | TextItem;

function isPlayer(item: AnyItem): item is Player {
  return 'team' in item;
}

function isEquipment(item: AnyItem): item is Equipment {
  return 'kind' in item && !('hw' in item);
}

function isLine(item: AnyItem): item is Line {
  return 'x1' in item;
}

function isShape(item: AnyItem): item is Shape {
  return 'hw' in item;
}

function isTextItem(item: AnyItem): item is TextItem {
  return 'text' in item;
}

const TEAMS_GREEN: { label: string; color: string; team: Team }[] = [
  { label: 'Team A', color: COLORS.playerBlue, team: 'a' },
  { label: 'Team B', color: COLORS.playerRed, team: 'b' },
];

const TEAMS_WHITE: { label: string; color: string; team: Team }[] = [
  { label: 'Team A', color: COLORS.playerBlueW, team: 'a' },
  { label: 'Team B', color: COLORS.playerRedW, team: 'b' },
];

const LINE_STYLES: { label: string; value: LineStyle }[] = [
  { label: 'Pass / Shot', value: 'solid' },
  { label: 'Run', value: 'dashed' },
  { label: 'Dribble', value: 'wavy' },
];

type MenuId = 'player' | 'line' | 'equipment' | 'color' | 'cone-color' | 'line-color' | 'shape-style' | 'text-size' | 'align' | 'grouping';

@customElement('cb-toolbar')
export class CbToolbar extends LitElement {
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
      padding: 8px 12px;
      background: var(--pt-bg-toolbar);
      user-select: none;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .btn-text {
      white-space: nowrap;
    }

    @media (max-width: 767px) {
      .btn-text,
      .hide-mobile {
        display: none;
      }
    }

    .tools-left {
      display: flex;
      gap: 4px;
      align-items: center;
      flex-wrap: wrap;
    }

    button {
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

    button:hover {
      background: var(--pt-border);
    }

    button:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    button[aria-pressed="true"] {
      background: var(--pt-danger);
      border-color: var(--pt-danger);
      color: var(--pt-text-white);
    }

    .spacer {
      flex: 1;
    }

    button.danger {
      background: transparent;
      color: var(--pt-danger-light);
      border-color: var(--pt-danger-light);
    }

    button.danger:hover {
      background: rgba(248, 113, 113, 0.1);
    }

    .icon {
      font-size: 1rem;
      line-height: 1;
    }

    .dropdown-wrap {
      position: relative;
    }

    [role="menu"] {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      z-index: 10;
      min-width: 100%;
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

    [role="menuitem"],
    [role="menuitemradio"] {
      width: 100%;
      justify-content: flex-start;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 2px;
      gap: 12px;
      outline: none;
    }

    [role="menuitem"]:hover,
    [role="menuitemradio"]:hover,
    [role="menuitem"]:focus-visible,
    [role="menuitemradio"]:focus-visible {
      background: var(--pt-border);
    }

    .color-dot {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 1px solid white;
    }

    .line-preview-wrap {
      display: inline-flex;
      align-items: center;
      width: 32px;
      flex-shrink: 0;
    }

    .line-preview-wrap svg {
      display: block;
      width: 32px;
      height: 12px;
    }

    .caret {
      display: inline-block;
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 5px solid currentColor;
      margin-left: 4px;
      vertical-align: middle;
    }

    .divider {
      width: 1px;
      height: 28px;
      background: rgba(255, 255, 255, 0.15);
      margin: 0 4px;
    }

    .edit-fields {
      border: none;
      margin: 0;
      padding: 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .edit-fields > legend {
      padding: 0;
      margin-right: 6px;
      font-size: 0.85rem;
      color: var(--pt-text);
      white-space: nowrap;
      float: left;
    }

    @media (max-width: 767px) {
      .edit-fields > legend {
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
    }

    .edit-fields label {
      font-size: 0.85rem;
      color: var(--pt-text-muted);
    }

    .number-input {
      width: 44px;
      height: 44px;
      text-align: center;
      font: bold 0.85rem system-ui, sans-serif;
      color: var(--pt-text-white);
      background: var(--pt-bg-surface);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      padding: 0;
    }

    .number-input:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .color-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      padding: 0;
      background: var(--pt-bg-surface);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      cursor: pointer;
    }

    .color-btn[aria-haspopup="menu"] {
      width: auto;
      padding: 0 12px;
      gap: 6px;
    }

    .color-btn:hover {
      border-color: var(--pt-accent);
    }

    .color-swatch {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 1px solid var(--swatch-border, white);
    }

    .color-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
      padding: 6px;
    }

    .color-grid [role="menuitemradio"] {
      width: 44px;
      height: 44px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
    }

    .color-grid .color-swatch {
      width: 20px;
      height: 20px;
    }

    .color-grid [role="menuitemradio"][aria-checked="true"] {
      background: var(--pt-border);
      border-color: var(--pt-text-white);
    }

    .selection-info {
      font-size: 0.85rem;
      color: var(--pt-text-muted);
    }

    .count-badge {
      min-width: 20px;
      height: 20px;
      padding: 0 5px;
      border-radius: 10px;
      background: var(--pt-accent);
      color: var(--pt-text-white);
      font-size: 0.7rem;
      font-weight: bold;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    button.icon-btn {
      padding: 6px 8px;
      min-width: 44px;
      justify-content: center;
    }

    button:disabled {
      opacity: 0.35;
      cursor: default;
      pointer-events: none;
    }

    .edit-bar {
      display: grid;
      grid-template-columns: 1fr auto;
      column-gap: 12px;
      align-items: center;
      grid-column: 1 / -1;
      margin: 8px -12px -8px;
      padding: 8px 12px;
      min-height: 61px;
      box-sizing: border-box;
      background: var(--pt-bg-primary);
      border-top: 1px solid var(--pt-bg-body);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      --swatch-border: white;
    }

    .edit-bar-left {
      display: flex;
      gap: 6px;
      align-items: center;
      min-width: 0;
    }

    .edit-bar-right {
      display: flex;
      gap: 6px;
      align-items: center;
      justify-content: flex-end;
      flex-shrink: 0;
    }

    .edit-bar label {
      color: var(--pt-text);
    }

    .edit-bar .selection-info {
      color: var(--pt-text-muted);
    }

    .edit-bar button:not([role]) {
      background: var(--pt-bg-surface);
      color: var(--pt-text);
      border-color: rgba(255, 255, 255, 0.25);
    }

    .edit-bar button.save-btn {
      background: var(--pt-btn-primary);
      border-color: var(--pt-btn-primary);
      color: var(--pt-text-white);
      font-weight: bold;
    }

    .edit-bar button.save-btn:hover {
      background: var(--pt-btn-primary-hover);
      border-color: var(--pt-btn-primary-hover);
    }

    .edit-bar button:not([role]):hover {
      background: var(--pt-border);
    }

    .edit-bar button:not([role]):focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .edit-bar .number-input {
      color: var(--pt-text-white);
      background: var(--pt-bg-surface);
      border-color: rgba(255, 255, 255, 0.25);
    }

    .edit-bar .number-input:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .edit-bar .divider {
      background: rgba(255, 255, 255, 0.15);
    }

    .edit-bar button.danger {
      background: transparent;
      color: var(--pt-danger-lightest);
      border-color: var(--pt-danger-lightest);
    }

    .edit-bar button.danger:hover {
      background: rgba(251, 138, 138, 0.1);
    }

    .edit-bar-right [role="menu"] {
      left: auto;
      right: 0;
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

    .confirm-actions .cancel-btn {
      border: 1px solid var(--pt-accent);
      color: var(--pt-text-white);
      background: transparent;
    }

    .confirm-actions .cancel-btn:hover {
      background: rgba(78, 168, 222, 0.15);
    }

    .confirm-actions .confirm-danger {
      background: var(--pt-danger);
      border-color: var(--pt-danger);
      color: var(--pt-text-white);
    }

    .confirm-actions .confirm-danger:hover {
      background: var(--pt-danger-hover);
    }

  `;

  @property({ type: String, reflect: true })
  accessor activeTool: Tool = 'select';

  @property({ type: String })
  accessor fieldTheme: FieldTheme = 'green';

  @property({ attribute: false })
  accessor selectedItems: AnyItem[] = [];

  @property({ type: Boolean })
  accessor multiSelect: boolean = false;

  @state() private accessor _openMenu: MenuId | null = null;

  @query('#delete-dialog') accessor _deleteDialog!: HTMLDialogElement;

  get #selectionType(): SelectionType {
    const items = this.selectedItems;
    if (items.length === 0) return 'none';
    if (items.every(i => isPlayer(i))) return items.length === 1 ? 'single-player' : 'players';
    if (items.every(i => isEquipment(i) && (i as Equipment).kind === 'cone')) return items.length === 1 ? 'single-cone' : 'cones';
    if (items.every(i => isLine(i))) return 'lines';
    if (items.every(i => isShape(i))) return 'shapes';
    if (items.every(i => isTextItem(i))) return items.length === 1 ? 'single-text' : 'texts';
    return 'mixed';
  }

  get #singlePlayer(): Player | null {
    const items = this.selectedItems;
    return items.length === 1 && isPlayer(items[0]) ? items[0] as Player : null;
  }

  get #selectedPlayers(): Player[] {
    return this.selectedItems.filter(isPlayer);
  }

  get #selectedCones(): Equipment[] {
    return this.selectedItems.filter(i => isEquipment(i) && (i as Equipment).kind === 'cone') as Equipment[];
  }

  get #selectedLines(): Line[] {
    return this.selectedItems.filter(isLine);
  }

  get #selectedShapes(): Shape[] {
    return this.selectedItems.filter(isShape);
  }

  get #selectedTexts(): TextItem[] {
    return this.selectedItems.filter(isTextItem);
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('pointerdown', this.#onDocClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('pointerdown', this.#onDocClick);
  }

  #openDropdown(menu: MenuId) {
    this._openMenu = menu;
    this.updateComplete.then(() => {
      const firstItem = this.renderRoot.querySelector('[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemradio"]') as HTMLElement | null;
      firstItem?.focus();
    });
  }

  #closeDropdown() {
    const triggerId = this._openMenu;
    this._openMenu = null;
    if (triggerId) {
      this.updateComplete.then(() => {
        const trigger = this.renderRoot.querySelector(`[aria-controls="menu-${triggerId}"]`) as HTMLElement | null;
        trigger?.focus();
      });
    }
  }

  #onTriggerClick(menu: MenuId, e: Event) {
    e.stopPropagation();
    if (this._openMenu === menu) {
      this.#closeDropdown();
    } else {
      this.#openDropdown(menu);
    }
  }

  #onTriggerKeyDown(menu: MenuId, e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'Down') {
      e.preventDefault();
      if (this._openMenu !== menu) {
        this.#openDropdown(menu);
      }
    }
  }

  #onMenuKeyDown(e: KeyboardEvent) {
    const items = Array.from(
      (e.currentTarget as HTMLElement).querySelectorAll('[role="menuitem"], [role="menuitemradio"]')
    ) as HTMLElement[];
    const current = items.indexOf(e.target as HTMLElement);

    switch (e.key) {
      case 'ArrowDown':
      case 'Down':
      case 'ArrowRight':
      case 'Right':
        e.preventDefault();
        items[(current + 1) % items.length]?.focus();
        break;
      case 'ArrowUp':
      case 'Up':
      case 'ArrowLeft':
      case 'Left':
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
        this.#closeDropdown();
        break;
      case 'Tab':
        this._openMenu = null;
        break;
    }
  }

  render() {
    const t = this.activeTool;
    const selType = this.#selectionType;
    return html`
      <div class="tools-left">
      <button
        title="Select"
        aria-pressed="${t === 'select'}"
        aria-label="Select"
        @click="${() => this.#pick('select')}">
        <svg class="icon" viewBox="0 0 1600 1600" width="21" height="21" style="vertical-align: middle"><path fill-rule="evenodd" clip-rule="evenodd" d="M1394.44 730.688C1402.62 733.625 1402.87 745.063 1395.06 748.437L944.634 944.624L748.447 1395.05C745.322 1402.3 733.822 1403.61 730.384 1393.61L364.571 376.733C361.884 369.233 369.134 361.796 376.821 364.608L1394.44 730.688Z" fill="currentColor" /></svg> <span class="btn-text">Select</span>
      </button>

      <button
        title="Multi-select"
        aria-pressed="${this.multiSelect}"
        aria-label="Multi-select"
        @click="${() => this.dispatchEvent(new MultiSelectToggleEvent())}">
        <svg class="icon" viewBox="0 0 1600 1600" width="21" height="21" style="vertical-align: middle">
          <path d="M87.5712 346.734C84.8837 339.234 92.1337 331.796 99.8212 334.608L469.249 467.508L647.075 961.824L471.447 1365.05C468.322 1372.3 456.822 1373.61 453.385 1363.61L87.5712 346.734Z" fill="currentColor"/>
          <path fill-rule="evenodd" clip-rule="evenodd" d="M1506.44 616.688C1514.62 619.625 1514.87 631.063 1507.06 634.437L1056.63 830.624L860.447 1281.05C857.322 1288.3 845.822 1289.61 842.384 1279.61L476.571 262.733C473.884 255.233 481.134 247.796 488.821 250.608L1506.44 616.688Z" fill="currentColor"/>
        </svg>
      </button>

      <div class="dropdown-wrap">
        <button
          aria-pressed="${t === 'add-player'}"
          aria-haspopup="menu"
          aria-expanded="${this._openMenu === 'player'}"
          aria-controls="menu-player"
          aria-label="Player"
          title="Player"
          @click="${(e: Event) => this.#onTriggerClick('player', e)}"
          @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('player', e)}">
          <span class="icon">●</span> <span class="btn-text">Player</span> <span class="caret"></span>
        </button>
        ${this._openMenu === 'player' ? html`
          <div role="menu" id="menu-player" aria-label="Add Player"
               @keydown="${this.#onMenuKeyDown}">
            ${(this.fieldTheme === 'white' ? TEAMS_WHITE : TEAMS_GREEN).map((t, i) => html`
              <button role="menuitem" tabindex="-1"
                      @click="${() => this.#pickPlayer(t.color, t.team)}">
                ${i === 0 ? html`
                  <svg viewBox="0 0 14 14" width="12" height="12" style="flex-shrink:0">
                    <polygon points="7,1 13,13 1,13" fill="${t.color}" stroke="white" stroke-width="1" stroke-linejoin="round" />
                  </svg>
                ` : html`
                  <span class="color-dot" style="background: ${t.color}"></span>
                `}
                ${t.label}
              </button>
            `)}
          </div>
        ` : ''}
      </div>

      <div class="dropdown-wrap">
        <button
          aria-pressed="${t === 'add-equipment'}"
          aria-haspopup="menu"
          aria-expanded="${this._openMenu === 'equipment'}"
          aria-controls="menu-equipment"
          aria-label="Equipment"
          title="Equipment"
          @click="${(e: Event) => this.#onTriggerClick('equipment', e)}"
          @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('equipment', e)}">
          <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14" style="vertical-align: middle"><path d="m1125 1050v75h-1050v-75c0-63.75 48.75-112.5 112.5-112.5h825c63.75 0 112.5 48.75 112.5 112.5zm-461.26-975h-131.26l-285 825h708.74z" fill="currentColor" /></svg>
          <span class="btn-text">Equipment</span> <span class="caret"></span>
        </button>
        ${this._openMenu === 'equipment' ? html`
          <div role="menu" id="menu-equipment" aria-label="Add Equipment"
               @keydown="${this.#onMenuKeyDown}">
            <button role="menuitem" tabindex="-1" @click="${() => this.#pickEquipment('ball')}">
              <svg viewBox="0 0 1200 1200" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                <circle cx="600" cy="600" r="560" fill="white" />
                <path fill="${COLORS.ballDetail}" d="m1080 600.84c-0.23438 127.31-51 249.28-141.19 339.14s-212.34 140.26-339.66 140.02c-127.31-0.23438-249.28-51-339.14-141.19-89.867-90.191-140.26-212.34-140.02-339.66 0.23438-127.31 51-249.28 141.19-339.14 90.191-89.867 212.34-140.26 339.66-140.02 127.22 0.51562 249.05 51.375 338.86 141.52 89.766 90.094 140.26 212.11 140.29 339.32zm-481.92 153.61c25.781 0 51.609 0.84375 77.297 0 8.3906-0.84375 15.984-5.2031 21-12 25.219-41.578 49.547-83.766 73.078-126.47v-0.046875c3.2344-6.9375 3.2344-14.953 0-21.938-24-42-49.922-84-75.938-124.69h-0.046875c-4.5469-6.2344-11.531-10.219-19.172-11.016-48.703-0.9375-97.5-0.9375-146.29 0-8.3906 0.84375-16.031 5.2031-21 12-26.016 40.688-51.469 82.125-76.453 124.18-3.1875 6.9375-3.1875 14.906 0 21.844 24 42.562 48.422 84.703 73.219 126.47 4.5 6.1875 11.344 10.219 18.938 11.062 25.219 1.3125 50.297 0.60938 75.375 0.60938zm-174.71-426.61c-40.688 3.9375-73.312 6.4688-105.61 10.781-8.5312 1.5-16.125 6.2344-21.234 13.219-24.609 38.625-48 78-71.156 117.7-3.375 6.3281-4.0781 13.734-1.9219 20.531 13.266 32.859 27.469 65.344 42.609 97.453 3.5625 5.7188 9.6562 9.4219 16.406 9.9375 31.922-2.1562 63.703-5.2969 96-9.7031 8.3438-1.5469 15.75-6.2812 20.672-13.219 26.156-41.062 51.422-82.594 75.844-124.69h-0.046875c3.7969-7.4062 4.4062-16.078 1.6875-24-12-28.312-24-56.156-37.781-83.391-4.0781-5.9062-9.375-10.875-15.469-14.625zm352.55 0c-5.5312 3.75-10.266 8.5312-13.922 14.156-13.547 27.375-26.391 55.219-37.922 84-2.6719 7.875-2.2031 16.453 1.3125 24 24 42 49.781 84 75.938 124.55h0.046875c5.5312 7.1719 13.594 11.953 22.547 13.453 30.844 4.4531 62.062 7.4531 93.234 9.375 7.3594-0.75 13.922-4.9219 17.625-11.297 14.625-30.609 28.312-61.781 41.062-93.375 2.6719-7.4062 2.25-15.562-1.0781-22.641-23.062-39.703-46.688-78.938-71.297-117.7v-0.046875c-4.9219-7.0312-12.328-11.906-20.766-13.688-33.094-4.4062-66.703-6.9375-106.78-10.922zm-13.781 562.08c-22.219-30.984-43.828-61.922-66.141-91.688-4.3125-4.125-10.078-6.375-16.078-6.2344-53.297-0.65625-106.83-0.65625-160.69 0-5.9531 0.23438-11.625 2.8125-15.703 7.2188-22.312 30-43.781 60-65.766 91.078 22.547 28.922 43.453 56.625 65.625 84 5.4375 5.7656 12.844 9.2344 20.766 9.7031 50.719 0.79688 101.53 0.79688 152.39 0 7.5-0.51562 14.484-3.9375 19.453-9.6094 22.219-27.328 43.547-55.547 66.141-84.469zm-483.98-593.76c9.9844 2.9062 20.156 4.9688 30.469 6.1406 13.922 0 27.703-2.3906 41.531-3.8438 29.625-3.375 61.688-0.70312 88.547-11.391 46.688-19.828 91.781-43.172 134.9-69.844 7.4531-4.4531 7.0781-24 7.2188-37.312 0-4.0781-9.6094-9.2344-15.703-12-22.453-10.219-44.766-4.0781-67.219 1.3125h-0.046876c-84 20.016-160.36 64.125-219.71 126.94zm643.45 0c-63.047-67.172-145.69-112.78-236.16-130.22-16.969-1.9219-34.172-1.125-50.906 2.2969-5.7656 0.84375-15.375 7.7812-15.375 12 0 12.844 0 32.766 7.4531 37.219 43.547 25.688 89.297 48 134.39 71.062l0.046875-0.046875c3.2344 1.2656 6.7031 1.9219 10.172 2.0625 40.078 4.0781 80.156 8.5312 120 12 10.359-0.9375 20.578-3.2344 30.375-6.8438zm-747.71 192c-24 66.609-20.766 167.06 4.2188 248.86l-0.046876 0.046875c7.6406 25.125 23.109 47.156 44.156 62.859 24-12 24-12 23.391-36.938-1.7812-42.984-3.2344-85.594-5.625-127.82-0.23438-8.2031-1.9219-16.359-4.9219-24-14.719-35.109-30-70.078-45.844-104.86-4.3125-6.9375-9.4688-13.312-15.375-18.984zm804.61 310.78c59.156-48.703 87.375-226.22 46.781-308.53-4.3125 3.8438-9.9375 6.4688-12 10.547-21.141 56.625-60 107.16-56.062 172.31v0.046876c1.1719 29.953-0.09375 59.906-3.8438 89.625-1.5469 18.375 4.0781 29.906 25.078 35.203zm-246.52 223.69c77.578-23.672 146.86-68.859 199.78-130.31 10.594-14.297 18.984-30.047 24.984-46.781 1.6406-5.9062 0.14063-12.234-3.9844-16.828-8.1562-3.9375-20.766-9-26.859-5.3906-75 43.828-149.16 88.688-195.84 166.55-7.4531 12.281-10.078 20.438 1.9219 32.766zm-258 1.9219c0-12 3.1406-21.703 0-27.938-47.062-81.234-122.76-130.08-201.71-174.47-5.3906-3.1406-17.766 2.7656-24.938 7.4531l-0.046874-0.046875c-3.7969 4.8281-4.9219 11.203-3.0938 17.062 4.6406 15.141 11.766 29.438 21 42.328 55.219 64.219 127.64 111.28 208.78 135.61z" />
              </svg>
              Ball
            </button>
            <button role="menuitem" tabindex="-1" @click="${() => this.#pickEquipment('cone')}">
              <svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                <circle cx="8" cy="8" r="5" fill="${COLORS.equipmentBody}" stroke="${COLORS.coneChartreuse}" stroke-width="3" />
              </svg>
              Cone
            </button>
            <button role="menuitem" tabindex="-1" @click="${() => this.#pickEquipment('coach')}">
              <svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                <circle cx="8" cy="8" r="7" fill="${COLORS.coachBg}" stroke="white" stroke-width="0.8" />
                <text x="8" y="8" text-anchor="middle" dominant-baseline="central"
                      fill="white" font-size="8" font-weight="bold" font-family="system-ui, sans-serif">C</text>
              </svg>
              Coach
            </button>
            <button role="menuitem" tabindex="-1" @click="${() => this.#pickEquipment('goal')}">
              <svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                <rect x="3" y="2" width="5" height="12" fill="none" stroke="white" stroke-width="1.2"
                      stroke-dasharray="1.5,1" />
                <line x1="3" y1="2" x2="3" y2="14" stroke="white" stroke-width="1.2" stroke-dasharray="none" />
              </svg>
              Goal
            </button>
            <button role="menuitem" tabindex="-1" @click="${() => this.#pickEquipment('mini-goal')}">
              <svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                <rect x="4" y="4" width="3.5" height="8" fill="none" stroke="white" stroke-width="1.2"
                      stroke-dasharray="1.5,1" />
                <line x1="4" y1="4" x2="4" y2="12" stroke="white" stroke-width="1.2" stroke-dasharray="none" />
              </svg>
              Mini Goal
            </button>
            <button role="menuitem" tabindex="-1" @click="${() => this.#pickEquipment('popup-goal')}">
              <svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                <path d="M 6,3 A 5,5 0 0 1 6,13" fill="none" stroke="${COLORS.popupGoal}" stroke-width="1.2"
                      stroke-dasharray="1.5,1" />
                <line x1="6" y1="3" x2="6" y2="13" stroke="${COLORS.popupGoal}" stroke-width="1.2" stroke-dasharray="none" />
              </svg>
              Pop-up Goal
            </button>
          </div>
        ` : ''}
      </div>

      <div class="dropdown-wrap">
        <button
          aria-pressed="${t === 'draw-line' || t === 'draw-shape'}"
          aria-haspopup="menu"
          aria-expanded="${this._openMenu === 'line'}"
          aria-controls="menu-line"
          aria-label="Draw"
          title="Draw"
          @click="${(e: Event) => this.#onTriggerClick('line', e)}"
          @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('line', e)}">
          <svg class="icon" viewBox="0 0 12 12" width="12" height="12" style="vertical-align: middle"><line x1="2" y1="10" x2="10" y2="2" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" /></svg>
          <span class="btn-text">Draw</span> <span class="caret"></span>
        </button>
        ${this._openMenu === 'line' ? html`
          <div role="menu" id="menu-line" aria-label="Draw"
               @keydown="${this.#onMenuKeyDown}">
            ${LINE_STYLES.map(s => html`
              <button role="menuitem" tabindex="-1"
                      @click="${() => this.#pickLine(s.value)}">
                <span class="line-preview-wrap">
                  <svg viewBox="0 0 32 12" xmlns="http://www.w3.org/2000/svg">
                    ${s.value === 'wavy'
                      ? svg`<path d="M 2,6 Q 5,2 8,6 Q 11,10 14,6 Q 17,2 20,6" fill="none" stroke="${COLORS.previewStroke}" stroke-width="2" />`
                      : svg`<line x1="2" y1="6" x2="22" y2="6" stroke="${COLORS.previewStroke}" stroke-width="2" stroke-dasharray="${s.value === 'dashed' ? '4,3' : 'none'}" />`}
                    <polygon points="20,2 28,6 20,10" fill="${COLORS.previewStroke}" />
                  </svg>
                </span>
                ${s.label}
              </button>
            `)}
            <button role="menuitem" tabindex="-1"
                    @click="${() => this.#pickShape('rect')}">
              <svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                <rect x="2" y="3" width="12" height="10" fill="none" stroke="${COLORS.previewStroke}" stroke-width="1.2" rx="0.5" />
              </svg>
              Rectangle
            </button>
            <button role="menuitem" tabindex="-1"
                    @click="${() => this.#pickShape('ellipse')}">
              <svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                <ellipse cx="8" cy="8" rx="7" ry="5" fill="none" stroke="${COLORS.previewStroke}" stroke-width="1.2" />
              </svg>
              Ellipse
            </button>
          </div>
        ` : ''}
      </div>

      <button
        title="Text"
        aria-pressed="${t === 'add-text'}"
        aria-label="Text"
        @click="${() => this.#pick('add-text')}">
        Text
      </button>
      </div>

      <div class="edit-bar">
        ${selType !== 'none' ? html`
          <div class="edit-bar-left">
            ${selType === 'single-player' ? this.#renderSinglePlayerEditor()
              : selType === 'players' ? this.#renderMultiPlayerEditor()
              : selType === 'single-cone' || selType === 'cones' ? this.#renderConeEditor()
              : selType === 'lines' ? this.#renderLineEditor()
              : selType === 'shapes' ? this.#renderShapeEditor()
              : selType === 'single-text' || selType === 'texts' ? this.#renderTextEditor()
              : nothing}
          </div>
          <div class="edit-bar-right">
            <button class="danger" title="Delete item${this.selectedItems.length > 1 ? 's' : ''}" aria-label="Delete item${this.selectedItems.length > 1 ? 's' : ''}"
                    @click="${this.#requestDelete}">
              <svg viewBox="0 0 1200 1200" width="16" height="16" style="flex-shrink:0">
                <path d="m300 393.61 55.172 618.74h489.74l55.078-618.74zm123.14 117.33h75.094v374.76h-75.094zm139.22 0h75.094v374.76h-75.094zm139.55 0h75.094v374.76h-75.094z" fill="currentColor"/>
                <path d="m410.44 149.95v112.41h-147.89v75h674.9v-75h-147.89v-112.41zm75 75h229.18v37.406h-229.18z" fill="currentColor"/>
              </svg>
              <span class="btn-text">Delete</span>
            </button>
            ${this.selectedItems.length >= 2 ? html`
              <span class="divider"></span>
              ${this.#renderAlignmentControls()}
            ` : nothing}
          </div>
        ` : nothing}
      </div>

      <dialog id="delete-dialog">
        <div class="dialog-header">
          <h2>Delete item${this.selectedItems.length > 1 ? 's' : ''}</h2>
          <button class="dialog-close" aria-label="Close" title="Close" @click="${this.#cancelDelete}">
            <svg viewBox="0 0 16 16"><path d="M 4,4 L 12,12 M 12,4 L 4,12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </button>
        </div>
        <div class="dialog-body">
          <p>Are you sure you want to delete ${this.selectedItems.length > 1 ? `these ${this.selectedItems.length} items` : 'this item'}?</p>
          <div class="confirm-actions">
            <button class="cancel-btn" @click="${this.#cancelDelete}">Cancel</button>
            <button class="confirm-danger" @click="${this.#confirmDelete}">Yes, delete</button>
          </div>
        </div>
      </dialog>

    `;
  }

  #renderSinglePlayerEditor() {
    const p = this.#singlePlayer!;
    return html`
      <fieldset class="edit-fields">
        <legend>Edit player</legend>
        <label>#</label>
        <input class="number-input"
               type="text"
               maxlength="2"
               aria-label="Player number"
               .value="${p.label ?? ''}"
               @blur="${this.#onNumberBlur}"
               @keydown="${this.#onNumberKeyDown}"
               @pointerdown="${(e: Event) => e.stopPropagation()}" />
        ${this.#renderPlayerColorBtn(p)}
      </fieldset>
    `;
  }

  #renderMultiPlayerEditor() {
    const players = this.#selectedPlayers;
    const firstPlayer = players[0];
    return html`
      <fieldset class="edit-fields">
        <legend>Edit players <span class="count-badge">${players.length}</span></legend>
        ${this.#renderPlayerColorBtn(firstPlayer)}
      </fieldset>
    `;
  }

  #renderPlayerColorBtn(refPlayer: Player) {
    return html`
      <div class="dropdown-wrap">
        <button class="color-btn"
                aria-haspopup="menu"
                aria-expanded="${this._openMenu === 'color'}"
                aria-controls="menu-color"
                aria-label="Player color"
                title="Player color"
                @click="${(e: Event) => this.#onTriggerClick('color', e)}"
                @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('color', e)}">
          ${refPlayer.team === 'a' ? html`
            <svg viewBox="0 0 16 16" width="16" height="16">
              <polygon points="8,2 14,14 2,14" fill="${refPlayer.color}" stroke="white" stroke-width="1" stroke-linejoin="round" />
            </svg>
          ` : html`
            <span class="color-swatch" style="background: ${refPlayer.color}"></span>
          `}
          <span class="caret"></span>
        </button>
        ${this._openMenu === 'color' ? html`
          <div role="menu" id="menu-color" aria-label="Player color"
               class="color-grid"
               @keydown="${this.#onMenuKeyDown}">
            ${getPlayerColors(this.fieldTheme).map(c => html`
              <button role="menuitemradio" tabindex="-1"
                      aria-checked="${refPlayer.color === c.color}"
                      aria-label="${c.name}"
                      @click="${() => this.#changeColor(c.color)}">
                ${refPlayer.team === 'a' ? html`
                  <svg viewBox="0 0 20 20" width="20" height="20">
                    <polygon points="10,2 18,18 2,18" fill="${c.color}" stroke="white" stroke-width="1" stroke-linejoin="round" />
                  </svg>
                ` : html`
                  <span class="color-swatch" style="background: ${c.color}"></span>
                `}
              </button>
            `)}
          </div>
        ` : ''}
      </div>
    `;
  }

  #renderConeEditor() {
    const cones = this.#selectedCones;
    const refCone = cones[0];
    return html`
      <fieldset class="edit-fields">
        <legend>Edit ${cones.length > 1 ? 'cones' : 'cone'}${cones.length > 1 ? html` <span class="count-badge">${cones.length}</span>` : nothing}</legend>
        <div class="dropdown-wrap">
          <button class="color-btn"
                  aria-haspopup="menu"
                  aria-expanded="${this._openMenu === 'cone-color'}"
                  aria-controls="menu-cone-color"
                  aria-label="Cone color"
                  title="Cone color"
                  @click="${(e: Event) => this.#onTriggerClick('cone-color', e)}"
                  @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('cone-color', e)}">
            <svg viewBox="0 0 16 16" width="16" height="16">
              <circle cx="8" cy="8" r="5" fill="${COLORS.equipmentBody}" stroke="${refCone.color ?? COLORS.coneChartreuse}" stroke-width="3" />
            </svg>
            <span class="caret"></span>
          </button>
          ${this._openMenu === 'cone-color' ? html`
            <div role="menu" id="menu-cone-color" aria-label="Cone color"
                 class="color-grid" style="grid-template-columns: repeat(2, 1fr);"
                 @keydown="${this.#onMenuKeyDown}">
              ${getConeColors(this.fieldTheme).map(c => html`
                <button role="menuitemradio" tabindex="-1"
                        aria-checked="${(refCone.color ?? COLORS.coneChartreuse) === c.color}"
                        aria-label="${c.name}"
                        @click="${() => this.#changeConeColor(c.color)}">
                  <svg viewBox="0 0 20 20" width="20" height="20">
                    <circle cx="10" cy="10" r="6" fill="${COLORS.equipmentBody}" stroke="${c.color}" stroke-width="3.5" />
                  </svg>
                </button>
              `)}
            </div>
          ` : ''}
        </div>
      </fieldset>
    `;
  }

  #renderLineEditor() {
    const lines = this.#selectedLines;
    const ref = lines[0];
    const style = ref.style;
    const nextStyle: LineStyle = style === 'solid' ? 'dashed' : style === 'dashed' ? 'wavy' : 'solid';
    const styleLabel = style === 'solid' ? 'Pass/Shot' : style === 'dashed' ? 'Run' : 'Dribble';
    const nextLabel = nextStyle === 'solid' ? 'Pass/Shot' : nextStyle === 'dashed' ? 'Run' : 'Dribble';
    const hasStart = ref.arrowStart;
    const hasEnd = ref.arrowEnd;
    const ids = lines.map(l => l.id);
    return html`
      <fieldset class="edit-fields">
        <legend>Edit ${lines.length > 1 ? 'lines' : 'line'}${lines.length > 1 ? html` <span class="count-badge">${lines.length}</span>` : nothing}</legend>
        <button class="color-btn" title="Arrow on start"
                aria-pressed="${hasStart}"
                aria-label="Arrow on start"
                @click="${() => this.dispatchEvent(new LineUpdateEvent(ids, { arrowStart: !hasStart }))}">
          <svg viewBox="0 0 20 12" width="20" height="12">
            <line x1="8" y1="6" x2="18" y2="6" stroke="currentColor" stroke-width="2" />
            <polygon points="8,3 2,6 8,9" fill="${hasStart ? 'currentColor' : COLORS.inactiveArrow}" />
          </svg>
        </button>
        <button class="color-btn" title="${styleLabel} — switch to ${nextLabel}"
                aria-label="${styleLabel} line style — switch to ${nextLabel}"
                @click="${() => this.dispatchEvent(new LineUpdateEvent(ids, { style: nextStyle }))}">
          <svg viewBox="0 0 20 12" width="20" height="12">
            ${style === 'wavy'
              ? svg`<path d="M 2,6 Q 5,2 8,6 Q 11,10 14,6 Q 17,2 20,6" fill="none" stroke="currentColor" stroke-width="2.5" />`
              : svg`<line x1="2" y1="6" x2="18" y2="6" stroke="currentColor" stroke-width="2.5" stroke-dasharray="${style === 'dashed' ? '3,2' : 'none'}" />`}
          </svg>
        </button>
        <button class="color-btn" title="Arrow on end"
                aria-pressed="${hasEnd}"
                aria-label="Arrow on end"
                @click="${() => this.dispatchEvent(new LineUpdateEvent(ids, { arrowEnd: !hasEnd }))}">
          <svg viewBox="0 0 20 12" width="20" height="12">
            <line x1="2" y1="6" x2="12" y2="6" stroke="currentColor" stroke-width="2" />
            <polygon points="12,3 18,6 12,9" fill="${hasEnd ? 'currentColor' : COLORS.inactiveArrow}" />
          </svg>
        </button>
        <div class="dropdown-wrap">
          <button class="color-btn" title="Line color"
                  aria-haspopup="menu"
                  aria-expanded="${this._openMenu === 'line-color'}"
                  aria-controls="menu-line-color"
                  aria-label="Line color"
                  @click="${(e: Event) => this.#onTriggerClick('line-color', e)}"
                  @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('line-color', e)}">
            <span class="color-swatch" style="background: ${ref.color}"></span>
            <span class="caret"></span>
          </button>
          ${this._openMenu === 'line-color' ? html`
            <div role="menu" id="menu-line-color" aria-label="Line color"
                 style="flex-direction: row; gap: 4px; padding: 6px;"
                 @keydown="${this.#onMenuKeyDown}">
              ${getLineColors(this.fieldTheme).map(c => html`
                <button role="menuitemradio" tabindex="-1"
                        aria-checked="${ref.color === c.color}"
                        aria-label="${c.name}"
                        style="width: 44px; height: 44px; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 6px;${ref.color === c.color ? ' background: var(--pt-border); border-color: white;' : ''}"
                        @click="${() => this.#changeLineColor(c.color)}">
                  <span class="color-swatch" style="background: ${c.color}"></span>
                </button>
              `)}
            </div>
          ` : ''}
        </div>
      </fieldset>
    `;
  }

  #pickPlayer(color: string, team: Team) {
    this._openMenu = null;
    this.activeTool = 'add-player';
    this.dispatchEvent(new ToolChangedEvent('add-player', color, team));
  }

  #pickLine(style: LineStyle) {
    this._openMenu = null;
    this.activeTool = 'draw-line';
    this.dispatchEvent(new ToolChangedEvent('draw-line', undefined, undefined, style));
  }

  #pickShape(kind: ShapeKind) {
    this._openMenu = null;
    this.activeTool = 'draw-shape';
    this.dispatchEvent(new ToolChangedEvent('draw-shape', undefined, undefined, undefined, undefined, kind));
  }

  #renderShapeEditor() {
    const shapes = this.#selectedShapes;
    const ref = shapes[0];
    const allSameKind = shapes.every(s => s.kind === ref.kind);
    const single = shapes.length === 1;
    const kindLabel = allSameKind
      ? (ref.kind === 'rect' ? (single ? 'rectangle' : 'rectangles') : (single ? 'ellipse' : 'ellipses'))
      : (single ? 'shape' : 'shapes');
    return html`
      <fieldset class="edit-fields">
        <legend>Edit ${kindLabel}${shapes.length > 1 ? html` <span class="count-badge">${shapes.length}</span>` : nothing}</legend>
        <div class="dropdown-wrap">
          <button class="color-btn"
                  aria-haspopup="menu"
                  aria-expanded="${this._openMenu === 'shape-style' as any}"
                  aria-label="Shape style"
                  title="Shape style"
                  @click="${(e: Event) => this.#onTriggerClick('shape-style' as MenuId, e)}"
                  @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('shape-style' as MenuId, e)}">
            ${ref.style === 'outline'
              ? html`<span class="color-swatch" style="background: transparent; border: 2px solid var(--swatch-border, white);"></span>`
              : ref.style === 'dashed'
              ? html`<span class="color-swatch" style="background: transparent; border: 2px dashed var(--swatch-border, white);"></span>`
              : html`<span class="color-swatch" style="background: ${
                  ref.style === 'fill-blue' ? COLORS.shapeFillBlue
                  : ref.style === 'fill-red' ? COLORS.playerRed
                  : COLORS.shapeFillYellow
                }; opacity: 0.6;"></span>`
            }
            <span class="caret"></span>
          </button>
          ${(this._openMenu as string) === 'shape-style' ? html`
            <div role="menu" aria-label="Shape style"
                 style="flex-direction: row; gap: 4px; padding: 6px;"
                 @keydown="${this.#onMenuKeyDown}">
              ${getShapeStyles(this.fieldTheme).map(s => html`
                <button role="menuitemradio" tabindex="-1"
                        aria-checked="${ref.style === s.value}"
                        aria-label="${s.name}"
                        style="width: 44px; height: 44px; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 6px;${ref.style === s.value ? ' background: var(--pt-border); border-color: white;' : ''}"
                        @click="${() => this.#changeShapeStyle(s.value)}">
                  ${s.value === 'outline'
                    ? html`<span class="color-swatch" style="background: transparent; border: 2px solid var(--swatch-border, white);"></span>`
                    : s.value === 'dashed'
                    ? html`<span class="color-swatch" style="background: transparent; border: 2px dashed var(--swatch-border, white);"></span>`
                    : html`<span class="color-swatch" style="background: ${s.fill}; opacity: 0.6;"></span>`
                  }
                </button>
              `)}
            </div>
          ` : ''}
        </div>
      </fieldset>
    `;
  }

  #renderTextEditor() {
    const texts = this.#selectedTexts;
    const ref = texts[0];
    const currentSize = ref.fontSize ?? 2;
    const currentLabel = TEXT_SIZES.find(s => s.value === currentSize)?.label ?? 'M';
    const ids = texts.map(t => t.id);
    return html`
      <fieldset class="edit-fields">
        ${texts.length > 1
          ? html`<legend>Edit texts <span class="count-badge">${texts.length}</span></legend>`
          : html`
            <legend>Edit text</legend>
            <input class="number-input" style="width: 100px; text-align: left; padding: 0 6px;"
                   type="text"
                   aria-label="Text content"
                   .value="${ref.text}"
                   @blur="${this.#onTextBlur}"
                   @keydown="${this.#onTextKeyDown}"
                   @pointerdown="${(e: Event) => e.stopPropagation()}" />
            <button class="save-btn" @click="${this.#onTextSave}">Save</button>
          `}
        <span class="divider"></span>
        <label class="hide-mobile">Font size:</label>
        <div class="dropdown-wrap">
          <button class="color-btn"
                  aria-haspopup="menu"
                  aria-expanded="${this._openMenu === 'text-size'}"
                  aria-controls="menu-text-size"
                  aria-label="Font size"
                  title="Font size"
                  style="width: auto; padding: 0 8px; font-size: 0.8rem; font-weight: bold;"
                  @click="${(e: Event) => this.#onTriggerClick('text-size', e)}"
                  @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('text-size', e)}">
            ${currentLabel}
            <span class="caret"></span>
          </button>
          ${this._openMenu === 'text-size' ? html`
            <div role="menu" id="menu-text-size" aria-label="Font size"
                 @keydown="${this.#onMenuKeyDown}">
              ${TEXT_SIZES.map(s => html`
                <button role="menuitemradio" tabindex="-1"
                        aria-checked="${currentSize === s.value}"
                        @click="${() => this.#changeTextSize(ids, s.value)}">
                  <span style="font-weight: bold; min-width: 24px;">${s.label}</span>
                </button>
              `)}
            </div>
          ` : ''}
        </div>
      </fieldset>
    `;
  }

  #renderAlignmentControls() {
    const count = this.selectedItems.length;
    const hasGroup = this.selectedItems.some(i => 'groupId' in i && (i as any).groupId);
    return html`
        <div class="dropdown-wrap">
          <button
            aria-haspopup="menu"
            aria-expanded="${this._openMenu === 'grouping'}"
            aria-controls="menu-grouping"
            aria-label="Grouping"
            title="Grouping"
            @click="${(e: Event) => this.#onTriggerClick('grouping', e)}"
            @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('grouping', e)}">
            <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0"><path d="m92.305 184.62c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.316-92.316-92.305-92.316-50.988 0-92.305 41.328-92.305 92.305 0 50.977 41.328 92.316 92.305 92.316zm0 1015.4c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.328-92.305-92.305-92.305-50.977 0-92.305 41.316-92.305 92.305 0 50.988 41.328 92.305 92.305 92.305zm1015.4 0c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.328-92.305-92.305-92.305-50.977 0-92.305 41.328-92.305 92.305 0 50.977 41.316 92.305 92.305 92.305zm0-1015.4c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.328-92.316-92.305-92.316-50.977 0-92.305 41.328-92.305 92.305 0 50.977 41.316 92.316 92.305 92.316zm-969.24-46.164h923.07v923.07h-923.07zm992.32-92.305h-1061.5c-23.074 0-23.074 0-23.074 23.074v1061.5c0 23.074 0 23.074 23.074 23.074h1061.5c23.074 0 23.074 0 23.074-23.074l0.003906-1061.5c0-23.074 0-23.074-23.074-23.074zm-438.47 830.77h-369.23v-369.23h369.23zm69.238-461.55h-507.7c-23.074 0-23.074 0-23.074 23.074v507.7c0 23.074 0 23.074 23.074 23.074h507.7c23.074 0 23.074 0 23.074-23.074l0.003906-507.69c0-23.078 0-23.078-23.078-23.078zm115.38 276.93h-369.23v-369.23h369.23zm69.227-461.53h-507.7c-23.074 0-23.074 0-23.074 23.074v507.7c0 23.074 0 23.074 23.074 23.074h507.7c23.074 0 23.074 0 23.074-23.074v-507.7c0-23.074 0-23.074-23.074-23.074z" fill="currentColor"/></svg>
            <span class="btn-text">Grouping</span> <span class="caret"></span>
          </button>
          ${this._openMenu === 'grouping' ? html`
            <div role="menu" id="menu-grouping" aria-label="Grouping"
                 @keydown="${this.#onMenuKeyDown}">
              <button role="menuitem" tabindex="-1"
                      @click="${() => { this._openMenu = null; this.dispatchEvent(new GroupItemsEvent()); }}">
                <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0"><path d="m92.305 184.62c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.316-92.316-92.305-92.316-50.988 0-92.305 41.328-92.305 92.305 0 50.977 41.328 92.316 92.305 92.316zm0 1015.4c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.328-92.305-92.305-92.305-50.977 0-92.305 41.316-92.305 92.305 0 50.988 41.328 92.305 92.305 92.305zm1015.4 0c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.328-92.305-92.305-92.305-50.977 0-92.305 41.328-92.305 92.305 0 50.977 41.316 92.305 92.305 92.305zm0-1015.4c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.328-92.316-92.305-92.316-50.977 0-92.305 41.328-92.305 92.305 0 50.977 41.316 92.316 92.305 92.316zm-969.24-46.164h923.07v923.07h-923.07zm992.32-92.305h-1061.5c-23.074 0-23.074 0-23.074 23.074v1061.5c0 23.074 0 23.074 23.074 23.074h1061.5c23.074 0 23.074 0 23.074-23.074l0.003906-1061.5c0-23.074 0-23.074-23.074-23.074zm-438.47 830.77h-369.23v-369.23h369.23zm69.238-461.55h-507.7c-23.074 0-23.074 0-23.074 23.074v507.7c0 23.074 0 23.074 23.074 23.074h507.7c23.074 0 23.074 0 23.074-23.074l0.003906-507.69c0-23.078 0-23.078-23.078-23.078zm115.38 276.93h-369.23v-369.23h369.23zm69.227-461.53h-507.7c-23.074 0-23.074 0-23.074 23.074v507.7c0 23.074 0 23.074 23.074 23.074h507.7c23.074 0 23.074 0 23.074-23.074v-507.7c0-23.074 0-23.074-23.074-23.074z" fill="currentColor"/></svg>
                Group
              </button>
              ${hasGroup ? html`
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this._openMenu = null; this.dispatchEvent(new UngroupItemsEvent()); }}">
                  <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0"><path d="m369.23 184.62c46.152 0 92.305-46.152 92.305-92.305s-46.152-92.316-92.305-92.316c-46.152 0-92.305 46.152-92.305 92.305 0.003906 46.152 46.152 92.316 92.305 92.316zm0 738.45c46.152 0 92.305-46.152 92.305-92.305 0-46.152-46.152-92.305-92.305-92.305-46.152 0-92.305 46.152-92.305 92.305 0.003906 46.156 46.152 92.305 92.305 92.305zm738.47-738.45c46.152 0 92.305-46.152 92.305-92.305s-46.152-92.316-92.305-92.316c-46.152 0-92.305 46.152-92.305 92.305 0 46.152 46.152 92.316 92.305 92.316zm0 738.45c46.152 0 92.305-46.152 92.305-92.305 0-46.152-46.152-92.305-92.305-92.305-46.152 0-92.305 46.152-92.305 92.305 0 46.156 46.152 92.305 92.305 92.305zm-276.92-461.53c46.152 0 92.305-46.152 92.305-92.305 0-46.152-46.152-92.305-92.305-92.305-46.152 0-92.305 46.152-92.305 92.305 0 46.152 46.152 92.305 92.305 92.305zm0 738.46c46.152 0 92.305-46.152 92.305-92.305 0-46.152-46.152-92.305-92.305-92.305-46.152 0-92.305 46.152-92.305 92.305 0 46.152 46.152 92.305 92.305 92.305zm-738.47-738.46c46.152 0 92.305-46.152 92.305-92.305 0-46.152-46.152-92.305-92.305-92.305-46.152 0.003906-92.305 46.141-92.305 92.293 0 46.152 46.152 92.316 92.305 92.316zm0 738.46c46.152 0 92.305-46.152 92.305-92.305 0-46.152-46.152-92.305-92.305-92.305-46.152 0-92.305 46.152-92.305 92.305 0 46.152 46.152 92.305 92.305 92.305zm692.32-138.46h-646.16v-646.16h646.15v646.16zm69.227-738.47h-784.62c-23.074 0-23.074 0-23.074 23.074v784.62c0 23.074 0 23.074 23.074 23.074h784.62c23.074 0 23.074 0 23.074-23.074l0.003906-784.62c0-23.078 0-23.078-23.078-23.078zm207.7 461.55h-646.16v-646.16h646.15v646.16zm69.23-738.47h-784.62c-23.074 0-23.074 0-23.074 23.074v784.62c0 23.074 0 23.074 23.074 23.074h784.62c23.074 0 23.074 0 23.074-23.074v-784.62c0-23.074 0-23.074-23.074-23.074z" fill="currentColor"/></svg>
                  Ungroup
                </button>
              ` : nothing}
            </div>
          ` : nothing}
        </div>

        <div class="dropdown-wrap">
          <button
            aria-haspopup="menu"
            aria-expanded="${this._openMenu === 'align'}"
            aria-controls="menu-align"
            aria-label="Align"
            title="Align"
            @click="${(e: Event) => this.#onTriggerClick('align', e)}"
            @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('align', e)}">
            <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0"><path d="m258 330h828v240h-828z" fill="currentColor"/><path d="m258 630h444v240h-444z" fill="currentColor"/><path d="m114 162h84v876h-84z" fill="currentColor"/></svg>
            <span class="btn-text">Align</span> <span class="caret"></span>
          </button>
          ${this._openMenu === 'align' ? html`
            <div role="menu" id="menu-align" aria-label="Align & Distribute"
                 @keydown="${this.#onMenuKeyDown}">
              <button role="menuitem" tabindex="-1"
                      @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('left')); }}">
                <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0"><path d="m258 330h828v240h-828z" fill="currentColor"/><path d="m258 630h444v240h-444z" fill="currentColor"/><path d="m114 162h84v876h-84z" fill="currentColor"/></svg>
                Align left
              </button>
              <button role="menuitem" tabindex="-1"
                      @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('center-h')); }}">
                <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0"><path d="m1014 570v-240h-372v-168h-84v168h-372v240h372v60h-180v240h180v168h84v-168h180v-240h-180v-60z" fill="currentColor"/></svg>
                Align center horizontal
              </button>
              <button role="menuitem" tabindex="-1"
                      @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('right')); }}">
                <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0"><path d="m114 330h828v240h-828z" fill="currentColor"/><path d="m498 630h444v240h-444z" fill="currentColor"/><path d="m1002 162h84v876h-84z" fill="currentColor"/></svg>
                Align right
              </button>
              <button role="menuitem" tabindex="-1"
                      @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('top')); }}">
                <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0"><path d="m630 258h240v828h-240z" fill="currentColor"/><path d="m330 258h240v444h-240z" fill="currentColor"/><path d="m162 114h876v84h-876z" fill="currentColor"/></svg>
                Align top
              </button>
              <button role="menuitem" tabindex="-1"
                      @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('center-v')); }}">
                <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0"><path d="m1038 558h-168v-372h-240v372h-60v-180h-240v180h-168v84h168v180h240v-180h60v372h240v-372h168z" fill="currentColor"/></svg>
                Align center vertical
              </button>
              <button role="menuitem" tabindex="-1"
                      @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('bottom')); }}">
                <svg viewBox="0 0 1200 1200" width="14" height="14" style="flex-shrink:0"><path d="m630 114h240v828h-240z" fill="currentColor"/><path d="m330 498h240v444h-240z" fill="currentColor"/><path d="m162 1002h876v84h-876z" fill="currentColor"/></svg>
                Align bottom
              </button>
              ${count >= 3 ? html`
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('distribute-h')); }}">
                  <svg viewBox="0 0 1600 1600" width="14" height="14" style="flex-shrink:0"><path d="M264 216L264 1384L152 1384L152 216L264 216Z" fill="currentColor"/><path d="M1448 216L1448 1384L1336 1384L1336 216L1448 216Z" fill="currentColor"/><path d="M960 504L960 1096L640 1096L640 504L960 504Z" fill="currentColor"/></svg>
                  Distribute horizontal
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('distribute-v')); }}">
                  <svg viewBox="0 0 1600 1600" width="14" height="14" style="flex-shrink:0"><path d="M216 1336H1384V1448H216V1336Z" fill="currentColor"/><path d="M216 152H1384V264H216V152Z" fill="currentColor"/><path d="M504 640H1096V960H504V640Z" fill="currentColor"/></svg>
                  Distribute vertical
                </button>
              ` : nothing}
            </div>
          ` : nothing}
        </div>
    `;
  }

  #onTextBlur(e: FocusEvent) {
    const input = e.target as HTMLInputElement;
    const value = input.value.trim();
    const texts = this.#selectedTexts;
    if (texts.length === 1 && value && value !== texts[0].text) {
      this.dispatchEvent(new TextUpdateEvent([texts[0].id], { text: value }));
    }
  }

  #onTextKeyDown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  }

  #onTextSave() {
    const input = this.renderRoot.querySelector('.edit-fields .number-input') as HTMLInputElement | null;
    if (input) input.blur();
  }

  #changeTextSize(ids: string[], fontSize: number) {
    this._openMenu = null;
    if (ids.length) {
      this.dispatchEvent(new TextUpdateEvent(ids, { fontSize }));
    }
  }

  #changeShapeStyle(style: ShapeStyle) {
    this._openMenu = null;
    const ids = this.#selectedShapes.map(s => s.id);
    if (ids.length) {
      this.dispatchEvent(new ShapeUpdateEvent(ids, { style }));
    }
  }

  #pickEquipment(kind: EquipmentKind) {
    this._openMenu = null;
    this.activeTool = 'add-equipment';
    this.dispatchEvent(new ToolChangedEvent('add-equipment', undefined, undefined, undefined, kind));
  }

  #pick(tool: Tool) {
    this._openMenu = null;
    this.activeTool = tool;
    this.dispatchEvent(new ToolChangedEvent(tool));
  }

  #requestDelete() {
    requestAnimationFrame(() => this._deleteDialog?.showModal());
  }

  #cancelDelete() {
    this._deleteDialog?.close();
  }

  #confirmDelete() {
    this._deleteDialog?.close();
    this.dispatchEvent(new DeleteItemsEvent());
  }

  #onNumberBlur(e: FocusEvent) {
    const input = e.target as HTMLInputElement;
    const value = input.value.trim().slice(0, 2);
    const p = this.#singlePlayer;
    if (p && value !== (p.label ?? '')) {
      this.dispatchEvent(new PlayerUpdateEvent([p.id], { label: value || undefined }));
    }
  }

  #onNumberKeyDown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  }

  #changeColor(color: string) {
    this._openMenu = null;
    const ids = this.#selectedPlayers.map(p => p.id);
    if (ids.length) {
      this.dispatchEvent(new PlayerUpdateEvent(ids, { color }));
    }
  }

  #changeConeColor(color: string) {
    this._openMenu = null;
    const ids = this.#selectedCones.map(c => c.id);
    if (ids.length) {
      this.dispatchEvent(new EquipmentUpdateEvent(ids, { color }));
    }
  }

  #changeLineColor(color: string) {
    this._openMenu = null;
    const ids = this.#selectedLines.map(l => l.id);
    if (ids.length) {
      this.dispatchEvent(new LineUpdateEvent(ids, { color }));
    }
  }

  #onDocClick = (e: PointerEvent) => {
    if (this._openMenu && !e.composedPath().includes(this)) {
      this._openMenu = null;
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'cb-toolbar': CbToolbar;
  }
}
