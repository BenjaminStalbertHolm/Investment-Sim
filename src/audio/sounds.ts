import { usePrefs } from '../state/prefs';
import { note, output, throttled } from './mixer';

/** The desktop's small sounds (spec §17 Sounds), all synthesised with WebAudio; none is a recording, and none is Microsoft's. */

const clickReady = throttled(30);

/** A button press: a 20 ms tick of noise through a high-pass filter. */
export function click(test = false): void {
  if (!test && (!usePrefs.getState().clicks || !clickReady())) return;
  const sound = output();
  if (!sound) return;
  const { ctx, out } = sound;
  const length = Math.round(ctx.sampleRate * 0.02);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // A fixed pattern of noise: the same tick every time, as a real switch makes.
  let x = 12345;
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    data[i] = ((x / 0x7fffffff) * 2 - 1) * Math.exp((-6 * i) / length);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1800;
  const gain = ctx.createGain();
  gain.gain.value = 0.35;
  source.connect(filter).connect(gain).connect(out);
  source.start();
}

/** Doors starting: a rising four-note figure on soft sines, not the sound of any real operating system. */
export function startup(): void {
  const sound = output();
  if (!sound) return;
  const { ctx, out } = sound;
  const t = ctx.currentTime;
  [392, 523.3, 659.3, 784].forEach((hz, k) => {
    note(ctx, out, hz, t + k * 0.22, 1.1 - k * 0.1, 0.13);
    note(ctx, out, hz / 2, t + k * 0.22, 0.9, 0.06, 'triangle');
  });
}

/** Doors shutting down: the same figure, falling. */
export function shutdown(): void {
  const sound = output();
  if (!sound) return;
  const { ctx, out } = sound;
  const t = ctx.currentTime;
  [784, 659.3, 523.3, 392].forEach((hz, k) => note(ctx, out, hz, t + k * 0.24, 0.9, 0.12));
}

/** The modem's tones, in Hz, that the handshake hops between. */
const SCREECH = [980, 1180, 1270, 1650, 1850, 2100, 2225, 2400];
/** Touch-tone pairs for the number being dialled. */
const DIAL: [number, number][] = [[697, 1209], [770, 1336], [852, 1477], [941, 1209], [697, 1477], [770, 1209], [852, 1336]];

const dialReady = throttled(10_000);

/**
 * The dial-up connection (spec §17: "dial-up noise"): touch-tones, the answering tone, and a couple of seconds of hopping
 * carriers over static, `seconds` in all. Played when a browser window loads its first page in the authentic setting.
 */
export function dialUp(seconds: number, test = false): void {
  if (!test && (!usePrefs.getState().dialUp || !dialReady())) return;
  const sound = output();
  if (!sound) return;
  const { ctx, out } = sound;
  const t = ctx.currentTime;
  const total = Math.max(1.5, seconds);
  const dial = Math.min(0.9, total * 0.25);
  const step = dial / DIAL.length;
  DIAL.forEach(([lo, hi], k) => {
    note(ctx, out, lo, t + k * step, step * 0.7, 0.05);
    note(ctx, out, hi, t + k * step, step * 0.7, 0.05);
  });
  // The answering tone, then the hops.
  const answer = t + dial + 0.1;
  note(ctx, out, 2100, answer, Math.min(0.5, total * 0.15), 0.07);
  let x = 7;
  const until = t + total;
  for (let at = answer + 0.6; at < until; at += 0.07) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    const hz = SCREECH[x % SCREECH.length];
    note(ctx, out, hz, at, 0.07, 0.05, x % 3 === 0 ? 'square' : 'sine');
  }
  // Line noise under the whole handshake.
  const length = Math.round(ctx.sampleRate * total);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (x / 0x7fffffff) * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2600;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, answer);
  gain.gain.exponentialRampToValueAtTime(0.05, answer + 0.5);
  gain.gain.exponentialRampToValueAtTime(0.0001, until);
  source.connect(filter).connect(gain).connect(out);
  source.start(answer);
}

/** Plays every button press as a click (spec §17): one listener on the page, for buttons, menu items and icons. */
export function installClickSounds(): () => void {
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || !(e.target instanceof Element)) return;
    if (e.target.closest('button:not(:disabled), [role="button"], [role="menuitem"], .menu-item, .desktop-icon-inner, .icon-view-item, li[role="tab"]')) click();
  };
  document.addEventListener('pointerdown', onDown, true);
  return () => document.removeEventListener('pointerdown', onDown, true);
}
