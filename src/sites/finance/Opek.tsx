import { price, signedPct, tone } from '../../apps/format';
import { START_DAY, dayOf, formatDate, gameYear } from '../../sim/calendar';
import { nextOpekMeeting, opekMeetings } from '../../sim/commodities';
import { CONTRACT_INDEX, CONTRACTS } from '../../sim/data/commodities';
import type { OutlookView } from '../../sim/types';
import { useGame } from '../../state/game';
import { useFutures, useOutlooks } from '../hooks';
import { EXCHANGE, OPEK } from '../urls';
import { Link, Marquee, useTitle } from '../web';

const CL = CONTRACT_INDEX.CL;
const HINTS: Record<string, string> = {
  cut: 'Several delegates spoke of the need to “restore balance to the market”, which traders took to mean a cut in output.',
  hold: 'Delegates said the present agreement was “working well”, which traders took to mean no change in output.',
  raise: 'Delegates spoke of “meeting the needs of consumers”, which traders took to mean higher output.',
};
const DECISIONS: Record<string, string> = {
  cut: 'The Conference decided to reduce the production ceiling of Member Kountries, with effect from the first of next month.',
  hold: 'The Conference decided to maintain the current production ceiling, and to review the market at its next meeting.',
  raise: 'The Conference decided to raise the production ceiling of Member Kountries, to meet the growing needs of consumers.',
};

/**
 * OPEK (spec §14): the Organization of Petroleum Exporting Kountries' meeting dates, what its delegates hint at in the
 * week before a meeting, and the communiqués. The same meetings move crude oil, Brent, heating oil and gasoline.
 */
export default function Opek() {
  useTitle('OPEK — Organization of Petroleum Exporting Kountries');
  const outlooks = useOutlooks();
  const futures = useFutures();
  const day = useGame((s) => (s.snapshot ? dayOf(s.snapshot.time) : START_DAY));
  const opek = (outlooks ?? []).filter((o) => o.source === 'opek');
  const pending = opek.filter((o) => !o.done);
  const past = opek.filter((o) => o.done);
  const year = new Date(day * 86_400_000).getUTCFullYear();
  const next = nextOpekMeeting(day);
  return (
    <div className="site-opek">
      <div className="opek-header">
        <Link href={`http://${OPEK}/`} className="opek-logo">
          OPEK
        </Link>
        <span>Organization of Petroleum Exporting Kountries · Vienna</span>
      </div>
      {futures && (
        <Marquee className="opek-marquee" speed={24}>
          OPEK Reference Basket: Crude Oil {price(futures.spot[CL])} $/bbl{' '}
          <span className={tone(futures.spot[CL] - futures.previous[CL])}>{signedPct(futures.spot[CL] / futures.previous[CL] - 1)}</span> ·
          Brent {price(futures.spot[CONTRACT_INDEX.BZ])} $/bbl · Stability · Solidarity · Supply
        </Marquee>
      )}
      <div className="opek-body">
        <h2>Next Ordinary Meeting of the Conference</h2>
        <p>
          <b>{formatDate(next)}</b>, Vienna. The Conference’s decision will be announced at 14:00 New York time.
        </p>
        {pending.map((o) => (
          <p key={o.id} className="opek-hint">
            <b>Delegates’ remarks, {formatDate(dayOf(o.issued))}:</b> {HINTS[o.kind] ?? 'Delegates declined to comment.'}
          </p>
        ))}
        <h2>Meetings in {gameYear(day)}</h2>
        <ul>
          {opekMeetings(year).map((d) => (
            <li key={d}>
              {formatDate(d)}
              {d < day ? ' (held)' : d === next ? ' (next)' : ''}
            </li>
          ))}
        </ul>
        <h2>Press Releases</h2>
        {past.length ? past.map((o) => <Communique key={o.id} outlook={o} />) : <p>No communiqués have been issued this year.</p>}
      </div>
      <p className="opek-footer">
        © {gameYear(START_DAY)} OPEK Secretariat. Oil prices: <Link href={`http://${EXCHANGE}/contract?c=CL`}>Chicago Murkantile Exchange</Link>.
      </p>
    </div>
  );
}

function Communique({ outlook }: { outlook: OutlookView }) {
  const oil = outlook.actual?.find(([k]) => k === CL)?.[1];
  return (
    <div className="opek-release">
      <b>Press Release, {formatDate(dayOf(outlook.due))}</b>
      <p>
        The Ordinary Meeting of the OPEK Conference convened in Vienna. {DECISIONS[outlook.result ?? 'hold']}
      </p>
      {oil !== undefined && (
        <p className="opek-small">
          Effect on {CONTRACTS[CL].name.toLowerCase()}: <span className={tone(oil)}>{signedPct(Math.expm1(oil))}</span>, some of it
          priced in after the delegates’ remarks.
        </p>
      )}
    </div>
  );
}
