import { simulation } from '../../sim/client';
import type { ModuleFlags } from '../../sim/modules';
import { showError, useGame } from '../../state/game';
import { Check } from './AdvancedSettings';
import '../modules.css';

const MODULES: [keyof ModuleFlags, string, string][] = [
  ['geopolitics', 'Geopolitics (Encarter 98 world atlas)', 'A joking world of countries, leaders and tensions that move their companies and commodities.'],
  ['periodEvents', '1998-era events', 'Dot-com mania, LTCM, mad cow, El Niño, Birkshire Hatchaway’s price, a sheep on your desktop, a Tamagotcha.'],
  ['gags', 'Recurring gags and storylines', 'Your CEO’s grey hairs, a dart-throwing chimp, Enrun, the pizza index, horoscopes, Mom’s investment club, a goat.'],
];

/**
 * My Computer → Game (spec §17): the fun modules (spec §16C), which can be switched on and off mid-game. Speed and the
 * browser's dial-up delay live in the tray and the browser.
 */
export function GamePanel() {
  const modules = useGame((s) => s.settings?.modules);
  const bankrupt = useGame((s) => !!s.bankrupt);
  if (!modules) return null;
  const set = (key: keyof ModuleFlags, on: boolean) =>
    void simulation()
      .setModules({ ...modules, [key]: on })
      .then((settings) => useGame.setState({ settings }), showError);
  return (
    <div className="tab-page">
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
