# Majorsoft Doors 98 — Investment Firm Simulator

Run an investment firm from inside a fake 1998 desktop operating system. Fully offline; runs in the browser.

**Status:** Phase 1 (desktop shell). The desktop, windows, taskbar, Start menu and boot/shutdown screens work;
the apps are placeholders that say which build phase delivers them.

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
| `npm run typecheck` | TypeScript strict check |
| `npm run build` | Typecheck + production build into `dist/` |

### Layout

```
src/
  main.tsx          entry point
  shell/            Desktop, Window, Taskbar (+ tray), StartMenu, BootScreen, ShutdownScreen
  apps/             catalog.ts (app metadata as data), registry.ts (lazy components), one folder per app
  art/icons.tsx     original pixel-style SVG icons
  state/            Zustand stores: windows (window manager), shell (power, icon positions, speed)
tests/              Vitest unit tests
```

Adding an app: add an entry to `src/apps/catalog.ts`, then map its lazy component in `src/apps/registry.ts`
(until then it renders the placeholder).

Design decisions and judgement calls are recorded in [DECISIONS.md](DECISIONS.md).
