import { formatDate } from '../../sim/calendar';
import type { Directory, MarketTable, Quote } from '../../sim/types';
import { INDUSTRIES } from '../../world/industries';
import { Rng } from '../../world/rng';

/**
 * Market news written from the market itself (spec §14): the day's wrap, its big movers, earnings and sectors, and
 * the week for Barren's. Journalists, events and a searchable archive arrive with Phase 6; until then stories
 * describe the latest session and are rewritten as it goes.
 */
export interface Story {
  /** Stable while the story is current: kind and day, plus the company it is about. */
  id: string;
  kind: 'wrap' | 'gainer' | 'loser' | 'earnings' | 'sector' | 'week' | 'picks';
  day: number;
  headline: string;
  /** Paragraphs; `{c:123}` marks a company mention, rendered as its name and linked ticker. */
  paragraphs: string[];
  /** The company the story is about, or -1 for the MAJOR 500. */
  subject: number;
}

export interface Sector {
  sector: number;
  name: string;
  /** Cap-weighted change. */
  pct: number;
  cap: number;
  count: number;
}

/** Per-company change and market cap, and cap-weighted sector changes. */
export function marketStats(t: MarketTable) {
  const n = t.last.length;
  const pct = new Float64Array(n);
  const cap = new Float64Array(n);
  const sums = INDUSTRIES.map((_, sector) => ({ sector, name: INDUSTRIES[sector].name, pct: 0, cap: 0, count: 0 }));
  let up = 0;
  let down = 0;
  for (let i = 0; i < n; i++) {
    pct[i] = t.last[i] / t.prevClose[i] - 1;
    cap[i] = t.last[i] * t.shares[i];
    const s = sums[t.sector[i]];
    s.pct += pct[i] * cap[i];
    s.cap += cap[i];
    s.count++;
    if (pct[i] > 1e-9) up++;
    else if (pct[i] < -1e-9) down++;
  }
  const sectors: Sector[] = sums.filter((s) => s.count).map((s) => ({ ...s, pct: s.pct / s.cap }));
  return { pct, cap, sectors, up, down };
}

export type MarketStats = ReturnType<typeof marketStats>;

/** Companies worth at least `minCap`, ordered by `key`, best first. */
export function top(stats: MarketStats, key: (i: number) => number, minCap: number, count: number): number[] {
  const ids: number[] = [];
  for (let i = 0; i < stats.cap.length; i++) if (stats.cap[i] >= minCap && Number.isFinite(key(i))) ids.push(i);
  return ids.sort((a, b) => key(b) - key(a)).slice(0, count);
}

const pc = (v: number) => `${(Math.abs(v) * 100).toFixed(1)}%`;
const level = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface Session {
  /** The latest session: today once it has opened, otherwise the last one. */
  day: number;
  open: boolean;
  index: Quote;
}

/** The stories of the latest session, most important first. */
export function dailyStories(t: MarketTable, stats: MarketStats, directory: Directory, seed: string, session: Session): Story[] {
  const { day, open, index } = session;
  const rng = Rng.stream(seed, `news:${day}`);
  const date = formatDate(day);
  const stories: Story[] = [];
  const up = index.pct >= 0;
  const sectors = [...stats.sectors].sort((a, b) => b.pct - a.pct);
  const best = sectors[0];
  const worst = sectors.at(-1)!;
  const bigUp = top(stats, (i) => stats.pct[i], 10e9, 1)[0];
  const bigDown = top(stats, (i) => -stats.pct[i], 10e9, 1)[0];
  const verb = Math.abs(index.pct) < 0.001 ? 'Is Flat' : up ? rng.pick(['Rises', 'Climbs', 'Gains', 'Advances']) : rng.pick(['Falls', 'Slips', 'Drops', 'Retreats']);
  stories.push({
    id: `wrap-${day}`,
    kind: 'wrap',
    day,
    subject: -1,
    headline: `MAJOR 500 ${verb}${Math.abs(index.pct) < 0.001 ? '' : ` ${pc(index.pct)}`}${open ? ' in Busy Trading' : ` to Close at ${level(index.last)}`}`,
    paragraphs: [
      `The MAJOR 500 ${open ? 'stood at' : 'closed at'} ${level(index.last)} on ${date}, ${up ? 'up' : 'down'} ${level(Math.abs(index.change))} points or ${pc(index.pct)}. Advancing issues ${stats.up >= stats.down ? 'outnumbered' : 'trailed'} decliners ${stats.up.toLocaleString('en-US')} to ${stats.down.toLocaleString('en-US')}.`,
      `${best.name} led the market, ${best.pct >= 0 ? 'rising' : 'slipping only'} ${pc(best.pct)}, while ${worst.name} lagged, ${worst.pct < 0 ? 'falling' : 'adding just'} ${pc(worst.pct)}.`,
      bigUp !== undefined && bigDown !== undefined
        ? `Among the largest companies, {c:${bigUp}} ${stats.pct[bigUp] >= 0 ? 'gained' : 'lost'} ${pc(stats.pct[bigUp])} and {c:${bigDown}} ${stats.pct[bigDown] < 0 ? 'lost' : 'gained'} ${pc(stats.pct[bigDown])}.`
        : '',
      rng.pick([
        'Traders said volume was heavy.',
        '“It was a stock picker’s market,” one floor trader said.',
        'Analysts said investors were waiting for the next round of earnings.',
        'Brokers reported brisk business from retail investors trading online.',
      ]),
    ].filter(Boolean),
  });

  const reported = (i: number) => t.reported[i] === day;
  const mover = (i: number, kind: 'gainer' | 'loser') => {
    const gain = kind === 'gainer';
    const name = directory.names[i];
    const verbs = gain ? ['Soars', 'Jumps', 'Surges', 'Rockets'] : ['Plunges', 'Tumbles', 'Sinks', 'Slides'];
    const cause = reported(i)
      ? `after the company reported quarterly results that ${gain ? 'beat' : 'fell short of'} Wall Street’s expectations`
      : gain
        ? 'on heavy buying, though the company declined to comment'
        : 'on heavy selling; a spokesperson said the company does not comment on market rumours';
    stories.push({
      id: `${kind}-${day}-${i}`,
      kind,
      day,
      subject: i,
      headline: `${name} ${rng.pick(verbs)} ${pc(stats.pct[i])}`,
      paragraphs: [
        `Shares of {c:${i}} ${gain ? 'rose' : 'fell'} ${pc(stats.pct[i])} to $${t.last[i].toFixed(2)} ${open ? 'in trading' : 'at the close'} on ${date}, ${cause}.`,
        `The ${directory.industries[i].toLowerCase()} company is now worth ${bigMoney(stats.cap[i])}. ${stats.pct[i] * (index.pct || 1) < 0 ? 'The move bucked the wider market.' : 'The wider market moved the same way.'}`,
      ],
    });
  };
  const gainer = top(stats, (i) => stats.pct[i], 1e9, 1)[0];
  const loser = top(stats, (i) => -stats.pct[i], 1e9, 1)[0];
  if (gainer !== undefined && stats.pct[gainer] > 0) mover(gainer, 'gainer');
  if (loser !== undefined && stats.pct[loser] < 0) mover(loser, 'loser');

  const reporters = top(stats, (i) => (reported(i) ? Math.abs(stats.pct[i]) : NaN), 0, 1e9);
  if (reporters.length) {
    const named = top(stats, (i) => (reported(i) ? stats.cap[i] : NaN), 0, 3);
    stories.push({
      id: `earnings-${day}`,
      kind: 'earnings',
      day,
      subject: named[0],
      headline: `${reporters.length.toLocaleString('en-US')} Companies Report Earnings`,
      paragraphs: [
        `${reporters.length.toLocaleString('en-US')} companies released quarterly results before the bell on ${date}.`,
        `The biggest names reporting were ${named.map((i) => `{c:${i}} (${stats.pct[i] >= 0 ? 'up' : 'down'} ${pc(stats.pct[i])})`).join(', ')}.`,
        `The biggest reaction came at {c:${reporters[0]}}, which moved ${pc(stats.pct[reporters[0]])}.`,
      ],
    });
  }

  const leaders = top(stats, (i) => (t.sector[i] === best.sector ? stats.pct[i] : NaN), 300e6, 3);
  stories.push({
    id: `sector-${day}`,
    kind: 'sector',
    day,
    subject: top(stats, (i) => (t.sector[i] === best.sector ? stats.cap[i] : NaN), 0, 1)[0] ?? -1,
    headline: `${best.name} ${best.pct >= 0 ? 'Leads the Market' : 'Holds Up Best'}`,
    paragraphs: [
      `${best.name} shares ${best.pct >= 0 ? 'rose' : 'fell'} ${pc(best.pct)} as a group on ${date}, the best of the market’s ${stats.sectors.length} sectors. ${worst.name} was the worst, ${worst.pct >= 0 ? 'up' : 'down'} ${pc(worst.pct)}.`,
      leaders.length ? `The sector’s leaders were ${leaders.map((i) => `{c:${i}}`).join(', ')}.` : '',
    ].filter(Boolean),
  });
  return stories;
}

/** Barren's Weekly: the week's winners and losers, and a screen of cheap, dividend-paying large caps. */
export function weeklyStories(t: MarketTable, stats: MarketStats): Story[] {
  if (!t.week) return [];
  const { day, close, previous } = t.week;
  const week = (i: number) => close[i] / previous[i] - 1;
  const winners = top(stats, week, 2e9, 5);
  const losers = top(stats, (i) => -week(i), 2e9, 5);
  const pe = (i: number) => (t.income[i] > 0 ? stats.cap[i] / t.income[i] : NaN);
  const picks = top(stats, (i) => (t.dividendYield[i] > 0.01 && pe(i) > 0 ? -pe(i) : NaN), 10e9, 5);
  const list = (ids: number[], value: (i: number) => string) => ids.map((i) => `{c:${i}} ${value(i)}`).join('; ');
  return [
    {
      id: `week-${day}`,
      kind: 'week',
      day,
      subject: winners[0] ?? -1,
      headline: `The Week in Review: Winners and Losers`,
      paragraphs: [
        `Week ended ${formatDate(day)}. The biggest gainers among companies worth $2 billion or more: ${list(winners, (i) => `+${pc(week(i))}`)}.`,
        `The biggest losers: ${list(losers, (i) => `−${pc(week(i))}`)}.`,
      ],
    },
    {
      id: `picks-${day}`,
      kind: 'picks',
      day,
      subject: picks[0] ?? -1,
      headline: `Barren’s Picks: Five Cheap Blue Chips That Pay You to Wait`,
      paragraphs: [
        'Our screen looks for companies worth $10 billion or more that pay a dividend of at least 1% and trade on the lowest earnings multiples in the market.',
        `This week’s list: ${list(picks, (i) => `(P/E ${pe(i).toFixed(1)}, yield ${(t.dividendYield[i] * 100).toFixed(1)}%)`)}.`,
        'As always, cheap stocks can get cheaper. Do your own homework.',
      ],
    },
  ];
}

function bigMoney(v: number): string {
  return v >= 1e12 ? `$${(v / 1e12).toFixed(1)} trillion` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)} billion` : `$${(v / 1e6).toFixed(0)} million`;
}
