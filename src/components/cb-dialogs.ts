import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';

import type { PitchType } from '../lib/types.js';
import { getTemplatesForPitch } from '../lib/templates.js';
import type { SavedBoard } from '../lib/board-store.js';

export type PendingBoardAction = 'new' | 'open' | 'save-as' | null;

export interface BoardSummary {
  name: string;
  pitchLabel: string;
  orientation: string;
  playersByColor: Map<string, number>;
  coachCount: number;
  equipByKind: Map<string, number>;
  conesByColor: Map<string, number>;
  dummiesByColor: Map<string, number>;
  polesByColor: Map<string, number>;
  linesByStyle: Map<string, number>;
  shapeCount: number;
  textCount: number;
  frameCount: number;
}

@customElement('cb-dialogs')
export class CbDialogs extends LitElement {
  static styles = css`
    :host {
      display: contents;
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

    .dialog-close:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
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

    .confirm-actions button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
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

    /* About dialog */
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

    /* Save board input */
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

    /* New board pitch/template selects */
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

    /* My boards dialog */
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

    .boards-list .delete-btn:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    /* ── My Boards side sheet ──────────────────────────────────── */

    .side-sheet-backdrop {
      position: absolute;
      inset: 0;
      z-index: 50;
      background: rgba(0, 0, 0, 0.4);
      opacity: 0;
      pointer-events: none;
      transition: opacity 280ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .side-sheet-backdrop.open {
      opacity: 1;
      pointer-events: auto;
    }

    .side-sheet {
      position: absolute;
      top: 0;
      bottom: 0;
      right: 0;
      z-index: 51;
      width: min(400px, 100vw);
      background: var(--pt-bg-inverted);
      color: var(--pt-text-on-inverted);
      border-left: 1px solid var(--pt-border-on-inverted);
      box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3);
      transform: translateX(100%);
      transition: transform 280ms cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .side-sheet.open {
      transform: translateX(0);
    }

    @media (prefers-reduced-motion: reduce) {
      .side-sheet, .side-sheet-backdrop { transition: none; }
    }

    .side-sheet-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--pt-border-on-inverted);
      flex-shrink: 0;
    }

    .side-sheet-header h2 {
      font-size: 1rem;
      font-weight: 700;
      color: var(--pt-text-on-inverted);
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .side-sheet-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 6px;
      color: var(--pt-text-on-inverted);
      cursor: pointer;
      padding: 0;
      transition: background 0.12s;
    }

    .side-sheet-close:hover { background: rgba(0, 0, 0, 0.08); }

    .side-sheet-close:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .side-sheet-body {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* Light-bg overrides for the side sheet */
    .side-sheet .boards-list {
      border-bottom-color: var(--pt-border-on-inverted);
      max-height: none;
    }

    .side-sheet .boards-list .board-open-btn {
      background: white;
      border-color: var(--pt-border-on-inverted);
      color: var(--pt-text-on-inverted);
    }

    .side-sheet .boards-list .board-open-btn:hover {
      background: var(--pt-field-area-white);
    }

    .side-sheet .boards-list .board-icon { color: var(--pt-text-on-inverted); }
    .side-sheet .boards-list .board-title { color: var(--pt-text-on-inverted); }

    .side-sheet .boards-list .board-date { color: rgba(0, 0, 0, 0.5); }

    .side-sheet .boards-list .action-btn { color: rgba(0, 0, 0, 0.4); }

    .side-sheet .boards-list .action-btn:hover {
      background: rgba(0, 0, 0, 0.07);
    }

    .side-sheet .boards-list .delete-btn { color: var(--pt-danger); }

    .side-sheet .boards-list .delete-btn:hover {
      background: rgba(220, 38, 38, 0.1);
    }

    .side-sheet .section-label { color: var(--pt-text-on-inverted); }

    .side-sheet .import-svg-btn {
      color: var(--pt-text-on-inverted);
      border-color: var(--pt-border-on-inverted);
      background: white;
    }

    .side-sheet .import-svg-btn:hover {
      background: var(--pt-field-area-white);
    }

    .side-sheet .cancel-btn {
      color: var(--pt-text-on-inverted);
      border-color: var(--pt-border-on-inverted);
      background: transparent;
    }

    .side-sheet .cancel-btn:hover {
      background: var(--pt-field-area-white);
    }

    .side-sheet .alert-warning {
      background: rgba(253, 216, 53, 0.12);
      border-color: rgba(253, 216, 53, 0.6);
      color: #7a5800;
    }

    .side-sheet .alert-info {
      background: rgba(126, 87, 194, 0.08);
      border-color: rgba(126, 87, 194, 0.35);
      color: #5c3d99;
      margin-top: 0;
    }

    .side-sheet .boards-action-row { margin-top: 0; }

    /* ── (end side sheet) ─────────────────────────────────────── */

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

    .boards-action-row {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }

    .boards-action-row .import-svg-btn {
      margin-top: 0;
    }

    .import-svg-btn--constrained {
      max-width: 50%;
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

    .import-svg-btn:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    /* Export dialog */
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

    .item-description {
      font-size: 0.7rem;
      color: var(--pt-text-muted);
      margin-top: 4px;
    }


    /* Board summary dialog */
    .summary-section {
      margin-bottom: 12px;
    }

    .summary-section h3 {
      font-size: 0.85rem;
      color: var(--pt-text);
      margin: 0 0 4px;
    }

    .summary-section p,
    .summary-section ul {
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

    .icon {
      flex-shrink: 0;
      vertical-align: middle;
    }

    .row-gap-sm {
      display: flex;
      gap: 8px;
    }

    .row-gap-md {
      display: flex;
      gap: 12px;
    }

    .flex-1 {
      flex: 1;
    }

    .full-width {
      width: 100%;
    }

    .section-label {
      font-size: 0.8rem;
      color: var(--pt-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 8px;
    }

    .board-icon--vertical {
      transform: rotate(90deg);
    }

  `;

  // Passed from parent — these drive both dialog and field/layout rendering
  @property() accessor viewMode: 'normal' | 'readonly' | 'shared-edit' = 'normal';
  @property({ type: Number }) accessor animationFrameCount: number = 0;
  @property() accessor boardNotes: string = '';

  // Internal dialog state — mutations only trigger cb-dialogs re-renders
  @state() private accessor _saveBoardName: string = '';
  @state() private accessor _pendingBoardAction: PendingBoardAction = null;
  @state() private accessor _newBoardPitchType: PitchType = 'full';
  @state() private accessor _newBoardTemplate: string = '';
  @state() private accessor _myBoards: SavedBoard[] = [];
  @state() private accessor _deleteBoardName: string = '';
  @state() private accessor _cachedSummary: BoardSummary | null = null;
  @state() private accessor _printSummary: boolean = true;
  @state() private accessor _printWhiteBg: boolean = true;

  @query('#about-dialog') private accessor _aboutDialog!: HTMLDialogElement;
  @query('#import-confirm-dialog') private accessor _importConfirmDialog!: HTMLDialogElement;
  @query('#import-error-dialog') private accessor _importErrorDialog!: HTMLDialogElement;
  @query('#save-board-dialog') private accessor _saveBoardDialog!: HTMLDialogElement;
  @query('#new-board-dialog') private accessor _newBoardDialog!: HTMLDialogElement;
  @state() private accessor _myBoardsOpen: boolean = false;
  @query('#delete-board-dialog') private accessor _deleteBoardDialog!: HTMLDialogElement;
  @query('#export-dialog') private accessor _exportDialog!: HTMLDialogElement;
  @query('#board-summary-dialog') private accessor _boardSummaryDialog!: HTMLDialogElement;
  @query('#print-dialog') private accessor _printDialog!: HTMLDialogElement;
  @query('#save-board-input') private accessor _saveBoardInput!: HTMLInputElement;

  #emit<T>(name: string, detail?: T) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  // ─── Public show/close API ────────────────────────────────────────────────

  showAbout() { requestAnimationFrame(() => this._aboutDialog?.showModal()); }
  showImportConfirm() { requestAnimationFrame(() => this._importConfirmDialog?.showModal()); }
  showImportError() { requestAnimationFrame(() => this._importErrorDialog?.showModal()); }

  openSaveBoard(name: string, action: PendingBoardAction) {
    this._saveBoardName = name;
    this._pendingBoardAction = action;
    requestAnimationFrame(() => {
      this._saveBoardDialog?.showModal();
      this.updateComplete.then(() => this._saveBoardInput?.focus());
    });
  }

  closeSaveBoard() { this._saveBoardDialog?.close(); }

  openNewBoard() {
    this._newBoardPitchType = 'full';
    this._newBoardTemplate = '';
    requestAnimationFrame(() => this._newBoardDialog?.showModal());
  }

  closeNewBoard() { this._newBoardDialog?.close(); }

  openMyBoards(boards: SavedBoard[]) { this._myBoards = boards; }

  setMyBoards(boards: SavedBoard[]) { this._myBoards = boards; }

  closeMyBoards() { /* managed by coach-board.ts */ }

  openDeleteConfirm(name: string) {
    this._deleteBoardName = name;
    requestAnimationFrame(() => this._deleteBoardDialog?.showModal());
  }

  closeDeleteBoard() { this._deleteBoardDialog?.close(); }

  showExport() { requestAnimationFrame(() => this._exportDialog?.showModal()); }
  closeExport() { this._exportDialog?.close(); }

  openBoardSummary(summary: BoardSummary) {
    this._cachedSummary = summary;
    requestAnimationFrame(() => this._boardSummaryDialog?.showModal());
  }

  closeBoardSummary() { this._boardSummaryDialog?.close(); }

  showPrint() { requestAnimationFrame(() => this._printDialog?.showModal()); }
  closePrint() { this._printDialog?.close(); }

  closeImportConfirm() { this._importConfirmDialog?.close(); }

  // ─── Close SVG icon helper ────────────────────────────────────────────────

  #closeIcon() {
    return html`<svg viewBox="0 0 16 16"><path d="M 4,4 L 12,12 M 12,4 L 4,12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>`;
  }

  // ─── Template ─────────────────────────────────────────────────────────────

  render() {
    return html`
      <dialog id="import-confirm-dialog">
        <div class="dialog-header">
          <h2>Import SVG</h2>
          <button class="dialog-close" aria-label="Close" title="Close"
                  @click="${() => this._importConfirmDialog?.close()}">
            ${this.#closeIcon()}
          </button>
        </div>
        <div class="dialog-body">
          <p>Import this SVG as a new board?</p>
          <div class="confirm-actions">
            <button class="cancel-btn" @click="${() => this._importConfirmDialog?.close()}">Cancel</button>
            <button class="confirm-success" @click="${this.#onImportConfirm}">Import</button>
          </div>
        </div>
      </dialog>

      <dialog id="import-error-dialog">
        <div class="dialog-header">
          <h2>Import Error</h2>
          <button class="dialog-close" aria-label="Close" title="Close"
                  @click="${() => this._importErrorDialog?.close()}">
            ${this.#closeIcon()}
          </button>
        </div>
        <div class="dialog-body">
          <p>This SVG was not exported from CoachingBoard and cannot be imported.</p>
          <div class="confirm-actions end">
            <button class="cancel-btn" @click="${() => this._importErrorDialog?.close()}">OK</button>
          </div>
        </div>
      </dialog>



      <dialog id="about-dialog">
        <div class="about-close-row">
          <button class="dialog-close" aria-label="Close" title="Close"
                  @click="${() => this._aboutDialog?.close()}">
            ${this.#closeIcon()}
          </button>
        </div>
        <div class="dialog-body about-body">
          <svg class="about-icon" viewBox="0 0 1600 1600"><path d="M1600 801C1600 1242.28 1242.28 1600 801 1600C359.724 1600 2 1242.28 2 801C2 359.724 359.724 2 801 2C1242.28 2 1600 359.724 1600 801Z" fill="#55964D"/><path d="M801 2C1241.94 2 1599.46 359.184 1600 800H2.00195C2.54191 359.184 360.058 2 801 2Z" fill="#60A957"/><path d="M407.703 634.189C414.778 641.264 424.03 644.802 433.374 644.802C442.626 644.802 451.969 641.264 459.044 634.189L541.044 552.099L623.134 634.189C630.209 641.264 639.461 644.802 648.805 644.802C658.057 644.802 667.4 641.264 674.475 634.189C688.626 620.039 688.626 597.09 674.475 582.849L592.385 500.759L674.475 418.669C688.626 404.519 688.626 381.57 674.475 367.33C660.325 353.179 637.376 353.179 623.136 367.33L541.046 449.511L458.955 367.42C444.805 353.27 421.856 353.27 407.616 367.42C393.465 381.571 393.465 404.52 407.616 418.76L489.706 500.85L407.616 582.94C393.465 597 393.465 619.949 407.706 634.189H407.703Z" fill="white"/><path d="M912.405 1144.4C912.405 1232.51 984.12 1304.24 1072.2 1304.24C1160.29 1304.24 1232 1232.51 1232 1144.4C1232 1056.29 1160.29 984.65 1072.2 984.65C984.12 984.56 912.405 1056.29 912.405 1144.4ZM1159.66 1144.4C1159.66 1192.62 1120.41 1231.88 1072.21 1231.88C1024.01 1231.88 984.761 1192.62 984.761 1144.4C984.761 1096.19 1024.01 1057.02 1072.21 1057.02C1120.41 1056.93 1159.66 1096.19 1159.66 1144.4Z" fill="white"/><path d="M812.403 834.487L700.593 877.625C605.61 914.252 541.835 1007.22 541.835 1108.88V1268.14C541.835 1288.13 558.027 1304.32 578.019 1304.32C598.011 1304.32 614.203 1288.13 614.203 1268.14V1108.88C614.203 1036.89 659.344 971.049 726.646 945.093L838.456 901.955C933.349 865.328 997.124 772.446 997.124 670.701V480.418L1042.72 525.999C1049.77 533.053 1059 536.58 1068.32 536.58C1077.54 536.58 1086.86 533.053 1093.92 525.999C1108.03 511.89 1108.03 489.009 1093.92 474.811L986.45 367.368C972.338 353.26 949.451 353.26 935.25 367.368L827.782 474.811C813.67 488.919 813.67 511.891 827.782 525.999C834.838 533.053 844.065 536.58 853.383 536.58C862.61 536.58 871.927 533.053 878.984 525.999L924.757 480.236V670.792C924.757 742.691 879.615 808.531 812.403 834.487Z" fill="white"/></svg>
          <div class="about-title">CoachingBoard</div>
          <div class="about-meta">Version ${__APP_VERSION__}</div>
          <div class="about-meta">by Mark Caron</div>
          <div class="about-meta last about-feedback"><a href="https://github.com/markcaron/coach-board/issues/new" target="_blank" rel="noopener" class="about-link">Feedback</a></div>
          <div class="confirm-actions centered">
            <button class="cancel-btn" @click="${() => this._aboutDialog?.close()}">OK</button>
          </div>
        </div>
      </dialog>

      <dialog id="save-board-dialog"
              @close="${this.#onSaveBoardClosed}">
        <div class="dialog-header">
          <h2>${this._pendingBoardAction === 'save-as' ? 'Save As' : this._pendingBoardAction ? 'Save Current Board' : 'Save Board'}</h2>
          <button class="dialog-close" aria-label="Close" title="Close"
                  @click="${() => this._saveBoardDialog?.close()}">
            ${this.#closeIcon()}
          </button>
        </div>
        <div class="dialog-body">
          <p>${this._pendingBoardAction === 'save-as' ? 'Save a copy of this board with a new name.' : this._pendingBoardAction ? 'Give your current board a name to save it, first.' : 'Give your board a name to save it.'}</p>
          <label class="save-board-label" for="save-board-input">Board name</label>
          <input class="save-board-input" id="save-board-input" type="text" placeholder="Board name"
                 .value="${this._saveBoardName}"
                 @input="${(e: Event) => { this._saveBoardName = (e.target as HTMLInputElement).value; }}"
                 @keydown="${(e: KeyboardEvent) => { if (e.key === 'Enter' && this._saveBoardName.trim()) this.#emit('cb-save-board-confirm', { name: this._saveBoardName, pendingAction: this._pendingBoardAction }); }}" />
          <div class="confirm-actions">
            <button class="cancel-btn" @click="${() => this._saveBoardDialog?.close()}">Cancel</button>
            <div class="row-gap-sm">
              ${this._pendingBoardAction === 'new' || this._pendingBoardAction === 'open' ? html`
                <button class="confirm-danger" @click="${() => this.#emit('cb-save-board-skip', { pendingAction: this._pendingBoardAction })}">Don't Save</button>
              ` : nothing}
              <button class="confirm-success"
                      ?disabled="${!this._saveBoardName.trim()}"
                      @click="${() => this.#emit('cb-save-board-confirm', { name: this._saveBoardName, pendingAction: this._pendingBoardAction })}">Save</button>
            </div>
          </div>
        </div>
      </dialog>

      <dialog id="new-board-dialog">
        <div class="dialog-header">
          <h2>New Board</h2>
          <button class="dialog-close" aria-label="Close" title="Close"
                  @click="${() => this._newBoardDialog?.close()}">
            ${this.#closeIcon()}
          </button>
        </div>
        <div class="dialog-body">
          <p>Create a new board.</p>
          <div class="row-gap-md">
            <div class="flex-1">
              <label class="save-board-label" for="new-board-pitch-type">Pitch type</label>
              <select class="theme-select full-width" id="new-board-pitch-type"
                      @change="${(e: Event) => { this._newBoardPitchType = (e.target as HTMLSelectElement).value as PitchType; this._newBoardTemplate = ''; }}">
                <option value="full" ?selected="${this._newBoardPitchType === 'full'}">Full Pitch</option>
                <option value="half" ?selected="${this._newBoardPitchType === 'half'}">Half Pitch (Def.)</option>
                <option value="half-attack" ?selected="${this._newBoardPitchType === 'half-attack'}">Half Pitch (Att.)</option>
                <option value="open" ?selected="${this._newBoardPitchType === 'open'}">Open Grass</option>
              </select>
            </div>
            ${(() => {
              const templates = getTemplatesForPitch(this._newBoardPitchType);
              return templates.length > 0 ? html`
                <div class="flex-1">
                  <label class="save-board-label" for="new-board-template">Template</label>
                  <select class="theme-select full-width" id="new-board-template"
                          @change="${(e: Event) => { this._newBoardTemplate = (e.target as HTMLSelectElement).value; }}">
                    <option value="" ?selected="${!this._newBoardTemplate}">Blank</option>
                    ${templates.map(t => html`<option value="${t.id}" ?selected="${this._newBoardTemplate === t.id}">${t.name}</option>`)}
                  </select>
                </div>
              ` : nothing;
            })()}
          </div>
          <div class="confirm-actions">
            <button class="cancel-btn" @click="${() => this._newBoardDialog?.close()}">Cancel</button>
            <button class="confirm-success" @click="${() => this.#emit('cb-new-board-confirm', { pitchType: this._newBoardPitchType, template: this._newBoardTemplate })}">Create New Board</button>
          </div>
        </div>
      </dialog>

      <div class="side-sheet-backdrop ${this._myBoardsOpen ? 'open' : ''}"
           @click="${() => this.closeMyBoards()}"></div>
      <div class="side-sheet ${this._myBoardsOpen ? 'open' : ''}"
           role="dialog"
           aria-modal="${this._myBoardsOpen}"
           aria-hidden="${!this._myBoardsOpen}"
           aria-labelledby="my-boards-title"
           @keydown="${(e: KeyboardEvent) => { if (e.key === 'Escape') this.closeMyBoards(); }}">
        <div class="side-sheet-header">
          <h2 id="my-boards-title">My Boards</h2>
          <button class="side-sheet-close" aria-label="Close My Boards"
                  @click="${() => this.closeMyBoards()}">
            ${this.#closeIcon()}
          </button>
        </div>
        <div class="side-sheet-body">
          ${this._myBoards.filter(b => b.name !== 'Untitled Board').length ? html`
            <h3 class="section-label">Saved Boards</h3>
            <ul class="boards-list">
              ${this._myBoards.filter(b => b.name !== 'Untitled Board').map(b => html`
                <li>
                  <button class="board-open-btn" aria-label="Open ${b.name}"
                          @click="${() => this.#emit('cb-open-board', { id: b.id })}">
                    <svg class="board-icon board-icon--vertical" viewBox="0 0 1200 1200" width="28" height="28" aria-hidden="true" fill="currentColor">
                      <path d="m1050.2 206.34h-900.37c-50.016 0-90.703 40.688-90.703 90.703v605.86c0 50.016 40.688 90.703 90.703 90.703h900.42c50.016 0 90.703-40.688 90.703-90.703v-605.81c0-50.062-40.734-90.75-90.75-90.75zm58.875 696.56c0 32.484-26.391 58.875-58.875 58.875h-900.37c-32.484 0-58.875-26.391-58.875-58.875v-605.81c0-32.484 26.391-58.875 58.875-58.875h900.42c32.484 0 58.875 26.391 58.875 58.875v605.81z"/>
                      <path d="m1031.3 300.1h-862.5c-8.8125 0-15.938 7.125-15.938 15.938v568.03c0 8.8125 7.125 15.938 15.938 15.938h862.5c8.8125 0 15.938-7.125 15.938-15.938v-568.03c0-8.8125-7.125-15.938-15.938-15.938zm-447.19 410.48c-54.281-7.8281-96.281-54.188-96.281-110.58s42-102.75 96.281-110.58zm31.875-221.16c54.281 7.8281 96.281 54.188 96.281 110.58s-42 102.75-96.281 110.58zm-431.26 20.719h53.062c11.719 0 21.328 9.5625 21.328 21.328v137.02c0 11.719-9.5625 21.328-21.328 21.328l-53.062 0.046875zm0 211.6h53.062c29.344 0 53.156-23.859 53.156-53.156v-137.02c0-29.344-23.859-53.156-53.156-53.156l-53.062-0.046875v-146.39h399.37v125.63c-71.859 8.0625-128.16 68.484-128.16 142.4 0 73.969 56.25 134.39 128.16 142.4v125.63h-399.37zm431.26 146.29v-125.63c71.859-8.0625 128.16-68.484 128.16-142.4 0-73.969-56.25-134.39-128.16-142.4v-125.63h399.37v146.34l-53.062-0.046875c-29.344 0-53.156 23.859-53.156 53.156v137.02c0 29.344 23.859 53.156 53.156 53.156h53.062v146.34l-399.37 0.046874zm399.37-178.18h-53.062c-11.719 0-21.328-9.5625-21.328-21.328v-137.02c0-11.719 9.5625-21.328 21.328-21.328h53.062z"/>
                    </svg>
                    <div class="board-info">
                      <div class="board-title">${b.name}</div>
                      <div class="board-date">${new Date(b.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${b.pitchType === 'half' ? 'Half (Def.)' : b.pitchType === 'half-attack' ? 'Half (Att.)' : b.pitchType === 'open' ? 'Open Grass' : 'Full Pitch'}</div>
                    </div>
                  </button>
                  <button class="action-btn" title="Duplicate ${b.name}" aria-label="Duplicate ${b.name}"
                          @click="${() => this.#emit('cb-duplicate-board', { board: b })}">
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                      <rect x="5" y="5" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/>
                      <path d="M3 11V3a1 1 0 0 1 1-1h8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                    </svg>
                  </button>
                  <button class="delete-btn" title="Delete ${b.name}" aria-label="Delete ${b.name}"
                          @click="${() => this.#emit('cb-handle-delete-board', { board: b })}">
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
              <svg class="icon" viewBox="0 0 1200 1200" width="20" height="20" fill="#fdd835">
                <path d="m600 431.77c-18.637 0-33.75 15.113-33.75 33.75v233.36c0 18.637 15.113 33.75 33.75 33.75s33.75-15.113 33.75-33.75v-233.36c0-18.637-15.113-33.75-33.75-33.75z"/>
                <path d="m600 789.56c-18.637 0-33.75 15.113-33.75 33.75v20.625c0 18.637 15.113 33.75 33.75 33.75s33.75-15.113 33.75-33.75v-20.625c0-18.637-15.113-33.75-33.75-33.75z"/>
                <path d="m1102.7 847.57-401.81-624.9c-22.164-34.426-59.887-55.012-100.88-55.012s-78.711 20.586-100.88 55.051v0.039062l-401.81 624.82c-24.113 37.461-25.762 83.211-4.3867 122.36 21.336 39.113 60.711 62.477 105.3 62.477h803.62c44.551 0 83.926-23.363 105.3-62.477 21.297-39.188 19.648-84.898-4.4648-122.36zm-54.863 89.965c-9.3359 17.137-26.551 27.336-46.051 27.336h-803.59c-19.5 0-36.711-10.164-46.051-27.336-9.3359-17.102-8.625-37.086 1.9141-53.512l401.81-624.83c19.688-30.523 68.551-30.523 88.273 0l401.81 624.82c10.539 16.426 11.215 36.414 1.875 53.516z"/>
              </svg>
              <span>No saved boards yet.</span>
            </div>
          `}
          <div class="alert-info">
            <svg class="icon" viewBox="0 0 1200 1200" width="20" height="20" fill="#b39ddb">
              <path d="m600 112.5c-129.29 0-253.29 51.363-344.71 142.79-91.422 91.426-142.79 215.42-142.79 344.71s51.363 253.29 142.79 344.71c91.426 91.422 215.42 142.79 344.71 142.79s253.29-51.363 344.71-142.79c91.422-91.426 142.79-215.42 142.79-344.71-0.14453-129.25-51.555-253.16-142.95-344.55-91.395-91.391-215.3-142.8-344.55-142.95zm0 900c-109.4 0-214.32-43.461-291.68-120.82-77.359-77.355-120.82-182.28-120.82-291.68s43.461-214.32 120.82-291.68c77.355-77.359 182.28-120.82 291.68-120.82s214.32 43.461 291.68 120.82c77.359 77.355 120.82 182.28 120.82 291.68-0.11719 109.37-43.617 214.22-120.95 291.55s-182.18 120.83-291.55 120.95z"/>
              <path d="m675 812.5h-37.5v-312.5c0-9.9453-3.9492-19.484-10.984-26.516-7.0312-7.0352-16.57-10.984-26.516-10.984h-25c-11.887 0.003906-23.066 5.6445-30.137 15.203-7.0664 9.5586-9.1836 21.898-5.707 33.266s12.137 20.414 23.344 24.383v277.15h-37.5c-13.398 0-25.777 7.1484-32.477 18.75-6.6992 11.602-6.6992 25.898 0 37.5 6.6992 11.602 19.078 18.75 32.477 18.75h150c13.398 0 25.777-7.1484 32.477-18.75 6.6992-11.602 6.6992-25.898 0-37.5-6.6992-11.602-19.078-18.75-32.477-18.75z"/>
              <path d="m650 350c0 27.613-22.387 50-50 50s-50-22.387-50-50 22.387-50 50-50 50 22.387 50 50z"/>
            </svg>
            <span>All board data is saved to your browser's local storage. Exporting boards as backup SVGs is the best way to keep backups.</span>
          </div>
          <div class="boards-action-row">
            <button class="import-svg-btn import-svg-btn--constrained"
                    @click="${() => this.#emit('cb-import-svg')}">
              <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14" fill="currentColor">
                <path d="m1100 787.5c-16.566 0.027344-32.449 6.6211-44.164 18.336-11.715 11.715-18.309 27.598-18.336 44.164v150c-0.027344 9.9375-3.9844 19.461-11.012 26.488-7.0273 7.0273-16.551 10.984-26.488 11.012h-800c-9.9375-0.027344-19.461-3.9844-26.488-11.012-7.0273-7.0273-10.984-16.551-11.012-26.488v-150c0-22.328-11.914-42.961-31.25-54.125-19.336-11.168-43.164-11.168-62.5 0-19.336 11.164-31.25 31.797-31.25 54.125v150c0.054688 43.082 17.191 84.383 47.652 114.85 30.465 30.461 71.766 47.598 114.85 47.652h800c43.082-0.054688 84.383-17.191 114.85-47.652 30.461-30.465 47.598-71.766 47.652-114.85v-150c-0.027344-16.566-6.6211-32.449-18.336-44.164-11.715-11.715-27.598-18.309-44.164-18.336z"/>
                <path d="m600 862.5c16.566-0.027344 32.449-6.6211 44.164-18.336 11.715-11.715 18.309-27.598 18.336-44.164v-566.55l197.5 164.55c12.738 10.59 29.156 15.695 45.656 14.199 16.496-1.5 31.727-9.4844 42.344-22.199 10.59-12.738 15.695-29.156 14.199-45.656-1.5-16.496-9.4844-31.727-22.199-42.344l-300-250c-3.1562-2.2227-6.5039-4.1641-10-5.8008-2.2656-1.4922-4.6172-2.8477-7.0508-4.0508-14.562-6.1289-30.984-6.1289-45.551 0-2.5508 1.1875-5.0234 2.5391-7.3984 4.0508-3.5 1.6328-6.8438 3.5742-10 5.8008l-300 250c-13.23 11.031-21.32 27.035-22.359 44.23-1.0391 17.195 5.0664 34.055 16.871 46.602 11.805 12.543 28.262 19.66 45.488 19.668 14.613-0.035156 28.758-5.1641 40-14.5l197.5-164.55v566.55c0.027344 16.566 6.6211 32.449 18.336 44.164 11.715 11.715 27.598 18.309 44.164 18.336z"/>
              </svg>
              Import from SVG
            </button>
            ${this._myBoards.filter(b => b.name !== 'Untitled Board').length ? html`
              <button class="import-svg-btn" @click="${() => this.#emit('cb-export-all-boards')}">
                <svg class="icon" viewBox="0 0 1200 1200" width="14" height="14" fill="currentColor">
                  <path d="m1100 787.5c-16.566 0.027344-32.449 6.6211-44.164 18.336-11.715 11.715-18.309 27.598-18.336 44.164v150c-0.027344 9.9375-3.9844 19.461-11.012 26.488-7.0273 7.0273-16.551 10.984-26.488 11.012h-800c-9.9375-0.027344-19.461-3.9844-26.488-11.012-7.0273-7.0273-10.984-16.551-11.012-26.488v-150c0-22.328-11.914-42.961-31.25-54.125-19.336-11.168-43.164-11.168-62.5 0-19.336 11.164-31.25 31.797-31.25 54.125v150c0.054688 43.082 17.191 84.383 47.652 114.85 30.465 30.461 71.766 47.598 114.85 47.652h800c43.082-0.054688 84.383-17.191 114.85-47.652 30.461-30.465 47.598-71.766 47.652-114.85v-150c-0.027344-16.566-6.6211-32.449-18.336-44.164-11.715-11.715-27.598-18.309-44.164-18.336z"/>
                  <path d="m600 37.5c-16.566 0.027344-32.449 6.6211-44.164 18.336-11.715 11.715-18.309 27.598-18.336 44.164v566.55l-197.5-164.55c-12.738-10.59-29.156-15.695-45.656-14.199-16.496 1.5-31.727 9.4844-42.344 22.199-10.59 12.738-15.695 29.156-14.199 45.656 1.5 16.496 9.4844 31.727 22.199 42.344l300 250c3.1484 2.2344 6.4961 4.1758 10 5.8008 2.2852 1.5312 4.6758 2.9023 7.1484 4.0977 14.566 6.1328 30.988 6.1328 45.551 0 2.4141-1.2031 4.7539-2.5547 7-4.0469 3.5039-1.6289 6.8477-3.5703 10-5.8008l300-250c13.23-11.004 21.336-26.977 22.41-44.148 1.0742-17.176-4.9766-34.031-16.73-46.598-11.758-12.566-28.172-19.73-45.379-19.805-14.613 0.027344-28.762 5.1562-40 14.5l-197.5 164.55v-566.55c-0.027344-16.566-6.6211-32.449-18.336-44.164-11.715-11.715-27.598-18.309-44.164-18.336z"/>
                </svg>
                Export All Boards
              </button>
            ` : nothing}
          </div>
          <div class="confirm-actions end">
            <button class="cancel-btn" @click="${() => this.closeMyBoards()}">Close</button>
          </div>
        </div>
      </div>

      <dialog id="delete-board-dialog">
        <div class="dialog-header">
          <h2>Delete Board</h2>
          <button class="dialog-close" aria-label="Close" title="Close"
                  @click="${() => this._deleteBoardDialog?.close()}">
            ${this.#closeIcon()}
          </button>
        </div>
        <div class="dialog-body">
          <p>Are you sure you want to delete "${this._deleteBoardName}"? This cannot be undone.</p>
          <div class="confirm-actions">
            <button class="cancel-btn" @click="${() => this._deleteBoardDialog?.close()}">Cancel</button>
            <button class="confirm-danger" @click="${() => this.#emit('cb-confirm-delete-board')}">Delete</button>
          </div>
        </div>
      </dialog>

      <dialog id="export-dialog">
        <div class="dialog-header">
          <h2>Export Board</h2>
          <button class="dialog-close" aria-label="Close" title="Close"
                  @click="${() => this._exportDialog?.close()}">
            ${this.#closeIcon()}
          </button>
        </div>
        <div class="dialog-body">
          <div class="export-options">
            ${this.viewMode !== 'readonly' ? html`
              <button @click="${() => this.#emit('cb-export-svg')}">
                <svg class="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <rect x="2" y="1" width="12" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>
                  <text x="8" y="11" text-anchor="middle" fill="currentColor" font-size="5" font-weight="bold" font-family="system-ui">SVG</text>
                </svg>
                <div>
                  <div>Export as SVG</div>
                  <div class="item-description">Vector format with full board data. Can be reimported later.</div>
                </div>
              </button>
            ` : nothing}
            <button @click="${() => this.#emit('cb-export-png')}">
              <svg class="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <rect x="2" y="1" width="12" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>
                <text x="8" y="11" text-anchor="middle" fill="currentColor" font-size="5" font-weight="bold" font-family="system-ui">PNG</text>
              </svg>
              <div>
                <div>Save as PNG</div>
                <div class="item-description">High-resolution image for sharing or printing.</div>
              </div>
            </button>
            ${this.animationFrameCount > 1 ? html`
              <button @click="${() => this.#emit('cb-export-gif')}">
                <svg class="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
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

      <dialog id="board-summary-dialog"
              @close="${this.#onBoardSummaryClosed}">
        <div class="dialog-header">
          <h2>Board Summary</h2>
          <button class="dialog-close" aria-label="Close" title="Close"
                  @click="${() => this._boardSummaryDialog?.close()}">
            ${this.#closeIcon()}
          </button>
        </div>
        <div class="dialog-body">
          ${this._cachedSummary ? html`
            <div class="summary-board-name">${this._cachedSummary.name}</div>
            <div class="summary-section">
              <h3>Pitch</h3>
              <p>${this._cachedSummary.pitchLabel} · ${this._cachedSummary.orientation}</p>
            </div>
            ${this._cachedSummary.playersByColor.size > 0 || this._cachedSummary.coachCount > 0 ? html`
              <div class="summary-section">
                <h3>Players</h3>
                <ul>
                  ${[...this._cachedSummary.playersByColor.entries()].map(([color, count]) => html`<li>${count} ${color}</li>`)}
                  ${this._cachedSummary.coachCount > 0 ? html`<li>${this._cachedSummary.coachCount} Coach${this._cachedSummary.coachCount > 1 ? 'es' : ''}</li>` : nothing}
                </ul>
              </div>
            ` : nothing}
            ${this._cachedSummary.equipByKind.size > 0 || this._cachedSummary.conesByColor.size > 0 || this._cachedSummary.dummiesByColor.size > 0 || this._cachedSummary.polesByColor.size > 0 ? html`
              <div class="summary-section">
                <h3>Equipment</h3>
                <ul>
                  ${[...this._cachedSummary.equipByKind.entries()].map(([kind, count]) => html`<li>${count} ${kind}${count > 1 ? 's' : ''}</li>`)}
                  ${this._cachedSummary.conesByColor.size > 0 ? html`<li>${[...this._cachedSummary.conesByColor.values()].reduce((a, b) => a + b, 0)} Cone${[...this._cachedSummary.conesByColor.values()].reduce((a, b) => a + b, 0) > 1 ? 's' : ''} (${[...this._cachedSummary.conesByColor.entries()].map(([color, count]) => `${count} ${color}`).join(', ')})</li>` : nothing}
                  ${this._cachedSummary.dummiesByColor.size > 0 ? html`<li>${[...this._cachedSummary.dummiesByColor.values()].reduce((a, b) => a + b, 0)} Dumm${[...this._cachedSummary.dummiesByColor.values()].reduce((a, b) => a + b, 0) > 1 ? 'ies' : 'y'} (${[...this._cachedSummary.dummiesByColor.entries()].map(([color, count]) => `${count} ${color}`).join(', ')})</li>` : nothing}
                  ${this._cachedSummary.polesByColor.size > 0 ? html`<li>${[...this._cachedSummary.polesByColor.values()].reduce((a, b) => a + b, 0)} Pole${[...this._cachedSummary.polesByColor.values()].reduce((a, b) => a + b, 0) > 1 ? 's' : ''} (${[...this._cachedSummary.polesByColor.entries()].map(([color, count]) => `${count} ${color}`).join(', ')})</li>` : nothing}
                </ul>
              </div>
            ` : nothing}
            ${this._cachedSummary.linesByStyle.size > 0 ? html`
              <div class="summary-section">
                <h3>Lines</h3>
                <ul>
                  ${[...this._cachedSummary.linesByStyle.entries()].map(([style, count]) => html`<li>${count} ${style}${count > 1 ? 's' : ''}</li>`)}
                </ul>
              </div>
            ` : nothing}
            ${this._cachedSummary.shapeCount > 0 ? html`
              <div class="summary-section">
                <h3>Shapes</h3>
                <p>${this._cachedSummary.shapeCount} shape${this._cachedSummary.shapeCount > 1 ? 's' : ''}</p>
              </div>
            ` : nothing}
            ${this._cachedSummary.textCount > 0 ? html`
              <div class="summary-section">
                <h3>Text</h3>
                <p>${this._cachedSummary.textCount} text item${this._cachedSummary.textCount > 1 ? 's' : ''}</p>
              </div>
            ` : nothing}
            ${this._cachedSummary.frameCount > 0 ? html`
              <div class="summary-section">
                <h3>Animation</h3>
                <p>${this._cachedSummary.frameCount} frame${this._cachedSummary.frameCount > 1 ? 's' : ''}</p>
              </div>
            ` : nothing}
          ` : nothing}
          <div class="summary-section">
            <h3>Notes &amp; Instructions</h3>
            <textarea class="notes-textarea" rows="4" placeholder="Add notes, drills, instructions…"
                      .value="${this.boardNotes}"
                      @input="${(e: Event) => this.#emit('cb-board-notes-input', { value: (e.target as HTMLTextAreaElement).value })}"></textarea>
          </div>
          <div class="confirm-actions">
            <button class="cancel-btn" @click="${() => this._boardSummaryDialog?.close()}">Close</button>
            <button class="confirm-success" @click="${this.#onBoardNotesSave}">Save</button>
          </div>
        </div>
      </dialog>

      <dialog id="print-dialog">
        <div class="dialog-header">
          <h2>Print Board</h2>
          <button class="dialog-close" aria-label="Close" title="Close"
                  @click="${() => this._printDialog?.close()}">
            ${this.#closeIcon()}
          </button>
        </div>
        <div class="dialog-body">
          <label class="checkbox-label">
            <input type="checkbox" .checked="${this._printSummary}"
                   @change="${(e: Event) => { this._printSummary = (e.target as HTMLInputElement).checked; }}">
            Include board summary
          </label>
          <label class="checkbox-label">
            <input type="checkbox" .checked="${this._printWhiteBg}"
                   @change="${(e: Event) => { this._printWhiteBg = (e.target as HTMLInputElement).checked; }}">
            Use white background for printing
          </label>
          <div class="confirm-actions">
            <button class="cancel-btn" @click="${() => this._printDialog?.close()}">Cancel</button>
            <button class="confirm-success" @click="${() => this.#emit('cb-print-confirm', { printSummary: this._printSummary, printWhiteBg: this._printWhiteBg })}">Print</button>
          </div>
        </div>
      </dialog>
    `;
  }

  // ─── Internal event handlers ──────────────────────────────────────────────

  #onImportConfirm() {
    this._importConfirmDialog?.close();
    this.#emit('cb-import-confirm');
  }



  #onSaveBoardClosed() {
    this._pendingBoardAction = null;
    this.#emit('cb-save-board-closed');
  }

  #onBoardNotesSave() {
    this._boardSummaryDialog?.close();
  }

  #onBoardSummaryClosed() {
    this.#emit('cb-board-summary-closed');
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cb-dialogs': CbDialogs;
  }
}
