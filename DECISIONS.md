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

## Phase 6 — Mail, clients, events, news

- **Libraries.** None added. Letters and articles use the existing `{placeholder}` fill plus a 15-line `[a|b]` choice
  expander (`sites/text.ts`) rather than Tracery (`tracery-grammar` sets its random source globally, is unmaintained and
  untyped). Archive search is structured — ticker or company, firm, writer, date — with a headline match as the fallback,
  so no full-text index (MiniSearch would need every headline written out to build one). The new-mail chime is twenty
  lines of WebAudio, as §2 asks. Outbox Express reuses the virtualised table, which gained sortable headers and row
  classes. Everything random still goes through the seeded streams; four new ones (`events`, `macro`, `clients`, `mail`)
  keep a new kind of letter from changing the market.
- **Facts are stored, words are written on reading.** The news archive holds facts (`sim/news.ts`: kind, company, move,
  amounts, levels, rumour time); each outlet's article is worked out from them when read — which outlets cover it and
  when (coverage rules in `sim/data/outlets.ts`), the byline, and the words from a stream named after the article. Mail
  works the same way (`sim/mail.ts` facts, `apps/mail/letters.ts` words). A year at 10,000 companies archives about 11,000
  items (1.25 MB of JSON before compression); a year's save is 21.7 MB (Phase 3: about 20; the target is 25).
- **Events (spec §11.6–11.7)** are decided ten trading days ahead into a timed queue saved with the game, so rumours can
  leak and tips can be genuine. Each company has a daily chance from the event types' rates (per company-year) times
  industry, quality and size weights (`sim/data/events.ts`): about 0.65 events per company a year, 25 a day at 10,000
  companies, scaled by the event-frequency setting. A third break before the bell (07:30–08:45), the rest at a bar. The
  size of a move is drawn from the §11.7 range, skewed to its low end, and scaled by size, clamp((cap / $10B)^−0.08, 0.6,
  1.5), so small companies move more; falls stop at −97%. The price jumps over 1–6 bars (the earnings mechanism); value
  moves by a per-type share of it (fraud and trial results for good, a hacked web site hardly at all), a little more for
  better-run companies, so prices drift on or drift back (§11.7's "drift or reversal") by the Phase 3 mean reversion.
  Built: every row of the §11.7 table except bought puff and hit pieces (the dark web, Phase 9), plus product launches and
  flops, CEO changes (a new CEO code per company, so websites show the new face), dividend changes, buybacks, completed or
  collapsed takeovers, and bankruptcies. A strategic investment doesn't issue shares (share counts stay fixed); an
  activist's stake joins the company's holders table. Hindsight Research, Standard & Pours and Moody Blues are named in
  the stories; their own sites are Phase 10's.
- **Not built: IPOs and stock splits.** Both change the company count or share counts that the typed arrays, the history
  ring's layout, the index divisor and the save format take as fixed. They move to Phase 10 with the IPO Hotline.
  Companies that leave the market instead keep their ids with a listing status (`LISTING`): a delisted company's price
  freezes, its orders are cancelled and new ones refused, competitors' stakes in it go, lists and screeners skip it, and
  the MAJOR 500 takes the largest company outside it, the divisor keeping the level (Phase 3's fixed membership ends
  here). The market shrinks by about 1% a year until IPOs arrive.
- **Takeovers** offer a 20–60% premium; the target jumps to 70–95% of it and its value goes to the offer, and the acquirer
  (a larger company, same industry more often than not, or a competitor firm) slips 1–5%. After 20–60 trading days the
  deal completes three times in four — the target is delisted at the offer and holders are paid in cash — or collapses
  and the price falls back to about where it was. **Bankruptcies** hit micro and nano caps with poor quality; the filing
  day's close delists the company and shareholders are written off at $0 (the Recycle Bin shows the loss).
- **Rumours** (§11.7): each event type has a leak probability; the rumour comes hours or up to three trading days before
  and moves the price 15–35% of the way in advance (value doesn't move), so the announcement carries the rest. 60% appear
  on the Raging Bear boards, 40% on the trade press's grapevine. News-driven moves scale with credibility: a board rumour
  moves a price about 40% as much as the same rumour in the trade press (credibilities 0.25 and 0.6). The event's articles
  then mention the rumours. **Follow-ups**: some stories get a second move at 07:30 the next morning, after the dailies
  dig in — the same way (worse, or better) more often for poor companies with bad news and good ones with good news,
  otherwise a partial reversal ("overdone"). The morning articles say which.
- **The publication cascade** (§11.7): the Newswire at once, MoneyTV five minutes (a bar) later, the trade press within the
  hour, the dailies at 06:00 the next morning, Barren's on the Saturday after. Who covers what is data: the Newswire
  everything; MoneyTV companies over $2B, big moves and the economy; the Journal fraud, scandal and big deals; the
  Jottings companies over $10B, big moves and the economy; the Financial Timez the economy, foreign and commodity
  companies; the Daily Scoop gossip; Wyred tech; the Motley Fowl small caps' good news; each trade paper its industry's
  companies over $50M. Tiny companies make only the wire. Market caps in the rules are the starting ones (a paper's
  sense of who matters doesn't track every tick). The Phase 4 market stories (the session wrap, movers, sectors, the
  week) stay, alongside.
- **Outlets** (§14.1): all nine national outlets and forty trade papers (one per industry, e.g. timbertimes.com,
  oilgasgazette.com, pharmaweekly.com) share one site framework — front page, story, archive search, writers' pages —
  with a look each: the wire's flashes, the Jottings' broadsheet with stippled ink portraits, the Journal's grey, the
  Timez's salmon, a TV player with a talking head and scrolling lower third, a red tabloid in capitals, a jester
  newsletter, a neon magazine. **Journalists** are generated per game with the portrait system and saved (bylines and
  Phase 9's bribes refer to them): a generalist and beat writers per outlet, the beats being newsroom groups of industries
  ("Health & Energy"; three or more read "General Assignment"), with bias and integrity drawn from the outlet's range
  (the Daily Scoop's are low, the Journal's high). Bias isn't used in the words yet.
- **MoneyTV's Stock of the Day** (yesterday's hottest large cap, on air at noon) and **the Motley Fowl's pick** (a sound
  small cap, in the morning newsletter) lift their stocks a little for a while (0.5–3% and 1–5%, none of it lasting).
- **Raging Bear** (§14): one board per ticker. Real rumours are dressed as ordinary posts among 0–2 chatter posts a day
  (hype, doom, questions, nonsense) from a stream named after the ticker and day, so the boards read the same every time
  and the signal is findable but not labelled. The front page lists the latest rumoured tickers and the day's movers.
- **The economy (§11.4).** The Federal Reservoir meets on the third Tuesday of eight months and moves towards a Taylor
  rule (3% neutral rate, leaning against inflation and growth, lower in a crash) in 25 or 50 basis-point steps, usually as
  expected; the jobs report comes on the first Friday, CPI mid-month, GDP after each quarter, consumer confidence on the
  last Tuesday — each a simple autoregressive series with shocks, nudged by the market regime. The rate now drives value
  growth (Phase 3's constant cost of equity), a rate change re-rates each industry's value by a duration
  (`sim/data/macro.ts`: internet 10, banks −3), and surprises move prices at once, scaled by beta and cyclicality. 1998
  starts at 5.5%, 1.6% inflation, 3.8% growth, 4.7% unemployment. The Federal Reservoir's own site (rate decisions,
  minutes) joins the Weather Bureau and OPEK in Phase 7; its decisions and the minutes' tone are in the news meanwhile.
- **Dividends** are paid a quarter at a time on the company's report day (ex-date and pay date the same, for
  simplicity): price and value drop by the dividend before the open and holders are paid (ledger and a broker letter).
  Dividends count in the position's realised P&L, so the accounting invariant still holds and the Recycle Bin nets them.
  The dividend per share is now state (dividend changes), so yields move with prices.
- **Clients (§15.1)** own units of the firm's single book, like a fund: the seed money is the founding clients' (the CEO's
  family and a friends-and-family fund), a mandate buys units at the day's price, a redemption sells them. Fees move units
  from clients to the firm, so the firm's own capital is the units no client owns and grows with fees: 1% a year charged
  daily, and 20% of any quarter's return above the MAJOR 500 (no high-water mark). Both are set in My Computer → Firm
  (0–5% and 0–50%); cheaper firms get more and bigger offers, dearer ones fewer. Constraints apply to the whole book
  while the client is aboard: excluded industries (tobacco, weapons makers, fossil fuels…), no holding above x%, nothing under $300M or $2B, a maximum drawdown, or
  beating the MAJOR 500 over two to four quarters. A breach gets a warning and five trading days to fix it; a second
  breach, or one left unfixed, ends the mandate. A drawdown can't be sold away, so it ends the mandate only if it deepens
  to 1.5× the limit or happens again. The order ticket warns before an order would break a mandate but doesn't block it.
  A benchmark mandate is judged at its horizon: beaten, the client adds 20–40% and the reputation rises; missed, it leaves.
  Each quarter the firm sends statements (in Sent Items) and clients reply: praise, questions, top-ups after good
  quarters, and redemptions after 4, 3 or 2 lagging quarters (the patience setting; founders one more). Redemptions give
  five trading days' notice; if cash is short on the day the broker sells the largest positions at the open. With clients
  switched off the game is a sandbox: no clients, the firm owns every unit.
- **Offers** arrive first on the fourth trading day, then about every two to three weeks, more often for a well-regarded
  firm: the amount is log-normal around 30% of AUM, scaled by reputation and fees, at least $25,000 and at most 5× AUM,
  with one to three constraints typical of the kind of client (pensions ask for drawdown limits and benchmarks, churches
  and endowments exclude industries, insurers want big companies). They lapse after five trading days. **Reputation**
  (0–100) starts at 25 and so far moves with each quarter against the index, mandates lost or completed, and tips
  reported; Phase 8 adds drawdowns, the regulator's record and league rank.
- **Mail (§15).** Folders follow the kind of letter; Deleted Items holds deleted ones (Restore brings them back). The
  "composer (limited)" is the replies the action buttons send (accepting or declining a mandate, reporting a tip), which
  land in Sent Items. Junk mail is filed in Junk while Tools → Junk Mail Filter is on (Phase 10's assistant will do this
  for you); off, it lands in the Inbox. News alerts for holdings can be switched off (Tools). Search matches sender and
  subject. The chime plays at most every three seconds. The broker's daily digest is written from the ledger, so a save
  in mid-session loses no fills. Every trading day's 07:00 post brings the Jottings' briefing: the five most important
  stories since the day before, the day's releases, and earnings due from holdings and the five largest reporters.
- **Tips (§15.4)** come every 6–18 trading days from the eighth. As often as the difficulty's tip reliability says, a tip is
  genuine — an event planned for a day or more ahead; the rest are half bait (a sub-$300M company pumped the next day, with
  board hype, then dumped 20–35% one to three days later) and half nonsense. Reporting one to the Securities Oversight
  Bureau adds a reputation point. Trades in a genuinely tipped company while its event is still pending are recorded, out
  of the player's sight, for Phase 8's heat and investigations.
- **The player's firm in the news:** each quarter's result, and new mandates (the Newswire; the fund trade paper covers
  mandates, Barren's the quarters). League tables are Phase 8's.
- **The clock** now also stops at 07:00 on trading days (the morning's work: releases, the events ahead, picks, mail,
  offers) and at each queued task; at the same minute the market (open, bar, close) goes first.
- **Elsewhere.** Company sites have In the News, press releases from the company's own announcements, a new CEO's portrait
  and a banner once delisted; quote windows list the latest news; Yeehaw! links every outlet. MajorTrade Pro gains the
  Calendar tab (§12.8: earnings for holdings and watchlists, releases, Federal Reservoir meetings), built now because the
  briefing needs the same calendar. The tray's mail icon shows the unread count.
- **Saves.** Version 4. The v3 → v4 migration starts Phase 6 where an old game stands: its NAV belongs to the founding
  clients, the economy starts at 1998's, journalists are hired from the seed, the index keeps its members, dividends come
  from the genomes, and the event generator plans from the next morning. The save test now also takes mandates, reports a
  tip and reads and flags mail on both sides of the save.
- **Measured** in this container: a bar for 10,000 companies 1.16 ms on average, 1.72 ms at p99 (budget 4 ms), a session
  93 ms; a simulated year at 10,000 companies 22.6 s headless. A browser check caught template lists split on the `|`
  inside `[a|b]` choices (leads came out as fragments); the splitter now respects brackets and a test checks every
  template.

## Phase 7 — Shorting, margin, futures, commodities, loans, bankruptcy

- **Libraries.** One added: `financial` (a zero-dependency port of numpy-financial, MIT) for the loan payment (`pmt`) and
  the 10-Year Note's price from its yield (`pv`); Phase 10's Calculator can use it too. Nothing else was worth a
  dependency: the Ornstein–Uhlenbeck step is one line, a futures price under it is closed form, and Reg-T margin, borrow
  fees and the credit score are a few formulas each (`sim/margin.ts`, `sim/shorts.ts`, `sim/loans.ts`). The commodities
  and their contracts, industry exposures, weather hazards and OPEK's moves are data (`sim/data/commodities.ts`). Two new
  seeded streams, `commodities` and `broker` (recalls), keep the new randomness from changing the stock market's.
- **A margin account (§12.4, §9).** Opening stock positions needs equity of 1 / max leverage of their value (50% at 2:1
  on Easy and Medium, two thirds at Hard's 1.5:1); keeping them needs 25% of longs and 30% of shorts; futures need the
  exchange's initial margin to open and 75% of it to keep. Buying power is (equity − initial requirement) × leverage, less
  what open orders reserve. Orders reserve at their worst price (a buy limit at its limit, a stop at its stop, a short at
  the higher of the market and its limit) with impact and commission, by the same per-share formula the fill checks, so
  an order the ticket accepts fills in full. Cash can go negative: the debit balance pays the policy rate + 2% (times the
  difficulty's loan-rate multiplier) a year, charged each close for the calendar days to the next session. Short sale
  proceeds stay in the account, so equity is cash + longs − shorts + open futures P&L. Accounting still balances: net
  worth − deposits = realised + unrealised, with interest and fines as account-level charges, futures P&L realised and
  goods in the lobby unrealised.
- **Margin calls** are checked at each close: equity below maintenance brings a call for the difference by letter, due at
  the open after the difficulty's grace (Easy 3 trading days, Medium 2, Hard 1); negative equity is due at the next open
  whatever the grace. Equity back above maintenance by then — prices, sales, a loan — meets it (a letter says so). An
  unmet call is liquidated at that open: open orders are cancelled, then positions are closed worst unrealised P&L first,
  each only as far as needed (with a 20% cushion), goods last; a letter lists the sales. Negative equity with nothing left
  to sell is bankruptcy.
- **Short selling (§12.4).** Each company has a short interest (share of float), saved in the market state; its usual
  level comes from the genome (higher for poorly run, volatile companies) and isn't saved. Lenders offer 35% of the float;
  the borrow fee is 0.3% a year until half of that is lent, then rises to 60% as the pool empties (hard to borrow above
  1%); companies worth $10B or more are always available at 0.3%. The ticket shows what can be located and the fee. Fees
  accrue each close for the calendar days, against the position. Lenders recall only smaller companies' shares: 0.1% a day,
  far likelier once more than 60% of the pool is lent; the letter gives two trading days, then the broker buys in at the
  open. **Squeezes:** good news on a stock more than 10% shorted moves its price 1 + 3 × (short interest − 10%) times as
  far (its value doesn't follow, so it drifts back) and 30% of the shorts cover; bad news brings more in (short
  interest × (1 + 2 × the fall)). Short interest drifts back to its usual level at 5% a day. A short pays dividends to the
  lender and is closed at the offer in a takeover and at $0 in a bankruptcy. The IR pages and quote windows show it.
- **Stop orders (§12.2).** Stop, stop-limit and trailing stop (the stop trails the best price since the order was placed
  by a percentage). They trigger when a bar's price crosses the stop, then work as market or limit orders; a gap through
  the stop fills at the gap's price. All four sides are on the ticket.
- **Commodities (§12.3).** Twenty physical commodities plus the MAJOR 500 and the 10-Year Note. Each spot is a log price
  reverting (half-lives 0.7–4 years) to a long-run level that drifts with inflation and wanders 6% a year, plus a known
  seasonal swing (natural gas and heating oil peak in winter, gasoline in the driving season, corn before harvest),
  noise shared within oil, precious metals, grains and livestock, a loading on the stock market (copper 0.6), a rally in
  crash regimes for gold (and less for silver and platinum), and supply shocks spread over a few bars. Prices start at
  January 1998's (crude $17.50, gold $290). A contract's price is the spot expected at its expiry under the commodity's own
  model — the shock decays, the long-run level drifts with inflation, the season is known — which is the spec's spot ×
  e^((r + storage − convenience yield)·T) with the convenience yield implied by the model, so contango and backwardation
  come by themselves. The index future is the MAJOR 500 × e^((r − 1.6%)·T); the note future prices a 6% coupon note from
  a 10-year yield that follows the policy rate plus a term premium and takes half a Federal Reservoir move at once.
  Charts get five years of seeded history before the start (regenerated, not saved) and each day's close after it.
- **Stocks follow commodities** (§10.4, §11.2's Σ c·ΔCommodity): twenty industries load on commodities (oil & gas
  +0.5 on crude, refiners on the crack spread, airlines −0.3 on crude, precious-metal miners +0.7 on gold, logging +0.45
  on lumber, farming on the grains…). The commodity move enters price and value alike each bar, and the idiosyncratic
  noise gives up the same variance, so each stock's volatility is still what its genome says.
- **Futures** (MajorTrade → Futures & Commodities): the board, the selected commodity's chain (six listed months, four
  for financial futures) with bid, ask, change and initial margin, a year's chart, positions with Close and Roll, and
  the lobby. **Market orders only, filled at once from 09:30 to 16:00** — a judgement: the ticket's order types are
  for stocks, and resting futures orders would need a second order book for 128 listed contracts for little play. The
  half-spread is 0.02%, wider further out; commission is a stock order's (Hard's rate on the notional). Every close
  settles every listed contract, and each position's change since its last mark is paid or taken in cash (variation
  margin, in the ledger). The last trading day is the third Friday of the contract month; a letter warns three trading
  days before. At expiry financial futures settle in cash; a long commodity position is **delivered**: the invoice is
  paid at the final price and 1,000 barrels a contract (or 5,000 bushels, or thirty head of cattle) arrive in the
  office lobby, with a letter. Goods cost 0.2% of their value a calendar day to store, and a local merchant pays 10%
  under spot. A short held to expiry fails to deliver and is fined 10% of its notional. The Calendar tab shows the
  expiries of contracts held, OPEK meetings and loan payments.
- **The weather and OPEK (§14)** are one mechanism, the outlook: a warning or hint, a due time, and an outcome decided at
  once but hidden. The National Weather Bureau warns of 13 hazards (Corn Belt drought, Brazilian frost, Florida freeze,
  Gulf hurricanes, Arctic blasts, mild winters, bumper crops, wildfires…) in their months, 2–5 trading days ahead; four
  in five come true. The market prices 15% of the move in on the warning and the rest when the weather hits, or gives the
  15% back. OPEK meets on the last Wednesday of March, June and November and announces at 14:00; five trading days before,
  delegates hint at a cut, hold or rise — right seven times in ten, 30% priced in — and a cut is likelier when crude is
  cheap against its long-run level. About nineteen a year (measured). Both are news — the Newswire, the Financial Timez
  and the trade papers of the industries that depend on the commodity, and for decisions and weather that hits, MoneyTV
  and the Jottings — and their articles chart the commodity instead of the index.
- **Bank loans (§16A).** First Continental Bank lends $10,000 up to $5M in all. The rate on every loan is the policy
  rate plus the spread of the tier the total bank debt falls into (Bronze 3%, Silver 5%, Gold 7.5%, Platinum 11%)
  times the difficulty's loan-rate multiplier, ± up to 2 points by credit score, floating. Amortising or interest only
  with the principal at the end, over 1–5 years; the form shows the rate, payment, interest over the term and the
  price of a missed payment, and the game autosaves before signing. **Interest accrues every calendar day** on the
  principal owed, at the day's rate (actual/365, counted at each close up to the next session), and counts against net
  worth as it accrues. A first version charged a whole month's interest at each payment, so a loan signed on the 30th
  paid a month for three days and one repaid mid-month paid nothing for the days since the last payment; daily accrual
  fixes both. Payments come out at the open on the first trading day of each month: the interest accrued since the
  last one, and for an amortising loan the rest of an even instalment (`financial.pmt` over the months left, worked
  out afresh each month, so the rate can float and early repayments lower the instalments rather than shorten the
  term). They are taken only from equity above the initial requirement (the broker won't let the bank take what the
  positions need); otherwise the payment is missed: a 5% late fee, a mark on the credit report and five trading days
  to pay. A second miss, or the late payment left unpaid, is a default: the bank has positions and goods sold to
  recover the whole loan, and any shortfall is bankruptcy.
- **Repaying** is one form, in MajorTrade → Financing (Repay…, a double-click on a loan, or Pay Now… on the banner of
  an overdue payment) and on the bank's Make a Payment page: pay off the whole loan, only a missed payment, or an
  amount. A payment goes to any missed payment first (which can now be paid at once rather than waiting for the next
  open), then the interest accrued to date, then principal, which carries the 1% early repayment fee (spec §16A).
  Before paying, the form shows the split, what is free to pay, the balance and next payment afterwards, and a cheaper
  tier if the smaller debt reaches one; it comes from the engine (`repayQuote`), so the preview and the payment are
  the same arithmetic (`splitRepayment` in `sim/loans.ts`). The loans table shows the interest so far and the payoff
  amount. Loans in saves from the first Phase 7 build start accruing from the save. The same form is on the bank's
  site, as §16A asks, so the bank's site comes now rather than with Phase 10's other §14.2 sites.
- **Credit score (Equifacts, 300–850):** 680 + payment history (+2 a payment on time up to +80, +20 a loan repaid, −70 a
  missed payment, −200 a default) + leverage (down to −130 as bank and margin debt reach twice net worth; −250 without
  net worth) + the six-month net worth trend (±60). The regulator's record joins it in Phase 8.
- **Bankruptcy (§16)** comes when a margin call or a defaulted loan can't be met after selling everything (fines, payroll
  and rent arrive in later phases). The engine stops the clock for good and writes the final report: dates, cause, what
  was owed and could not be paid, peak and final net worth, best and worst trade, clients won and lost, and net worth
  against the MAJOR 500 a point a week. The UI saves the game into its slot (a new one if it had none), marked Bankrupt,
  then shows the **Blue Screen of Debt**; any key brings the final report (New Firm…, Hall of Shame, Close). A bankrupt
  save is read-only: nothing saves over it (Ctrl+S says why), power-on skips it for the latest living game, loading it
  opens straight at the report with the clock stopped, and **My Computer → Hall of Shame** lists them and shows each
  report from the save's manifest without loading the game. No-bankruptcy mode lets cash stay negative instead.
- **Sites.** The Chicago Murkantile Exchange (settlements by group, each contract's specification, chain and chart, the
  expiry calendar, margins), the National Weather Bureau (warnings with the commodities at risk, its verification
  record, and a national forecast seeded by the day and bent by the warnings in force), OPEK (meetings, delegates'
  remarks, communiqués with their effect on crude), the Federal Reservoir (the rate, the next meeting, decisions with
  minutes whose tone — hawkish, balanced, dovish — is the one the news already carried, the latest economic data, the
  10-year yield), First Continental Bank (rates for this firm, the application, loans and statement) and Equifacts (score,
  its parts, the record). Yeehaw! gains the weather teaser Phase 4 left for this phase, and links to all of them.
- **Ask Reeves (§14.2)**, www.askreeves.com, is the spec's butler and the game's help in one: Reeves (original SVG
  art) answers questions typed in plain words, and 23 guides in six sections cover the first day, time and saving;
  stocks, research, buying, order types, the portfolio, dividends and takeovers; margin and short selling; what
  futures are, how to trade them step by step, daily settlement, expiry and delivery, the weather, OPEK and the Fed;
  loans, repaying and credit; clients, news and tips, bankruptcy and a glossary. The guides quote the game's own
  constants (margin levels, borrow fees, contract sizes and margins, storage and fines, loan tiers and fees) and the
  settings of the game in progress (commission, leverage, margin-call grace), and work their examples with the game's
  functions (`quoteLoan`), so they can't drift from the rules. Shortcuts in the guides open the program or tab they
  describe, as 90s help files did. The question box scores the guides' titles, questions and keywords against the
  question's words (plural endings and word endings folded, stop words dropped): 23 guides don't need a search
  library. It is found from Start → Help (until Phase 11's help file), a desktop shortcut, the browser's favourites
  for new games, Yeehaw!, the welcome letter, MajorTrade's Help menu, and "What do these mean?" links in the order
  ticket, the Futures and Financing tabs and the margin-call banner. A test renders every guide at every difficulty,
  checks every link to a guide leads to one, and checks typical questions find the right guide.
- **Not built.** Tradable index funds (§11.5's MJR, sector and gold funds, and the ticket's "index fund" instrument):
  the MAJOR 500 future covers a bet on the market, and a fund needs its own NAV and holdings; left for a later phase.
  The Portfolio lists stocks and shorts, with futures summarised (P&L today, margin, goods) and listed in the Futures tab.
- **Saves.** Version 5. The v4 → v5 migration gives an old game short interest at its usual levels, an empty futures
  book and lobby, commodities at January 1998's prices (whatever the game's date), no loans and the two new streams. The
  save test now also shorts a stock, holds futures across a settlement and into a delivery, and takes a loan on both
  sides of the save.
- **Measured** in this container: a bar for 10,000 companies 1.33 ms on average, 1.82 ms at p99 (budget 4 ms; Phase 6
  1.16 ms — the commodity step and exposures), a session 113 ms; a simulated year 27.0 s headless; a year's save 21.75 MB
  (target 25). A browser check (Playwright, dev server) went through every Trade tab, every new site after 70 trading days
  with a loan, a short, a trailing stop and two futures delivered to the lobby, the Blue Screen and final report, and an
  imported bankrupt save through the report, the Hall of Shame, a refused Ctrl+S and a power cycle. It caught the bank's
  pages reading their data before it had arrived; they now take it from the site's fetch. A second check took two loans
  through the repay form (part of one, all of the other) and the bank's payment page, and walked Ask Reeves: its pages,
  the question box, a shortcut into MajorTrade and Start → Help.

## Phase 8 — Competitors, governance, scoring; leverage, index funds and new starting capital

- **Libraries.** None added. Competitor strategies are rankings of arrays the engine already has, league tables a sort,
  and the firm's record (time-weighted return, volatility, Sharpe ratio, drawdown) a dozen lines; a statistics package
  (simple-statistics) would have supplied a mean and a standard deviation. Index funds are a basket of shares per unit, and
  no library models that. The browser check used the Playwright already installed in the container, not a dependency.
- **Changes to §9 asked for with this phase.** Starting capital is **Easy $10,000,000, Medium $2,500,000, Hard
  $1,000,000** (the spec's table had $100k, $1M and $10M). **Leverage is off in every preset**: the account is a cash
  account, and opening a position needs its whole value in equity (`maxLeverage` 1). Advanced Settings → Trading has a
  "Leverage" checkbox (on sets 2:1) and the maximum, **up to 15:1**. Switching it on makes the game Custom, as §9 says of
  any value that changes play. Beyond 2:1 the maintenance requirement is half the initial one (1.2 times that for shorts),
  because Reg-T's 25% and 30% would put a 15:1 position in a margin call the moment it opened; up to 2:1 nothing changed.
  Short sales and futures still use the margin rules at 1:1 (a short needs its full value in equity). The difficulty cards
  show index fund fees where leverage was. Saves keep the capital and leverage they were started with, and their label.
  Phase 7's margin, order and loan tests pin the old presets (2:1, $1M) rather than being rewritten.
- **Index funds** (asked for with this phase; spec §11.5's MJR and sector funds). `sim/funds.ts`: fund 0, **MJR**, holds
  the MAJOR 500's members; each industry has a fund of its **50 largest companies** (all of them in a small market),
  picked again at each quarter's last close. A fund holds a basket of shares per unit in proportion to the members' shares
  outstanding — market-value weights that follow prices by themselves — plus cash per unit: dividends and takeover money,
  reinvested at each close. The **fee** comes out of that cash every night for the calendar days to the next session, so a
  unit is worth the index's total return less the fee. Fees are a setting by difficulty, **Easy 0.10% / 0.30% (sector)**,
  **Medium 0.20% / 0.60%**, **Hard 0.40% / 1.20%** a year, and editable. MJR launches at $100, sector funds at $25; their
  tickers are five letters ending in X (mutual-fund style), so they never clash with a company's. The sponsor is First
  Continental Index Funds, the game's bank. Funds trade the way futures do (Phase 7's judgement): a **Funds tab** in
  MajorTrade, market orders only, filled at once from 09:30 to 16:00 at the unit value ± 0.03% (times the spread setting)
  plus the usual commission. They are **long only** — the MAJOR 500 future is how to bet against the market — and
  margin-eligible like stocks. They **launch on the first day**: their charts start then (no generated pre-game history;
  the fund family is new in 1998). No gold fund: gold futures exist. In mandates a sector fund counts as its industry for
  an exclusion; MJR does not (too diversified to count as "holding tobacco"), and neither counts as a single position or a
  small company. Redemptions sell fund units first; liquidations take them in their turn, worst first; fund trades are in
  the daily digest, the ledger and the Recycle Bin (`.FND` files).
- **Competitors (spec §16).** Each firm now runs a fund: its holdings (the generated stakes) and cash, in units that
  clients buy and sell, so returns and flows can be told apart. At each week's last close every firm works out the book
  its strategy wants (`sim/data/competitors.ts`) and trades part of the way there (its turnover), paying the half-spread;
  the week's net flow in each company moves its price by the square-root law, spread over five sessions' volume, at half
  the player's strength, and half of that stays. Strategies: **index** (large and mid caps, $2B+, by value), **balanced**
  (the 100 largest by value, 40% cash), **momentum** (half-year winners), **growth** (revenue growth and quality),
  **value** (earnings and dividend yield), **stock-picking** and **quant** (last week's losers plus an estimate of value),
  **macro** (the best five sectors of the last quarter, by the sector funds, with cash by market regime) and **activist**
  (badly run mid caps below their worth). Nobody sees fundamental value: an estimate is the firm's skill (0–0.5, fixed
  per firm) times the true gap plus an error twice its usual size — early runs with the true gap had every quant beat the
  index by 30% a year. Positions are equal-weighted, capped at the strategy's stake (9.5%, 5% or 15% of a company), in
  companies large enough to take them and never under $300M; nobody may push a company's institutions, insiders and the
  player past 95%. Stakes of 10% or more at the start (subsidiaries, strategic holdings, spec §10.5) are the firm's core
  and never traded. Fees come out weekly (index 0.1%, balanced 0.8%, active 1%, quant/macro/activist 2% a year), cash earns
  the policy rate, dividends and takeover money are paid in. Each quarter clients add or take money: index funds gather 2%
  a quarter whatever happens; others follow the last year's return over the MAJOR 500 (±15% a quarter at most, with
  noise from a new stream, `competitors:ai`: the world generator already uses `competitors`). Firms react to events
  through their signals; aggressive competitors pile into the player's filed 5% stakes (Hard: momentum, quant and
  activist firms; Normal: activists; Easy: none). An activist event now goes only to a firm whose fund is at least three
  times the stake, and is paid for from its cash; a takeover by a competitor is not paid from its fund (a firm buys
  companies with its own balance sheet, not its clients').
- **Holdings disclosure.** Company IR pages list live holders. A firm's website lists its latest public filing: the 50
  largest holdings at a quarter's end, published 45 calendar days later (the next trading day), with the fund's assets
  now; before the first filing is out it shows the book at the start. Its performance chart is its unit value against
  the MAJOR 500, week by week. Every crossing of 5%, by the player, a competitor's weekly trading or an activist, is filed
  with the SOB.
- **League tables.** At the year's last close every firm is ranked by its unit's return over the year and the player by
  its time-weighted return; Barren's covers it (with the Newswire and the fund trade paper), and **barrens.com/league**
  shows every year's table and the standings so far. The top quarter gains 5 reputation, the bottom quarter loses 5.
- **Governance (spec §15.5–15.6).** Checked at each close. **5%**: an SOB filing (public on the SOB's site), a Newswire
  story, a confirmation from the SOB and a letter from the CEO (welcoming or wary; signed by the genome's CEO, since the
  directory doesn't follow CEO changes). **20%**: a board seat offer; a seat shows on the IR page and is lost below 20%.
  **50%**: control; the board writes then and each quarter with **Replace the CEO**, **Raise the dividend** or **Cut the
  dividend**, which the company announces the same day through Phase 6's event machinery. Mergers proposed by the owner are
  not built. **Proxies** come ten trading days before a company's annual meeting (20 trading days after its April report)
  when the player holds 1% of it or 2% of the firm in it: a board election or (35%) a pay package, voted For, Against or
  Abstain in Outbox Express. Others' support is drawn (board 55–97%, pay 40–90% moved by the stock's year); the player's
  shares weigh by their share of the company. A board voted down loses its chief executive. **Takeovers** are put to the
  target's shareholders when the deal is due to close: the player (if a voter) gets a proxy, and a rejection kills the
  deal before regulators and financing have their say. **Bids for a stake**: each week a filed stake may draw a premium
  bid (10–30%) from a non-index competitor, 1% or 4% a week at Normal or Hard aggressiveness, open five trading days; a
  sale is a private trade at the bid, with the commission. **Strategic investment offers**: from the 120th trading day,
  every 60–180 trading days, if the firm has clients, a reputation of 30 and no investor, a competitor offers 5–20% of
  the firm's net worth for 10–25% of its future fees. Accepted, the money is the firm's own capital (deposits and units,
  not performance), and the investor's share of each day's and quarter's fees leaves the same way. **Taunts**: at a
  quarter's end, a non-index rival that beat the firm by three points writes 40% of the time. Not built: counter-bids,
  partnership offers and staff poaching (staff arrive in Phase 10).
- **Heat and the SOB (spec §16B).** Phase 8's sources: when an event breaks, the Bureau looks at the firm's trades in the
  company over the last three trading days. Trades on a genuine tip about that very event (Phase 6 recorded them) are
  insider trading: heat +10 plus up to 20 by the gain. Other trades are flagged if the move was 8% or more and they made
  $25,000 or more: heat +3 plus up to 10. Heat cools by 2 a week times the heat-decay setting. On the first trading day of
  each month an audit comes with chance min(0.9, (heat/100)² × strictness), strictness 0.6, 1 or 1.5 by the scrutiny
  setting; it reports ten trading days later. The evidence (3 an insider trade plus a point per $1M gained, 1 a flagged
  trade, heat/25) times strictness, plus noise, picks the outcome: **cleared**, **warning**, **fine** ($50,000 × strictness
  plus 50–300% of the gains), **suspension** (close-only for 5–30 trading days, $250,000 fixed), **freeze** (also no loans,
  and redemptions wait for it to lift; $500,000), **enforcement** (a New York Journal story among others, $1M fixed, 30
  trading days' suspension, and each non-founding client leaves with even odds). A fine is a loss the day it is imposed
  and a debt for five trading days; then it is taken from equity the positions don't need, else the broker sells, and a
  shortfall is bankruptcy (cause "fine"). The record costs reputation (2 to 30) and credit score points (10 to 150,
  capped at 200). The tray shows a thermometer once heat first rises, and **www.sob.gov** has the filings (searchable),
  enforcement actions and investigation notices. The Compliance Officer's help waits for Phase 10's staff; the dark web's
  heat for Phase 9.
- **Reputation** now also moves with drawdowns (each quarter, beyond 20% from the peak), the SOB record and league places.
- **Scoring.** The firm's return is **time-weighted**: at each close the day's return is the change in net worth less
  money in and out since the last close (client deposits and redemptions, a strategic investor's money and fees) —
  counted by ledger position, since a mandate accepted after the close is tomorrow's money. The growth series is saved
  beside the closes; for old saves it is rebuilt from closes and ledger, counting money moved at the minute of a close with
  that close. From it: annualised return, volatility, Sharpe ratio (against 5%, 1998's bills), maximum and current
  drawdown, best and worst full years, the MAJOR 500 over the same time, and league places, in My Computer → About and
  on the firm's website. **Fifteen achievements** (the spec's four plus eleven), unlocked with a tray notice.
- **Saves.** Version 6. The v5 → v6 migration launches the funds at the current market (MJR at $100), opens every
  competitor's book where the game stands (its current holdings, cash by strategy, history from today), starts governance,
  the regulator and achievements empty, rebuilds the growth series, adds the three new random streams and fills the fund
  fees from the difficulty. The save test now buys and sells fund units and files 5% stakes on both sides of the save,
  votes proxies, and checks competitors' weekly books and filings, SOB filings and the growth series carry over.
- **Acceptance (spec §19: "Competitors' AUM diverges plausibly by strategy over 5 simulated years").**
  `tests/competitors.test.ts` runs five years at 1,000 companies (about 14 s) and checks: every fund solvent with a weekly
  history; index firms within 10% (log) of MJR and gathering money (units up 43–65%); active firms' log returns spread
  0.34 against the index firms' 0.005; the fastest- and slowest-growing funds' assets 7.4 times apart; strategy averages
  more than 0.3 apart; a balanced fund at 60% of the index firms' volatility (0.11 against 0.19); money following returns (rank
  correlation 0.83 among performance-chasing firms); five league tables and filings 45–145 days old. In that run
  momentum lost ground (mean reversion punishes it), growth and quants did well, macro and value were mixed.
- **Measured** in this container: a bar for 10,000 companies 1.16 ms on average, 1.71 ms at p99 (budget 4 ms); a
  session 116 ms; a simulated year at 10,000 companies 25.0 s headless (Phase 7: 27.0 s); competitors' weekly trading
  33 ms; a year's save 21.95 MB (target 25). A browser check (Playwright, dev server) set 15:1 leverage in Advanced
  Settings (the label turned Custom), bought MJR in the Funds tab, and read Barren's league page, the SOB site, a
  competitor's filed holdings, the player's site, My Computer → About and the new Ask Reeves guides, with no console
  errors. The tests caught closed fund positions breaking the bankruptcy report's best and worst trades.
