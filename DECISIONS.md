# Decisions

Judgement calls made where the spec leaves details open.

## Phase 1 — Shell

- **Libraries.** Window drag/resize uses `react-rnd` (also used for draggable desktop icons) rather than a
  hand-written pointer handler. Window state lives in a Zustand store (`src/state/windows.ts`) so it can be
  serialised by the save system in Phase 3. `comlink`, `idb-keyval` and `fflate` are not installed yet: nothing
  in Phase 1 uses them.
- **React 18**, as the spec requires, even though React 19 is current.
- **98.css fonts.** 98.css bundles a pixel recreation of MS Sans Serif with an unclear licence (spec §2 forbids
  those). A small Vite plugin strips its `@font-face` rules so the font files are never shipped; the UI uses the
  system stack Tahoma → Geneva → Verdana. The same plugin rewrites 98.css's `@media (not(hover))` to the
  equivalent `(hover: none)`, which Vite's CSS minifier (lightningcss) otherwise rejects.
- **Windows.** Dragging is constrained to the desktop area so windows can't be lost off-screen. New windows cascade
  in 24 px steps over 8 slots; an app reopens at its last position and size (remembered on move, resize and
  close); new windows are clamped into the desktop. Dialogs (Run, Shut Down) open centred, are fixed-size and
  have no minimise/maximise. Only Internet Exploiter allows multiple windows; opening another app focuses its
  existing window. Minimised windows stay mounted (hidden) so app state survives.
- **Taskbar buttons** follow Windows: click a minimised window to restore it, the active window to minimise it,
  any other window to focus it.
- **Tray** is static until the market clock exists (Phase 3): the date reads `Mon 05 Jan 1998 10:42`, the market
  light is green, speed buttons only record a selection and "Skip to next open" is disabled. The unread-mail badge
  and watchlist ticker tape arrive with mail (Phase 6) and watchlists (Phase 3); the tray mail icon opens
  Outbox Express.
- **Start menu.** Submenus open upwards (the menu sits at the bottom of the screen). Settings entries all open
  My Computer until its panels exist; Find opens MajorTrade Pro (the screener, Phase 3); Documents is empty.
  Run… accepts an app id or title prefix (`notepad`, `majortrade`) and opens URLs in Internet Exploiter;
  tickers are added with the market in Phase 3.
- **Shut Down** uses the Win98 "Shut down / Restart" dialog. The spec's "Save and quit?" prompt is added when
  saving exists (Phase 3). The shutdown screen powers back on (reboots) when clicked.
- **Desktop icons** include every non-optional app from §1 and §4A that has its own window. Stapley and Pager are
  tray/assistant widgets, WinRamp and the games are downloads, Garlic Browser needs installing and Encarter 98 is
  part of an optional module, so none of those have desktop icons. "My Portfolio" opens MajorTrade Pro; the deep
  link to its Portfolio tab arrives with the Trade app. Icon positions the player drags are kept in the shell
  store; persisting them to the save file comes with Phase 3.
- **Boot screen** lasts 2 seconds; any click or key skips it.

## Phase 2 — World generation

- **Libraries.** Seeded randomness is `pure-rand` (xoroshiro128+, the spec's xoshiro128\*\*/mulberry32 were examples):
  its whole state is four numbers, so any stream can be saved and resumed. A named substream's starting state is the
  first 128 bits of SHA-256(seed, name) via `@noble/hashes`. Genomes are packed with `@thi.ng/bitstream`, and the
  checksum is CRC-4/INTERLAKEN from `js-crc`'s CRC catalogue. Not used: `seedrandom` (unmaintained, none of the
  generators the spec names); `d3-random` and `@thi.ng/random` distributions, which cache a spare normal draw in a
  closure the save file can't capture (our `normal()` discards it); faker-style name datasets, because genomes index
  the word lists, so the lists must be ours, curated and append-only.
- **Checksum strength.** No 4-bit checksum can catch every single-character typo: a character carries 6 bits, so 64
  values share 16 checksums. CRC-4 does as well as possible: it rejects every single-bit error and 60 of the 63
  substitutions at each position (a test pins this). `decodeCompany` also rejects unknown industries, versions and
  name templates.
- **Gene scales.** Market cap and price are log scales ($1M–$5T, $0.10–$2,000). The rest are linear: volatility
  8–134% a year, beta −0.5 to 2.6, dividend yield 0–9.3%, revenue growth −30% to +96%, net margin −60% to +66%,
  debt/equity 0–3.1, quality 0–1. The generator only picks codes inside the industry's prior ranges.
- **`generate(worldSeed, index)`** is `companyGenes(seed, index, slot, attempt)`: pure, given the company's slot in the
  market plan (tier, industry, target market cap). A clash re-rolls with the next attempt: names, tickers, CEO names and
  coined brands ("Datatronix") are unique; a short list of real company names is reserved; tickers and initials avoid
  a few offensive letter runs.
- **Industries.** All 39 from the spec plus Conglomerate (four top-100 companies need it). Phase 2 asked for at least 12
  with lexicons, but every industry needs a profile anyway (the top 100 alone span 24), so all 40 have names, logo and
  clothing biases and financial priors; the lexicons of the smaller ones can grow later. Top-100 rows listing two
  industries use the better fit: Amazin.com is Internet (E-commerce), Proctor & Gambol and Unileaver are Food &
  Beverage (Household Products), the luxury houses are Apparel (Luxury), Z Corp is Internet.
- **Names.** 14 templates (spec examples included). Name parts are 8-bit genes, so only the first 256 words of a list
  can appear in names; the surname list's first 256 therefore mix every region. Compounds drop a doubled vowel or
  letter ("Electro" + "ics" → "Electrics"). When a template has no industry word, generic suffixes ("Inc.", "Group")
  are drawn less often so the name still says what the company does. Tickers are the initials of the significant words,
  filled out with the first word's consonants ("Ridgepine Timber Co." → RDGT); one in four has 3 letters.
- **Market plan.** Tier counts scale with the company count; market caps run log-linearly through each tier with ±15%
  jitter. Each industry gets at least 60 companies (in smaller markets, half an even share), the rest follow a rough
  real market mix, shuffled across tiers. Share prices are log-normal around a median that falls with size (penny stocks
  cluster under $5), with at least 200,000 shares outstanding. Smaller companies draw higher volatility, lower margins,
  lower quality and pay dividends less often.
- **Top 100.** Identity (logo, CEO, HQ, founding year) comes from a stream keyed by the ticker alone, so it is the same
  in every world; market cap (the spec's rank formula, capped at the $5T gene maximum) and fundamentals vary per world.
  Rhodesia Tobacco Company's founding year (EST. 1923) and logo are fixed from the spec. HQs are near the real
  companies' home cities.
- **Cities** are 128 real cities under present-day country names; the Geopolitics module will rename countries
  (Salisbury is in Rhodesia regardless). The list covers every country in the geopolitics table except Antarctica
  and the greyed-out region.
- **CEOs.** Age adds grey hair and baldness; industries add clothing (tech turtlenecks, logging flannel) and
  accessories (tobacco cigars). Top-100 CEOs are fictional: random names from lists without well-known executives'
  surnames.
- **Ownership.** Competitors are the unchosen presets plus 4–8 generated firms; an explicit competitor count keeps the
  presets first. Holders are always firms. Index funds hold 3–8% of about 92% of large and mid caps (the top 100
  included), each fund at its own typical size; active firms hold 12–40 small- and mid-cap stakes of 1–9.5%; about 2%
  of small and micro caps are 51–80% subsidiaries of an active firm; about 10% of large caps have a 10–30% strategic
  holder. Insider stakes shrink with size (up to 60% for nano caps). Insiders and institutions never exceed 95%; the
  float excludes insiders and holders of 10% or more.
- **Stability of seeds.** Genomes index the data lists, so the lists are append-only. Regenerating a world from its seed
  also depends on the generator code, so the Phase 3 save format should record a generator version or the genomes.
- **Tests and benchmark.** The spot-check "print" of 20 companies per industry is a file snapshot
  (`tests/__snapshots__/world-spotcheck.txt`), so it can be read in the repo and name changes show in diffs. Benchmarks
  use Vitest 5's `bench` test fixture (`npm run bench`); the 1.5 s budget is also asserted in a test.
- **No UI yet.** Nothing in the shell uses the world until the market engine (Phase 3) and the New Game wizard
  (Phase 5).

## Phase 3 — Market engine, trading and saves

- **Libraries.** The worker API is `comlink` and save slots use `idb-keyval`, as the spec suggests. A slot write is one
  `setMany` transaction holding the new file under a fresh key and the updated slot index: the spec's "write to a
  temporary key, then swap atomically". A `.d98` file is an `fflate` zip of JSON documents, with typed arrays stored as
  byte-shuffled binary entries instead of base64 (rename it `.zip` to look inside). Tables use `@tanstack/react-virtual`
  (spec §20: virtualise every long list). Tests use `fast-check` for the P&L invariants and `fake-indexeddb` for the
  slots. Not added: a date library (the calendar needs `Date.UTC` and nine holiday rules), a sparkline library (an SVG
  polyline), FileSaver (a Blob URL download does it), Zustand's `persist` (saves are IndexedDB slots, not localStorage).
- **Charts use TradingView's `lightweight-charts`, not a hand-written renderer.** The spec asks for a custom Canvas 2D
  renderer and no heavy charting library. This one draws to canvas, is 56 KB gzipped and loads only with chart
  windows, and already does everything §13 lists (line, area, bars and candles, a volume pane, crosshair, drag to pan,
  wheel to zoom, a percent scale for comparisons), which would otherwise all be written from scratch. It is styled as
  90s software: grey panel, dotted grid, green and red. Its Apache licence asks for credit and a link to
  tradingview.com; its on-chart logo is off and the credit is in MajorTrade → Help → About, My Computer → About and the
  README.
- **Price model** (spec §11.2): `r = β·M + S + σ·ε + κ·(ln V − ln P) + J`. The market factor comes from five regimes
  (calm, nervous, turbulent, crash, euphoric), a daily Markov chain whose drifts are relative to value. Calm lasts most
  of a year and a crash three or four days; at Normal a crash comes about every three years. The crash/bubble setting
  scales the odds of entering a crash or euphoria (0.5×, 1×, 2×). Euphoria also picks an industry whose prices (not
  values) drift up 80% a year; the gap deflates once euphoria ends. Each industry's factor has 35% of its typical
  volatility (γ = 1). A company's own volatility is what its volatility gene leaves after the market (15%) and sector
  parts, at least 40% of it. ε is unit-variance Student-t with ν = 4. κ halves a mispricing in about six months.
  Event jumps spread over 1–6 bars. Market impact (square-root law, `k = σ_daily`, halved on Easy) is charged in the
  fill price, and half of it stays in the price. A day is 78 bars plus an overnight gap carrying 15 bars' variance.
- **Value** drifts at the cost of equity (a 5.5% policy rate plus β × 4.5%) and jumps on earnings. Day one's prices sit
  within ±40% of value, further off for low-quality companies, so value investors have something to find. The macro
  layer (§11.4) is in no phase's list: it comes with Phase 6's events and news, and until then the policy rate is
  constant and does not move sector multiples.
- **Liquidity.** Average daily volume is `market cap^0.8 / price` shares, with a U-shaped intraday profile, busier on
  big moves and event days. The quoted spread is `0.04% + 25 / √(dollar volume)`, capped at 10%. Easy halves it and
  Hard doubles it under $2B.
- **MAJOR 500** is cap-weighted over the 500 largest companies at the start and starts at 1,000. Membership is fixed
  until IPOs and bankruptcies (Phase 6). The circuit breaker (index 10% below the previous close) halts trading for
  the rest of the day; the spec doesn't say how long. Other indices and index funds come later.
- **Earnings.** A season starts on the first trading day on or after 14 January, April, July and October and lasts 30
  trading days. Each company has a seeded day in it and reports before the open, so the gap carries the first part of
  the move. A surprise is 40% the season's economy-wide surprise, which leans bad when a season starts in a crash. The
  move is ±(2% + 6%·|z|^1.5), scaled by volatility and lower quality, capped at 40%. Value moves by the surprise ×
  (1 + 0.4·(quality − ½)): high-quality stocks keep drifting afterwards, poor ones partly reverse (§11.7). Revenue,
  income, EPS and P/E are backed out of market cap at the start (P/E rising with growth, P/S for loss-makers) and
  updated at each report. Dividends, splits and other events come with Phase 6's event generator; until then no
  dividends are paid.
- **Randomness.** The per-bar noise uses 24-bit uniforms (pure-rand's `uniformFloat32`, half the cost), everything else
  53 bits. Streams: `market:tick`, `market:regime`, `market:value`, `earnings`, `earnings:slots`, and `pregame:*` and
  `session:*` for generated history. What the player watches never changes the market; a test holds this.
- **Time.** Game time is whole minutes since 1970 in market time, so the day is `t / 1440` and a chart timestamp is
  `t × 60`. The game starts at the opening bell of 5 January 1998. Nine fictional holiday rules (Doors Day, Chairmen's
  Day, Tulip Friday…) give 252 sessions in 1998, as the real NYSE had. At 1× a session takes two real minutes and the
  pre-market runs at the same pace. Any closed stretch, night or weekend, takes two seconds. A tick never runs past a
  phase change, so a fast weekend can't skip Monday's pre-market, and after a stall (a save) the clock doesn't race to
  catch up. Quotes show the last session's change until the next open.
- **Trading** (market and limit orders, Day or GTC). It is a cash account until Phase 7: buying power is cash less
  what open buy orders hold back (limit × shares, or the market price with impact). Market orders fill at once at the
  bid or ask plus impact. Orders placed while closed, pre-market or halted wait for the open and fill after the gap.
  Limit orders fill at once as far as the limit leaves room for impact; the rest rests and fills at the limit once the
  market reaches it, at most 20% of each bar's volume ("partial fills based on volume"). A buy that cash can't cover
  fills what it can, and the rest is cancelled with a note. Commission is charged once per order, at its first fill,
  plus Hard's 0.05% of every fill. Modify replaces an order. Cost basis includes commissions, and realised P&L is
  measured against average cost.
- **History** (spec §11.3). All companies get a 260-day ring of daily bars, recorded quantised: ln(close) in 0.1 basis
  point steps, open/high/low as basis-point offsets from the close, and volume on a log scale. That is 12 bytes per
  company-day. Saves delta-encode the rows and byte-shuffle the arrays, so a full year at 10,000 companies is about
  20 MB (spec target < 25 MB); 32-bit floats compressed to over 40 MB. Weekly closes are kept for all time and fill
  5Y and Max between the generated pre-game years and the ring. Pre-game history (1,260 trading days, or since
  founding) is generated on demand: a late-90s bull market (+15% a year at 14% volatility) times β, plus each company's
  own walk trending with its growth, ending at its starting price. Real 5-minute bars are kept for five sessions for
  what the player watches (watchlists, open charts, the order ticket, holdings) and the index, and are never saved.
  Missing ones (before a company was watched, or after a load) are a seeded Brownian bridge from the day's open to its
  close, stretched to its high and low.
- **Charts** offer candles or a line with a volume pane over seven timeframes. They reload each new day and when the
  session opens or closes, and snapshots update the last bar in between. SMA, Bollinger and compare overlays are left
  for later.
- **Saves** (spec §18). A `.d98` holds `manifest.json`, `sim.json` (engine state), `game.json` (windows, desktop icons,
  tray, watchlists, per-window view state) and `bin/`. The world is saved as genomes and ownership tables, not
  regenerated from the seed, since later phases may change the generator (as Phase 2 anticipated); loading decodes
  the genomes (~130 ms). Deflate level 1 packs a year's save 2.8× faster than level 6 for 3% more size, about 1.6 s at
  10,000 companies. The worker's clock stands still meanwhile, which is the spec's "saving pauses the clock". There are
  named slots plus three rotating autosaves written at each week's last close. Ctrl+S saves to the slot in use, or to
  a new one named after the firm and date; after loading an autosave, Ctrl+S starts a new slot. The game boots into
  the most recent save (quick-load). Shut Down offers to save first. A `.d98` dropped on the desktop is imported and
  loaded. Files a crash leaves orphaned are swept up at boot. Migrations are keyed by version (v1 now, with a test of
  the chain), and saves from a newer version are refused. Autosaves before risky actions come with those actions.
- **Save test** (spec §18, extended every phase). It uses the smallest legal market (1,000 companies) so it runs in
  seconds; the code paths are the same at 10,000. It trades on a schedule and saves mid-session at 11:00 with open
  orders, through the real `.d98` format. It then compares every byte of state against a run without the save. Maths
  functions may differ in the last bit between browsers, so a save moved from Chrome to Safari can diverge from there;
  within one browser a game replays exactly.
- **Trade app.** The tabs are Quotes, Order Ticket, Portfolio, Orders and Ledger. The screener (§12.6) is not in
  Phase 3's list, so Start → Find opens the symbol lookup (ticker or part of a name) instead of the screener Phase 1
  planned. Futures, Calendar and Financing tabs arrive with their phases; meanwhile the quote window shows the next
  earnings date. Quote windows are separate windows, one per company, and their timeframe and chart type are window
  params saved with the layout. The portfolio's allocation pie is left for later: Phase 10's Portfolio Defragmenter
  visualises holdings. Every app so far has a File menu (Save, Save As…, Close).
- **My Computer.** Saves, New Game and About are built; Display, Sounds, Game and Firm say which phase installs them.
  New Game (firm name, seed with Randomise, difficulty) stands in until Phase 5's wizard. A new game defaults to
  Medium, a random seed, "Garage Capital" and a starter watchlist of seven top-100 names plus RTC. A new seed is the
  one use of `crypto.getRandomValues`: it picks a world, it doesn't play one.
- **Shell.** The tray clock ticks in game minutes. The light is green when open, amber pre-market and red when closed
  or halted. Fills and saves show as a notice for five seconds. The ticker button shows a scrolling tape of the MAJOR
  500 and the active watchlist above the taskbar. Run… accepts tickers. The Recycle Bin lists closed losing positions
  as `TICKER.POS`, sized in KB by the dollars lost.
- **Measured** in this container (the spec's budgets are for an M1): a bar for 10,000 companies takes 1.5 ms on
  average and 2.4 ms at p99 (budget 4 ms), and a whole session 115 ms. Engine memory after 300 sessions is 59 MB. In
  headless Chromium, frames hold 60 fps (p99 16.8 ms) with two live charts at 20× and while dragging a window.

## Phase 4 — Browser and websites

- **Libraries.** Logo motifs and website clip-art are game-icons.net silhouettes through `react-icons` (MIT package;
  the icons are CC BY 3.0, credited in My Computer → About and the README). One consistent set covers all 32 motifs of
  §7 and reads as 90s clip art; Vite keeps only the 32 used (the browser chunk is 82 KB gzipped, sites included). Not
  added: a router (fake URLs are parsed with the built-in `URL`, and a host → site table picks the page), a search
  library (Yeehaw! reuses the trade app's ticker/name matcher, which is how 1998 search engines felt anyway), marquee
  or hit-counter packages (a few lines of CSS each), a templating library (a `{placeholder}` replace).
- **Logo renderer.** The logo designer is Phase 5, but every site needs logos now, so the renderer came first
  (`art/logo/Logo.tsx`): the ten containers, 32 motifs, 64 palettes, eight wordmark fonts from what a 1998 Mac or PC had
  installed, and the five layouts. It is HTML with an SVG emblem, so wordmarks size themselves; Phase 5 adds the
  WordArt effects and an SVG export. The ten preset firms got logo directions in logo parts (§6) and invented CEOs;
  generated firms draw theirs from a stream named after the firm.
- **Portraits.** CEO and staff photos are a grey "Photo coming soon" silhouette until the portrait renderer (Phase 5).
  The player's site uses a placeholder logo (navy-and-gold bull) and no CEO name until the wizard sets them.
- **Addresses.** Company sites are `www.<slug>.com`, the slug being the name without punctuation, parentheses,
  a trailing legal suffix or ".com" ("Ridgepine Timber Co." → ridgepinetimber.com, "Alphabeta (Goggle)" →
  alphabeta.com). Hosts are claimed in order — news and portal sites, the player's firm, competitor firms, then
  companies — and a clash falls back to adding the ticker. The address bar adds `http://` and `www.`, and text that isn't
  an address searches Yeehaw!, as IE4's autosearch did. Unknown hosts get IE's "The page cannot be displayed". Links
  have no real `href`, so a middle click can never open a real website of the same name. Visited links (purple) use the
  browser history, which with favourites and the dial-up setting is saved with the game; back/forward stacks are
  per window and not saved, and a browser window reopens on its page.
- **Dial-up delay** (§9) is set in the browser's View menu (Phase 5's advanced settings will show it too) and defaults
  to Short (0.25–0.75 s; Authentic is 1.5–4.5 s). The time comes from a hash of the address, not randomness, so a page
  always takes as long. The old page stays up while the new one "downloads", with IE's status text and progress bar.
- **Company sites** are generated from the company every time (no stored HTML): `sites/company/content.ts` turns a
  company into its layout, colours, tile, font, slogan, welcome, history, CEO bio, 3–6 products, guestbook and hit
  counter. Its stream is named after the company, so a top-100 company's site is the same in every world. The eight
  layouts are classic, frames, centered, tabs, sidebar, homepage (tiled, marquee, under construction), corporate and
  brochure; 60% of the top 100 use corporate. The industry picks the tiled background (from a per-industry set tinted
  with the logo palette), body fonts, product kinds (a data file of 6–10 per industry) and clip-art (its logo motifs).
  Guestbooks praise high-quality companies more and complain about poor ones (a test checks the split). The home page's
  news and the IR press releases are the earnings reports; other press releases come with Phase 6's events. Signing a
  guestbook thanks you but stores nothing.
- **Investor Relations** shows the live quote (the browser watches the company it shows, like a quote window), the
  chart in a white "web" skin, the §14 key stats, eight quarters of results, top shareholders (firms link to their sites;
  the player's firm appears when it holds shares; insiders are "Officers and directors"), press releases and the
  genome as Registration No. Short interest reads n/a until short selling exists (Phase 7). To have quarters to show, the
  engine now keeps each company's last eight quarters of revenue and net income; the quarters before the game are
  a quarter of the trailing year, shrinking back at the company's growth rate. Quarters are labelled by the season that
  reports them (January's season reports the previous fourth quarter).
- **Firm sites** show AUM (their holdings at market prices), a strategy blurb, performance against the MAJOR 500 since
  the start (weekly, from the weekly closes archive), top 25 holdings, subsidiaries (over 50% owned) and leadership.
  Holdings don't change until competitors trade (Phase 8), so the 13F-style 45-day delay arrives with Phase 8's
  disclosure rules; until then the filing is simply today's book. The player's own site shows AUM and returns; holdings
  are "confidential".
- **News.** Phase 4 builds the three outlets named in §14's site list (Majorsoft Newswire, The Wall Street Jottings,
  Barren's Weekly); the rest of §14.1, journalists and a searchable archive belong to Phase 6's news. Stories are written
  from the market itself: the session wrap, the biggest gainer and loser worth $1B or more (blamed on earnings when they
  reported that day), the earnings roundup and the leading sector; Barren's has the week's winners and losers and a
  screen of cheap dividend-paying large caps. They describe the latest session, so an old story's link says it has
  moved to the archives. Template choices use a seeded stream per day.
- **QuoteZone** has the market summary with the MAJOR 500's intraday chart, top gainers and losers (companies worth
  $50M or more, to keep penny-stock noise out) and most active by dollar volume, a sector map (tiles sized by the square
  root of market value, coloured by cap-weighted change), a screener lite (industry, minimum market cap, maximum P/E,
  minimum yield, sortable, 25 a page) and quote pages. It reads a column table of all companies from the worker
  (2.7 ms, refreshed every 15 game minutes) rather than asking the worker for each list.
- **Yeehaw!** has search (industries, firms, then companies by ticker and name, 20 a page), the directory (every
  industry, companies A–Z), the market summary with a quote box and headlines. The weather teaser waits for the National
  Weather Bureau's forecasts (Phase 7), which must be the real signal, not a placeholder.
- **Web rings** (§14.2) cost one line, so company sites have them now: previous and next company in the same industry.
- **Other sites** listed in §14 and §14.2 (the regulator, exchange, weather, OPEK, Federal Reservoir, Raging Bear,
  HomeCities and the rest) arrive with the phases that give them something to say.
- **Saves.** Save format version 2. The v1 → v2 migration backfills each company's quarters from its trailing figures
  (the same function a new game uses, so a v1 save made before any report loads identical to a new one) and gives the
  UI's half the default favourites. The save test also checks that quarters carry over.
- **Run…** opens addresses in a new browser window; the quote window's Open Website goes to the company's site.
- **Acceptance.** A test builds the full 10,000-company market: every company's site content is generated and checked
  for its industry's products, clip-art and theme and for unfilled placeholders; every company's home page renders; all
  five pages of every tenth company render with live details, and the IR page is checked for the stats, genome,
  quarters and each holder. In this container a page renders in 0.8 ms (median; p99 2.5 ms) and a company's details
  take 0.8 ms in the worker, so a site appears within one frame of its data.

## Phase 5 — Character, logo, New Game wizard

- **Libraries.** The ID badge's barcode is a real Code 128 barcode of the CEO code: `jsbarcode`'s encoder alone (its
  DOM renderer isn't used), drawn as SVG bars. The logo designer's Export SVG… uses `html-to-image` on the live preview,
  so the file is exactly what the designer shows, with no second layout of the five logo layouts; the SVG wraps HTML in a
  `foreignObject`, which browsers display but vector editors may not. The badge flip test runs in `happy-dom`. Not
  used: an avatar library (DiceBear's styles have different option sets, none has the spec's hair, beards, tobacco and
  RTC logo, and portraits must decode from the genome's CEO block), a colour library (mixing hex colours is six
  lines), an undo middleware (the designer keeps a list of previous CEOs), a wizard or tabs library (98.css has tabs).
- **Codes.** Genomes, CEO codes and logo codes share one packer (`world/bitcode.ts`): fields most significant bit first,
  optional fields as a presence bit, a CRC-4, zero padding to a whole base64url character. Genomes come out bit for bit
  as before (the spot-check snapshot is unchanged). A **CEO code** is the genome's CEO block (68 bits) followed by a
  format nibble, face shape, skin undertone, photo background and four optional 24-bit custom colours (skin, hair,
  clothing, background): 15 characters, up to 31 with every custom colour. A **logo code** is the genome's logo block
  (shape, motif, palette, font, layout) plus the WordArt effect and optional custom main, accent and background colours:
  six characters, up to 18. Decoders reject bad checksums, lengths and options that don't exist; tests check that at
  least 90% of single-character edits are caught (a 4-bit CRC can't catch them all, as Phase 2 found for genomes).
- **Company CEOs** have no face-shape, undertone or background genes, so those follow from the CEO's name genes: fixed
  per company, no genome change, and old saves get portraits too. The CEO's name, age and look in a CEO code are the
  genome's, so a pasted code brings a name along; the player's own name is stored beside it as typed.
- **Portraits** are original layered SVG on a 120 × 150 bust (`art/portrait/parts.ts` holds the shapes as data,
  `Portrait.tsx` draws them): all 16 skin tones with four undertones, 5 face shapes, 24 hair styles in up to three layers
  (behind the head, over the shoulders, over the forehead), 12 hair colours, 6 eyebrows, 6 eyes, 10 noses, 10 mouths, 18
  facial hair styles clipped to the jaw, 16 accessories, 14 outfits (plaid and Hawaiian prints are SVG patterns) in 16
  colours, and 8 studio backgrounds. People over 50 get a few lines. The cigar band, the cigarette by its filter and
  the pack all carry the Rhodesia Tobacco Company's real logo, drawn by the logo renderer. Eyebrows follow the hair
  colour, except that dyed hair keeps natural brows.
- **Randomise** reuses the world generator's CEO draw (moved to `world/ceo.ts` with the draws in the same order, so
  worlds are unchanged): grey hair and thinning come with age, dyed hair and monocles are rare, suits common. Randomise
  one feature re-rolls a random feature to a different value drawn the same way, and drops that feature's custom colour.
  Randomise keeps the name (Random name draws one). The designers' streams start from a fresh seed each time they open,
  like a new world seed (§20's rule is about the game, and a new face picks a look, it doesn't play one). Undo goes back
  up to 50 steps. The designer also sets the CEO's age (32–63, the gene's range).
- **Logos.** The WordArt effects apply to the wordmark as CSS (text shadows, a gradient clipped to the text, a stroke)
  and to the emblem as SVG (drop-shadow filters, a gradient fill, an outline). Custom colours replace the palette's; a
  third colour draws a panel behind the logo. The three previews are the website header, the taskbar icon (the emblem,
  or the monogram for text-only layouts) and the badge header. The logo CSS moved from the browser's stylesheet to
  `art/logo/logo.css`, since logos now appear outside the browser.
- **ID badge.** A laminated card (a CSS 3D flip, with the back's magnetic stripe, a signature in script and the CEO
  code) with a drifting hologram band, which stands still under `prefers-reduced-motion`. The employee number comes from the world
  seed. It shows at the end of Setup, in My Computer → Firm and on the player's website (Leadership).
- **Preset firms.** Picking one leaves it out of the competitors (the generator already took `playerFirm`). Silverman
  Sacks, Organ Stanley and J.P. Borgan have listed parents (SLVS, ORGS, JPB), so the player runs "Silverman Sacks Asset
  Management" and the parent stays tradable. A custom name equal to a preset's is refused, since it would clash with a
  competitor. Competitor CEOs and officers get portraits from a stream of their own, so nothing else about a firm
  changed.
- **Settings.** `GameSettings` now holds every §9 setting, with the table's values per difficulty. Used now: capital,
  commission, spreads, volatility, crash frequency, market impact, company count, seed, competitor count, start year and
  the dial-up delay. The rest (event frequency, leverage, margin grace, shorting, futures, clients, patience, tips,
  scrutiny and audits, aggressiveness, loan rates, dark web, heat decay, ironman, no-bankruptcy, fun modules) are
  chosen and saved now for the phases that build those systems; Ironman needs the save rules of Phase 11's settings
  panels. The label is computed: the preset whose values all match, else Custom, so changing a value back restores
  the label. The world seed, start year, dial-up delay and fun modules don't count (they don't change how hard the game
  is; §16C says so for the modules); company and competitor counts do. Picking a difficulty card resets to that
  preset but keeps the start year and modules.
- **Start year** is cosmetic, as §9 says: dates, quarter labels, founding years, copyright lines and chart axes are
  shown shifted by whole years (`setStartYear`, set in the UI and in the worker), while the calendar underneath stays
  1998's, so weekdays and holidays are 1998's in any year.
- **Setup Wizard.** It fills the screen like Win98 Setup: at first power-on (no saves) it runs before the desktop, and
  My Computer → New Game relaunches it over the running game, whose clock stops meanwhile. Cancel goes back to the
  game, or, on a machine with no game yet, installs the standard game (Garage Capital, Medium). Step 5 runs the real
  generation in the worker; the bar takes at least 2.6 s, holding at 95% until the market exists. Only step 5 replaces
  the running game. The welcome email waits for Outbox Express (Phase 6).
- **Saves.** Version 3. The player (`firmName`, `presetFirm`, `logoCode`, `ceoName`, `ceoCode`) is part of the
  simulation's state, where the firm name already was; My Computer → Firm renames the firm and edits its logo and CEO
  through the worker. The v2 → v3 migration gives old games the default logo (a navy-and-gold bull), a CEO drawn from
  the seed and the missing settings from their difficulty's preset (Medium's for Custom). The save test now runs a
  Custom game with its own logo and CEO, renamed and redesigned before and after the save.
- **My Computer → Firm** shows the badge, logo and codes, with Rename…, Edit logo… and Edit CEO… The fee structure
  arrives with clients (Phase 6).
- **Measured.** The world-generation budget test (1.5 s) failed once at 1.52 s before this phase, when it shared the
  container with the other test files; it has passed in every full run since.
