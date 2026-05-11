import { LitElement, html, svg, css, nothing, type PropertyValues } from 'lit';
import { toolShortcutHintStyle } from '../lib/shared-styles.js';
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

export class ZOrderEvent extends Event {
  static readonly eventName = 'z-order' as const;
  constructor(public readonly direction: 'front' | 'back') {
    super(ZOrderEvent.eventName, { bubbles: true, composed: true });
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

export class AutoNumberToggleEvent extends Event {
  static readonly eventName = 'auto-number-toggle' as const;
  constructor(public enabled: boolean) {
    super(AutoNumberToggleEvent.eventName, { bubbles: true, composed: true });
  }
}

export class RotateItemsEvent extends Event {
  static readonly eventName = 'rotate-items' as const;
  constructor(public delta: number) {
    super(RotateItemsEvent.eventName, { bubbles: true, composed: true });
  }
}

type SelectionType = 'none' | 'single-player' | 'players' | 'single-cone' | 'cones' | 'single-dummy' | 'dummies' | 'single-pole' | 'poles' | 'lines' | 'shapes' | 'single-text' | 'texts' | 'mixed';

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
  { label: 'Neutral', color: COLORS.playerYellow, team: 'neutral' },
];

const TEAMS_WHITE: { label: string; color: string; team: Team }[] = [
  { label: 'Team A', color: COLORS.playerBlueW, team: 'a' },
  { label: 'Team B', color: COLORS.playerRedW, team: 'b' },
  { label: 'Neutral', color: COLORS.playerYellowW, team: 'neutral' },
];

const LINE_STYLES: { label: string; symbol: string; value: LineStyle }[] = [
  { label: 'Pass / Shot', symbol: '―', value: 'solid' },
  { label: 'Run',         symbol: '╌',  value: 'dashed' },
  { label: 'Dribble',     symbol: '〜', value: 'wavy' },
];

type MenuId = 'player' | 'line' | 'equipment' | 'color' | 'cone-color' | 'dummy-color' | 'pole-color' | 'line-color' | 'shape-style' | 'text-size' | 'align' | 'grouping' | 'z-order' | 'ctx-panel';

@customElement('cb-toolbar')
export class CbToolbar extends LitElement {
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
      background: var(--pt-danger-hover);
      border-color: var(--pt-danger-hover);
      color: var(--pt-text-white);
    }

    .spacer {
      flex: 1;
    }

    button.danger {
      background: transparent;
      color: var(--pt-danger-lightest);
      border-color: var(--pt-danger-lightest);
    }

    button.danger:hover {
      background: rgba(248, 113, 113, 0.1);
    }

    .icon {
      font-size: 1rem;
      line-height: 1;
      flex-shrink: 0;
      vertical-align: middle;
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
      max-width: calc(100vw - 24px);
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

    .sb-menu-separator {
      height: 1px;
      background: rgba(255, 255, 255, 0.12);
      margin: 4px 0;
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
      width: 52px;
      height: 44px;
      text-align: center;
      font: bold 1rem system-ui, sans-serif;
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

    .edit-bar .color-btn[aria-pressed="true"],
    .color-btn[aria-pressed="true"] {
      background: var(--pt-danger-hover) !important;
      border-color: var(--pt-danger-hover) !important;
      color: var(--pt-text-white);
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

    /* ── hideToolSelector mode ───────────────────────────────── */
    /* When the host attribute is set, the tool-selector row is hidden and
       the edit-bar becomes the sole content rendered by this component.
       min-height ensures the context bar always occupies visible space. */

    :host([hide-tool-selector]) {
      padding: 0;
      height: 60px;
      min-height: 60px;
      /* no overflow:hidden — dropdowns must render outside the host */
      background: transparent;
    }

    :host([hide-tool-selector]) .edit-bar {
      margin: 0;
      padding: 8px 12px;
      border-top: none;
      height: 60px;
      min-height: 60px;
      box-sizing: border-box;
      background: transparent;
      box-shadow: none;
    }

    :host([icon-only]) .btn-text,
    :host([icon-only]) .hide-mobile {
      display: none;
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
      background: var(--pt-danger-hover);
      border-color: var(--pt-danger-hover);
      color: var(--pt-text-white);
    }

    .confirm-actions .confirm-danger:hover {
      background: var(--pt-danger);
    }

    /* ── sidebar-context mode ─────────────────────────────────── */

    :host([sidebar-context]) {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      width: 48px;
      padding: 0;
      background: transparent;
      position: relative;
    }

    .ctx-trigger-btn,
    .ctx-icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 8px;
      color: var(--pt-text);
      cursor: pointer;
      padding: 0;
      flex-shrink: 0;
      -webkit-tap-highlight-color: transparent;
      transition: background 0.12s, border-color 0.12s;
      font: inherit;
    }

    .ctx-trigger-btn {
      position: relative;
    }

    .ctx-trigger-btn::after,
    .ctx-icon-btn.has-submenu::after {
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

    .ctx-trigger-btn:hover,
    .ctx-icon-btn:hover {
      background: var(--pt-border);
    }

    .ctx-trigger-btn:focus-visible,
    .ctx-icon-btn:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .ctx-trigger-btn[aria-pressed="true"] {
      background: var(--pt-accent);
      border-color: var(--pt-accent);
      color: var(--pt-text-white);
    }

    .ctx-icon-btn.danger {
      color: var(--pt-danger-lightest);
      border-color: transparent;
    }

    .ctx-icon-btn.danger:hover {
      background: rgba(251, 138, 138, 0.1);
      border-color: transparent;
    }

    .ctx-sep {
      width: 40px;
      border: none;
      border-top: 1px solid rgba(0, 0, 0, 0.35);
      border-bottom: 1px solid rgba(255, 255, 255, 0.15);
      margin: 4px 0;
    }

    /* ── Floating context panel ───────────────────────────────── */

    .ctx-panel {
      position: absolute;
      left: calc(100% + 8px);
      z-index: 200;
      background: var(--pt-bg-surface);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      padding: 12px;
      min-width: 180px;
      max-width: 260px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .ctx-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding-left: 8px;
    }

    .ctx-panel-title {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--pt-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .ctx-panel-close {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      min-height: 44px;
      background: transparent;
      border: none;
      border-radius: 4px;
      color: var(--pt-text-muted);
      cursor: pointer;
      padding: 10px;
      font: inherit;
    }

    .ctx-panel-close:hover {
      color: var(--pt-text-white);
      background: var(--pt-border);
    }

    .ctx-panel-close:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 1px;
    }

    .ctx-panel-body {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .ctx-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .ctx-label {
      font-size: 0.8rem;
      color: var(--pt-text-muted);
      min-width: 32px;
      text-align: right;
    }

    .ctx-panel-divider {
      border: none;
      border-top: 1px solid rgba(0, 0, 0, 0.35);
      border-bottom: 1px solid rgba(255, 255, 255, 0.15);
      margin: 4px 0;
    }

    .ctx-panel-input {
      flex: 1;
      min-width: 0;
      min-height: 44px;
      text-align: left;
      font: bold 1rem system-ui, sans-serif;
      color: var(--pt-text-white);
      background: var(--pt-bg-primary);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      padding: 0 8px;
    }

    .ctx-panel .save-btn {
      min-height: 44px;
      height: 44px;
      padding: 0 10px;
    }

    .ctx-panel-input:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .ctx-font-select {
      width: 80px;
      min-height: 44px;
      font: bold 1rem system-ui, sans-serif;
      color: var(--pt-text-white);
      background: var(--pt-bg-primary);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      padding: 0 26px 0 10px;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23ccc'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      cursor: pointer;
    }

    .ctx-font-select:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    /* Shared select style — used for line style and font size */
    .ctx-select {
      flex: 1;
      min-width: 0;
      min-height: 44px;
      font: 0.82rem system-ui, sans-serif;
      color: var(--pt-text);
      background: var(--pt-bg-primary);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 6px;
      padding: 0 26px 0 10px;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23aaa'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      cursor: pointer;
    }

    .ctx-select:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    /* Fieldset group — legend stacked above controls via margin */
    fieldset.ctx-fieldset {
      border: none;
      margin: 0;
      padding: 0;
    }

    fieldset.ctx-fieldset > legend {
      font-size: 0.8rem;
      color: var(--pt-text-muted);
      padding: 0;
      font-weight: normal;
      width: 100%;
      float: none;
      margin-bottom: 8px;
    }

    .ctx-color-grid {
      display: grid;
      grid-template-columns: repeat(3, auto);
      gap: 6px;
      justify-content: start;
    }

    /* Equipment (cone/dummy/pole) colors — 2×2 grid */
    .ctx-color-grid--2col {
      grid-template-columns: repeat(2, auto);
    }

    .ctx-swatch-btn {
      width: 36px;
      height: 36px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 6px;
      cursor: pointer;
      font: inherit;
      transition: background 0.12s;
    }

    .ctx-swatch-btn:hover {
      background: var(--pt-border);
    }

    .ctx-swatch-btn:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 1px;
    }

    .ctx-swatch-btn[aria-pressed="true"] {
      background: var(--pt-border);
      border-color: var(--pt-text-white);
    }

    .ctx-line-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      min-height: 44px;
      padding: 0;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 6px;
      cursor: pointer;
      color: var(--pt-text);
      font: inherit;
      transition: background 0.12s;
    }

    /* Arrow polygon: dim when not pressed, full when pressed via CSS */
    .ctx-line-btn polygon {
      fill-opacity: 0.35;
    }

    .ctx-line-btn[aria-pressed="true"] polygon {
      fill-opacity: 1;
    }

    .ctx-line-btn:hover {
      background: var(--pt-border);
    }

    .ctx-line-btn:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 1px;
    }

    .ctx-line-btn[aria-pressed="true"] {
      background: var(--pt-border);
      border-color: var(--pt-text-white);
    }

    /* Tight-gap wrapper for the 5-button line type row */
    .ctx-line-controls {
      display: flex;
      gap: 4px;
    }

    /* Sidebar arrangement dropdown wrapper */
    .ctx-dd-wrap {
      position: relative;
    }

    .ctx-dd-wrap [role="menu"] {
      position: absolute;
      top: 0;
      left: calc(100% + 4px);
    }

    .ctx-dd-wrap.flipped [role="menu"] {
      top: auto;
      bottom: 0;
      left: calc(100% + 4px);
      z-index: 300;
      min-width: 180px;
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

    .ctx-dd-wrap [role="menuitem"],
    .ctx-dd-wrap [role="menuitemradio"] {
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

    .ctx-dd-wrap [role="menuitem"]:hover,
    .ctx-dd-wrap [role="menuitemradio"]:hover,
    .ctx-dd-wrap [role="menuitem"]:focus-visible,
    .ctx-dd-wrap [role="menuitemradio"]:focus-visible {
      background: var(--pt-border);
    }

    .ctx-dd-wrap .sb-menu-separator {
      height: 1px;
      background: rgba(255, 255, 255, 0.12);
      margin: 4px 0;
    }

    .ctx-number-input {
      width: 64px;
      height: 36px;
      text-align: center;
      font: bold 1rem system-ui, sans-serif;
      color: var(--pt-text-white);
      background: var(--pt-bg-primary);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      padding: 0 6px;
    }

    .ctx-number-input:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .ctx-text-size-btn {
      padding: 4px 10px;
      height: 36px;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 6px;
      color: var(--pt-text);
      font: bold 1rem system-ui, sans-serif;
      cursor: pointer;
      transition: background 0.12s;
    }

    .ctx-text-size-btn:hover {
      background: var(--pt-border);
    }

    .ctx-text-size-btn[aria-pressed="true"] {
      background: var(--pt-danger-hover);
      border-color: var(--pt-danger-hover);
      color: var(--pt-text-white);
    }

    .ctx-text-size-btn:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 1px;
    }

    .auto-number-section {
      border-top: 1px solid var(--pt-border);
      margin-top: 4px;
      padding-top: 4px;
    }

    .auto-number-label {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      font-size: 0.85rem;
      color: var(--pt-text);
      cursor: pointer;
    }

    .auto-number-checkbox {
      width: 16px;
      height: 16px;
      accent-color: var(--pt-accent);
      cursor: pointer;
    }

    .color-grid--compact {
      flex-direction: row;
      gap: 4px;
      padding: 6px;
    }

    .icon-grid-btn {
      width: 44px;
      height: 44px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
    }

    .icon-grid-btn[aria-checked="true"] {
      background: var(--pt-border);
      border-color: var(--pt-text-white);
    }

    .number-input--wide {
      width: 100px;
      text-align: left;
      padding: 0 6px;
    }

    .label-btn {
      width: auto;
      padding: 0 8px;
      font-size: 0.8rem;
      font-weight: bold;
    }

    .label-preview {
      font-weight: bold;
      min-width: 24px;
    }

  `];

  @property({ type: String, reflect: true })
  accessor activeTool: Tool = 'select';

  @property({ type: String })
  accessor fieldTheme: FieldTheme = 'green';

  @property({ type: Boolean })
  accessor autoNumber: boolean = false;

  @property({ attribute: false })
  accessor selectedItems: AnyItem[] = [];

  @property({ type: Boolean })
  accessor multiSelect: boolean = false;

  /** When true, hides the primary tool-selector row. Only the contextual
   *  edit bar is rendered (color pickers, alignment, etc. for selected items). */
  @property({ type: Boolean, reflect: true, attribute: 'hide-tool-selector' })
  accessor hideToolSelector: boolean = false;

  /** When true, hides text labels on edit-bar buttons (icon-only mode). */
  @property({ type: Boolean, reflect: true, attribute: 'icon-only' })
  accessor iconOnly: boolean = false;

  /** When true, renders the sidebar context section (Groups A–D) instead of toolbar. */
  @property({ type: Boolean, reflect: true, attribute: 'sidebar-context' })
  accessor sidebarContext: boolean = false;

  @state() private accessor _openMenu: MenuId | null = null;

  @query('#delete-dialog') accessor _deleteDialog!: HTMLDialogElement;

  get #selectionType(): SelectionType {
    const items = this.selectedItems;
    if (items.length === 0) return 'none';
    if (items.every(i => isPlayer(i))) return items.length === 1 ? 'single-player' : 'players';
    if (items.every(i => isEquipment(i) && (i as Equipment).kind === 'cone')) return items.length === 1 ? 'single-cone' : 'cones';
    if (items.every(i => isEquipment(i) && (i as Equipment).kind === 'dummy')) return items.length === 1 ? 'single-dummy' : 'dummies';
    if (items.every(i => isEquipment(i) && (i as Equipment).kind === 'pole')) return items.length === 1 ? 'single-pole' : 'poles';
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

  get #selectedDummies(): Equipment[] {
    return this.selectedItems.filter(i => isEquipment(i) && (i as Equipment).kind === 'dummy') as Equipment[];
  }

  get #selectedPoles(): Equipment[] {
    return this.selectedItems.filter(i => isEquipment(i) && (i as Equipment).kind === 'pole') as Equipment[];
  }

  get #hasRotatable(): boolean {
    return this.selectedItems.some(i => {
      if ('team' in i) return true;               // players
      if (isShape(i) || isTextItem(i)) return true; // shapes + text
      if ('kind' in i) {
        const k = (i as Equipment).kind;
        return k === 'goal' || k === 'mini-goal' || k === 'popup-goal' || k === 'dummy';
      }
      return false;
    });
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

  // Computed in #onPanelTriggerClick before setting _openMenu so the next render
  // picks up the correct position. panelFlipped = true → use as CSS `bottom`, else `top`.
  #panelTop = 0;
  #panelFlipped = false;
  #ctxMenuFlipped = false;
  #panelLeft = 0;
  #boundDocKeyDown!: (e: KeyboardEvent) => void;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('pointerdown', this.#onDocClick);
    this.#boundDocKeyDown = this.#onDocKeyDown.bind(this);
    // Capture phase: intercept Escape before it bubbles up to coach-board's sidebar-close keydown handler.
    document.addEventListener('keydown', this.#boundDocKeyDown, true);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('pointerdown', this.#onDocClick);
    document.removeEventListener('keydown', this.#boundDocKeyDown, true);
  }

  override updated(changed: PropertyValues) {
    super.updated(changed);
    if (changed.has('_openMenu') && this._openMenu === 'ctx-panel') {
      this.updateComplete.then(() => {
        const panel = this.shadowRoot?.querySelector('.ctx-panel');
        const first = panel?.querySelector<HTMLElement>('button, input, select');
        first?.focus();
      });
    }
  }

  #openDropdown(menu: MenuId) {
    this._openMenu = menu;
    this.updateComplete.then(() => {
      const menuEl = this.renderRoot.querySelector('[role="menu"]') as HTMLElement | null;
      if (menuEl) {
        menuEl.style.left = '0';
        menuEl.style.right = 'auto';
        const rect = menuEl.getBoundingClientRect();
        if (rect.right > window.innerWidth - 12) {
          menuEl.style.left = 'auto';
          menuEl.style.right = '0';
        }
      }
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
    if (this.sidebarContext) return this.#renderSidebarContext();

    const selType = this.#selectionType;

    if (this.hideToolSelector) {
      return nothing;
    }

    const t = this.activeTool;
    return html`
      ${true ? html`
      <div class="tools-left">
      <button
        title="Select"
        aria-pressed="${t === 'select'}"
        aria-label="Select"
        @click="${() => this.#pick('select')}">
        <svg class="icon" viewBox="0 0 1600 1600" width="21" height="21"><path fill-rule="evenodd" clip-rule="evenodd" d="M1394.44 730.688C1402.62 733.625 1402.87 745.063 1395.06 748.437L944.634 944.624L748.447 1395.05C745.322 1402.3 733.822 1403.61 730.384 1393.61L364.571 376.733C361.884 369.233 369.134 361.796 376.821 364.608L1394.44 730.688Z" fill="currentColor" /></svg> <span class="btn-text">Select</span>
      </button>

      <button
        title="Multi-select"
        aria-pressed="${this.multiSelect}"
        aria-label="Multi-select"
        @click="${() => this.dispatchEvent(new MultiSelectToggleEvent())}">
        <svg class="icon" viewBox="0 0 1600 1600" width="21" height="21">
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
          aria-label="Player (P)"
          title="Player (P)"
          @click="${(e: Event) => this.#onTriggerClick('player', e)}"
          @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('player', e)}">
          <svg class="icon" viewBox="0 0 1200 1200" width="16" height="16" fill="currentColor"><path d="m0 431.26 225 168.74v-200.16l-120.14-165.19z"/><path d="m1095.1 234.66-120.14 165.19v198.56l225-167.16z"/><path d="m1065.7 179.39c-9.9844-18.703-27.422-32.344-48-37.453l-267.71-66.938c0 82.828-67.172 150-150 150s-150-67.172-150-150l-267.71 66.938c-20.578 5.1562-38.016 18.75-48 37.453l-9.8438 18.469 134.44 184.87c2.3438 3.1875 3.5625 7.0781 3.5625 11.062v731.26h675l0.09375-731.29c0-3.9844 1.2656-7.8281 3.5625-11.062l134.44-184.87-9.8438-18.469zm-615.66 870.61h-112.5v-75h112.5zm318.74-581.26c-31.078 0-56.25-25.172-56.25-56.25 0-31.078 25.172-56.25 56.25-56.25 31.078 0 56.25 25.172 56.25 56.25 0 31.078-25.172 56.25-56.25 56.25z"/></svg> <span class="btn-text">Player</span> <span class="caret"></span>
        </button>
        ${this._openMenu === 'player' ? html`
          <div role="menu" id="menu-player" aria-label="Add Player"
               @keydown="${this.#onMenuKeyDown}">
            ${(this.fieldTheme === 'white' ? TEAMS_WHITE : TEAMS_GREEN).map(t => html`
              <button role="menuitem" tabindex="-1"
                      @click="${() => this.#pickPlayer(t.color, t.team)}">
                ${t.team === 'a' ? html`
                  <svg class="icon" viewBox="0 0 14 14" width="12" height="12">
                    <polygon points="7,1 13,13 1,13" fill="${t.color}" stroke="white" stroke-width="1" stroke-linejoin="round" />
                  </svg>
                ` : t.team === 'neutral' ? html`
                  <svg class="icon" viewBox="0 0 14 14" width="12" height="12">
                    <rect x="2" y="2" width="10" height="10" rx="1" fill="${t.color}" stroke="white" stroke-width="1" transform="rotate(45 7 7)" />
                  </svg>
                ` : html`
                  <span class="color-dot" style="background: ${t.color}"></span>
                `}
                ${t.label}
              </button>
            `)}
            <div class="auto-number-section">
              <label class="auto-number-label">
                <input type="checkbox" .checked="${this.autoNumber}"
                       @change="${(e: Event) => this.#toggleAutoNumber((e.target as HTMLInputElement).checked)}"
                       class="auto-number-checkbox">
                Auto-number
              </label>
            </div>
          </div>
        ` : ''}
      </div>

      <div class="dropdown-wrap">
        <button
          aria-pressed="${t === 'add-equipment'}"
          aria-haspopup="menu"
          aria-expanded="${this._openMenu === 'equipment'}"
          aria-controls="menu-equipment"
          aria-label="Equipment (E)"
          title="Equipment (E)"
          @click="${(e: Event) => this.#onTriggerClick('equipment', e)}"
          @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('equipment', e)}">
          <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14"><path d="m1125 1050v75h-1050v-75c0-63.75 48.75-112.5 112.5-112.5h825c63.75 0 112.5 48.75 112.5 112.5zm-461.26-975h-131.26l-285 825h708.74z" fill="currentColor" /></svg>
          <span class="btn-text">Equipment</span> <span class="caret"></span>
        </button>
        ${this._openMenu === 'equipment' ? html`
          <div role="menu" id="menu-equipment" aria-label="Add Equipment"
               @keydown="${this.#onMenuKeyDown}">
            <button role="menuitem" tabindex="-1" @click="${() => this.#pickEquipment('ball')}">
              <svg class="icon" viewBox="0 0 1200 1200" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                <circle cx="600" cy="600" r="560" fill="white" />
                <path fill="${COLORS.ballDetail}" d="m1080 600.84c-0.23438 127.31-51 249.28-141.19 339.14s-212.34 140.26-339.66 140.02c-127.31-0.23438-249.28-51-339.14-141.19-89.867-90.191-140.26-212.34-140.02-339.66 0.23438-127.31 51-249.28 141.19-339.14 90.191-89.867 212.34-140.26 339.66-140.02 127.22 0.51562 249.05 51.375 338.86 141.52 89.766 90.094 140.26 212.11 140.29 339.32zm-481.92 153.61c25.781 0 51.609 0.84375 77.297 0 8.3906-0.84375 15.984-5.2031 21-12 25.219-41.578 49.547-83.766 73.078-126.47v-0.046875c3.2344-6.9375 3.2344-14.953 0-21.938-24-42-49.922-84-75.938-124.69h-0.046875c-4.5469-6.2344-11.531-10.219-19.172-11.016-48.703-0.9375-97.5-0.9375-146.29 0-8.3906 0.84375-16.031 5.2031-21 12-26.016 40.688-51.469 82.125-76.453 124.18-3.1875 6.9375-3.1875 14.906 0 21.844 24 42.562 48.422 84.703 73.219 126.47 4.5 6.1875 11.344 10.219 18.938 11.062 25.219 1.3125 50.297 0.60938 75.375 0.60938zm-174.71-426.61c-40.688 3.9375-73.312 6.4688-105.61 10.781-8.5312 1.5-16.125 6.2344-21.234 13.219-24.609 38.625-48 78-71.156 117.7-3.375 6.3281-4.0781 13.734-1.9219 20.531 13.266 32.859 27.469 65.344 42.609 97.453 3.5625 5.7188 9.6562 9.4219 16.406 9.9375 31.922-2.1562 63.703-5.2969 96-9.7031 8.3438-1.5469 15.75-6.2812 20.672-13.219 26.156-41.062 51.422-82.594 75.844-124.69h-0.046875c3.7969-7.4062 4.4062-16.078 1.6875-24-12-28.312-24-56.156-37.781-83.391-4.0781-5.9062-9.375-10.875-15.469-14.625zm352.55 0c-5.5312 3.75-10.266 8.5312-13.922 14.156-13.547 27.375-26.391 55.219-37.922 84-2.6719 7.875-2.2031 16.453 1.3125 24 24 42 49.781 84 75.938 124.55h0.046875c5.5312 7.1719 13.594 11.953 22.547 13.453 30.844 4.4531 62.062 7.4531 93.234 9.375 7.3594-0.75 13.922-4.9219 17.625-11.297 14.625-30.609 28.312-61.781 41.062-93.375 2.6719-7.4062 2.25-15.562-1.0781-22.641-23.062-39.703-46.688-78.938-71.297-117.7v-0.046875c-4.9219-7.0312-12.328-11.906-20.766-13.688-33.094-4.4062-66.703-6.9375-106.78-10.922zm-13.781 562.08c-22.219-30.984-43.828-61.922-66.141-91.688-4.3125-4.125-10.078-6.375-16.078-6.2344-53.297-0.65625-106.83-0.65625-160.69 0-5.9531 0.23438-11.625 2.8125-15.703 7.2188-22.312 30-43.781 60-65.766 91.078 22.547 28.922 43.453 56.625 65.625 84 5.4375 5.7656 12.844 9.2344 20.766 9.7031 50.719 0.79688 101.53 0.79688 152.39 0 7.5-0.51562 14.484-3.9375 19.453-9.6094 22.219-27.328 43.547-55.547 66.141-84.469zm-483.98-593.76c9.9844 2.9062 20.156 4.9688 30.469 6.1406 13.922 0 27.703-2.3906 41.531-3.8438 29.625-3.375 61.688-0.70312 88.547-11.391 46.688-19.828 91.781-43.172 134.9-69.844 7.4531-4.4531 7.0781-24 7.2188-37.312 0-4.0781-9.6094-9.2344-15.703-12-22.453-10.219-44.766-4.0781-67.219 1.3125h-0.046876c-84 20.016-160.36 64.125-219.71 126.94zm643.45 0c-63.047-67.172-145.69-112.78-236.16-130.22-16.969-1.9219-34.172-1.125-50.906 2.2969-5.7656 0.84375-15.375 7.7812-15.375 12 0 12.844 0 32.766 7.4531 37.219 43.547 25.688 89.297 48 134.39 71.062l0.046875-0.046875c3.2344 1.2656 6.7031 1.9219 10.172 2.0625 40.078 4.0781 80.156 8.5312 120 12 10.359-0.9375 20.578-3.2344 30.375-6.8438zm-747.71 192c-24 66.609-20.766 167.06 4.2188 248.86l-0.046876 0.046875c7.6406 25.125 23.109 47.156 44.156 62.859 24-12 24-12 23.391-36.938-1.7812-42.984-3.2344-85.594-5.625-127.82-0.23438-8.2031-1.9219-16.359-4.9219-24-14.719-35.109-30-70.078-45.844-104.86-4.3125-6.9375-9.4688-13.312-15.375-18.984zm804.61 310.78c59.156-48.703 87.375-226.22 46.781-308.53-4.3125 3.8438-9.9375 6.4688-12 10.547-21.141 56.625-60 107.16-56.062 172.31v0.046876c1.1719 29.953-0.09375 59.906-3.8438 89.625-1.5469 18.375 4.0781 29.906 25.078 35.203zm-246.52 223.69c77.578-23.672 146.86-68.859 199.78-130.31 10.594-14.297 18.984-30.047 24.984-46.781 1.6406-5.9062 0.14063-12.234-3.9844-16.828-8.1562-3.9375-20.766-9-26.859-5.3906-75 43.828-149.16 88.688-195.84 166.55-7.4531 12.281-10.078 20.438 1.9219 32.766zm-258 1.9219c0-12 3.1406-21.703 0-27.938-47.062-81.234-122.76-130.08-201.71-174.47-5.3906-3.1406-17.766 2.7656-24.938 7.4531l-0.046874-0.046875c-3.7969 4.8281-4.9219 11.203-3.0938 17.062 4.6406 15.141 11.766 29.438 21 42.328 55.219 64.219 127.64 111.28 208.78 135.61z" />
              </svg>
              Ball
            </button>
            <button role="menuitem" tabindex="-1" @click="${() => this.#pickEquipment('cone')}">
              <svg class="icon" viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                <circle cx="8" cy="8" r="5" fill="none" stroke="${COLORS.coneNeonOrange}" stroke-width="3.5" />
                <circle cx="8" cy="8" r="2" fill="#d0d0d0" />
              </svg>
              Cone
            </button>
            <button role="menuitem" tabindex="-1" @click="${() => this.#pickEquipment('dummy')}">
              <svg class="icon" viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                <rect x="4.5" y="1.5" width="7" height="13" rx="3.5"
                      fill="none" stroke="${COLORS.coneChartreuse}" stroke-width="1.8" />
                <rect x="6.5" y="3.5" width="3" height="9" rx="1.5"
                      fill="${COLORS.coneChartreuse}" fill-opacity="0.6" />
              </svg>
              Dummy
            </button>
            <button role="menuitem" tabindex="-1" @click="${() => this.#pickEquipment('pole')}">
              <svg class="icon" viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                <circle cx="8" cy="8" r="5.5" fill="none" stroke="#d0d0d0" stroke-width="1.5" />
                <circle cx="8" cy="8" r="3" fill="${COLORS.coneChartreuse}" />
              </svg>
              Pole
            </button>
            <button role="menuitem" tabindex="-1" @click="${() => this.#pickEquipment('goal')}">
              <svg class="icon" viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="1" width="7" height="14" fill="none" stroke="white" stroke-width="1.3"
                      stroke-dasharray="1.8,1" />
                <line x1="3" y1="1" x2="3" y2="15" stroke="white" stroke-width="1.3" stroke-dasharray="none" />
              </svg>
              Goal
            </button>
            <button role="menuitem" tabindex="-1" @click="${() => this.#pickEquipment('mini-goal')}">
              <svg class="icon" viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="3" width="5" height="10" fill="none" stroke="white" stroke-width="1.3"
                      stroke-dasharray="1.8,1" />
                <line x1="3" y1="3" x2="3" y2="13" stroke="white" stroke-width="1.3" stroke-dasharray="none" />
              </svg>
              Mini Goal
            </button>
            <button role="menuitem" tabindex="-1" @click="${() => this.#pickEquipment('popup-goal')}">
              <svg class="icon" viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                <path d="M 5,1.5 A 6.5,6.5 0 0 1 5,14.5" fill="none" stroke="${COLORS.popupGoal}" stroke-width="1.3"
                      stroke-dasharray="1.8,1" />
                <line x1="5" y1="1.5" x2="5" y2="14.5" stroke="${COLORS.popupGoal}" stroke-width="1.3" stroke-dasharray="none" />
              </svg>
              Pop-up Goal
            </button>
            <button role="menuitem" tabindex="-1" @click="${() => this.#pickEquipment('coach')}">
              <svg class="icon" viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                <circle cx="8" cy="8" r="7" fill="${COLORS.coachBg}" stroke="white" stroke-width="0.8" />
                <text x="8" y="8" text-anchor="middle" dominant-baseline="central"
                      fill="white" font-size="8" font-weight="bold" font-family="system-ui, sans-serif">C</text>
              </svg>
              Coach
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
          aria-label="Draw (D)"
          title="Draw (D)"
          @click="${(e: Event) => this.#onTriggerClick('line', e)}"
          @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('line', e)}">
          <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14" fill="currentColor"><path d="m349.6 604.3-88.301 88.551c-9.75 9.6992-9.75 25.613 0.050781 35.352l17.699 17.699-123.65 123.95c-4.6992 4.6992-7.3008 11.113-7.3008 17.699 0 6.6016 2.6484 12.949 7.3516 17.699l53.102 53-79.602 79.75c-9.75 9.75-9.75 25.602 0.050781 35.352 4.8984 4.8984 11.25 7.3008 17.648 7.3008 6.3984 0 12.801-2.4492 17.699-7.3516l79.602-79.801 53.102 53c4.8984 4.8867 11.25 7.3008 17.648 7.3008s12.801-2.4609 17.699-7.3008l123.6-123.95 17.699 17.699c4.6992 4.6875 11.051 7.3008 17.648 7.3008 6.6484 0 13-2.7109 17.699-7.3008l88.301-88.562z"/><path d="m1060.9 325.05-150.74-150.3c-19.262-19.449-43.211-43.648-70.461-43.648-11.789 0-22.551 4.5-31.051 13.051l-70.637 70.801-88.551-88.301c-4.6992-4.6484-11.051-7.3008-17.648-7.3008-6.6484 0-13 2.6484-17.699 7.3516l-282.42 283.2c-9.6992 9.75-9.6992 25.602 0.050781 35.352 9.8008 9.6992 25.602 9.8008 35.352-0.050781l264.8-265.5 70.801 70.648-317.75 318.55 247.85 247.2 428.15-429.25c9-8.8008 17.488-17.148 17.488-30.898-0.035157-13.754-8.5352-22.102-17.535-30.902z"/></svg>
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
              <svg class="icon" viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="3" width="12" height="10" fill="none" stroke="${COLORS.previewStroke}" stroke-width="1.2" rx="0.5" />
              </svg>
              Rectangle
            </button>
            <button role="menuitem" tabindex="-1"
                    @click="${() => this.#pickShape('ellipse')}">
              <svg class="icon" viewBox="0 0 16 16" width="16" height="16" xmlns="http://www.w3.org/2000/svg">
                <ellipse cx="8" cy="8" rx="7" ry="5" fill="none" stroke="${COLORS.previewStroke}" stroke-width="1.2" />
              </svg>
              Ellipse
            </button>
          </div>
        ` : ''}
      </div>

      <button
        title="Text (T)"
        aria-pressed="${t === 'add-text'}"
        aria-label="Text (T)"
        @click="${() => this.#pick('add-text')}">
        <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14" fill="currentColor"><path d="m312 348h168v504h-96v72h264v-72h-96v-504h168v72h72v-108c0-9.5469-3.793-18.703-10.543-25.457-6.7539-6.75-15.91-10.543-25.457-10.543h-480c-9.5469 0-18.703 3.793-25.457 10.543-6.75 6.7539-10.543 15.91-10.543 25.457v108h72z"/><path d="m780 528v96h-96v72h96v120c0 28.645 11.379 56.113 31.633 76.367 20.254 20.254 47.723 31.633 76.367 31.633h72v-72h-72c-9.5469 0-18.703-3.793-25.457-10.543-6.75-6.7539-10.543-15.91-10.543-25.457v-120h96v-72h-96v-96z"/></svg>
      </button>
      </div>
      ` : nothing}

      <div class="edit-bar">
        ${selType !== 'none' ? html`
          <div class="edit-bar-left">
            ${selType === 'single-player' ? this.#renderSinglePlayerEditor()
              : selType === 'players' ? this.#renderMultiPlayerEditor()
              : selType === 'single-cone' || selType === 'cones' ? this.#renderEquipmentColorEditor('cone', this.#selectedCones)
              : selType === 'single-dummy' || selType === 'dummies' ? this.#renderEquipmentColorEditor('dummy', this.#selectedDummies)
              : selType === 'single-pole' || selType === 'poles' ? this.#renderEquipmentColorEditor('pole', this.#selectedPoles)
              : selType === 'lines' ? this.#renderLineEditor()
              : selType === 'shapes' ? this.#renderShapeEditor()
              : selType === 'single-text' || selType === 'texts' ? this.#renderTextEditor()
              : nothing}
          </div>
          <div class="edit-bar-right">
            ${this.#hasRotatable ? html`
            <button title="Rotate counter-clockwise (,)" aria-label="Rotate counter-clockwise (,)"
                    @click="${this.#rotateItems}">
              <svg class="icon" viewBox="0 0 1600 1600" width="16" height="16" fill="currentColor">
                <path d="M228.987 616.493C253.987 627.993 283.987 616.493 295.487 591.993C376.487 415.007 554.993 299.993 749.98 299.993C821.98 299.993 891.98 314.993 957.487 344.493C1022.99 373.993 1080.99 416.493 1128.5 469.993L1288.5 649.993H1100.01C1072.51 649.993 1050.01 672.493 1050.01 699.993C1050.01 727.493 1072.51 749.993 1100.01 749.993H1400.01C1406.51 749.993 1412.51 748.493 1418.51 746.493C1421.01 745.493 1422.51 743.993 1425.01 742.493C1428.01 740.993 1431.01 739.493 1433.51 737.493C1433.51 737.493 1434.01 736.493 1434.51 736.493C1437.01 733.993 1438.51 730.993 1440.51 728.493C1442.51 725.993 1444.51 723.493 1445.51 720.493C1446.51 718.493 1446.51 715.493 1447.51 713.493C1448.51 709.493 1450.01 705.493 1450.01 701.493V400C1450.01 372.5 1427.51 350 1400.01 350C1372.51 350 1350.01 372.5 1350.01 400V568.493L1203.5 403.507C1146 339.007 1077 288.507 998.513 253C920.019 217.5 836.02 199.5 750.02 199.5C516.02 199.5 301.527 336.993 204.513 549.5C193.013 574.5 204.513 604.5 229.513 616L228.987 616.493Z"/>
                <path d="M200 1250C227.5 1250 250 1227.5 250 1200V1031.51L396.507 1196.49C454.007 1260.99 523.007 1311.49 601.493 1347C679.988 1382.5 763.987 1400.5 849.987 1400.5C1083.99 1400.5 1298.48 1263.01 1395.49 1050.5C1406.99 1025.5 1395.49 995.5 1370.49 984C1345.49 972.5 1315.49 984 1303.99 1008.5C1222.99 1185.49 1044.49 1300.5 849.5 1300.5C777.5 1300.5 707.5 1285.5 641.993 1256C576.488 1226.5 518.493 1184 470.98 1130.5L310.98 950.5H499.473C526.973 950.5 549.473 928 549.473 900.5C549.473 873 526.973 850.5 499.473 850.5H199.473C196.973 850.5 194.973 851.5 192.473 852C188.973 852.5 185.473 853 181.973 854C178.473 855.5 175.973 857.5 172.973 859.5C170.973 861 168.473 861.5 166.473 863.5C166.473 863.5 165.973 864.5 165.473 864.5C162.973 867 160.973 870 158.973 873C157.473 875.5 154.973 878 153.973 880.5C152.973 883 152.973 885.5 151.973 888C150.973 892 149.473 895.5 149.473 900V1201.49C149.473 1228.99 171.973 1251.49 199.473 1251.49L200 1250Z"/>
              </svg>
              <span class="btn-text">Rotate</span>
            </button>
            ` : nothing}
            ${this.selectedItems.length >= 2 ? html`
              ${this.#hasRotatable ? html`<span class="divider"></span>` : nothing}
              ${this.#renderAlignmentControls()}
            ` : nothing}
            ${this.#hasRotatable || this.selectedItems.length >= 2 ? html`<span class="divider"></span>` : nothing}
            <button class="danger" title="Delete item${this.selectedItems.length > 1 ? 's' : ''} (Del)" aria-label="Delete item${this.selectedItems.length > 1 ? 's' : ''} (Del)"
                    @click="${this.#requestDelete}">
              <svg class="icon" viewBox="0 0 16 16" width="14" height="14">
                <path d="M5 2V1h6v1h4v2H1V2h4zm1 4v7h1V6H6zm3 0v7h1V6H9zM2 5l1 10h10l1-10H2z" fill="currentColor"/>
              </svg>
              <span class="btn-text">Delete</span>
            </button>
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
               maxlength="3"
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

  #renderEquipmentColorEditor(kind: 'cone' | 'dummy' | 'pole', items: Equipment[]) {
    const ref = items[0];
    const menuId = `${kind}-color` as MenuId;
    const label = kind === 'cone' ? 'Cone' : kind === 'dummy' ? 'Dummy' : 'Pole';
    const defaultColor = kind === 'cone' ? COLORS.coneNeonOrange : COLORS.coneChartreuse;
    const plural = kind === 'cone' ? 'cones' : kind === 'dummy' ? 'dummies' : 'poles';
    const singular = kind;
    return html`
      <fieldset class="edit-fields">
        <legend>Edit ${items.length > 1 ? plural : singular}${items.length > 1 ? html` <span class="count-badge">${items.length}</span>` : nothing}</legend>
        <div class="dropdown-wrap">
          <button class="color-btn"
                  aria-haspopup="menu"
                  aria-expanded="${this._openMenu === menuId}"
                  aria-controls="menu-${menuId}"
                  aria-label="${label} color"
                  title="${label} color"
                  @click="${(e: Event) => this.#onTriggerClick(menuId, e)}"
                  @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown(menuId, e)}">
            <svg viewBox="0 0 16 16" width="16" height="16">
              ${kind === 'pole' ? svg`
                <circle cx="8" cy="8" r="5.5" fill="none" stroke="#d0d0d0" stroke-width="1.5" />
                <circle cx="8" cy="8" r="3" fill="${ref.color ?? defaultColor}" />
              ` : kind === 'cone' ? svg`
                <circle cx="8" cy="8" r="5" fill="none" stroke="${ref.color ?? defaultColor}" stroke-width="3.5" />
                <circle cx="8" cy="8" r="2" fill="#d0d0d0" />
              ` : svg`
                <circle cx="8" cy="8" r="5.5" fill="none" stroke="${ref.color ?? defaultColor}" stroke-width="1.8" />
                <circle cx="8" cy="8" r="3" fill="${ref.color ?? defaultColor}" fill-opacity="0.6" />
              `}
            </svg>
            <span class="caret"></span>
          </button>
          ${this._openMenu === menuId ? html`
            <div role="menu" id="menu-${menuId}" aria-label="${label} color"
                 class="color-grid" style="grid-template-columns: repeat(2, 1fr);"
                 @keydown="${this.#onMenuKeyDown}">
              ${getConeColors(this.fieldTheme).map(c => html`
                <button role="menuitemradio" tabindex="-1"
                        aria-checked="${(ref.color ?? defaultColor) === c.color}"
                        aria-label="${c.name}"
                        @click="${() => this.#changeEquipmentColor(items, c.color)}">
                  <svg viewBox="0 0 20 20" width="20" height="20">
                    ${kind === 'pole' ? svg`
                      <circle cx="10" cy="10" r="7" fill="none" stroke="#d0d0d0" stroke-width="1.8" />
                      <circle cx="10" cy="10" r="4" fill="${c.color}" />
                    ` : kind === 'cone' ? svg`
                      <circle cx="10" cy="10" r="6.5" fill="none" stroke="${c.color}" stroke-width="4.5" />
                      <circle cx="10" cy="10" r="2.5" fill="#d0d0d0" />
                    ` : svg`
                      <circle cx="10" cy="10" r="7" fill="none" stroke="${c.color}" stroke-width="2" />
                      <circle cx="10" cy="10" r="4" fill="${c.color}" fill-opacity="0.6" />
                    `}
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
                 class="color-grid--compact"
                 @keydown="${this.#onMenuKeyDown}">
              ${getLineColors(this.fieldTheme).map(c => html`
                <button role="menuitemradio" tabindex="-1"
                        aria-checked="${ref.color === c.color}"
                        aria-label="${c.name}"
                        class="icon-grid-btn"
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
                  aria-expanded="${this._openMenu === 'shape-style'}"
                  aria-label="Shape style"
                  title="Shape style"
                  @click="${(e: Event) => this.#onTriggerClick('shape-style', e)}"
                  @keydown="${(e: KeyboardEvent) => this.#onTriggerKeyDown('shape-style', e)}">
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
                 class="color-grid--compact"
                 @keydown="${this.#onMenuKeyDown}">
              ${getShapeStyles(this.fieldTheme).map(s => html`
                <button role="menuitemradio" tabindex="-1"
                        aria-checked="${ref.style === s.value}"
                        aria-label="${s.name}"
                        class="icon-grid-btn"
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
            <input class="number-input number-input--wide"
                   type="text"
                   aria-label="Text content"
                   .value="${ref.text}"
                   @blur="${this.#onTextBlur}"
                   @keydown="${this.#onTextKeyDown}"
                   @pointerdown="${(e: Event) => e.stopPropagation()}" />
            <button class="save-btn icon-btn" title="Save text" aria-label="Save text" @click="${this.#onTextSave}">
              <svg viewBox="0 0 1200 1200" width="16" height="16" fill="currentColor">
                <path d="m112.5 200v800c0.027344 36.461 14.523 71.418 40.301 97.199 25.781 25.777 60.738 40.273 97.199 40.301h700c36.461-0.027344 71.418-14.523 97.199-40.301 25.777-25.781 40.273-60.738 40.301-97.199v-615c0.027344-31.207-10.551-61.496-30-85.898l-148.05-185c-26.07-32.719-65.664-51.723-107.5-51.602h-551.95c-36.461 0.027344-71.418 14.523-97.199 40.301-25.777 25.781-40.273 60.738-40.301 97.199zm225 862.5v-362.5c0-6.9023 5.5977-12.5 12.5-12.5h500c3.3164 0 6.4961 1.3164 8.8398 3.6602s3.6602 5.5234 3.6602 8.8398v362.5zm375-925v112.5c0 3.3164-1.3164 6.4961-3.6602 8.8398s-5.5234 3.6602-8.8398 3.6602h-300c-6.9023 0-12.5-5.5977-12.5-12.5v-112.5zm-525 62.5c0.027344-16.566 6.6211-32.449 18.336-44.164 11.715-11.715 27.598-18.309 44.164-18.336h62.5v112.5c0.027344 23.199 9.2539 45.438 25.656 61.844 16.406 16.402 38.645 25.629 61.844 25.656h300c23.199-0.027344 45.438-9.2539 61.844-25.656 16.402-16.406 25.629-38.645 25.656-61.844v-112.5h62.5c16.566 0.027344 32.449 6.6211 44.164 18.336 11.715 11.715 18.309 27.598 18.336 44.164v612.5l148.05 185h-748.15z"/>
              </svg>
            </button>
          `}
        <span class="divider"></span>
        <label class="hide-mobile">Font size:</label>
        <div class="dropdown-wrap">
          <button class="color-btn label-btn"
                  aria-haspopup="menu"
                  aria-expanded="${this._openMenu === 'text-size'}"
                  aria-controls="menu-text-size"
                  aria-label="Font size"
                  title="Font size"
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
                  <span class="label-preview">${s.label}</span>
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
    const hasGroup = this.selectedItems.some(i => 'groupId' in i && (i as unknown as Record<string, unknown>).groupId);
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
            <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14"><path d="m92.305 184.62c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.316-92.316-92.305-92.316-50.988 0-92.305 41.328-92.305 92.305 0 50.977 41.328 92.316 92.305 92.316zm0 1015.4c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.328-92.305-92.305-92.305-50.977 0-92.305 41.316-92.305 92.305 0 50.988 41.328 92.305 92.305 92.305zm1015.4 0c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.328-92.305-92.305-92.305-50.977 0-92.305 41.328-92.305 92.305 0 50.977 41.316 92.305 92.305 92.305zm0-1015.4c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.328-92.316-92.305-92.316-50.977 0-92.305 41.328-92.305 92.305 0 50.977 41.316 92.316 92.305 92.316zm-969.24-46.164h923.07v923.07h-923.07zm992.32-92.305h-1061.5c-23.074 0-23.074 0-23.074 23.074v1061.5c0 23.074 0 23.074 23.074 23.074h1061.5c23.074 0 23.074 0 23.074-23.074l0.003906-1061.5c0-23.074 0-23.074-23.074-23.074zm-438.47 830.77h-369.23v-369.23h369.23zm69.238-461.55h-507.7c-23.074 0-23.074 0-23.074 23.074v507.7c0 23.074 0 23.074 23.074 23.074h507.7c23.074 0 23.074 0 23.074-23.074l0.003906-507.69c0-23.078 0-23.078-23.078-23.078zm115.38 276.93h-369.23v-369.23h369.23zm69.227-461.53h-507.7c-23.074 0-23.074 0-23.074 23.074v507.7c0 23.074 0 23.074 23.074 23.074h507.7c23.074 0 23.074 0 23.074-23.074v-507.7c0-23.074 0-23.074-23.074-23.074z" fill="currentColor"/></svg>
            <span class="btn-text">Grouping</span> <span class="caret"></span>
          </button>
          ${this._openMenu === 'grouping' ? html`
            <div role="menu" id="menu-grouping" aria-label="Grouping"
                 @keydown="${this.#onMenuKeyDown}">
              <button role="menuitem" tabindex="-1"
                      @click="${() => { this._openMenu = null; this.dispatchEvent(new GroupItemsEvent()); }}">
                <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14"><path d="m92.305 184.62c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.316-92.316-92.305-92.316-50.988 0-92.305 41.328-92.305 92.305 0 50.977 41.328 92.316 92.305 92.316zm0 1015.4c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.328-92.305-92.305-92.305-50.977 0-92.305 41.316-92.305 92.305 0 50.988 41.328 92.305 92.305 92.305zm1015.4 0c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.328-92.305-92.305-92.305-50.977 0-92.305 41.328-92.305 92.305 0 50.977 41.316 92.305 92.305 92.305zm0-1015.4c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.328-92.316-92.305-92.316-50.977 0-92.305 41.328-92.305 92.305 0 50.977 41.316 92.316 92.305 92.316zm-969.24-46.164h923.07v923.07h-923.07zm992.32-92.305h-1061.5c-23.074 0-23.074 0-23.074 23.074v1061.5c0 23.074 0 23.074 23.074 23.074h1061.5c23.074 0 23.074 0 23.074-23.074l0.003906-1061.5c0-23.074 0-23.074-23.074-23.074zm-438.47 830.77h-369.23v-369.23h369.23zm69.238-461.55h-507.7c-23.074 0-23.074 0-23.074 23.074v507.7c0 23.074 0 23.074 23.074 23.074h507.7c23.074 0 23.074 0 23.074-23.074l0.003906-507.69c0-23.078 0-23.078-23.078-23.078zm115.38 276.93h-369.23v-369.23h369.23zm69.227-461.53h-507.7c-23.074 0-23.074 0-23.074 23.074v507.7c0 23.074 0 23.074 23.074 23.074h507.7c23.074 0 23.074 0 23.074-23.074v-507.7c0-23.074 0-23.074-23.074-23.074z" fill="currentColor"/></svg>
                Group
              </button>
              ${hasGroup ? html`
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this._openMenu = null; this.dispatchEvent(new UngroupItemsEvent()); }}">
                  <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14"><path d="m369.23 184.62c46.152 0 92.305-46.152 92.305-92.305s-46.152-92.316-92.305-92.316c-46.152 0-92.305 46.152-92.305 92.305 0.003906 46.152 46.152 92.316 92.305 92.316zm0 738.45c46.152 0 92.305-46.152 92.305-92.305 0-46.152-46.152-92.305-92.305-92.305-46.152 0-92.305 46.152-92.305 92.305 0.003906 46.156 46.152 92.305 92.305 92.305zm738.47-738.45c46.152 0 92.305-46.152 92.305-92.305s-46.152-92.316-92.305-92.316c-46.152 0-92.305 46.152-92.305 92.305 0 46.152 46.152 92.316 92.305 92.316zm0 738.45c46.152 0 92.305-46.152 92.305-92.305 0-46.152-46.152-92.305-92.305-92.305-46.152 0-92.305 46.152-92.305 92.305 0 46.156 46.152 92.305 92.305 92.305zm-276.92-461.53c46.152 0 92.305-46.152 92.305-92.305 0-46.152-46.152-92.305-92.305-92.305-46.152 0-92.305 46.152-92.305 92.305 0 46.152 46.152 92.305 92.305 92.305zm0 738.46c46.152 0 92.305-46.152 92.305-92.305 0-46.152-46.152-92.305-92.305-92.305-46.152 0-92.305 46.152-92.305 92.305 0 46.152 46.152 92.305 92.305 92.305zm-738.47-738.46c46.152 0 92.305-46.152 92.305-92.305 0-46.152-46.152-92.305-92.305-92.305-46.152 0.003906-92.305 46.141-92.305 92.293 0 46.152 46.152 92.316 92.305 92.316zm0 738.46c46.152 0 92.305-46.152 92.305-92.305 0-46.152-46.152-92.305-92.305-92.305-46.152 0-92.305 46.152-92.305 92.305 0 46.152 46.152 92.305 92.305 92.305zm692.32-138.46h-646.16v-646.16h646.15v646.16zm69.227-738.47h-784.62c-23.074 0-23.074 0-23.074 23.074v784.62c0 23.074 0 23.074 23.074 23.074h784.62c23.074 0 23.074 0 23.074-23.074l0.003906-784.62c0-23.078 0-23.078-23.078-23.078zm207.7 461.55h-646.16v-646.16h646.15v646.16zm69.23-738.47h-784.62c-23.074 0-23.074 0-23.074 23.074v784.62c0 23.074 0 23.074 23.074 23.074h784.62c23.074 0 23.074 0 23.074-23.074v-784.62c0-23.074 0-23.074-23.074-23.074z" fill="currentColor"/></svg>
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
            <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14"><path d="m258 330h828v240h-828z" fill="currentColor"/><path d="m258 630h444v240h-444z" fill="currentColor"/><path d="m114 162h84v876h-84z" fill="currentColor"/></svg>
            <span class="btn-text">Align</span> <span class="caret"></span>
          </button>
          ${this._openMenu === 'align' ? html`
            <div role="menu" id="menu-align" aria-label="Align & Distribute"
                 @keydown="${this.#onMenuKeyDown}">
              <button role="menuitem" tabindex="-1"
                      @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('left')); }}">
                <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14"><path d="m258 330h828v240h-828z" fill="currentColor"/><path d="m258 630h444v240h-444z" fill="currentColor"/><path d="m114 162h84v876h-84z" fill="currentColor"/></svg>
                Align left
              </button>
              <button role="menuitem" tabindex="-1"
                      @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('center-h')); }}">
                <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14"><path d="m1014 570v-240h-372v-168h-84v168h-372v240h372v60h-180v240h180v168h84v-168h180v-240h-180v-60z" fill="currentColor"/></svg>
                Align center horizontal
              </button>
              <button role="menuitem" tabindex="-1"
                      @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('right')); }}">
                <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14"><path d="m114 330h828v240h-828z" fill="currentColor"/><path d="m498 630h444v240h-444z" fill="currentColor"/><path d="m1002 162h84v876h-84z" fill="currentColor"/></svg>
                Align right
              </button>
              <button role="menuitem" tabindex="-1"
                      @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('top')); }}">
                <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14"><path d="m630 258h240v828h-240z" fill="currentColor"/><path d="m330 258h240v444h-240z" fill="currentColor"/><path d="m162 114h876v84h-876z" fill="currentColor"/></svg>
                Align top
              </button>
              <button role="menuitem" tabindex="-1"
                      @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('center-v')); }}">
                <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14"><path d="m1038 558h-168v-372h-240v372h-60v-180h-240v180h-168v84h168v180h240v-180h60v372h240v-372h168z" fill="currentColor"/></svg>
                Align center vertical
              </button>
              <button role="menuitem" tabindex="-1"
                      @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('bottom')); }}">
                <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14"><path d="m630 114h240v828h-240z" fill="currentColor"/><path d="m330 498h240v444h-240z" fill="currentColor"/><path d="m162 1002h876v84h-876z" fill="currentColor"/></svg>
                Align bottom
              </button>
              ${count >= 3 ? html`
                <div class="sb-menu-separator" role="separator"></div>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('distribute-h')); }}">
                  <svg class="icon" viewBox="0 0 1600 1600" width="14" height="14"><path d="M264 216L264 1384L152 1384L152 216L264 216Z" fill="currentColor"/><path d="M1448 216L1448 1384L1336 1384L1336 216L1448 216Z" fill="currentColor"/><path d="M960 504L960 1096L640 1096L640 504L960 504Z" fill="currentColor"/></svg>
                  Distribute horizontal
                </button>
                <button role="menuitem" tabindex="-1"
                        @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('distribute-v')); }}">
                  <svg class="icon" viewBox="0 0 1600 1600" width="14" height="14"><path d="M216 1336H1384V1448H216V1336Z" fill="currentColor"/><path d="M216 152H1384V264H216V152Z" fill="currentColor"/><path d="M504 640H1096V960H504V640Z" fill="currentColor"/></svg>
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

  #toggleAutoNumber(enabled: boolean) {
    this.dispatchEvent(new AutoNumberToggleEvent(enabled));
  }

  #rotateItems() {
    this.dispatchEvent(new RotateItemsEvent(-45));
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
    const value = input.value.trim().slice(0, 3);
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

  #changeEquipmentColor(items: Equipment[], color: string) {
    this._openMenu = null;
    const ids = items.map(c => c.id);
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

  /* ── Sidebar context (Groups A–D) ─────────────────────────── */

  #onPanelTriggerClick(e: Event) {
    e.stopPropagation();
    if (this._openMenu === 'ctx-panel') {
      this._openMenu = null;
    } else {
      const btn = e.currentTarget as HTMLElement;
      const rect = btn.getBoundingClientRect();
      const BOTTOM_CLEARANCE = 76; // bottom bar (60px) + buffer
      const PANEL_ESTIMATE = 300;
      this.#panelFlipped = (window.innerHeight - rect.bottom - BOTTOM_CLEARANCE) < PANEL_ESTIMATE;
      this.#panelTop = this.#panelFlipped
        ? this.offsetHeight - btn.offsetTop  // used as CSS `bottom`
        : btn.offsetTop;
      this._openMenu = 'ctx-panel';
    }
  }

  #onCtxArrangeClick(menu: 'align' | 'grouping' | 'z-order', e: Event) {
    e.stopPropagation();
    if (this._openMenu === menu) {
      this._openMenu = null;
    } else {
      const btn = e.currentTarget as HTMLElement;
      const rect = btn.getBoundingClientRect();
      const BOTTOM_CLEARANCE = 76;
      const MENU_ESTIMATE = 320;
      this.#ctxMenuFlipped = (window.innerHeight - rect.bottom - BOTTOM_CLEARANCE) < MENU_ESTIMATE;
      this._openMenu = menu;
    }
  }

  #onPanelKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this._openMenu = null;
    }
  }

  #onDocKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && this._openMenu === 'ctx-panel') {
      e.stopPropagation();
      this._openMenu = null;
      this.shadowRoot?.querySelector<HTMLElement>('.ctx-trigger-btn')?.focus();
    }
  }

  #renderSidebarContext() {
    const selType = this.#selectionType;
    const hasGroupA = selType !== 'none' && selType !== 'mixed';
    const isPanelOpen = this._openMenu === 'ctx-panel';
    const hasControlsAboveDelete = hasGroupA || this.#hasRotatable || this.selectedItems.length >= 1;

    return html`
      ${hasGroupA ? html`
        <div class="ctx-dd-wrap">
          <button class="ctx-trigger-btn has-submenu"
                  aria-label="Edit style"
                  aria-pressed="${isPanelOpen}"
                  title="Edit style"
                  @click="${this.#onPanelTriggerClick}">
            ${this.#renderPanelTriggerIcon(selType)}
          </button>
        </div>
        ${isPanelOpen ? this.#renderContextPanel(selType) : nothing}
      ` : nothing}

      ${this.#hasRotatable ? html`
        <button class="ctx-icon-btn" title="Rotate counter-clockwise (,)" aria-label="Rotate counter-clockwise (,)"
                @click="${this.#rotateItems}">
          <svg viewBox="0 0 1600 1600" width="20" height="20" fill="currentColor">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M499.473 830.5C538.018 830.5 569.473 861.954 569.473 900.5C569.473 939.046 538.018 970.5 499.473 970.5H355.517L485.928 1117.21L485.934 1117.22C531.557 1168.59 587.248 1209.41 650.205 1237.76L653.157 1239.08C715.222 1266.54 781.403 1280.5 849.5 1280.5C1036.65 1280.5 1208.05 1170.07 1285.8 1000.18L1285.84 1000.09L1285.88 1000C1301.95 965.785 1343.64 949.635 1378.85 965.83C1413.61 981.822 1429.87 1023.53 1413.68 1058.8L1413.68 1058.81C1313.41 1278.47 1091.79 1420.5 849.986 1420.5C761.159 1420.5 674.349 1401.9 593.251 1365.22L593.248 1365.22C512.236 1328.57 440.953 1276.4 381.577 1209.8L381.564 1209.78L381.552 1209.77L270 1084.15V1200C270 1233.51 246.227 1261.66 214.69 1268.44L213.613 1271.49H199.473C160.927 1271.49 129.473 1240.04 129.473 1201.49V900C129.473 892.225 132.464 883.57 132.569 883.149L132.899 881.832L133.21 881.057C133.243 880.906 133.293 880.671 133.361 880.328C133.565 879.311 134.117 876.288 135.403 873.072L135.734 872.279C136.521 870.474 137.395 868.981 138.101 867.874C138.911 866.603 139.724 865.498 140.285 864.75C141.08 863.69 141.136 863.638 141.604 863.004C141.907 862.593 141.92 862.548 141.823 862.71L142.067 862.302L142.332 861.906C143.925 859.516 146.516 855.537 149.972 851.777L150.035 851.652L157.188 844.5H158.75C159.582 844.025 160.281 843.672 160.778 843.424C161.395 843.115 161.624 843.005 161.755 842.942L161.879 842.859C163.278 841.927 168.358 838.076 174.095 835.617L175.26 835.118L176.479 834.77C181.066 833.459 185.503 832.796 188.753 832.331C188.995 832.262 189.18 832.208 189.502 832.113C189.786 832.03 190.189 831.912 190.62 831.792C192.352 831.311 195.526 830.5 199.473 830.5H499.473Z"/>
            <path fill-rule="evenodd" clip-rule="evenodd" d="M750.02 179.5C837.459 179.5 922.944 197.523 1002.95 233.071L1006.75 234.777L1006.76 234.778C1086.5 270.856 1156.82 321.968 1215.64 387.087L1218.43 390.198L1218.44 390.213L1218.45 390.227L1330.01 515.85V400C1330.01 361.454 1361.46 330 1400.01 330C1438.56 330 1470.01 361.454 1470.01 400V701.493C1470.01 705.886 1469.19 709.716 1468.54 712.344C1468.21 713.675 1467.84 714.957 1467.58 715.908C1467.28 716.956 1467.08 717.675 1466.91 718.344L1466.38 720.474L1466.09 721.044C1465.98 721.613 1465.76 722.749 1465.45 723.927C1465.18 724.929 1464.76 726.357 1464.07 727.971C1461.67 734.355 1457.61 739.129 1456.13 740.987C1455.76 741.444 1455.65 741.669 1454.22 743.76C1453.31 745.092 1451.92 747.087 1450.02 749.193L1449.43 750.366L1446.87 752.418L1442.79 756.493H1441.15C1438.75 757.968 1436.49 759.114 1434.84 759.939C1434.59 760.116 1434.22 760.387 1433.09 761.161C1431.61 762.183 1429.2 763.759 1425.94 765.062L1425.39 765.281L1424.83 765.467C1417.96 767.758 1409.62 769.993 1400.01 769.993H1100.01C1061.46 769.993 1030.01 738.539 1030.01 699.993C1030.01 661.448 1061.46 629.993 1100.01 629.993H1243.96L1113.55 483.28L1113.54 483.273C1067.93 431.902 1012.23 391.081 949.274 362.729C886.358 334.395 819.158 319.993 749.979 319.993C562.837 319.993 391.425 430.427 313.673 600.316L313.633 600.403L313.592 600.491C297.531 634.708 255.836 650.858 220.629 634.663C185.422 618.468 169.272 576.773 185.467 541.566C285.757 321.938 507.362 179.5 750.02 179.5Z"/>
          </svg>
        </button>
      ` : nothing}

      ${this.selectedItems.length >= 1 ? html`
        ${hasGroupA || this.#hasRotatable ? html`<hr class="ctx-sep" />` : nothing}
        ${this.#renderSidebarArrangement()}
      ` : nothing}

      ${selType !== 'none' ? html`
        ${hasControlsAboveDelete ? html`<hr class="ctx-sep" />` : nothing}
        <button class="ctx-icon-btn danger"
                title="Delete item${this.selectedItems.length > 1 ? 's' : ''} (Del)"
                aria-label="Delete item${this.selectedItems.length > 1 ? 's' : ''} (Del)"
                @click="${this.#requestDelete}">
          <svg viewBox="0 0 16 16" width="18" height="18">
            <path d="M5 2V1h6v1h4v2H1V2h4zm1 4v7h1V6H6zm3 0v7h1V6H9zM2 5l1 10h10l1-10H2z" fill="currentColor"/>
          </svg>
        </button>
      ` : nothing}

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

  #renderPanelTriggerIcon(selType: SelectionType) {
    if (selType === 'single-player' || selType === 'players') {
      const p = this.#singlePlayer ?? this.#selectedPlayers[0];
      if (!p) return html`<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="6" fill="${this.fieldTheme === 'white' ? '#3b82f6' : '#60a5fa'}"/></svg>`;
      return p.team === 'a'
        ? html`<svg viewBox="0 0 16 16" width="20" height="20"><polygon points="8,2 14,14 2,14" fill="${p.color}" stroke="white" stroke-width="0.8"/></svg>`
        : html`<span class="color-swatch" style="background:${p.color};width:18px;height:18px;border-radius:50%;border:1px solid white;display:inline-block;"></span>`;
    }
    if (selType === 'single-cone' || selType === 'cones') {
      const ref = this.#selectedCones[0];
      const c = ref?.color ?? '#ff7700';
      return html`<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="5" fill="none" stroke="${c}" stroke-width="3.5"/><circle cx="8" cy="8" r="2" fill="#d0d0d0"/></svg>`;
    }
    if (selType === 'single-dummy' || selType === 'dummies') {
      const ref = this.#selectedDummies[0];
      const c = ref?.color ?? '#a3e635';
      return html`<svg viewBox="0 0 16 16" width="20" height="20"><rect x="4.5" y="1.5" width="7" height="13" rx="3.5" fill="none" stroke="${c}" stroke-width="1.8"/></svg>`;
    }
    if (selType === 'single-pole' || selType === 'poles') {
      const ref = this.#selectedPoles[0];
      const c = ref?.color ?? '#a3e635';
      return html`<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="#d0d0d0" stroke-width="1.5"/><circle cx="8" cy="8" r="3" fill="${c}"/></svg>`;
    }
    if (selType === 'lines') {
      const ref = this.#selectedLines[0];
      const s = ref?.style ?? 'solid';
      return svg`<svg viewBox="0 0 22 12" width="20" height="12">
        ${s === 'wavy'
          ? svg`<path d="M 2,6 Q 4.5,2 7,6 Q 9.5,10 12,6 Q 13,4 14,5" fill="none" stroke="currentColor" stroke-width="2"/>`
          : svg`<line x1="2" y1="6" x2="13" y2="6" stroke="currentColor" stroke-width="2" stroke-dasharray="${s === 'dashed' ? '3,2' : 'none'}"/>`}
        <polygon points="13,1 21,6 13,11" fill="currentColor"/>
      </svg>`;
    }
    if (selType === 'shapes') {
      const ref = this.#selectedShapes[0];
      const s = ref?.style ?? 'outline';
      if (s === 'outline') return html`<span style="display:inline-block;width:14px;height:10px;border:2px solid currentColor;border-radius:1px;"></span>`;
      if (s === 'dashed') return html`<span style="display:inline-block;width:14px;height:10px;border:2px dashed currentColor;border-radius:1px;"></span>`;
      return html`<span style="display:inline-block;width:14px;height:10px;background:${s === 'fill-blue' ? '#60a5fa' : s === 'fill-red' ? '#f87171' : '#facc15'};border-radius:1px;opacity:0.7;"></span>`;
    }
    if (selType === 'single-text' || selType === 'texts') {
      return html`<svg viewBox="280 280 680 680" width="18" height="18" fill="currentColor"><path d="m312 348h168v504h-96v72h264v-72h-96v-504h168v72h72v-108c0-9.5469-3.793-18.703-10.543-25.457-6.7539-6.75-15.91-10.543-25.457-10.543h-480c-9.5469 0-18.703 3.793-25.457 10.543-6.75 6.7539-10.543 15.91-10.543 25.457v108h72z"/><path d="m780 528v96h-96v72h96v120c0 28.645 11.379 56.113 31.633 76.367 20.254 20.254 47.723 31.633 76.367 31.633h72v-72h-72c-9.5469 0-18.703-3.793-25.457-10.543-6.75-6.7539-10.543-15.91-10.543-25.457v-120h96v-72h-96v-96z"/></svg>`;
    }
    return html`<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
  }

  #renderContextPanel(selType: SelectionType) {
    const title = selType.includes('player') ? 'Player'
      : selType.includes('cone') ? 'Cone'
      : selType.includes('dummy') ? 'Dummy'
      : selType.includes('pole') ? 'Pole'
      : selType === 'lines' ? 'Line'
      : selType === 'shapes' ? 'Shape'
      : selType.includes('text') ? 'Text'
      : 'Style';
    return html`
      <div class="ctx-panel"
           role="dialog"
           aria-label="${title} style options"
           aria-modal="false"
           style="${this.#panelFlipped ? `bottom:${this.#panelTop}px` : `top:${this.#panelTop}px`}"
           @pointerdown="${(e: Event) => e.stopPropagation()}"
           @keydown="${this.#onPanelKeyDown}">
        <div class="ctx-panel-header">
          <span class="ctx-panel-title">${title}</span>
          <button class="ctx-panel-close" aria-label="Close panel" title="Close"
                  @click="${() => { this._openMenu = null; }}">
            <svg viewBox="0 0 16 16" width="12" height="12">
              <path d="M4,4 L12,12 M12,4 L4,12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="ctx-panel-body">
          ${selType === 'single-player' ? this.#renderPanelSinglePlayer()
            : selType === 'players' ? this.#renderPanelMultiPlayer()
            : selType === 'single-cone' || selType === 'cones' ? this.#renderPanelEquipmentColor('cone', this.#selectedCones)
            : selType === 'single-dummy' || selType === 'dummies' ? this.#renderPanelEquipmentColor('dummy', this.#selectedDummies)
            : selType === 'single-pole' || selType === 'poles' ? this.#renderPanelEquipmentColor('pole', this.#selectedPoles)
            : selType === 'lines' ? this.#renderPanelLine()
            : selType === 'shapes' ? this.#renderPanelShape()
            : selType === 'single-text' || selType === 'texts' ? this.#renderPanelText()
            : nothing}
        </div>
      </div>
    `;
  }

  #renderPanelSinglePlayer() {
    const p = this.#singlePlayer!;
    return html`
      <div class="ctx-row">
        <label class="ctx-label" for="panel-player-num">#</label>
        <input id="panel-player-num"
               class="ctx-number-input"
               type="text"
               maxlength="3"
               aria-label="Player number"
               .value="${p.label ?? ''}"
               @blur="${this.#onNumberBlur}"
               @keydown="${this.#onNumberKeyDown}"
               @pointerdown="${(e: Event) => e.stopPropagation()}" />
      </div>
      <hr class="ctx-panel-divider" />
      <fieldset class="ctx-fieldset">
        <legend>Color</legend>
        <div class="ctx-color-grid">
          ${getPlayerColors(this.fieldTheme).map(c => html`
            <button class="ctx-swatch-btn"
                    aria-label="${c.name}"
                    aria-pressed="${p.color === c.color}"
                    title="${c.name}"
                    @click="${() => this.#changeColor(c.color)}">
              ${p.team === 'a'
                ? html`<svg viewBox="0 0 20 20" width="20" height="20"><polygon points="10,2 18,18 2,18" fill="${c.color}" stroke="white" stroke-width="1" stroke-linejoin="round"/></svg>`
                : p.team === 'neutral'
                ? html`<svg viewBox="0 0 20 20" width="20" height="20"><rect x="3" y="3" width="14" height="14" rx="1" fill="${c.color}" stroke="white" stroke-width="1" transform="rotate(45 10 10)"/></svg>`
                : html`<span class="color-swatch" style="background:${c.color};width:20px;height:20px;"></span>`}
            </button>
          `)}
        </div>
      </fieldset>
    `;
  }

  #renderPanelMultiPlayer() {
    const players = this.#selectedPlayers;
    const ref = players[0];
    return html`
      <fieldset class="ctx-fieldset">
        <legend>Color</legend>
        <div class="ctx-color-grid">
          ${getPlayerColors(this.fieldTheme).map(c => html`
            <button class="ctx-swatch-btn"
                    aria-label="${c.name}"
                    aria-pressed="${ref.color === c.color}"
                    title="${c.name}"
                    @click="${() => this.#changeColor(c.color)}">
              ${ref.team === 'a'
                ? html`<svg viewBox="0 0 20 20" width="20" height="20"><polygon points="10,2 18,18 2,18" fill="${c.color}" stroke="white" stroke-width="1"/></svg>`
                : html`<span class="color-swatch" style="background:${c.color};width:20px;height:20px;"></span>`}
            </button>
          `)}
        </div>
      </fieldset>
    `;
  }

  #renderPanelEquipmentColor(kind: 'cone' | 'dummy' | 'pole', items: Equipment[]) {
    const ref = items[0];
    const colors = getConeColors(this.fieldTheme);
    // Default: cone → Neon Orange (index 1), others → chartreuse (index 0)
    const defaultColor = kind === 'cone' ? colors[1]?.color ?? colors[0]?.color : colors[0]?.color ?? '#a3e635';
    return html`
      <fieldset class="ctx-fieldset">
        <legend>Color</legend>
        <div class="ctx-color-grid ctx-color-grid--2col">
          ${colors.map(c => html`
            <button class="ctx-swatch-btn"
                    aria-label="${c.name}"
                    aria-pressed="${(ref.color ?? defaultColor) === c.color}"
                    title="${c.name}"
                    @click="${() => this.#changeEquipmentColor(items, c.color)}">
              <svg viewBox="0 0 20 20" width="20" height="20">
                ${kind === 'pole' ? svg`
                  <circle cx="10" cy="10" r="7" fill="none" stroke="#d0d0d0" stroke-width="1.8"/>
                  <circle cx="10" cy="10" r="4" fill="${c.color}"/>
                ` : kind === 'cone' ? svg`
                  <circle cx="10" cy="10" r="6.5" fill="none" stroke="${c.color}" stroke-width="4.5"/>
                  <circle cx="10" cy="10" r="2.5" fill="#d0d0d0"/>
                ` : svg`
                  <circle cx="10" cy="10" r="7" fill="none" stroke="${c.color}" stroke-width="2"/>
                  <circle cx="10" cy="10" r="4" fill="${c.color}" fill-opacity="0.6"/>
                `}
              </svg>
            </button>
          `)}
        </div>
      </fieldset>
    `;
  }

  #renderPanelLine() {
    const lines = this.#selectedLines;
    const ref = lines[0];
    const ids = lines.map(l => l.id);
    return html`
      <fieldset class="ctx-fieldset">
        <legend>Type</legend>
        <div class="ctx-line-controls">
          <button class="ctx-line-btn" title="Arrow on start" aria-pressed="${ref.arrowStart}"
                  aria-label="Arrow on start"
                  @click="${() => this.dispatchEvent(new LineUpdateEvent(ids, { arrowStart: !ref.arrowStart }))}">
            <svg viewBox="0 0 20 12" width="20" height="12">
              <line x1="8" y1="6" x2="18" y2="6" stroke="currentColor" stroke-width="2"/>
              <polygon points="8,3 2,6 8,9" fill="currentColor"/>
            </svg>
          </button>
          <select class="ctx-select" aria-label="Line style"
                  @change="${(e: Event) => this.dispatchEvent(new LineUpdateEvent(ids, { style: (e.target as HTMLSelectElement).value as LineStyle }))}">
            ${LINE_STYLES.map(s => html`
              <option value="${s.value}" ?selected="${ref.style === s.value}">${s.symbol}  ${s.label}</option>
            `)}
          </select>
          <button class="ctx-line-btn" title="Arrow on end" aria-pressed="${ref.arrowEnd}"
                  aria-label="Arrow on end"
                  @click="${() => this.dispatchEvent(new LineUpdateEvent(ids, { arrowEnd: !ref.arrowEnd }))}">
            <svg viewBox="0 0 20 12" width="20" height="12">
              <line x1="2" y1="6" x2="12" y2="6" stroke="currentColor" stroke-width="2"/>
              <polygon points="12,3 18,6 12,9" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </fieldset>
      <hr class="ctx-panel-divider" />
      <fieldset class="ctx-fieldset">
        <legend>Color</legend>
        <div class="ctx-color-grid">
          ${getLineColors(this.fieldTheme).map(c => html`
            <button class="ctx-swatch-btn"
                    aria-label="${c.name}"
                    aria-pressed="${ref.color === c.color}"
                    title="${c.name}"
                    @click="${() => this.#changeLineColor(c.color)}">
              <span class="color-swatch" style="background:${c.color};width:16px;height:16px;"></span>
            </button>
          `)}
        </div>
      </fieldset>
    `;
  }

  #renderPanelShape() {
    const shapes = this.#selectedShapes;
    const ref = shapes[0];
    return html`
      <fieldset class="ctx-fieldset">
        <legend>Style</legend>
        <div class="ctx-color-grid">
          ${getShapeStyles(this.fieldTheme).map(s => html`
            <button class="ctx-swatch-btn"
                    aria-label="${s.name}"
                    aria-pressed="${ref.style === s.value}"
                    title="${s.name}"
                    @click="${() => this.#changeShapeStyle(s.value)}">
              ${s.value === 'outline'
                ? html`<span style="display:inline-block;width:18px;height:14px;border:2px solid currentColor;border-radius:1px;"></span>`
                : s.value === 'dashed'
                ? html`<span style="display:inline-block;width:18px;height:14px;border:2px dashed currentColor;border-radius:1px;"></span>`
                : html`<span style="display:inline-block;width:18px;height:14px;background:${s.fill};border-radius:1px;opacity:0.7;"></span>`}
            </button>
          `)}
        </div>
      </fieldset>
    `;
  }

  #renderPanelText() {
    const texts = this.#selectedTexts;
    const ref = texts[0];
    const currentSize = ref?.fontSize ?? 2;
    const ids = texts.map(t => t.id);
    return html`
      ${texts.length === 1 ? html`
        <div class="ctx-row">
          <input class="ctx-panel-input"
                 type="text"
                 aria-label="Text content"
                 .value="${ref.text}"
                 @blur="${this.#onTextBlur}"
                 @keydown="${this.#onTextKeyDown}"
                 @pointerdown="${(e: Event) => e.stopPropagation()}" />
          <button class="save-btn icon-btn" title="Save text" aria-label="Save text" @click="${this.#onTextSave}">
            <svg viewBox="0 0 1200 1200" width="16" height="16" fill="currentColor">
              <path d="m112.5 200v800c0.027344 36.461 14.523 71.418 40.301 97.199 25.781 25.777 60.738 40.273 97.199 40.301h700c36.461-0.027344 71.418-14.523 97.199-40.301 25.777-25.781 40.273-60.738 40.301-97.199v-615c0.027344-31.207-10.551-61.496-30-85.898l-148.05-185c-26.07-32.719-65.664-51.723-107.5-51.602h-551.95c-36.461 0.027344-71.418 14.523-97.199 40.301-25.777 25.781-40.273 60.738-40.301 97.199zm225 862.5v-362.5c0-6.9023 5.5977-12.5 12.5-12.5h500c3.3164 0 6.4961 1.3164 8.8398 3.6602s3.6602 5.5234 3.6602 8.8398v362.5zm375-925v112.5c0 3.3164-1.3164 6.4961-3.6602 8.8398s-5.5234 3.6602-8.8398 3.6602h-300c-6.9023 0-12.5-5.5977-12.5-12.5v-112.5zm-525 62.5c0.027344-16.566 6.6211-32.449 18.336-44.164 11.715-11.715 27.598-18.309 44.164-18.336h62.5v112.5c0.027344 23.199 9.2539 45.438 25.656 61.844 16.406 16.402 38.645 25.629 61.844 25.656h300c23.199-0.027344 45.438-9.2539 61.844-25.656 16.402-16.406 25.629-38.645 25.656-61.844v-112.5h62.5c16.566 0.027344 32.449 6.6211 44.164 18.336 11.715 11.715 18.309 27.598 18.336 44.164v612.5l148.05 185h-748.15z"/>
            </svg>
          </button>
        </div>
        <hr class="ctx-panel-divider" />
      ` : nothing}
      <div class="ctx-row">
        <label class="ctx-label" for="ctx-font-size">Size</label>
        <select id="ctx-font-size"
                class="ctx-font-select"
                aria-label="Font size"
                @change="${(e: Event) => this.#changeTextSize(ids, Number((e.target as HTMLSelectElement).value))}">
          ${TEXT_SIZES.map(s => html`
            <option value="${s.value}" ?selected="${currentSize === s.value}">${s.label}</option>
          `)}
        </select>
      </div>
    `;
  }

  #renderSidebarArrangement() {
    const count = this.selectedItems.length;
    const hasGroup = this.selectedItems.some(i => 'groupId' in i && (i as unknown as Record<string, unknown>).groupId);
    return html`
      ${count >= 2 ? html`
      <div class="${this.#ctxMenuFlipped ? 'ctx-dd-wrap flipped' : 'ctx-dd-wrap'}">
        <button class="ctx-icon-btn has-submenu" title="Grouping" aria-label="Grouping"
                aria-haspopup="menu"
                aria-expanded="${this._openMenu === 'grouping'}"
                @click="${(e: Event) => this.#onCtxArrangeClick('grouping', e)}">
          <svg class="icon" viewBox="0 0 1200 1200" width="20" height="20">
            <path d="m92.305 184.62c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.316-92.316-92.305-92.316-50.988 0-92.305 41.328-92.305 92.305 0 50.977 41.328 92.316 92.305 92.316zm0 1015.4c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.328-92.305-92.305-92.305-50.977 0-92.305 41.316-92.305 92.305 0 50.988 41.328 92.305 92.305 92.305zm1015.4 0c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.328-92.305-92.305-92.305-50.977 0-92.305 41.328-92.305 92.305 0 50.977 41.316 92.305 92.305 92.305zm0-1015.4c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.328-92.316-92.305-92.316-50.977 0-92.305 41.328-92.305 92.305 0 50.977 41.316 92.316 92.305 92.316zm-969.24-46.164h923.07v923.07h-923.07zm992.32-92.305h-1061.5c-23.074 0-23.074 0-23.074 23.074v1061.5c0 23.074 0 23.074 23.074 23.074h1061.5c23.074 0 23.074 0 23.074-23.074l0.003906-1061.5c0-23.074 0-23.074-23.074-23.074zm-438.47 830.77h-369.23v-369.23h369.23zm69.238-461.55h-507.7c-23.074 0-23.074 0-23.074 23.074v507.7c0 23.074 0 23.074 23.074 23.074h507.7c23.074 0 23.074 0 23.074-23.074l0.003906-507.69c0-23.078 0-23.078-23.078-23.078zm115.38 276.93h-369.23v-369.23h369.23zm69.227-461.53h-507.7c-23.074 0-23.074 0-23.074 23.074v507.7c0 23.074 0 23.074 23.074 23.074h507.7c23.074 0 23.074 0 23.074-23.074v-507.7c0-23.074 0-23.074-23.074-23.074z" fill="currentColor"/>
          </svg>
        </button>
        ${this._openMenu === 'grouping' ? html`
          <div role="menu" id="menu-ctx-grouping" aria-label="Grouping"
               @keydown="${this.#onMenuKeyDown}">
            <button role="menuitem" tabindex="-1"
                    @click="${() => { this._openMenu = null; this.dispatchEvent(new GroupItemsEvent()); }}">
              <svg class="icon" viewBox="0 0 1200 1200" width="17" height="17"><path d="m92.305 184.62c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.316-92.316-92.305-92.316-50.988 0-92.305 41.328-92.305 92.305 0 50.977 41.328 92.316 92.305 92.316zm0 1015.4c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.328-92.305-92.305-92.305-50.977 0-92.305 41.316-92.305 92.305 0 50.988 41.328 92.305 92.305 92.305zm1015.4 0c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.328-92.305-92.305-92.305-50.977 0-92.305 41.328-92.305 92.305 0 50.977 41.316 92.305 92.305 92.305zm0-1015.4c50.977 0 92.305-41.328 92.305-92.305 0-50.977-41.328-92.316-92.305-92.316-50.977 0-92.305 41.328-92.305 92.305 0 50.977 41.316 92.316 92.305 92.316zm-969.24-46.164h923.07v923.07h-923.07zm992.32-92.305h-1061.5c-23.074 0-23.074 0-23.074 23.074v1061.5c0 23.074 0 23.074 23.074 23.074h1061.5c23.074 0 23.074 0 23.074-23.074l0.003906-1061.5c0-23.074 0-23.074-23.074-23.074zm-438.47 830.77h-369.23v-369.23h369.23zm69.238-461.55h-507.7c-23.074 0-23.074 0-23.074 23.074v507.7c0 23.074 0 23.074 23.074 23.074h507.7c23.074 0 23.074 0 23.074-23.074l0.003906-507.69c0-23.078 0-23.078-23.078-23.078zm115.38 276.93h-369.23v-369.23h369.23zm69.227-461.53h-507.7c-23.074 0-23.074 0-23.074 23.074v507.7c0 23.074 0 23.074 23.074 23.074h507.7c23.074 0 23.074 0 23.074-23.074v-507.7c0-23.074 0-23.074-23.074-23.074z" fill="currentColor"/></svg>
              Group <span class="tool-shortcut-hint">(⌘G)</span>
            </button>
            ${hasGroup ? html`
              <button role="menuitem" tabindex="-1"
                      @click="${() => { this._openMenu = null; this.dispatchEvent(new UngroupItemsEvent()); }}">
                <svg class="icon" viewBox="0 0 1200 1200" width="17" height="17"><path d="m369.23 184.62c46.152 0 92.305-46.152 92.305-92.305s-46.152-92.316-92.305-92.316c-46.152 0-92.305 46.152-92.305 92.305 0.003906 46.152 46.152 92.316 92.305 92.316zm0 738.45c46.152 0 92.305-46.152 92.305-92.305 0-46.152-46.152-92.305-92.305-92.305-46.152 0-92.305 46.152-92.305 92.305 0.003906 46.156 46.152 92.305 92.305 92.305zm738.47-738.45c46.152 0 92.305-46.152 92.305-92.305s-46.152-92.316-92.305-92.316c-46.152 0-92.305 46.152-92.305 92.305 0 46.152 46.152 92.316 92.305 92.316zm0 738.45c46.152 0 92.305-46.152 92.305-92.305 0-46.152-46.152-92.305-92.305-92.305-46.152 0-92.305 46.152-92.305 92.305 0 46.156 46.152 92.305 92.305 92.305zm-276.92-461.53c46.152 0 92.305-46.152 92.305-92.305 0-46.152-46.152-92.305-92.305-92.305-46.152 0-92.305 46.152-92.305 92.305 0 46.152 46.152 92.305 92.305 92.305zm0 738.46c46.152 0 92.305-46.152 92.305-92.305 0-46.152-46.152-92.305-92.305-92.305-46.152 0-92.305 46.152-92.305 92.305 0 46.152 46.152 92.305 92.305 92.305zm-738.47-738.46c46.152 0 92.305-46.152 92.305-92.305 0-46.152-46.152-92.305-92.305-92.305-46.152 0.003906-92.305 46.141-92.305 92.293 0 46.152 46.152 92.316 92.305 92.316zm0 738.46c46.152 0 92.305-46.152 92.305-92.305 0-46.152-46.152-92.305-92.305-92.305-46.152 0-92.305 46.152-92.305 92.305 0 46.152 46.152 92.305 92.305 92.305zm692.32-138.46h-646.16v-646.16h646.15v646.16zm69.227-738.47h-784.62c-23.074 0-23.074 0-23.074 23.074v784.62c0 23.074 0 23.074 23.074 23.074h784.62c23.074 0 23.074 0 23.074-23.074l0.003906-784.62c0-23.078 0-23.078-23.078-23.078zm207.7 461.55h-646.16v-646.16h646.15v646.16zm69.23-738.47h-784.62c-23.074 0-23.074 0-23.074 23.074v784.62c0 23.074 0 23.074 23.074 23.074h784.62c23.074 0 23.074 0 23.074-23.074v-784.62c0-23.074 0-23.074-23.074-23.074z" fill="currentColor"/></svg>
                Ungroup <span class="tool-shortcut-hint">(⌘⇧G)</span>
              </button>
            ` : nothing}
          </div>
        ` : nothing}
      </div>
      <div class="${this.#ctxMenuFlipped ? 'ctx-dd-wrap flipped' : 'ctx-dd-wrap'}">
        <button class="ctx-icon-btn has-submenu" title="Align" aria-label="Align"
                aria-haspopup="menu"
                aria-expanded="${this._openMenu === 'align'}"
                @click="${(e: Event) => this.#onCtxArrangeClick('align', e)}">
          <svg class="icon" viewBox="0 0 1200 1200" width="20" height="20">
            <path d="m258 330h828v240h-828z" fill="currentColor"/>
            <path d="m258 630h444v240h-444z" fill="currentColor"/>
            <path d="m114 162h84v876h-84z" fill="currentColor"/>
          </svg>
        </button>
        ${this._openMenu === 'align' ? html`
          <div role="menu" id="menu-ctx-align" aria-label="Align & Distribute"
               @keydown="${this.#onMenuKeyDown}">
            <button role="menuitem" tabindex="-1"
                    @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('left')); }}">
              <svg class="icon" viewBox="0 0 1200 1200" width="17" height="17"><path d="m258 330h828v240h-828z" fill="currentColor"/><path d="m258 630h444v240h-444z" fill="currentColor"/><path d="m114 162h84v876h-84z" fill="currentColor"/></svg>
              Align left
            </button>
            <button role="menuitem" tabindex="-1"
                    @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('center-h')); }}">
              <svg class="icon" viewBox="0 0 1200 1200" width="17" height="17"><path d="m1014 570v-240h-372v-168h-84v168h-372v240h372v60h-180v240h180v168h84v-168h180v-240h-180v-60z" fill="currentColor"/></svg>
              Align center horizontal
            </button>
            <button role="menuitem" tabindex="-1"
                    @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('right')); }}">
              <svg class="icon" viewBox="0 0 1200 1200" width="17" height="17"><path d="m114 330h828v240h-828z" fill="currentColor"/><path d="m498 630h444v240h-444z" fill="currentColor"/><path d="m1002 162h84v876h-84z" fill="currentColor"/></svg>
              Align right
            </button>
            <button role="menuitem" tabindex="-1"
                    @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('top')); }}">
              <svg class="icon" viewBox="0 0 1200 1200" width="17" height="17"><path d="m630 258h240v828h-240z" fill="currentColor"/><path d="m330 258h240v444h-240z" fill="currentColor"/><path d="m162 114h876v84h-876z" fill="currentColor"/></svg>
              Align top
            </button>
            <button role="menuitem" tabindex="-1"
                    @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('center-v')); }}">
              <svg class="icon" viewBox="0 0 1200 1200" width="17" height="17"><path d="m1038 558h-168v-372h-240v372h-60v-180h-240v180h-168v84h168v180h240v-180h60v372h240v-372h168z" fill="currentColor"/></svg>
              Align center vertical
            </button>
            <button role="menuitem" tabindex="-1"
                    @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('bottom')); }}">
              <svg class="icon" viewBox="0 0 1200 1200" width="17" height="17"><path d="m630 114h240v828h-240z" fill="currentColor"/><path d="m330 498h240v444h-240z" fill="currentColor"/><path d="m162 1002h876v84h-876z" fill="currentColor"/></svg>
              Align bottom
            </button>
            ${count >= 3 ? html`
              <div class="sb-menu-separator" role="separator"></div>
              <button role="menuitem" tabindex="-1"
                      @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('distribute-h')); }}">
                <svg class="icon" viewBox="0 0 1600 1600" width="17" height="17"><path d="M264 216L264 1384L152 1384L152 216L264 216Z" fill="currentColor"/><path d="M1448 216L1448 1384L1336 1384L1336 216L1448 216Z" fill="currentColor"/><path d="M960 504L960 1096L640 1096L640 504L960 504Z" fill="currentColor"/></svg>
                Distribute horizontal
              </button>
              <button role="menuitem" tabindex="-1"
                      @click="${() => { this._openMenu = null; this.dispatchEvent(new AlignItemsEvent('distribute-v')); }}">
                <svg class="icon" viewBox="0 0 1600 1600" width="17" height="17"><path d="M216 1336H1384V1448H216V1336Z" fill="currentColor"/><path d="M216 152H1384V264H216V152Z" fill="currentColor"/><path d="M504 640H1096V960H504V640Z" fill="currentColor"/></svg>
                Distribute vertical
              </button>
            ` : nothing}
          </div>
        ` : nothing}
      </div>
      ` : nothing}
      <div class="${this.#ctxMenuFlipped ? 'ctx-dd-wrap flipped' : 'ctx-dd-wrap'}">
        <button class="ctx-icon-btn has-submenu" title="Z-order" aria-label="Z-order"
                aria-haspopup="menu"
                aria-expanded="${this._openMenu === 'z-order'}"
                @click="${(e: Event) => this.#onCtxArrangeClick('z-order', e)}">
          <svg class="icon" viewBox="0 0 1200 1200" width="20" height="20" fill="currentColor">
            <path d="m939.85 639.97-97.859 65.398 165.53 96.852-407.52 271.68-407.52-271.68 165.53-96.852-97.859-65.398-235.71 144.13c-29.184 17.855-28.176 19.117 0 36.227l548.4 366.28c27.168 17.855 27.168 17.855 54.336 0l548.4-366.28c28.176-17.113 29.184-18.359 0-36.227zm-312.68-627.14c-27.168-17.102-27.168-17.102-54.336 0l-548.4 366.28c-28.176 17.113-28.176 18.863 0 36.227l548.4 366.28c27.168 17.102 27.168 17.102 54.336 0l548.4-366.28c27.422-18.109 27.168-18.109 0-36.227z"/>
          </svg>
        </button>
        ${this._openMenu === 'z-order' ? html`
          <div role="menu" id="menu-ctx-z-order" aria-label="Z-order"
               @keydown="${this.#onMenuKeyDown}">
            <button role="menuitem" tabindex="-1"
                    @click="${() => { this._openMenu = null; this.dispatchEvent(new ZOrderEvent('front')); }}">
              <svg class="icon" viewBox="0 0 1200 1200" width="17" height="17" fill="currentColor">
                <path d="m939.85 639.97-97.859 65.398 165.53 96.852-407.52 271.68-407.52-271.68 165.53-96.852-97.859-65.398-235.71 144.13c-29.184 17.855-28.176 19.117 0 36.227l548.4 366.28c27.168 17.855 27.168 17.855 54.336 0l548.4-366.28c28.176-17.113 29.184-18.359 0-36.227zm-312.68-627.14c-27.168-17.102-27.168-17.102-54.336 0l-548.4 366.28c-28.176 17.113-28.176 18.863 0 36.227l548.4 366.28c27.168 17.102 27.168 17.102 54.336 0l548.4-366.28c27.422-18.109 27.168-18.109 0-36.227z"/>
              </svg>
              Bring to front <span class="tool-shortcut-hint">(⌘])</span>
            </button>
            <button role="menuitem" tabindex="-1"
                    @click="${() => { this._openMenu = null; this.dispatchEvent(new ZOrderEvent('back')); }}">
              <svg class="icon" viewBox="0 0 1200 1200" width="17" height="17" fill="currentColor">
                <path d="m600 126.42 407.98 271.98-407.98 271.99-407.98-271.99zm335.45 512.73-335.45 222.62-341.5-220.61-234.71 143.05c-28.199 17.375-28.199 17.125 0 36.266l549 366.67c27.203 17.125 27.203 17.125 54.395 0l549-366.67c28.199-19.141 28.199-19.141 0-36.266zm-308.25-625.56c-27.203-18.133-27.203-18.133-54.406 0l-549 366.67c-28.199 17.125-28.199 17.125 0 36.266l549 366.67c27.203 18.133 27.203 18.133 54.395 0l549-366.67c28.199-19.141 28.199-19.141 0-36.266z"/>
              </svg>
              Send to back <span class="tool-shortcut-hint">(⌘[)</span>
            </button>
          </div>
        ` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cb-toolbar': CbToolbar;
  }
}
