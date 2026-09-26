# Majorsoft Doors 98 — Investment Firm Simulator

Run an investment firm from inside a fake 1998 desktop operating system. Fully offline; runs in the browser.

**Status:** Phase 5 (character, logo and the New Game wizard). A seed generates a market of 10,000 companies, and a Web Worker
runs it in real time: trading hours and holidays, market regimes, sector moves, earnings seasons and the MAJOR 500.
MajorTrade Pro 98 has watchlists, quote windows with charts, market and limit orders, a portfolio and a cash ledger.
Internet Exploiter browses the in-game web: the Yeehaw! portal and search, every company's own website (home, about,
products, investor relations with live stats and holders, guestbook), competitor firms' sites and your own, QuoteZone
(movers, sector map, screener) and three newspapers written from the market. A Setup Wizard founds your firm: pick one of ten
famous firms or design your own logo, draw your CEO's portrait (every company CEO has one too), choose a difficulty or
tune the advanced settings, and get a laminated ID badge. Games save anywhere to named slots and
rotating autosaves, and export as `.d98` files. Apps not built yet are placeholders that say which build phase
delivers them.

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

## Playing

The game boots into your most recent save; the first time, the Setup Wizard founds your firm. Open **MajorTrade Pro 98**
to watch quotes and trade, and **Internet Exploiter** to read the news and visit companies (type a company or ticker
in the address bar to search Yeehaw!); the tray sets the game speed (a trading day takes two minutes at 1×). Press **Ctrl+S**
(or ⌘S) to save. **My Computer → Saves** lists saved games and exports or imports `.d98` files; dropping a `.d98` on
the desktop loads it. **My Computer → New Game** reruns Setup, and **My Computer → Firm** renames your firm and
edits its logo and CEO.

Saves live in the browser's IndexedDB, so they belong to the browser and address you play in (`localhost:5173` for
`npm run dev`). Export a `.d98` to keep one elsewhere.

## Development

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm test` | Unit tests (Vitest) |
| `npm run bench` | Benchmarks (budgets: world generation 1.5 s, one bar for 10,000 companies 4 ms) |
| `npm run typecheck` | TypeScript strict check |
| `npm run build` | Typecheck + production build into `dist/` |

### Layout

```
src/
  main.tsx          entry point
  shell/            Desktop, Window, Taskbar (+ tray), StartMenu, BootScreen, ShutdownScreen
  apps/             catalog.ts (app metadata as data), registry.ts (lazy components), one folder per app:
                    trade/ (MajorTrade Pro), quote/ (quote windows), browser/ (Internet Exploiter), mycomputer/
                    (saves, Setup Wizard, logo and portrait designers, advanced settings, firm panel),
                    recyclebin/, run/, shutdown/
  sites/            the in-game web: urls.ts (domains), Site.tsx (URL → site), web.tsx (links, marquee, hit counter),
                    portal/ (Yeehaw!), company/ (company sites: content.ts generates them), firm/, news/, quotezone/;
                    data/ holds the text templates, product lists and industry themes
  ui98/             98-style widgets 98.css lacks: menu bar, modals, virtualised table view, ticker tape
  charts/           price and performance charts (lightweight-charts), sparklines
  art/icons.tsx     original pixel-style SVG icons
  art/logo/         logo parts, the logo renderer and logo codes
  art/portrait/     CEO portrait options, parts and renderer
  art/badge/        the ID badge
  sim/              the market simulation: engine.ts (time, orders, queries, save state), market.ts (price model,
                    regimes, MAJOR 500), earnings.ts, history.ts, pregame.ts (generated history), account.ts,
                    calendar.ts, settings.ts (difficulty data); worker.ts runs it in a Web Worker via comlink
  state/            Zustand stores: windows, shell, trade (watchlists), game (session: boot, save, load);
                    saveFile.ts (.d98 format), saves.ts (IndexedDB slots), migrations.ts
  world/            world generation: rng, bitcode (genome, CEO and logo codes), genome, ceo, generator, company
                    decoding, ownership
                    data: industries, lexicons/, top100, presetFirms, cities, people-names
tests/              Vitest unit tests and benchmarks; __snapshots__/world-spotcheck.txt lists
                    20 random companies per industry for reviewing names
```

`Engine.newGame(...)` in `src/sim/engine.ts` runs a market headless (the tests do; the game runs it in the worker);
`generateWorld({ seed })` in `src/world/generator.ts` builds a market; `decodeCompany(genome)` in
`src/world/company.ts` turns any genome back into its company. Word lists and other content are typed data files;
genomes store indices into them, so they are append-only.

Adding an app: add an entry to `src/apps/catalog.ts`, then map its lazy component in `src/apps/registry.ts`
(until then it renders the placeholder).

Design decisions and judgement calls are recorded in [DECISIONS.md](DECISIONS.md).

## Credits

Charts by TradingView Lightweight Charts™, copyright © 2025 TradingView, Inc., <https://www.tradingview.com/>, under
the Apache License 2.0. Window styling from [98.css](https://github.com/jdan/98.css) (MIT). Logo motifs and website
clip-art are silhouettes from [game-icons.net](https://game-icons.net) by Lorc, Delapouite and contributors, under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), via [react-icons](https://react-icons.github.io/react-icons/)
(MIT). ID badge barcodes by [JsBarcode](https://github.com/lindell/JsBarcode) (MIT); logo SVG export by
[html-to-image](https://github.com/bubkoo/html-to-image) (MIT). All other game art, portraits included, is original.
