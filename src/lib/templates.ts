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

const L = 105;
const W = 68;
const cx = L / 2;
const cy = W / 2;

function gk(x: number, y: number): Player {
  return { id: 'tpl-gk', x, y, team: 'a', color: COLORS.playerYellow, label: '1', angle: 0 };
}

function outfield(x: number, y: number, label: string): Player {
  return { id: `tpl-${label}`, x, y, team: 'a', color: COLORS.playerBlue, label, angle: 0 };
}

function ball(x: number, y: number): Equipment {
  return { id: 'tpl-ball', x, y, kind: 'ball' };
}

// Traditional positional numbering:
// 1=GK, 2=RB, 3=LB, 4=CB, 5=CB, 6=CDM/CM, 7=RW, 8=CM, 9=ST, 10=CAM/CF, 11=LW

const FULL_433: BoardTemplate = {
  id: 'full-433',
  name: '4-3-3',
  pitchType: 'full',
  players: [
    gk(3, cy),
    outfield(16, 10, '2'),    // RB — right flank
    outfield(16, 27, '4'),    // RCB — right of penalty arc
    outfield(16, W - 27, '5'),// LCB — left of penalty arc
    outfield(16, W - 10, '3'),// LB — left flank
    outfield(32, 22, '8'),    // RCM
    outfield(32, cy, '6'),    // CDM
    outfield(32, W - 22, '10'),// LCM
    outfield(46, 10, '7'),    // RW — right flank
    outfield(46, cy, '9'),    // ST — center
    outfield(46, W - 10, '11'),// LW — left flank
  ],
  equipment: [ball(cx, cy)],
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
    outfield(16, 10, '2'),    // RB
    outfield(16, 27, '4'),    // RCB
    outfield(16, W - 27, '5'),// LCB
    outfield(16, W - 10, '3'),// LB
    outfield(34, 10, '7'),    // RM — right flank
    outfield(34, 27, '8'),    // RCM
    outfield(34, W - 27, '6'),// LCM
    outfield(34, W - 10, '11'),// LM — left flank
    outfield(46, 26, '9'),    // RST
    outfield(46, W - 26, '10'),// LST
  ],
  equipment: [ball(cx, cy)],
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
    outfield(16, 18, '4'),    // RCB
    outfield(16, cy, '5'),    // CCB
    outfield(16, W - 18, '3'),// LCB
    outfield(32, 6, '2'),     // RWB — wide right
    outfield(32, 22, '8'),    // RCM
    outfield(32, cy, '6'),    // CDM
    outfield(32, W - 22, '10'),// LCM
    outfield(32, W - 6, '7'), // LWB — wide left
    outfield(46, 26, '9'),    // RST
    outfield(46, W - 26, '11'),// LST
  ],
  equipment: [ball(cx, cy)],
  lines: [],
  shapes: [],
  textItems: [],
};

const HALF_DEF_BLOCK: BoardTemplate = {
  id: 'half-def-block',
  name: '4-4-2 Low Block',
  pitchType: 'half',
  players: [
    gk(5, cy),
    outfield(16, 10, '2'),
    outfield(16, 27, '4'),
    outfield(16, W - 27, '5'),
    outfield(16, W - 10, '3'),
    outfield(30, 10, '7'),
    outfield(30, 27, '8'),
    outfield(30, W - 27, '6'),
    outfield(30, W - 10, '11'),
    outfield(40, 26, '9'),
    outfield(40, W - 26, '10'),
  ],
  equipment: [ball(42, cy)],
  lines: [],
  shapes: [],
  textItems: [],
};

const HALF_ATT_OVERLOAD: BoardTemplate = {
  id: 'half-att-overload',
  name: 'Attacking Overload',
  pitchType: 'half-attack',
  players: [
    outfield(40, 6, '2'),     // RB overlapping
    outfield(40, W - 6, '3'), // LB overlapping
    outfield(25, 22, '8'),    // RCM
    outfield(25, cy, '6'),    // CDM
    outfield(25, W - 22, '10'),// LCM/CAM
    outfield(12, 8, '7'),     // RW
    outfield(12, cy, '9'),    // ST
    outfield(12, W - 8, '11'),// LW
  ],
  equipment: [ball(14, cy)],
  lines: [],
  shapes: [],
  textItems: [],
};

const OPEN_RONDO: BoardTemplate = {
  id: 'open-rondo',
  name: 'Rondo (4v2)',
  pitchType: 'open',
  players: [
    outfield(15, 20, '1'),
    outfield(15, 48, '2'),
    outfield(35, 14, '3'),
    outfield(35, 54, '4'),
    { id: 'tpl-d1', x: 23, y: 30, team: 'b', color: COLORS.playerRed, label: '1', angle: 0 },
    { id: 'tpl-d2', x: 28, y: 40, team: 'b', color: COLORS.playerRed, label: '2', angle: 0 },
  ],
  equipment: [ball(24, 34)],
  lines: [],
  shapes: [],
  textItems: [],
};

export const BUILT_IN_TEMPLATES: BoardTemplate[] = [
  FULL_433,
  FULL_442,
  FULL_352,
  HALF_DEF_BLOCK,
  HALF_ATT_OVERLOAD,
  OPEN_RONDO,
];

export function getTemplatesForPitch(pitchType: PitchType): BoardTemplate[] {
  return BUILT_IN_TEMPLATES.filter(t => t.pitchType === pitchType);
}
