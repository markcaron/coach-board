import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';

export class FrameSelectEvent extends Event {
  frameIndex: number;
  constructor(frameIndex: number) {
    super('frame-select', { bubbles: true, composed: true });
    this.frameIndex = frameIndex;
  }
}

export class FrameAddEvent extends Event {
  constructor() {
    super('frame-add', { bubbles: true, composed: true });
  }
}

export class FrameDeleteEvent extends Event {
  frameIndex: number;
  constructor(frameIndex: number) {
    super('frame-delete', { bubbles: true, composed: true });
    this.frameIndex = frameIndex;
  }
}

export class PlayToggleEvent extends Event {
  constructor() {
    super('play-toggle', { bubbles: true, composed: true });
  }
}

export class SpeedChangeEvent extends Event {
  speed: number;
  constructor(speed: number) {
    super('speed-change', { bubbles: true, composed: true });
    this.speed = speed;
  }
}

export class LoopToggleEvent extends Event {
  constructor() {
    super('loop-toggle', { bubbles: true, composed: true });
  }
}

@customElement('cb-timeline')
export class CbTimeline extends LitElement {
  static styles = css`
    :host {
      display: block;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .timeline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 8px 12px;
      background: var(--pt-bg-primary);
      box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.3);
      user-select: none;
    }

    .frames-left {
      border: none;
      margin: 0;
      padding: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      /* overflow: hidden removed — it clips focus rings on child buttons */
    }

    .frames-scroll {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      min-width: 0;
      /* Padding + negative margin trick: gives focus rings (outline 2px +
         offset 2px = 4px) room to render without being clipped by the
         overflow-x container, while keeping the layout unchanged. */
      padding: 4px 2px;
      margin-block: -4px;
    }

    .frames-scroll-wrap {
      position: relative;
      min-width: 0;
      flex: 1;
    }

    .frames-scroll-wrap::before,
    .frames-scroll-wrap::after {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      width: 16px;
      z-index: 1;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s;
    }

    .frames-scroll-wrap::before {
      left: 0;
      background: linear-gradient(to right, var(--pt-bg-primary), transparent);
    }

    .frames-scroll-wrap::after {
      right: 0;
      background: linear-gradient(to left, var(--pt-bg-primary), transparent);
    }

    .frames-scroll-wrap.shadow-left::before {
      opacity: 1;
    }

    .frames-scroll-wrap.shadow-right::after {
      opacity: 1;
    }

    .frames-scroll::-webkit-scrollbar {
      height: 4px;
    }

    .frames-scroll::-webkit-scrollbar-track {
      background: transparent;
    }

    .frames-scroll::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 2px;
    }

    .frames-left > legend {
      padding: 0;
      margin-right: 6px;
      font-size: 0.85rem;
      color: var(--pt-text);
      white-space: nowrap;
      float: left;
    }

    .controls-right {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
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

    .play-btn {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--pt-text-white);
      border-color: var(--pt-text-white);
      flex-shrink: 0;
    }

    .play-btn:hover {
      background: var(--pt-text);
    }

    .play-btn.playing {
      background: var(--pt-text-white);
      border-color: var(--pt-text-white);
    }

    .play-btn svg {
      width: 20px;
      height: 20px;
    }

    .frame-btn {
      width: 44px;
      min-width: 44px;
      height: 44px;
      font-weight: bold;
      font-size: 0.9rem;
      flex-shrink: 0;
      position: relative;
      overflow: hidden;
    }

    .frame-btn.active {
      background: var(--pt-accent);
      color: var(--pt-text-white);
      border-color: var(--pt-accent);
    }

    .frame-btn.active::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      height: 3px;
      width: calc(var(--playback-progress, 0) * 100%);
      background: rgba(255, 255, 255, 0.7);
      border-radius: 0 2px 0 0;
      transition: width 0.05s linear;
    }

    .add-btn {
      width: 44px;
      min-width: 44px;
      height: 44px;
      font-size: 1.2rem;
      font-weight: bold;
      flex-shrink: 0;
    }

    .delete-btn {
      width: 44px;
      min-width: 44px;
      height: 44px;
      flex-shrink: 0;
      background: transparent;
      color: var(--pt-danger-light);
      border-color: var(--pt-danger-light);
    }

    .delete-btn:hover {
      background: rgba(248, 113, 113, 0.1);
    }

    .delete-btn:disabled {
      opacity: 0.35;
      cursor: default;
      pointer-events: none;
    }

    .select-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
    }

    .select-wrap .caret {
      position: absolute;
      right: 10px;
      pointer-events: none;
      display: inline-block;
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 5px solid currentColor;
    }

    .speed-select {
      appearance: none;
      -webkit-appearance: none;
      padding: 6px 26px 6px 10px;
      min-height: 44px;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      background: var(--pt-bg-surface);
      color: var(--pt-text);
      font: inherit;
      font-size: 0.85rem;
      font-weight: bold;
      cursor: pointer;
    }

    .loop-btn {
      width: 44px;
      height: 44px;
      opacity: 0.5;
    }

    .loop-btn.active {
      opacity: 1;
      background: var(--pt-accent);
      border-color: var(--pt-accent);
      color: var(--pt-text-white);
    }

    .speed-select:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
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
  `;

  @property({ type: Number }) accessor frameCount: number = 0;
  @property({ type: Number }) accessor activeFrame: number = 0;
  @property({ type: Boolean }) accessor isPlaying: boolean = false;
  @property({ type: Number }) accessor playbackProgress: number = 0;
  @property({ type: Number }) accessor speed: number = 1;
  @property({ type: Boolean }) accessor loop: boolean = true;

  @state() private accessor _shadowLeft: boolean = false;
  @state() private accessor _shadowRight: boolean = false;

  @query('.frames-scroll') accessor _scrollEl!: HTMLElement;

  #checkScrollShadows() {
    const el = this._scrollEl;
    if (!el) return;
    this._shadowLeft = el.scrollLeft > 2;
    this._shadowRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 2;
  }

  protected override updated(changedProperties: Map<PropertyKey, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('frameCount') || changedProperties.has('activeFrame')) {
      requestAnimationFrame(() => {
        this.#checkScrollShadows();
        // When a frame was added (frameCount grew), scroll the add button into
        // view — focus stays there so this keeps the focused element visible.
        // Otherwise scroll the newly active frame button into view (e.g. scrubbing).
        const frameAdded = changedProperties.has('frameCount')
          && (changedProperties.get('frameCount') as number) < this.frameCount;
        const target = frameAdded
          ? this.shadowRoot?.querySelector<HTMLElement>('.add-btn')
          : this.shadowRoot?.querySelector<HTMLElement>('.frame-btn.active');
        target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      });
    }
  }

  #onSpeedChange(e: Event) {
    const val = parseFloat((e.target as HTMLSelectElement).value);
    this.dispatchEvent(new SpeedChangeEvent(val));
  }

  render() {
    const frames = Array.from({ length: this.frameCount }, (_, i) => i);

    return html`
      <div class="timeline">
        <fieldset class="frames-left">
          <legend>Frames</legend>
          <div class="frames-scroll-wrap ${this._shadowLeft ? 'shadow-left' : ''} ${this._shadowRight ? 'shadow-right' : ''}">
          <div class="frames-scroll" @scroll="${this.#checkScrollShadows}">
            ${frames.map(i => html`
              <button class="frame-btn ${i === this.activeFrame ? 'active' : ''}"
                      title="Frame ${i}"
                      aria-label="Frame ${i}"
                      aria-pressed="${i === this.activeFrame}"
                      style="${i === this.activeFrame && this.isPlaying ? `--playback-progress: ${this.playbackProgress}` : ''}"
                      @click="${() => this.dispatchEvent(new FrameSelectEvent(i))}">
                ${i}
              </button>
            `)}

            <button class="add-btn" title="Add frame" aria-label="Add frame"
                    @click="${() => this.dispatchEvent(new FrameAddEvent())}">+</button>
          </div>
          </div>
          ${this.frameCount > 1 ? html`
            <button class="delete-btn" title="Delete frame" aria-label="Delete frame"
                    @click="${() => this.dispatchEvent(new FrameDeleteEvent(this.activeFrame === 0 ? this.frameCount - 1 : this.activeFrame))}">
              <svg viewBox="0 0 16 16" width="14" height="14">
                <path d="M5 2V1h6v1h4v2H1V2h4zm1 4v7h1V6H6zm3 0v7h1V6H9zM2 5l1 10h10l1-10H2z" fill="currentColor"/>
              </svg>
            </button>
          ` : nothing}
        </fieldset>

        <div class="controls-right">
          <button class="play-btn ${this.isPlaying ? 'playing' : ''}"
                  title="${this.isPlaying ? 'Pause' : 'Play'}"
                  aria-label="${this.isPlaying ? 'Pause' : 'Play'}"
                  @click="${() => this.dispatchEvent(new PlayToggleEvent())}">
            ${this.isPlaying
              ? html`<svg viewBox="0 0 16 16"><rect x="4" y="3" width="3" height="10" rx="0.5" fill="var(--pt-bg-primary)"/><rect x="9" y="3" width="3" height="10" rx="0.5" fill="var(--pt-bg-primary)"/></svg>`
              : html`<svg viewBox="0 0 16 16"><path d="M4.5 2l9 6-9 6z" fill="var(--pt-bg-primary)"/></svg>`
            }
          </button>

          <label class="visually-hidden" for="speed-select">Playback speed</label>
          <div class="select-wrap">
            <select id="speed-select" class="speed-select"
                    @change="${this.#onSpeedChange}">
              <option value="0.5" ?selected="${this.speed === 0.5}">0.5x</option>
              <option value="1" ?selected="${this.speed === 1}">1x</option>
              <option value="2" ?selected="${this.speed === 2}">2x</option>
            </select>
            <span class="caret"></span>
          </div>

          <button class="loop-btn ${this.loop ? 'active' : ''}"
                  title="${this.loop ? 'Loop on' : 'Loop off'}"
                  aria-label="${this.loop ? 'Loop on' : 'Loop off'}"
                  aria-pressed="${this.loop}"
                  @click="${() => this.dispatchEvent(new LoopToggleEvent())}">
            <svg viewBox="0 0 1200 1200" width="16" height="16">
              <path d="m200 650c13.262 0 25.98-5.2695 35.355-14.645s14.645-22.094 14.645-35.355v-200c0-13.262 5.2695-25.98 14.645-35.355s22.094-14.645 35.355-14.645h602.85l-82.152 59.5c-11.074 7.6406-18.605 19.422-20.887 32.684-2.2773 13.262 0.88281 26.879 8.7695 37.781s19.832 18.164 33.141 20.148c13.309 1.9805 26.855-1.4844 37.578-9.6133l109.55-79.301c37.168-24.992 59.953-66.422 61.148-111.2-1.1953-44.777-23.98-86.207-61.148-111.2l-109.55-79.301c-14.484-9.9922-33.156-11.633-49.16-4.3242-16.008 7.3086-26.992 22.496-28.93 39.984-1.9336 17.488 5.4688 34.707 19.488 45.34l82.152 59.5h-602.85c-39.781 0-77.938 15.805-106.07 43.934s-43.934 66.285-43.934 106.07v200c0 13.262 5.2695 25.98 14.645 35.355s22.094 14.645 35.355 14.645z" fill="currentColor"/>
              <path d="m211.15 1011.2 109.55 79.301c14.484 9.9922 33.156 11.633 49.16 4.3242 16.008-7.3086 26.992-22.496 28.93-39.984 1.9336-17.488-5.4688-34.707-19.488-45.34l-82.152-59.5h602.85c39.781 0 77.938-15.805 106.07-43.934s43.934-66.285 43.934-106.07v-200c0-17.863-9.5312-34.371-25-43.301-15.469-8.9336-34.531-8.9336-50 0-15.469 8.9297-25 25.438-25 43.301v200c0 13.262-5.2695 25.98-14.645 35.355s-22.094 14.645-35.355 14.645h-602.85l82.148-59.5h0.003906c14.02-10.633 21.422-27.852 19.488-45.34-1.9375-17.488-12.922-32.676-28.93-39.984-16.004-7.3086-34.676-5.668-49.16 4.3242l-109.55 79.301c-38.066 24.156-61.133 66.113-61.133 111.2s23.066 87.043 61.133 111.2z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cb-timeline': CbTimeline;
  }
}
