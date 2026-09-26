import type { Rng } from '../world/rng';
import { fill } from './company/content';

/**
 * Writes a template: `[a|b|c]` picks one alternative (they may hold placeholders), then `{placeholders}` are filled.
 * Unknown placeholders stay as they are, so a test can catch them.
 */
export function write(template: string, words: Record<string, string | number>, rng: Rng): string {
  const chosen = template.replace(/\[([^[\]]*)\]/g, (_, options: string) => rng.pick(options.split('|')));
  return fill(chosen, words);
}

/** A list of templates separated by `|`, leaving the `|` inside `[a|b]` choices alone. */
export function templates(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let k = 0; k < list.length; k++) {
    if (list[k] === '[') depth++;
    else if (list[k] === ']') depth--;
    else if (list[k] === '|' && !depth) {
      out.push(list.slice(start, k));
      start = k + 1;
    }
  }
  out.push(list.slice(start));
  return out;
}

/** "27%" / "27.4%", a magnitude only. */
export const percent = (v: number) => `${(Math.abs(v) * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0)}%`;

/** "$1.2 billion", "$400 million", "$85,000". */
export function dollars(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(a / 1e12).toFixed(1)} trillion`;
  if (a >= 1e9) return `$${(a / 1e9).toFixed(1)} billion`;
  if (a >= 1e6) return `$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)} million`;
  return `$${Math.round(a).toLocaleString('en-US')}`;
}
