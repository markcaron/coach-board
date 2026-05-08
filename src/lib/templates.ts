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
const HL = 60;
const cx = L / 2;
const cy = W / 2;

function teamA(x: number, y: number, label: string): Player {
  return { id: `tpl-a-${label}`, x, y, team: 'a', color: COLORS.playerBlue, label, angle: 0 };
}

function teamB(x: number, y: number, label: string): Player {
  return { id: `tpl-b-${label}`, x, y, team: 'b', color: COLORS.playerRed, label, angle: 180 };
}

function ball(x: number, y: number): Equipment {
  return { id: 'tpl-ball', x, y, kind: 'ball' };
}

const FULL_433: BoardTemplate = {
  id: 'full-433',
  name: '4-3-3 Formation',
  pitchType: 'full',
  players: [
    teamA(5, cy, '1'),
    teamA(20, 12, '2'), teamA(20, 30, '3'), teamA(20, W - 30, '4'), teamA(20, W - 12, '5'),
    teamA(38, 18, '6'), teamA(38, cy, '8'), teamA(38, W - 18, '10'),
    teamA(55, 12, '7'), teamA(55, cy, '9'), teamA(55, W - 12, '11'),

    teamB(L - 5, cy, '1'),
    teamB(L - 20, W - 12, '2'), teamB(L - 20, W - 30, '3'), teamB(L - 20, 30, '4'), teamB(L - 20, 12, '5'),
    teamB(L - 38, W - 18, '6'), teamB(L - 38, cy, '8'), teamB(L - 38, 18, '10'),
    teamB(L - 55, W - 12, '7'), teamB(L - 55, cy, '9'), teamB(L - 55, 12, '11'),
  ],
  equipment: [ball(cx, cy)],
  lines: [],
  shapes: [],
  textItems: [],
};

const FULL_442: BoardTemplate = {
  id: 'full-442',
  name: '4-4-2 Formation',
  pitchType: 'full',
  players: [
    teamA(5, cy, '1'),
    teamA(20, 12, '2'), teamA(20, 30, '3'), teamA(20, W - 30, '4'), teamA(20, W - 12, '5'),
    teamA(40, 10, '7'), teamA(40, 28, '6'), teamA(40, W - 28, '8'), teamA(40, W - 10, '11'),
    teamA(55, 24, '9'), teamA(55, W - 24, '10'),

    teamB(L - 5, cy, '1'),
    teamB(L - 20, W - 12, '2'), teamB(L - 20, W - 30, '3'), teamB(L - 20, 30, '4'), teamB(L - 20, 12, '5'),
    teamB(L - 40, W - 10, '7'), teamB(L - 40, W - 28, '6'), teamB(L - 40, 28, '8'), teamB(L - 40, 10, '11'),
    teamB(L - 55, W - 24, '9'), teamB(L - 55, 24, '10'),
  ],
  equipment: [ball(cx, cy)],
  lines: [],
  shapes: [],
  textItems: [],
};

const FULL_352: BoardTemplate = {
  id: 'full-352',
  name: '3-5-2 Formation',
  pitchType: 'full',
  players: [
    teamA(5, cy, '1'),
    teamA(20, 18, '3'), teamA(20, cy, '4'), teamA(20, W - 18, '5'),
    teamA(38, 8, '7'), teamA(38, 24, '6'), teamA(38, cy, '8'), teamA(38, W - 24, '10'), teamA(38, W - 8, '11'),
    teamA(55, 24, '9'), teamA(55, W - 24, '10'),

    teamB(L - 5, cy, '1'),
    teamB(L - 20, W - 18, '3'), teamB(L - 20, cy, '4'), teamB(L - 20, 18, '5'),
    teamB(L - 38, W - 8, '7'), teamB(L - 38, W - 24, '6'), teamB(L - 38, cy, '8'), teamB(L - 38, 24, '10'), teamB(L - 38, 8, '11'),
    teamB(L - 55, W - 24, '9'), teamB(L - 55, 24, '10'),
  ],
  equipment: [ball(cx, cy)],
  lines: [],
  shapes: [],
  textItems: [],
};

const HALF_DEF_BLOCK: BoardTemplate = {
  id: 'half-def-block',
  name: '4-4-2 Defensive Block',
  pitchType: 'half',
  players: [
    teamA(8, cy, '1'),
    teamA(22, 12, '2'), teamA(22, 28, '3'), teamA(22, W - 28, '4'), teamA(22, W - 12, '5'),
    teamA(35, 10, '7'), teamA(35, 26, '6'), teamA(35, W - 26, '8'), teamA(35, W - 10, '11'),
    teamA(45, 24, '9'), teamA(45, W - 24, '10'),

    teamB(50, 10, '7'), teamB(50, cy, '9'), teamB(50, W - 10, '11'),
    teamB(42, 24, '8'), teamB(42, W - 24, '10'),
  ],
  equipment: [ball(45, cy)],
  lines: [],
  shapes: [],
  textItems: [],
};

const HALF_ATT_OVERLOAD: BoardTemplate = {
  id: 'half-att-overload',
  name: 'Wide Overload',
  pitchType: 'half-attack',
  players: [
    teamA(15, 10, '7'), teamA(15, W - 10, '11'),
    teamA(25, 22, '8'), teamA(25, cy, '9'), teamA(25, W - 22, '10'),
    teamA(40, 8, '2'), teamA(40, W - 8, '5'),

    teamB(10, 14, '3'), teamB(10, 30, '4'), teamB(10, W - 30, '5'), teamB(10, W - 14, '6'),
    teamB(5, cy, '1'),
  ],
  equipment: [ball(25, cy)],
  lines: [],
  shapes: [],
  textItems: [],
};

const OPEN_RONDO: BoardTemplate = {
  id: 'open-rondo',
  name: 'Rondo (4v2)',
  pitchType: 'open',
  players: [
    teamA(20, 18, '1'), teamA(20, 50, '2'),
    teamA(40, 10, '3'), teamA(40, 58, '4'),

    teamB(28, cy, '1'), teamB(34, cy, '2'),
  ],
  equipment: [ball(30, 30)],
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
