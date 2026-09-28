import { usePrefs } from '../state/prefs';

/**
 * The game's one sound card (spec §17 Sounds): every synthesised sound goes through a master volume set in My Computer.
 * Browsers keep audio suspended until the player has clicked something, and some test environments have none; either
 * way the sounds stay silent instead of failing.
 */
let context: AudioContext | undefined;
let master: GainNode | undefined;

/** Where sounds connect to; undefined when there is no audio, or the volume is off. */
export function output(): { ctx: AudioContext; out: AudioNode } | undefined {
  if (typeof AudioContext === 'undefined' || usePrefs.getState().volume <= 0) return undefined;
  // Until the player has pressed something the browser will not play audio, and a sound scheduled now would only come out
  // later, all at once, when it does: so the start-up sound is simply not heard on a page's very first load.
  if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.hasBeenActive) return undefined;
  try {
    if (!context) {
      context = new AudioContext();
      master = context.createGain();
      master.connect(context.destination);
    }
    if (context.state !== 'running') {
      void context.resume().catch(() => undefined);
      // A sound scheduled on a clock that is not running would play late.
      if (context.state === 'suspended') return undefined;
    }
    master!.gain.value = usePrefs.getState().volume ** 2;
    return { ctx: context, out: master! };
  } catch {
    return undefined;
  }
}

/** Keeps a sound from repeating too soon (a burst of mail is one chime). */
export function throttled(minGap: number): () => boolean {
  let last = -Infinity;
  return () => {
    const now = performance.now();
    if (now - last < minGap) return false;
    last = now;
    return true;
  };
}

/** One tone with a soft attack and decay. */
export function note(ctx: AudioContext, out: AudioNode, hz: number, start: number, length: number, peak: number, type: OscillatorType = 'sine'): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = hz;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.02, length / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + length + 0.05);
}
