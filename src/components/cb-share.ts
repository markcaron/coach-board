import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';

import type { Player, Line, Equipment, Shape, TextItem, AnimationFrame, FieldTheme, PitchType } from '../lib/types.js';
import { COLORS } from '../lib/types.js';
import type { FieldOrientation } from '../lib/field.js';

@customElement('cb-share')
export class CbShare extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    dialog {
      border: none;
      border-radius: 12px;
      padding: 0;
      background: var(--pt-bg-secondary);
      color: var(--pt-text);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
      max-width: min(480px, 94vw);
      width: 100%;
    }

    dialog::backdrop {
      background: rgba(0, 0, 0, 0.5);
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px 12px;
      border-bottom: 1px solid var(--pt-border);
    }

    .dialog-header h2 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--pt-text);
    }

    .dialog-close {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--pt-text-muted);
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .dialog-close:hover {
      background: var(--pt-bg-hover);
      color: var(--pt-text);
    }

    .dialog-body {
      padding: 20px;
    }

    .dialog-body p {
      margin: 0 0 4px;
      font-size: 0.875rem;
      color: var(--pt-text);
    }

    .share-url {
      display: block;
      margin-top: 24px;
      padding: 10px 12px;
      background: var(--pt-bg-primary);
      border: 1px solid var(--pt-border);
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.7rem;
      color: var(--pt-text-muted);
      word-break: break-all;
      max-height: 80px;
      overflow-y: auto;
      user-select: all;
    }

    .share-editable-label {
      display: flex;
      align-items: center;
      margin-top: 12px;
      gap: 8px;
      font-size: 0.85rem;
      color: var(--pt-text);
      cursor: pointer;
      margin-right: auto;
    }

    .confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 20px;
      align-items: center;
    }

    .cancel-btn {
      padding: 8px 16px;
      border-radius: 6px;
      border: 1px solid var(--pt-border);
      background: transparent;
      color: var(--pt-text);
      cursor: pointer;
      font-size: 0.875rem;
    }

    .cancel-btn:hover {
      background: var(--pt-bg-hover);
    }

    .confirm-success {
      padding: 8px 16px;
      border-radius: 6px;
      border: none;
      background: var(--pt-color-green-600);
      color: white;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .confirm-success:hover {
      background: var(--pt-color-green-700);
    }
  `;

  // ── Board data for serialization ────────────────────────────────
  @property({ attribute: false }) accessor players: Player[] = [];
  @property({ attribute: false }) accessor lines: Line[] = [];
  @property({ attribute: false }) accessor equipment: Equipment[] = [];
  @property({ attribute: false }) accessor shapes: Shape[] = [];
  @property({ attribute: false }) accessor textItems: TextItem[] = [];
  @property({ attribute: false }) accessor animationFrames: AnimationFrame[] = [];
  @property() accessor fieldTheme: FieldTheme = 'green';
  @property() accessor fieldOrientation: FieldOrientation = 'horizontal';
  @property() accessor pitchType: PitchType = 'full';
  @property() accessor boardName: string = '';
  @property({ type: Boolean }) accessor playbackLoop: boolean = false;

  // ── SVG reference for thumbnail upload ──────────────────────────
  @property({ attribute: false }) accessor svgEl: SVGSVGElement | null = null;

  // ── Internal state ──────────────────────────────────────────────
  @state() private accessor _shareMessage: string = '';
  @state() private accessor _shareUrl: string = '';
  @state() private accessor _shareEditable: boolean = false;

  #shareCompressed: string = '';
  #shareShortId: string = '';
  #lastSharedData: string = '';

  @query('dialog') private accessor _dialog!: HTMLDialogElement;

  // ── Public API ──────────────────────────────────────────────────

  async triggerShare() {
    const data = JSON.stringify({
      name: this.boardName || 'Untitled Board',
      players: this.players,
      lines: this.lines,
      equipment: this.equipment,
      shapes: this.shapes,
      textItems: this.textItems,
      animationFrames: this.animationFrames,
      fieldTheme: this.fieldTheme,
      fieldOrientation: this.fieldOrientation,
      pitchType: this.pitchType,
      playbackLoop: this.playbackLoop,
    });

    const boardChanged = data !== this.#lastSharedData;
    if (boardChanged) {
      this.#shareShortId = '';
      this.#shareCompressed = '';
    }

    if (!this.#shareShortId) {
      this._shareMessage = 'Generating link\u2026';
      this._shareUrl = '';
      requestAnimationFrame(() => this._dialog?.showModal());

      try {
        const res = await fetch('/api/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: data,
        });
        if (res.ok) {
          const { id } = await res.json() as { id: string };
          this.#shareShortId = id;
          this.#lastSharedData = data;
          this.#uploadThumbnail(id).catch(() => {});
        }
      } catch { /* API unavailable, fall back to hash */ }
    }

    if (!this.#shareShortId) {
      const { compressToEncodedURIComponent } = await import('lz-string');
      this.#shareCompressed = compressToEncodedURIComponent(data);
      this.#lastSharedData = data;
      const url = this.#buildShareUrl();
      if (url.length > 8000) {
        this._shareMessage = 'This board is too large to share as a link. Use "Export as SVG" instead and share the file.';
        this._shareUrl = '';
        return;
      }
    }

    this._shareUrl = this.#buildShareUrl();
    this._shareMessage = 'Copy the link to share with players, other coaches, etc.';
    if (!this._dialog?.open) {
      requestAnimationFrame(() => this._dialog?.showModal());
    }
  }

  // ── Private helpers ─────────────────────────────────────────────

  #buildShareUrl() {
    const mode = this._shareEditable ? 'edit' : 'view';
    if (this.#shareShortId) {
      return `${window.location.origin}/s/${this.#shareShortId}?mode=${mode}`;
    }
    return `${window.location.origin}${window.location.pathname}#board=${this.#shareCompressed}&mode=${mode}`;
  }

  #onEditableChange(e: Event) {
    this._shareEditable = (e.target as HTMLInputElement).checked;
    this._shareUrl = this.#buildShareUrl();
  }

  async #copyAndClose() {
    try {
      await navigator.clipboard.writeText(this._shareUrl);
      this._dialog?.close();
    } catch { /* leave dialog open so URL remains visible for manual copy */ }
  }

  async #uploadThumbnail(shareId: string) {
    const blob = await this.#renderThumbnail();
    if (!blob) return;
    await fetch(`/api/share/${shareId}/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
    });
  }

  #renderThumbnail(): Promise<Blob | null> {
    return new Promise(resolve => {
      try {
        if (!this.svgEl) { resolve(null); return; }
        const svgClone = this.svgEl.cloneNode(true) as SVGSVGElement;
        svgClone.querySelectorAll('[data-kind="rotate"]').forEach(el => el.remove());
        svgClone.querySelectorAll('[stroke-dasharray="0.5,0.3"], [stroke-dasharray="0.4,0.25"]').forEach(el => el.remove());
        svgClone.querySelectorAll('[data-kind="line-start"], [data-kind="line-end"], [data-kind="line-control"]').forEach(el => el.remove());
        svgClone.querySelectorAll(`[stroke="${COLORS.annotation}"]`).forEach(el => el.remove());
        svgClone.querySelectorAll('[stroke="transparent"]').forEach(el => el.remove());

        const vb = this.svgEl.viewBox.baseVal;
        const scale = 3;
        const w = vb.width * scale;
        const h = vb.height * scale;
        svgClone.setAttribute('width', String(w));
        svgClone.setAttribute('height', String(h));

        const svgString = new XMLSerializer().serializeToString(svgClone);
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(svgUrl);
          canvas.toBlob(blob => resolve(blob), 'image/png');
        };
        img.onerror = () => { URL.revokeObjectURL(svgUrl); resolve(null); };
        img.src = svgUrl;
      } catch { resolve(null); }
    });
  }

  // ── Template ────────────────────────────────────────────────────

  render() {
    return html`
      <dialog>
        <div class="dialog-header">
          <h2>Share</h2>
          <button class="dialog-close" aria-label="Close" title="Close"
                  @click="${() => this._dialog?.close()}">
            <svg viewBox="0 0 16 16" width="16" height="16">
              <path d="M 4,4 L 12,12 M 12,4 L 4,12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <div class="dialog-body">
          <p>${this._shareMessage}</p>
          ${this._shareUrl ? html`
            <code class="share-url">${this._shareUrl}</code>
            <label class="share-editable-label">
              <input type="checkbox" .checked="${this._shareEditable}"
                     @change="${this.#onEditableChange}" />
              Keep editable
            </label>
          ` : nothing}
          <div class="confirm-actions">
            <button class="cancel-btn" @click="${() => this._dialog?.close()}">Close</button>
            ${this._shareUrl ? html`
              <button class="confirm-success" @click="${this.#copyAndClose}">
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style="flex-shrink:0">
                  <rect x="5" y="5" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M3 11V3a1 1 0 0 1 1-1h8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg>
                Copy link
              </button>
            ` : nothing}
          </div>
        </div>
      </dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cb-share': CbShare;
  }
}
