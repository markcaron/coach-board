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
  groupId?: string;
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
  groupId?: string;
}

export interface Equipment {
  id: string;
  x: number;
  y: number;
  kind: EquipmentKind;
  color?: string;
  angle?: number;
  groupId?: string;
}

export type ShapeKind = 'rect' | 'ellipse';
export type ShapeStyle = 'outline' | 'dashed' | 'fill-blue' | 'fill-red' | 'fill-yellow';

export interface ShapeStyleDef {
  name: string;
  value: ShapeStyle;
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
}

export const SHAPE_STYLES: ShapeStyleDef[] = [
  { name: 'White Outline', value: 'outline',     fill: 'transparent', fillOpacity: 0, stroke: 'white', strokeWidth: 0.18 },
  { name: 'White Dashed',  value: 'dashed',      fill: 'transparent', fillOpacity: 0, stroke: 'white', strokeWidth: 0.18, strokeDasharray: '0.6,0.4' },
  { name: 'Blue Fill',     value: 'fill-blue',   fill: '#4ea8de', fillOpacity: 0.2, stroke: 'none', strokeWidth: 0 },
  { name: 'Pink Fill',     value: 'fill-red',    fill: '#e87da0', fillOpacity: 0.25, stroke: 'none', strokeWidth: 0 },
  { name: 'Yellow Fill',   value: 'fill-yellow',  fill: '#f0c040', fillOpacity: 0.2, stroke: 'none', strokeWidth: 0 },
];

export interface Shape {
  id: string;
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  kind: ShapeKind;
  style: ShapeStyle;
  angle?: number;
  groupId?: string;
}

export interface TextSizeDef {
  label: string;
  value: number;
}

export const TEXT_SIZES: TextSizeDef[] = [
  { label: 'XS', value: 1 },
  { label: 'S',  value: 1.5 },
  { label: 'M',  value: 2 },
  { label: 'L',  value: 3 },
  { label: 'XL', value: 4 },
];

export interface TextItem {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize?: number;
  angle?: number;
  groupId?: string;
}

export type Tool = 'select' | 'add-player' | 'draw-line' | 'add-equipment' | 'draw-shape' | 'add-text';
export type LineStyle = 'solid' | 'dashed';
export type EquipmentKind = 'ball' | 'cone' | 'coach' | 'goal' | 'mini-goal';
