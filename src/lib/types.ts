export type FieldTheme = 'green' | 'white';
export type PitchType = 'full' | 'half' | 'half-attack' | 'open';

export const COLORS = {
  bgBody: '#1a1a2e',
  bgPrimary: '#16213e',
  bgSurface: '#0f3460',
  bgDark: '#151515',
  bgToolbar: '#1c3a5c',
  border: '#1a4a7a',

  text: '#e0e0e0',
  textMuted: '#aaa',
  textOnLight: '#555',
  textWhite: '#fff',

  accent: '#4ea8de',
  accentHover: '#3a8fc4',

  danger: '#e94560',
  dangerHover: '#d13350',
  dangerLight: '#f87171',
  dangerLightest: '#fb8a8a',

  success: '#16a34a',
  successHover: '#15803d',
  successLight: '#86efac',
  successBtnHover: '#116b33',

  warning: '#f0c040',
  warningHover: '#d4a830',
  bgWarning: '#fef3c7',

  btnPrimary: '#2563eb',
  btnPrimaryHover: '#1d4ed8',

  fieldStripeLight: '#2d6a4f',
  fieldStripeDark: '#276749',

  fieldBgWhite: '#ffffff',
  fieldAreaWhite: '#f0f0f0',
  fieldLineWhite: '#bbb',
  fieldNetWhite: '#999',
  fieldTextWhite: '#222222',
  fieldSelWhite: '#2563eb',

  playerBlue: '#4ea8de',
  playerRed: '#d43d55',
  playerYellow: '#f0c040',
  playerPurple: '#7b2d8e',
  playerLightGray: '#adb5bd',
  playerDarkGray: '#495057',
  playerTextDark: '#151515',
  playerTextLight: '#ffffff',

  playerBlueW: '#2e86c1',
  playerRedW: '#d43d55',
  playerYellowW: '#c9a020',
  playerPurpleW: '#7b2d8e',
  playerLightGrayW: '#6c757d',
  playerDarkGrayW: '#495057',

  coneChartreuse: '#7fff00',
  coneNeonOrange: '#ff6b1a',
  coneBrightPink: '#ff3ea5',
  coneBrightBlue: '#00bfff',

  coneChartreuseW: '#5cb800',
  coneNeonOrangeW: '#ff6b1a',
  coneBrightPinkW: '#ff3ea5',
  coneBrightBlueW: '#0099d6',

  lineWhite: '#ffffff',
  lineBlue: '#83c2e8',
  lineRed: '#e17788',
  lineYellow: '#f5d379',
  linePurple: '#a36cb0',
  lineGray: '#808589',

  lineBlack: '#222222',
  lineBlueW: '#2e86c1',
  lineRedW: '#c4233a',
  lineYellowW: '#b8940a',
  linePurpleW: '#7b2d8e',
  lineGrayW: '#808589',

  shapeFillBlue: '#4ea8de',
  shapeFillPink: '#e87da0',
  shapeFillYellow: '#f0c040',
  shapeStrokeGray: '#999',

  ballDetail: '#333',
  equipmentBody: '#222',
  coachBg: '#151515',
  annotation: '#ffd166',
  popupGoal: '#f0c040',

  inactiveArrow: '#ccc',
  previewStroke: '#e0e0e0',
  white: '#ffffff',
  black: '#222222',
} as const;

export interface PlayerColor {
  name: string;
  color: string;
  text: string;
}

export const PLAYER_COLORS: PlayerColor[] = [
  { name: 'Blue',       color: COLORS.playerBlue,      text: COLORS.playerTextDark },
  { name: 'Red',        color: COLORS.playerRed,       text: COLORS.playerTextLight },
  { name: 'Yellow',     color: COLORS.playerYellow,    text: COLORS.playerTextDark },
  { name: 'Purple',     color: COLORS.playerPurple,    text: COLORS.playerTextLight },
  { name: 'Light Gray', color: COLORS.playerLightGray, text: COLORS.playerTextDark },
  { name: 'Dark Gray',  color: COLORS.playerDarkGray,  text: COLORS.playerTextLight },
];

export const PLAYER_COLORS_WHITE: PlayerColor[] = [
  { name: 'Blue',       color: COLORS.playerBlueW,      text: COLORS.playerTextLight },
  { name: 'Red',        color: COLORS.playerRedW,       text: COLORS.playerTextLight },
  { name: 'Yellow',     color: COLORS.playerYellowW,    text: COLORS.playerTextLight },
  { name: 'Purple',     color: COLORS.playerPurpleW,    text: COLORS.playerTextLight },
  { name: 'Light Gray', color: COLORS.playerLightGrayW, text: COLORS.playerTextLight },
  { name: 'Dark Gray',  color: COLORS.playerDarkGrayW,  text: COLORS.playerTextLight },
];

export function getTextColor(fillColor: string): string {
  return PLAYER_COLORS.find(c => c.color === fillColor)?.text
    ?? PLAYER_COLORS_WHITE.find(c => c.color === fillColor)?.text
    ?? COLORS.playerTextLight;
}

export function getPlayerColors(theme: FieldTheme): PlayerColor[] {
  return theme === 'white' ? PLAYER_COLORS_WHITE : PLAYER_COLORS;
}

export interface ConeColor {
  name: string;
  color: string;
}

export const CONE_COLORS: ConeColor[] = [
  { name: 'Hi-Vis Yellow', color: COLORS.coneChartreuse },
  { name: 'Neon Orange',   color: COLORS.coneNeonOrange },
  { name: 'Bright Pink',   color: COLORS.coneBrightPink },
  { name: 'Bright Blue',   color: COLORS.coneBrightBlue },
];

export const CONE_COLORS_WHITE: ConeColor[] = [
  { name: 'Hi-Vis Yellow', color: COLORS.coneChartreuseW },
  { name: 'Neon Orange', color: COLORS.coneNeonOrangeW },
  { name: 'Bright Pink', color: COLORS.coneBrightPinkW },
  { name: 'Bright Blue', color: COLORS.coneBrightBlueW },
];

export function getConeColors(theme: FieldTheme): ConeColor[] {
  return theme === 'white' ? CONE_COLORS_WHITE : CONE_COLORS;
}

export interface LineColor {
  name: string;
  color: string;
}

export const LINE_COLORS: LineColor[] = [
  { name: 'White',  color: COLORS.lineWhite },
  { name: 'Blue',   color: COLORS.lineBlue },
  { name: 'Red',    color: COLORS.lineRed },
  { name: 'Yellow', color: COLORS.lineYellow },
  { name: 'Purple', color: COLORS.linePurple },
  { name: 'Gray',   color: COLORS.lineGray },
];

export const LINE_COLORS_WHITE: LineColor[] = [
  { name: 'Black',  color: COLORS.lineBlack },
  { name: 'Blue',   color: COLORS.lineBlueW },
  { name: 'Red',    color: COLORS.lineRedW },
  { name: 'Yellow', color: COLORS.lineYellowW },
  { name: 'Purple', color: COLORS.linePurpleW },
  { name: 'Gray',   color: COLORS.lineGrayW },
];

export function getLineColors(theme: FieldTheme): LineColor[] {
  return theme === 'white' ? LINE_COLORS_WHITE : LINE_COLORS;
}

export type Team = 'a' | 'b' | 'neutral';

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

export type LineStyle = 'solid' | 'dashed' | 'wavy';

export interface Line {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx: number;
  cy: number;
  color: string;
  style: LineStyle;
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
  { name: 'Blue Fill',     value: 'fill-blue',   fill: COLORS.shapeFillBlue, fillOpacity: 0.2, stroke: 'none', strokeWidth: 0 },
  { name: 'Pink Fill',     value: 'fill-red',    fill: COLORS.shapeFillPink, fillOpacity: 0.25, stroke: 'none', strokeWidth: 0 },
  { name: 'Yellow Fill',   value: 'fill-yellow', fill: COLORS.shapeFillYellow, fillOpacity: 0.2, stroke: 'none', strokeWidth: 0 },
];

export const SHAPE_STYLES_WHITE: ShapeStyleDef[] = [
  { name: 'Gray Outline',  value: 'outline',     fill: 'transparent', fillOpacity: 0, stroke: COLORS.shapeStrokeGray, strokeWidth: 0.18 },
  { name: 'Gray Dashed',   value: 'dashed',      fill: 'transparent', fillOpacity: 0, stroke: COLORS.shapeStrokeGray, strokeWidth: 0.18, strokeDasharray: '0.6,0.4' },
  { name: 'Blue Fill',     value: 'fill-blue',   fill: COLORS.shapeFillBlue, fillOpacity: 0.25, stroke: 'none', strokeWidth: 0 },
  { name: 'Pink Fill',     value: 'fill-red',    fill: COLORS.shapeFillPink, fillOpacity: 0.3, stroke: 'none', strokeWidth: 0 },
  { name: 'Yellow Fill',   value: 'fill-yellow', fill: COLORS.shapeFillYellow, fillOpacity: 0.25, stroke: 'none', strokeWidth: 0 },
];

export function getShapeStyles(theme: FieldTheme): ShapeStyleDef[] {
  return theme === 'white' ? SHAPE_STYLES_WHITE : SHAPE_STYLES;
}

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

export interface TrailControlPoints {
  cp1x: number;
  cp1y: number;
  cp2x: number;
  cp2y: number;
}

export interface FramePosition {
  x: number;
  y: number;
  angle?: number;
}

export interface AnimationFrame {
  id: string;
  positions: Record<string, FramePosition>;
  trails: Record<string, TrailControlPoints>;
  visibleLineIds: string[];
}

export type Tool = 'select' | 'add-player' | 'draw-line' | 'add-equipment' | 'draw-shape' | 'add-text';
export type EquipmentKind = 'ball' | 'cone' | 'coach' | 'goal' | 'mini-goal' | 'popup-goal' | 'dummy' | 'pole';
