import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import type { BoardSummary } from './cb-dialogs.js';

/**
 * Board summary content for the Board Summary side sheet.
 *
 * Displays a breakdown of what's on the board and a notes/instructions
 * textarea. Emits two events:
 *
 *  - cb-board-notes-input  { value: string }   — live updates as user types
 *  - cb-board-summary-save                      — user clicked Save; parent
 *                                                 should close the sheet and
 *                                                 persist the notes.
 */
@customElement('cb-board-summary')
export class CbBoardSummary extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 20px;
      box-sizing: border-box;
    }

    .board-name {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--pt-color-navy-800, #16213e);
      margin: 0 0 16px;
    }

    .summary-section {
      margin-bottom: 12px;
    }

    .summary-section h3 {
      font-size: 0.85rem;
      font-weight: 600;
      color: rgba(0, 0, 0, 0.55);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 0 0 4px;
    }

    .summary-section p,
    .summary-section ul {
      margin: 0;
      padding: 0;
      font-size: 0.85rem;
      color: var(--pt-color-navy-800, #16213e);
      list-style: none;
    }

    .summary-section li {
      padding: 2px 0;
    }

    .notes-label {
      font-size: 0.85rem;
      font-weight: 600;
      color: rgba(0, 0, 0, 0.55);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 0 0 8px;
    }

    .notes-textarea {
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      font-size: 0.85rem;
      font-family: inherit;
      border: 1.5px solid rgba(0, 0, 0, 0.14);
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.03);
      color: var(--pt-color-navy-800, #16213e);
      resize: vertical;
      min-height: 80px;
    }

    .notes-textarea::placeholder {
      color: rgba(0, 0, 0, 0.35);
    }

    .notes-textarea:focus {
      outline: 2px solid var(--pt-accent);
      outline-offset: 1px;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 16px;
      gap: 8px;
    }

    .save-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 10px 24px;
      min-height: 44px;
      background: var(--pt-success-hover, #16a34a);
      border: none;
      border-radius: 6px;
      color: #fff;
      font: inherit;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }

    .save-btn:hover {
      background: var(--pt-success-btn-hover, #15803d);
    }

    .save-btn:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .divider {
      height: 1px;
      background: rgba(0, 0, 0, 0.08);
      margin: 16px 0;
    }
  `;

  @property({ attribute: false }) summary: BoardSummary | null = null;
  @property() boardNotes = '';

  #emit<T>(name: string, detail?: T) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  render() {
    const s = this.summary;
    return html`
      ${s ? html`
        <p class="board-name">${s.name}</p>

        <div class="summary-section">
          <h3>Pitch</h3>
          <p>${s.pitchLabel} · ${s.orientation}</p>
        </div>

        ${s.playersByColor.size > 0 || s.coachCount > 0 ? html`
          <div class="summary-section">
            <h3>Players</h3>
            <ul>
              ${[...s.playersByColor.entries()].map(([color, count]) => html`<li>${count} ${color}</li>`)}
              ${s.coachCount > 0 ? html`<li>${s.coachCount} Coach${s.coachCount > 1 ? 'es' : ''}</li>` : nothing}
            </ul>
          </div>
        ` : nothing}

        ${s.equipByKind.size > 0 || s.conesByColor.size > 0 || s.dummiesByColor.size > 0 || s.polesByColor.size > 0 ? html`
          <div class="summary-section">
            <h3>Equipment</h3>
            <ul>
              ${[...s.equipByKind.entries()].map(([kind, count]) => html`<li>${count} ${kind}${count > 1 ? 's' : ''}</li>`)}
              ${s.conesByColor.size > 0 ? html`<li>${[...s.conesByColor.values()].reduce((a, b) => a + b, 0)} Cone${[...s.conesByColor.values()].reduce((a, b) => a + b, 0) > 1 ? 's' : ''} (${[...s.conesByColor.entries()].map(([c, n]) => `${n} ${c}`).join(', ')})</li>` : nothing}
              ${s.dummiesByColor.size > 0 ? html`<li>${[...s.dummiesByColor.values()].reduce((a, b) => a + b, 0)} Dumm${[...s.dummiesByColor.values()].reduce((a, b) => a + b, 0) > 1 ? 'ies' : 'y'} (${[...s.dummiesByColor.entries()].map(([c, n]) => `${n} ${c}`).join(', ')})</li>` : nothing}
              ${s.polesByColor.size > 0 ? html`<li>${[...s.polesByColor.values()].reduce((a, b) => a + b, 0)} Pole${[...s.polesByColor.values()].reduce((a, b) => a + b, 0) > 1 ? 's' : ''} (${[...s.polesByColor.entries()].map(([c, n]) => `${n} ${c}`).join(', ')})</li>` : nothing}
            </ul>
          </div>
        ` : nothing}

        ${s.linesByStyle.size > 0 ? html`
          <div class="summary-section">
            <h3>Lines</h3>
            <ul>
              ${[...s.linesByStyle.entries()].map(([style, count]) => html`<li>${count} ${style}${count > 1 ? 's' : ''}</li>`)}
            </ul>
          </div>
        ` : nothing}

        ${s.shapeCount > 0 ? html`
          <div class="summary-section">
            <h3>Shapes</h3>
            <p>${s.shapeCount} shape${s.shapeCount > 1 ? 's' : ''}</p>
          </div>
        ` : nothing}

        ${s.textCount > 0 ? html`
          <div class="summary-section">
            <h3>Text</h3>
            <p>${s.textCount} text item${s.textCount > 1 ? 's' : ''}</p>
          </div>
        ` : nothing}

        ${s.frameCount > 0 ? html`
          <div class="summary-section">
            <h3>Animation</h3>
            <p>${s.frameCount} frame${s.frameCount > 1 ? 's' : ''}</p>
          </div>
        ` : nothing}

        <div class="divider"></div>
      ` : nothing}

      <div class="notes-label" id="cb-board-summary-notes-label">Notes &amp; Instructions</div>
      <textarea class="notes-textarea"
                aria-labelledby="cb-board-summary-notes-label"
                rows="4"
                placeholder="Add notes, drills, instructions…"
                .value="${this.boardNotes}"
                @input="${(e: Event) => this.#emit('cb-board-notes-input', { value: (e.target as HTMLTextAreaElement).value })}"></textarea>
      <div class="actions">
        <button class="save-btn" @click="${() => this.#emit('cb-board-summary-save')}">Save</button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cb-board-summary': CbBoardSummary;
  }
}
