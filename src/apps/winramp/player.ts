import { usePrefs } from '../../state/prefs';
import type { Track } from './tracks';

type ToneModule = typeof import('tone');

/**
 * Plays a Track through Tone.js (loaded on first use, so WinRamp opens without it): a square lead, a triangle bass, a
 * membrane kick and noise snare and hats, sequenced in sixteenths, with an FFT feeding the spectrum visualiser.
 */
export class ChipPlayer {
  private tone?: ToneModule;
  private parts: { dispose(): void }[] = [];
  private fft?: InstanceType<ToneModule['FFT']>;

  async play(track: Track, volume: number): Promise<void> {
    const Tone = (this.tone ??= await import('tone'));
    await Tone.start();
    this.stop();
    const out = new Tone.Volume(0).toDestination();
    this.fft = new Tone.FFT(32);
    out.connect(this.fft);
    const lead = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.005, decay: 0.1, sustain: 0.2, release: 0.05 }, volume: -14 }).connect(out);
    const bass = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.1 }, volume: -8 }).connect(out);
    const kick = new Tone.MembraneSynth({ volume: -10 }).connect(out);
    const snare = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.12, sustain: 0 }, volume: -18 }).connect(out);
    const hat = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0 }, volume: -28 }).connect(out);
    const steps = track.lead.map((_, k) => k);
    const seq = new Tone.Sequence(
      (time, k: number) => {
        const note = (m: number) => Tone.Frequency(m, 'midi').toFrequency();
        if (track.lead[k] !== null) lead.triggerAttackRelease(note(track.lead[k]!), '16n', time);
        if (track.bass[k] !== null) bass.triggerAttackRelease(note(track.bass[k]!), '8n', time);
        if (track.kick[k]) kick.triggerAttackRelease('C1', '8n', time);
        if (track.snare[k]) snare.triggerAttackRelease('16n', time);
        if (track.hat[k]) hat.triggerAttackRelease('32n', time);
      },
      steps,
      '16n',
    );
    this.parts = [seq, lead, bass, kick, snare, hat, out, this.fft];
    Tone.getTransport().bpm.value = track.bpm;
    this.setVolume(volume);
    seq.start(0);
    Tone.getTransport().start();
  }

  /** WinRamp's own volume, under the master volume set in My Computer → Sounds. */
  setVolume(volume: number): void {
    const level = volume * usePrefs.getState().volume;
    if (this.tone) this.tone.getDestination().volume.value = level <= 0 ? -Infinity : 20 * Math.log10(level);
  }

  stop(): void {
    if (!this.tone) return;
    const transport = this.tone.getTransport();
    transport.stop();
    transport.cancel();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    this.fft = undefined;
  }

  /** The spectrum now, 32 bands in decibels (−Infinity when silent). */
  spectrum(): Float32Array | undefined {
    return this.fft?.getValue() as Float32Array | undefined;
  }

  /** Seconds since the track started. */
  elapsed(): number {
    return this.tone ? this.tone.getTransport().seconds : 0;
  }
}
