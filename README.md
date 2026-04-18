# Coaching Tactical Board

An SVG-based soccer coaching board built with [Lit](https://lit.dev/) Web Components and [Vite](https://vite.dev/). Designed for creating tactical diagrams, planning training sessions, and illustrating game strategies.

## Features

- **To-scale soccer field** with FIFA-standard markings
- **Two team shapes** — triangles (Team A / attacking) and circles (Team B / defending) for accessible, color-independent differentiation
- **Draggable players** with customizable numbers and colors (6 color options with accessible contrast)
- **Equipment** — soccer ball, cones (4 colors), coach marker, full-size and mini goals
- **Lines and arrows** — solid (pass/shot) and dashed (run) styles, adjustable arrowheads on either end, 6 line colors
- **Rotation** — rotate triangles and goals with corner handles; hold Shift to snap to 15-degree increments
- **Multi-select** — Shift/Cmd+click to select multiple items; drag to move as a group; batch color changes for same-type selections
- **Undo / Redo** — full history with Cmd+Z / Cmd+Shift+Z
- **Responsive** — SVG scales to fit any container

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Tech Stack

- **Lit 3** — lightweight Web Components
- **TypeScript** — type-safe throughout
- **Vite** — fast dev server and bundler

---

Designed and coded with my friend, [Claude](https://claude.ai).
