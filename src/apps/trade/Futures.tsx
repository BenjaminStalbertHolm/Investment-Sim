import { useState } from 'react';
import { PriceChart } from '../../charts/PriceChart';
import { dayOf, formatDate } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { contractLabel, symbolOf } from '../../sim/commodities';
import { CONTRACTS, MJ, PHYSICAL_DISCOUNT, type CommodityGroup } from '../../sim/data/commodities';
import { INDEX, commodityChart, type ContractQuote, type FuturesPositionView, type GoodsView } from '../../sim/types';
import { showError, useGame } from '../../state/game';
import { useFetched } from '../../sites/hooks';
import { Confirm } from '../../ui98/Modal';
import { VirtualTable, type Column } from '../../ui98/VirtualTable';
import { count, money, price, signed, signedMoney, signedPct, tone } from '../format';

const GROUPS: Record<CommodityGroup, string> = {
  energy: 'Energy', metals: 'Metals', grains: 'Grains', softs: 'Softs', livestock: 'Livestock', forest: 'Forest', financial: 'Financial',
};

type Pending = { kind: 'trade'; contract: ContractQuote; contracts: number } | { kind: 'goods'; goods: GoodsView };

/**
 * Futures & Commodities (spec §12.3): every contract's underlying, the selected one's contract chain, market orders in
 * contracts, positions marked to market each night (with Close and Roll), and whatever the lobby has had delivered.
 */
export function Futures() {
  const time = useGame((s) => s.snapshot?.time ?? 0);
  const view = useFetched(() => simulation().futures(), [time]);
  const [k, setK] = useState(0);
  const [month, setMonth] = useState<string>();
  const [contracts, setContracts] = useState('1');
  const [selected, setSelected] = useState<string>();
  const [pending, setPending] = useState<Pending>();
  const [result, setResult] = useState<{ ok: boolean; text: string }>();
  if (!view) return <div className="tab-page">Dialling the pit…</div>;
  const spec = CONTRACTS[k];
  const chain = view.chains[k];
  // The contract to trade: the one clicked in the chain, else the front month.
  const contract = chain.find((c) => c.key === month) ?? chain[0];
  const n = Math.trunc(Number(contracts));
  const canTrade = view.enabled && view.trading && n > 0;
  const position = view.positions.find((p) => p.contract === selected);

  const run = async (action: () => Promise<{ error: string } | object>, ok: string) => {
    setPending(undefined);
    const r = await action();
    if ('error' in r) setResult({ ok: false, text: (r as { error: string }).error });
    else setResult({ ok: true, text: ok });
  };
  const trade = (contract: ContractQuote, signed: number) =>
    run(() => simulation().tradeFuture(contract.key, signed), `${signed > 0 ? 'Bought' : 'Sold'} ${count(Math.abs(signed))} ${contractLabel(contract.key)}.`);

  const board: Column<number>[] = [
    { header: 'Code', cell: (j) => <b>{CONTRACTS[j].code}</b> },
    { header: 'Commodity', cell: (j) => CONTRACTS[j].name },
    { header: 'Last', align: 'right', cell: (j) => price(view.spot[j]) },
    { header: 'Chg', align: 'right', cell: (j) => signedPct(view.spot[j] / view.previous[j] - 1), tone: (j) => tone(view.spot[j] - view.previous[j]) },
  ];
  const chainColumns: Column<ContractQuote>[] = [
    { header: 'Contract', cell: (c) => <b>{contractLabel(c.key)}</b> },
    { header: 'Symbol', cell: (c) => symbolOf(c) },
    { header: 'Last trading day', cell: (c) => formatDate(c.expiry) },
    { header: 'Bid', align: 'right', cell: (c) => price(c.bid) },
    { header: 'Ask', align: 'right', cell: (c) => price(c.ask) },
    { header: 'Chg', align: 'right', cell: (c) => (c.settle ? signed(c.price - c.settle, c.price) : ''), tone: (c) => tone(c.settle ? c.price - c.settle : 0) },
    { header: 'Margin', align: 'right', cell: (c) => money(c.margin) },
  ];
  const positionColumns: Column<FuturesPositionView>[] = [
    { header: 'Contract', cell: (p) => <b>{contractLabel(p.contract)}</b> },
    { header: 'Contracts', align: 'right', cell: (p) => (p.contracts < 0 ? `${count(-p.contracts)} short` : count(p.contracts)) },
    { header: 'Entry', align: 'right', cell: (p) => price(p.entry) },
    { header: 'Settled', align: 'right', cell: (p) => price(p.mark) },
    { header: 'Now', align: 'right', cell: (p) => price(p.price) },
    { header: 'Today', align: 'right', cell: (p) => signedMoney(p.open), tone: (p) => tone(p.open) },
    { header: 'Since entry', align: 'right', cell: (p) => signedMoney(p.pnl), tone: (p) => tone(p.pnl) },
    { header: 'Margin', align: 'right', cell: (p) => money(p.margin) },
    { header: 'Expires', cell: (p) => formatDate(p.expiry) },
  ];

  return (
    <div className="tab-page futures">
      <div className="futures-top">
        <VirtualTable
          className="futures-board"
          rows={CONTRACTS.map((_, j) => j)}
          columns={board}
          rowKey={(j) => j}
          selected={k}
          onSelect={(j) => (setK(j), setMonth(undefined), setResult(undefined))}
          rowClass={(j) => (j > 0 && CONTRACTS[j].group !== CONTRACTS[j - 1].group ? 'group-start' : undefined)}
        />
        <div className="futures-detail">
          <div className="futures-heading">
            <b>
              {spec.name} ({spec.code})
            </b>{' '}
            <span className="hint">
              {GROUPS[spec.group]} · {spec.size} · {spec.quote}
            </span>
            <div>
              {k === MJ ? 'MAJOR 500' : spec.delivery ? 'Spot' : 'Note'} <b>{price(view.spot[k])}</b>{' '}
              <span className={tone(view.spot[k] - view.previous[k])}>{signedPct(view.spot[k] / view.previous[k] - 1)}</span>
              {spec.code === 'ZN' && <span className="hint"> · 10-year yield {(view.yield10 * 100).toFixed(2)}%</span>}
              <span className="hint"> · {spec.note}</span>
            </div>
          </div>
          <VirtualTable
            className="futures-chain"
            rows={chain}
            columns={chainColumns}
            rowKey={(c) => c.key}
            selected={contract.key}
            onSelect={(c) => setMonth(c.key)}
          />
          <div className="button-row">
            <label htmlFor="futures-contracts">Contracts:</label>
            <input id="futures-contracts" value={contracts} onChange={(e) => setContracts(e.target.value)} size={5} />
            <button disabled={!canTrade} onClick={() => setPending({ kind: 'trade', contract, contracts: n })}>
              Buy…
            </button>
            <button disabled={!canTrade} onClick={() => setPending({ kind: 'trade', contract, contracts: -n })}>
              Sell…
            </button>
            <b>{contractLabel(contract.key)}</b>
          </div>
          {!view.enabled ? (
            <p className="hint">Futures trading is switched off in this game's advanced settings.</p>
          ) : !view.trading ? (
            <p className="hint">The pit is closed: futures trade from 09:30 to 16:00. Prices shown are where they stand now.</p>
          ) : (
            <p className="hint">Market orders, filled at once. Positions are settled in cash every night.</p>
          )}
        </div>
      </div>
      <PriceChart id={k === MJ ? INDEX : commodityChart(k)} timeframe="1Y" type="line" />
      <div className="section-title">Your futures</div>
      <VirtualTable
        className="futures-positions"
        rows={view.positions}
        columns={positionColumns}
        rowKey={(p) => p.contract}
        selected={selected}
        onSelect={(p) => setSelected(p.contract)}
        empty="No futures positions."
      />
      <div className="button-row">
        <button
          disabled={!position || !view.trading}
          onClick={() => position && void run(() => simulation().tradeFuture(position.contract, -position.contracts), `Closed ${contractLabel(position.contract)}.`)}
        >
          Close
        </button>
        <button
          disabled={!position || !view.trading}
          onClick={() => position && void run(() => simulation().rollFuture(position.contract), `Rolled ${contractLabel(position.contract)} into the next month.`)}
        >
          Roll
        </button>
        {result && <span className={result.ok ? 'ticket-result' : 'ticket-result down'}>{result.text}</span>}
      </div>
      {view.goods.length > 0 && (
        <>
          <div className="section-title">In the office lobby</div>
          {view.goods.map((g) => {
            const d = CONTRACTS.find((c) => c.code === g.code)!.delivery!;
            return (
              <div key={g.code} className="button-row">
                <span>
                  {count(g.quantity)} {d.unit} of {d.what}, delivered {formatDate(dayOf(g.delivered))}: worth {money(g.value)} to a
                  merchant, storage {money(g.perDay)} a day ({money(g.storage)} so far).
                </span>
                <button onClick={() => setPending({ kind: 'goods', goods: g })}>Sell Goods…</button>
              </div>
            );
          })}
        </>
      )}
      {pending?.kind === 'trade' && (
        <Confirm
          title="Confirm Futures Order"
          ok={pending.contracts > 0 ? 'Buy' : 'Sell'}
          onOk={() => void trade(pending.contract, pending.contracts)}
          onCancel={() => setPending(undefined)}
        >
          <p>
            {pending.contracts > 0 ? 'Buy' : 'Sell'} {count(Math.abs(pending.contracts))} {contractLabel(pending.contract.key)} at about{' '}
            {price(pending.contracts > 0 ? pending.contract.ask : pending.contract.bid)}, at market.
          </p>
          <p>
            Face value about {money(Math.abs(pending.contracts) * pending.contract.price * spec.multiplier)}; initial margin{' '}
            {money(Math.abs(pending.contracts) * pending.contract.margin)}. The last trading day is {formatDate(pending.contract.expiry)}
            {spec.delivery ? ': a long position still open then is delivered to your office lobby.' : ', when it settles in cash.'}
          </p>
        </Confirm>
      )}
      {pending?.kind === 'goods' && (
        <Confirm
          title="Sell Goods"
          ok="Sell"
          onOk={() =>
            void simulation()
              .sellGoods(pending.goods.code)
              .then((r) => ('error' in r ? showError(r.error) : setResult({ ok: true, text: `Sold for ${money(r.amount)}. The lobby is clear.` })))
              .finally(() => setPending(undefined))
          }
          onCancel={() => setPending(undefined)}
        >
          <p>
            A local merchant offers {money(pending.goods.value)} for the lot: {Math.round(PHYSICAL_DISCOUNT * 100)}% below spot. Sell?
          </p>
        </Confirm>
      )}
    </div>
  );
}
