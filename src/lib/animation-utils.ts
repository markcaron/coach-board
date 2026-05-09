import type { AnimationFrame } from './types.js';

/**
 * Returns the current display position of an item, respecting animation mode.
 * Walks backward from `activeFrameIndex` to find the last recorded position.
 */
export function getItemPosition(
  id: string, baseX: number, baseY: number,
  animationFrames: AnimationFrame[], activeFrameIndex: number,
  animationMode: boolean,
): { x: number; y: number } {
  if (!animationMode) return { x: baseX, y: baseY };
  for (let i = activeFrameIndex; i >= 0; i--) {
    const pos = animationFrames[i]?.positions[id];
    if (pos) return { x: pos.x, y: pos.y };
  }
  return { x: baseX, y: baseY };
}

/**
 * Returns the current display angle of an item, respecting animation mode.
 */
export function getItemAngle(
  id: string, baseAngle: number | undefined,
  animationFrames: AnimationFrame[], activeFrameIndex: number,
  animationMode: boolean,
): number | undefined {
  if (!animationMode) return baseAngle;
  for (let i = activeFrameIndex; i >= 0; i--) {
    const pos = animationFrames[i]?.positions[id];
    if (pos && pos.angle != null) return pos.angle;
  }
  return baseAngle;
}

/**
 * Returns the position of an item at a specific frame index (frame-relative,
 * no animationMode guard — always walks the frame history).
 */
export function getItemPositionAtFrame(
  id: string, baseX: number, baseY: number,
  animationFrames: AnimationFrame[], frameIndex: number,
): { x: number; y: number } {
  for (let i = frameIndex; i >= 0; i--) {
    const pos = animationFrames[i]?.positions[id];
    if (pos) return { x: pos.x, y: pos.y };
  }
  return { x: baseX, y: baseY };
}

/**
 * Returns the angle of an item at a specific frame index.
 */
export function getItemAngleAtFrame(
  id: string, baseAngle: number | undefined,
  animationFrames: AnimationFrame[], frameIndex: number,
): number | undefined {
  for (let i = frameIndex; i >= 0; i--) {
    const pos = animationFrames[i]?.positions[id];
    if (pos && pos.angle != null) return pos.angle;
  }
  return baseAngle;
}
