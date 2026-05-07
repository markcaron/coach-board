import { svg } from 'lit';
import type { PitchType } from './types.js';

export type FieldOrientation = 'horizontal' | 'vertical';

/**
 * FIFA international standard pitch dimensions (meters).
 * All SVG coordinates use these values directly via viewBox="0 0 105 68".
 */
const FIELD_LENGTH = 105;
const FIELD_WIDTH = 68;
const HALF_FIELD_LENGTH = 60;
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
function penaltyArc(spotX: number, boxEdgeX: number, side: 'left' | 'right', lineColor = 'white') {
  const dx = Math.abs(boxEdgeX - spotX);
  const dy = Math.sqrt(PENALTY_ARC_R ** 2 - dx ** 2);
  const cy = half;
  const startY = cy - dy;
  const endY = cy + dy;
  const sweep = side === 'left' ? 1 : 0;
  return svg`<path
    d="M ${boxEdgeX} ${startY} A ${PENALTY_ARC_R} ${PENALTY_ARC_R} 0 0 ${sweep} ${boxEdgeX} ${endY}"
    fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />`;
}

function penaltyArcVertical(spotY: number, boxEdgeY: number, side: 'top' | 'bottom', lineColor = 'white') {
  const dy = Math.abs(boxEdgeY - spotY);
  const dx = Math.sqrt(PENALTY_ARC_R ** 2 - dy ** 2);
  const cx = half;
  const startX = cx - dx;
  const endX = cx + dx;
  const sweep = side === 'top' ? 0 : 1;
  return svg`<path
    d="M ${startX} ${boxEdgeY} A ${PENALTY_ARC_R} ${PENALTY_ARC_R} 0 0 ${sweep} ${endX} ${boxEdgeY}"
    fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />`;
}

export function renderVerticalField(lineColor = 'white') {
  const W = FIELD_WIDTH;
  const H = FIELD_LENGTH;
  const cx = W / 2;
  const cy = H / 2;
  const penaltyLeft = (W - PENALTY_AREA_WIDTH) / 2;
  const goalAreaLeft = (W - GOAL_AREA_WIDTH) / 2;
  const goalLeft = (W - GOAL_WIDTH) / 2;

  return svg`
    <g class="field-markings">
      <rect x="0" y="0" width="${W}" height="${H}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <line x1="0" y1="${cy}" x2="${W}" y2="${cy}"
            stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <circle cx="${cx}" cy="${cy}" r="${CENTER_CIRCLE_R}"
              fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <circle cx="${cx}" cy="${cy}" r="${SPOT_R}" fill="${lineColor}" />

      <rect x="${penaltyLeft}" y="0"
            width="${PENALTY_AREA_WIDTH}" height="${PENALTY_AREA_DEPTH}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <rect x="${goalAreaLeft}" y="0"
            width="${GOAL_AREA_WIDTH}" height="${GOAL_AREA_DEPTH}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <circle cx="${cx}" cy="${PENALTY_SPOT_DIST}" r="${SPOT_R}" fill="${lineColor}" />
      ${penaltyArcVertical(PENALTY_SPOT_DIST, PENALTY_AREA_DEPTH, 'top', lineColor)}
      <rect x="${goalLeft}" y="${-GOAL_DEPTH}"
            width="${GOAL_WIDTH}" height="${GOAL_DEPTH}"
            fill="url(#goal-net)" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <rect x="${penaltyLeft}" y="${H - PENALTY_AREA_DEPTH}"
            width="${PENALTY_AREA_WIDTH}" height="${PENALTY_AREA_DEPTH}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <rect x="${goalAreaLeft}" y="${H - GOAL_AREA_DEPTH}"
            width="${GOAL_AREA_WIDTH}" height="${GOAL_AREA_DEPTH}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <circle cx="${cx}" cy="${H - PENALTY_SPOT_DIST}" r="${SPOT_R}" fill="${lineColor}" />
      ${penaltyArcVertical(H - PENALTY_SPOT_DIST, H - PENALTY_AREA_DEPTH, 'bottom', lineColor)}
      <rect x="${goalLeft}" y="${H}"
            width="${GOAL_WIDTH}" height="${GOAL_DEPTH}"
            fill="url(#goal-net)" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <path d="M ${CORNER_ARC_R} 0 A ${CORNER_ARC_R} ${CORNER_ARC_R} 0 0 1 0 ${CORNER_ARC_R}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <path d="M ${W - CORNER_ARC_R} 0 A ${CORNER_ARC_R} ${CORNER_ARC_R} 0 0 0 ${W} ${CORNER_ARC_R}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <path d="M 0 ${H - CORNER_ARC_R} A ${CORNER_ARC_R} ${CORNER_ARC_R} 0 0 1 ${CORNER_ARC_R} ${H}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <path d="M ${W} ${H - CORNER_ARC_R} A ${CORNER_ARC_R} ${CORNER_ARC_R} 0 0 0 ${W - CORNER_ARC_R} ${H}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
    </g>
  `;
}

export function getFieldDimensions(orientation: FieldOrientation, pitchType: PitchType = 'full') {
  if (pitchType === 'half') {
    return orientation === 'vertical'
      ? { w: FIELD_WIDTH, h: HALF_FIELD_LENGTH }
      : { w: HALF_FIELD_LENGTH, h: FIELD_WIDTH };
  }
  return orientation === 'vertical'
    ? { w: FIELD_WIDTH, h: FIELD_LENGTH }
    : { w: FIELD_LENGTH, h: FIELD_WIDTH };
}

export function renderField(lineColor = 'white') {
  return svg`
    <g class="field-markings">
      <rect x="0" y="0"
            width="${FIELD_LENGTH}" height="${FIELD_WIDTH}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <line x1="${centerX}" y1="0"
            x2="${centerX}" y2="${FIELD_WIDTH}"
            stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <circle cx="${centerX}" cy="${half}"
              r="${CENTER_CIRCLE_R}"
              fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <circle cx="${centerX}" cy="${half}"
              r="${SPOT_R}" fill="${lineColor}" />

      <rect x="0" y="${penaltyTop}"
            width="${PENALTY_AREA_DEPTH}" height="${PENALTY_AREA_WIDTH}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <rect x="0" y="${goalAreaTop}"
            width="${GOAL_AREA_DEPTH}" height="${GOAL_AREA_WIDTH}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <circle cx="${PENALTY_SPOT_DIST}" cy="${half}"
              r="${SPOT_R}" fill="${lineColor}" />

      ${penaltyArc(PENALTY_SPOT_DIST, PENALTY_AREA_DEPTH, 'left', lineColor)}

      <rect x="${-GOAL_DEPTH}" y="${goalTop}"
            width="${GOAL_DEPTH}" height="${GOAL_WIDTH}"
            fill="url(#goal-net)" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <rect x="${FIELD_LENGTH - PENALTY_AREA_DEPTH}" y="${penaltyTop}"
            width="${PENALTY_AREA_DEPTH}" height="${PENALTY_AREA_WIDTH}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <rect x="${FIELD_LENGTH - GOAL_AREA_DEPTH}" y="${goalAreaTop}"
            width="${GOAL_AREA_DEPTH}" height="${GOAL_AREA_WIDTH}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <circle cx="${FIELD_LENGTH - PENALTY_SPOT_DIST}" cy="${half}"
              r="${SPOT_R}" fill="${lineColor}" />

      ${penaltyArc(FIELD_LENGTH - PENALTY_SPOT_DIST, FIELD_LENGTH - PENALTY_AREA_DEPTH, 'right', lineColor)}

      <rect x="${FIELD_LENGTH}" y="${goalTop}"
            width="${GOAL_DEPTH}" height="${GOAL_WIDTH}"
            fill="url(#goal-net)" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <path d="M ${CORNER_ARC_R} 0 A ${CORNER_ARC_R} ${CORNER_ARC_R} 0 0 1 0 ${CORNER_ARC_R}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <path d="M ${FIELD_LENGTH - CORNER_ARC_R} 0 A ${CORNER_ARC_R} ${CORNER_ARC_R} 0 0 0 ${FIELD_LENGTH} ${CORNER_ARC_R}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <path d="M 0 ${FIELD_WIDTH - CORNER_ARC_R} A ${CORNER_ARC_R} ${CORNER_ARC_R} 0 0 1 ${CORNER_ARC_R} ${FIELD_WIDTH}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <path d="M ${FIELD_LENGTH} ${FIELD_WIDTH - CORNER_ARC_R} A ${CORNER_ARC_R} ${CORNER_ARC_R} 0 0 0 ${FIELD_LENGTH - CORNER_ARC_R} ${FIELD_WIDTH}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
    </g>
  `;
}

export function renderHalfField(lineColor = 'white') {
  const H = FIELD_WIDTH;
  const W = HALF_FIELD_LENGTH;
  const midY = H / 2;

  return svg`
    <g class="field-markings">
      <rect x="0" y="0" width="${W}" height="${H}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <line x1="${centerX}" y1="0" x2="${centerX}" y2="${H}"
            stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <circle cx="${centerX}" cy="${midY}" r="${CENTER_CIRCLE_R}"
              fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <circle cx="${centerX}" cy="${midY}" r="${SPOT_R}" fill="${lineColor}" />

      <rect x="0" y="${penaltyTop}"
            width="${PENALTY_AREA_DEPTH}" height="${PENALTY_AREA_WIDTH}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <rect x="0" y="${goalAreaTop}"
            width="${GOAL_AREA_DEPTH}" height="${GOAL_AREA_WIDTH}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <circle cx="${PENALTY_SPOT_DIST}" cy="${midY}" r="${SPOT_R}" fill="${lineColor}" />
      ${penaltyArc(PENALTY_SPOT_DIST, PENALTY_AREA_DEPTH, 'left', lineColor)}
      <rect x="${-GOAL_DEPTH}" y="${goalTop}"
            width="${GOAL_DEPTH}" height="${GOAL_WIDTH}"
            fill="url(#goal-net)" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <path d="M ${CORNER_ARC_R} 0 A ${CORNER_ARC_R} ${CORNER_ARC_R} 0 0 1 0 ${CORNER_ARC_R}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <path d="M 0 ${H - CORNER_ARC_R} A ${CORNER_ARC_R} ${CORNER_ARC_R} 0 0 1 ${CORNER_ARC_R} ${H}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
    </g>
  `;
}

export function renderVerticalHalfField(lineColor = 'white') {
  const W = FIELD_WIDTH;
  const H = HALF_FIELD_LENGTH;
  const cx = W / 2;
  const centerY = FIELD_LENGTH / 2;
  const penaltyLeft = (W - PENALTY_AREA_WIDTH) / 2;
  const goalAreaLeft = (W - GOAL_AREA_WIDTH) / 2;
  const goalLeft = (W - GOAL_WIDTH) / 2;

  return svg`
    <g class="field-markings">
      <rect x="0" y="0" width="${W}" height="${H}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <line x1="0" y1="${centerY}" x2="${W}" y2="${centerY}"
            stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <circle cx="${cx}" cy="${centerY}" r="${CENTER_CIRCLE_R}"
              fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <circle cx="${cx}" cy="${centerY}" r="${SPOT_R}" fill="${lineColor}" />

      <rect x="${penaltyLeft}" y="0"
            width="${PENALTY_AREA_WIDTH}" height="${PENALTY_AREA_DEPTH}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <rect x="${goalAreaLeft}" y="0"
            width="${GOAL_AREA_WIDTH}" height="${GOAL_AREA_DEPTH}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <circle cx="${cx}" cy="${PENALTY_SPOT_DIST}" r="${SPOT_R}" fill="${lineColor}" />
      ${penaltyArcVertical(PENALTY_SPOT_DIST, PENALTY_AREA_DEPTH, 'top', lineColor)}
      <rect x="${goalLeft}" y="${-GOAL_DEPTH}"
            width="${GOAL_WIDTH}" height="${GOAL_DEPTH}"
            fill="url(#goal-net)" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />

      <path d="M ${CORNER_ARC_R} 0 A ${CORNER_ARC_R} ${CORNER_ARC_R} 0 0 1 0 ${CORNER_ARC_R}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
      <path d="M ${W - CORNER_ARC_R} 0 A ${CORNER_ARC_R} ${CORNER_ARC_R} 0 0 0 ${W} ${CORNER_ARC_R}"
            fill="none" stroke="${lineColor}" stroke-width="${LINE_WIDTH}" />
    </g>
  `;
}

export const FIELD = { LENGTH: FIELD_LENGTH, WIDTH: FIELD_WIDTH, HALF_LENGTH: HALF_FIELD_LENGTH } as const;
