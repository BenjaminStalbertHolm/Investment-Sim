# Majorsoft Doors 98 — Investment Firm Simulator

Run an investment firm from inside a fake 1998 desktop operating system. Fully offline; runs in the browser.

**Status:** all eleven build phases are done (see [DECISIONS.md](DECISIONS.md) for how each went). Phase 11 was
polish: a screensaver, colour schemes, a CRT effect, sounds, the settings panels, a help file, and a long-run test that
plays ten years in bounded memory.

A seed generates a market of 10,000
companies, and a Web Worker runs it in real time: trading hours and holidays, market regimes, sector moves, earnings
seasons and the MAJOR 500. MajorTrade Pro 98 has watchlists, quote windows with charts, a margin account (buy, sell,
sell short and buy to cover; market, limit, stop, stop-limit and trailing-stop orders), a portfolio, a cash ledger,
a calendar, futures on 22 commodities and indices, index funds (the MAJOR 500 and one per industry) and bank loans.
Leverage is off unless you switch it on in the advanced settings (up to 15:1). Internet Exploiter browses the in-game web: the
Yeehaw! portal and search, every company's own website (home, about, products, investor relations with live stats,
short interest and holders, guestbook), competitor firms' sites and your own, QuoteZone (movers, sector map, screener),
the news, the Chicago Murkantile Exchange, the National Weather Bureau (its warnings are a real signal for farm and
energy futures), OPEK, the Federal Reservoir, First Continental Bank, Equifacts, the Securities Oversight Bureau, and
Ask Reeves, the in-game help. A Setup Wizard founds your firm:
pick one of ten famous firms or design your own logo, draw your CEO's portrait (every company CEO has one too), choose a
difficulty or tune the advanced settings, and get a laminated ID badge. The market has corporate events — scandals,
frauds, takeovers, drug trials, recalls, CEO changes, dividends, bankruptcies — and an economy with a Federal Reservoir;
news breaks on the Majorsoft Newswire and cascades through TV, the trade press, the morning papers and the weekend
magazines, often after rumours on the Raging Bear boards. Outbox Express brings clients with mandate offers, quarterly
statements, top-ups and redemptions, broker letters (margin calls, share recalls, deliveries), a morning briefing, news
alerts, tips and junk mail. Competitor firms run their own funds by their strategies, trade every week, file their
holdings with the SOB and are ranked against you in Barren's annual league table. Stakes of 5%, 20% and 50% bring SOB
filings, board seats and control; shareholder meetings ask for your vote; rivals bid for your stakes or offer to invest
in your firm. Trading ahead of news raises heat, and heat brings audits, fines and suspensions. My Computer → About
keeps your record (time-weighted returns, Sharpe ratio, drawdowns, league places) and achievements. Borrow too much and
a margin call, a defaulted loan or an unpaid fine ends the firm: the Blue Screen of
Debt, a final report, and a place in the Hall of Shame. For the unscrupulous, an anonymous letter points to the
Garlic Browser on Tucats Downloads: installed, it reaches the dark web's eleven markets — bribed journalists, leaked
earnings, bot farms, espionage, hackers, offshore shells, pump-and-dumps, planted rumours, forged statements, loan
sharks and fakes — and The Cellar forum. Every listing states its price, its odds, what failure costs and the heat it
adds; some vendors are exit scams and some are the SOB. The desktop has the rest of the office: ISeekYou for chatting
with your broker, informants and your mother; MajorWord for the quarterly letter to clients; Exceed for spreadsheets;
PeopleSoftie HR for hiring analysts, traders and compliance officers; Stapley, the sarcastic stapler; WinRamp, the
Pager, the Rolodex, the Portfolio Defragmenter, Task Mangler, MajorPaint and two games. Beyond the browser's
finance sites are a job board, offices to rent, a lifestyle catalogue, collectibles, IPOs and conferences. Three optional
fun modules add a world atlas with countries and their quarrels (Encarter 98), the events of 1998, and running gags.
Games save anywhere to named slots and rotating autosaves, and export as `.d98` files.

My Computer has the settings: the wallpaper, colour scheme, CRT effect and screensaver (3D Pipelines, or your logo
flying at you); the master volume and which sounds play; how often the game autosaves, whether urgent pages stop the
clock, and the speed a new game starts at. **Ironman** games have one save slot and no reloading. F1 opens Doors Help,
the manual.

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

The game boots into your most recent save; the first time, the Setup Wizard founds your firm. New to investing? **F1**
(or Start → Help) opens Doors Help, the manual: guides to stocks, orders, margin, short selling, futures, loans and
clients, with a contents, an index and a search. The **Ask Reeves** icon on the desktop is the same guides on the web, with
a butler who answers questions. Open **MajorTrade Pro 98**
to watch quotes and trade, and **Internet Exploiter** to read the news and visit companies (type a company or ticker
in the address bar to search Yeehaw!); the tray sets the game speed (a trading day takes two minutes at 1×).
**Outbox Express** (the tray's envelope shows unread mail) is where clients offer mandates — each with rules that apply
to your whole portfolio — and where tips, briefings and broker letters arrive. **My Computer → Firm** lists your clients
and their mandates and sets your fees. MajorTrade's **Funds** tab buys the whole market (MJR) or a whole industry in one
go. The account is a margin account (a cash account unless leverage is on): the **Futures** tab trades contracts
(hold a commodity past its last trading day and it is delivered to your office lobby), **Financing** takes out bank
loans and repays them (in part or in full, at any time), and the Portfolio shows equity against the margin
requirements; a margin call gives a few days to put it right. The **Garlic Browser** (once installed from the
anonymous letter's link) opens `.garlic` addresses; start at The Clove, its directory, and read every listing's terms.
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
| `npm run soak` | The long run: 10,000 companies for ten simulated years with every module on (about ten minutes); checks memory, time per year and a save at the end |
| `npm run frames` | Frame check in Chromium against `npm run dev`: paused, 1×, 20× and dragging a window at 20× (needs Playwright: `npm i -D playwright`) |
| `npm run typecheck` | TypeScript strict check |
| `npm run build` | Typecheck + production build into `dist/` |

### Layout

```
src/
  main.tsx          entry point
  shell/            Desktop, Window, Taskbar (+ tray), StartMenu, BootScreen, ShutdownScreen, BlueScreen, Screensaver
                    (saver/pipes.ts is 3D Pipelines' pure part), shortcuts.ts, schemes.css (colour schemes, CRT)
  apps/             catalog.ts (app metadata as data), registry.ts (lazy components), one folder per app:
                    trade/ (MajorTrade Pro), quote/ (quote windows), browser/ (Internet Exploiter; garlic/ is its dark
                    skin, the Garlic Browser), installer/ (setup programs for Tucats downloads), mail/ (Outbox
                    Express: letters.ts writes the letters, data.ts their templates), mycomputer/ (saves, Setup Wizard,
                    logo and portrait designers, advanced settings, firm panel with clients and fees),
                    help/ (Doors Help, made from Ask Reeves's guides), recyclebin/, run/, shutdown/
  sites/            the in-game web: urls.ts (domains), Site.tsx (URL → site), web.tsx (links, marquee, hit counter),
                    text.ts (template writer), portal/ (Yeehaw!), company/ (company sites: content.ts generates them),
                    firm/, news/ (every outlet; articles.ts writes articles from the news archive), forum/ (Raging
                    Bear), quotezone/, finance/ (the exchange, Weather Bureau, OPEK, Federal Reservoir, bank,
                    Equifacts and the SOB), help/ (Ask Reeves: topics.tsx holds the guides), tucats/ (downloads),
                    darkweb/ (the .garlic sites: The Clove, the markets, The Cellar; terms.ts states a listing's
                    terms in words; defaced and DDoSed pages); data/ holds the text templates,
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
                    funds.ts (index funds), competitors.ts (competitor AI, filings, league tables), governance.ts
                    (stakes, votes, bids, investors), regulator.ts (heat, audits), scoring.ts (returns, achievements),
                    darkweb.ts (vendors, listings' terms, purchases and what came of them, shells, blackmail),
                    history.ts, pregame.ts (generated history), account.ts, calendar.ts, settings.ts;
                    data/ holds event types, outlets, client lexicons, macro sensitivities, the commodities, the funds,
                    the competitors' strategies and the dark web's markets;
                    worker.ts runs it in a Web Worker via comlink
  audio/            WebAudio sounds: mixer.ts (master volume), the chimes, clicks, start-up and the modem
  state/            Zustand stores: windows, shell, trade (watchlists), mail (Outbox view), game (session: boot, save, load),
                    prefs (the machine's settings, kept in localStorage); saveFile.ts (.d98 format), saves.ts (IndexedDB
                    slots), migrations.ts, autosave.ts
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
[financial](https://github.com/lmammino/financial) (MIT). WinRamp's synthesiser is [Tone.js](https://tonejs.github.io/) (MIT).
Encarter 98 draws [Natural Earth](https://www.naturalearthdata.com/) country shapes (public domain, via
[world-atlas](https://github.com/topojson/world-atlas), ISC) with [d3-geo](https://github.com/d3/d3-geo) and
[topojson-client](https://github.com/topojson/topojson-client) (ISC). Exceed's formulas are
[hot-formula-parser](https://github.com/handsontable/formula-parser) (MIT). The app is built on React, Zustand, react-rnd,
TanStack Virtual, fflate, pure-rand, @noble/hashes and js-crc (MIT), and Comlink, idb-keyval and @thi.ng/bitstream
(Apache-2.0). All other game art, portraits included, is original; every sound is synthesised as it plays.
