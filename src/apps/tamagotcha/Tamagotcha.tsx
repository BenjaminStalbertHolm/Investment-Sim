import { useState } from 'react';
import { dayOf, formatDate } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { showError, useGame } from '../../state/game';
import { useModules } from '../../sites/hooks';
import { AppMenuBar } from '../AppMenuBar';
import type { AppProps } from '../types';
import '../modules.css';

/** Two game weeks without attention and it dies (spec §16C.2). */
const NEGLECT = 14;
const act = (p: Promise<string | undefined>) => void p.then((e) => e && showError(e));

/** Tamagotcha (spec §16C.2, the 1998-era events module): a virtual pet that dies if ignored; resurrection costs $1. */
export default function Tamagotcha({ windowId }: AppProps) {
  const on = useGame((s) => s.settings?.modules.periodEvents);
  const today = useGame((s) => (s.snapshot ? dayOf(s.snapshot.time) : 0));
  const pet = useModules()?.period?.tamagotcha;
  const [name, setName] = useState('');
  const hunger = pet ? Math.min(1, (today - pet.fed) / NEGLECT) : 0;
  const bored = pet ? Math.min(1, (today - pet.played) / NEGLECT) : 0;
  const face = !pet ? '🥚' : !pet.alive ? '👻' : Math.max(hunger, bored) > 0.7 ? '😿' : Math.max(hunger, bored) > 0.35 ? '😐' : '😺';
  return (
    <div className="app tamagotcha">
      <AppMenuBar windowId={windowId} />
      <div className="tama-shell">
        <div className="tama-screen" aria-live="polite">
          <div className="tama-pet" aria-hidden="true">
            {face}
          </div>
          {!on ? (
            'Needs the 1998-era events module.'
          ) : !pet ? (
            'An egg. Give it a name.'
          ) : pet.alive ? (
            <>
              <b>{pet.name}</b>, born {formatDate(pet.born)}
              <br />
              Hunger {'♥'.repeat(Math.round((1 - hunger) * 4)).padEnd(4, '♡')} Fun {'♥'.repeat(Math.round((1 - bored) * 4)).padEnd(4, '♡')}
            </>
          ) : (
            <>
              <b>{pet.name}</b> died on {formatDate(pet.died!)}. Deaths: {pet.deaths}.
            </>
          )}
        </div>
        {on && !pet && (
          <form
            className="tama-buttons"
            onSubmit={(e) => {
              e.preventDefault();
              act(simulation().tamagotcha({ do: 'adopt', name }));
            }}
          >
            <input size={10} aria-label="Pet’s name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            <button type="submit">Hatch</button>
          </form>
        )}
        {on && pet?.alive && (
          <div className="tama-buttons">
            <button onClick={() => act(simulation().tamagotcha({ do: 'feed' }))}>Feed</button>
            <button onClick={() => act(simulation().tamagotcha({ do: 'play' }))}>Play</button>
          </div>
        )}
        {on && pet && !pet.alive && (
          <div className="tama-buttons">
            <button onClick={() => act(simulation().tamagotcha({ do: 'resurrect' }))}>Resurrect ($1)</button>
          </div>
        )}
      </div>
      <p className="hint">Feed it and play with it at least once every two game weeks.</p>
    </div>
  );
}
