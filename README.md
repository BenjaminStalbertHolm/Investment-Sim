# Majorsoft Doors 98 — Investment Firm Simulator

Run an investment firm from inside a fake 1998 desktop operating system. Fully offline; runs in the browser.

**Status:** Phase 7 (shorting, margin, futures, commodities, loans and bankruptcy). A seed generates a market of 10,000
companies, and a Web Worker runs it in real time: trading hours and holidays, market regimes, sector moves, earnings
seasons and the MAJOR 500. MajorTrade Pro 98 has watchlists, quote windows with charts, a margin account (buy, sell,
sell short and buy to cover; market, limit, stop, stop-limit and trailing-stop orders), a portfolio, a cash ledger,
a calendar, futures on 22 commodities and indices, and bank loans. Internet Exploiter browses the in-game web: the
Yeehaw! portal and search, every company's own website (home, about, products, investor relations with live stats,
short interest and holders, guestbook), competitor firms' sites and your own, QuoteZone (movers, sector map, screener),
the news, the Chicago Murkantile Exchange, the National Weather Bureau (its warnings are a real signal for farm and
energy futures), OPEK, the Federal Reservoir, First Continental Bank, Equifacts, and Ask Reeves, the in-game help. A Setup Wizard founds your firm:
pick one of ten famous firms or design your own logo, draw your CEO's portrait (every company CEO has one too), choose a
difficulty or tune the advanced settings, and get a laminated ID badge. The market has corporate events — scandals,
frauds, takeovers, drug trials, recalls, CEO changes, dividends, bankruptcies — and an economy with a Federal Reservoir;
news breaks on the Majorsoft Newswire and cascades through TV, the trade press, the morning papers and the weekend
magazines, often after rumours on the Raging Bear boards. Outbox Express brings clients with mandate offers, quarterly
statements, top-ups and redemptions, broker letters (margin calls, share recalls, deliveries), a morning briefing, news
alerts, tips and junk mail. Borrow too much and a margin call or a defaulted loan ends the firm: the Blue Screen of
Debt, a final report, and a place in the Hall of Shame. Games save anywhere to named slots and
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

The game boots into your most recent save; the first time, the Setup Wizard founds your firm. New to investing? The
**Ask Reeves** icon on the desktop (or Start → Help) opens the in-game help: guides to stocks, orders, margin, short
selling, futures, loans and clients, and a butler who answers questions. Open **MajorTrade Pro 98**
to watch quotes and trade, and **Internet Exploiter** to read the news and visit companies (type a company or ticker
in the address bar to search Yeehaw!); the tray sets the game speed (a trading day takes two minutes at 1×).
**Outbox Express** (the tray's envelope shows unread mail) is where clients offer mandates — each with rules that apply
to your whole portfolio — and where tips, briefings and broker letters arrive. **My Computer → Firm** lists your clients
and their mandates and sets your fees. The account is a margin account: MajorTrade's **Futures** tab trades contracts
(hold a commodity past its last trading day and it is delivered to your office lobby), **Financing** takes out bank
loans and repays them (in part or in full, at any time), and the Portfolio shows equity against the margin
requirements; a margin call gives a few days to put it right.
Press **Ctrl+S**
(or ⌘S) to save. **My Computer → Saves** lists saved games and exports or imports `.d98` files; dropping a `.d98` on
the desktop loads it. **My Computer → New Game** reruns Setup, **My Computer → Firm** renames your firm and
edits its logo and CEO, and **My Computer → Hall of Shame** keeps the final reports of firms that went bankrupt.

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
  shell/            Desktop, Window, Taskbar (+ tray), StartMenu, BootScreen, ShutdownScreen, BlueScreen
  apps/             catalog.ts (app metadata as data), registry.ts (lazy components), one folder per app:
                    trade/ (MajorTrade Pro), quote/ (quote windows), browser/ (Internet Exploiter), mail/ (Outbox
                    Express: letters.ts writes the letters, data.ts their templates), mycomputer/ (saves, Setup Wizard,
                    logo and portrait designers, advanced settings, firm panel with clients and fees),
                    recyclebin/, run/, shutdown/
  sites/            the in-game web: urls.ts (domains), Site.tsx (URL → site), web.tsx (links, marquee, hit counter),
                    text.ts (template writer), portal/ (Yeehaw!), company/ (company sites: content.ts generates them),
                    firm/, news/ (every outlet; articles.ts writes articles from the news archive), forum/ (Raging
                    Bear), quotezone/, finance/ (the exchange, Weather Bureau, OPEK, Federal Reservoir, bank and
                    Equifacts), help/ (Ask Reeves: topics.tsx holds the guides); data/ holds the text templates,
                    product lists and industry themes
  ui98/             98-style widgets 98.css lacks: menu bar, modals, virtualised table view, ticker tape
  charts/           price and performance charts (lightweight-charts), sparklines
  art/icons.tsx     original pixel-style SVG icons
  art/logo/         logo parts, the logo renderer and logo codes
  art/portrait/     CEO portrait options, parts and renderer
  art/badge/        the ID badge
  sim/              the market simulation: engine.ts (time, orders, queries, save state), market.ts (price model,
                    regimes, MAJOR 500, delisting), earnings.ts (and dividends), events.ts (corporate events, rumours,
                    takeovers), macro.ts (the economy and the Federal Reservoir), press.ts (outlets' coverage and
                    journalists), news.ts (the archive's shape), clients.ts (clients, mandates, fees), mail.ts (mail and
                    tips), margin.ts (Reg-T requirements), shorts.ts (short interest, borrow fees, recalls, squeezes),
                    commodities.ts (spot models, futures prices, the weather and OPEK), futures.ts (positions,
                    settlement, delivery), loans.ts (bank loans, credit score), bankruptcy.ts (the final report),
                    history.ts, pregame.ts (generated history), account.ts, calendar.ts, settings.ts;
                    data/ holds event types, outlets, client lexicons, macro sensitivities and the commodities;
                    worker.ts runs it in a Web Worker via comlink
  audio/            WebAudio sounds (the new-mail chime)
  state/            Zustand stores: windows, shell, trade (watchlists), mail (Outbox view), game (session: boot, save, load);
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
[html-to-image](https://github.com/bubkoo/html-to-image) (MIT). Loan and bond arithmetic by
[financial](https://github.com/lmammino/financial) (MIT). All other game art, portraits included, is original.
