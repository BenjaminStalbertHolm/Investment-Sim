import { useState } from 'react';
import { PerformanceChart } from '../../charts/PerformanceChart';
import { simulation } from '../../sim/client';
import type { PositionView } from '../../sim/types';
import { openQuote, useAccountData, useGame } from '../../state/game';
import { useTrade } from '../../state/trade';
import { VirtualTable, type Column } from '../../ui98/VirtualTable';
import { count, money, price, signedMoney, signedPct, tone } from '../format';

/** Portfolio (spec §12.5): positions, P&L, cash and buying power, and performance against the MAJOR 500. */
export function Portfolio() {
  const account = useGame((s) => s.snapshot?.account);
  const positions = useGame((s) => s.snapshot?.positions) ?? [];
  const { tickers, names } = useGame((s) => s.directory);
  const stats = useAccountData(() => simulation().stats());
  const [selected, setSelected] = useState<number>();

  const columns: Column<PositionView>[] = [
    { header: 'Symbol', cell: (p) => <b>{tickers[p.company]}</b> },
    { header: 'Name', cell: (p) => names[p.company] },
    { header: 'Shares', align: 'right', cell: (p) => count(p.shares) },
    { header: 'Avg cost', align: 'right', cell: (p) => price(p.cost / p.shares) },
    { header: 'Last', align: 'right', cell: (p) => price(p.last) },
    { header: 'Market value', align: 'right', cell: (p) => money(p.value) },
    { header: 'Day change', align: 'right', cell: (p) => signedMoney(p.dayChange), tone: (p) => tone(p.dayChange) },
    { header: 'Unrealised P&L', align: 'right', cell: (p) => signedMoney(p.unrealized), tone: (p) => tone(p.unrealized) },
    { header: 'Return', align: 'right', cell: (p) => signedPct(p.unrealized / p.cost), tone: (p) => tone(p.unrealized) },
  ];

  return (
    <div className="tab-page">
      {account && (
        <div className="summary">
          <Figure label="Net worth" value={money(account.netWorth)} />
          <Figure label="Cash" value={money(account.cash)} />
          <Figure label="Positions" value={money(account.value)} />
          <Figure label="Buying power" value={money(account.buyingPower)} />
          <Figure label="Day change" value={signedMoney(account.dayChange)} tone={tone(account.dayChange)} />
          <Figure label="Unrealised" value={signedMoney(account.unrealized)} tone={tone(account.unrealized)} />
          <Figure label="Realised" value={signedMoney(account.realized)} tone={tone(account.realized)} />
          <Figure
            label="Since start"
            value={signedPct(account.netWorth / account.deposits - 1)}
            tone={tone(account.netWorth - account.deposits)}
          />
        </div>
      )}
      <VirtualTable
        className="positions"
        rows={positions}
        columns={columns}
        rowKey={(p) => p.company}
        selected={selected}
        onSelect={(p) => setSelected(p.company)}
        onOpen={(p) => openQuote(p.company)}
        empty="No positions. Buy something in the Order Ticket."
      />
      <div className="button-row">
        <button disabled={selected === undefined} onClick={() => openQuote(selected!)}>
          Quote…
        </button>
        <button disabled={selected === undefined} onClick={() => useTrade.getState().trade(selected!, 'buy')}>
          Buy more…
        </button>
        <button
          disabled={selected === undefined}
          onClick={() => {
            const p = positions.find((x) => x.company === selected);
            useTrade.getState().trade(selected!, 'sell', { shares: String(p?.shares ?? '') });
          }}
        >
          Sell…
        </button>
      </div>
      <div className="section-title">Performance against the MAJOR 500</div>
      {account && <PerformanceChart stats={stats ?? []} deposits={account.deposits} />}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="figure">
      <span>{label}</span>
      <b className={tone}>{value}</b>
    </div>
  );
}
