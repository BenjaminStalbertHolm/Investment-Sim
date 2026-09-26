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
