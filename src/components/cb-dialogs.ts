import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';

import type { PitchType } from '../lib/types.js';
import { getTemplatesForPitch } from '../lib/templates.js';

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
  shapesByKind: Map<string, number>;
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

    dialog form {
      display: contents;
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

  `;

  // Passed from parent — these drive dialog rendering
  @property() accessor viewMode: 'normal' | 'readonly' | 'shared-edit' = 'normal';
  @property({ type: Number }) accessor animationFrameCount: number = 0;

  // Internal dialog state — mutations only trigger cb-dialogs re-renders
  @state() private accessor _saveBoardName: string = '';
  @state() private accessor _pendingBoardAction: PendingBoardAction = null;
  @state() private accessor _newBoardPitchType: PitchType = 'full';
  @state() private accessor _newBoardTemplate: string = '';
  @state() private accessor _deleteBoardName: string = '';
  @state() private accessor _printSummary: boolean = true;
  @state() private accessor _printWhiteBg: boolean = true;

  @query('#about-dialog') private accessor _aboutDialog!: HTMLDialogElement;
  @query('#import-confirm-dialog') private accessor _importConfirmDialog!: HTMLDialogElement;
  @query('#import-error-dialog') private accessor _importErrorDialog!: HTMLDialogElement;
  @query('#save-board-dialog') private accessor _saveBoardDialog!: HTMLDialogElement;
  @query('#new-board-dialog') private accessor _newBoardDialog!: HTMLDialogElement;
  @query('#delete-board-dialog') private accessor _deleteBoardDialog!: HTMLDialogElement;
  @query('#export-dialog') private accessor _exportDialog!: HTMLDialogElement;
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

  openDeleteConfirm(name: string) {
    this._deleteBoardName = name;
    requestAnimationFrame(() => this._deleteBoardDialog?.showModal());
  }

  closeDeleteBoard() { this._deleteBoardDialog?.close(); }

  showExport() { requestAnimationFrame(() => this._exportDialog?.showModal()); }
  closeExport() { this._exportDialog?.close(); }

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
        <form method="dialog" @submit="${this.#onImportConfirm}">
          <div class="dialog-header">
            <h2>Import SVG</h2>
            <button type="button" class="dialog-close" aria-label="Close" title="Close"
                    @click="${() => this._importConfirmDialog?.close()}">
              ${this.#closeIcon()}
            </button>
          </div>
          <div class="dialog-body">
            <p>Import this SVG as a new board?</p>
            <div class="confirm-actions">
              <button type="button" class="cancel-btn" @click="${() => this._importConfirmDialog?.close()}">Cancel</button>
              <button type="submit" class="confirm-success">Import</button>
            </div>
          </div>
        </form>
      </dialog>

      <dialog id="import-error-dialog">
        <form method="dialog">
          <div class="dialog-header">
            <h2>Import Error</h2>
            <button type="submit" class="dialog-close" aria-label="Close" title="Close">
              ${this.#closeIcon()}
            </button>
          </div>
          <div class="dialog-body">
            <p>This SVG was not exported from CoachingBoard and cannot be imported.</p>
            <div class="confirm-actions end">
              <button type="submit" class="cancel-btn">OK</button>
            </div>
          </div>
        </form>
      </dialog>



      <dialog id="about-dialog">
        <form method="dialog">
          <div class="about-close-row">
            <button type="submit" class="dialog-close" aria-label="Close" title="Close">
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
              <button type="submit" class="cancel-btn">OK</button>
            </div>
          </div>
        </form>
      </dialog>

      <dialog id="save-board-dialog"
              @close="${this.#onSaveBoardClosed}">
        <form method="dialog" novalidate
              @submit="${() => this.#emit('cb-save-board-confirm', { name: this._saveBoardName, pendingAction: this._pendingBoardAction })}">
          <div class="dialog-header">
            <h2>${this._pendingBoardAction === 'save-as' ? 'Save As' : this._pendingBoardAction ? 'Save Current Board' : 'Save Board'}</h2>
            <button type="button" class="dialog-close" aria-label="Close" title="Close"
                    @click="${() => this._saveBoardDialog?.close()}">
              ${this.#closeIcon()}
            </button>
          </div>
          <div class="dialog-body">
            <p>${this._pendingBoardAction === 'save-as' ? 'Save a copy of this board with a new name.' : this._pendingBoardAction ? 'Give your current board a name to save it, first.' : 'Give your board a name to save it.'}</p>
            <label class="save-board-label" for="save-board-input">Board name</label>
            <input class="save-board-input" id="save-board-input" type="text" placeholder="Board name"
                   .value="${this._saveBoardName}"
                   @input="${(e: Event) => { this._saveBoardName = (e.target as HTMLInputElement).value; }}" />
            <div class="confirm-actions">
              <button type="button" class="cancel-btn" @click="${() => this._saveBoardDialog?.close()}">Cancel</button>
              <div class="row-gap-sm">
                ${this._pendingBoardAction === 'new' || this._pendingBoardAction === 'open' ? html`
                  <button type="button" class="confirm-danger" @click="${() => this.#emit('cb-save-board-skip', { pendingAction: this._pendingBoardAction })}">Don't Save</button>
                ` : nothing}
                <button type="submit" class="confirm-success"
                        ?disabled="${!this._saveBoardName.trim()}">Save</button>
              </div>
            </div>
          </div>
        </form>
      </dialog>

      <dialog id="new-board-dialog">
        <form method="dialog"
              @submit="${() => this.#emit('cb-new-board-confirm', { pitchType: this._newBoardPitchType, template: this._newBoardTemplate })}">
          <div class="dialog-header">
            <h2>New Board</h2>
            <button type="button" class="dialog-close" aria-label="Close" title="Close"
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
              <button type="button" class="cancel-btn" @click="${() => this._newBoardDialog?.close()}">Cancel</button>
              <button type="submit" class="confirm-success">Create New Board</button>
            </div>
          </div>
        </form>
      </dialog>

      <dialog id="delete-board-dialog">
        <form method="dialog"
              @submit="${() => this.#emit('cb-confirm-delete-board')}">
          <div class="dialog-header">
            <h2>Delete Board</h2>
            <button type="button" class="dialog-close" aria-label="Close" title="Close"
                    @click="${() => this._deleteBoardDialog?.close()}">
              ${this.#closeIcon()}
            </button>
          </div>
          <div class="dialog-body">
            <p>Are you sure you want to delete "${this._deleteBoardName}"? This cannot be undone.</p>
            <div class="confirm-actions">
              <button type="button" class="cancel-btn" @click="${() => this._deleteBoardDialog?.close()}">Cancel</button>
              <button type="submit" class="confirm-danger">Delete</button>
            </div>
          </div>
        </form>
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

      <dialog id="print-dialog">
        <form method="dialog"
              @submit="${() => this.#emit('cb-print-confirm', { printSummary: this._printSummary, printWhiteBg: this._printWhiteBg })}">
          <div class="dialog-header">
            <h2>Print Board</h2>
            <button type="button" class="dialog-close" aria-label="Close" title="Close"
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
              <button type="button" class="cancel-btn" @click="${() => this._printDialog?.close()}">Cancel</button>
              <button type="submit" class="confirm-success">Print</button>
            </div>
          </div>
        </form>
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

}

declare global {
  interface HTMLElementTagNameMap {
    'cb-dialogs': CbDialogs;
  }
}
