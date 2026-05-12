import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

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
      touch-action: manipulation;
    }

    .board-name {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--pt-color-navy-800, #16213e);
      margin: 0 0 16px;
    }

    .summary-section {
      margin-bottom: 14px;
    }

    .summary-section h3,
    .notes-label {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 0.82rem;
      font-weight: 600;
      color: rgba(0, 0, 0, 0.72);
      margin: 0 0 5px;
    }

    .notes-label {
      margin-bottom: 8px;
    }

    .summary-section h3 svg,
    .notes-label svg {
      flex-shrink: 0;
      color: rgba(0, 0, 0, 0.55);
    }

    .summary-section p,
    .summary-section ul {
      /* indent to align with heading text, past the 16px icon + 7px gap */
      margin: 0;
      padding: 0 0 0 23px;
      font-size: 0.85rem;
      color: var(--pt-color-navy-800, #16213e);
      list-style: none;
    }

    .summary-section li {
      padding: 2px 0;
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
      filter: brightness(0.88);
    }

    .save-btn:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
    }

    .save-shortcut-hint {
      font-size: 0.72rem;
      font-weight: 400;
      opacity: 0.7;
      margin-left: 4px;
    }

    .divider {
      height: 1px;
      background: rgba(0, 0, 0, 0.08);
      margin: 16px 0;
    }

    .show-more-btn {
      display: flex;
      align-items: center;
      gap: 5px;
      background: none;
      border: none;
      padding: 4px 0 12px;
      font: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--pt-accent, #4ea8de);
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .show-more-btn:hover {
      color: var(--pt-accent-hover, #70bceb);
    }

    .show-more-btn:focus-visible {
      outline: 2px solid var(--pt-accent);
      outline-offset: 2px;
      border-radius: 3px;
    }

    .show-more-btn svg {
      transition: transform 0.2s ease;
    }

    .show-more-btn.expanded svg {
      transform: rotate(180deg);
    }

    .extra-sections {
      display: none;
    }

    .extra-sections.expanded {
      display: contents;
    }
  `;

  @property({ attribute: false }) summary: BoardSummary | null = null;
  @property() boardNotes = '';

  @state() private _expanded = false;

  #emit<T>(name: string, detail?: T) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  #onNotesKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      this.#emit('cb-board-summary-save');
    }
  }

  // ── Section icons ─────────────────────────────────────────────────────────

  #iconPitch() {
    return html`<svg viewBox="0 0 1600 1600" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M1214.45 54.9997H385.56C309.309 54.9997 247.16 117.052 247.16 193.346V1406.75C247.16 1483 309.259 1545.09 385.56 1545.09H1214.47C1290.72 1545.09 1352.87 1483.04 1352.87 1406.75L1352.86 193.293C1352.86 117.042 1290.71 54.9863 1214.46 54.9863L1214.45 54.9997ZM639.4 145H960.2L958.997 292.2L639.397 290.601L639.4 145ZM960.6 1455H639.8L641.05 1307.85L960.65 1309.45L960.655 1455L960.6 1455ZM1262.8 1406.7C1262.8 1433.35 1241.1 1455 1214.45 1455H1050.65V1309.45C1050.65 1258.9 1009.55 1217.8 959 1217.8L641 1217.81C590.448 1217.81 549.349 1258.91 549.349 1309.46V1455H385.549C358.899 1455 337.2 1433.35 337.2 1406.7L337.195 845.009H569.941C591.04 952.858 686.092 1034.61 799.995 1034.61C913.897 1034.61 1008.99 952.86 1030.05 845.009H1262.79L1262.8 1406.7ZM936.693 845.004C917.641 902.602 863.944 944.556 800 944.556C736.056 944.556 682.349 902.608 663.307 845.004H936.693ZM663.293 755.004C682.345 697.405 736.043 655.452 799.987 655.452C863.931 655.452 917.637 697.4 936.68 755.004H663.293ZM1262.79 755.004H1030.04C1008.94 647.154 913.889 565.404 799.987 565.404C686.084 565.404 590.987 647.153 569.933 755.004H337.187V193.31C337.187 166.66 358.884 145.008 385.536 145.008H549.336V290.554C549.336 341.106 590.435 382.205 640.987 382.205H958.933C1009.49 382.205 1050.58 341.106 1050.58 290.554V145.008H1214.38C1241.03 145.008 1262.73 166.658 1262.73 193.31V755.004H1262.79Z"/>
    </svg>`;
  }

  #iconPlayers() {
    return html`<svg viewBox="0 0 1600 1600" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M1282.21 271.295L1271.29 314.951L1271.33 314.96L1271.36 314.969L1282.21 271.295ZM1337.62 314.524L1297.92 335.72L1380.98 302.48L1337.62 314.524ZM1337.61 314.489L1377.32 293.321L1294.25 326.533L1337.61 314.489ZM1348.97 335.807L1385.36 362.276L1401.93 339.496L1388.68 314.639L1348.97 335.807ZM1193.77 549.189L1157.38 522.72L1157.23 522.923L1157.08 523.128L1193.77 549.189ZM1189.66 561.957L1234.66 561.963V561.958L1189.66 561.957ZM1189.55 1406.03V1451.03H1234.54L1234.55 1406.04L1189.55 1406.03ZM410.291 1406.03H365.291V1451.03H410.291V1406.03ZM406.178 549.224L369.786 575.693L369.856 575.789L369.926 575.885L406.178 549.224ZM250.973 335.842L211.263 314.673L198.011 339.531L214.581 362.312L250.973 335.842ZM262.337 314.524L222.641 293.33L222.634 293.342L222.627 293.355L262.337 314.524ZM317.751 271.295L306.837 227.638L306.826 227.641L306.815 227.644L317.751 271.295ZM626.811 194.033H671.811V136.399L615.897 150.377L626.811 194.033ZM799.979 367.168V412.168H799.979L799.979 367.168ZM973.146 194.033L984.06 150.377L928.146 136.399V194.033H973.146ZM366.973 568.837H411.973V554.198L403.36 542.361L366.973 568.837ZM366.973 800.033L339.981 836.04L411.973 890.007V800.033H366.973ZM106.973 605.129L67.2707 583.945L49.1054 617.99L79.9811 641.135L106.973 605.129ZM228.145 378.033L264.532 351.558L222.263 293.464L188.443 356.849L228.145 378.033ZM1492.97 605.023L1519.8 641.156L1550.93 618.041L1532.67 583.832L1492.97 605.023ZM1232.97 798.033H1187.97V887.483L1259.8 834.165L1232.97 798.033ZM1232.97 568.768L1196.59 542.286L1187.97 554.125V568.768H1232.97ZM1371.8 378.033L1411.5 356.842L1377.68 293.488L1335.42 351.551L1371.8 378.033ZM1282.21 271.295L1271.36 314.969C1282.69 317.781 1292.37 325.315 1297.92 335.72L1337.62 314.524L1377.31 293.329C1359.82 260.559 1329.23 236.603 1293.05 227.62L1282.21 271.295ZM1337.62 314.524L1380.98 302.48L1380.97 302.445L1337.61 314.489L1294.25 326.533L1294.26 326.568L1337.62 314.524ZM1337.61 314.489L1297.9 335.657L1309.26 356.974L1348.97 335.807L1388.68 314.639L1377.32 293.321L1337.61 314.489ZM1348.97 335.807L1312.58 309.337L1157.38 522.72L1193.77 549.189L1230.16 575.659L1385.36 362.276L1348.97 335.807ZM1193.77 549.189L1157.08 523.128C1149.19 534.24 1144.66 547.735 1144.66 561.956L1189.66 561.957L1234.66 561.958C1234.66 566.981 1233.04 571.604 1230.45 575.251L1193.77 549.189ZM1189.66 561.957L1144.66 561.951L1144.55 1406.03L1189.55 1406.03L1234.55 1406.04L1234.66 561.963L1189.66 561.957ZM1189.55 1406.03V1361.03H410.291V1406.03V1451.03H1189.55V1406.03ZM410.291 1406.03H455.291V561.992H410.291H365.291V1406.03H410.291ZM410.291 561.992H455.291C455.291 548.279 451.095 534.345 442.429 522.562L406.178 549.224L369.926 575.885C366.672 571.46 365.291 566.508 365.291 561.992H410.291ZM406.178 549.224L442.569 522.754L287.364 309.372L250.973 335.842L214.581 362.312L369.786 575.693L406.178 549.224ZM250.973 335.842L290.682 357.011L302.047 335.694L262.337 314.524L222.627 293.355L211.263 314.673L250.973 335.842ZM262.337 314.524L302.033 335.719C307.557 325.374 317.223 317.818 328.686 314.946L317.751 271.295L306.815 227.644C270.766 236.675 240.169 260.5 222.641 293.33L262.337 314.524ZM317.751 271.295L328.665 314.951L637.724 237.69L626.811 194.033L615.897 150.377L306.837 227.638L317.751 271.295ZM626.811 194.033H581.811C581.811 314.497 679.513 412.168 799.979 412.168V367.168V322.168C729.202 322.168 671.811 264.775 671.811 194.033H626.811ZM799.979 367.168L799.979 412.168C920.444 412.168 1018.15 314.497 1018.15 194.033H973.146H928.146C928.146 264.775 870.755 322.168 799.978 322.168L799.979 367.168ZM973.146 194.033L962.233 237.69L1271.29 314.951L1282.21 271.295L1293.12 227.638L984.06 150.377L973.146 194.033ZM366.973 568.837H321.973V800.033H366.973H411.973V568.837H366.973ZM366.973 800.033L393.964 764.027L133.964 569.123L106.973 605.129L79.9811 641.135L339.981 836.04L366.973 800.033ZM106.973 605.129L146.675 626.313L267.846 399.217L228.145 378.033L188.443 356.849L67.2707 583.945L106.973 605.129ZM228.145 378.033L191.757 404.509L330.585 595.312L366.973 568.837L403.36 542.361L264.532 351.558L228.145 378.033ZM1492.97 605.023L1466.15 568.891L1206.15 761.901L1232.97 798.033L1259.8 834.165L1519.8 641.156L1492.97 605.023ZM1232.97 798.033H1277.97V568.768H1232.97H1187.97V798.033H1232.97ZM1232.97 568.768L1269.36 595.249L1408.18 404.515L1371.8 378.033L1335.42 351.551L1196.59 542.286L1232.97 568.768ZM1371.8 378.033L1332.1 399.225L1453.27 626.215L1492.97 605.023L1532.67 583.832L1411.5 356.842L1371.8 378.033Z"/>
      <path d="M994.839 519.149C1030.44 519.15 1059.28 547.98 1059.28 583.575C1059.28 619.17 1030.44 648 994.839 648C959.237 648 930.401 619.17 930.4 583.575C930.4 547.98 959.237 519.149 994.839 519.149Z"/>
    </svg>`;
  }

  #iconEquipment() {
    return html`<svg viewBox="0 0 1600 1600" width="16" height="16" fill="none" stroke="currentColor" stroke-width="90" aria-hidden="true">
      <path d="M250 1292H1350C1410.15 1292 1455 1336.85 1455 1397V1452H145V1397C145 1336.85 189.853 1292 250 1292ZM853.196 142L1211.26 1152H393.128L742.037 142H853.196Z"/>
    </svg>`;
  }

  #iconLines() {
    return html`<svg viewBox="0 0 1200 1200" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="m300 357c68.465-13.895 120-74.43 120-147 0-82.848-67.164-150-150-150s-150 67.152-150 150c0 72.57 51.535 133.1 120 147v483h-120v300h300.01v-300h-117.04c28.141-283.46 253.57-508.89 537.04-537.04v117.04h300.01v-300h-300.01v122.69c-240.37 21.66-443.57 172.19-540 381.97zm-30-57c-49.707 0-90.004-40.293-90.004-90s40.297-90 90.004-90c49.707 0 90.004 40.293 90.004 90s-40.297 90-90.004 90zm-90.004 600h180.01v180h-180.01zm720-540v-180h180.01v180z" fill-rule="evenodd"/>
    </svg>`;
  }

  #iconShapes() {
    return html`<svg viewBox="0 0 1200 1200" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="m777.67 66.668c-94.254 0-184.65 37.41-251.34 104.02-66.688 66.605-104.21 156.96-104.33 251.21-0.11719 94.25 37.18 184.7 103.7 251.46 66.523 66.773 156.83 104.41 251.08 104.64 94.25 0.23438 184.74-36.949 251.59-103.39 66.855-66.438 104.61-156.7 104.96-250.95 0.23438-62.586-16.047-124.12-47.203-178.4-31.156-54.277-76.082-99.371-130.24-130.73-54.16-31.359-115.64-47.871-178.22-47.871zm0 71.332c75.41 0 147.73 29.957 201.05 83.281 53.324 53.32 83.281 125.64 83.281 201.05 0 75.41-29.957 147.73-83.281 201.05-53.32 53.324-125.64 83.281-201.05 83.281-75.41 0-147.73-29.957-201.05-83.281-53.324-53.32-83.281-125.64-83.281-201.05 0.089844-75.383 30.074-147.65 83.379-200.96 53.305-53.301 125.57-83.285 200.96-83.375z" fill-rule="evenodd"/>
      <path d="m280 420.67h-106.67c-28.262 0.085937-55.34 11.352-75.328 31.336-19.984 19.988-31.25 47.066-31.336 75.328v498c-0.26953 28.496 10.844 55.918 30.863 76.191 20.023 20.273 47.309 31.723 75.801 31.809h497.67c28.289 0 55.422-11.238 75.426-31.242 20.004-20.004 31.242-47.133 31.242-75.422v-105.34c-1.1523-11.867-8.1602-22.375-18.672-28-10.516-5.6289-23.145-5.6289-33.656 0-10.516 5.625-17.523 16.133-18.672 28v104c0 9.4297-3.7695 18.469-10.469 25.105s-15.77 10.316-25.199 10.23h-497.67c-9.375-0.085938-18.348-3.8242-25.008-10.426-6.6602-6.5977-10.484-15.535-10.656-24.91v-498c0.17188-9.375 3.9961-18.309 10.656-24.91 6.6602-6.5977 15.633-10.336 25.008-10.422h106.67c12.742 0 24.516-6.7969 30.887-17.832 6.3711-11.035 6.3711-24.633 0-35.668-6.3711-11.035-18.145-17.832-30.887-17.832z" fill-rule="evenodd"/>
    </svg>`;
  }

  #iconText() {
    return html`<svg viewBox="0 0 1200 1200" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="m1010.5 347.39c17.438 0 31.594-14.156 31.594-31.594v-126.32c0-17.438-14.156-31.594-31.594-31.594h-126.32c-17.438 0-31.594 14.156-31.594 31.594v31.594h-505.22v-31.594c0-17.438-14.156-31.594-31.594-31.594h-126.32c-17.438 0-31.594 14.156-31.594 31.594v126.32c0 17.438 14.156 31.594 31.594 31.594h31.594v505.26h-31.594c-17.438 0-31.594 14.156-31.594 31.594v126.32c0 17.438 14.156 31.594 31.594 31.594h126.32c17.438 0 31.594-14.156 31.594-31.594v-31.594h505.26v31.594c0 17.438 14.156 31.594 31.594 31.594h126.32c17.438 0 31.594-14.156 31.594-31.594v-126.32c0-17.438-14.156-31.594-31.594-31.594h-31.594l-0.046874-505.26zm-94.734-126.32h63.141v63.141h-63.141zm-694.74 0h63.141v63.141h-63.141zm63.141 757.87h-63.141v-63.141h63.141zm694.74 0h-63.141v-63.141h63.141zm-63.141-126.32h-31.594c-17.438 0-31.594 14.156-31.594 31.594v31.594h-505.22v-31.594c0-17.438-14.156-31.594-31.594-31.594h-31.594v-505.22h31.594c17.438 0 31.594-14.156 31.594-31.594v-31.594h505.26v31.594c0 17.438 14.156 31.594 31.594 31.594h31.594v505.26z"/>
      <path d="m789.47 378.94h-378.94c-17.438 0-31.594 14.156-31.594 31.594v63.141c0 17.438 14.156 31.594 31.594 31.594s31.594-14.156 31.594-31.594v-31.594h126.32v378.94c0 17.438 14.156 31.594 31.594 31.594s31.594-14.156 31.594-31.594v-378.94h126.32v31.594c0 17.438 14.156 31.594 31.594 31.594s31.594-14.156 31.594-31.594v-63.141c0-17.438-14.156-31.594-31.594-31.594z"/>
    </svg>`;
  }

  #iconAnimation() {
    return html`<svg viewBox="0 0 1200 1200" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="m846.12 420.12c-59.641-2.6406-113.88 35.16-131.88 92.039l-2.0391 6.6016-6.7188 1.4414c-81.84 18-141.24 91.922-141.24 175.68v93.84c0 31.68-23.762 58.922-54 61.801-16.801 1.6797-33.719-3.9609-46.199-15.238-12.48-11.398-19.68-27.602-19.68-44.398v-336c0-99.238-80.762-180-180-180-19.801 0-36 16.199-36 36s16.199 36 36 36c59.52 0 108 48.48 108 108v331.8c0 69.719 52.32 129.36 119.28 135.6 37.559 3.6016 73.68-8.3984 101.52-33.84 27.48-24.961 43.199-60.602 43.199-97.559v-96c0-43.68 26.039-82.801 66.48-99.719l11.039-4.6797 4.6797 11.039c20.641 49.32 68.52 81.238 121.8 81.238 36.238 0 69.961-14.398 95.16-40.559 25.078-26.16 38.16-60.48 36.719-96.719-2.6406-67.922-57.961-123.48-125.76-126.6zm-6.1211 191.88c-33.121 0-60-26.879-60-60s26.879-60 60-60 60 26.879 60 60-26.879 60-60 60z"/>
    </svg>`;
  }

  #iconNotes() {
    return html`<svg viewBox="0 0 1200 1200" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="m499.5 149.29h201v-33.141h-201zm-67.969 539.11c-45.516 0-45.516-69.141 0-69.141h336.94c45.516 0 45.516 69.141 0 69.141zm0-213.71c-45.516 0-45.516-69.141 0-69.141h336.94c45.516 0 45.516 69.141 0 69.141zm0 427.36c-45.516 0-45.516-69.141 0-69.141h336.94c45.516 0 45.516 69.141 0 69.141zm338.11-804.52h137.81c52.078 0 81.094 34.031 81.891 34.031 21 21 34.031 49.969 34.031 81.891v823.6c0 31.922-13.031 60.891-34.031 81.891-0.79688 0-29.812 34.031-81.891 34.031l-614.9-0.046875c-63.797 0-115.88-52.078-115.88-115.92l-0.046875-823.6c0-63.797 52.078-115.88 115.88-115.88h137.81l0.046875-15.938c0-19.078 15.469-34.547 34.547-34.547h270.14c19.078 0 34.547 15.469 34.547 34.547zm-339.28 69.141h-137.81c-25.688 0-46.781 21.141-46.781 46.781v823.6c0 25.688 21.141 46.781 46.781 46.781h614.9c12.891 0 24.609-5.25 33.094-13.688l-0.09375-0.09375c8.4844-8.4844 13.781-20.203 13.781-33v-823.64c0-12.844-5.2969-24.516-13.781-33l0.09375-0.09375c-8.4844-8.4375-20.203-13.688-33.094-13.688h-137.81v17.156c0 19.078-15.469 34.547-34.547 34.547l-270.19 0.046874c-19.078 0-34.547-15.469-34.547-34.547z" fill-rule="evenodd"/>
    </svg>`;
  }

  render() {
    const s = this.summary;
    const hasExtra = s && (s.linesByStyle.size > 0 || s.shapesByKind.size > 0 || s.textCount > 0 || s.frameCount > 0);

    return html`
      ${s ? html`
        <p class="board-name">${s.name}</p>

        <!-- Always-visible: Pitch, Players, Equipment -->
        <div class="summary-section">
          <h3>${this.#iconPitch()} Pitch</h3>
          <p>${s.pitchLabel} · ${s.orientation}</p>
        </div>

        ${s.playersByColor.size > 0 || s.coachCount > 0 ? html`
          <div class="summary-section">
            <h3>${this.#iconPlayers()} Players</h3>
            <ul>
              ${[...s.playersByColor.entries()].map(([color, count]) => html`<li>${count} ${color}</li>`)}
              ${s.coachCount > 0 ? html`<li>${s.coachCount} Coach${s.coachCount > 1 ? 'es' : ''}</li>` : nothing}
            </ul>
          </div>
        ` : nothing}

        ${s.equipByKind.size > 0 || s.conesByColor.size > 0 || s.dummiesByColor.size > 0 || s.polesByColor.size > 0 ? html`
          <div class="summary-section">
            <h3>${this.#iconEquipment()} Equipment</h3>
            <ul>
              ${[...s.equipByKind.entries()].map(([kind, count]) => html`<li>${count} ${kind}${count > 1 ? 's' : ''}</li>`)}
              ${s.conesByColor.size > 0 ? html`<li>${[...s.conesByColor.values()].reduce((a, b) => a + b, 0)} Cone${[...s.conesByColor.values()].reduce((a, b) => a + b, 0) > 1 ? 's' : ''} (${[...s.conesByColor.entries()].map(([c, n]) => `${n} ${c}`).join(', ')})</li>` : nothing}
              ${s.dummiesByColor.size > 0 ? html`<li>${[...s.dummiesByColor.values()].reduce((a, b) => a + b, 0)} Dumm${[...s.dummiesByColor.values()].reduce((a, b) => a + b, 0) > 1 ? 'ies' : 'y'} (${[...s.dummiesByColor.entries()].map(([c, n]) => `${n} ${c}`).join(', ')})</li>` : nothing}
              ${s.polesByColor.size > 0 ? html`<li>${[...s.polesByColor.values()].reduce((a, b) => a + b, 0)} Pole${[...s.polesByColor.values()].reduce((a, b) => a + b, 0) > 1 ? 's' : ''} (${[...s.polesByColor.entries()].map(([c, n]) => `${n} ${c}`).join(', ')})</li>` : nothing}
            </ul>
          </div>
        ` : nothing}

        <!-- Show more toggle: Lines, Shapes, Text, Animation -->
        ${hasExtra ? html`
          <button class="show-more-btn ${this._expanded ? 'expanded' : ''}"
                  aria-expanded="${this._expanded}"
                  @click="${() => { this._expanded = !this._expanded; }}">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <polyline points="4 6 8 10 12 6"/>
            </svg>
            ${this._expanded ? 'Show less' : 'Show more'}
          </button>

          <div class="extra-sections ${this._expanded ? 'expanded' : ''}">
            ${s.linesByStyle.size > 0 ? html`
              <div class="summary-section">
                <h3>${this.#iconLines()} Lines</h3>
                <ul>
                  ${[...s.linesByStyle.entries()].map(([style, count]) => html`<li>${count} ${style}</li>`)}
                </ul>
              </div>
            ` : nothing}

            ${s.shapesByKind.size > 0 ? html`
              <div class="summary-section">
                <h3>${this.#iconShapes()} Shapes</h3>
                <ul>
                  ${[...s.shapesByKind.entries()].map(([kind, count]) => html`<li>${count} ${kind}${count > 1 ? 's' : ''}</li>`)}
                </ul>
              </div>
            ` : nothing}

            ${s.textCount > 0 ? html`
              <div class="summary-section">
                <h3>${this.#iconText()} Text</h3>
                <p>${s.textCount} text item${s.textCount > 1 ? 's' : ''}</p>
              </div>
            ` : nothing}

            ${s.frameCount > 0 ? html`
              <div class="summary-section">
                <h3>${this.#iconAnimation()} Animation</h3>
                <p>${s.frameCount} frame${s.frameCount > 1 ? 's' : ''}</p>
              </div>
            ` : nothing}
          </div>
        ` : nothing}

        <div class="divider"></div>
      ` : nothing}

      <div class="notes-label" id="cb-board-summary-notes-label">
        ${this.#iconNotes()} Notes &amp; Instructions
      </div>
      <textarea class="notes-textarea"
                aria-labelledby="cb-board-summary-notes-label"
                rows="4"
                placeholder="Add notes, drills, instructions…"
                title="Cmd+Enter to save"
                .value="${this.boardNotes}"
                @input="${(e: Event) => this.#emit('cb-board-notes-input', { value: (e.target as HTMLTextAreaElement).value })}"
                @keydown="${this.#onNotesKeyDown}"></textarea>
      <div class="actions">
        <button class="save-btn" @click="${() => this.#emit('cb-board-summary-save')}">
          Save
          <span class="save-shortcut-hint">⌘↵</span>
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cb-board-summary': CbBoardSummary;
  }
}
