import { useState } from 'react';
import { PriceChart } from '../../charts/PriceChart';
import { simulation } from '../../sim/client';
import { FUNDS, FUND_SPONSOR, SECTOR_SIZE } from '../../sim/data/funds';
import { fundChart, type FundsView } from '../../sim/types';
import { useGame } from '../../state/game';
import { useFetched } from '../../sites/hooks';
import { Confirm } from '../../ui98/Modal';
import { VirtualTable, type Column } from '../../ui98/VirtualTable';
import { HelpLink } from '../HelpLink';
import { count, money, pct, price, signedMoney, signedPct, tone } from '../format';

type Row = FundsView['list'][number];
type Holding = FundsView['positions'][number];

/**
 * Index funds (spec §11.5): MJR tracks the MAJOR 500; each sector fund holds its industry's fifty largest companies. Units
 * are bought and sold at their value while the market is open, and the fee comes out of the fund day by day.
 */
export function Funds() {
  const time = useGame((s) => s.snapshot?.time ?? 0);
  const { names, tickers } = useGame((s) => s.directory);
  const commission = useGame((s) => s.settings?.commission.fixed ?? 0);
  const view = useFetched(() => simulation().funds(), [time]);
  const [f, setF] = useState(0);
  const holdings = useFetched(() => simulation().fundHoldings(f), [f, Math.floor(time / 1440)]);
  const [units, setUnits] = useState('100');
  const [selected, setSelected] = useState<number>();
  const [pending, setPending] = useState<number>();
  const [result, setResult] = useState<{ ok: boolean; text: string }>();
  if (!view) return <div className="tab-page">Calling the fund company…</div>;
  const spec = FUNDS[f];
  const row = view.list[f];
  const n = Math.trunc(Number(units.replace(/,/g, '')));
  const position = view.positions.find((p) => p.fund === selected);

  const trade = async (fund: number, signed: number) => {
    setPending(undefined);
    const r = await simulation().tradeFund(fund, signed);
    const what = `${count(Math.abs(signed))} ${FUNDS[fund].ticker}`;
    setResult('error' in r ? { ok: false, text: r.error } : { ok: true, text: `${signed > 0 ? 'Bought' : 'Sold'} ${what} at ${price(r.price)}.` });
  };

  const list: Column<Row>[] = [
    { header: 'Symbol', cell: (r) => <b>{FUNDS[r.fund].ticker}</b> },
    { header: 'Fund', cell: (r) => FUNDS[r.fund].name.replace(' Sector Fund', '').replace(' Index Fund', '') },
    { header: 'Value', align: 'right', cell: (r) => price(r.nav) },
    { header: 'Chg', align: 'right', cell: (r) => signedPct(r.nav / r.prevClose - 1), tone: (r) => tone(r.nav - r.prevClose) },
  ];
  const mine: Column<Holding>[] = [
    { header: 'Symbol', cell: (p) => <b>{FUNDS[p.fund].ticker}</b> },
    { header: 'Units', align: 'right', cell: (p) => count(p.units) },
    { header: 'Avg cost', align: 'right', cell: (p) => price(p.cost / p.units) },
    { header: 'Value', align: 'right', cell: (p) => price(p.nav) },
    { header: 'Market value', align: 'right', cell: (p) => money(p.value) },
    { header: 'Unrealised P&L', align: 'right', cell: (p) => signedMoney(p.unrealized), tone: (p) => tone(p.unrealized) },
    { header: 'Return', align: 'right', cell: (p) => signedPct(p.unrealized / p.cost), tone: (p) => tone(p.unrealized) },
  ];

  return (
    <div className="tab-page futures">
      <div className="futures-top">
        <VirtualTable className="futures-board" rows={view.list} columns={list} rowKey={(r) => r.fund} selected={f} onSelect={(r) => (setF(r.fund), setResult(undefined))} />
        <div className="futures-detail">
          <div className="futures-heading">
            <b>
              {spec.name} ({spec.ticker})
            </b>{' '}
            <span className="hint">{FUND_SPONSOR}</span>
            <div>
              Value a unit <b>{price(row.nav)}</b> <span className={tone(row.nav - row.prevClose)}>{signedPct(row.nav / row.prevClose - 1)}</span>
              <span className="hint">
                {' '}
                · {spec.industry < 0 ? `the MAJOR 500's ${count(row.members)} companies` : `the ${count(row.members)} largest ${spec.name.replace(' Sector Fund', '').toLowerCase()} companies`}
                , weighted by market value · fee {pct(row.fee, 2)} a year · dividends reinvested
              </span>
            </div>
          </div>
          <table className="ticket-estimate">
            <tbody>
              <tr>
                <th>Largest holdings</th>
                <th>Weight</th>
              </tr>
              {holdings?.map((h) => (
                <tr key={h.company}>
                  <td>
                    {tickers[h.company]} — {names[h.company]}
                  </td>
                  <td>{pct(h.weight, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="button-row">
            <label htmlFor="fund-units">Units:</label>
            <input id="fund-units" value={units} onChange={(e) => setUnits(e.target.value)} size={8} />
            <button disabled={!view.trading || !(n > 0)} onClick={() => setPending(n)}>
              Buy…
            </button>
            <button disabled={!view.trading || !(n > 0)} onClick={() => setPending(-n)}>
              Sell…
            </button>
            {n > 0 && <span className="hint">about {money(n * row.nav)}</span>}
          </div>
          <p className="hint">
            {view.trading ? 'Filled at once at the fund’s value, plus or minus a small spread, and the usual commission.' : 'The funds trade while the market is open, from 09:30 to 16:00.'}{' '}
            Sector funds pick their {SECTOR_SIZE} members again each quarter. <HelpLink topic="funds">How index funds work</HelpLink>
          </p>
        </div>
      </div>
      <PriceChart key={f} id={fundChart(f)} timeframe="1Y" type="line" />
      <div className="section-title">Your funds</div>
      <VirtualTable
        className="futures-positions"
        rows={view.positions}
        columns={mine}
        rowKey={(p) => p.fund}
        selected={selected}
        onSelect={(p) => setSelected(p.fund)}
        empty="No fund units. Pick a fund above and buy some."
      />
      <div className="button-row">
        <button
          disabled={!position || !view.trading}
          onClick={() => {
            if (!position) return;
            setF(position.fund);
            setPending(-position.units);
          }}
        >
          Sell All…
        </button>
        {result && <span className={result.ok ? 'ticket-result' : 'ticket-result down'}>{result.text}</span>}
      </div>
      {pending !== undefined && (
        <Confirm title="Confirm Fund Order" ok={pending > 0 ? 'Buy' : 'Sell'} onOk={() => void trade(f, pending)} onCancel={() => setPending(undefined)}>
          <p>
            {pending > 0 ? 'Buy' : 'Sell'} {count(Math.abs(pending))} units of {spec.name} ({spec.ticker}) at about{' '}
            {price(row.nav * (1 + Math.sign(pending) * view.spread))} a unit: about {money(Math.abs(pending) * row.nav)}, plus a commission of{' '}
            {money(commission)} or more.
          </p>
          <p>The fund charges {pct(row.fee, 2)} a year, taken from its value day by day.</p>
        </Confirm>
      )}
    </div>
  );
}
