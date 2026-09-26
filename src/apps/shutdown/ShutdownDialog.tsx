import { useState } from 'react';
import { Icon } from '../../art/icons';
import { useShell } from '../../state/shell';
import { useWindows } from '../../state/windows';
import type { AppProps } from '../types';

// The "Save and quit?" prompt joins this dialog once saving exists (Phase 3).
export default function ShutdownDialog({ windowId }: AppProps) {
  const [choice, setChoice] = useState<'off' | 'booting'>('off');
  const { close, closeAll } = useWindows.getState();

  const confirm = () => {
    closeAll();
    useShell.getState().setPower(choice);
  };

  return (
    <form
      className="dialog-body"
      onSubmit={(e) => {
        e.preventDefault();
        confirm();
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
        </div>
      </div>
      <div className="dialog-buttons">
        <button type="submit" className="default">OK</button>
        <button type="button" onClick={() => close(windowId)}>Cancel</button>
      </div>
    </form>
  );
}
