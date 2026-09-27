import { START_DAY, gameYear } from '../../sim/calendar';
import { useMemo, useState } from 'react';
import { count, signedPct, tone } from '../../apps/format';
import { searchCompanies } from '../../apps/trade/SymbolSearch';
import type { Directory } from '../../sim/types';
import { useGame } from '../../state/game';
import { INDUSTRIES } from '../../world/industries';
import { OUTLETS } from '../../sim/data/outlets';
import { headlineOf } from '../news/articles';
import { useNews } from '../news/data';
import { HAZARDS } from '../../sim/data/commodities';
import { useOutlooks } from '../hooks';
import { useStories } from '../news/NewsSites';
import {
  BANK, BARRENS, EQUIFACTS, EXCHANGE, FED, NEWSWIRE, OPEK, QUOTEZONE, RAGINGBEAR, SOB, TUCATS, WEATHER, YEEHAW, companyUrl, firmUrl, helpUrl, playerUrl, quoteUrl, storyUrl,
  searchUrl, sites,
} from '../urls';
import { Link, usePage, useTitle } from '../web';

/** Yeehaw! (spec §14): the home portal with search, a directory by industry, headlines and a market summary. */
export default function Yeehaw({ url }: { url: URL }) {
  const page = url.pathname.split('/').filter(Boolean);
  return (
    <div className="site-yeehaw">
      <div className="yh-header">
        <Link href={`http://${YEEHAW}/`} className="yh-logo">
          Yeehaw!
        </Link>
        <SearchBox initial={url.searchParams.get('q') ?? ''} />
      </div>
      {page[0] === 'search' ? (
        <Results query={url.searchParams.get('q') ?? ''} from={Number(url.searchParams.get('from') ?? 0)} />
      ) : page[0] === 'dir' ? (
        <Category id={page[1] ?? ''} from={Number(url.searchParams.get('from') ?? 0)} />
      ) : (
        <Front />
      )}
      <p className="yh-footer">
        Copyright © {gameYear(START_DAY)} Yeehaw! Inc. All rights reserved. <Link href={`http://${YEEHAW}/`}>Add URL</Link> · <Link href={`http://${YEEHAW}/`}>Help</Link>
      </p>
    </div>
  );
}

function SearchBox({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const { navigate } = usePage();
  return (
    <form
      className="yh-search"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(searchUrl(text));
      }}
    >
      <input type="text" size={32} value={text} onChange={(e) => setText(e.target.value)} /> <button type="submit">Search</button>{' '}
      <small>options</small>
    </form>
  );
}

/** Industries by name, with how many companies each lists. */
function useCategories(directory: Directory) {
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const name of directory.industries) counts.set(name, (counts.get(name) ?? 0) + 1);
    return INDUSTRIES.filter((x) => counts.has(x.name)).map((x) => ({ id: x.id, name: x.name, count: counts.get(x.name)! }));
  }, [directory]);
}

function Front() {
  useTitle('Yeehaw!');
  const directory = useGame((s) => s.directory);
  const snapshot = useGame((s) => s.snapshot);
  const categories = useCategories(directory);
  const headlines = useStories().daily;
  const news = useNews({ minCap: 10e9, limit: 4 });
  const { firmName, seed } = useGame.getState();
  const columns = [0, 1, 2].map((k) => categories.filter((_, i) => i % 3 === k));
  return (
    <div className="yh-front">
      <div className="yh-directory">
        <table cellPadding={4}>
          <tbody>
            <tr>
              {columns.map((col, k) => (
                <td key={k}>
                  {col.map((c) => (
                    <p key={c.id}>
                      <Link href={`/dir/${c.id}`}>
                        <b>{c.name}</b>
                      </Link>{' '}
                      <small>({count(c.count)})</small>
                    </p>
                  ))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="yh-side">
        <div className="yh-box">
          <b>Market Summary</b>
          {snapshot && (
            <p>
              <Link href={`http://${QUOTEZONE}/`}>MAJOR 500</Link> {snapshot.index.last.toFixed(2)}{' '}
              <span className={tone(snapshot.index.change)}>{signedPct(snapshot.index.pct)}</span>
            </p>
          )}
          <SymbolForm />
        </div>
        <div className="yh-box">
          <b>In the News</b>
          <ul>
            {headlines.slice(0, 2).map((s) => (
              <li key={s.id}>
                <Link href={`http://${NEWSWIRE}/story?id=${s.id}`}>{s.headline}</Link>
              </li>
            ))}
            {news?.map((n) => (
              <li key={n.id}>
                <Link href={storyUrl(n)}>{headlineOf(n, directory, firmName, seed)}</Link>
              </li>
            ))}
          </ul>
          <p>
            {OUTLETS.map((o, k) => (
              <span key={o.id}>
                {k > 0 && ' · '}
                <Link href={`http://${o.host}/`}>{o.name}</Link>
              </span>
            ))}{' '}
            · <Link href={`http://${RAGINGBEAR}/`}>Raging Bear boards</Link> · <Link href={`http://${TUCATS}/`}>Tucats Downloads</Link>
          </p>
        </div>
        <div className="yh-box">
          <b>New to investing?</b>
          <p>
            <Link href={helpUrl()}>Ask Reeves!</Link> The butler explains <Link href={helpUrl('stocks')}>stocks</Link>,{' '}
            <Link href={helpUrl('margin')}>margin</Link>, <Link href={helpUrl('futures')}>futures</Link> and{' '}
            <Link href={helpUrl('loans')}>loans</Link>.
          </p>
        </div>
        <WeatherTeaser />
        <div className="yh-box">
          <b>Money &amp; Markets</b>
          <p>
            <Link href={`http://${EXCHANGE}/`}>Futures</Link> · <Link href={`http://${FED}/`}>Interest rates</Link> ·{' '}
            <Link href={`http://${OPEK}/`}>Oil</Link> · <Link href={`http://${BANK}/`}>Business loans</Link> ·{' '}
            <Link href={`http://${EQUIFACTS}/`}>Your credit score</Link> · <Link href={`http://${SOB}/`}>Securities regulator</Link> ·{' '}
            <Link href={`http://${BARRENS}/league`}>Fund league table</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

/** The weather teaser (spec §14): whatever the National Weather Bureau is warning about, else fair skies. */
function WeatherTeaser() {
  const warnings = useOutlooks()?.filter((o) => o.source === 'weather' && !o.done) ?? [];
  return (
    <div className="yh-box">
      <b>Weather</b>
      {warnings.length ? (
        <ul>
          {warnings.slice(0, 3).map((o) => {
            const h = HAZARDS.find((x) => x.id === o.kind);
            return (
              <li key={o.id}>
                <Link href={`http://${WEATHER}/`}>
                  {h?.warning ?? 'Warning'} for {h?.region ?? 'the region'}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>
          No severe weather expected. <Link href={`http://${WEATHER}/`}>National forecast</Link>
        </p>
      )}
    </div>
  );
}

function SymbolForm() {
  const [text, setText] = useState('');
  const { navigate } = usePage();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) navigate(quoteUrl(text.trim().toUpperCase()));
      }}
    >
      Quotes: <input type="text" size={6} value={text} onChange={(e) => setText(e.target.value)} /> <button type="submit">Go</button>
    </form>
  );
}

const PAGE_SIZE = 20;

interface Result {
  title: string;
  url: string;
  text: string;
}

/** Search results: industries, firms, then companies by ticker and name, twenty to a page. */
function Results({ query, from }: { query: string; from: number }) {
  useTitle(`Yeehaw! Search Results — ${query}`);
  const directory = useGame((s) => s.directory);
  const firmName = useGame((s) => s.firmName);
  const categories = useCategories(directory);
  const results = useMemo((): Result[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const s = sites(directory, firmName);
    const industries = categories
      .filter((c) => c.name.toLowerCase().includes(q))
      .map((c) => ({ title: `Business and Economy: ${c.name}`, url: `http://${YEEHAW}/dir/${c.id}`, text: `${count(c.count)} listed companies` }));
    const firms = directory.firms.flatMap((f, i) =>
      f.name.toLowerCase().includes(q) ? [{ title: f.name, url: firmUrl(s, i), text: 'Investment management firm' }] : [],
    );
    if (firmName.toLowerCase().includes(q)) firms.unshift({ title: firmName, url: playerUrl(s), text: 'Investment management firm' });
    const companies = searchCompanies(directory, query, Infinity).map((i) => ({
      title: directory.names[i],
      url: companyUrl(s, i),
      text: `${directory.industries[i]} company. Symbol: ${directory.tickers[i]}`,
    }));
    return [...industries, ...firms, ...companies];
  }, [directory, firmName, categories, query]);
  return (
    <div className="yh-results">
      {results.length ? (
        <p>
          Found <b>{count(results.length)}</b> matches for <b>{query}</b>. Showing {from + 1}–{Math.min(results.length, from + PAGE_SIZE)}.
        </p>
      ) : (
        <p>Sorry, no matches were found containing <b>{query}</b>. Try a company name, ticker symbol, industry or firm.</p>
      )}
      <ol start={from + 1}>
        {results.slice(from, from + PAGE_SIZE).map((r) => (
          <li key={r.url}>
            <Link href={r.url}>{r.title}</Link> — {r.text}
            <br />
            <span className="yh-url">{r.url}</span>
          </li>
        ))}
      </ol>
      <Pager total={results.length} from={from} href={(k) => `${searchUrl(query)}&from=${k}`} />
    </div>
  );
}

function Pager({ total, from, href }: { total: number; from: number; href(from: number): string }) {
  return (
    <p className="yh-pager">
      {from > 0 && <Link href={href(Math.max(0, from - PAGE_SIZE))}>&lt;&lt; Previous {PAGE_SIZE}</Link>}{' '}
      {from + PAGE_SIZE < total && <Link href={href(from + PAGE_SIZE)}>Next {PAGE_SIZE} &gt;&gt;</Link>}
    </p>
  );
}

/** A directory category: the industry's companies A–Z. */
function Category({ id, from }: { id: string; from: number }) {
  const industry = INDUSTRIES.find((x) => x.id === id);
  useTitle(`Yeehaw! — ${industry?.name ?? 'Directory'}`);
  const directory = useGame((s) => s.directory);
  const firmName = useGame((s) => s.firmName);
  const ids = useMemo(
    () =>
      directory.industries
        .flatMap((name, i) => (name === industry?.name ? [i] : []))
        .sort((a, b) => directory.names[a].localeCompare(directory.names[b])),
    [directory, industry],
  );
  if (!industry) return <p>That category does not exist. <Link href="/">Back to Yeehaw!</Link></p>;
  const s = sites(directory, firmName);
  return (
    <div className="yh-results">
      <p className="yh-crumbs">
        <Link href="/">Top</Link> : Business and Economy : <b>{industry.name}</b>
      </p>
      <p>
        {count(ids.length)} companies · Sub-categories: {industry.subIndustries.join(', ')}
      </p>
      <ul>
        {ids.slice(from, from + PAGE_SIZE).map((i) => (
          <li key={i}>
            <Link href={companyUrl(s, i)}>{directory.names[i]}</Link> — <Link href={quoteUrl(directory.tickers[i])}>{directory.tickers[i]}</Link>
          </li>
        ))}
      </ul>
      <Pager total={ids.length} from={from} href={(k) => `/dir/${id}?from=${k}`} />
    </div>
  );
}
