/**
 * Positions a sidebar menu so it stays fully within `.board-area`, which has
 * `overflow: hidden`. Called post-render with actual getBoundingClientRect()
 * measurements so it works correctly on any viewport size.
 *
 * Strategy (in order):
 *   1. Fits below trigger      → CSS default (top: 0), no change
 *   2. Fits above trigger      → flip (top: auto; bottom: 0)
 *   3. Fits neither, but fits  → nudge by the overflow amount (no scroll)
 *      inside the board area
 *   4. Taller than board area  → max-height + overflow-y:auto + tabindex=0
 *      (scroll unavoidable)       so keyboard/AT can scroll the container
 */
export function clampMenuToBoardArea(menuEl: HTMLElement, boardArea: HTMLElement): void {
  menuEl.style.top = '';
  menuEl.style.bottom = '';
  menuEl.style.maxHeight = '';
  menuEl.style.overflowY = '';
  menuEl.removeAttribute('tabindex');

  const wrapperEl = menuEl.parentElement;
  if (!wrapperEl) return;

  const menuHeight = menuEl.getBoundingClientRect().height;
  const wrapperRect = wrapperEl.getBoundingClientRect();
  const boardRect = boardArea.getBoundingClientRect();
  const PAD = 4;
  const safeTop = boardRect.top + PAD;
  const safeBottom = boardRect.bottom - PAD;

  const spaceBelow = safeBottom - wrapperRect.top;
  const spaceAbove = wrapperRect.bottom - safeTop;
  const totalAvailable = boardRect.height - 2 * PAD;

  if (menuHeight <= spaceBelow) {
    // Fits going down — CSS default, no adjustment needed
  } else if (menuHeight <= spaceAbove) {
    // Fits going up — flip anchor to trigger bottom
    menuEl.style.top = 'auto';
    menuEl.style.bottom = '0px';
  } else if (menuHeight > totalAvailable) {
    // Taller than the entire board area — scroll is unavoidable.
    // tabindex="0" lets keyboard and AT users scroll the container.
    if (spaceBelow >= spaceAbove) {
      menuEl.style.maxHeight = `${spaceBelow}px`;
    } else {
      menuEl.style.top = 'auto';
      menuEl.style.bottom = '0px';
      menuEl.style.maxHeight = `${spaceAbove}px`;
    }
    menuEl.style.overflowY = 'auto';
    menuEl.tabIndex = 0;
  } else if (spaceBelow >= spaceAbove) {
    // More room below — nudge up so bottom edge meets safeBottom
    menuEl.style.top = `${-(menuHeight - spaceBelow)}px`;
  } else {
    // More room above — flip and nudge so top edge meets safeTop
    menuEl.style.top = 'auto';
    menuEl.style.bottom = `${-(menuHeight - spaceAbove)}px`;
  }
}
