import { useMemo } from 'react';
import { pct } from '../../apps/format';
import { START_DAY, dayOf, formatDate, gameYear } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import type { MacroKind, NewsItem } from '../../sim/news';
import { useGame } from '../../state/game';
import { Rng } from '../../world/rng';
import { useFetched, useFutures } from '../hooks';
import { useNews } from '../news/data';
import { EXCHANGE, FED } from '../urls';
import { Link, useTitle } from '../web';

const RELEASES: { kind: Exclude<MacroKind, 'fed'>; name: string }[] = [
  { kind: 'cpi', name: 'Consumer prices (CPI, year on year)' },
  { kind: 'jobs', name: 'Unemployment rate' },
  { kind: 'gdp', name: 'Gross domestic product (annualised growth)' },
  { kind: 'confidence', name: 'Consumer confidence (1985 = 100)' },
];
const value = (kind: MacroKind, v: number) => (kind === 'confidence' ? v.toFixed(1) : pct(v, kind === 'fed' ? 2 : 1));

const TONES = {
  hawkish: [
    'Members saw inflation risks as weighted to the upside and judged that further firming [could well be needed|may be warranted in coming months].',
    'Most members felt that [the economy was running hot|price pressures were building] and that the Committee should [stand ready to act|not be complacent].',
  ],
  balanced: [
    'Members judged the risks to [growth and inflation|the outlook] to be [broadly balanced|roughly even].',
    'The Committee [saw no need to change its stance|agreed to keep its options open] and will [watch the data closely|remain vigilant].',
  ],
  dovish: [
    'Members noted [softening demand|weakness abroad|strains in financial markets] and agreed that [the Committee could ease further if needed|policy should remain supportive].',
    'Several members felt that [the risks to growth had increased|inflation was well contained], leaving room for [lower rates|patience].',
  ],
};

/** "hawkish" for a tone above a third, "dovish" below minus a third. */
const toneOf = (tone = 0): keyof typeof TONES => (tone > 1 / 3 ? 'hawkish' : tone < -1 / 3 ? 'dovish' : 'balanced');

/**
 * The Federal Reservoir (spec §14): the policy rate and the next meeting, rate decisions with their minutes — hawkish or
 * dovish, a hint at the next move — and the economic data the Committee watches.
 */
export default function Reservoir() {
  useTitle('The Federal Reservoir');
  const seed = useGame((s) => s.seed);
  const day = useGame((s) => (s.snapshot ? dayOf(s.snapshot.time) : START_DAY));
  const futures = useFutures();
  const decisions = useNews({ kinds: ['fed'], limit: 12 });
  const data = useNews({ kinds: RELEASES.map((r) => r.kind), limit: 40 });
  const next = useFetched(() => simulation().calendar(day, day + 120, []), [day])?.find((e) => e.kind === 'fed');
  const minutes = useMemo(() => {
    const last = decisions?.[0];
    if (!last) return undefined;
    const rng = Rng.stream(seed, `fed:minutes:${last.id}`);
    const t = toneOf(last.follow);
    return { item: last, tone: t, text: TONES[t].map((line) => line.replace(/\[([^[\]]*)\]/g, (_, o: string) => rng.pick(o.split('|')))).join(' ') };
  }, [decisions, seed]);

  return (
    <div className="site-fed">
      <div className="fed-header">
        <Link href={`http://${FED}/`} className="fed-logo">
          The Federal Reservoir
        </Link>
        <span>Keeping the economy topped up since 1913</span>
      </div>
      <div className="fed-body">
        <table className="fed-box" cellPadding={6}>
          <tbody>
            <tr>
              <th>Policy rate</th>
              <td>{futures ? pct(futures.rate, 2) : '…'}</td>
              <th>10-year Note yield</th>
              <td>
                {futures ? pct(futures.yield10, 2) : '…'} <Link href={`http://${EXCHANGE}/contract?c=ZN`}>(futures)</Link>
              </td>
            </tr>
            <tr>
              <th>Next meeting</th>
              <td colSpan={3}>{next ? `${formatDate(next.day)}; the decision is announced at 14:15.` : 'To be announced.'}</td>
            </tr>
          </tbody>
        </table>
        {minutes && (
          <>
            <h2>Minutes of the Last Meeting</h2>
            <p>
              <b>{formatDate(dayOf(minutes.item.time))}.</b> {minutes.text}{' '}
              <i>(Tone: {minutes.tone}.)</i>
            </p>
          </>
        )}
        <h2>Rate Decisions</h2>
        {decisions?.length ? (
          <table className="fed-table" cellPadding={3}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Decision</th>
                <th>Expected</th>
                <th>Minutes</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((d) => (
                <tr key={d.id}>
                  <td>{formatDate(dayOf(d.time))}</td>
                  <td>{decision(d)}</td>
                  <td>{d.expect !== undefined ? value('fed', d.expect) : ''}</td>
                  <td>{toneOf(d.follow)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>The Committee has not met since you started watching.</p>
        )}
        <h2>Economic Data</h2>
        <table className="fed-table" cellPadding={3}>
          <thead>
            <tr>
              <th>Series</th>
              <th>Latest</th>
              <th>Previous</th>
              <th>Expected</th>
              <th>Released</th>
            </tr>
          </thead>
          <tbody>
            {RELEASES.map((r) => {
              const item = data?.find((d) => d.kind === r.kind);
              return (
                <tr key={r.kind}>
                  <td>{r.name}</td>
                  <td>{item?.level !== undefined ? value(r.kind, item.level) : '—'}</td>
                  <td>{item?.prev !== undefined ? value(r.kind, item.prev) : '—'}</td>
                  <td>{item?.expect !== undefined ? value(r.kind, item.expect) : '—'}</td>
                  <td>{item ? formatDate(dayOf(item.time)) : 'not yet'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="fed-footer">
        Board of Governors of the Federal Reservoir System · {gameYear(START_DAY)} · The Reservoir does not comment on the stock market,
        except when it does.
      </p>
    </div>
  );
}

function decision(d: NewsItem): string {
  const level = value('fed', d.level ?? 0);
  if (d.level === undefined || d.prev === undefined || Math.abs(d.level - d.prev) < 1e-9) return `Held at ${level}`;
  return d.level > d.prev ? `Raised to ${level}` : `Cut to ${level}`;
}
