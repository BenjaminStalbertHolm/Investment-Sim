import { simulation } from '../../sim/client';
import type { ModuleFlags } from '../../sim/modules';
import { showError, useGame } from '../../state/game';
import { useBrowser, type Dialup } from '../../state/browser';
import { setPrefs, usePrefs, type AutosaveEvery } from '../../state/prefs';
import type { Speed } from '../../state/shell';
import { Check, Choice } from './AdvancedSettings';
import '../modules.css';
import './settings.css';

const MODULES: [keyof ModuleFlags, string, string][] = [
  ['geopolitics', 'Geopolitics (Encarter 98 world atlas)', 'A joking world of countries, leaders and tensions that move their companies and commodities.'],
  ['periodEvents', '1998-era events', 'Dot-com mania, LTCM, mad cow, El Niño, Birkshire Hatchaway’s price, a sheep on your desktop, a Tamagotcha.'],
  ['gags', 'Recurring gags and storylines', 'Your CEO’s grey hairs, a dart-throwing chimp, Enrun, the pizza index, horoscopes, Mom’s investment club, a goat.'],
];

const SPEEDS: [string, string][] = [['0', 'Paused'], ['1', '1×'], ['2', '2×'], ['5', '5×'], ['20', '20×']];
const AUTOSAVES: [AutosaveEvery, string][] = [['day', 'Every game day'], ['week', 'Every game week'], ['month', 'Every game month'], ['never', 'Never (before risky actions only)']];

/**
 * My Computer → Game (spec §17): the speed a new game starts at, autosave, pausing for urgent pages, the browser's dial-up
 * delay, and the fun modules (spec §16C), which can be switched on and off mid-game.
 */
export function GamePanel() {
  const modules = useGame((s) => s.settings?.modules);
  const ironman = useGame((s) => !!s.settings?.ironman);
  const bankrupt = useGame((s) => !!s.bankrupt);
  const prefs = usePrefs();
  const dialup = useBrowser((s) => s.dialup);
  if (!modules) return null;
  const set = (key: keyof ModuleFlags, on: boolean) =>
    void simulation()
      .setModules({ ...modules, [key]: on })
      .then((settings) => useGame.setState({ settings }), showError);
  return (
    <div className="tab-page settings-panel">
      <fieldset>
        <legend>Playing</legend>
        <Choice
          label="New games start at"
          value={String(prefs.startSpeed)}
          options={SPEEDS}
          onChange={(v) => setPrefs({ startSpeed: Number(v) as Speed })}
        />
        <Choice<AutosaveEvery>
          label="Autosave"
          value={ironman ? 'day' : prefs.autosave}
          options={ironman ? [['day', 'Every game day (Ironman)']] : AUTOSAVES}
          onChange={(autosave) => setPrefs({ autosave })}
        />
        <Check label="Pause the clock when a page comes in (margin calls and other urgent letters)" value={prefs.pauseOnPage} onChange={(pauseOnPage) => setPrefs({ pauseOnPage })} />
        <Choice<Dialup>
          label="Dial-up loading delay"
          value={dialup}
          options={[['off', 'Off'], ['short', 'Short'], ['authentic', 'Authentic']]}
          onChange={(v) => useBrowser.getState().setDialup(v)}
        />
        {ironman && (
          <p className="hint">
            This is an Ironman game: one save slot, written every game day, and no loading. The other saves wait until you start a new game.
          </p>
        )}
        <p className="hint">The game also saves before risky actions, such as signing a loan or buying on the dark web.</p>
      </fieldset>
      <fieldset disabled={bankrupt}>
        <legend>Fun modules</legend>
        {MODULES.map(([key, label, what]) => (
          <div key={key} className="module-choice">
            <Check label={label} value={modules[key]} onChange={(v) => set(key, v)} />
            <p className="hint">{what}</p>
          </div>
        ))}
        <p className="hint">
          All are off in a new game unless Setup switched them on, and none makes a game Custom. Switching one off stops its new
          events and wraps up what it had started, quietly; switching it back on picks up where it left off.
        </p>
      </fieldset>
    </div>
  );
}
