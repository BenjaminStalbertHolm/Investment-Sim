import { useMemo, useState } from 'react';
import { bigMoney, count, money, pct } from '../../apps/format';
import { START_DAY, dayOf, formatDate, gameYear } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { HINDSIGHT_FEE, HINDSIGHT_LEAD } from '../../sim/data/lifestyle';
import { LISTING } from '../../sim/market';
import { hash } from '../../sim/press';
import type { Company } from '../../world/company';
import { useGame } from '../../state/game';
import { act, SiteFrame, type Look } from '../frame';
import { companyOf, useLifestyle, useTable } from '../hooks';
import { useNews } from '../news/data';
import { HINDSIGHT, MOODY, STANDARD_POURS, quoteUrl, storyUrl } from '../urls';
import { Link, usePage, useTitle } from '../web';

/** The agencies' scales, strongest first; the last step is default. BBB− and Baa3 are the lowest investment grades. */
const SCALES = {
  pours: ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'BB-', 'B+', 'B', 'B-', 'CCC+', 'CCC', 'CCC-', 'CC', 'C', 'D'],
  moody: ['Aaa', 'Aa1', 'Aa2', 'Aa3', 'A1', 'A2', 'A3', 'Baa1', 'Baa2', 'Baa3', 'Ba1', 'Ba2', 'Ba3', 'B1', 'B2', 'B3', 'Caa1', 'Caa2', 'Caa3', 'Ca', 'C', 'C'],
} as const;
type Agency = keyof typeof SCALES;
export const INVESTMENT_GRADE = 9;
const DEFAULT = 21;

/**
 * A company's credit rating (spec §14.2), a step on the 22-step scale (0 = AAA): its standing at the start — earnings
 * quality, size and debt — moved by the notches the agencies' upgrades and downgrades have added since. A bankrupt company
 * is in default. Moody Blues sometimes sees it a notch differently.
 */
export function gradeOf(c: Company, notch: number, status: number, agency: Agency = 'pours'): number {
  if (status === LISTING.bankrupt) return DEFAULT;
  const size = Math.min(1, Math.max(0, (Math.log10(c.marketCap) - 7) / 5.5));
  const strength = 0.45 * c.quality + 0.35 * size + 0.2 * (1 - Math.min(1, c.leverage / 3.1));
  const split = agency === 'moody' ? (hash(c.genome, 'moody') % 5) - 2 : 0;
  // The strongest few companies are AAA; a typical mid cap sits at the investment-grade line.
  return Math.max(0, Math.min(DEFAULT - 1, Math.round((0.92 - strength) * 25) + notch + (Math.abs(split) === 2 ? Math.sign(split) : 0)));
}

const AGENCIES: Record<Agency, { host: string; name: string; look: Look; motto: string; founded: number }> = {
  pours: {
    host: STANDARD_POURS, name: 'Standard & Pours', motto: 'Ratings, Indices and the Occasional Drink',
    look: { head: '#b3001b', ink: '#fff', accent: '#b3001b', page: '#fff', font: 'Arial, Helvetica, sans-serif' }, founded: 1860,
  },
  moody: {
    host: MOODY, name: 'Moody Blues Ratings', motto: 'Nights in White Spreadsheets',
    look: { head: '#0d2b5c', ink: '#cfe0ff', accent: '#2d5fa8', page: '#f3f6fb', font: 'Georgia, "Times New Roman", serif' }, founded: 1909,
  },
};

interface Rated {
  id: number;
  grade: number;
  cap: number;
}

/** Every company's rating, strongest first. */
function useRatings(agency: Agency): Rated[] | undefined {
  const directory = useGame((s) => s.directory);
  const table = useTable();
  return useMemo(() => {
    if (!table) return undefined;
    return directory.genomes
      .map((g, id) => {
        const c = companyOf(g);
        return { id, grade: gradeOf(c, table.rating[id] ?? 0, table.status[id], agency), cap: (table.last[id] ?? c.price) * (table.shares[id] ?? 0), status: table.status[id] };
      })
      .filter((r) => r.status !== LISTING.acquired)
      .sort((a, b) => a.grade - b.grade || b.cap - a.cap);
  }, [directory, table, agency]);
}

/** Standard & Pours and Moody Blues Ratings (spec §14.2): every company's rating, its rationale, and rating actions. */
export function RatingAgency({ url, agency }: { url: URL; agency: Agency }) {
  const a = AGENCIES[agency];
  const page = url.pathname.replace(/^\//, '');
  const ticker = url.searchParams.get('s')?.toUpperCase();
  return (
    <SiteFrame
      home={a.host}
      logo={a.name}
      tagline={a.motto}
      look={a.look}
      nav={[[`http://${a.host}/`, 'Rating Actions'], [`http://${a.host}/list`, 'All Ratings'], [`http://${a.host}/scale`, 'What Ratings Mean']]}
      footer={`${a.name} is a division of absolutely nobody you have heard of. Established ${a.founded}. © ${gameYear(START_DAY)}. Ratings are opinions, not advice, and certainly not guarantees.`}
    >
      {page === 'rating' && ticker ? <Report agency={agency} ticker={ticker} /> : page === 'list' ? <List agency={agency} grade={Number(url.searchParams.get('g') ?? -1)} from={Number(url.searchParams.get('from') ?? 0)} /> : page === 'scale' ? <Scale agency={agency} /> : <Actions agency={agency} />}
    </SiteFrame>
  );
}

function Lookup({ agency }: { agency: Agency }) {
  const [text, setText] = useState('');
  const { navigate } = usePage();
  return (
    <form
      className="frame-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) navigate(`http://${AGENCIES[agency].host}/rating?s=${encodeURIComponent(text.trim().toUpperCase())}`);
      }}
    >
      Look up a rating by symbol: <input size={6} value={text} onChange={(e) => setText(e.target.value)} /> <button type="submit">Find</button>
    </form>
  );
}

function Actions({ agency }: { agency: Agency }) {
  const a = AGENCIES[agency];
  useTitle(`${a.name} — Rating Actions`);
  const directory = useGame((s) => s.directory);
  const actions = useNews({ kinds: ['upgrade', 'downgrade', 'bankruptcy'], limit: 25 });
  const ratings = useRatings(agency);
  const bands = useMemo(() => {
    const out = new Map<string, number>();
    for (const r of ratings ?? []) {
      const band = SCALES[agency][r.grade].replace(/[+\-123]$/, '');
      out.set(band, (out.get(band) ?? 0) + 1);
    }
    return [...out];
  }, [ratings, agency]);
  return (
    <>
      <Lookup agency={agency} />
      <h2>Recent Rating Actions</h2>
      {actions?.length ? (
        <table className="frame-table" cellPadding={3}>
          <tbody>
            {actions.map((n) => (
              <tr key={n.id}>
                <td>{formatDate(dayOf(n.time))}</td>
                <td className={n.kind === 'upgrade' ? 'up' : 'down'}>{n.kind === 'upgrade' ? 'UPGRADE' : n.kind === 'downgrade' ? 'DOWNGRADE' : 'DEFAULT'}</td>
                <td>
                  <Link href={`/rating?s=${directory.tickers[n.company]}`}>{directory.names[n.company]}</Link>
                </td>
                <td>
                  <Link href={storyUrl(n)}>News</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No rating actions yet this year. Our analysts are at lunch.</p>
      )}
      <h3>Ratings outstanding</h3>
      <p>
        {bands.map(([band, n], k) => (
          <span key={band}>
            {k > 0 && ' · '}
            <b>{band}</b> {count(n)}
          </span>
        ))}
      </p>
      <p className="hint">
        An upgrade or a downgrade moves a rating a notch, or two when the news is big. A company rated below{' '}
        {SCALES[agency][INVESTMENT_GRADE]} is speculative grade, which is the polite word for junk.
      </p>
    </>
  );
}

const PAGE = 50;

function List({ agency, grade, from }: { agency: Agency; grade: number; from: number }) {
  const a = AGENCIES[agency];
  useTitle(`${a.name} — All Ratings`);
  const directory = useGame((s) => s.directory);
  const all = useRatings(agency);
  const shown = (all ?? []).filter((r) => grade < 0 || r.grade === grade);
  const scale = SCALES[agency];
  return (
    <>
      <p>
        {scale.slice(0, DEFAULT).map((g, k) =>
          agency === 'moody' && k === DEFAULT - 1 ? null : (
            <span key={g}>
              <Link href={`/list?g=${k}`}>{g}</Link>{' '}
            </span>
          ),
        )}
        <Link href={`/list?g=${DEFAULT}`}>{scale[DEFAULT]}</Link> · <Link href="/list">All</Link>
      </p>
      {!all ? (
        <p>Loading…</p>
      ) : (
        <>
          <p>
            {count(shown.length)} companies{grade >= 0 ? ` rated ${scale[grade]}` : ''}, largest first within each rating. Showing {Math.min(shown.length, from + 1)}–
            {Math.min(shown.length, from + PAGE)}.
          </p>
          <table className="frame-table" cellPadding={3}>
            <thead>
              <tr>
                <th>Company</th>
                <th>Symbol</th>
                <th>Rating</th>
                <th className="right">Market value</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(from, from + PAGE).map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/rating?s=${directory.tickers[r.id]}`}>{directory.names[r.id]}</Link>
                  </td>
                  <td>{directory.tickers[r.id]}</td>
                  <td className={r.grade > INVESTMENT_GRADE ? 'down' : ''}>
                    <b>{scale[r.grade]}</b>
                  </td>
                  <td className="right">{bigMoney(r.cap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            {from > 0 && <Link href={`/list?${grade >= 0 ? `g=${grade}&` : ''}from=${Math.max(0, from - PAGE)}`}>« Previous</Link>}{' '}
            {from + PAGE < shown.length && <Link href={`/list?${grade >= 0 ? `g=${grade}&` : ''}from=${from + PAGE}`}>Next »</Link>}
          </p>
        </>
      )}
    </>
  );
}

const words = (v: number, [low, mid, high]: [string, string, string]) => (v < 0.34 ? low : v < 0.67 ? mid : high);

function Report({ agency, ticker }: { agency: Agency; ticker: string }) {
  const a = AGENCIES[agency];
  const directory = useGame((s) => s.directory);
  const table = useTable();
  const id = directory.tickers.indexOf(ticker);
  useTitle(`${a.name} — ${id < 0 ? 'Not rated' : directory.names[id]}`);
  const history = useNews(id < 0 ? undefined : { company: id, kinds: ['upgrade', 'downgrade', 'bankruptcy', 'ipo'], limit: 20 });
  if (id < 0) return <p>We do not rate a company with the symbol {ticker}. <Lookup agency={agency} /></p>;
  if (!table) return <p>Loading…</p>;
  const c = companyOf(directory.genomes[id]);
  const grade = gradeOf(c, table.rating[id] ?? 0, table.status[id], agency);
  const notch = table.rating[id] ?? 0;
  return (
    <>
      <h2>
        {c.name} <small>({ticker})</small>
      </h2>
      <div className="rating-box">
        <span className={`rating-grade ${grade > INVESTMENT_GRADE ? 'junk' : ''}`}>{SCALES[agency][grade]}</span>
        <span>
          {grade === DEFAULT ? 'In default' : grade > INVESTMENT_GRADE ? 'Speculative grade' : 'Investment grade'}
          <br />
          Outlook: <b>{notch > 0 ? 'Negative' : notch < 0 ? 'Positive' : 'Stable'}</b>
        </span>
      </div>
      <h3>Rationale</h3>
      <ul>
        <li>{words(c.quality, ['Earnings have been erratic and disclosure patchy.', 'Earnings are adequate and governance unremarkable.', 'Earnings are dependable and governance strong.'])}</li>
        <li>
          Debt is {c.leverage.toFixed(1)} times equity:{' '}
          {words(c.leverage / 3.1, ['conservative.', 'manageable, if the cycle cooperates.', 'heavy, and the interest bill heavier.'])}
        </li>
        <li>A {c.subIndustry.toLowerCase()} company with a market value of {bigMoney(table.last[id] * table.shares[id])} at the last trade.</li>
        {notch !== 0 && <li>Rating actions since the start of the year have moved it {Math.abs(notch)} notch{Math.abs(notch) === 1 ? '' : 'es'} {notch > 0 ? 'down' : 'up'}.</li>}
      </ul>
      <h3>History</h3>
      {history?.length ? (
        <ul>
          {history.map((n) => (
            <li key={n.id}>
              {formatDate(dayOf(n.time))}: <Link href={storyUrl(n)}>{n.kind === 'ipo' ? 'First rated at its listing' : n.kind === 'upgrade' ? 'Upgraded' : n.kind === 'downgrade' ? 'Downgraded' : 'Defaulted'}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>No rating actions on file.</p>
      )}
      <p>
        <Link href={quoteUrl(ticker)}>Quote on QuoteZone »</Link>
      </p>
    </>
  );
}

function Scale({ agency }: { agency: Agency }) {
  const a = AGENCIES[agency];
  useTitle(`${a.name} — What Ratings Mean`);
  const scale = SCALES[agency];
  return (
    <>
      <h2>What our ratings mean</h2>
      <p>
        A credit rating is our opinion of how likely a company is to pay its debts. We look at how dependable its earnings are,
        how big it is and how much it owes. When the news changes our mind, we move the rating a notch, or two, and the market
        usually moves with it.
      </p>
      <table className="frame-table" cellPadding={3}>
        <tbody>
          <tr><th>{scale[0]}</th><td>Extremely strong. A handful of companies, and they know it.</td></tr>
          <tr><th>{scale[1]}–{scale[3]}</th><td>Very strong.</td></tr>
          <tr><th>{scale[4]}–{scale[6]}</th><td>Strong, though more exposed to bad times.</td></tr>
          <tr><th>{scale[7]}–{scale[INVESTMENT_GRADE]}</th><td>Adequate. The lowest investment grade: pension funds may still hold it.</td></tr>
          <tr><th>{scale[10]}–{scale[15]}</th><td>Speculative. Pays today; tomorrow depends.</td></tr>
          <tr><th>{scale[16]}–{scale[20]}</th><td>Vulnerable. We would not lend to it, and we rate it for a living.</td></tr>
          <tr><th>{scale[DEFAULT]}</th><td>In default: it has stopped paying.</td></tr>
        </tbody>
      </table>
    </>
  );
}

/**
 * Hindsight Research (spec §14.2): the activist short seller. Its reports, and the subscription that sends each one an
 * hour before publication — legal, and expensive.
 */
export function Hindsight() {
  useTitle('Hindsight Research — We Saw It Coming');
  const directory = useGame((s) => s.directory);
  const reports = useNews({ kinds: ['shortReport'], limit: 30 });
  const lifestyle = useLifestyle();
  const subscribed = !!lifestyle?.hindsight;
  return (
    <SiteFrame
      home={HINDSIGHT}
      logo="HINDSIGHT RESEARCH"
      tagline="20/20. Always."
      look={{ head: '#111', ink: '#e8e8e8', accent: '#d4a017', page: '#fafafa', font: '"Courier New", Courier, monospace' }}
      footer={`Hindsight Research LLC is short the securities it writes about and may trade them at any time. © ${gameYear(START_DAY)}. Nothing here is advice. Everything here is an opinion. Our lawyers wrote this sentence.`}
    >
      <h2>We read the footnotes so you don’t have to.</h2>
      <p>
        We find companies whose accounts do not add up, we sell their shares short, and then we publish. Our reports usually
        knock 10% to 40% off a stock on the day. The companies usually call them false and misleading. Usually.
      </p>
      <div className="frame-box">
        <b>Subscriber Preview</b>
        <p>
          Subscribers receive every report by e-mail {HINDSIGHT_LEAD} minutes before we publish it, for {money(HINDSIGHT_FEE)} a
          month. It is perfectly legal: we sell the information, you decide what to do with it, and the Securities Oversight
          Bureau does not count it against you.
        </p>
        {subscribed ? (
          <p>
            You have subscribed since {formatDate(lifestyle!.hindsight!.since)}.{' '}
            <button onClick={() => void act(simulation().lifestyleAction({ do: 'subscribe', on: false }))}>Cancel subscription</button>
          </p>
        ) : (
          <button onClick={() => void act(simulation().lifestyleAction({ do: 'subscribe', on: true }))}>Subscribe for {money(HINDSIGHT_FEE)} a month</button>
        )}
      </div>
      <h3>Published reports</h3>
      {reports?.length ? (
        <table className="frame-table" cellPadding={3}>
          <tbody>
            {reports.map((n) => (
              <tr key={n.id}>
                <td>{formatDate(dayOf(n.time))}</td>
                <td>
                  <Link href={quoteUrl(directory.tickers[n.company])}>{directory.names[n.company]}</Link>
                </td>
                <td className="down">{pct(n.move ?? 0, 0)} on the day</td>
                <td>
                  <Link href={storyUrl(n)}>The story</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>Nothing yet. We are reading.</p>
      )}
    </SiteFrame>
  );
}
