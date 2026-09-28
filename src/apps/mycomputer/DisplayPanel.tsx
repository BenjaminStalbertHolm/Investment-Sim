import { useId } from 'react';
import { WALLPAPERS, wallpaperStyle } from '../../art/wallpapers';
import { SCHEMES, setPrefs, usePrefs, type Saver, type Scheme } from '../../state/prefs';
import { usePrograms, type Wallpaper } from '../../state/programs';
import { useShell } from '../../state/shell';
import { Check, Choice } from './AdvancedSettings';
import './settings.css';

const IDLE_CHOICES = [0, 1, 2, 3, 5, 10, 15, 30];

const sameWallpaper = (a: Wallpaper, b: Wallpaper) =>
  a.kind === b.kind && (a.kind === 'pattern' ? a.id === (b as typeof a).id : a.kind === 'picture' ? a.pixels === (b as typeof a).pixels : true);

/** My Computer → Display (spec §17): wallpaper, colour scheme, the CRT effect and the screensaver. */
export function DisplayPanel() {
  const prefs = usePrefs();
  const wallpaper = usePrograms((s) => s.wallpaper);
  const pictures = usePrograms((s) => s.pictures);
  const idle = useId();
  const choices: { label: string; value: Wallpaper }[] = [
    { label: '(Teal)', value: { kind: 'teal' } },
    ...WALLPAPERS.map((w) => ({ label: w.name, value: { kind: 'pattern', id: w.id } as Wallpaper })),
    ...pictures.map((p) => ({ label: `${p.name} (MajorPaint)`, value: { kind: 'picture', pixels: p.pixels } as Wallpaper })),
  ];
  const current = choices.find((c) => sameWallpaper(c.value, wallpaper));

  return (
    <div className="tab-page settings-panel">
      <fieldset>
        <legend>Wallpaper</legend>
        <div className="settings-row">
          <ul className="wallpaper-list" role="listbox" aria-label="Wallpaper">
            {choices.map((c) => (
              <li
                key={c.label}
                role="option"
                aria-selected={c === current}
                className={c === current ? 'selected' : ''}
                onClick={() => usePrograms.setState({ wallpaper: c.value })}
              >
                {c.label}
              </li>
            ))}
            {!current && (
              <li role="option" aria-selected className="selected">
                (Picture)
              </li>
            )}
          </ul>
          <div className="wallpaper-preview" aria-hidden="true">
            <div className="wallpaper-monitor" style={{ backgroundColor: '#008080', ...wallpaperStyle(wallpaper) }} />
          </div>
        </div>
        <p className="hint">More patterns are on majorsoft.com. MajorPaint sets a picture of your own as wallpaper.</p>
      </fieldset>
      <fieldset>
        <legend>Appearance</legend>
        <Choice<Scheme> label="Colour scheme" value={prefs.scheme} options={SCHEMES.map((s) => [s.id, s.name])} onChange={(scheme) => setPrefs({ scheme })} />
        <Check label="CRT effect (scanlines and a vignette)" value={prefs.crt} onChange={(crt) => setPrefs({ crt })} />
      </fieldset>
      <fieldset>
        <legend>Screensaver</legend>
        <Choice<Saver>
          label="Screensaver"
          value={prefs.saver}
          options={[['pipes', '3D Pipelines'], ['logos', 'Flying Firm Logos']]}
          onChange={(saver) => setPrefs({ saver })}
        />
        <div className="field-row">
          <label htmlFor={idle}>Wait</label>
          <select id={idle} value={prefs.saverMinutes} onChange={(e) => setPrefs({ saverMinutes: Number(e.target.value) })}>
            {IDLE_CHOICES.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'Never' : `${m} minute${m === 1 ? '' : 's'}`}
              </option>
            ))}
          </select>
        </div>
        <div className="button-row">
          <button onClick={() => useShell.getState().setSaver(true)}>Preview</button>
        </div>
        <p className="hint">The market keeps running behind the screensaver. Move the mouse or press a key to wake up.</p>
      </fieldset>
    </div>
  );
}
