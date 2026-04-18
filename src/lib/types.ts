export interface PlayerColor {
  name: string;
  color: string;
  text: string;
}

export const PLAYER_COLORS: PlayerColor[] = [
  { name: 'Blue',       color: '#4ea8de', text: '#151515' },
  { name: 'Red',        color: '#d43d55', text: '#ffffff' },
  { name: 'Yellow',     color: '#f0c040', text: '#151515' },
  { name: 'Purple',     color: '#7b2d8e', text: '#ffffff' },
  { name: 'Light Gray', color: '#adb5bd', text: '#151515' },
  { name: 'Dark Gray',  color: '#495057', text: '#ffffff' },
];

export function getTextColor(fillColor: string): string {
  return PLAYER_COLORS.find(c => c.color === fillColor)?.text ?? '#ffffff';
}

export interface ConeColor {
  name: string;
  color: string;
}

export const CONE_COLORS: ConeColor[] = [
  { name: 'Chartreuse',  color: '#7fff00' },
  { name: 'Neon Orange', color: '#ff6b1a' },
  { name: 'Bright Pink', color: '#ff3ea5' },
  { name: 'Bright Blue', color: '#00bfff' },
];

export interface LineColor {
  name: string;
  color: string;
}

export const LINE_COLORS: LineColor[] = [
  { name: 'White',  color: '#ffffff' },
  { name: 'Blue',   color: '#83c2e8' },
  { name: 'Red',    color: '#e17788' },
  { name: 'Yellow', color: '#f5d379' },
  { name: 'Purple', color: '#a36cb0' },
  { name: 'Gray',   color: '#808589' },
];

export type Team = 'a' | 'b';

export interface Player {
  id: string;
  x: number;
  y: number;
  team: Team;
  color: string;
  label?: string;
  angle?: number;
}

export interface Line {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx: number;
  cy: number;
  color: string;
  style: 'solid' | 'dashed';
  arrowStart: boolean;
  arrowEnd: boolean;
}

export interface Equipment {
  id: string;
  x: number;
  y: number;
  kind: EquipmentKind;
  color?: string;
  angle?: number;
}

export type Tool = 'select' | 'add-player' | 'draw-line' | 'add-equipment';
export type LineStyle = 'solid' | 'dashed';
export type EquipmentKind = 'ball' | 'cone' | 'coach' | 'goal' | 'mini-goal';
