import { useEffect, useMemo, useRef } from 'react';
import { Logo } from '../art/logo/Logo';
import { decodeLogo } from '../art/logo/code';
import { useGame } from '../state/game';
import { usePrefs } from '../state/prefs';
import { useShell } from '../state/shell';
import { Rng } from '../world/rng';
import { Pipes, project } from './saver/pipes';
import './saver.css';

const OIL = ['#1f1f1f', '#8a5a1a', '#b32d1a', '#c9a227', '#2f6f3f', '#3a5fa0'];

/** Any of these wakes the computer. Mouse movement counts once it has gone a few pixels, so a bumped desk does not. */
const WAKE = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * The screensaver (spec §4): after the idle time set in My Computer → Display, "3D Pipelines" draws oil pipelines, or the
 * firm's logo flies at you. The market carries on behind it. Any key or click wakes the computer.
 */
export function Screensaver() {
  const active = useShell((s) => s.saver);
  const saver = usePrefs((s) => s.saver);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const wokeAt = performance.now();
    let x = -1;
    let y = -1;
    const wake = () => useShell.getState().setSaver(false);
    // The click that started a preview must not end it at once.
    const onWake = () => performance.now() - wokeAt > 400 && wake();
    const onMove = (e: PointerEvent) => {
      if (x >= 0 && Math.hypot(e.clientX - x, e.clientY - y) > 6 && performance.now() - wokeAt > 400) wake();
      if (x < 0) [x, y] = [e.clientX, e.clientY];
    };
    for (const type of WAKE) window.addEventListener(type, onWake, true);
    window.addEventListener('pointermove', onMove, true);
    return () => {
      for (const type of WAKE) window.removeEventListener(type, onWake, true);
      window.removeEventListener('pointermove', onMove, true);
    };
  }, [active]);

  if (!active) return null;
  return (
    <div className="saver" ref={ref} role="presentation">
      {saver === 'pipes' ? <PipesSaver /> : <LogosSaver />}
    </div>
  );
}

/** The idle timer: switches the screensaver on after `saverMinutes` without input, while the desktop shows. */
export function useIdleSaver(running: boolean): void {
  const minutes = usePrefs((s) => s.saverMinutes);
  useEffect(() => {
    if (!running || minutes <= 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => useShell.getState().setSaver(true), minutes * 60_000);
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    // The saver's own wake-up runs first; while it shows, nothing is armed.
    const onInput = () => !useShell.getState().saver && arm();
    for (const e of events) window.addEventListener(e, onInput, { passive: true });
    const unsubscribe = useShell.subscribe((s, prev) => s.saver !== prev.saver && !s.saver && arm());
    arm();
    return () => {
      clearTimeout(timer);
      unsubscribe();
      for (const e of events) window.removeEventListener(e, onInput);
    };
  }, [running, minutes]);
}

function PipesSaver() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const seed = useGame((s) => s.seed);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext('2d');
    // No canvas (a test browser, an odd machine): a black screen is still a screensaver.
    if (!ctx) return;
    const width = (el.width = window.innerWidth);
    const height = (el.height = window.innerHeight);
    // The pipes are a picture, not part of the game, so they draw on a stream of their own that is never saved.
    const pipes = new Pipes(Rng.stream(seed || 'doors', `screensaver:${Date.now()}`), OIL.length);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    ctx.lineCap = 'round';
    let frame = 0;
    let last = 0;
    const draw = (now: number) => {
      // About 20 pieces a second, however fast the screen refreshes.
      if (now - last > 50) {
        last = now;
        const s = pipes.step();
        if (s.cleared) {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, width, height);
        }
        const a = project(s.from, width, height);
        const b = project(s.to, width, height);
        const w = Math.max(6, (Math.min(width, height) / 30) * b.depth);
        const colour = OIL[s.colour];
        // A cylinder: dark outline, body, then a bright stripe along the top.
        for (const [lw, stroke] of [[w, '#000'], [w * 0.82, colour], [w * 0.25, 'rgba(255,255,255,0.55)']] as const) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y - (lw === w * 0.25 ? w * 0.2 : 0));
          ctx.lineTo(b.x, b.y - (lw === w * 0.25 ? w * 0.2 : 0));
          ctx.stroke();
        }
        if (s.joint) {
          const g = ctx.createRadialGradient(a.x - w * 0.15, a.y - w * 0.2, w * 0.05, a.x, a.y, w * 0.7);
          g.addColorStop(0, '#fff');
          g.addColorStop(0.35, colour);
          g.addColorStop(1, '#000');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(a.x, a.y, w * 0.68, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [seed]);

  return <canvas ref={canvas} className="saver-canvas" />;
}

/** The firm's logo flying out of the middle of the screen from many directions, on CSS animations alone. */
function LogosSaver() {
  const player = useGame((s) => s.player);
  const spec = useMemo(() => (player ? { ...decodeLogo(player.logoCode), emblem: player.emblem } : undefined), [player]);
  const flyers = useMemo(() => {
    const rng = Rng.stream(player?.firmName ?? 'doors', `screensaver:logos:${Date.now()}`);
    return Array.from({ length: 14 }, (_, k) => {
      const angle = (k / 14) * Math.PI * 2 + rng.range(-0.2, 0.2);
      return { k, dx: Math.cos(angle) * 55, dy: Math.sin(angle) * 45, delay: -rng.range(0, 8), duration: rng.range(6, 9), spin: rng.range(-25, 25) };
    });
  }, [player?.firmName]);
  if (!spec || !player) return null;
  return (
    <div className="saver-logos">
      {flyers.map((f) => (
        <div
          key={f.k}
          className="saver-flyer"
          style={{ '--dx': `${f.dx}vw`, '--dy': `${f.dy}vh`, '--spin': `${f.spin}deg`, animationDelay: `${f.delay}s`, animationDuration: `${f.duration}s` } as React.CSSProperties}
        >
          <Logo spec={spec} name={player.firmName} height={80} />
        </div>
      ))}
    </div>
  );
}
