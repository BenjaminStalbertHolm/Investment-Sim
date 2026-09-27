let context: AudioContext | undefined;
let last = 0;

/** ISeekYou's new-message sound (spec §4A: an original "uh-oh"-style chime): two falling notes, like a small surprise. */
export function uhOh(): void {
  const now = performance.now();
  if (now - last < 2000 || typeof AudioContext === 'undefined') return;
  last = now;
  context ??= new AudioContext();
  const t = context.currentTime;
  [
    [587, 0],
    [440, 0.16],
  ].forEach(([hz, at]) => {
    const osc = context!.createOscillator();
    const gain = context!.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(hz, t + at);
    osc.frequency.exponentialRampToValueAtTime(hz * 0.94, t + at + 0.14);
    gain.gain.setValueAtTime(0.0001, t + at);
    gain.gain.exponentialRampToValueAtTime(0.25, t + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.15);
    osc.connect(gain).connect(context!.destination);
    osc.start(t + at);
    osc.stop(t + at + 0.16);
  });
}
