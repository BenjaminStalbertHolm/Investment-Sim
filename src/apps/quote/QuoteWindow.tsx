import { useEffect, useState } from 'react';
import { PriceChart } from '../../charts/PriceChart';
import { dayOf, formatDate } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { TIMEFRAMES, type CompanyDetails, type Quote } from '../../sim/types';
import { openUrl, useGame } from '../../state/game';
import { companyUrl, sites } from '../../sites/urls';
import { useTrade } from '../../state/trade';
import { useWindows } from '../../state/windows';
import { AppMenuBar } from '../AppMenuBar';
import { bigMoney, count, pct, price, signed, signedPct, tone } from '../format';
import type { AppProps } from '../types';

/** A company's quote window (spec §12.1): live quote, chart, key stats, and buttons to trade or watch it. */
export default function QuoteWindow({ windowId }: AppProps) {
  const params = useWindows((s) => s.windows.find((w) => w.id === windowId)?.params);
  const company = params?.company ?? 0;
  const timeframe = params?.timeframe ?? '6M';
  const chart = params?.chart ?? 'candles';
  const quote = useGame((s) => s.snapshot?.quotes[company]);
  const { tickers, names } = useGame((s) => s.directory);
  const day = useGame((s) => (s.snapshot ? dayOf(s.snapshot.time) : 0));
  const [details, setDetails] = useState<CompanyDetails>();
  const { setParams, open } = useWindows.getState();

  useEffect(() => {
    let current = true;
    void simulation()
      .details(company)
      .then((d) => current && setDetails(d));
    return () => {
      current = false;
    };
  }, [company, day]);

  const trade = (side: 'buy' | 'sell') => {
    useTrade.getState().trade(company, side);
    open('trade');
  };

  return (
    <div className="app quote-window">
      <AppMenuBar windowId={windowId} />
      <div className="quote-header">
        <div>
          <b className="quote-ticker">{tickers[company]}</b> {names[company]}
          {details && (
            <div className="quote-sub">
              {details.industry} · {details.subIndustry} · {details.hq}
            </div>
          )}
        </div>
        {quote && (
          <div className={`quote-last ${tone(quote.change)}`}>
            <b>{price(quote.last)}</b> {signed(quote.change, quote.last)} ({signedPct(quote.pct)})
          </div>
        )}
      </div>
      <div className="toolbar">
        {TIMEFRAMES.map((tf) => (
          <button key={tf} className={tf === timeframe ? 'pressed' : ''} onClick={() => setParams(windowId, { timeframe: tf })}>
            {tf === 'MAX' ? 'Max' : tf}
          </button>
        ))}
        <span className="toolbar-gap" />
        <label htmlFor={`${windowId}-chart`}>Chart:</label>
        <select id={`${windowId}-chart`} value={chart} onChange={(e) => setParams(windowId, { chart: e.target.value as typeof chart })}>
          <option value="candles">Candlesticks</option>
          <option value="line">Line</option>
        </select>
      </div>
      <PriceChart id={company} timeframe={timeframe} type={chart} />
      {details && quote && <KeyStats details={details} quote={quote} />}
      <div className="button-row">
        <button onClick={() => trade('buy')}>Buy…</button>
        <button onClick={() => trade('sell')}>Sell…</button>
        <button onClick={() => useTrade.getState().watch(company)}>Add to Watchlist</button>
        <button onClick={() => openUrl(companyUrl(sites(useGame.getState().directory, useGame.getState().firmName), company))}>Open Website</button>
      </div>
    </div>
  );
}

function KeyStats({ details: d, quote: q }: { details: CompanyDetails; quote: Quote }) {
  const stats: [string, string][] = [
    ['Open', price(q.open)],
    ['Day range', `${price(q.low)} – ${price(q.high)}`],
    ['Previous close', price(q.prevClose)],
    ['Volume', count(q.volume)],
    ['Avg volume', count(d.adv)],
    ['52-week range', `${price(d.low52)} – ${price(d.high52)}`],
    ['Market cap', bigMoney(q.last * d.shares)],
    ['P/E', d.pe === null ? 'n/a' : d.pe.toFixed(1)],
    ['EPS (TTM)', signed(d.eps, Infinity)],
    ['Revenue (TTM)', bigMoney(d.revenue)],
    ['Dividend yield', d.dividendYield ? pct(d.dividendYield, 2) : 'None'],
    ['Beta', d.beta.toFixed(2)],
    ['Shares out', count(d.shares)],
    ['Float', pct(d.floatPct)],
    ['Next earnings', formatDate(d.nextEarnings)],
    ['CEO', d.ceo],
  ];
  return (
    <div className="key-stats">
      {stats.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <b>{value}</b>
        </div>
      ))}
    </div>
  );
}
