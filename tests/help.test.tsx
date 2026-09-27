import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/sim/settings';
import { TOPIC, TOPICS, ask } from '../src/sites/help/topics';

// Ask Reeves (spec §14.2): the butler who answers questions, and the game's help.

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const path = join(dir, f);
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(f) ? [path] : [];
  });

describe('Ask Reeves (spec §14.2)', () => {
  it('renders every guide for every difficulty, with the game’s own numbers and no gaps', () => {
    for (const settings of [...Object.values(DIFFICULTIES), { ...DIFFICULTIES.medium, maxLeverage: 15 }]) {
      for (const topic of TOPICS) {
        const html = renderToString(<>{topic.body({ settings })}</>);
        expect(html, topic.id).not.toMatch(/undefined|NaN|Infinity|\[object/);
        expect(html.length, topic.id).toBeGreaterThan(300);
      }
    }
    const margin = (s: typeof DIFFICULTIES.hard) => renderToString(<>{TOPIC.margin.body({ settings: s })}</>);
    expect(margin(DIFFICULTIES.medium)).toContain('switched off');
    expect(margin({ ...DIFFICULTIES.medium, maxLeverage: 2 })).toContain('2:1');
    expect(margin({ ...DIFFICULTIES.hard, maxLeverage: 1.5 })).toContain('1.5:1');
    expect(margin({ ...DIFFICULTIES.hard, maxLeverage: 15 })).toContain('15:1');
    expect(renderToString(<>{TOPIC.buying.body({ settings: DIFFICULTIES.hard })}</>)).toContain('$29.95 an order plus 0.05%');
  });

  it('has unique guides, each answering questions, and every link to a guide goes somewhere', () => {
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length);
    for (const t of TOPICS) expect(t.questions.length, t.id).toBeGreaterThan(0);
    const linked = sources('src').flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/(?:See|HelpLink) topic="([\w-]+)"|helpUrl\('([\w-]+)'\)/g)].map((m) => [file, m[1] ?? m[2]]),
    );
    expect(linked.length).toBeGreaterThan(20);
    for (const [file, id] of linked) expect(TOPIC[id], `${file} links to ${id}`).toBeDefined();
  });

  it('answers the questions players ask', () => {
    const first = (q: string) => ask(q)[0]?.id;
    expect(first('How do I short a stock?')).toBe('shorting');
    expect(first('what are futures')).toBe('futures');
    expect(first('how do I trade futures step by step')).toBe('trading-futures');
    expect(first('how do I pay back my loan early')).toBe('repaying');
    expect(first('why is there oil in my lobby')).toBe('expiry');
    expect(first('what is a margin call')).toBe('margin');
    expect(first('how do I buy shares')).toBe('buying');
    expect(first('what is a trailing stop')).toBe('orders');
    expect(first('missed loan payment')).toBe('credit');
    expect(first('how do I win')).toBe('welcome');
    expect(ask('the of and')).toEqual([]);
    expect(ask('xylophone')).toEqual([]);
  });
});
