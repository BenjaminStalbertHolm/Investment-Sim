import { useEffect, useState } from 'react';
import { Icon } from '../art/icons';

const BOOT_MS = 2000;

/**
 * Original splash with an animated progress stripe. It shows for 2 seconds (any click or key skips that) and until
 * the game has loaded.
 */
export function BootScreen({ ready, status, onDone }: { ready: boolean; status?: string; onDone(): void }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const skip = () => setShown(true);
    const timer = setTimeout(skip, BOOT_MS);
    window.addEventListener('keydown', skip);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', skip);
    };
  }, []);

  useEffect(() => {
    if (shown && ready) onDone();
  }, [shown, ready, onDone]);

  return (
    <div className="boot-screen" onClick={() => setShown(true)}>
      <div className="boot-logo">
        <Icon name="doors" size={128} />
        <div className="boot-wordmark">
          <span className="boot-maker">Majorsoft<sup>®</sup></span>
          <span className="boot-product">
            Doors<span className="boot-version">98</span>
          </span>
        </div>
      </div>
      {shown && !ready && <div className="boot-status">{status ?? 'Starting Majorsoft Doors 98…'}</div>}
      <div className="boot-stripe" />
    </div>
  );
}
