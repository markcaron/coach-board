import type { Player, Equipment, Line, Shape, TextItem, PitchType } from './types.js';
import { COLORS } from './types.js';

export interface BoardTemplate {
  id: string;
  name: string;
  pitchType: PitchType;
  players: Player[];
  equipment: Equipment[];
  lines: Line[];
  shapes: Shape[];
  textItems: TextItem[];
}

const W = 68;
const cy = W / 2;

function gk(x: number, y: number): Player {
  return { id: 'tpl-gk', x, y, team: 'a', color: COLORS.playerYellow, label: '1' };
}

function outfield(x: number, y: number, label: string): Player {
  return { id: `tpl-${label}`, x, y, team: 'a', color: COLORS.playerBlue, label };
}

function ball(x: number, y: number): Equipment {
  return { id: 'tpl-ball', x, y, kind: 'ball' };
}

// ─────────────────────────────────────────────────────────────────────────────
// COORDINATE SYSTEM — read this before editing any template
// ─────────────────────────────────────────────────────────────────────────────
//
// All pitch types share the same SVG coordinate space:
//   x=0   → left edge  (left goal line for full/half pitches)
//   x=105 → right edge (right goal line for full pitch)
//   x=60  → right goal line for half-attack pitch (HALF_FIELD_LENGTH = 60)
//   y=0   → top touchline
//   y=68  → bottom touchline  (W = FIELD_WIDTH = 68)
//
// Traditional positional numbering (2-3-5 era):
//   1=GK · 2=RB · 3=LB · 4=RCB · 5=LCB · 6=LCM · 7=RW · 8=RCM · 9=ST
//   10=inside-left · 11=LW
//   Right-sided players (#2, #7, #8) → HIGH y (y near 68)
//   Left-sided players  (#3, #11, #6) → LOW y  (y near 0)
//
// ── half-attack pitch ────────────────────────────────────────────────────────
// Shows the attacking half of the field. Direction of play: left → right.
//   x=7.5  = midfield line (left edge of the half; centre circle centred here)
//   x=43.5 = penalty area left edge
//   x=49   = penalty spot
//   x=60   = attacking goal (right edge)
//
// Attacking Shape: Team A (#6) recirculates at the centre circle (x≈7.8).
// CBs cover at x≈11–12, CMs at x≈26–28, attack + overlapping FBs at x≈32–44.
// Team B back 4 at x≈43–45, midfield block at x≈22–36, GK at x≈55.8.
//
// If a future report says this template looks wrong, first confirm the
// reporter is testing with a NEW board, not a saved board (saved boards
// retain positions from the moment the template was originally applied).
//
// ── open grass ───────────────────────────────────────────────────────────────
// No pitch markings; coordinate space is the same 105×68 SVG canvas.
// Rondo players are unlabeled by design — they render as directional tokens
// (not numbered circles), which is the intended clean drill visual.
// Diamond centred at approx (54, 32), spanning 43 wide × 45 tall.
// Ball sits near the left player. Cones form a 40×36 area around the drill.
//
// ─────────────────────────────────────────────────────────────────────────────

// Full pitch: Team A on left half (x: 0–52.5)
// Even line spacing: GK(3) → DEF(18) → MID(33) → FWD(46)

const FULL_433: BoardTemplate = {
  id: 'full-433',
  name: '4-3-3',
  pitchType: 'full',
  players: [
    gk(3, cy),
    outfield(18, W - 8, '2'),  // RB — right flank (bottom)
    outfield(18, W - 27, '4'), // RCB
    outfield(18, 27, '5'),     // LCB
    outfield(18, 8, '3'),      // LB — left flank (top)
    outfield(30, cy, '6'),     // CDM — holding, slightly deeper
    outfield(36, W - 20, '8'), // RCM — right half space (bottom)
    outfield(36, 20, '10'),    // LCM — left half space (top)
    outfield(46, W - 8, '7'),  // RW — right flank (bottom)
    outfield(46, cy, '9'),     // ST — center
    outfield(46, 8, '11'),     // LW — left flank (top)
  ],
  equipment: [ball(52, cy)],
  lines: [],
  shapes: [],
  textItems: [],
};

const FULL_4231: BoardTemplate = {
  id: 'full-4231',
  name: '4-2-3-1',
  pitchType: 'full',
  players: [
    gk(3, cy),
    outfield(18, W - 8, '2'),  // RB — right flank
    outfield(18, W - 27, '4'), // RCB
    outfield(18, 27, '5'),     // LCB
    outfield(18, 8, '3'),      // LB — left flank
    outfield(28, W - 22, '8'), // RDM — right pivot
    outfield(28, 22, '6'),     // LDM — left pivot
    outfield(40, W - 8, '7'),  // RW — right flank
    outfield(37, cy, '10'),    // CAM — central (#10 as playmaker)
    outfield(40, 8, '11'),     // LW — left flank
    outfield(46, cy, '9'),     // ST — lone striker
  ],
  equipment: [ball(52, cy)],
  lines: [],
  shapes: [],
  textItems: [],
};

const FULL_442: BoardTemplate = {
  id: 'full-442',
  name: '4-4-2',
  pitchType: 'full',
  players: [
    gk(3, cy),
    outfield(18, W - 8, '2'),  // RB — right flank
    outfield(18, W - 27, '4'), // RCB
    outfield(18, 27, '5'),     // LCB
    outfield(18, 8, '3'),      // LB — left flank
    outfield(33, W - 8, '7'),  // RM — right flank
    outfield(33, W - 27, '8'), // RCM — right half space
    outfield(33, 27, '6'),     // LCM — left half space
    outfield(33, 8, '11'),     // LM — left flank
    outfield(46, W - 27, '9'), // RST — right-side striker
    outfield(46, 27, '10'),    // LST — left-side striker
  ],
  equipment: [ball(52, cy)],
  lines: [],
  shapes: [],
  textItems: [],
};

const FULL_352: BoardTemplate = {
  id: 'full-352',
  name: '3-5-2',
  pitchType: 'full',
  players: [
    gk(3, cy),
    outfield(18, W - 20, '2'), // RCB (bottom)
    outfield(18, cy, '5'),     // CCB — center
    outfield(18, 20, '3'),     // LCB (top)
    outfield(33, W - 5, '7'),  // RWB — wide right (bottom)
    outfield(33, W - 22, '8'), // RCM — right half space
    outfield(33, cy, '4'),     // CDM — central
    outfield(33, 22, '6'),     // LCM — left half space
    outfield(33, 5, '11'),     // LWB — wide left (top)
    outfield(46, W - 27, '9'), // RST
    outfield(46, 27, '10'),    // LST — left-side striker
  ],
  equipment: [ball(52, cy)],
  lines: [],
  shapes: [],
  textItems: [],
};

// Half pitch (defensive)
const HALF_DEF_BLOCK: BoardTemplate = {
  id: 'half-def-block',
  name: '4-4-2 Low Block',
  pitchType: 'half',
  players: [
    gk(5, cy),
    outfield(18, W - 8, '2'),
    outfield(18, W - 27, '4'),
    outfield(18, 27, '5'),
    outfield(18, 8, '3'),
    outfield(32, W - 8, '7'),
    outfield(32, W - 27, '8'),
    outfield(32, 27, '6'),
    outfield(32, 8, '11'),
    outfield(44, W - 27, '9'),
    outfield(44, 27, '10'),
  ],
  equipment: [ball(50, cy)],
  lines: [],
  shapes: [],
  textItems: [],
};

// Half pitch (attacking): both teams — Team A attacking, Team B defending
function teamB(x: number, y: number, label: string): Player {
  return { id: `tpl-b-${label}`, x, y, team: 'b', color: COLORS.playerRed, label };
}

function teamBGK(x: number, y: number): Player {
  return { id: 'tpl-b-gk', x, y, team: 'b', color: COLORS.playerDarkGray, label: '1' };
}

const HALF_ATT_SHAPE: BoardTemplate = {
  id: 'half-att-shape',
  name: 'Attacking Shape',
  pitchType: 'half-attack',
  players: [
    // Team A — building left→right, #6 recirculating at centre circle
    outfield(11.33, 12.62, '5'),  // LCB
    outfield(12.04, 53.22, '4'),  // RCB
    outfield(7.79,  33.44, '6'),  // CDM — on the ball, near centre circle
    outfield(28.37, 26.62, '10'), // LCM
    outfield(26.01, 46.87, '8'),  // RCM
    outfield(32.88, 13.49, '11'), // LW
    outfield(43.32, 27.69, '9'),  // ST
    outfield(42.02, 48.86, '7'),  // RW
    outfield(41.71,  3.62, '3'),  // LFB — overlapping
    outfield(34.31, 62.89, '2'),  // RFB — overlapping

    // Team B — defending goal at x=60
    teamBGK(55.78, 34.09),        // GK
    teamB(43.93,  8.46, '2'),     // upper back
    teamB(44.68, 22.29, '4'),     // RCB
    teamB(44.43, 39.25, '5'),     // LCB
    teamB(44.96, 54.84, '3'),     // lower back
    teamB(36.03, 18.66, '7'),     // upper mid
    teamB(34.37, 29.72, '6'),     // CDM
    teamB(32.86, 43.94, '8'),     // lower mid
    teamB(22.10, 22.10, '9'),     // deep upper
    teamB(22.60, 36.80, '10'),    // deep lower
    teamB(34.75, 55.88, '11'),    // wide lower
  ],
  equipment: [ball(10.79, 36.21)],
  lines: [],
  shapes: [],
  textItems: [],
};

// Open grass: Rondo 4v2 with cones marking the area, no player labels
// Coordinates sourced directly from reference SVG board data.
// Outer players face inward; defenders unlabeled by design
function cone(x: number, y: number): Equipment {
  return { id: `tpl-cone-${x}-${y}`, x, y, kind: 'cone', color: COLORS.coneChartreuse };
}

const OPEN_RONDO: BoardTemplate = {
  id: 'open-rondo',
  name: 'Rondo (4v2)',
  pitchType: 'open',
  players: [
    { id: 'tpl-a1', x: 57.75, y:  9.88, angle: 180, team: 'a', color: COLORS.playerBlue }, // top    — faces ▼
    { id: 'tpl-a2', x: 31.00, y: 29.27, angle: 90,  team: 'a', color: COLORS.playerBlue }, // left   — faces ►
    { id: 'tpl-a3', x: 50.09, y: 53.94, angle: 0,   team: 'a', color: COLORS.playerBlue }, // bottom — faces ▲
    { id: 'tpl-a4', x: 73.62, y: 35.17, angle: 270, team: 'a', color: COLORS.playerBlue }, // right  — faces ◄
    { id: 'tpl-d1', x: 47.22, y: 26.20, team: 'b', color: COLORS.playerRed },
    { id: 'tpl-d2', x: 59.89, y: 39.98, team: 'b', color: COLORS.playerRed },
  ],
  equipment: [
    ball(33.82, 33.01),
    cone(32.78, 14.52),
    cone(72.21, 14.52),
    cone(72.21, 50.95),
    cone(32.78, 50.95),
  ],
  lines: [],
  shapes: [],
  textItems: [],
};

export const BUILT_IN_TEMPLATES: BoardTemplate[] = [
  FULL_433,
  FULL_4231,
  FULL_442,
  FULL_352,
  HALF_DEF_BLOCK,
  HALF_ATT_SHAPE,
  OPEN_RONDO,
];

export function getTemplatesForPitch(pitchType: PitchType): BoardTemplate[] {
  return BUILT_IN_TEMPLATES.filter(t => t.pitchType === pitchType);
}
