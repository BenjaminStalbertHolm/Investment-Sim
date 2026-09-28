import { useId } from 'react';
import { chime } from '../../audio/chime';
import { click, dialUp, startup } from '../../audio/sounds';
import { uhOh } from '../../audio/uhoh';
import { setPrefs, usePrefs } from '../../state/prefs';
import { Check } from './AdvancedSettings';
import './settings.css';

/** My Computer → Sounds (spec §17): master volume, click sounds, the mail chime and the dial-up noise. */
export function SoundsPanel() {
  const prefs = usePrefs();
  const volume = useId();
  return (
    <div className="tab-page settings-panel">
      <fieldset>
        <legend>Volume</legend>
        <div className="field-row">
          <label htmlFor={volume}>Master volume</label>
          <input
            id={volume}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={prefs.volume}
            onChange={(e) => setPrefs({ volume: Number(e.target.value) })}
            onPointerUp={() => click(true)}
          />
          <span className="volume-value">{Math.round(prefs.volume * 100)}%</span>
        </div>
        <p className="hint">Every sound in the game is made by the computer as it plays: nothing is recorded. WinRamp has a volume of its own, under this one.</p>
      </fieldset>
      <fieldset>
        <legend>Sound events</legend>
        <div className="sound-event">
          <Check label="Click sounds" value={prefs.clicks} onChange={(clicks) => setPrefs({ clicks })} />
          <button onClick={() => click(true)}>Test</button>
        </div>
        <div className="sound-event">
          <Check label="New mail chime" value={prefs.mailChime} onChange={(mailChime) => setPrefs({ mailChime })} />
          <button onClick={() => chime(true)}>Test</button>
        </div>
        <div className="sound-event">
          <Check label="Dial-up noise (Internet Exploiter, when the delay is Authentic)" value={prefs.dialUp} onChange={(dialUp) => setPrefs({ dialUp })} />
          <button onClick={() => dialUp(3, true)}>Test</button>
        </div>
        <div className="sound-event">
          <span>ISeekYou message, and the Doors start-up sound</span>
          <span>
            <button onClick={() => uhOh()}>Test</button> <button onClick={() => startup()}>Start-up</button>
          </span>
        </div>
      </fieldset>
    </div>
  );
}
