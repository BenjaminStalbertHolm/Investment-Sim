import { useState } from 'react';
import { PerformanceChart } from '../../charts/PerformanceChart';
import { HelpLink } from '../HelpLink';
import { formatDate } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import type { PositionView } from '../../sim/types';
import { openQuote, useAccountData, useGame } from '../../state/game';
import { useTrade } from '../../state/trade';
import { VirtualTable, type Column } from '../../ui98/VirtualTable';
import { count, money, pct, price, signedMoney, signedPct, tone } from '../format';

/**
 * Portfolio (spec §12.5): long and short positions, P&L and borrow fees; cash, buying power and the margin account's
 * equity and requirements (spec §12.4); performance against the MAJOR 500.
 */
export function Portfolio() {
  const account = useGame((s) => s.snapshot?.account);
  const positions = useGame((s) => s.snapshot?.positions) ?? [];
  const { tickers, names } = useGame((s) => s.directory);
  const stats = useAccountData(() => simulation().stats());
  const [selected, setSelected] = useState<number>();
  const position = positions.find((p) => p.company === selected);
  const { trade } = useTrade.getState();

  const columns: Column<PositionView>[] = [
    { header: 'Symbol', cell: (p) => <b>{tickers[p.company]}</b> },
    { header: 'Name', cell: (p) => names[p.company] },
    { header: 'Shares', align: 'right', cell: (p) => (p.shares < 0 ? `${count(-p.shares)} short` : count(p.shares)) },
    { header: 'Avg cost', align: 'right', cell: (p) => price(p.cost / p.shares) },
    { header: 'Last', align: 'right', cell: (p) => price(p.last) },
    { header: 'Market value', align: 'right', cell: (p) => money(p.value) },
    { header: 'Day change', align: 'right', cell: (p) => signedMoney(p.dayChange), tone: (p) => tone(p.dayChange) },
    { header: 'Unrealised P&L', align: 'right', cell: (p) => signedMoney(p.unrealized), tone: (p) => tone(p.unrealized) },
    { header: 'Return', align: 'right', cell: (p) => signedPct(p.unrealized / Math.abs(p.cost)), tone: (p) => tone(p.unrealized) },
    {
      header: 'Borrow',
      align: 'right',
      cell: (p) => (p.borrowFee === undefined ? '' : `${pct(p.borrowFee, p.borrowFee < 0.01 ? 2 : 1)}${p.recall ? ' RECALLED' : ''}`),
      tone: (p) => (p.recall ? 'down' : ''),
    },
  ];

  return (
    <div className="tab-page">
      {account?.call && (
        <p className="margin-banner">
          ⚠ MARGIN CALL: your equity is {money(account.call.amount)} short of the maintenance requirement. Meet it by the
          opening bell on {formatDate(account.call.due)}, or the broker will sell positions for you.{' '}
          <HelpLink topic="margin">What should I do?</HelpLink>
        </p>
      )}
      {account && (
        <div className="summary">
          <Figure label="Net worth" value={money(account.netWorth)} />
          <Figure label="Cash" value={money(account.cash)} tone={account.cash < 0 ? 'down' : undefined} />
          <Figure label="Equity" value={money(account.equity)} />
          <Figure label="Buying power" value={money(Math.max(0, account.buyingPower))} />
          <Figure label="Long" value={money(account.longValue)} />
          <Figure label="Short" value={money(account.shortValue)} />
          <Figure label="Initial margin" value={money(account.initial)} />
          <Figure label="Maintenance" value={money(account.maintenance)} tone={account.equity < account.maintenance ? 'down' : undefined} />
          <Figure label="Day change" value={signedMoney(account.dayChange)} tone={tone(account.dayChange)} />
          <Figure label="Unrealised" value={signedMoney(account.unrealized)} tone={tone(account.unrealized)} />
          <Figure label="Realised" value={signedMoney(account.realized)} tone={tone(account.realized)} />
          <Figure
            label="Since start"
            value={signedPct(account.netWorth / account.deposits - 1)}
            tone={tone(account.netWorth - account.deposits)}
          />
          {account.fundsValue > 0 && <Figure label="Index funds" value={money(account.fundsValue)} />}
          {account.fine > 0 && <Figure label="SOB fine owed" value={money(account.fine)} tone="down" />}
          {account.sharks > 0 && <Figure label="Private loan owed" value={money(account.sharks)} tone="down" />}
          {(account.futuresMargin > 0 || account.goodsValue > 0 || account.loans > 0) && (
            <>
              <Figure label="Futures P&L today" value={signedMoney(account.futuresPnl)} tone={tone(account.futuresPnl)} />
              <Figure label="Futures margin" value={money(account.futuresMargin)} />
              <Figure label="Goods in lobby" value={money(account.goodsValue)} />
              <Figure label="Bank loans" value={money(account.loans)} />
            </>
          )}
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
        empty="No positions. Buy (or sell short) something in the Order Ticket."
      />
      <div className="button-row">
        <button disabled={!position} onClick={() => openQuote(selected!)}>
          Quote…
        </button>
        <button disabled={!position} onClick={() => trade(selected!, position!.shares > 0 ? 'buy' : 'short')}>
          {position && position.shares < 0 ? 'Short more…' : 'Buy more…'}
        </button>
        <button
          disabled={!position}
          onClick={() => trade(selected!, position!.shares > 0 ? 'sell' : 'cover', { shares: String(Math.abs(position!.shares)) })}
        >
          {position && position.shares < 0 ? 'Buy to Cover…' : 'Sell…'}
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
