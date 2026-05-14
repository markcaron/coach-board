# Changelog

## 1.7.1 (2026-05-13)

### Patch

Recovery patch restoring three features that were included in the v1.7.0 Houston Dash release notes but were absent from the deployed build due to a branch history issue (the `staging/houston-dash` commits for PRs #215, #216, and #217 were orphaned before the staging → main merge).

- **Sidebar menus clipped on iOS** (#210 / PR #215): restored.
- **Clamp all items to field bounds** (#203 / PR #216): restored.
- **Retheme all dialogs to light surface** (#213 / PR #217): restored.

No new features or breaking changes. Functionally identical to what v1.7.0 was intended to ship.

## 1.7.0 — Houston Dash (2026-05-13)

### Features

- **Cross-device cloud sync** (#214): Boards and templates are now restored from Netlify Blobs on sign-in. Signing in on a second device (or after clearing local storage) pulls all cloud boards into local IndexedDB using last-write-wins conflict resolution by `updatedAt` timestamp. Thumbnails are fetched and stored alongside each restored board. Templates also participate in LWW sync via a new optional `updatedAt` field stamped on create and rename. The Netlify sync function (`sync.ts`) gains GET routes for listing and fetching boards/templates; auth uses HMAC-SHA256 JWT verification with `JWT_SECRET` (replacing the v1 `context.clientContext` path that silently failed on Functions v2). A "Syncing boards from cloud…" status message (persistent `aria-live` region) appears in the Settings sheet while restore is in progress.
- **Retheme all dialogs to light surface** (#213): All `<dialog>` elements in `cb-dialogs.ts` and the sidebar delete confirmation in `cb-toolbar.ts` switch to the same white/light surface used by side-sheets (`--pt-bg-inverted`, `color-scheme: light`). `color-scheme: light` ensures native form controls (selects, checkboxes, inputs) render in light mode. Alert colours updated for adequate contrast on white: warning `#7a5800` (6.5:1), info `#5c3d99` (8.1:1). All interactive element borders meet WCAG 1.4.11 (inputs/selects `rgba(0,0,0,0.5)` → 3.95:1; export cards `rgba(0,0,0,0.45)` → 3.36:1).
- **About panel moved to side-sheet** (#204): The About modal dialog is replaced by a `cb-side-sheet` panel consistent with Settings, Board Summary, and My Boards. Focus moves to the close button on open and returns to the hamburger toggle on close. The dialog template, `@query` accessor, `showAbout()` method, and all About-specific CSS are removed from `cb-dialogs.ts`.
- **Clamp all items to field bounds** (#203): Players, equipment, shapes, text, lines, and animation trail control points can no longer be dragged or placed so far off-screen that they become unrecoverable. A `FIELD_MARGIN` of 10 SVG units (~10 m / ~11 yards) outside each edge is enforced at all placement and drag sites: click-to-place, line/shape drawing (start point + live endpoint), group drag for all item types, individual handle drag for line start/end/control points, and animation trail Bézier control points. Lines preserve shape and length during group drag by clamping the shared delta rather than individual endpoints.

### Bug Fixes

- **Sidebar menus clipped on iOS** (#210): All sidebar tool submenus (Equipment, Draw, More/⋯) and sidebar-context edit menus (Align, Grouping, Z-order) were clipped by the browser because `.board-area` has `overflow: hidden` and the sidebar sits inside it. A post-render `#clampMenuToBoardArea()` helper (extracted to `src/lib/menu-utils.ts`) measures available space above and below the trigger, opens in the direction with more room, nudges by the exact overflow amount when the menu almost fits (avoiding scroll), and falls back to `max-height` + `overflow-y: auto` only when the menu is taller than the entire board area. Fixes Equipment (Goal/Coach hidden), Draw (Dribble cut off), More/⋯ (most items hidden), and Align ("Align left" clipped behind the context bar).
- **Sidebar tool button shows active state while menu is open**: Sidebar trigger buttons (Player, Equipment, Draw, More) now show the hover background (`--pt-border`) when their submenu is open via `[aria-expanded="true"]` CSS.
- **Sidebar tool menu + context edit menu open simultaneously**: Opening a tool submenu (player, equipment, draw, more) and a context edit menu (Align, Grouping, Style) at the same time caused them to overlap. Fixed with mutual exclusion: `cb-toolbar` dispatches `cb-ctx-menu-open` (bubbles, composed) when a context menu opens; `coach-board` listens and closes `_sidebarMenu`. Opening a tool submenu calls `ctxToolbar.closeMenu()`.

### Accessibility

- **Focus rings on light surfaces** (#213, #218): All components that render on a white side-sheet or dialog surface now use `--pt-btn-primary` (`#2563eb`, 5.17:1 on white) for `:focus-visible` outlines instead of `--pt-accent` (`#4ea8de`, 2.60:1 — fails WCAG 1.4.11). Affects `cb-side-sheet`, `cb-board-summary`, `cb-my-boards`, `cb-share`, and the settings controls in `coach-board.ts`.
- **Scrollable menu `tabindex`** (#210): When a sidebar menu falls back to `overflow-y: auto` (extreme small viewport), the menu container receives `tabindex="0"` so keyboard and AT users can scroll it; the attribute is removed on reset.
- **`cb-toolbar.ts` delete dialog close button** (#218): The delete confirmation dialog in `cb-toolbar.ts` was missing a `.dialog-close:focus-visible` rule (pre-existing gap). Now has `outline: 2px solid var(--pt-btn-primary)`.

### Design System

- **`--pt-border-on-inverted` corrected**: The token previously resolved to `var(--pt-color-navy-500)` (`#1a4a7a`), a dark saturated blue unsuitable as a subtle border on white. Updated to `rgba(0, 0, 0, 0.12)` — a neutral light-gray container border. Interactive element borders (buttons, inputs) still require `rgba(0,0,0,0.45–0.5)` and must be set explicitly.
- **Token table updated**: `--pt-btn-primary`, `--pt-btn-primary-hover`, `--pt-bg-inverted`, `--pt-text-on-inverted`, and `--pt-border-on-inverted` added to the `design-system.mdc` canonical table with contrast ratios and guidance on when to use each. Focus ring patterns documented for both dark and light surfaces.


## 1.6.0 — Angel City FC (2026-05-12)

### Features

- **Cloud backup via Netlify Identity** (#201): Boards and user templates are automatically synced to the cloud when signed in. Sign in / Sign out lives in the new Settings side-sheet. A cloud-backup status bar appears above the My Boards tabs when authenticated, and a local-storage notice (with a direct link to Settings) is shown when logged out. Cloud sync is handled by a new `netlify/functions/sync.ts` serverless function and `src/lib/cloud-sync.ts`.
- **User-created templates** (#60): Coaches can save any board as a personal template from the Save dialog ("Save as template" checkbox). Templates appear in a new Templates tab in the My Boards side-sheet with the same kebab menu actions as boards — use, duplicate, rename, delete.
- **My Boards kebab menus & inline rename**: Each saved board and template entry has a ⋯ kebab menu with Rename, Duplicate, and Delete actions. Rename opens an inline text input in place of the board row. Board count badge appears on the Saved Boards tab.
- **Settings side-sheet** (#180): A new Settings panel (gear icon / hamburger menu) houses the distance unit preference (Metres / Yards, persisted to `localStorage`). The Settings panel is also the entry point for cloud account management (Sign In / Sign Out).
- **Inline context editor** (#191): The Select tool gains an inline context editor that attaches to the canvas alongside a selected element, surfacing the most common properties (color, style, label) without opening a separate panel. The context track is a full toolbar participant with proper ARIA roles and keyboard navigation.
- **Per-board and per-template SVG export** (#205): Each board row and template row in My Boards now has an Export option in its ⋯ kebab menu, downloading a data-embedding SVG without requiring the board to be open first. The hamburger menu entry is renamed to "Export Current Board" to distinguish it. Export icon scales down to match other kebab menu icons.
- **Notes & Instructions Markdown** (#62): The Notes & Instructions textarea in the Board Summary side-sheet now supports a restricted Markdown subset — bold, italic, `##`/`###` headings, bullet and numbered lists, and horizontal rules. A compact formatting toolbar (Bold, Italic, H2, Bullet list, Numbered list, HR) inserts syntax at the cursor. A Preview toggle renders the parsed Markdown in-place. The print summary block also renders formatted notes. Backward-compatible: existing plain-text notes render unchanged.

### Bug Fixes

- **Side-sheet focus return from hamburger menu** (#198): Closing My Boards, Board Summary, or Settings after opening them from the hamburger menu now correctly returns focus to the hamburger toggle button instead of `<body>`. Root cause: Lit batched the menu-close and sheet-open state changes into one render, so `document.activeElement` was already `<body>` by the time `cb-side-sheet` captured it. Fixed by pre-capturing the return-focus target before any state changes in each `#show*` method and passing it via a new `returnFocusEl` property on `cb-side-sheet`.
- **iOS native zoom trap** (#190): Double-tap and pinch gestures on the canvas no longer trigger browser-level page zoom in standalone PWA mode. Fixed via `touch-action: manipulation` on all component `:host` rules, replacing earlier attempts (zoom escape button, `user-scalable` meta) that had side effects.
- **Auth session restore on reload**: Netlify Identity session was lost on page reload because the auth init listener registered after the identity widget fired. Fixed by reading `currentUser()` synchronously after `init()`.
- **Sidebar auto-hide removed** (#193): The sidebar no longer closes automatically on hover-leave. It only closes via the grab handle, preventing accidental collapse mid-interaction.
- **Dribble icon arrowhead in Draw menus** (#156): The dribble path SVG was missing its arrowhead in sidebar Draw submenus; restored by extending the path to match the toolbar version.
- **Distance unit select border** (#180): The distance unit `<select>` in the settings sheet was missing its 1px border, making it invisible against the surface background.
- **Inverted-surface token contrast** (#180): Settings sheet text and inputs now use `--pt-bg-inverted` / `--pt-text-on-inverted` / `--pt-border-on-inverted` for correct contrast on the light card surface.

### Accessibility

- **Notes toolbar WAI-ARIA** (#62): Formatting toolbar has `role="toolbar"`, `aria-label`, `aria-controls` pointing to the textarea, and full roving tabindex (ArrowLeft/ArrowRight navigation). All icon-only buttons have `aria-label` and `title`. A persistent `role="status"` region announces "Edit mode" / "Preview mode" on toggle.
- **Select track as toolbar participant** (#191): The inline context editor track has `role="toolbar"` with correct `tabindex` management and a live region that announces the current selection count on multi-select changes.
- **Settings `aria-describedby`** (#197): The distance unit `<select>` is linked to its hint paragraph via `aria-describedby`, surfacing the hint to screen readers.
- **My Boards alert contrast**: Logged-out storage alert "Settings" link uses `--pt-btn-primary` (`#2563eb`, 5.2:1 on white) instead of `--pt-accent` (2.6:1), passing WCAG AA for normal text on the white side-sheet surface.


## 1.5.1 (2026-05-11)

### Bug Fixes

- **My Boards title overflow** (#185): Long board names overflowed into the duplicate and delete buttons. Root cause: `.board-info` lacked `min-width: 0`, preventing `text-overflow: ellipsis` from firing. Added `min-width: 0; overflow: hidden` to `.board-info` in `cb-my-boards.ts`.
- **iOS input auto-zoom** (#187): Increased `font-size` on all `<input>`, `<select>`, and `<textarea>` elements from `0.85rem` (~13.6px) to `1rem` (16px). iOS Safari auto-zooms when a focused form control has `font-size < 16px`, cropping dialogs and leaving users in a zoomed state. Affects the Save Board input, New Board selects, Board Summary notes textarea, playback speed select, player number input, text content input, font/line-style selects, and context bar theme select.


## 1.5.0 — Washington Spirit (2026-05-11)

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
