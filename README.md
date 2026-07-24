# LabTechOS

A desktop-style laboratory-automation **protocol designer + machine controller**,
inspired by Opentrons Protocol Designer, PrusaSlicer, and professional
instrumentation software. Built with React + TypeScript and a clean,
precision-focused light theme.

It turns a 3D-printer-based liquid handler into a full media-exchange workstation:
lay out the deck, calibrate it against real hardware, program a routine, generate
and inspect G-code, simulate the run, and drive the machine over USB — all in the
browser. State lives entirely in a Zustand store (no backend); hardware
communication uses the Web Serial API (Chrome/Edge).

## Stack

- **React 18 + TypeScript** (Vite)
- **TailwindCSS** with shadcn-style UI primitives (`src/components/ui`)
- **Zustand** — single centralized store (`src/store/useStore.ts`)
- **React Three Fiber + drei + three** — the 3D deck, calibration, and simulation scenes
- **React DnD** (HTML5 backend) — drag-and-drop workflow blocks
- **Web Serial API** — USB G-code communication with the printer
- **Lucide React** — icons

## Getting started

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # typecheck (tsc --noEmit) + production build → dist/
npm run preview    # preview the production build
npm run typecheck
```

> The 3D / Web-Serial features work best in a Chromium browser (Chrome or Edge).

## Deploying to Vercel

This is a static Vite SPA — no server runtime required.

1. Push the repo to GitHub.
2. In Vercel, **Import** the repository. The included [`vercel.json`](./vercel.json)
   sets the framework (Vite), build command (`npm run build`), output directory
   (`dist`), and an SPA fallback rewrite, so no extra configuration is needed.
3. Deploy. Vercel installs dependencies, runs the build, and serves `dist/`.

There are no environment variables to set. The two plate models in
`public/models/*.stl` (~4.9 MB total) are committed and served as static assets.

## Screens

- **Dashboard** — entry point: start a new project or open a saved `.cell`
  configuration file (loads deck layout + routine back into the app).
- **Plate Routine** — pick labware (24- or 96-well), select wells (click,
  ⌘/Ctrl-click, drag-sweep, ⇧-rectangle, row/column headers), and build the
  protocol (Remove Media, Add Fresh Media, Wait, nested Loop) in a drag-and-drop
  Workflow Builder scoped to the selected well set.
- **Calibrated Deck Setup** — jog the toolhead over USB and capture the real
  positions of the plate corners + reservoirs; captures update the shared deck
  live, so the layout always matches the hardware.
- **Manual Deck Setup** — a dimensionally accurate 3D + 2D deck editor: drag the
  plate / fresh-media / waste objects, configure coordinates and build volume,
  with snap-to-grid, clearance dimension lines, and a live coordinate readout.
  Save the whole configuration to a `.cell` file.
- **G-Code** — generate a runnable program from the routine + deck (with a
  pink-bottle fill animation), then inspect it in a syntax-highlighted viewer;
  click any line for a plain-language explanation. Export `.gcode`.
- **Simulation** — replay the generated tool-path in the same 3D deck scene with
  a media transport bar (play/pause, rewind, scrub, speed).
- **Pipette Calibration** — move the pipette into a container, set a target
  volume, and jog the extruder until the volume is drawn to calibrate µL ↔ steps.
- **Machine Control** — connect over USB, jog the printer, send manual G-code,
  and use a palette of frequently-used commands with a live console.

Plate models are dimensionally accurate (24-well: ⌀15.6 mm / 19.3 mm pitch;
96-well: ⌀6.4 mm / 9.0 mm pitch). Reservoir liquids use a real-time shallow-water
height-field for slosh + ripple physics.

## Project layout

```
public/models/      24- and 96-well plate STL models (served at /models/*.stl)
src/
  types/            Domain interfaces (Project, Plate, Well, Workflow, DeckConfig…)
  lib/              Plate geometry, deck/validation, calibration, G-code, sim, .cell I/O, serial
  data/             Mock project data
  store/            Centralized Zustand store (routing, deck, calibration, routine, g-code)
  components/
    ui/             shadcn-style primitives + ResizablePanel
    layout/         Sidebar, Header, AppShell
    dashboard/      DashboardPage (.cell import)
    plate/          Plate Routine — controls, well selector, visualization
    workflow/       Workflow builder, block library, blocks
    deck/           3D printer workspace, 2D top view, deck panel, animated liquid
    calibration/    Calibrated Deck Setup — wizard + 3D scene
    pipette/        Pipette Calibration — wizard + 3D scene
    gcode/          G-Code tab — generate, bottle loader, viewer, explainer
    simulation/     Simulation tab — 3D playback + timeline
    machine/        Machine Control — jog, manual command, presets, console
```
