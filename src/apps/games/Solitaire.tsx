import { useState } from 'react';
import { Emblem } from '../../art/logo/Logo';
import { usePlayerLook } from '../mycomputer/PlayerBadge';
import { usePrograms } from '../../state/programs';
import { AppMenuBar } from '../AppMenuBar';
import type { AppProps } from '../types';
import { BouncingCards } from './BouncingCards';
import { RANKS, SUITS, allowed, deal, draw, foundationFor, move, red, won, type Card, type From, type Klondike, type To } from './klondike';
import '../programs.css';

const freshSeed = () => crypto.getRandomValues(new Uint32Array(1))[0].toString(36);

/** Soli-Tear (spec §4A): Klondike, with the firm's logo on the back of every card. */
export default function Solitaire({ windowId }: AppProps) {
  const [game, setGame] = useState<Klondike>(() => deal(freshSeed()));
  const [held, setHeld] = useState<From>();
  const [bounce, setBounce] = useState(false);
  const stats = usePrograms((s) => s.games.solitaire);
  const look = usePlayerLook();

  const record = (patch: Partial<typeof stats>) => {
    const games = usePrograms.getState().games;
    usePrograms.setState({ games: { ...games, solitaire: { ...games.solitaire, ...patch } } });
  };
  const newGame = () => {
    setGame(deal(freshSeed()));
    setHeld(undefined);
    record({ played: stats.played + 1 });
  };
  const apply = (next: Klondike) => {
    setGame(next);
    setHeld(undefined);
    if (!won(game) && won(next)) {
      record({ won: stats.won + 1 });
      setBounce(true);
    }
  };
  const target = (to: To) => (held ? apply(move(game, held, to)) : undefined);
  const autoFound = (from: From) => {
    const to = foundationFor(game, from);
    if (to) apply(move(game, from, to));
  };
  const Back = () => (
    <div className="sol-card back">{look && <svg width="40" height="40"><Emblem spec={look.logo} name={look.player.firmName} height={40} /></svg>}</div>
  );
  const Face = ({ card, from, selected }: { card: Card; from: From; selected?: boolean }) => (
    <div
      className={`sol-card${red(card) ? ' red' : ''}${selected ? ' selected' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (held && !(held.pile === from.pile && JSON.stringify(held) === JSON.stringify(from)) && from.pile === 'tableau') return target({ pile: 'tableau', column: from.column });
        if (held && from.pile === 'foundation') return target({ pile: 'foundation', column: from.column });
        setHeld(from);
      }}
      onDoubleClick={() => autoFound(from)}
    >
      <span>{RANKS[card.rank]}{SUITS[card.suit]}</span>
      <b>{SUITS[card.suit]}</b>
    </div>
  );
  const isHeld = (from: From) => held !== undefined && JSON.stringify(held) === JSON.stringify(from);

  return (
    <div className="app solitaire">
      <AppMenuBar windowId={windowId} menus={[{ label: 'Game', items: [{ label: 'Deal', shortcut: 'F2', onClick: newGame }] }]} />
      <div className="sol-table" onClick={() => setHeld(undefined)}>
        <div className="sol-row">
          <div className="sol-slot" onClick={(e) => (e.stopPropagation(), apply(draw(game)))}>
            {game.stock.length ? <Back /> : <div className="sol-card empty">↻</div>}
          </div>
          <div className="sol-slot">
            {game.waste.length ? <Face card={game.waste[game.waste.length - 1]} from={{ pile: 'waste' }} selected={isHeld({ pile: 'waste' })} /> : <div className="sol-card empty" />}
          </div>
          <div className="sol-gap" />
          {game.foundations.map((f, column) => (
            <div key={column} className="sol-slot" onClick={(e) => (e.stopPropagation(), target({ pile: 'foundation', column }))}>
              {f.length ? <Face card={f[f.length - 1]} from={{ pile: 'foundation', column }} /> : <div className={`sol-card empty${held && allowed(game, held, { pile: 'foundation', column }) ? ' hint-drop' : ''}`}>A</div>}
            </div>
          ))}
        </div>
        <div className="sol-row tableau">
          {game.tableau.map((cards, column) => (
            <div key={column} className="sol-column" onClick={(e) => (e.stopPropagation(), target({ pile: 'tableau', column }))}>
              {!cards.length && <div className="sol-card empty">K</div>}
              {cards.map((card, index) => (
                <div key={index} className="sol-stacked" style={{ top: index * 18 }}>
                  {card.up ? <Face card={card} from={{ pile: 'tableau', column, index }} selected={isHeld({ pile: 'tableau', column, index })} /> : <Back />}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="status-bar">
        <p className="status-bar-field">Click a card, then where it goes. Double-click sends a card home.</p>
        <p className="status-bar-field">Won {stats.won} of {stats.played + 1}</p>
      </div>
      {bounce && <BouncingCards onDone={() => setBounce(false)} />}
    </div>
  );
}
