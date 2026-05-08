# CoachingBoard

A mobile-first soccer coaching tactical board built with [Lit](https://lit.dev/) Web Components and [Vite](https://vite.dev/). Designed for creating tactical diagrams, planning training sessions, and illustrating game strategies. Works offline at the field.

## Highlights

- **Formation Templates** — Start with preset formations (4-3-3, 4-2-3-1, 4-4-2, 3-5-2) or drill setups. Traditional positional numbering.
- **Three Player Types** — Triangles (Team A), circles (Team B), and diamonds (Neutral) with directional head segments showing facing.
- **Keyboard Shortcuts** — V, P, E, D, T for tools; R to rotate; Ctrl+A to select all. Feels like a design tool.
- **Marquee Selection** — Click and drag to select multiple elements at once on desktop.
- **Place-Then-Commit** — Drop elements quickly, then click the last one to start editing. No tool switching needed.
- **Keyframe Animation** — Animate player movement with cubic bezier motion trails and adjustable playback speed.
- **Smart Orientation** — Players auto-face the right direction based on field orientation and team.
- **Shareable Links** — Compress board state into a URL with OG previews (board name + thumbnail in link cards).
- **Multiple Pitch Types** — Full Pitch, Half Pitch (Defensive/Attacking), and Open Grass.
- **Print & Export** — Print with optional summary and white background. Export as SVG (reimportable), PNG, or animated GIF.
- **Multi-Board Storage** — IndexedDB-backed board persistence with My Boards gallery, Save As, Duplicate, and Export All.
- **Offline PWA** — Installable, works without internet. Update toast when new versions deploy.

## Features

### Field & Layout

* To-scale soccer field with FIFA-standard markings and grass stripe pattern
* Horizontal and vertical orientations with automatic element remapping
* Green and White field themes with adaptive colors
* Four pitch types: Full Pitch, Half Pitch (Defensive), Half Pitch (Attacking), Open Grass
* Mobile-first with automatic vertical field on small screens

### Players & Equipment

* Three team shapes — triangles (Team A), circles (Team B), diamonds (Neutral)
* Dark head segment overlay showing player facing direction
* Customizable jersey labels (up to 3 characters, auto-shrink)
* Auto-number toggle for sequential jersey numbering
* Equipment: ball, cones, dummies, poles, coach marker, goals (full, mini, pop-up)
* Double-ring visual style across cones, dummies, and poles
* Rotatable elements with toolbar button (R key) and desktop drag handles

### Lines, Shapes & Text

* Pass/Shot (solid), Run (dashed), Dribble (wavy) with optional arrowheads
* Curved lines with draggable control points
* Rectangles and ellipses with multiple fill/outline styles
* Text labels with 5 size options
* 6 line colors per theme

### Selection & Editing

* Marquee drag-to-select on desktop
* Multi-select via toggle button (mobile) or Shift/Cmd+click (desktop)
* Group/Ungroup, alignment, and distribution tools
* Batch color and style editing
* Undo/Redo with full history stack
* Keyboard shortcuts for all tools

### Animation

* Keyframe animation with cubic bezier motion trails
* Ghost rendering of previous positions
* Per-frame line visibility
* Configurable playback speed (0.5x, 1x, 2x) with loop toggle
* Timeline strip with add/delete frame controls

### Sharing & Storage

* Shareable links with OG meta tags and board thumbnails
* Board name displayed in readonly shared view
* Import/Export SVG with full board state roundtrip
* Save as PNG (10x resolution) or animated GIF
* IndexedDB multi-board storage with My Boards gallery
* Save As, Duplicate, Board Summary with notes, Print Board
* Export All Boards as zip

### Offline & PWA

* Full offline support via service worker
* Update toast when new versions are available
* Installable on iOS and Android
* Standalone display mode

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
* **IndexedDB (idb)** — client-side multi-board persistence
* **Netlify Functions/Blobs** — serverless short URL sharing
* **Netlify Edge Functions** — dynamic OG meta tags for link previews
* **modern-gif** — client-side GIF encoding for animation export
* **lz-string** — URI-safe compression for shareable links
* **jszip** — bulk SVG export as zip

## Built with AI

This app is an experiment in building a progressive web application almost entirely through conversation with [Claude](https://claude.ai) via [Cursor](https://cursor.com). The human-in-the-loop role was to provide the initial idea, make design and UX decisions, and guide the direction — the code, architecture, accessibility patterns, and implementation were all generated by AI (with the occasional best practices correction). The goal was to see how far you can get by simply describing what you want and iterating on the result.

## License

This project is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). You're free to use, modify, and share it — just not for commercial purposes.
