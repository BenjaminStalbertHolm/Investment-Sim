import { useEffect, useState } from 'react';
import { opens, type OrderRequest } from '../../sim/account';
import { simulation } from '../../sim/client';
import { HARD_TO_BORROW } from '../../sim/shorts';
import type { Estimate } from '../../sim/types';
import { useGame } from '../../state/game';
import { useTrade, type Ticket } from '../../state/trade';
import { Confirm, Modal } from '../../ui98/Modal';
import { count, money, pct, price } from '../format';
import { SIDES, SIDE_DONE, SIDE_LABEL, TYPES, describeType } from './labels';
import { HelpLink } from '../HelpLink';
import { SymbolSearch } from './SymbolSearch';

/** How often the intern adds a zero, with the gags module on. */
const FAT_FINGER = 0.04;
const integer = (text: string) => (/^\s*[\d,]+\s*$/.test(text) ? Number(text.replace(/[\s,]/g, '')) : NaN);

/** The ticket as an order, if it is filled in. */
function toRequest(t: Ticket): OrderRequest | undefined {
  const shares = integer(t.shares);
  const limit = Number(t.limit);
  const stop = Number(t.stop);
  const trail = Number(t.trail) / 100;
  const needsLimit = t.type === 'limit' || t.type === 'stopLimit';
  const needsStop = t.type === 'stop' || t.type === 'stopLimit';
  if (t.company === undefined || !(shares > 0)) return undefined;
  if ((needsLimit && !(limit > 0)) || (needsStop && !(stop > 0))) return undefined;
  if (t.type === 'trailingStop' && !(trail > 0 && trail <= 0.5)) return undefined;
  return {
    company: t.company, side: t.side, type: t.type, shares, tif: t.tif, replaces: t.replaces,
    limit: needsLimit ? limit : undefined, stop: needsStop ? stop : undefined, trail: t.type === 'trailingStop' ? trail : undefined,
  };
}

/**
 * Order Ticket (spec §12.2): Buy, Sell, Sell Short and Buy to Cover, as market, limit, stop, stop-limit and trailing stop
 * orders; estimated before you confirm, with the margin the position needs and, for short sales, the broker's locate.
 */
export function OrderTicket() {
  const ticket = useTrade((s) => s.ticket);
  const { tickers, names } = useGame((s) => s.directory);
  const quote = useGame((s) => (ticket.company === undefined ? undefined : s.snapshot?.quotes[ticket.company]));
  const held = useGame((s) => s.snapshot?.positions.find((p) => p.company === ticket.company)?.shares ?? 0);
  const trading = useGame((s) => s.snapshot?.phase === 'open' && !s.snapshot.halted);
  const call = useGame((s) => s.snapshot?.account.call);
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

  // The fat-finger intern (Phase 10B, spec §16C.3): now and then an extra zero, with ten seconds to cancel.
  const gags = useGame((s) => s.settings?.modules.gags);
  const [fat, setFat] = useState<{ request: OrderRequest; left: number }>();
  useEffect(() => {
    if (!fat) return;
    if (fat.left <= 0) {
      setFat(undefined);
      void submit(fat.request);
      return;
    }
    const timer = setTimeout(() => setFat({ ...fat, left: fat.left - 1 }), 1000);
    return () => clearTimeout(timer);
  }, [fat]);

  const place = async () => {
    setConfirming(false);
    // A player's own typing, not the simulation's dice: the platform's randomness, as games deal their boards.
    if (gags && !request!.replaces && crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 < FAT_FINGER) {
      return setFat({ request: { ...request!, shares: request!.shares * 10 }, left: 10 });
    }
    return submit(request!);
  };

  const submit = async (order: OrderRequest) => {
    const r = await simulation().placeOrder(order);
    if ('error' in r) return setResult({ ok: false, text: r.error });
    const o = r.order;
    const what = `${SIDE_DONE[o.side]} ${count(o.filled)} ${tickers[o.company]} at ${money(o.price)}`;
    const text =
      o.status === 'filled'
        ? `Order ${o.id} filled: ${what}.`
        : o.status !== 'open'
          ? `Order ${o.id} ${o.status}: ${o.note ?? ''}`
          : o.filled
            ? `Order ${o.id} partly filled: ${what}. The rest is working.`
            : o.type === 'stop' || o.type === 'stopLimit' || o.type === 'trailingStop'
              ? `Order ${o.id} is waiting for its stop.`
              : trading
                ? `Order ${o.id} is working.`
                : `Order ${o.id} is queued for the opening bell.`;
    setResult({ ok: o.status !== 'rejected', text });
    set({ replaces: undefined });
  };

  const buying = ticket.side === 'buy' || ticket.side === 'cover';
  const borrow = estimate?.borrow;
  return (
    <div className="tab-page order-ticket">
      {call && <p className="margin-banner">⚠ Margin call: only orders that reduce positions are accepted until it is met.</p>}
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
            <span>{held < 0 ? `You are short ${count(-held)}` : `You hold ${count(held)}`}</span>
          </div>
        )}
        <div className="field-row">
          <label className="ticket-label">Action:</label>
          {SIDES.map(([side, label]) => (
            <span key={side} className="field-row">
              <input id={`side-${side}`} type="radio" checked={ticket.side === side} onChange={() => set({ side })} />
              <label htmlFor={`side-${side}`}>{label}</label>
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
            {TYPES.map(([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
          </select>
          {(ticket.type === 'stop' || ticket.type === 'stopLimit') && (
            <>
              <label htmlFor="ticket-stop">Stop:</label>
              <input id="ticket-stop" value={ticket.stop} onChange={(e) => set({ stop: e.target.value })} size={8} />
            </>
          )}
          {(ticket.type === 'limit' || ticket.type === 'stopLimit') && (
            <>
              <label htmlFor="ticket-limit">Limit:</label>
              <input id="ticket-limit" value={ticket.limit} onChange={(e) => set({ limit: e.target.value })} size={8} />
            </>
          )}
          {ticket.type === 'trailingStop' && (
            <>
              <label htmlFor="ticket-trail">Trail by:</label>
              <input id="ticket-trail" value={ticket.trail} onChange={(e) => set({ trail: e.target.value })} size={4} />
              <span>%</span>
            </>
          )}
          <HelpLink topic="orders">What do these mean?</HelpLink>
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
                <td>
                  {money(estimate.price)} a share, spread and market impact included
                  {request.type !== 'market' && request.type !== 'limit' ? ', if the stop is reached' : ''}
                </td>
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
                <td className={estimate.buyingPowerAfter < 0 ? 'down' : ''}>
                  {opens(request.side) ? money(estimate.buyingPowerAfter) : `${money(estimate.buyingPower)}, and more once filled`}
                </td>
              </tr>
              <tr>
                <td>Margin requirement</td>
                <td>
                  {estimate.margin.initial > 0
                    ? `${money(estimate.margin.initial)} to open, ${money(estimate.margin.maintenance)} to keep, for the position after this order`
                    : 'None: this order closes the position'}
                </td>
              </tr>
              {borrow && (
                <tr>
                  <td>Borrow</td>
                  <td className={borrow.fee > HARD_TO_BORROW ? 'down' : ''}>
                    {count(borrow.available)} shares available to borrow at {pct(borrow.fee, borrow.fee < 0.01 ? 2 : 1)} a year
                    {borrow.fee > HARD_TO_BORROW ? ' — hard to borrow' : ''}. Short interest {pct(borrow.shortInterest)} of the float.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <p>
            Choose a symbol and a quantity{ticket.type !== 'market' ? ` and the order's ${ticket.type === 'trailingStop' ? 'trail' : 'prices'}` : ''}.
          </p>
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
      {fat && (
        <Modal title="Order Ticket" onClose={() => setFat(undefined)}>
          <div className="dialog-body">
            <div>
              <p className="fat-finger">
                Your intern has helpfully added a zero: <b>{SIDE_LABEL[fat.request.side]} {count(fat.request.shares)}</b> {tickers[fat.request.company]}, not{' '}
                {count(fat.request.shares / 10)}.
              </p>
              <p className="fat-finger">
                Sending in <b>{fat.left}</b> second{fat.left === 1 ? '' : 's'}…
              </p>
            </div>
            <div className="dialog-buttons">
              <button className="default" autoFocus onClick={() => setFat(undefined)}>
                Cancel the Order
              </button>
              <button onClick={() => (setFat(undefined), void submit(fat.request))}>Send It Anyway</button>
            </div>
          </div>
        </Modal>
      )}
      {confirming && request && (
        <Confirm title="Confirm Order" ok="Place Order" onOk={() => void place()} onCancel={() => setConfirming(false)}>
          <p>
            {SIDE_LABEL[request.side]} {count(request.shares)} {tickers[request.company]} ({names[request.company]}),{' '}
            {describeType(request).toLowerCase().replace(/^market$/, 'at market')},{' '}
            {request.tif === 'day' ? 'good for the day' : "good 'til cancelled"}.
          </p>
          {estimate && (
            <p>
              Estimated {buying ? 'cost' : 'proceeds'}: {money(estimate.total)}, including a commission of {money(estimate.commission)}.
            </p>
          )}
          {request.side === 'short' && (
            <p>
              You borrow the shares and sell them: the proceeds stay in your account against the short. You pay the borrow fee
              every night, and any dividend, until you buy to cover. The lender can recall the shares.
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
