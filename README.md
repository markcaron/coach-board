# CoachingBoard

A mobile-first soccer coaching tactical board built with [Lit](https://lit.dev/) Web Components and [Vite](https://vite.dev/). Designed for creating tactical diagrams, planning training sessions, and illustrating game strategies. Works offline at the field.

## Features

### Field & Layout

* **To-scale soccer field** with FIFA-standard markings and grass stripe pattern
* **Horizontal and vertical** field orientations with item remapping on switch
* **Two-toolbar layout** — drawing tools on top, actions on the bottom, field fills the middle
* **Mobile-first** — automatic vertical field on small screens, responsive SVG scaling

### Players & Equipment

* **Two team shapes** — triangles (Team A) and circles (Team B) for color-independent differentiation
* **Draggable players** with customizable jersey numbers and 6 color options
* **Equipment** — soccer ball, cones (4 colors), coach marker, full-size and mini goals
* **Rotatable elements** — rotate players, goals, shapes, and text; Shift to snap to 15° increments
* **Scaled for touch** — 150% larger elements with 44px+ touch targets for mobile usability

### Lines & Arrows

* **Pass / Shot** — solid line with optional arrowheads
* **Run** — dashed line with optional arrowheads
* **Dribble** — wavy/squiggly line with optional arrowheads and consistent wave frequency
* **Curved lines** — drag the control point to bend any line into a curve
* **6 line colors** — white, blue, red, yellow, purple, gray
* **Arrowheads** — toggle independently on start and end of any line

### Shapes & Text

* **Rectangles and ellipses** — draw shapes with multiple fill/outline styles
* **Text labels** — add text anywhere on the field with 4 size options
* **Rotatable** — rotate shapes and text with the corner handle

### Selection & Editing

* **Multi-select** — Shift/Cmd+click to select multiple items
* **Group / Ungroup** — group items to move them together
* **Alignment & distribution** — align left, center, right, top, middle, bottom; distribute evenly
* **Batch editing** — change colors, styles, and properties across multiple selected items
* **Delete** — remove selected items with confirmation dialog
* **Undo / Redo** — full history stack with Cmd+Z / Cmd+Shift+Z

### Mobile Experience

* **Touch-optimized** — large touch targets, no scroll interference during drag
* **Auto-vertical** — forces vertical field on mobile with `matchMedia` listener
* **Landscape blocker** — portrait-only overlay on mobile (Safari-compatible)
* **Responsive toolbars** — button text hidden on small screens, icons always visible
* **Double-tap to rotate** — tap once to select, double-tap to reveal the rotate handle
* **No pinch-zoom** — viewport locked to prevent accidental zoom

### Design & Accessibility

* **CSS custom properties** — full `--pt-*` design token system for consistent theming
* **Accessible** — `aria-label` and `title` on all interactive elements, `:focus-visible` outlines
* **Color contrast** — all text passes WCAG AA (4.5:1 minimum)
* **Native dialogs** — `<dialog>` elements with header, close button, and backdrop
* **Drop shadows** — toolbar shadows for visual depth and separation
* **Visually-hidden** utility class for screen reader-only labels

### Offline & PWA

* **Service worker** — precaches all assets via `vite-plugin-pwa` for full offline support
* **Auto-update** — silently updates when new versions deploy
* **Home screen icons** — iOS and Android installable with custom icons
* **Web app manifest** — standalone display mode with themed chrome
* **localStorage** — all board state persists locally, zero server dependencies

### Export

* **Save as SVG** — export the current board as a clean SVG file

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Build

```bash
npm run build
```

Outputs to `dist/` with service worker and precached assets.

## Tech Stack

* **Lit 3** — lightweight Web Components
* **TypeScript** — type-safe throughout
* **Vite** — fast dev server and bundler
* **vite-plugin-pwa** — service worker and offline support

## License

This project is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). You're free to use, modify, and share it — just not for commercial purposes.

---

Designed and coded with my friend, [Claude](https://claude.ai).
