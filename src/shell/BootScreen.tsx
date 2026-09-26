import { useEffect } from 'react';
import { Icon } from '../art/icons';

const BOOT_MS = 2000;

/** Original splash with an animated progress stripe; any click or key skips it. */
export function BootScreen({ onDone }: { onDone(): void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, BOOT_MS);
    window.addEventListener('keydown', onDone);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onDone);
    };
  }, [onDone]);

  return (
    <div className="boot-screen" onClick={onDone}>
      <div className="boot-logo">
        <Icon name="doors" size={128} />
        <div className="boot-wordmark">
          <span className="boot-maker">Majorsoft<sup>®</sup></span>
          <span className="boot-product">
            Doors<span className="boot-version">98</span>
          </span>
        </div>
      </div>
      <div className="boot-stripe" />
    </div>
  );
}
