import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import type { SavedBoard } from '../lib/board-store.js';

/**
 * Board list content for the My Boards side sheet.
 *
 * Receives the current board list via the `boards` property and emits
 * custom events that coach-board.ts handles. It intentionally contains no
 * state of its own — all mutations happen in the parent.
 *
 * Events emitted:
 *  - cb-open-board         { id: string }
 *  - cb-duplicate-board    { board: SavedBoard }
 *  - cb-handle-delete-board { board: SavedBoard }
 *  - cb-import-svg         (no detail)
 *  - cb-export-all-boards  (no detail)
 */
@customElement('cb-my-boards')
export class CbMyBoards extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    /* ── Board list ─────────────────────────────────────────────── */
    .section {
      padding: 12px 0;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    }

    .section-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: rgba(0, 0, 0, 0.55);
      padding: 4px 20px 8px;
    }

    .boards-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
    }

    .boards-list li {
      display: flex;
      align-items: center;
      padding: 0 8px 0 0;
    }

    .board-open-btn {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 13px 20px;
      background: transparent;
      border: none;
      color: var(--pt-color-navy-800, #16213e);
      font: inherit;
      font-size: 0.9rem;
      cursor: pointer;
      text-align: left;
      min-width: 0;
    }

    .board-open-btn:hover {
      background: rgba(78, 168, 222, 0.08);
    }

    .board-open-btn:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: -2px;
      border-radius: 6px;
      background: rgba(78, 168, 222, 0.08);
    }

    .board-icon {
      flex-shrink: 0;
      opacity: 0.5;
    }

    .board-thumb-wrap {
      flex-shrink: 0;
      width: 88px;
      height: 60px;
      border-radius: 4px;
      overflow: hidden;
      background: rgba(0, 0, 0, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .board-thumb {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .board-info {
      min-width: 0;
      overflow: hidden;
    }

    .board-title {
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--pt-color-navy-800, #16213e);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .board-date {
      font-size: 0.72rem;
      color: rgba(0, 0, 0, 0.45);
      margin-top: 5px;
    }

    .action-btn {
      flex-shrink: 0;
      background: transparent;
      border: none;
      color: rgba(0, 0, 0, 0.4);
      cursor: pointer;
      padding: 8px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      min-height: 44px;
    }

    .action-btn:hover {
      background: rgba(0, 0, 0, 0.06);
      color: rgba(0, 0, 0, 0.7);
    }

    .action-btn:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: -2px;
      background: rgba(78, 168, 222, 0.08);
    }

    .delete-btn {
      flex-shrink: 0;
      background: transparent;
      border: none;
      color: var(--pt-danger);
      cursor: pointer;
      padding: 8px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      min-height: 44px;
    }

    .delete-btn:hover {
      background: color-mix(in srgb, var(--pt-danger) 10%, transparent);
      color: var(--pt-danger);
    }

    .delete-btn:focus-visible {
      outline: 2px solid var(--pt-danger);
      outline-offset: -2px;
      background: color-mix(in srgb, var(--pt-danger) 10%, transparent);
    }

    /* ── Alerts ─────────────────────────────────────────────────── */
    .alert {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 11px 20px;
      font-size: 0.82rem;
      line-height: 1.5;
    }

    .alert svg {
      flex-shrink: 0;
      margin-top: 1px;
    }

    .alert-warning {
      color: #7a4f00;
    }

    .alert-info {
      color: rgba(0, 0, 0, 0.6);
    }

    /* ── Data / action row ──────────────────────────────────────── */
    .data-section {
      padding: 6px 0;
    }

    .action-btn-full {
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
    }

    .action-btn-full:hover {
      background: rgba(78, 168, 222, 0.08);
    }

    .action-btn-full:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: -4px;
    }

    .action-btn-full svg {
      opacity: 0.7;
      flex-shrink: 0;
    }
  `;

  @property({ attribute: false }) boards: SavedBoard[] = [];

  #emit<T>(name: string, detail?: T) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  #pitchLabel(pitchType: string) {
    if (pitchType === 'half') return 'Half (Def.)';
    if (pitchType === 'half-attack') return 'Half (Att.)';
    if (pitchType === 'open') return 'Open Grass';
    return 'Full Pitch';
  }

  render() {
    const saved = this.boards.filter(b => b.name !== 'Untitled Board');

    return html`
      <!-- Section A: Board list -->
      <div class="section">
        ${saved.length ? html`
          <div class="section-label">Saved Boards</div>
          <ul class="boards-list">
            ${saved.map(b => html`
              <li>
                <button class="board-open-btn" aria-label="Open ${b.name}"
                        @click="${() => this.#emit('cb-open-board', { id: b.id })}">
                  ${b.thumbnail ? html`
                    <span class="board-thumb-wrap" aria-hidden="true">
                      <img class="board-thumb" src="${b.thumbnail}" alt="">
                    </span>
                  ` : html`
                    <svg class="board-icon" viewBox="0 0 1200 1200" width="22" height="22"
                         aria-hidden="true" fill="currentColor">
                      <path d="m1050.2 206.34h-900.37c-50.016 0-90.703 40.688-90.703 90.703v605.86c0 50.016 40.688 90.703 90.703 90.703h900.42c50.016 0 90.703-40.688 90.703-90.703v-605.81c0-50.062-40.734-90.75-90.75-90.75zm58.875 696.56c0 32.484-26.391 58.875-58.875 58.875h-900.37c-32.484 0-58.875-26.391-58.875-58.875v-605.81c0-32.484 26.391-58.875 58.875-58.875h900.42c32.484 0 58.875 26.391 58.875 58.875v605.81z"/>
                    </svg>
                  `}
                  <div class="board-info">
                    <div class="board-title">${b.name}</div>
                    <div class="board-date">
                      ${new Date(b.updatedAt).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: 'numeric', minute: '2-digit',
                      })} · ${this.#pitchLabel(b.pitchType)}
                    </div>
                  </div>
                </button>
                <button class="action-btn" title="Duplicate ${b.name}" aria-label="Duplicate ${b.name}"
                        @click="${() => this.#emit('cb-duplicate-board', { board: b })}">
                  <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
                    <rect x="5" y="5" width="8" height="8" rx="1" fill="none"
                          stroke="currentColor" stroke-width="1.3"/>
                    <path d="M3 11V3a1 1 0 0 1 1-1h8" fill="none"
                          stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                  </svg>
                </button>
                <button class="delete-btn" title="Delete ${b.name}" aria-label="Delete ${b.name}"
                        @click="${() => this.#emit('cb-handle-delete-board', { board: b })}">
                  <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor">
                    <path d="M5 2V1h6v1h4v2H1V2h4zm1 4v7h1V6H6zm3 0v7h1V6H9zM2 5l1 10h10l1-10H2z"/>
                  </svg>
                </button>
              </li>
            `)}
          </ul>
        ` : html`
          <div class="alert alert-warning">
            <svg viewBox="0 0 1200 1200" width="18" height="18" fill="#d97706" aria-hidden="true">
              <path d="m600 431.77c-18.637 0-33.75 15.113-33.75 33.75v233.36c0 18.637 15.113 33.75 33.75 33.75s33.75-15.113 33.75-33.75v-233.36c0-18.637-15.113-33.75-33.75-33.75z"/>
              <path d="m600 789.56c-18.637 0-33.75 15.113-33.75 33.75v20.625c0 18.637 15.113 33.75 33.75 33.75s33.75-15.113 33.75-33.75v-20.625c0-18.637-15.113-33.75-33.75-33.75z"/>
              <path d="m1102.7 847.57-401.81-624.9c-22.164-34.426-59.887-55.012-100.88-55.012s-78.711 20.586-100.88 55.051v0.039062l-401.81 624.82c-24.113 37.461-25.762 83.211-4.3867 122.36 21.336 39.113 60.711 62.477 105.3 62.477h803.62c44.551 0 83.926-23.363 105.3-62.477 21.297-39.188 19.648-84.898-4.4648-122.36zm-54.863 89.965c-9.3359 17.137-26.551 27.336-46.051 27.336h-803.59c-19.5 0-36.711-10.164-46.051-27.336-9.3359-17.102-8.625-37.086 1.9141-53.512l401.81-624.83c19.688-30.523 68.551-30.523 88.273 0l401.81 624.82c10.539 16.426 11.215 36.414 1.875 53.516z"/>
            </svg>
            No saved boards yet.
          </div>
        `}
      </div>

      <!-- Section B: Info + import / export -->
      <div class="data-section">
        <div class="alert alert-info">
          <svg viewBox="0 0 1200 1200" width="18" height="18" fill="rgba(0,0,0,0.4)" aria-hidden="true">
            <path d="m600 112.5c-129.29 0-253.29 51.363-344.71 142.79-91.422 91.426-142.79 215.42-142.79 344.71s51.363 253.29 142.79 344.71c91.426 91.422 215.42 142.79 344.71 142.79s253.29-51.363 344.71-142.79c91.422-91.426 142.79-215.42 142.79-344.71-0.14453-129.25-51.555-253.16-142.95-344.55-91.395-91.391-215.3-142.8-344.55-142.95zm0 900c-109.4 0-214.32-43.461-291.68-120.82-77.359-77.355-120.82-182.28-120.82-291.68s43.461-214.32 120.82-291.68c77.355-77.359 182.28-120.82 291.68-120.82s214.32 43.461 291.68 120.82c77.359 77.355 120.82 182.28 120.82 291.68-0.11719 109.37-43.617 214.22-120.95 291.55s-182.18 120.83-291.55 120.95z"/>
            <path d="m675 812.5h-37.5v-312.5c0-9.9453-3.9492-19.484-10.984-26.516-7.0312-7.0352-16.57-10.984-26.516-10.984h-25c-11.887 0.003906-23.066 5.6445-30.137 15.203-7.0664 9.5586-9.1836 21.898-5.707 33.266s12.137 20.414 23.344 24.383v277.15h-37.5c-13.398 0-25.777 7.1484-32.477 18.75-6.6992 11.602-6.6992 25.898 0 37.5 6.6992 11.602 19.078 18.75 32.477 18.75h150c13.398 0 25.777-7.1484 32.477-18.75 6.6992-11.602 6.6992-25.898 0-37.5-6.6992-11.602-19.078-18.75-32.477-18.75z"/>
            <path d="m650 350c0 27.613-22.387 50-50 50s-50-22.387-50-50 22.387-50 50-50 50 22.387 50 50z"/>
          </svg>
          All board data is saved to your browser's local storage.
          Exporting boards as backup SVGs is the best way to keep backups.
        </div>
        <button class="action-btn-full" @click="${() => this.#emit('cb-import-svg')}">
          <svg viewBox="0 0 1200 1200" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="m1100 787.5c-16.566 0.027344-32.449 6.6211-44.164 18.336-11.715 11.715-18.309 27.598-18.336 44.164v150c-0.027344 9.9375-3.9844 19.461-11.012 26.488-7.0273 7.0273-16.551 10.984-26.488 11.012h-800c-9.9375-0.027344-19.461-3.9844-26.488-11.012-7.0273-7.0273-10.984-16.551-11.012-26.488v-150c0-22.328-11.914-42.961-31.25-54.125-19.336-11.168-43.164-11.168-62.5 0-19.336 11.164-31.25 31.797-31.25 54.125v150c0.054688 43.082 17.191 84.383 47.652 114.85 30.465 30.461 71.766 47.598 114.85 47.652h800c43.082-0.054688 84.383-17.191 114.85-47.652 30.461-30.465 47.598-71.766 47.652-114.85v-150c-0.027344-16.566-6.6211-32.449-18.336-44.164-11.715-11.715-27.598-18.309-44.164-18.336z"/>
            <path d="m600 862.5c16.566-0.027344 32.449-6.6211 44.164-18.336 11.715-11.715 18.309-27.598 18.336-44.164v-566.55l197.5 164.55c12.738 10.59 29.156 15.695 45.656 14.199 16.496-1.5 31.727-9.4844 42.344-22.199 10.59-12.738 15.695-29.156 14.199-45.656-1.5-16.496-9.4844-31.727-22.199-42.344l-300-250c-3.1562-2.2227-6.5039-4.1641-10-5.8008-2.2656-1.4922-4.6172-2.8477-7.0508-4.0508-14.562-6.1289-30.984-6.1289-45.551 0-2.5508 1.1875-5.0234 2.5391-7.3984 4.0508-3.5 1.6328-6.8438 3.5742-10 5.8008l-300 250c-13.23 11.031-21.32 27.035-22.359 44.23-1.0391 17.195 5.0664 34.055 16.871 46.602 11.805 12.543 28.262 19.66 45.488 19.668 14.613-0.035156 28.758-5.1641 40-14.5l197.5-164.55v566.55c0.027344 16.566 6.6211 32.449 18.336 44.164 11.715 11.715 27.598 18.309 44.164 18.336z"/>
          </svg>
          Import from SVG
        </button>
        ${saved.length ? html`
          <button class="action-btn-full" @click="${() => this.#emit('cb-export-all-boards')}">
            <svg viewBox="0 0 1200 1200" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="m1100 787.5c-16.566 0.027344-32.449 6.6211-44.164 18.336-11.715 11.715-18.309 27.598-18.336 44.164v150c-0.027344 9.9375-3.9844 19.461-11.012 26.488-7.0273 7.0273-16.551 10.984-26.488 11.012h-800c-9.9375-0.027344-19.461-3.9844-26.488-11.012-7.0273-7.0273-10.984-16.551-11.012-26.488v-150c0-22.328-11.914-42.961-31.25-54.125-19.336-11.168-43.164-11.168-62.5 0-19.336 11.164-31.25 31.797-31.25 54.125v150c0.054688 43.082 17.191 84.383 47.652 114.85 30.465 30.461 71.766 47.598 114.85 47.652h800c43.082-0.054688 84.383-17.191 114.85-47.652 30.461-30.465 47.598-71.766 47.652-114.85v-150c-0.027344-16.566-6.6211-32.449-18.336-44.164-11.715-11.715-27.598-18.309-44.164-18.336z"/>
              <path d="m600 37.5c-16.566 0.027344-32.449 6.6211-44.164 18.336-11.715 11.715-18.309 27.598-18.336 44.164v566.55l-197.5-164.55c-12.738-10.59-29.156-15.695-45.656-14.199-16.496 1.5-31.727 9.4844-42.344 22.199-10.59 12.738-15.695 29.156-14.199 45.656 1.5 16.496 9.4844 31.727 22.199 42.344l300 250c3.1484 2.2344 6.4961 4.1758 10 5.8008 2.2852 1.5312 4.6758 2.9023 7.1484 4.0977 14.566 6.1328 30.988 6.1328 45.551 0 2.4141-1.2031 4.7539-2.5547 7-4.0469 3.5039-1.6289 6.8477-3.5703 10-5.8008l300-250c13.23-11.004 21.336-26.977 22.41-44.148 1.0742-17.176-4.9766-34.031-16.73-46.598-11.758-12.566-28.172-19.73-45.379-19.805-14.613 0.027344-28.762 5.1562-40 14.5l-197.5 164.55v-566.55c-0.027344-16.566-6.6211-32.449-18.336-44.164-11.715-11.715-27.598-18.309-44.164-18.336z"/>
            </svg>
            Export All Boards
          </button>
        ` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cb-my-boards': CbMyBoards;
  }
}
