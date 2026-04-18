import { svg } from 'lit';

/**
 * FIFA international standard pitch dimensions (meters).
 * All SVG coordinates use these values directly via viewBox="0 0 105 68".
 */
const FIELD_LENGTH = 105;
const FIELD_WIDTH = 68;
const CENTER_CIRCLE_R = 9.15;
const PENALTY_AREA_DEPTH = 16.5;
const PENALTY_AREA_WIDTH = 40.32;
const GOAL_AREA_DEPTH = 5.5;
const GOAL_AREA_WIDTH = 18.32;
const PENALTY_SPOT_DIST = 11;
const PENALTY_ARC_R = 9.15;
const CORNER_ARC_R = 1;
const GOAL_WIDTH = 7.32;
const GOAL_DEPTH = 2;
const SPOT_R = 0.25;
const LINE_WIDTH = 0.18;

const half = FIELD_WIDTH / 2;
const penaltyTop = (FIELD_WIDTH - PENALTY_AREA_WIDTH) / 2;
const penaltyBot = penaltyTop + PENALTY_AREA_WIDTH;
const goalAreaTop = (FIELD_WIDTH - GOAL_AREA_WIDTH) / 2;
const goalAreaBot = goalAreaTop + GOAL_AREA_WIDTH;
const goalTop = (FIELD_WIDTH - GOAL_WIDTH) / 2;
const goalBot = goalTop + GOAL_WIDTH;
const centerX = FIELD_LENGTH / 2;

/**
 * Compute the "D" arc outside each penalty area.
 * It's the arc of the penalty-spot circle (r = 9.15 m)
 * that falls outside the penalty box.
 */
function penaltyArc(spotX: number, boxEdgeX: number, side: 'left' | 'right') {
  const dx = Math.abs(boxEdgeX - spotX);
  const dy = Math.sqrt(PENALTY_ARC_R ** 2 - dx ** 2);
  const cy = half;
  const startY = cy - dy;
  const endY = cy + dy;
  const sweep = side === 'left' ? 1 : 0;
  return svg`<path
    d="M ${boxEdgeX} ${startY} A ${PENALTY_ARC_R} ${PENALTY_ARC_R} 0 0 ${sweep} ${boxEdgeX} ${endY}"
    fill="none" stroke="white" stroke-width="${LINE_WIDTH}" />`;
}

export function renderField() {
  return svg`
    <g class="field-markings">
      <!-- Pitch outline -->
      <rect x="0" y="0"
            width="${FIELD_LENGTH}" height="${FIELD_WIDTH}"
            fill="none" stroke="white" stroke-width="${LINE_WIDTH}" />

      <!-- Halfway line -->
      <line x1="${centerX}" y1="0"
            x2="${centerX}" y2="${FIELD_WIDTH}"
            stroke="white" stroke-width="${LINE_WIDTH}" />

      <!-- Center circle -->
      <circle cx="${centerX}" cy="${half}"
              r="${CENTER_CIRCLE_R}"
              fill="none" stroke="white" stroke-width="${LINE_WIDTH}" />

      <!-- Center spot -->
      <circle cx="${centerX}" cy="${half}"
              r="${SPOT_R}" fill="white" />

      <!-- LEFT penalty area -->
      <rect x="0" y="${penaltyTop}"
            width="${PENALTY_AREA_DEPTH}" height="${PENALTY_AREA_WIDTH}"
            fill="none" stroke="white" stroke-width="${LINE_WIDTH}" />

      <!-- LEFT goal area -->
      <rect x="0" y="${goalAreaTop}"
            width="${GOAL_AREA_DEPTH}" height="${GOAL_AREA_WIDTH}"
            fill="none" stroke="white" stroke-width="${LINE_WIDTH}" />

      <!-- LEFT penalty spot -->
      <circle cx="${PENALTY_SPOT_DIST}" cy="${half}"
              r="${SPOT_R}" fill="white" />

      <!-- LEFT penalty arc -->
      ${penaltyArc(PENALTY_SPOT_DIST, PENALTY_AREA_DEPTH, 'left')}

      <!-- LEFT goal -->
      <rect x="${-GOAL_DEPTH}" y="${goalTop}"
            width="${GOAL_DEPTH}" height="${GOAL_WIDTH}"
            fill="url(#goal-net)" stroke="white" stroke-width="${LINE_WIDTH}" />

      <!-- RIGHT penalty area -->
      <rect x="${FIELD_LENGTH - PENALTY_AREA_DEPTH}" y="${penaltyTop}"
            width="${PENALTY_AREA_DEPTH}" height="${PENALTY_AREA_WIDTH}"
            fill="none" stroke="white" stroke-width="${LINE_WIDTH}" />

      <!-- RIGHT goal area -->
      <rect x="${FIELD_LENGTH - GOAL_AREA_DEPTH}" y="${goalAreaTop}"
            width="${GOAL_AREA_DEPTH}" height="${GOAL_AREA_WIDTH}"
            fill="none" stroke="white" stroke-width="${LINE_WIDTH}" />

      <!-- RIGHT penalty spot -->
      <circle cx="${FIELD_LENGTH - PENALTY_SPOT_DIST}" cy="${half}"
              r="${SPOT_R}" fill="white" />

      <!-- RIGHT penalty arc -->
      ${penaltyArc(FIELD_LENGTH - PENALTY_SPOT_DIST, FIELD_LENGTH - PENALTY_AREA_DEPTH, 'right')}

      <!-- RIGHT goal -->
      <rect x="${FIELD_LENGTH}" y="${goalTop}"
            width="${GOAL_DEPTH}" height="${GOAL_WIDTH}"
            fill="url(#goal-net)" stroke="white" stroke-width="${LINE_WIDTH}" />

      <!-- Corner arcs -->
      <path d="M ${CORNER_ARC_R} 0 A ${CORNER_ARC_R} ${CORNER_ARC_R} 0 0 1 0 ${CORNER_ARC_R}"
            fill="none" stroke="white" stroke-width="${LINE_WIDTH}" />
      <path d="M ${FIELD_LENGTH - CORNER_ARC_R} 0 A ${CORNER_ARC_R} ${CORNER_ARC_R} 0 0 0 ${FIELD_LENGTH} ${CORNER_ARC_R}"
            fill="none" stroke="white" stroke-width="${LINE_WIDTH}" />
      <path d="M 0 ${FIELD_WIDTH - CORNER_ARC_R} A ${CORNER_ARC_R} ${CORNER_ARC_R} 0 0 1 ${CORNER_ARC_R} ${FIELD_WIDTH}"
            fill="none" stroke="white" stroke-width="${LINE_WIDTH}" />
      <path d="M ${FIELD_LENGTH} ${FIELD_WIDTH - CORNER_ARC_R} A ${CORNER_ARC_R} ${CORNER_ARC_R} 0 0 0 ${FIELD_LENGTH - CORNER_ARC_R} ${FIELD_WIDTH}"
            fill="none" stroke="white" stroke-width="${LINE_WIDTH}" />
    </g>
  `;
}

export const FIELD = { LENGTH: FIELD_LENGTH, WIDTH: FIELD_WIDTH } as const;
