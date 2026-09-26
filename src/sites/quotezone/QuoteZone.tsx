import { useMemo, useState } from 'react';
import { bigMoney, count, pct, price, signed, signedPct, tone } from '../../apps/format';
import { searchCompanies } from '../../apps/trade/SymbolSearch';
import { PriceChart } from '../../charts/PriceChart';
import { formatDate } from '../../sim/calendar';
import { INDEX, type MarketTable } from '../../sim/types';
import { useGame } from '../../state/game';
import { INDUSTRIES } from '../../world/industries';
import { useDetails, useTable } from '../hooks';
import { marketStats, top, type MarketStats } from '../news/stories';
import { QUOTEZONE, companyUrl, quoteUrl, sites } from '../urls';
import { Link, usePage, useTitle } from '../web';

/** QuoteZone (spec §14): market data, movers, a sector heat map and a screener lite. */
export default function QuoteZone({ url }: { url: URL }) {
  const table = useTable();
  const stats = useMemo(() => table && marketStats(table), [table]);
  const page = url.pathname.replace(/^\//, '');
  return (
    <div className="site-quotezone">
      <div className="qz-header">
        <Link href={`http://${QUOTEZONE}/`} className="qz-logo">
          Quote<span>Zone</span>
        </Link>
        <QuoteBox />
        <span className="qz-nav">
          <Link href="/">Markets</Link> | <Link href="/sectors">Sector Map</Link> | <Link href="/screener">Screener</Link>
        </span>
      </div>
      {page === 'quote' ? (
        <QuotePage ticker={(url.searchParams.get('s') ?? '').toUpperCase()} />
      ) : !table || !stats ? (
        <p>Loading market data…</p>
      ) : page === 'sectors' ? (
        <Sectors stats={stats} />
      ) : page === 'screener' ? (
        <Screener table={table} stats={stats} params={url.searchParams} />
      ) : (
        <Markets table={table} stats={stats} />
      )}
      <p className="qz-footer">Quotes are real-time. QuoteZone is not responsible for your losses.</p>
    </div>
  );
}

function QuoteBox() {
  const [text, setText] = useState('');
  const { navigate } = usePage();
  return (
    <form
      className="qz-quote-box"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) navigate(quoteUrl(text.trim().toUpperCase()));
      }}
    >
      Symbol: <input type="text" size={8} value={text} onChange={(e) => setText(e.target.value)} /> <button type="submit">Get Quote</button>
    </form>
  );
}

const Change = ({ v, of }: { v: number; of: number }) => (
  <span className={tone(v)}>
    {signed(v, of)} ({signedPct(v / (of - v))})
  </span>
);

function Markets({ table, stats }: { table: MarketTable; stats: MarketStats }) {
  useTitle('QuoteZone — Markets');
  const index = useGame((s) => s.snapshot?.index);
  const lists: [string, number[]][] = [
    ['Top Gainers', top(stats, (i) => stats.pct[i], 50e6, 10)],
    ['Top Losers', top(stats, (i) => -stats.pct[i], 50e6, 10)],
    ['Most Active', top(stats, (i) => table.volume[i] * table.last[i], 0, 10)],
  ];
  return (
    <>
      <table className="qz-summary" cellPadding={4}>
        <tbody>
          <tr>
            <td className="qz-index">
              <b>MAJOR 500</b>
              <br />
              {index && (
                <>
                  <span className="qz-big">{index.last.toFixed(2)}</span> <Change v={index.change} of={index.last} />
                </>
              )}
              <br />
              Advancing: {count(stats.up)} · Declining: {count(stats.down)}
            </td>
            <td className="qz-index-chart">
              <PriceChart id={INDEX} timeframe="1D" type="line" skin="web" />
            </td>
          </tr>
        </tbody>
      </table>
      <div className="qz-movers">
        {lists.map(([title, ids]) => (
          <MoverTable key={title} title={title} ids={ids} table={table} stats={stats} />
        ))}
      </div>
    </>
  );
}

function MoverTable({ title, ids, table, stats }: { title: string; ids: number[]; table: MarketTable; stats: MarketStats }) {
  const { tickers } = useGame.getState().directory;
  return (
    <table className="qz-table" cellPadding={2}>
      <caption>{title}</caption>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Last</th>
          <th>Change</th>
          <th>Volume</th>
        </tr>
      </thead>
      <tbody>
        {ids.map((i) => (
          <tr key={i}>
            <td>
              <Link href={quoteUrl(tickers[i])}>{tickers[i]}</Link>
            </td>
            <td>{price(table.last[i])}</td>
            <td className={tone(stats.pct[i])}>{signedPct(stats.pct[i])}</td>
            <td>{count(table.volume[i])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Heat map: one tile per industry, sized by market value, coloured by its cap-weighted change. */
function Sectors({ stats }: { stats: MarketStats }) {
  useTitle('QuoteZone — Sector Map');
  const total = stats.sectors.reduce((a, s) => a + s.cap, 0);
  const colour = (v: number) => {
    const k = Math.min(1, Math.abs(v) / 0.03);
    return v >= 0 ? `rgb(${Math.round(200 - 170 * k)}, ${Math.round(200 - 60 * k)}, ${Math.round(200 - 170 * k)})` : `rgb(${Math.round(200 + 20 * k)}, ${Math.round(200 - 170 * k)}, ${Math.round(200 - 170 * k)})`;
  };
  return (
    <>
      <h2>Sector Map</h2>
      <p>Each box is an industry, sized by its market value and coloured by today’s change.</p>
      <div className="qz-heatmap">
        {[...stats.sectors]
          .sort((a, b) => b.cap - a.cap)
          .map((s) => (
            <Link
              key={s.sector}
              href={`/screener?industry=${INDUSTRIES[s.sector].id}`}
              className="qz-tile"
              style={{ background: colour(s.pct), flexBasis: Math.max(80, Math.sqrt(s.cap / total) * 700) }}
            >
              <b>{s.name}</b>
              <br />
              {signedPct(s.pct)}
            </Link>
          ))}
      </div>
    </>
  );
}

const PAGE_SIZE = 25;

/** Screener lite: filter by industry, size, P/E and yield; sort by any column (spec §14). */
function Screener({ table, stats, params }: { table: MarketTable; stats: MarketStats; params: URLSearchParams }) {
  useTitle('QuoteZone — Screener');
  const { navigate } = usePage();
  const { tickers, names } = useGame.getState().directory;
  const industry = params.get('industry') ?? '';
  const minCap = Number(params.get('mincap') ?? 0);
  const maxPe = Number(params.get('maxpe') ?? 0);
  const minYield = Number(params.get('minyield') ?? 0);
  const sort = params.get('sort') ?? 'cap';
  const from = Number(params.get('from') ?? 0);
  const sector = INDUSTRIES.findIndex((x) => x.id === industry);
  const pe = (i: number) => (table.income[i] > 0 ? stats.cap[i] / table.income[i] : Infinity);
  const keys: Record<string, (i: number) => number> = {
    cap: (i) => stats.cap[i],
    change: (i) => stats.pct[i],
    pe: (i) => -pe(i),
    yield: (i) => table.dividendYield[i],
  };
  const ids = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < table.last.length; i++) {
      if (table.status[i] || (sector >= 0 && table.sector[i] !== sector)) continue;
      if (stats.cap[i] < minCap * 1e6) continue;
      if (maxPe && !(pe(i) <= maxPe)) continue;
      if (table.dividendYield[i] * 100 < minYield) continue;
      out.push(i);
    }
    const key = keys[sort] ?? keys.cap;
    return out.sort((a, b) => key(b) - key(a));
  }, [table, sector, minCap, maxPe, minYield, sort]);
  const query = (patch: Record<string, string | number>) => {
    const q = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) q.set(k, String(v));
    return `/screener?${q}`;
  };
  return (
    <>
      <h2>Stock Screener</h2>
      <form
        className="qz-screener-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const q = new URLSearchParams();
          for (const [k, v] of form) if (v) q.set(k, String(v));
          navigate(`/screener?${q}`);
        }}
      >
        Industry:{' '}
        <select name="industry" defaultValue={industry}>
          <option value="">(All)</option>
          {INDUSTRIES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>{' '}
        Min. market cap ($M): <input type="text" name="mincap" size={6} defaultValue={minCap || ''} /> Max. P/E:{' '}
        <input type="text" name="maxpe" size={4} defaultValue={maxPe || ''} /> Min. yield (%): <input type="text" name="minyield" size={4} defaultValue={minYield || ''} />{' '}
        <input type="hidden" name="sort" value={sort} />
        <button type="submit">Screen</button>
      </form>
      <p>
        {count(ids.length)} companies match. Showing {ids.length ? from + 1 : 0}–{Math.min(from + PAGE_SIZE, ids.length)}.
      </p>
      <table className="qz-table qz-screen" cellPadding={2}>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Name</th>
            <th>Last</th>
            <th>
              <Link href={query({ sort: 'change', from: 0 })}>Change</Link>
            </th>
            <th>
              <Link href={query({ sort: 'cap', from: 0 })}>Market cap</Link>
            </th>
            <th>
              <Link href={query({ sort: 'pe', from: 0 })}>P/E</Link>
            </th>
            <th>
              <Link href={query({ sort: 'yield', from: 0 })}>Yield</Link>
            </th>
          </tr>
        </thead>
        <tbody>
          {ids.slice(from, from + PAGE_SIZE).map((i) => (
            <tr key={i}>
              <td>
                <Link href={quoteUrl(tickers[i])}>{tickers[i]}</Link>
              </td>
              <td>{names[i]}</td>
              <td>{price(table.last[i])}</td>
              <td className={tone(stats.pct[i])}>{signedPct(stats.pct[i])}</td>
              <td>{bigMoney(stats.cap[i])}</td>
              <td>{Number.isFinite(pe(i)) ? pe(i).toFixed(1) : 'n/a'}</td>
              <td>{table.dividendYield[i] ? pct(table.dividendYield[i], 2) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {from > 0 && <Link href={query({ from: Math.max(0, from - PAGE_SIZE) })}>&lt;&lt; Previous {PAGE_SIZE}</Link>}{' '}
        {from + PAGE_SIZE < ids.length && <Link href={query({ from: from + PAGE_SIZE })}>Next {PAGE_SIZE} &gt;&gt;</Link>}
      </p>
    </>
  );
}

/** One company's quote: chart, statistics and a link to its own site. */
function QuotePage({ ticker }: { ticker: string }) {
  const directory = useGame((s) => s.directory);
  const firmName = useGame((s) => s.firmName);
  const id = directory.tickers.indexOf(ticker);
  useTitle(id >= 0 ? `QuoteZone — ${ticker}` : 'QuoteZone — Symbol Lookup');
  if (id < 0) {
    const matches = searchCompanies(directory, ticker, 20);
    return (
      <>
        <h2>Symbol Lookup</h2>
        <p>“{ticker}” is not a valid symbol. {matches.length ? 'Did you mean:' : 'No matches found.'}</p>
        <ul>
          {matches.map((i) => (
            <li key={i}>
              <Link href={quoteUrl(directory.tickers[i])}>{directory.tickers[i]}</Link> — {directory.names[i]}
            </li>
          ))}
        </ul>
      </>
    );
  }
  return <Quote id={id} site={companyUrl(sites(directory, firmName), id)} />;
}

function Quote({ id, site }: { id: number; site: string }) {
  const { names, tickers, industries } = useGame((s) => s.directory);
  const quote = useGame((s) => s.snapshot?.quotes[id]);
  const d = useDetails(id);
  const rows: [string, string][] =
    quote && d
      ? [
          ['Bid / Ask', `${price(quote.bid)} / ${price(quote.ask)}`],
          ['Open', price(quote.open)],
          ['Day range', `${price(quote.low)} – ${price(quote.high)}`],
          ['Volume', count(quote.volume)],
          ['Market cap', bigMoney(quote.last * d.shares)],
          ['P/E', d.pe === null ? 'n/a' : (quote.last / d.eps).toFixed(1)],
          ['52-week range', `${price(Math.min(d.low52, quote.last))} – ${price(Math.max(d.high52, quote.last))}`],
          ['Next earnings', formatDate(d.nextEarnings)],
        ]
      : [];
  return (
    <>
      <h2>
        {names[id]} ({tickers[id]})
      </h2>
      <p>
        {industries[id]} · <Link href={site}>Company home page</Link>
      </p>
      {quote && (
        <p className="qz-big">
          {price(quote.last)} <Change v={quote.change} of={quote.last} />
        </p>
      )}
      <div className="qz-quote-chart">
        <PriceChart id={id} timeframe="6M" type="line" skin="web" />
      </div>
      <table className="qz-table" cellPadding={2}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
