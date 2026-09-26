import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../../art/icons';
import { formatClock } from '../../sim/calendar';
import { DIFFICULTIES } from '../../sim/settings';
import { exportSave, importSave, loadGame, newGame, randomSeed, saveGame, showError, useGame } from '../../state/game';
import { deleteSave, listSaves, type SaveSlot } from '../../state/saves';
import { useWindows } from '../../state/windows';
import { Confirm, Prompt } from '../../ui98/Modal';
import { VirtualTable, type Column } from '../../ui98/VirtualTable';
import { AppMenuBar } from '../AppMenuBar';
import { count, money } from '../format';
import type { AppProps } from '../types';

/** Control-Panel-style panels (spec §17). Those without a phase are built. */
const PANELS: { id: string; label: string; icon: IconName; phase?: number }[] = [
  { id: 'saves', label: 'Saves', icon: 'documents' },
  { id: 'newgame', label: 'New Game', icon: 'doors' },
  { id: 'display', label: 'Display', icon: 'computer', phase: 11 },
  { id: 'sounds', label: 'Sounds', icon: 'settings', phase: 11 },
  { id: 'game', label: 'Game', icon: 'settings', phase: 11 },
  { id: 'firm', label: 'Firm', icon: 'portfolio', phase: 5 },
  { id: 'about', label: 'About', icon: 'help' },
];

export default function MyComputer({ windowId }: AppProps) {
  const view = useWindows((s) => s.windows.find((w) => w.id === windowId)?.params?.view) ?? 'root';
  const go = (v: string) => useWindows.getState().setParams(windowId, { view: v });
  const panel = PANELS.find((p) => p.id === view);
  const address = view === 'saves' ? 'C:\\Saves\\' : panel ? `My Computer\\${panel.label}` : 'My Computer';

  return (
    <div className="app">
      <AppMenuBar windowId={windowId} />
      <div className="toolbar">
        <button disabled={!panel} onClick={() => go('root')}>
          Up
        </button>
        <label htmlFor={`${windowId}-address`}>Address</label>
        <input id={`${windowId}-address`} className="address" readOnly value={address} />
      </div>
      <div className="window-content">
        {!panel && (
          <div className="icon-view">
            {PANELS.map((p) => (
              <button key={p.id} className="icon-view-item" onDoubleClick={() => go(p.id)} onKeyDown={(e) => e.key === 'Enter' && go(p.id)}>
                <Icon name={p.icon} />
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        )}
        {panel?.phase && (
          <div className="placeholder">
            <Icon name={panel.icon} size={64} />
            <p>Setup has not finished installing the {panel.label} panel. It will be ready in Phase {panel.phase}.</p>
          </div>
        )}
        {view === 'saves' && <Saves />}
        {view === 'newgame' && <NewGame />}
        {view === 'about' && <About />}
      </div>
    </div>
  );
}

/** C:\Saves\ (spec §17): slots with date, firm and AUM; Save, Load, Delete, Export and Import .d98. */
function Saves() {
  const [saves, setSaves] = useState<SaveSlot[]>([]);
  const [selected, setSelected] = useState<string>();
  const [dialog, setDialog] = useState<'save' | 'load' | 'delete'>();
  const busy = useGame((s) => s.busy);
  const current = useGame((s) => s.slot);
  const picker = useRef<HTMLInputElement>(null);
  const slot = saves.find((s) => s.id === selected);

  useEffect(() => {
    void listSaves().then((list) => setSaves(list.sort((a, b) => b.savedAt - a.savedAt)));
  }, [busy]);

  const columns: Column<SaveSlot>[] = [
    { header: 'Name', cell: (s) => (s.id === current?.id ? <b>{s.name}</b> : s.name) },
    { header: 'Game date', cell: (s) => formatClock(s.gameTime) },
    { header: 'Firm', cell: (s) => s.firmName },
    { header: 'AUM', align: 'right', cell: (s) => money(s.netWorth) },
    { header: 'Saved', cell: (s) => new Date(s.savedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) },
    { header: 'Size', align: 'right', cell: (s) => `${count(s.size / 1024)} KB` },
  ];

  return (
    <div className="tab-page">
      <VirtualTable
        rows={saves}
        columns={columns}
        rowKey={(s) => s.id}
        selected={selected}
        onSelect={(s) => setSelected(s.id)}
        onOpen={(s) => (setSelected(s.id), setDialog('load'))}
        empty="No saved games. Press Save… or Ctrl+S."
      />
      <div className="button-row">
        <button onClick={() => setDialog('save')} disabled={!!busy}>
          Save…
        </button>
        <button onClick={() => setDialog('load')} disabled={!slot || !!busy}>
          Load
        </button>
        <button onClick={() => setDialog('delete')} disabled={!slot || !!busy}>
          Delete
        </button>
        <button onClick={() => slot && void exportSave(slot).catch(showError)} disabled={!slot}>
          Export .d98…
        </button>
        <button onClick={() => picker.current?.click()} disabled={!!busy}>
          Import .d98…
        </button>
        <input
          ref={picker}
          type="file"
          accept=".d98"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void importSave(file);
          }}
        />
        {busy && <span>{busy}</span>}
      </div>
      {dialog === 'save' && (
        <Prompt
          title="Save Game"
          label="Save as (an existing name is overwritten):"
          initial={slot && !slot.auto ? slot.name : undefined}
          onOk={(name) => {
            setDialog(undefined);
            const existing = saves.find((s) => !s.auto && s.name === name);
            void saveGame({ id: existing?.id ?? `save-${Date.now()}`, name });
          }}
          onCancel={() => setDialog(undefined)}
        />
      )}
      {dialog === 'load' && slot && (
        <Confirm
          title="Load Game"
          ok="Load"
          onOk={() => {
            setDialog(undefined);
            void loadGame(slot.id).catch(showError);
          }}
          onCancel={() => setDialog(undefined)}
        >
          Load '{slot.name}'? Anything you haven't saved will be lost.
        </Confirm>
      )}
      {dialog === 'delete' && slot && (
        <Confirm
          title="Confirm File Delete"
          ok="Yes"
          onOk={() => {
            setDialog(undefined);
            setSelected(undefined);
            void deleteSave(slot.id).then(() => setSaves((list) => list.filter((s) => s.id !== slot.id)));
          }}
          onCancel={() => setDialog(undefined)}
        >
          Are you sure you want to delete '{slot.name}'?
        </Confirm>
      )}
    </div>
  );
}

/** A new game with a firm name, a world seed and a difficulty. Phase 5's Setup Wizard replaces this panel. */
function NewGame() {
  const [firmName, setFirmName] = useState('Garage Capital');
  const [seed, setSeed] = useState(randomSeed);
  const [difficulty, setDifficulty] = useState<keyof typeof DIFFICULTIES>('medium');
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="tab-page new-game">
      <fieldset>
        <legend>Your firm</legend>
        <div className="field-row">
          <label htmlFor="firm-name">Firm name:</label>
          <input id="firm-name" value={firmName} onChange={(e) => setFirmName(e.target.value)} size={32} />
        </div>
        <div className="field-row">
          <label htmlFor="world-seed">World seed:</label>
          <input id="world-seed" value={seed} onChange={(e) => setSeed(e.target.value)} size={20} />
          <button onClick={() => setSeed(randomSeed())}>Randomise</button>
        </div>
        <p className="hint">The same seed always builds the same market, so you can share it.</p>
      </fieldset>
      <fieldset>
        <legend>Difficulty</legend>
        {(Object.keys(DIFFICULTIES) as (keyof typeof DIFFICULTIES)[]).map((d) => {
          const s = DIFFICULTIES[d];
          return (
            <div className="field-row" key={d}>
              <input id={`difficulty-${d}`} type="radio" checked={difficulty === d} onChange={() => setDifficulty(d)} />
              <label htmlFor={`difficulty-${d}`}>
                <b>{d[0].toUpperCase() + d.slice(1)}</b>: {money(s.startingCapital)} to start, {money(s.commission.fixed)} a trade
                {s.commission.rate ? ` + ${s.commission.rate * 100}%` : ''}, volatility {s.volatility}×
              </label>
            </div>
          );
        })}
      </fieldset>
      <div className="button-row">
        <button className="default" disabled={!firmName.trim() || !seed.trim()} onClick={() => setConfirming(true)}>
          Start New Game
        </button>
      </div>
      {confirming && (
        <Confirm
          title="New Game"
          onOk={() => {
            setConfirming(false);
            void newGame({ seed: seed.trim(), settings: DIFFICULTIES[difficulty], firmName: firmName.trim() }).catch(showError);
          }}
          onCancel={() => setConfirming(false)}
        >
          Start a new game? Anything you haven't saved will be lost.
        </Confirm>
      )}
    </div>
  );
}

/** About Majorsoft Doors 98 (spec §17): version, world seed and credits. */
function About() {
  const seed = useGame((s) => s.seed);
  const firmName = useGame((s) => s.firmName);
  return (
    <div className="tab-page about">
      <p>
        <b>Majorsoft Doors 98</b> — Investment Firm Edition, build 4.
      </p>
      <p>
        Licensed to: {firmName}
        <br />
        World seed: <b>{seed}</b>
      </p>
      <p>
        Charts by TradingView Lightweight Charts™, copyright © 2025 TradingView, Inc.,{' '}
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          https://www.tradingview.com/
        </a>
        , under the Apache License 2.0. Window styling from 98.css by Jordan Scales (MIT).
      </p>
      <p>
        Logo and clip-art silhouettes from game-icons.net by Lorc, Delapouite and contributors, under CC BY 3.0,
        via react-icons (MIT).
      </p>
    </div>
  );
}
