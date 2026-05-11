import { LitElement, html, css } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';

/**
 * Generic slide-in side sheet shell.
 *
 * Renders a position:fixed sheet from the right edge plus a dimming backdrop.
 * The parent drives open/close by toggling the `open` property; the sheet
 * emits a bubbling `close` CustomEvent whenever the user requests a close
 * (Escape key, backdrop click, or the built-in × button).
 *
 * The parent is responsible for:
 *  - Setting `inert` on any content that should be blocked while the sheet is open.
 *  - Translating the main layout via a CSS class (e.g. `.sheet-open`) so the
 *    board slides left to visually "push" content aside.
 *  - Placing <cb-side-sheet> outside any transformed ancestor (e.g. outside
 *    .app-wrap) so position:fixed uses the viewport as its containing block.
 *
 * Focus: on open, focus moves to the × close button; on close, focus returns
 * to the element that was focused when the sheet opened.
 *
 * Slot: default slot is the panel body content.
 */
@customElement('cb-side-sheet')
export class CbSideSheet extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    /* ── Backdrop ─────────────────────────────────────────────────── */
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 50;
      background: rgba(0, 0, 0, 0.3);
      opacity: 0;
      pointer-events: none;
      transition: opacity 420ms cubic-bezier(0.33, 1, 0.68, 1);
    }

    .backdrop.open {
      opacity: 1;
      pointer-events: auto;
    }

    /* ── Sheet ────────────────────────────────────────────────────── */
    .sheet {
      position: fixed;
      top: 0;
      bottom: 0;
      right: 0;
      z-index: 51;
      width: var(--cb-side-sheet-w, min(400px, 100vw));
      background: white;
      color: var(--pt-color-navy-800, #16213e);
      color-scheme: light;
      border-left: 1px solid rgba(0, 0, 0, 0.08);
      box-shadow: -2px 0 24px rgba(0, 0, 0, 0.15);
      transform: translateX(100%);
      transition: transform 420ms cubic-bezier(0.33, 1, 0.68, 1);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sheet.open {
      transform: translateX(0);
    }

    /* ── Header ───────────────────────────────────────────────────── */
    .sheet-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 16px 14px 20px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
      flex-shrink: 0;
    }

    .sheet-header h2 {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--pt-color-navy-800, #16213e);
    }

    /* 44×44 px touch target (WCAG 2.5.5) */
    .sheet-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: rgba(0, 0, 0, 0.55);
      cursor: pointer;
      padding: 0;
      font: inherit;
      flex-shrink: 0;
      transition: background 0.12s, color 0.12s;
    }

    .sheet-close:hover {
      background: rgba(0, 0, 0, 0.06);
      color: rgba(0, 0, 0, 0.85);
    }

    .sheet-close:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: -2px;
      background: color-mix(in srgb, var(--pt-accent) 8%, transparent);
    }

    /* ── Body (slotted content) ───────────────────────────────────── */
    .sheet-body {
      flex: 1;
      min-height: 0; /* prevents flex item from overflowing — required for overflow-y: auto to scroll */
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    /* ── Reduced motion ───────────────────────────────────────────── */
    @media (prefers-reduced-motion: reduce) {
      .backdrop,
      .sheet {
        transition: none;
      }
    }
  `;

  @property({ type: Boolean }) open = false;
  @property() heading = '';

  get #titleId() {
    return `cb-side-sheet-title-${this.heading.toLowerCase().replace(/\s+/g, '-')}`;
  }

  @query('.sheet-close') private _closeBtn!: HTMLButtonElement;

  #returnFocus: HTMLElement | null = null;

  override updated(changed: Map<PropertyKey, unknown>) {
    if (!changed.has('open')) return;
    if (this.open) {
      this.#returnFocus = document.activeElement as HTMLElement | null;
      this.updateComplete.then(() => this._closeBtn?.focus());
    } else {
      this.#returnFocus?.focus();
      this.#returnFocus = null;
    }
  }

  #close() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  #onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.#close();
    }
  }

  render() {
    return html`
      <div class="backdrop ${this.open ? 'open' : ''}"
           @click="${this.#close}"></div>
      <div class="sheet ${this.open ? 'open' : ''}"
           role="dialog"
           aria-modal="true"
           aria-hidden="${ifDefined(!this.open ? 'true' : undefined)}"
           aria-labelledby="${this.#titleId}"
           @keydown="${this.#onKeydown}">
        <div class="sheet-header">
          <h2 id="${this.#titleId}">${this.heading}</h2>
          <button class="sheet-close" aria-label="Close ${this.heading}"
                  @click="${this.#close}">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none"
                 stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
                 aria-hidden="true">
              <line x1="4" y1="4" x2="16" y2="16"/>
              <line x1="16" y1="4" x2="4" y2="16"/>
            </svg>
          </button>
        </div>
        <div class="sheet-body">
          <slot></slot>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cb-side-sheet': CbSideSheet;
  }
}
