import { useEffect, useMemo, useState } from 'react';
import { usePrograms } from '../../state/programs';
import { useTable } from '../../sites/hooks';
import { useGame } from '../../state/game';
import { LISTING } from '../../sim/market';
import { AppMenuBar } from '../AppMenuBar';
import type { AppProps } from '../types';
import { LEVELS, deal, reveal, toggleFlag, type Board, type Level } from './sweeper';
import '../programs.css';

/** A new board's seed: a game picks a board, it doesn't play one (as the designers' fresh seeds, Phase 5). */
const freshSeed = () => crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
const COLOURS = ['', '#0000ff', '#008000', '#ff0000', '#000080', '#800000', '#008080', '#000', '#808080'];

/** Margin Sweeper (spec §4A): the mines are companies that went bankrupt in your world. */
export default function Sweeper({ windowId }: AppProps) {
  const [level, setLevel] = useState<Level>('beginner');
  const [seed, setSeed] = useState(freshSeed);
  const [board, setBoard] = useState<Board>();
  const [started, setStarted] = useState<number>();
  const [now, setNow] = useState(Date.now());
  const best = usePrograms((s) => s.games.sweeper);
  const table = useTable();
  const tickers = useGame((s) => s.directory.tickers);
  const bust = useMemo(() => {
    const out: string[] = [];
    table?.status.forEach((s, i) => s === LISTING.bankrupt && out.push(tickers[i]));
    return out;
  }, [table, tickers]);
  const { width, height, mines } = LEVELS[level];

  useEffect(() => {
    if (!started || board?.state !== 'playing') return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [started, board?.state]);
  useEffect(() => {
    if (board?.state !== 'won' || !started) return;
    const seconds = Math.round((Date.now() - started) / 1000);
    const games = usePrograms.getState().games;
    if (!(games.sweeper[level] <= seconds)) usePrograms.setState({ games: { ...games, sweeper: { ...games.sweeper, [level]: seconds } } });
  }, [board?.state]);

  const restart = (l = level) => {
    setLevel(l);
    setSeed(freshSeed());
    setBoard(undefined);
    setStarted(undefined);
  };
  const click = (i: number) => {
    if (!board) {
      setStarted(Date.now());
      return setBoard(deal(level, seed, i, bust.length));
    }
    setBoard(reveal(board, i));
  };
  const seconds = started ? Math.min(999, Math.floor((now - started) / 1000)) : 0;
  const flags = board?.flag.filter(Boolean).length ?? 0;
  const face = board?.state === 'lost' ? '😵' : board?.state === 'won' ? '😎' : '🙂';
  const boom = board?.boom !== undefined ? bust[board.label[board.boom]] : undefined;

  return (
    <div className="app sweeper">
      <AppMenuBar
        windowId={windowId}
        menus={[{ label: 'Game', items: [
          { label: 'New', shortcut: 'F2', onClick: () => restart() },
          ...(Object.keys(LEVELS) as Level[]).map((l) => ({ label: l[0].toUpperCase() + l.slice(1), checked: l === level, onClick: () => restart(l) })),
        ] }]}
      />
      <div className="sweeper-head">
        <span className="sweeper-lcd">{String(mines - flags).padStart(3, '0')}</span>
        <button className="sweeper-face" aria-label="New game" onClick={() => restart()}>{face}</button>
        <span className="sweeper-lcd">{String(seconds).padStart(3, '0')}</span>
      </div>
      <div className="sweeper-grid" style={{ gridTemplateColumns: `repeat(${width}, 18px)` }} onContextMenu={(e) => e.preventDefault()}>
        {Array.from({ length: width * height }, (_, i) => {
          const open = board?.open[i];
          const mine = board?.mine[i];
          return (
            <button
              key={i}
              className={`sweeper-cell${open ? ' open' : ''}${board?.boom === i ? ' boom' : ''}`}
              title={open && mine ? bust[board!.label[i]] ?? 'A bankrupt company' : undefined}
              onClick={() => click(i)}
              onContextMenu={() => board && setBoard(toggleFlag(board, i))}
              style={{ color: open && !mine ? COLOURS[board!.near[i]] : undefined }}
            >
              {open ? (mine ? '✹' : board!.near[i] || '') : board?.flag[i] ? '⚑' : ''}
            </button>
          );
        })}
      </div>
      <p className="hint">
        {board?.state === 'lost'
          ? `You hit ${boom ?? 'a bankrupt company'}. ${bust.length ? '' : '(Nothing has gone bust yet: these are hypothetical bankruptcies.)'}`
          : board?.state === 'won'
            ? `Cleared in ${seconds} seconds.`
            : `Mines are the ${bust.length || 'future'} companies that went bankrupt in your world. Best: ${best[level] !== undefined ? `${best[level]} s` : '—'}.`}
      </p>
    </div>
  );
}
