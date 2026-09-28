import { useEffect, useRef, useState } from 'react';
import { usePrefs } from '../../state/prefs';
import { usePrograms } from '../../state/programs';
import { useWindows } from '../../state/windows';
import type { AppProps } from '../types';
import { ChipPlayer } from './player';
import { TITLES, track } from './tracks';
import '../programs.css';

const SKINS = ['Classic', 'Bull Market', 'Bear Market'];

/** WinRamp (spec §4A): original synthesised chiptune, a spectrum visualiser and skins. "It really whips the market." */
export default function WinRamp({ windowId }: AppProps) {
  const prefs = usePrograms((s) => s.winramp);
  const set = (patch: Partial<typeof prefs>) => usePrograms.setState({ winramp: { ...usePrograms.getState().winramp, ...patch } });
  const master = usePrefs((s) => s.volume);
  const player = useRef<ChipPlayer>(undefined);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const play = async (n = prefs.track) => {
    player.current ??= new ChipPlayer();
    set({ track: n });
    try {
      await player.current.play(track(n), prefs.volume);
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };
  const stop = () => {
    player.current?.stop();
    setPlaying(false);
    setElapsed(0);
  };
  useEffect(() => () => player.current?.stop(), []);
  useEffect(() => player.current?.setVolume(prefs.volume), [prefs.volume, master]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const draw = () => {
      const ctx = canvas.current?.getContext('2d');
      const bands = player.current?.spectrum();
      if (ctx && bands) {
        const { width, height } = ctx.canvas;
        ctx.clearRect(0, 0, width, height);
        const w = width / bands.length;
        bands.forEach((db, k) => {
          const h = Math.max(0, Math.min(1, (db + 100) / 70)) * height;
          ctx.fillStyle = h > height * 0.75 ? '#e03020' : h > height * 0.45 ? '#e0c020' : '#30d030';
          ctx.fillRect(k * w + 1, height - h, w - 2, h);
        });
      }
      setElapsed(player.current?.elapsed() ?? 0);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const t = track(prefs.track);
  return (
    <div className={`winramp skin-${prefs.skin}`}>
      <div className="winramp-top">
        <span className="winramp-logo">WinRamp</span>
        <button className="winramp-close" aria-label="Close" onClick={() => useWindows.getState().close(windowId)}>×</button>
      </div>
      <div className="winramp-display">
        <span className="winramp-time">{mm(elapsed)}</span>
        <canvas ref={canvas} width={120} height={32} aria-label="Spectrum" />
        <div className="winramp-title">
          <span>{`${prefs.track + 1}. ${t.title} (${t.bpm} bpm) *** It really whips the market. *** `}</span>
        </div>
      </div>
      <div className="winramp-buttons">
        <button aria-label="Previous" onClick={() => void play((prefs.track + TITLES.length - 1) % TITLES.length)}>⏮</button>
        <button aria-label="Play" onClick={() => void play()}>▶</button>
        <button aria-label="Stop" onClick={stop}>■</button>
        <button aria-label="Next" onClick={() => void play((prefs.track + 1) % TITLES.length)}>⏭</button>
        <input type="range" aria-label="Volume" min={0} max={1} step={0.05} value={prefs.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
      </div>
      <ol className="winramp-playlist">
        {TITLES.map((title, n) => (
          <li key={title} className={n === prefs.track ? 'current' : ''} onDoubleClick={() => void play(n)}>
            {title}
          </li>
        ))}
      </ol>
      <div className="winramp-skins">
        Skin:{' '}
        {SKINS.map((name, k) => (
          <button key={name} className={k === prefs.skin ? 'pressed' : ''} onClick={() => set({ skin: k })}>
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
