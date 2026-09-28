import { usePrefs } from '../state/prefs';
import { note, output, throttled } from './mixer';

/** The original "new mail" chime (spec §15 UI), synthesised with WebAudio: two bright sine notes. */
const ready = throttled(3000);

/** `test` plays it whatever the settings say, for the Sounds panel's Test button. */
export function chime(test = false): void {
  if (!test && (!usePrefs.getState().mailChime || !ready())) return;
  const sound = output();
  if (!sound) return;
  const t = sound.ctx.currentTime;
  [880, 1318.5].forEach((hz, k) => note(sound.ctx, sound.out, hz, t + k * 0.12, 0.4, 0.12));
}
