import { money, pct, price, signed, signedPct, tone } from '../../apps/format';
import { PriceChart } from '../../charts/PriceChart';
import { START_DAY, formatDate, gameYear } from '../../sim/calendar';
import { contractLabel, symbolOf } from '../../sim/commodities';
import { CONTRACTS, CONTRACT_INDEX, MAINTENANCE, MJ, type CommodityGroup } from '../../sim/data/commodities';
import { INDEX, commodityChart, type ContractQuote, type FuturesView } from '../../sim/types';
import { useFutures } from '../hooks';
import { EXCHANGE } from '../urls';
import { Link, Marquee, useTitle } from '../web';

const GROUPS: Record<CommodityGroup, string> = {
  energy: 'Energy', metals: 'Metals', grains: 'Grains', softs: 'Softs', livestock: 'Livestock', forest: 'Forest Products',
  financial: 'Financial',
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const contractUrl = (code: string) => `http://${EXCHANGE}/contract?c=${code}`;
const change = (c: ContractQuote) => (c.settle ? c.price - c.settle : 0);

/**
 * The Chicago Murkantile Exchange (spec §14): settlement prices, contract specifications, the expiry calendar and
 * margins, from the same prices MajorTrade's Futures tab trades at.
 */
export default function Exchange({ url }: { url: URL }) {
  const view = useFutures();
  const page = url.pathname.replace(/^\//, '');
  return (
    <div className="site-cme">
      <div className="cme-header">
        <Link href={`http://${EXCHANGE}/`} className="cme-logo">
          <span>CME</span> Chicago Murkantile Exchange
        </Link>
        <span className="cme-nav">
          <Link href="/">Settlements</Link> | <Link href="/calendar">Expiry Calendar</Link> | <Link href="/margins">Margins</Link>
        </span>
      </div>
      <Marquee className="cme-marquee" speed={30}>
        Open outcry 09:30–16:00 Central Murkantile Time · All contracts marked to market at the close · Longs held past the last
        trading day TAKE DELIVERY · The Exchange accepts no responsibility for livestock in office lobbies
      </Marquee>
      {!view ? (
        <p>Connecting to the trading floor…</p>
      ) : page === 'contract' ? (
        <ContractPage view={view} k={CONTRACT_INDEX[(url.searchParams.get('c') ?? '').toUpperCase()]} />
      ) : page === 'calendar' ? (
        <Calendar view={view} />
      ) : page === 'margins' ? (
        <Margins view={view} />
      ) : (
        <Board view={view} />
      )}
      <p className="cme-footer">
        © {gameYear(START_DAY)} Chicago Murkantile Exchange Inc. Prices delayed by nothing at all. Futures trading involves
        substantial risk of loss and, occasionally, of corn.
      </p>
    </div>
  );
}

/** Every contract's front month, by group, with the underlying and the last settlement. */
function Board({ view }: { view: FuturesView }) {
  useTitle('Chicago Murkantile Exchange — Settlements');
  const groups = [...new Set(CONTRACTS.map((c) => c.group))];
  return (
    <>
      <h2>Front-Month Settlements</h2>
      <p>
        {view.trading ? 'The pits are open.' : 'The pits are closed.'} Settlement prices are set at 16:00; changes are from the last
        settlement.
      </p>
      <table className="cme-table" cellPadding={2}>
        <thead>
          <tr>
            <th>Code</th>
            <th>Contract</th>
            <th>Front month</th>
            <th>Last</th>
            <th>Change</th>
            <th>Settle</th>
            <th>Underlying</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g}>
            <tr>
              <th colSpan={7} className="cme-group">
                {GROUPS[g]}
              </th>
            </tr>
            {CONTRACTS.map((spec, k) => {
              if (spec.group !== g) return null;
              const front = view.chains[k][0];
              return (
                <tr key={spec.code}>
                  <td>
                    <Link href={contractUrl(spec.code)}>
                      <b>{spec.code}</b>
                    </Link>
                  </td>
                  <td>{spec.name}</td>
                  <td>{symbolOf(front)}</td>
                  <td className="right">{price(front.price)}</td>
                  <td className={`right ${tone(change(front))}`}>{front.settle ? signed(change(front), front.price) : 'new'}</td>
                  <td className="right">{front.settle ? price(front.settle) : '—'}</td>
                  <td className="right">
                    {price(view.spot[k])} <span className={tone(view.spot[k] - view.previous[k])}>{signedPct(view.spot[k] / view.previous[k] - 1)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </>
  );
}

/** A contract's specification, its listed months and a year's chart of what is behind it. */
function ContractPage({ view, k }: { view: FuturesView; k: number | undefined }) {
  const spec = k === undefined ? undefined : CONTRACTS[k];
  useTitle(`Chicago Murkantile Exchange — ${spec?.name ?? 'Contract not found'}`);
  if (k === undefined || !spec) {
    return (
      <p>
        No such contract is listed. <Link href="/">Back to the settlements</Link>
      </p>
    );
  }
  const chain = view.chains[k];
  const front = chain[0];
  const perContract = front.price * spec.multiplier;
  return (
    <>
      <h2>
        {spec.name} ({spec.code}) Futures
      </h2>
      <p>
        <i>{spec.note}</i>
      </p>
      <table className="cme-specs" cellPadding={3}>
        <tbody>
          <tr>
            <th>Contract size</th>
            <td>{spec.size}</td>
          </tr>
          <tr>
            <th>Price quotation</th>
            <td>{spec.quote}</td>
          </tr>
          <tr>
            <th>Contract months</th>
            <td>{spec.months.map((m) => MONTHS[m]).join(', ')}</td>
          </tr>
          <tr>
            <th>Last trading day</th>
            <td>The third Friday of the contract month (the trading day before, on a holiday)</td>
          </tr>
          <tr>
            <th>Settlement</th>
            <td>
              {spec.delivery
                ? `Physical delivery: ${spec.delivery.quantity.toLocaleString('en-US')} ${spec.delivery.unit} of ${spec.delivery.what}, to the holder's registered address`
                : 'Cash, at the final settlement price'}
            </td>
          </tr>
          <tr>
            <th>Initial margin</th>
            <td>
              {pct(spec.margin)} of the contract's value: {money(front.margin)} a contract on {symbolOf(front)}
            </td>
          </tr>
          <tr>
            <th>Maintenance margin</th>
            <td>{money(front.margin * MAINTENANCE)} a contract</td>
          </tr>
          <tr>
            <th>Contract value</th>
            <td>{money(perContract)} at the front month's price</td>
          </tr>
        </tbody>
      </table>
      <h3>Listed Contracts</h3>
      <table className="cme-table" cellPadding={2}>
        <thead>
          <tr>
            <th>Contract</th>
            <th>Symbol</th>
            <th>Last trading day</th>
            <th>Bid</th>
            <th>Ask</th>
            <th>Settle</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {chain.map((c) => (
            <tr key={c.key}>
              <td>{contractLabel(c.key)}</td>
              <td>{symbolOf(c)}</td>
              <td>{formatDate(c.expiry)}</td>
              <td className="right">{price(c.bid)}</td>
              <td className="right">{price(c.ask)}</td>
              <td className="right">{c.settle ? price(c.settle) : '—'}</td>
              <td className={`right ${tone(change(c))}`}>{c.settle ? signed(change(c), c.price) : 'new'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>{k === MJ ? 'The MAJOR 500 Index' : spec.delivery ? 'Spot Price' : 'The Note'}, One Year</h3>
      <div className="cme-chart">
        <PriceChart id={k === MJ ? INDEX : commodityChart(k)} timeframe="1Y" type="line" skin="web" />
      </div>
    </>
  );
}

/** The last trading days of every listed contract over the next three months. */
function Calendar({ view }: { view: FuturesView }) {
  useTitle('Chicago Murkantile Exchange — Expiry Calendar');
  const until = view.day + 92;
  const byDay = new Map<number, ContractQuote[]>();
  for (const chain of view.chains) {
    for (const c of chain) if (c.expiry >= view.day && c.expiry <= until) byDay.set(c.expiry, [...(byDay.get(c.expiry) ?? []), c]);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  return (
    <>
      <h2>Expiry Calendar</h2>
      <p>
        Last trading days over the next three months. Positions still open at the close of the last trading day are settled: in
        cash for financial contracts, <b>by delivery</b> for everything else.
      </p>
      <table className="cme-table" cellPadding={2}>
        <thead>
          <tr>
            <th>Last trading day</th>
            <th>Contracts expiring</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d}>
              <td>{formatDate(d)}</td>
              <td>
                {byDay.get(d)!.map((c, j) => (
                  <span key={c.key}>
                    {j > 0 && ', '}
                    <Link href={contractUrl(CONTRACTS[c.k].code)}>{contractLabel(c.key)}</Link>
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Performance-bond requirements per contract, at the front month's price. */
function Margins({ view }: { view: FuturesView }) {
  useTitle('Chicago Murkantile Exchange — Margins');
  return (
    <>
      <h2>Performance Bond Requirements</h2>
      <p>
        Initial margin is posted when a position opens. If losses take the account below the maintenance level ({pct(MAINTENANCE, 0)}{' '}
        of initial), the clearing member will call for more. Every position is marked to market in cash each night.
      </p>
      <table className="cme-table" cellPadding={2}>
        <thead>
          <tr>
            <th>Code</th>
            <th>Contract</th>
            <th>Initial (% of value)</th>
            <th>Initial per contract</th>
            <th>Maintenance per contract</th>
          </tr>
        </thead>
        <tbody>
          {CONTRACTS.map((spec, k) => (
            <tr key={spec.code}>
              <td>
                <Link href={contractUrl(spec.code)}>{spec.code}</Link>
              </td>
              <td>{spec.name}</td>
              <td className="right">{pct(spec.margin)}</td>
              <td className="right">{money(view.chains[k][0].margin)}</td>
              <td className="right">{money(view.chains[k][0].margin * MAINTENANCE)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
