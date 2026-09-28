import { useEffect, useRef } from 'react';

/**
 * The bouncing cards (spec §4A): cards leap off the foundations and bounce across the screen, leaving trails. Played when
 * Soli-Tear is won, and when a trade closes at +100% or better. Click or any key to stop.
 */
export function BouncingCards({ onDone }: { onDone(): void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const cards: { x: number; y: number; vx: number; vy: number; suit: number }[] = [];
    let frame = 0;
    let tick = 0;
    const W = 50;
    const H = 70;
    const step = () => {
      tick++;
      if (tick % 12 === 0 && cards.length < 52) {
        const k = cards.length;
        cards.push({ x: canvas.width - 80 - (k % 4) * 60, y: 20, vx: -2 - ((k * 37) % 5), vy: 0, suit: k % 4 });
      }
      for (const c of cards) {
        c.vy += 0.6;
        c.x += c.vx;
        c.y += c.vy;
        if (c.y + H > canvas.height) {
          c.y = canvas.height - H;
          c.vy *= -0.8;
        }
        if (ctx && c.x > -W) {
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#000';
          ctx.fillRect(c.x, c.y, W, H);
          ctx.strokeRect(c.x, c.y, W, H);
          ctx.fillStyle = c.suit === 1 || c.suit === 2 ? '#c00' : '#000';
          ctx.font = '20px serif';
          ctx.fillText(['♠', '♥', '♦', '♣'][c.suit], c.x + 6, c.y + 24);
        }
      }
      if (tick > 60 * 9) return onDone();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    const stop = () => onDone();
    window.addEventListener('keydown', stop);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', stop);
    };
  }, [onDone]);
  return <canvas ref={ref} className="bouncing-cards" onClick={onDone} aria-label="Bouncing cards" />;
}
