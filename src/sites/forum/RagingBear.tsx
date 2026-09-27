import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { dayOf, formatDate, formatTime, isTradingDay, previousTradingDay, type GameTime } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { hash } from '../../sim/press';
import type { Rumour } from '../../sim/news';
import { useGame } from '../../state/game';
import { Rng } from '../../world/rng';
import { shortName } from '../company/content';
import { CHATTER, HANDLES, RUMOURS } from '../data/articles';
import { marketStats, top } from '../news/stories';
import { useTable } from '../hooks';
import { write } from '../text';
import { RAGINGBEAR, companyUrl, quoteUrl, sites } from '../urls';
import { Link, Marquee, usePage, useTitle } from '../web';


interface Post {
  time: GameTime;
  handle: string;
  text: string;
}

/** Rumours so far, refetched as news arrives. */
function useRumours(company?: number): Rumour[] {
  const count = useGame((s) => s.snapshot?.news ?? 0);
  const [list, setList] = useState<Rumour[]>([]);
  useEffect(() => {
    let current = true;
    void simulation()
      .rumours(company, 200)
      .then((r) => current && setList(r));
    return () => {
      current = false;
    };
  }, [company, count]);
  return list;
}

/**
 * A board's posts (spec §14): the rumours that really leaked, dressed up as any other post, among the usual chatter —
 * hype, doom, questions and nonsense, a few a day, the same every time the board is read.
 */
function boardPosts(company: number, ticker: string, name: string, rumours: Rumour[], now: GameTime, seed: string, firmName: string): Post[] {
  const posts: Post[] = [];
  const words = { ticker, short: shortName(name) };
  for (const r of rumours) {
    if (r.company !== company || r.where !== 'forum' || r.time > now) continue;
    if (r.kind === 'mod') {
      // A bot farm caught (spec §14A): the moderators name who paid for it.
      posts.push({ time: r.time, handle: 'MODERATOR', text: `NOTICE: we have removed ${ticker} posts from a network of fake accounts, paid for by ${firmName}. Their accounts are banned. Please report suspicious posts.` });
      continue;
    }
    const rng = Rng.stream(seed, `rumour:${company}:${r.time}`);
    const lines = RUMOURS[r.kind] ?? (r.direction > 0 ? RUMOURS.default : RUMOURS.bad);
    posts.push({ time: r.time, handle: rng.pick(HANDLES), text: write(rng.pick(lines), words, rng) });
  }
  let day = dayOf(now);
  for (let k = 0; k < 10; k++, day = previousTradingDay(day)) {
    if (!isTradingDay(day)) continue;
    const rng = Rng.stream(seed, `board:${company}:${day}`);
    const count = hash(company, day) % 3;
    for (let n = 0; n < count; n++) {
      const time = day * 1440 + rng.int(7 * 60, 23 * 60);
      if (time > now) continue;
      const mood = (['hype', 'hype', 'fud', 'question', 'nonsense'] as const)[rng.int(0, 4)];
      posts.push({ time, handle: rng.pick(HANDLES), text: write(rng.pick(CHATTER[mood]), words, rng) });
    }
  }
  return posts.sort((a, b) => b.time - a.time);
}

/** Raging Bear (spec §14): per-ticker message boards of rumours, hype, the occasional real signal and pump-and-dumps. */
export default function RagingBear({ url }: { url: URL }) {
  const directory = useGame((s) => s.directory);
  const firmName = useGame((s) => s.firmName);
  const seed = useGame((s) => s.seed);
  const now = useGame((s) => s.snapshot?.time ?? 0);
  const page = usePage();
  const [q, setQ] = useState('');
  const symbol = (url.searchParams.get('s') ?? '').toUpperCase();
  const company = url.pathname === '/board' ? directory.tickers.indexOf(symbol) : -1;
  const rumours = useRumours(company >= 0 ? company : undefined);
  const table = useTable();
  const posts = useMemo(
    () => (company >= 0 ? boardPosts(company, directory.tickers[company], directory.names[company], rumours, now, seed, firmName) : []),
    [company, rumours, Math.floor(now / 30)],
  );
  const hot = useMemo(() => {
    const seen = new Set<number>();
    for (const r of rumours) if (r.where === 'forum' && r.time <= now && !seen.has(r.company)) seen.add(r.company);
    return [...seen].slice(0, 12);
  }, [rumours]);
  const active = useMemo(() => {
    if (!table) return [];
    const stats = marketStats(table);
    return top(stats, (i) => (table.status[i] ? NaN : Math.abs(stats.pct[i])), 50e6, 8);
  }, [table]);
  useTitle(company >= 0 ? `${symbol} message board — Raging Bear` : 'Raging Bear Message Boards');
  const go = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) page.navigate(`http://${RAGINGBEAR}/board?s=${encodeURIComponent(q.trim().toUpperCase())}`);
  };
  const board = (i: number) => `http://${RAGINGBEAR}/board?s=${directory.tickers[i]}`;
  return (
    <div className="site-ragingbear">
      <div className="rb-masthead">
        <Link href={`http://${RAGINGBEAR}/`}>RAGING BEAR</Link>
        <span>Where investors talk. Loudly.</span>
      </div>
      <Marquee speed={20}>Remember: posts are the opinions of their authors. Most of them are wrong. Some of them are lying.</Marquee>
      <form className="rb-search" onSubmit={go}>
        Go to board: <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="TICKER" size={8} /> <button type="submit">Go</button>
      </form>
      {url.pathname === '/board' ? (
        company < 0 ? (
          <p>No board for “{symbol}”. Check the ticker.</p>
        ) : (
          <>
            <h2>
              {directory.names[company]} ({directory.tickers[company]}) message board
            </h2>
            <p>
              <Link href={quoteUrl(directory.tickers[company])}>Quote</Link> ·{' '}
              <Link href={companyUrl(sites(directory, firmName), company)}>Company web site</Link> · {posts.length} recent posts
            </p>
            <table className="rb-posts">
              <tbody>
                {posts.map((p, k) => (
                  <tr key={k}>
                    <td className="rb-meta">
                      <b>{p.handle}</b>
                      <br />
                      {formatDate(dayOf(p.time))} {formatTime(p.time)}
                    </td>
                    <td>{p.text}</td>
                  </tr>
                ))}
                {!posts.length && (
                  <tr>
                    <td colSpan={2}>Nobody has posted here lately. Be the first! (Posting is disabled for maintenance.)</td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )
      ) : (
        <div className="rb-front">
          <div>
            <h3>Hot Boards</h3>
            <ul>
              {hot.map((i) => (
                <li key={i}>
                  <Link href={board(i)}>{directory.tickers[i]}</Link> — {directory.names[i]}
                </li>
              ))}
              {!hot.length && <li>It’s quiet. Too quiet.</li>}
            </ul>
          </div>
          <div>
            <h3>Most Active</h3>
            <ul>
              {active.map((i) => (
                <li key={i}>
                  <Link href={board(i)}>{directory.tickers[i]}</Link> — {directory.names[i]}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
