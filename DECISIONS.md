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
