# Changelog

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
