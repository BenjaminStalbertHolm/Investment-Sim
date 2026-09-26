import { useState } from 'react';
import { Icon } from '../../art/icons';
import { simulation } from '../../sim/client';
import { saveGame, useGame } from '../../state/game';
import { useShell } from '../../state/shell';
import { useWindows } from '../../state/windows';
import type { AppProps } from '../types';

/** Shut Down… with the spec's "Save and quit?" (§4): the game is saved before the screen goes dark. */
export default function ShutdownDialog({ windowId }: AppProps) {
  const [choice, setChoice] = useState<'off' | 'booting'>('off');
  const [save, setSave] = useState(true);
  const busy = useGame((s) => s.busy);
  const { close, closeAll } = useWindows.getState();

  const confirm = async () => {
    if (save && !(await saveGame())) return;
    void simulation().setSpeed(0);
    closeAll();
    useShell.getState().setPower(choice);
  };

  return (
    <form
      className="dialog-body"
      onSubmit={(e) => {
        e.preventDefault();
        void confirm();
      }}
    >
      <div className="dialog-row">
        <Icon name="shutdown" />
        <div>
          <p>What do you want the computer to do?</p>
          <div className="field-row">
            <input id={`${windowId}-off`} type="radio" checked={choice === 'off'} onChange={() => setChoice('off')} />
            <label htmlFor={`${windowId}-off`}>Shut down</label>
          </div>
          <div className="field-row">
            <input id={`${windowId}-restart`} type="radio" checked={choice === 'booting'} onChange={() => setChoice('booting')} />
            <label htmlFor={`${windowId}-restart`}>Restart</label>
          </div>
          <div className="field-row">
            <input id={`${windowId}-save`} type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
            <label htmlFor={`${windowId}-save`}>Save the game first</label>
          </div>
        </div>
      </div>
      <div className="dialog-buttons">
        <button type="submit" className="default" disabled={!!busy}>
          {busy ?? 'OK'}
        </button>
        <button type="button" onClick={() => close(windowId)}>Cancel</button>
      </div>
    </form>
  );
}
