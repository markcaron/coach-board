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

// Traditional positional numbering (from the 2-3-5 era):
// 1=GK
// 2=RB, 3=LB, 4=RCB, 5=LCB (or CCB in a back 3)
// 6=LCM/LHalf, 7=RW, 8=RCM/RHalf, 9=ST, 10=inside-left, 11=LW
//
// Field coords: x=0 is left goal, y=0 is top touchline, y=68 is bottom touchline
// Top (low y) = LEFT side of pitch when viewed from behind the goal
// Bottom (high y) = RIGHT side of pitch
// So right-sided players (#2, #7, #8) have HIGH y values
// Left-sided players (#3, #11, #10, #6) have LOW y values

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
    outfield(40, cy, '10'),    // CAM — central (#10 as playmaker)
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

// Half pitch (attacking): no GK
const HALF_ATT_OVERLOAD: BoardTemplate = {
  id: 'half-att-overload',
  name: 'Attacking Overload',
  pitchType: 'half-attack',
  players: [
    outfield(42, W - 8, '2'),  // RB overlapping
    outfield(42, 8, '3'),      // LB overlapping
    outfield(28, W - 20, '8'), // RCM
    outfield(28, cy, '6'),     // CDM
    outfield(28, 20, '10'),    // CAM
    outfield(14, W - 8, '7'),  // RW
    outfield(14, cy, '9'),     // ST
    outfield(14, 8, '11'),     // LW
  ],
  equipment: [ball(16, cy)],
  lines: [],
  shapes: [],
  textItems: [],
};

const OPEN_RONDO: BoardTemplate = {
  id: 'open-rondo',
  name: 'Rondo (4v2)',
  pitchType: 'open',
  players: [
    outfield(15, 18, '1'),
    outfield(15, 50, '2'),
    outfield(38, 14, '3'),
    outfield(38, 54, '4'),
    { id: 'tpl-d1', x: 24, y: 30, team: 'b', color: COLORS.playerRed, label: '1' },
    { id: 'tpl-d2', x: 30, y: 40, team: 'b', color: COLORS.playerRed, label: '2' },
  ],
  equipment: [ball(26, 34)],
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
  HALF_ATT_OVERLOAD,
  OPEN_RONDO,
];

export function getTemplatesForPitch(pitchType: PitchType): BoardTemplate[] {
  return BUILT_IN_TEMPLATES.filter(t => t.pitchType === pitchType);
}
