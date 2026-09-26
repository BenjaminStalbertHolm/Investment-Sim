# Majorsoft Doors 98 — Investment Firm Simulator

Run an investment firm from inside a fake 1998 desktop operating system. Fully offline; runs in the browser.

**Status:** Phase 2 (world generation). The desktop shell works and the apps are placeholders that say which build
phase delivers them. Under the hood, a seed now generates the whole market: 10,000 companies (the curated top 100
plus procedural ones, each encoded as a 34-character genome), competitor firms and who owns what. The market engine
and the Trade app that show it arrive in Phase 3.

## Running on macOS

1. Install Node 20 LTS or newer: `brew install node` (or use nvm).
2. Double-click **`Start Majorsoft Doors 98.command`** in Finder. It installs dependencies on first run,
   starts the dev server and opens your browser. Close the Terminal window to stop it.
   (If macOS blocks it the first time, right-click → Open.)

Or from a terminal:

```sh
npm install
npm run dev          # http://localhost:5173
```

Production build: `npm run build && npm run preview`.

Targets Safari and Chrome on macOS, 1280×800 minimum window.

## Development

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm test` | Unit tests (Vitest) |
| `npm run bench` | Benchmarks (world generation budget: 1.5 s) |
| `npm run typecheck` | TypeScript strict check |
| `npm run build` | Typecheck + production build into `dist/` |

### Layout

```
src/
  main.tsx          entry point
  shell/            Desktop, Window, Taskbar (+ tray), StartMenu, BootScreen, ShutdownScreen
  apps/             catalog.ts (app metadata as data), registry.ts (lazy components), one folder per app
  art/icons.tsx     original pixel-style SVG icons
  art/logo/, art/portrait/   logo and CEO portrait option lists (the renderers arrive in Phase 5)
  state/            Zustand stores: windows (window manager), shell (power, icon positions, speed)
  world/            world generation: rng, genome codec, generator, company decoding, ownership
                    data: industries, lexicons/, top100, presetFirms, cities, people-names
tests/              Vitest unit tests and benchmarks; __snapshots__/world-spotcheck.txt lists
                    20 random companies per industry for reviewing names
```

`generateWorld({ seed })` in `src/world/generator.ts` builds a market; `decodeCompany(genome)` in
`src/world/company.ts` turns any genome back into its company. Word lists and other content are typed data files;
genomes store indices into them, so they are append-only.

Adding an app: add an entry to `src/apps/catalog.ts`, then map its lazy component in `src/apps/registry.ts`
(until then it renders the placeholder).

Design decisions and judgement calls are recorded in [DECISIONS.md](DECISIONS.md).
