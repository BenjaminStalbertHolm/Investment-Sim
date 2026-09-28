import { output, throttled } from './mixer';

const ready = throttled(3000);

/**
 * A short burst of applause (spec §16C.1: hovering over North Korea): a crowd's claps, each a few milliseconds of
 * filtered noise, scattered over a second and a half.
 */
export function applause(): void {
  if (!ready()) return;
  const sound = output();
  if (!sound) return;
  const { ctx, out } = sound;
  const clap = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.03), ctx.sampleRate);
  const data = clap.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length / 6));
  const t = ctx.currentTime;
  for (let k = 0; k < 90; k++) {
    const source = ctx.createBufferSource();
    source.buffer = clap;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900 + Math.random() * 1600;
    const gain = ctx.createGain();
    const at = t + Math.random() * 1.5;
    gain.gain.value = 0.12 * (1 - (at - t) / 1.8);
    source.connect(filter).connect(gain).connect(out);
    source.start(at);
  }
}
