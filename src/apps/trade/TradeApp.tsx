import { useState } from 'react';
import { useGame } from '../../state/game';
import { useShell } from '../../state/shell';
import { useTrade, type TradeTab } from '../../state/trade';
import { Modal } from '../../ui98/Modal';
import { AppMenuBar } from '../AppMenuBar';
import { money, price, signedMoney, signedPct, tone } from '../format';
import type { AppProps } from '../types';
import { Calendar } from './Calendar';
import { Ledger } from './Ledger';
import { OrderTicket } from './OrderTicket';
import { Orders } from './Orders';
import { Portfolio } from './Portfolio';
import { Quotes } from './Quotes';

const TABS: { id: TradeTab; label: string }[] = [
  { id: 'quotes', label: 'Quotes' },
  { id: 'ticket', label: 'Order Ticket' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'orders', label: 'Orders' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'calendar', label: 'Calendar' },
];

/** MajorTrade Pro 98 (spec §12): simple on the surface, capable underneath. */
export default function TradeApp({ windowId }: AppProps) {
  const tab = useTrade((s) => s.tab);
  const tickerTape = useShell((s) => s.tickerTape);
  const [about, setAbout] = useState(false);
  const { setTab } = useTrade.getState();

  return (
    <div className="app">
      <AppMenuBar
        windowId={windowId}
        menus={[
          {
            label: 'View',
            items: [
              ...TABS.map((t) => ({ label: t.label, checked: tab === t.id, onClick: () => setTab(t.id) })),
              { label: 'Ticker Tape', checked: tickerTape, onClick: () => useShell.getState().toggleTickerTape() },
            ],
          },
          { label: 'Help', items: [{ label: 'About MajorTrade Pro 98…', onClick: () => setAbout(true) }] },
        ]}
      />
      <menu role="tablist">
        {TABS.map((t) => (
          <li key={t.id} role="tab" aria-selected={tab === t.id}>
            <a
              href={`#${t.id}`}
              onClick={(e) => {
                e.preventDefault();
                setTab(t.id);
              }}
            >
              {t.label}
            </a>
          </li>
        ))}
      </menu>
      <div className="window tab-panel" role="tabpanel">
        {tab === 'quotes' && <Quotes />}
        {tab === 'ticket' && <OrderTicket />}
        {tab === 'portfolio' && <Portfolio />}
        {tab === 'orders' && <Orders />}
        {tab === 'ledger' && <Ledger />}
        {tab === 'calendar' && <Calendar />}
      </div>
      <StatusBar />
      {about && (
        <Modal title="About MajorTrade Pro 98" onClose={() => setAbout(false)}>
          <div className="dialog-body about">
            <p>
              <b>MajorTrade Pro 98</b>
              <br />
              Version 3.0 for Majorsoft Doors 98. Quotes are delayed by zero minutes, being made up on the spot.
            </p>
            <p>
              Charts by TradingView Lightweight Charts™, copyright © 2025 TradingView, Inc.,{' '}
              <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
                https://www.tradingview.com/
              </a>
              , under the Apache License 2.0.
            </p>
            <div className="dialog-buttons">
              <button className="default" onClick={() => setAbout(false)}>
                OK
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StatusBar() {
  const account = useGame((s) => s.snapshot?.account);
  const index = useGame((s) => s.snapshot?.index);
  return (
    <div className="status-bar">
      <p className="status-bar-field">Cash {account ? money(account.cash) : '—'}</p>
      <p className="status-bar-field">Net worth {account ? money(account.netWorth) : '—'}</p>
      <p className={`status-bar-field ${tone(account?.dayChange ?? 0)}`}>Today {account ? signedMoney(account.dayChange) : '—'}</p>
      <p className={`status-bar-field ${tone(index?.change ?? 0)}`}>
        MAJOR 500 {index ? `${price(index.last)} ${signedPct(index.pct)}` : '—'}
      </p>
    </div>
  );
}
