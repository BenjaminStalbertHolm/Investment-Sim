import { useState } from 'react';
import { formatDate } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { CONFERENCES } from '../../sim/data/lifestyle';
import { FUNDS } from '../../sim/data/funds';
import { SERVICE } from '../../sim/data/darkweb';
import { hash } from '../../sim/press';
import { decodeCompany } from '../../world/company';
import { showError, useAccountData, useGame } from '../../state/game';
import { useShell } from '../../state/shell';
import { useDesk, useIpos, useLifestyle } from '../../sites/hooks';
import { VirtualTable, type Column } from '../../ui98/VirtualTable';
import { AppMenuBar } from '../AppMenuBar';
import { count, money } from '../format';
import type { AppProps } from '../types';
import '../programs.css';

interface Process {
  key: string;
  image: string;
  what: string;
  /** Ends the process, or says why it can't be ended. */
  end(): Promise<string | undefined> | string;
}

const denied = 'Access is denied. The process cannot be ended.';

/**
 * Task Mangler (spec §4A, Ctrl+Alt+Del): the Trader's rules, open orders and scheduled actions as "processes". End Task
 * cancels what can be cancelled.
 */
export default function TaskMangler({ windowId }: AppProps) {
  const desk = useDesk();
  const orders = useGame((s) => s.snapshot?.openOrders ?? []);
  const ipos = useIpos();
  const lifestyle = useLifestyle();
  const garlic = useShell((s) => s.installed.includes('garlic'));
  const dark = useAccountData(() => (garlic ? simulation().darkweb() : Promise.resolve(undefined)));
  const { tickers } = useGame.getState().directory;
  const [selected, setSelected] = useState<string>();

  const processes: Process[] = [
    ...(desk?.rules ?? []).map((r) => ({
      key: `r${r.id}`,
      image: r.kind === 'stopLoss' ? 'STOPLOSS.EXE' : r.kind === 'dca' ? 'DCA.EXE' : 'DEFRAG.EXE',
      what:
        r.kind === 'stopLoss' ? `Stop-loss on ${tickers[r.company]} at ${Math.round(r.pct * 100)}% below cost${desk?.trader ? '' : ' (Not Responding: no Trader)'}`
          : r.kind === 'dca' ? `Buy ${money(r.amount)} of ${r.fund !== undefined ? FUNDS[r.fund].ticker : tickers[r.company!]} every ${r.every}, next ${formatDate(r.next)}`
            : `Monthly rebalance, next ${formatDate(r.next)}`,
      end: () => simulation().deskAction({ do: 'removeRule', id: r.id }),
    })),
    ...orders.map((o) => ({
      key: `o${o.id}`,
      image: `ORDER${o.id}.EXE`,
      what: `${o.side} ${count(o.shares - o.filled)} ${tickers[o.company]} (${o.type}, ${o.tif})`,
      end: async () => ((await simulation().cancelOrder(o.id)) ? undefined : 'The order has already been filled.'),
    })),
    ...(desk?.alerts ?? []).map((a) => ({
      key: `a${a.id}`,
      image: 'PAGER.EXE',
      what: `Price alert: ${tickers[a.company]} ${a.above ? 'above' : 'below'} $${a.level.toFixed(2)}`,
      end: () => simulation().deskAction({ do: 'removeAlert', id: a.id }),
    })),
    ...(ipos?.pending ?? []).filter((p) => p.applied && p.company === undefined).map((p) => ({
      key: `i${p.id}`,
      image: 'IPOAPPLY.EXE',
      what: `IPO application: ${count(p.applied!)} ${decodeCompany(p.genome).ticker}, lists ${formatDate(p.day)}`,
      end: () => simulation().ipoAction({ do: 'withdraw', id: p.id }),
    })),
    ...(lifestyle?.auctions ?? []).filter((a) => !a.result && (a.max !== undefined || a.selling !== undefined)).map((a) => ({
      key: `e${a.id}`,
      image: 'EBUY.EXE',
      what: `${a.selling !== undefined ? 'Selling' : 'Bidding up to ' + money(a.max!) + ' on'} an eBuy item, ends ${formatDate(a.ends)}`,
      end: () => 'eBuy bids cannot be retracted. It says so in the terms and conditions.',
    })),
    ...(lifestyle?.hindsight ? [{ key: 'h', image: 'HINDSGHT.EXE', what: 'Hindsight Research subscription', end: () => simulation().lifestyleAction({ do: 'subscribe', on: false }) }] : []),
    ...(lifestyle?.tickets ?? []).map((t) => ({
      key: `t${t.conference}${t.year}`,
      image: 'TICKET.EXE',
      what: `Ticket: ${CONFERENCES.find((c) => c.id === t.conference)?.name ?? t.conference} ${t.year}`,
      end: () => 'Tickets are non-refundable.',
    })),
    ...(dark?.purchases ?? []).filter((p) => p.done === undefined).map((p) => ({
      key: `d${p.id}`,
      image: `${p.handle.slice(0, 8).toUpperCase()}.EXE`,
      what: `Garlic order: ${SERVICE[p.request.service].name}`,
      end: () => denied,
    })),
  ];
  const process = processes.find((p) => p.key === selected);
  const endTask = async () => {
    if (!process) return;
    const error = await process.end();
    if (error) showError(error);
    setSelected(undefined);
  };
  const columns: Column<Process>[] = [
    { header: 'Image Name', cell: (p) => p.image, width: 110 },
    { header: 'Description', cell: (p) => p.what },
    { header: 'CPU', align: 'right', width: 40, cell: (p) => String(hash(p.key) % 17).padStart(2, '0') },
    { header: 'Mem Usage', align: 'right', width: 80, cell: (p) => `${count(400 + (hash(p.key, 'mem') % 9000))} K` },
  ];
  return (
    <div className="app">
      <AppMenuBar windowId={windowId} />
      <VirtualTable rows={processes} columns={columns} rowKey={(p) => p.key} selected={selected} onSelect={(p) => setSelected(p.key)} empty="No processes running. Hire a Trader and give them rules." />
      <div className="button-row">
        <span>Processes: {processes.length}</span>
        <span className="toolbar-gap" />
        <button disabled={!process} onClick={() => void endTask()}>
          End Task
        </button>
      </div>
    </div>
  );
}
