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
//   x=7.5  = midfield line (left edge of the half)
//   x=43.5 = penalty area left edge
//   x=49   = penalty spot
//   x=60   = attacking goal (right edge)
//
// In the Attacking Shape template Team A (#6) builds from deep on the LEFT
// (low x, near the centre circle at x≈7.5–24) while the front three press
// right toward x=60. Team B (red) defends compact at HIGH x, near the goal:
//   GK at x=57 (3 m from goal line)
//   Defenders at x=47–50 (inside penalty area)
//   Midfielders at x=38–40 (outside penalty area)
// Team A builds from LOW x (CBs at x=16, CDM at x=24) toward HIGH x.
//
// If a future report says this template looks wrong, first confirm the
// reporter is testing with a NEW board, not a saved board (saved boards
// retain positions from the moment the template was originally applied).
//
// ── open grass ───────────────────────────────────────────────────────────────
// No pitch markings; coordinate space is the same 105×68 SVG canvas.
// Rondo players are unlabeled by design — they render as directional tokens
// (not numbered circles), which is the intended clean drill visual.
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
    // Team A — building left→right toward goal at x=60
    outfield(14, 10, '5'),     // LCB — left, near top touchline
    outfield(14, W - 10, '4'), // RCB — right, near bottom touchline
    outfield(10, cy, '6'),     // CDM — on the ball, inside centre circle
    outfield(26, 20, '10'),    // LCM — left half-space
    outfield(26, W - 20, '8'), // RCM — right half-space
    outfield(48, 8, '3'),      // LB — overlapping left
    outfield(48, W - 8, '2'),  // RB — overlapping right
    outfield(38, 14, '11'),    // LW — left channel
    outfield(44, cy, '9'),     // ST — at penalty arc
    outfield(38, W - 14, '7'), // RW — right channel

    // Team B — defending goal at x=60
    // penalty area: x=43.5–60 | penalty spot: x=49 | goal line: x=60
    teamBGK(57, cy),           // GK — 3 m from goal line
    teamB(50, 10, '2'),        // upper back (y=10, doesn't overlap blue #3 at y=8)
    teamB(47, 24, '4'),        // upper CB (inside penalty area)
    teamB(47, W - 24, '5'),    // lower CB (inside penalty area)
    teamB(50, W - 10, '3'),    // lower back (y=58, doesn't overlap blue #2 at y=60)
    teamB(40, 18, '10'),       // left mid
    teamB(38, cy, '6'),        // CDM — central
    teamB(40, W - 18, '8'),    // right mid
  ],
  equipment: [ball(10, cy)],
  lines: [],
  shapes: [],
  textItems: [],
};

// Open grass: Rondo 4v2 with cones marking the area, no player labels
function cone(x: number, y: number): Equipment {
  return { id: `tpl-cone-${x}-${y}`, x, y, kind: 'cone', color: COLORS.coneNeonOrange };
}

const OPEN_RONDO: BoardTemplate = {
  id: 'open-rondo',
  name: 'Rondo (4v2)',
  pitchType: 'open',
  players: [
    { id: 'tpl-a1', x: 44, y: 12,        angle: 90,  team: 'a', color: COLORS.playerBlue }, // top, facing ▼
    { id: 'tpl-a2', x: 22, y: 28,        angle: 0,   team: 'a', color: COLORS.playerBlue }, // left, facing ►
    { id: 'tpl-a3', x: 44, y: W - 12,    angle: 270, team: 'a', color: COLORS.playerBlue }, // bottom, facing ▲
    { id: 'tpl-a4', x: 66, y: 38,        angle: 180, team: 'a', color: COLORS.playerBlue }, // right, facing ◄
    { id: 'tpl-d1', x: 36, y: 26,        team: 'b', color: COLORS.playerRed },
    { id: 'tpl-d2', x: 52, y: 40,        team: 'b', color: COLORS.playerRed },
  ],
  equipment: [
    ball(24, 28),
    cone(18, 10),
    cone(18, W - 10),
    cone(68, 10),
    cone(68, W - 10),
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
