import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import type { Tool, LineStyle, EquipmentKind, Player, Equipment, Line, Team } from '../lib/types.js';
import { PLAYER_COLORS, CONE_COLORS, LINE_COLORS } from '../lib/types.js';

export class ToolChangedEvent extends Event {
  static readonly eventName = 'tool-changed' as const;
  constructor(
    public tool: Tool,
    public playerColor?: string,
    public playerTeam?: Team,
    public lineStyle?: LineStyle,
    public equipmentKind?: EquipmentKind,
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

type SelectionType = 'none' | 'single-player' | 'players' | 'single-cone' | 'cones' | 'lines' | 'mixed';

function isPlayer(item: Player | Equipment | Line): item is Player {
  return 'team' in item;
}

function isEquipment(item: Player | Equipment | Line): item is Equipment {
  return 'kind' in item;
}

function isLine(item: Player | Equipment | Line): item is Line {
  return 'x1' in item;
}

const TEAMS: { label: string; color: string; team: Team }[] = [
  { label: 'Team A', color: '#4ea8de', team: 'a' },
  { label: 'Team B', color: '#d43d55', team: 'b' },
];

const LINE_STYLES: { label: string; value: LineStyle }[] = [
  { label: 'Pass / Shot', value: 'solid' },
  { label: 'Run', value: 'dashed' },
];

type MenuId = 'player' | 'line' | 'equipment' | 'color' | 'cone-color' | 'line-color';

@customElement('cb-toolbar')
export class CbToolbar extends LitElement {
  static styles = css`
    :host {
      display: flex;
      gap: 4px;
      align-items: center;
      padding: 8px 12px;
      background: #16213e;
      border-radius: 10px 10px 0 0;
      user-select: none;
      flex-wrap: wrap;
    }

    button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: #0f3460;
      color: #e0e0e0;
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }

    button:hover {
      background: #1a4a7a;
    }

    button:focus-visible {
      outline: 2px solid #4ea8de;
      outline-offset: 2px;
    }

    button[aria-pressed="true"] {
      background: #e94560;
      border-color: #e94560;
      color: #fff;
    }

    .spacer {
      flex: 1;
    }

    button.danger {
      background: transparent;
      color: #e94560;
      border-color: #e94560;
    }

    button.danger:hover {
      background: #e9456020;
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
      background: #0f3460;
      border: 1px solid #1a4a7a;
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
      border-radius: 4px;
      gap: 12px;
      outline: none;
    }

    [role="menuitem"]:hover,
    [role="menuitemradio"]:hover,
    [role="menuitem"]:focus-visible,
    [role="menuitemradio"]:focus-visible {
      background: #1a4a7a;
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
      height: 24px;
      background: rgba(255, 255, 255, 0.15);
      margin: 0 4px;
    }

    .player-editor {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .player-editor label {
      font-size: 0.8rem;
      color: #aaa;
    }

    .number-input {
      width: 32px;
      height: 28px;
      text-align: center;
      font: bold 0.85rem system-ui, sans-serif;
      color: white;
      background: #0f3460;
      border: 1px solid #1a4a7a;
      border-radius: 4px;
      outline: none;
      padding: 0;
    }

    .number-input:focus {
      border-color: #4ea8de;
    }

    .color-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      background: #0f3460;
      border: 1px solid #1a4a7a;
      border-radius: 4px;
      cursor: pointer;
    }

    .color-btn:hover {
      border-color: #4ea8de;
    }

    .color-swatch {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 1px solid white;
    }

    .color-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
      padding: 6px;
    }

    .color-grid [role="menuitemradio"] {
      width: 32px;
      height: 32px;
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
      background: #1a4a7a;
      border-color: white;
    }

    .selection-info {
      font-size: 0.8rem;
      color: #aaa;
    }

    button.icon-btn {
      padding: 6px 8px;
      min-width: 28px;
      justify-content: center;
    }

    button:disabled {
      opacity: 0.3;
      cursor: default;
      pointer-events: none;
    }
  `;

  @property({ type: String, reflect: true })
  accessor activeTool: Tool = 'select';

  @property({ attribute: false })
  accessor selectedItems: Array<Player | Equipment | Line> = [];

  @property({ type: Boolean })
  accessor canUndo: boolean = false;

  @property({ type: Boolean })
  accessor canRedo: boolean = false;

  @state() private accessor _openMenu: MenuId | null = null;

  get #selectionType(): SelectionType {
    const items = this.selectedItems;
    if (items.length === 0) return 'none';
    if (items.every(i => isPlayer(i))) return items.length === 1 ? 'single-player' : 'players';
    if (items.every(i => isEquipment(i) && (i as Equipment).kind === 'cone')) return items.length === 1 ? 'single-cone' : 'cones';
    if (items.every(i => isLine(i))) return 'lines';
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
      <button
        aria-pressed="${t === 'select'}"
        @click="${() => this.#pick('select')}">
        <svg class="icon" viewBox="0 0 16 16" width="14" height="14" style="vertical-align: middle"><path d="M 2,2 L 2,13 L 5.5,9.5 L 9,14 L 11,13 L 7.5,8.5 L 12,7 Z" fill="currentColor" /></svg> Select
      </button>

      <div class="dropdown-wrap">
        <button
          aria-pressed="${t === 'add-player'}"
          aria-haspopup="menu"
          aria-expanded="${this._openMenu === 'player'}"
          aria-controls="menu-player"
          @click="${(e: Event) => this.#onTriggerClick('player', e)}"
          @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('player', e)}">
          <span class="icon">●</span> Add Player <span class="caret"></span>
        </button>
        ${this._openMenu === 'player' ? html`
          <div role="menu" id="menu-player" aria-label="Add Player"
               @keydown="${this.#onMenuKeyDown}">
            ${TEAMS.map((t, i) => html`
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
          @click="${(e: Event) => this.#onTriggerClick('equipment', e)}"
          @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('equipment', e)}">
          <svg class="icon" viewBox="0 0 16 16" width="14" height="14" style="vertical-align: middle"><polygon points="8,1 14.5,4.75 14.5,12.25 8,16 1.5,12.25 1.5,4.75" fill="currentColor" /></svg>
          Add Equipment <span class="caret"></span>
        </button>
        ${this._openMenu === 'equipment' ? html`
          <div role="menu" id="menu-equipment" aria-label="Add Equipment"
               @keydown="${this.#onMenuKeyDown}">
            <button role="menuitem" tabindex="-1" @click="${() => this.#pickEquipment('ball')}">
              <svg viewBox="0 0 1200 1200" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                <circle cx="600" cy="600" r="560" fill="white" />
                <path fill="#333" d="m1080 600.84c-0.23438 127.31-51 249.28-141.19 339.14s-212.34 140.26-339.66 140.02c-127.31-0.23438-249.28-51-339.14-141.19-89.867-90.191-140.26-212.34-140.02-339.66 0.23438-127.31 51-249.28 141.19-339.14 90.191-89.867 212.34-140.26 339.66-140.02 127.22 0.51562 249.05 51.375 338.86 141.52 89.766 90.094 140.26 212.11 140.29 339.32zm-481.92 153.61c25.781 0 51.609 0.84375 77.297 0 8.3906-0.84375 15.984-5.2031 21-12 25.219-41.578 49.547-83.766 73.078-126.47v-0.046875c3.2344-6.9375 3.2344-14.953 0-21.938-24-42-49.922-84-75.938-124.69h-0.046875c-4.5469-6.2344-11.531-10.219-19.172-11.016-48.703-0.9375-97.5-0.9375-146.29 0-8.3906 0.84375-16.031 5.2031-21 12-26.016 40.688-51.469 82.125-76.453 124.18-3.1875 6.9375-3.1875 14.906 0 21.844 24 42.562 48.422 84.703 73.219 126.47 4.5 6.1875 11.344 10.219 18.938 11.062 25.219 1.3125 50.297 0.60938 75.375 0.60938zm-174.71-426.61c-40.688 3.9375-73.312 6.4688-105.61 10.781-8.5312 1.5-16.125 6.2344-21.234 13.219-24.609 38.625-48 78-71.156 117.7-3.375 6.3281-4.0781 13.734-1.9219 20.531 13.266 32.859 27.469 65.344 42.609 97.453 3.5625 5.7188 9.6562 9.4219 16.406 9.9375 31.922-2.1562 63.703-5.2969 96-9.7031 8.3438-1.5469 15.75-6.2812 20.672-13.219 26.156-41.062 51.422-82.594 75.844-124.69h-0.046875c3.7969-7.4062 4.4062-16.078 1.6875-24-12-28.312-24-56.156-37.781-83.391-4.0781-5.9062-9.375-10.875-15.469-14.625zm352.55 0c-5.5312 3.75-10.266 8.5312-13.922 14.156-13.547 27.375-26.391 55.219-37.922 84-2.6719 7.875-2.2031 16.453 1.3125 24 24 42 49.781 84 75.938 124.55h0.046875c5.5312 7.1719 13.594 11.953 22.547 13.453 30.844 4.4531 62.062 7.4531 93.234 9.375 7.3594-0.75 13.922-4.9219 17.625-11.297 14.625-30.609 28.312-61.781 41.062-93.375 2.6719-7.4062 2.25-15.562-1.0781-22.641-23.062-39.703-46.688-78.938-71.297-117.7v-0.046875c-4.9219-7.0312-12.328-11.906-20.766-13.688-33.094-4.4062-66.703-6.9375-106.78-10.922zm-13.781 562.08c-22.219-30.984-43.828-61.922-66.141-91.688-4.3125-4.125-10.078-6.375-16.078-6.2344-53.297-0.65625-106.83-0.65625-160.69 0-5.9531 0.23438-11.625 2.8125-15.703 7.2188-22.312 30-43.781 60-65.766 91.078 22.547 28.922 43.453 56.625 65.625 84 5.4375 5.7656 12.844 9.2344 20.766 9.7031 50.719 0.79688 101.53 0.79688 152.39 0 7.5-0.51562 14.484-3.9375 19.453-9.6094 22.219-27.328 43.547-55.547 66.141-84.469zm-483.98-593.76c9.9844 2.9062 20.156 4.9688 30.469 6.1406 13.922 0 27.703-2.3906 41.531-3.8438 29.625-3.375 61.688-0.70312 88.547-11.391 46.688-19.828 91.781-43.172 134.9-69.844 7.4531-4.4531 7.0781-24 7.2188-37.312 0-4.0781-9.6094-9.2344-15.703-12-22.453-10.219-44.766-4.0781-67.219 1.3125h-0.046876c-84 20.016-160.36 64.125-219.71 126.94zm643.45 0c-63.047-67.172-145.69-112.78-236.16-130.22-16.969-1.9219-34.172-1.125-50.906 2.2969-5.7656 0.84375-15.375 7.7812-15.375 12 0 12.844 0 32.766 7.4531 37.219 43.547 25.688 89.297 48 134.39 71.062l0.046875-0.046875c3.2344 1.2656 6.7031 1.9219 10.172 2.0625 40.078 4.0781 80.156 8.5312 120 12 10.359-0.9375 20.578-3.2344 30.375-6.8438zm-747.71 192c-24 66.609-20.766 167.06 4.2188 248.86l-0.046876 0.046875c7.6406 25.125 23.109 47.156 44.156 62.859 24-12 24-12 23.391-36.938-1.7812-42.984-3.2344-85.594-5.625-127.82-0.23438-8.2031-1.9219-16.359-4.9219-24-14.719-35.109-30-70.078-45.844-104.86-4.3125-6.9375-9.4688-13.312-15.375-18.984zm804.61 310.78c59.156-48.703 87.375-226.22 46.781-308.53-4.3125 3.8438-9.9375 6.4688-12 10.547-21.141 56.625-60 107.16-56.062 172.31v0.046876c1.1719 29.953-0.09375 59.906-3.8438 89.625-1.5469 18.375 4.0781 29.906 25.078 35.203zm-246.52 223.69c77.578-23.672 146.86-68.859 199.78-130.31 10.594-14.297 18.984-30.047 24.984-46.781 1.6406-5.9062 0.14063-12.234-3.9844-16.828-8.1562-3.9375-20.766-9-26.859-5.3906-75 43.828-149.16 88.688-195.84 166.55-7.4531 12.281-10.078 20.438 1.9219 32.766zm-258 1.9219c0-12 3.1406-21.703 0-27.938-47.062-81.234-122.76-130.08-201.71-174.47-5.3906-3.1406-17.766 2.7656-24.938 7.4531l-0.046874-0.046875c-3.7969 4.8281-4.9219 11.203-3.0938 17.062 4.6406 15.141 11.766 29.438 21 42.328 55.219 64.219 127.64 111.28 208.78 135.61z" />
              </svg>
              Ball
            </button>
            <button role="menuitem" tabindex="-1" @click="${() => this.#pickEquipment('cone')}">
              <svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                <circle cx="8" cy="8" r="5" fill="#222" stroke="#7fff00" stroke-width="3" />
              </svg>
              Cone
            </button>
            <button role="menuitem" tabindex="-1" @click="${() => this.#pickEquipment('coach')}">
              <svg viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
                <circle cx="8" cy="8" r="7" fill="#151515" stroke="white" stroke-width="0.8" />
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
          </div>
        ` : ''}
      </div>

      <div class="dropdown-wrap">
        <button
          aria-pressed="${t === 'draw-line'}"
          aria-haspopup="menu"
          aria-expanded="${this._openMenu === 'line'}"
          aria-controls="menu-line"
          @click="${(e: Event) => this.#onTriggerClick('line', e)}"
          @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('line', e)}">
          <svg class="icon" viewBox="0 0 12 12" width="12" height="12" style="vertical-align: middle"><line x1="2" y1="10" x2="10" y2="2" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" /></svg>
          Draw Line <span class="caret"></span>
        </button>
        ${this._openMenu === 'line' ? html`
          <div role="menu" id="menu-line" aria-label="Draw Line"
               @keydown="${this.#onMenuKeyDown}">
            ${LINE_STYLES.map(s => html`
              <button role="menuitem" tabindex="-1"
                      @click="${() => this.#pickLine(s.value)}">
                <span class="line-preview-wrap">
                  <svg viewBox="0 0 32 12" xmlns="http://www.w3.org/2000/svg">
                    <line x1="2" y1="6" x2="22" y2="6"
                          stroke="#e0e0e0" stroke-width="2"
                          stroke-dasharray="${s.value === 'dashed' ? '4,3' : 'none'}" />
                    <polygon points="20,2 28,6 20,10" fill="#e0e0e0" />
                  </svg>
                </span>
                ${s.label}
              </button>
            `)}
          </div>
        ` : ''}
      </div>

      ${selType === 'single-player' ? this.#renderSinglePlayerEditor()
        : selType === 'players' ? this.#renderMultiPlayerEditor()
        : selType === 'single-cone' || selType === 'cones' ? this.#renderConeEditor()
        : selType === 'lines' ? this.#renderLineEditor()
        : nothing}

      <span class="spacer"></span>
      <button class="icon-btn" title="Undo (Cmd+Z)"
              ?disabled="${!this.canUndo}"
              @click="${() => this.dispatchEvent(new UndoEvent())}">
        <svg viewBox="0 0 16 16" width="14" height="14">
          <path d="M 5,3 L 2,6 L 5,9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M 2,6 L 10,6 A 4,4 0 0 1 10,14 L 7,14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
      <button class="icon-btn" title="Redo (Cmd+Shift+Z)"
              ?disabled="${!this.canRedo}"
              @click="${() => this.dispatchEvent(new RedoEvent())}">
        <svg viewBox="0 0 16 16" width="14" height="14">
          <path d="M 11,3 L 14,6 L 11,9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M 14,6 L 6,6 A 4,4 0 0 0 6,14 L 9,14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
      <button class="danger" @click="${this.#clear}">Clear All</button>
      <span class="divider"></span>
      <button @click="${() => this.dispatchEvent(new SaveSvgEvent())}">
        <svg class="icon" viewBox="0 0 16 16" width="14" height="14" style="vertical-align: middle">
          <path d="M 3,1 L 3,12 L 8,8 L 13,12 L 13,1 Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
          <line x1="2" y1="15" x2="14" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        Save SVG
      </button>
    `;
  }

  #renderSinglePlayerEditor() {
    const p = this.#singlePlayer!;
    return html`
      <span class="divider"></span>
      <div class="player-editor">
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
      </div>
    `;
  }

  #renderMultiPlayerEditor() {
    const players = this.#selectedPlayers;
    const firstPlayer = players[0];
    return html`
      <span class="divider"></span>
      <div class="player-editor">
        <span class="selection-info">${players.length} players</span>
        ${this.#renderPlayerColorBtn(firstPlayer)}
      </div>
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
                @click="${(e: Event) => this.#onTriggerClick('color', e)}"
                @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('color', e)}">
          ${refPlayer.team === 'a' ? html`
            <svg viewBox="0 0 16 16" width="16" height="16">
              <polygon points="8,2 14,14 2,14" fill="${refPlayer.color}" stroke="white" stroke-width="1" stroke-linejoin="round" />
            </svg>
          ` : html`
            <span class="color-swatch" style="background: ${refPlayer.color}"></span>
          `}
        </button>
        ${this._openMenu === 'color' ? html`
          <div role="menu" id="menu-color" aria-label="Player color"
               class="color-grid" style="right: 0; left: auto;"
               @keydown="${this.#onMenuKeyDown}">
            ${PLAYER_COLORS.map(c => html`
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
      <span class="divider"></span>
      <div class="player-editor">
        ${cones.length > 1 ? html`<span class="selection-info">${cones.length} cones</span>` : nothing}
        <div class="dropdown-wrap">
          <button class="color-btn"
                  aria-haspopup="menu"
                  aria-expanded="${this._openMenu === 'cone-color'}"
                  aria-controls="menu-cone-color"
                  aria-label="Cone color"
                  @click="${(e: Event) => this.#onTriggerClick('cone-color', e)}"
                  @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('cone-color', e)}">
            <svg viewBox="0 0 16 16" width="16" height="16">
              <circle cx="8" cy="8" r="5" fill="#222" stroke="${refCone.color ?? '#7fff00'}" stroke-width="3" />
            </svg>
          </button>
          ${this._openMenu === 'cone-color' ? html`
            <div role="menu" id="menu-cone-color" aria-label="Cone color"
                 class="color-grid" style="right: 0; left: auto; grid-template-columns: repeat(2, 1fr);"
                 @keydown="${this.#onMenuKeyDown}">
              ${CONE_COLORS.map(c => html`
                <button role="menuitemradio" tabindex="-1"
                        aria-checked="${(refCone.color ?? '#7fff00') === c.color}"
                        aria-label="${c.name}"
                        @click="${() => this.#changeConeColor(c.color)}">
                  <svg viewBox="0 0 20 20" width="20" height="20">
                    <circle cx="10" cy="10" r="6" fill="#222" stroke="${c.color}" stroke-width="3.5" />
                  </svg>
                </button>
              `)}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  #renderLineEditor() {
    const lines = this.#selectedLines;
    const ref = lines[0];
    const isSolid = ref.style === 'solid';
    const hasStart = ref.arrowStart;
    const hasEnd = ref.arrowEnd;
    const ids = lines.map(l => l.id);
    return html`
      <span class="divider"></span>
      <div class="player-editor">
        ${lines.length > 1 ? html`<span class="selection-info">${lines.length} lines</span>` : nothing}
        <button class="color-btn" title="Arrow on start"
                aria-pressed="${hasStart}"
                aria-label="Arrow on start"
                @click="${() => this.dispatchEvent(new LineUpdateEvent(ids, { arrowStart: !hasStart }))}">
          <svg viewBox="0 0 20 12" width="20" height="12">
            <line x1="8" y1="6" x2="18" y2="6" stroke="#e0e0e0" stroke-width="2" />
            <polygon points="8,3 2,6 8,9" fill="${hasStart ? '#e0e0e0' : '#555'}" />
          </svg>
        </button>
        <button class="color-btn" title="${isSolid ? 'Switch to dashed' : 'Switch to solid'}"
                aria-label="${isSolid ? 'Switch to dashed line' : 'Switch to solid line'}"
                @click="${() => this.dispatchEvent(new LineUpdateEvent(ids, { style: isSolid ? 'dashed' : 'solid' }))}">
          <svg viewBox="0 0 20 12" width="20" height="12">
            <line x1="2" y1="6" x2="18" y2="6"
                  stroke="#e0e0e0" stroke-width="2.5"
                  stroke-dasharray="${isSolid ? 'none' : '3,2'}" />
          </svg>
        </button>
        <button class="color-btn" title="Arrow on end"
                aria-pressed="${hasEnd}"
                aria-label="Arrow on end"
                @click="${() => this.dispatchEvent(new LineUpdateEvent(ids, { arrowEnd: !hasEnd }))}">
          <svg viewBox="0 0 20 12" width="20" height="12">
            <line x1="2" y1="6" x2="12" y2="6" stroke="#e0e0e0" stroke-width="2" />
            <polygon points="12,3 18,6 12,9" fill="${hasEnd ? '#e0e0e0' : '#555'}" />
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
          </button>
          ${this._openMenu === 'line-color' ? html`
            <div role="menu" id="menu-line-color" aria-label="Line color"
                 style="right: 0; left: auto; flex-direction: row; gap: 4px; padding: 6px;"
                 @keydown="${this.#onMenuKeyDown}">
              ${LINE_COLORS.map(c => html`
                <button role="menuitemradio" tabindex="-1"
                        aria-checked="${ref.color === c.color}"
                        aria-label="${c.name}"
                        style="width: 28px; height: 28px; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 6px;${ref.color === c.color ? ' background: #1a4a7a; border-color: white;' : ''}"
                        @click="${() => this.#changeLineColor(c.color)}">
                  <span class="color-swatch" style="background: ${c.color}"></span>
                </button>
              `)}
            </div>
          ` : ''}
        </div>
      </div>
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

  #clear() {
    this._openMenu = null;
    this.dispatchEvent(new ClearAllEvent());
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
