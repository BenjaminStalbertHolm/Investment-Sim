/**
 * The original "new mail" chime (spec §15 UI), synthesised with WebAudio: two bright sine notes. Browsers keep audio
 * suspended until the player has clicked something, and some test environments have none; either way it stays silent.
 */
let context: AudioContext | undefined;
let last = 0;

export function chime(): void {
  const now = Date.now();
  if (now - last < 3000 || typeof AudioContext === 'undefined') return;
  last = now;
  try {
    context ??= new AudioContext();
    const t = context.currentTime;
    [880, 1318.5].forEach((frequency, k) => {
      const start = t + k * 0.12;
      const osc = context!.createOscillator();
      const gain = context!.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      osc.connect(gain).connect(context!.destination);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  } catch {
    // No sound, then.
  }
}
