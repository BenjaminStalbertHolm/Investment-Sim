import { useEffect, useState } from 'react';
import type { OrderRequest } from '../../sim/account';
import { simulation } from '../../sim/client';
import type { Estimate } from '../../sim/types';
import { useGame } from '../../state/game';
import { useTrade, type Ticket } from '../../state/trade';
import { Confirm } from '../../ui98/Modal';
import { count, money, pct, price } from '../format';
import { SymbolSearch } from './SymbolSearch';

const integer = (text: string) => (/^\s*[\d,]+\s*$/.test(text) ? Number(text.replace(/[\s,]/g, '')) : NaN);

/** The ticket as an order, if it is filled in. */
function toRequest(t: Ticket): OrderRequest | undefined {
  const shares = integer(t.shares);
  const limit = Number(t.limit);
  if (t.company === undefined || !(shares > 0)) return undefined;
  if (t.type === 'limit' && !(limit > 0)) return undefined;
  return { company: t.company, side: t.side, type: t.type, shares, limit: t.type === 'limit' ? limit : undefined, tif: t.tif, replaces: t.replaces };
}

/** Order Ticket (spec §12.2): market and limit orders to buy or sell stocks, estimated before you confirm. */
export function OrderTicket() {
  const ticket = useTrade((s) => s.ticket);
  const { tickers, names } = useGame((s) => s.directory);
  const quote = useGame((s) => (ticket.company === undefined ? undefined : s.snapshot?.quotes[ticket.company]));
  const held = useGame((s) => s.snapshot?.positions.find((p) => p.company === ticket.company)?.shares ?? 0);
  const trading = useGame((s) => s.snapshot?.phase === 'open' && !s.snapshot.halted);
  const [estimate, setEstimate] = useState<Estimate>();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string }>();
  const set = useTrade.getState().setTicket;
  const request = toRequest(ticket);
  const key = JSON.stringify(request);

  useEffect(() => {
    if (!request) return setEstimate(undefined);
    let current = true;
    void simulation()
      .estimate(request)
      .then((e) => current && setEstimate(e));
    return () => {
      current = false;
    };
    // Re-estimate when the order or the price changes.
  }, [key, quote?.last]);

  const place = async () => {
    setConfirming(false);
    const r = await simulation().placeOrder(request!);
    if ('error' in r) return setResult({ ok: false, text: r.error });
    const o = r.order;
    const what = `${o.side === 'buy' ? 'bought' : 'sold'} ${count(o.filled)} ${tickers[o.company]} at ${money(o.price)}`;
    const text =
      o.status === 'filled'
        ? `Order ${o.id} filled: ${what}.`
        : o.status !== 'open'
          ? `Order ${o.id} ${o.status}: ${o.note ?? ''}`
          : o.filled
            ? `Order ${o.id} partly filled: ${what}. The rest is working.`
            : trading
              ? `Order ${o.id} is working.`
              : `Order ${o.id} is queued for the opening bell.`;
    setResult({ ok: o.status !== 'rejected', text });
    set({ replaces: undefined });
  };

  const buying = ticket.side === 'buy';
  return (
    <div className="tab-page order-ticket">
      <fieldset>
        <legend>{ticket.replaces ? `Modify order ${ticket.replaces}` : 'Order'}</legend>
        <div className="field-row">
          <label className="ticket-label">Symbol:</label>
          {ticket.company === undefined ? (
            <SymbolSearch onPick={(company) => set({ company })} />
          ) : (
            <>
              <b>{tickers[ticket.company]}</b>
              <span>{names[ticket.company]}</span>
              <button onClick={() => set({ company: undefined, replaces: undefined })}>Change…</button>
            </>
          )}
        </div>
        {quote && (
          <div className="field-row ticket-quote">
            <span className="ticket-label" />
            <span>Last {price(quote.last)}</span>
            <span>Bid {price(quote.bid)}</span>
            <span>Ask {price(quote.ask)}</span>
            <span>You hold {count(held)}</span>
          </div>
        )}
        <div className="field-row">
          <label className="ticket-label">Action:</label>
          {(['buy', 'sell'] as const).map((side) => (
            <span key={side} className="field-row">
              <input id={`side-${side}`} type="radio" checked={ticket.side === side} onChange={() => set({ side })} />
              <label htmlFor={`side-${side}`}>{side === 'buy' ? 'Buy' : 'Sell'}</label>
            </span>
          ))}
        </div>
        <div className="field-row">
          <label className="ticket-label" htmlFor="ticket-shares">
            Quantity:
          </label>
          <input id="ticket-shares" value={ticket.shares} onChange={(e) => set({ shares: e.target.value })} size={10} />
          <span>shares</span>
        </div>
        <div className="field-row">
          <label className="ticket-label" htmlFor="ticket-type">
            Order type:
          </label>
          <select id="ticket-type" value={ticket.type} onChange={(e) => set({ type: e.target.value as Ticket['type'] })}>
            <option value="market">Market</option>
            <option value="limit">Limit</option>
          </select>
          <label htmlFor="ticket-limit">Limit price:</label>
          <input
            id="ticket-limit"
            value={ticket.limit}
            disabled={ticket.type !== 'limit'}
            onChange={(e) => set({ limit: e.target.value })}
            size={10}
          />
        </div>
        <div className="field-row">
          <label className="ticket-label" htmlFor="ticket-tif">
            Time in force:
          </label>
          <select id="ticket-tif" value={ticket.tif} onChange={(e) => set({ tif: e.target.value as Ticket['tif'] })}>
            <option value="day">Day</option>
            <option value="gtc">Good 'til cancelled</option>
          </select>
        </div>
      </fieldset>
      <fieldset>
        <legend>Estimate</legend>
        {request && estimate ? (
          <table className="ticket-estimate">
            <tbody>
              <tr>
                <td>Estimated price</td>
                <td>{money(estimate.price)} a share, spread and market impact included</td>
              </tr>
              <tr>
                <td>{buying ? 'Estimated cost' : 'Estimated proceeds'}</td>
                <td>{money(estimate.total)}</td>
              </tr>
              <tr>
                <td>Commission</td>
                <td>{money(estimate.commission)}</td>
              </tr>
              <tr>
                <td>Buying power after</td>
                <td className={estimate.buyingPowerAfter < 0 ? 'down' : ''}>{money(estimate.buyingPowerAfter)}</td>
              </tr>
              <tr>
                <td>Margin requirement</td>
                <td>None: this is a cash account</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p>Choose a symbol and a quantity{ticket.type === 'limit' ? ' and a limit price' : ''}.</p>
        )}
        {request && estimate && estimate.volumeShare > 0.05 && (
          <p className="ticket-warning">
            ⚠ This order is {pct(estimate.volumeShare)} of the stock's average daily volume. Expect it to move the price by
            about {pct(estimate.impact, 2)}.
          </p>
        )}
        {request && estimate?.warnings.map((w) => (
          <p key={w} className="ticket-warning">
            ⚠ Mandate breach — {w}
          </p>
        ))}
      </fieldset>
      <div className="button-row">
        <button className="default" disabled={!request} onClick={() => (setResult(undefined), setConfirming(true))}>
          Review Order…
        </button>
        {ticket.replaces && <button onClick={() => set({ replaces: undefined })}>Don't modify</button>}
        {result && <span className={result.ok ? 'ticket-result' : 'ticket-result down'}>{result.text}</span>}
      </div>
      {confirming && request && (
        <Confirm title="Confirm Order" ok="Place Order" onOk={() => void place()} onCancel={() => setConfirming(false)}>
          <p>
            {buying ? 'Buy' : 'Sell'} {count(request.shares)} {tickers[request.company]} ({names[request.company]})
            {request.type === 'limit' ? ` with a limit of ${money(request.limit!)}` : ' at market'},{' '}
            {request.tif === 'day' ? 'good for the day' : "good 'til cancelled"}.
          </p>
          {estimate && (
            <p>
              Estimated {buying ? 'cost' : 'proceeds'}: {money(estimate.total)}, including a commission of {money(estimate.commission)}.
            </p>
          )}
          {ticket.replaces && <p>This replaces order {ticket.replaces}.</p>}
          {!!estimate?.warnings.length && <p className="down">This order would break a client’s mandate: {estimate.warnings.join(' ')}</p>}
          {!trading && <p>The market is closed: the order will wait for the opening bell.</p>}
        </Confirm>
      )}
    </div>
  );
}
