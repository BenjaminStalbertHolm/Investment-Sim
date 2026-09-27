import { useState } from 'react';
import { money, pct } from '../../apps/format';
import { START_DAY, formatDate, gameYear } from '../../sim/calendar';
import type { StakeFiling } from '../../sim/governance';
import type { SobOutcome } from '../../sim/regulator';
import { useGame } from '../../state/game';
import { useSob } from '../hooks';
import { SOB, companyUrl, firmUrl, playerUrl, sites } from '../urls';
import { Link, usePage, useTitle } from '../web';

const OUTCOMES: Record<SobOutcome, string> = {
  cleared: 'Examination closed without action',
  warning: 'Warning letter issued',
  fine: 'Civil penalty',
  suspension: 'Civil penalty; trading suspension',
  freeze: 'Civil penalty; asset freeze',
  enforcement: 'Public enforcement action: civil penalty and trading suspension',
};

/**
 * The Securities Oversight Bureau (spec §14): 5% filings (who crossed 5% of which company), enforcement actions, and
 * investigation notices. Its interest in the player is what the tray's thermometer measures (spec §16B).
 */
export default function Sob({ url }: { url: URL }) {
  useTitle('Securities Oversight Bureau');
  const view = useSob();
  const directory = useGame((s) => s.directory);
  const firmName = useGame((s) => s.firmName);
  const s = sites(directory, firmName);
  const path = url.pathname;
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const filer = (f: StakeFiling) => (f.firm < 0 ? <Link href={playerUrl(s)}>{firmName}</Link> : <Link href={firmUrl(s, f.firm)}>{directory.firms[f.firm]?.name}</Link>);
  const filerName = (f: StakeFiling) => (f.firm < 0 ? firmName : directory.firms[f.firm]?.name ?? '');
  const matches = (f: StakeFiling) =>
    !q || directory.tickers[f.company].toLowerCase() === q || directory.names[f.company].toLowerCase().includes(q) || filerName(f).toLowerCase().includes(q);

  const body = (() => {
    if (!view) return <p>Connecting to EDGAR-98…</p>;
    if (path === '/enforcement') {
      const actions = view.record.filter((a) => a.outcome !== 'cleared');
      return (
        <>
          <h2>Enforcement Actions</h2>
          {actions.length ? (
            <table className="sob-table" border={1} cellPadding={3}>
              <thead>
                <tr><th>Date</th><th>Respondent</th><th>Action</th><th>Penalty</th><th>Until</th></tr>
              </thead>
              <tbody>
                {[...actions].reverse().map((a, k) => (
                  <tr key={k}>
                    <td>{formatDate(a.day)}</td>
                    <td>{firmName}</td>
                    <td>{OUTCOMES[a.outcome]}</td>
                    <td>{a.amount ? money(a.amount) : '—'}</td>
                    <td>{a.until ? formatDate(a.until) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No enforcement actions against registered investment firms this year. The markets are, it seems, perfectly honest.</p>
          )}
        </>
      );
    }
    if (path === '/investigations') {
      return (
        <>
          <h2>Investigation Notices</h2>
          {view.audit ? (
            <p className="sob-notice">
              The Division of Enforcement opened an examination of <b>{firmName}</b> on {formatDate(view.audit.opened)}. Findings are
              expected by {formatDate(view.audit.due)}.
            </p>
          ) : (
            <p>There are no open examinations of firms registered with the Bureau.</p>
          )}
          {view.suspended !== undefined && (
            <p className="sob-notice">
              <b>{firmName}</b> is suspended from opening positions until {formatDate(view.suspended)}
              {view.frozen !== undefined ? `, and its assets are frozen until ${formatDate(view.frozen)}` : ''}.
            </p>
          )}
          {view.fine && (
            <p className="sob-notice">
              A civil penalty of {money(view.fine.amount)} against <b>{firmName}</b> is outstanding
              {Number.isFinite(view.fine.due) ? `, due ${formatDate(view.fine.due)}` : ''}.
            </p>
          )}
        </>
      );
    }
    const filings = view.filings.filter(matches).slice(0, 100);
    return (
      <>
        <p>
          Anyone who owns 5% or more of a listed company must file with the Bureau, and again when the holding falls back
          under 5%. Filings are public.
        </p>
        <SearchForm />
        <h2>{q ? `Filings matching “${url.searchParams.get('q')}”` : 'Latest 5% filings'}</h2>
        {filings.length ? (
          <table className="sob-table" border={1} cellPadding={3}>
            <thead>
              <tr><th>Filed</th><th>Filer</th><th>Company</th><th>Holding</th></tr>
            </thead>
            <tbody>
              {filings.map((f, k) => (
                <tr key={k}>
                  <td>{formatDate(f.day)}</td>
                  <td>{filer(f)}</td>
                  <td>
                    <Link href={companyUrl(s, f.company, 'investor.html')}>{directory.names[f.company]}</Link> ({directory.tickers[f.company]})
                  </td>
                  <td>{f.pct >= 0.05 ? pct(f.pct, 1) : `${pct(f.pct, 1)} (below 5%)`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No filings found.</p>
        )}
      </>
    );
  })();

  return (
    <div className="site-sob">
      <div className="sob-header">
        <Link href={`http://${SOB}/`} className="sob-logo">
          SOB
        </Link>
        <span>
          U.S. Securities Oversight Bureau
          <br />
          <i>Protecting investors, mostly, since 1934</i>
        </span>
      </div>
      <nav className="sob-nav">
        <Link href={`http://${SOB}/`}>Filings</Link> · <Link href={`http://${SOB}/enforcement`}>Enforcement Actions</Link> ·{' '}
        <Link href={`http://${SOB}/investigations`}>Investigation Notices</Link>
      </nav>
      <div className="sob-body">{body}</div>
      <p className="sob-footer">
        © {gameYear(START_DAY)} Securities Oversight Bureau. To report a suspicious tip, forward it to tips@sob.gov.
      </p>
    </div>
  );
}

function SearchForm() {
  const page = usePage();
  const [q, setQ] = useState('');
  return (
    <form
      className="news-search"
      onSubmit={(e) => {
        e.preventDefault();
        page.navigate(`http://${SOB}/?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <label>
        Search filings: <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ticker, company or firm" />
      </label>{' '}
      <button type="submit">Search</button>
    </form>
  );
}
