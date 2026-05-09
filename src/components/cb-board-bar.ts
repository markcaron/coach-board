import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('cb-board-bar')
export class CbBoardBar extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .board-name-bar {
      text-align: center;
      padding: 12px 12px 0;
      font-size: 0.75rem;
      color: var(--pt-text);
      background: var(--pt-bg-body);
      user-select: none;
    }

    .board-name-bar .board-label {
      color: var(--pt-text-muted);
    }

    .board-name-bar.theme-white {
      background: var(--pt-field-area-white);
      color: var(--pt-color-gray-600);
    }

    .board-name-bar.theme-white .unsaved {
      color: var(--pt-color-gray-500);
    }

    .board-name-bar .unsaved {
      opacity: 0.6;
      font-style: italic;
    }
  `;

  @property() boardName: string = '';
  @property({ type: Boolean }) isSaved: boolean = false;
  @property({ type: Boolean }) isWhiteTheme: boolean = false;

  render() {
    return html`
      <div class="board-name-bar ${this.isWhiteTheme ? 'theme-white' : ''}">
        <span class="board-label">Board:</span>
        ${this.isSaved
          ? html`<span class="board-name">${this.boardName}</span>`
          : html`<span class="unsaved">${this.boardName} (unsaved)</span>`}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cb-board-bar': CbBoardBar;
  }
}
