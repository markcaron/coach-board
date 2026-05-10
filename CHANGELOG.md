# Changelog

## 1.4.0 — SD Wave (2026-05-10)

### Features

- **Partial drawer sidebar** (#121): The floating tool sidebar now collapses to a 14px grab-handle strip at the left edge of the canvas, fixing the mobile overlap introduced by the left-layout refactor. Expands on grab-handle tap, hover (desktop), or tool selection; collapses when interacting with the board. Reduced-motion aware; collapsed sidebar content is `inert` so hidden buttons don't appear in the tab order.
- **Pitch Theme moved to context bar** (#119): The theme selector — now labeled **Grass** and **Whiteboard** — moved from the bottom bar to the right end of the context bar, persistently visible in both normal and readonly modes. The readonly bottom bar (which existed only for this control) is removed.
- **Toast enter/exit animation** (#115): The "new version" update toast slides up and fades in on entry, then drops and fades out on dismiss. Reduced-motion support skips the animation and removes the dismiss delay. Double-click guard prevents duplicate dismiss timeouts.
- **Shift+drag line control point resets curve** (#104): Holding Shift while dragging a line's curve handle snaps the control point to the midpoint of the two endpoints, straightening the line instantly — completing the Shift+drag axis-constraint system.

### Bug Fixes

- **Readonly context bar branding** (#118): Restored the CoachingBoard logo and home link in shared/readonly board views, which were dropped by the left-sidebar layout refactor.
- **Board name ellipsis**: Long board names in the context bar now truncate with an ellipsis (`max-width: min(40%, 30em)`). Root cause: `display: flex` on the container was preventing `text-overflow` from reaching text node children.
- **White pitch theme seam** (#103): Eliminated the 1px compositing seam between the sidebar area and the field when the Whiteboard theme was active, by making the sidebar `position: absolute` over the field canvas.
- **Update toast layout** (#108): The update notification is now a `position: fixed` floating overlay positioned outside `.app-wrap` — board layout no longer shifts when it appears, and `z-index` now takes effect.
- **Context panel header padding** (#111): Panel titles no longer sit flush against the left edge of the context panel.

### Design System

- **Inverted surface tokens** (#114): Added `--pt-bg-inverted`, `--pt-text-on-inverted`, and `--pt-border-on-inverted` — semantic tokens for light/contrast UI elements on the dark app chrome. Used by the update toast.

### Refactoring

- **Inline styles → CSS classes** (#107): Replaced ~100 repeated inline `style=` attributes across 5 components (`cb-toolbar`, `coach-board`, `cb-dialogs`, `cb-share`, `cb-field`) with named CSS classes in each component's static styles.

## 1.3.0 — KC Current (2026-05-09)

### Features

- **Per-frame shape visibility** (#57): Shapes drawn in animation mode are tied to the frame they were created on, appearing from that frame onward — like lines. Enables pressing-zone boxes, tactical highlights, and zone annotations that appear and disappear during playback.
- **Shift+drag axis constraint** (#56): Holding Shift while dragging an element constrains movement to the nearest axis — horizontal, vertical, or 45° diagonal. Works for player/equipment/shape/text drags (including animation frame drags), line endpoint drags, and trail control point drags.
- **Animation timeline progress bar** (#58): The active frame button shows a growing progress bar during playback, and the timeline auto-scrolls to keep the active frame visible as it advances.
- **Component decomposition** (#76): `coach-board.ts` decomposed into `<cb-board-bar>`, `<cb-field>`, `<cb-dialogs>`, and `<cb-share>` web components, reducing render coupling and improving maintainability.
- **Dialog state decoupled from field renders** (#85): Dialog-specific state moved into `<cb-dialogs>` so board edits no longer trigger unnecessary dialog re-renders.

### Bug Fixes

- **Shape rendering regression**: Shapes (rectangles and ellipses) were invisible on all boards due to a Lit template issue introduced during the `<cb-field>` extraction. Dynamic tag names (`<${kind}>`) are not supported in Lit `svg\`` templates; restored to explicit conditional branches. Also fixed missing `fill-opacity`, `strokeWidth`, and `strokeDasharray` from shape styles.
- **Ghost trail rotation** (#81): Animation ghost/trail markers for Team A and Neutral players always rendered facing up regardless of rotation. Now reads the player's angle at the previous frame and applies a `translate + rotate` transform.
- **Arrow key nudge in animation mode** (#53): Nudging with arrow keys now writes to the frame's position record instead of modifying the base player coordinates, matching how drag-move works. Fixes the "ghost moves instead of player" bug.
- **Undo/redo for animation frames** (#54): `animationFrames` is now included in the undo snapshot, making frame position drags, frame add/delete, and per-frame shape registrations all undoable.
- **Undo/redo restores field orientation, theme, and pitch type**: Undoing across a field orientation change (e.g. a responsive mobile resize) now correctly restores the orientation alongside the element coordinates.
- **SW Refresh double-reload**: The "Refresh" button in the update toast no longer causes a blank page by triggering two sequential reloads.
- **CSS corruption in bottom bar**: A stray top-level `}` left by a conflict resolution caused the entire `.bottom-bar` CSS to be silently dropped. Bottom toolbar now renders correctly.
- **cb-share dialog showing on load**: The share dialog appeared on every page load because `dialog { display: flex }` overrides the UA stylesheet's hidden state. Added `dialog:not([open]) { display: none }`.
- **iOS print dark background** (#61): Added global `@media print` rules on `html`, `body`, and `main` to force white background and light color-scheme, fixing the dark navy bleed on iOS Safari.
- **Animation GC pressure** (#80): Items that never move across any animation frame now return their original object reference directly (zero allocation per rAF tick). Items static within a frame segment also return the original reference.

### Performance & Architecture

- **Lit directives** (#83): Applied `guard()` and `repeat()` for SVG field rendering to skip diffing unchanged sections.
- **Animation interpolation GC** (#80): Pre-computed `#animatedIds` set in `willUpdate` avoids repeated `flatMap` in hot render paths.
- **5 dialog event round-trips eliminated** (#85): Board name typing, pitch type selection, print checkbox toggles, etc. are now handled internally in `<cb-dialogs>` with no parent re-renders.

### Accessibility

- **Timeline focus ring clipping**: The frames scroll container no longer clips focus outlines. Pressing "+" to add a frame keeps focus on the button and scrolls it into view.
- **a11y rule added**: Agent rule prevents dismissing accessibility concerns without filing a tracked issue.

## 1.2.3 (2026-05-08)

### Bug Fixes

- **Template vertical orientation**: Fixed template positions and angles not rotating correctly on mobile/vertical boards. Angles no longer double-rotated.

## 1.2.2 (2026-05-08)

### Bug Fixes

- **Rondo template**: Fixed to diamond shape with 4 orange cones, no player labels.
- **Attacking Shape template**: Renamed from "Attacking Overload", now includes both teams (Team A attacking, Team B defending with purple GK).

## 1.2.1 (2026-05-08)

### Bug Fixes

- **Update toast Refresh button**: Added explicit page reload after service worker activation so the Refresh button actually reloads the page.

## 1.2.0 — Gotham FC Release (2026-05-08)

### New Features

- **Preset Formation Templates**: New Board dialog includes a Template dropdown with built-in formations (4-3-3, 4-2-3-1, 4-4-2, 3-5-2) and drill setups (4-4-2 Low Block, Attacking Overload, Rondo 4v2). Templates are pitch-type-specific with proper traditional positional numbering.
- **Keyboard Shortcuts**: V (Select), P (Player), E (Equipment), D (Draw), T (Text), R (Rotate), Ctrl+A (Select All), Arrow keys to nudge selected items. Shortcut hints in button tooltips.
- **Marquee Selection**: Click and drag on empty space to draw a selection rectangle on desktop.
- **Place-Then-Commit**: After placing an item, it's auto-selected. Click it to switch to Select mode, or click elsewhere to keep placing.
- **Smart Player Orientation**: Players automatically face the correct direction based on field orientation and team.
- **Update Toast**: When a new app version is deployed, a toast bar prompts users to refresh.
- **"Don't Save" Button**: Save-first dialog now offers Don't Save to abandon changes and proceed.
- **Shared Board Previews**: Board name and thumbnail shown in link previews (OG tags via Netlify Edge Function). Board name visible in readonly mode.

### Visual & UX Improvements

- **Player Directionality**: All player types show a dark head segment overlay indicating facing direction. Team B circles are now rotatable.
- **Arrow Toggle State**: Arrow start/end buttons now show red pressed state when active.
- **Delete Button Position**: Always far-right in edit toolbar, separated by a divider.
- **GK Color**: Goalkeeper uses yellow in templates for visual distinction.

### Bug Fixes

- **Mobile Double-Tap Zoom**: Removed double-tap-to-rotate gesture on mobile; switched to `touch-action: manipulation`. Rotation via toolbar button instead.
- **Animation Rotation Capture**: Initial player rotation no longer captured as animated property in frame 0.
- **Export Button Visibility**: Hidden when no boards exist; Import stays at 50% width.
- **Shared Board Cleanup**: Preview thumbnails deleted alongside expired board data.
- **Input Guard**: Keyboard shortcuts now properly guarded against TEXTAREA and SELECT elements.

## 1.1.1 (2026-05-08)

### Bug Fixes

- **Version sync**: About dialog and SVG exports now read version from `package.json` at build time via Vite's `define` config, preventing version drift.

## 1.1.0 — NC Courage Release (2026-05-07)

### New Features

- **Neutral Player**: New diamond-shaped player type with yellow color and "N" default label. Rotatable with head segment directionality.
- **Player Directionality**: All player types (triangle, circle, diamond) now show a dark head segment overlay indicating facing direction. Team B circles are now rotatable.
- **Rotate Button**: New toolbar button for rotating selected players and equipment counter-clockwise in 45-degree increments. Works for all rotatable items (players, dummies, goals).
- **Auto-Number Toggle**: Checkbox in the Player dropdown to auto-assign sequential jersey numbers per team. Off by default — players place without labels unless toggled on.
- **3-Character Labels**: Player labels now support up to 3 characters (e.g., "CDM", "GK"). Font auto-shrinks for labels longer than 2 characters.
- **Flat Dummy Equipment**: Pill-shaped training dummy with colored outer ring, lighter tinted center, and rotation support.
- **Pole Equipment**: Training pole with colored center dot and silver outer ring — visual inverse of cones.
- **Print Board**: Print dialog with options to include board summary and use white background. Handles iOS print background correctly.
- **Save As / Duplicate**: "Save As..." creates a new board copy with a new name. Duplicate button in My Boards list for instant board copying.
- **Board Summary**: Dialog showing grouped counts of players, equipment, lines, shapes, and animation frames. Includes Notes & Instructions textarea that persists to IndexedDB.
- **Pitch Types**: Full Pitch, Half Pitch (Defensive), Half Pitch (Attacking), and Open Grass selectable when creating a new board.

### Visual & UX Improvements

- **Equipment Visual Overhaul**: Cones, dummies, and poles all share a consistent double-ring style (outer colored ring + gap + center fill). Cones have a thick colored ring with silver center (inverse of poles).
- **Default Cone Color**: New cones default to Neon Orange instead of Hi-Vis Yellow for better visual differentiation in the equipment menu. Existing boards with unset cone colors are backfilled to Hi-Vis Yellow on load.
- **"Chartreuse" Renamed to "Hi-Vis Yellow"**: Display name updated across all equipment color labels. Hex values unchanged.
- **Equipment Menu Reorder**: Ball, Cone, Dummy, Pole, Goal, Mini Goal, Pop-up Goal, Coach.
- **My Boards Dialog Polish**: Warning alert for empty state, info alert for storage message, card-style borders on board items, "Saved Boards" section header.
- **Hamburger Menu**: Increased width for better proportions. New items: Save As, Board Summary, Print Board.
- **Bottom Bar Spacing**: Gap increased to match top toolbar density.
- **Form Field Borders**: New `--pt-border-ui` design token at higher contrast for interactive form elements.
- **Mini-Goal Depth**: Increased to match pop-up goal proportions.
- **Print Icon**: Updated to a cleaner printer icon.
- **Orientation Dropdown**: Now closes on click-outside (bug fix).

### Bug Fixes

- **Print Background (iOS)**: White background forced on host and summary block in print mode to prevent dark blue bleed on iOS.
- **Mobile Rotation for Dummies**: `isRotatable` updated to include dummy equipment kind.
- **Cone Color Picker Swatches**: Fixed rendering by using `svg` tagged templates instead of `html` inside SVG elements.
