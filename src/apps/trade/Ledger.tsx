import type { LedgerEntry } from '../../sim/account';
import { formatClock } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { useAccountData, useGame } from '../../state/game';
import { VirtualTable, type Column } from '../../ui98/VirtualTable';
import { count, money, price, signedMoney, tone } from '../format';

const KIND: Record<LedgerEntry['kind'], string> = {
  deposit: 'Deposit', withdrawal: 'Withdrawal', buy: 'Purchase', sell: 'Sale', commission: 'Commission', dividend: 'Dividend',
  acquisition: 'Takeover', writeoff: 'Write-off',
};

/** Cash ledger (spec §12.7), newest first. */
export function Ledger() {
  const tickers = useGame((s) => s.directory.tickers);
  const ledger = useAccountData(() => simulation().ledger());
  const rows = (ledger ?? []).map((entry, id) => ({ ...entry, id })).reverse();

  const describe = (e: LedgerEntry) => {
    if (e.kind === 'deposit') return e.note === 'Founding clients' || !e.note ? 'Seed money' + (e.note ? ' from the founding clients' : '') : `From ${e.note}`;
    if (e.kind === 'withdrawal') return `Redemption paid to ${e.note}`;
    if (e.kind === 'dividend') return `${count(e.shares!)} ${tickers[e.company!]} @ ${price(e.price!)} a share`;
    if (e.kind === 'acquisition') return `${count(e.shares!)} ${tickers[e.company!]} bought out @ ${price(e.price!)}`;
    if (e.kind === 'writeoff') return `${count(e.shares!)} ${tickers[e.company!]}: the company is bankrupt`;
    const what = `${count(e.shares!)} ${tickers[e.company!]} @ ${price(e.price!)}`;
    return e.kind === 'commission' ? `Order ${e.order}: ${what}` : what;
  };
  const columns: Column<LedgerEntry & { id: number }>[] = [
    { header: 'Date', cell: (e) => formatClock(e.time) },
    { header: 'Type', cell: (e) => KIND[e.kind] },
    { header: 'Description', cell: describe },
    { header: 'Amount', align: 'right', cell: (e) => signedMoney(e.amount), tone: (e) => tone(e.amount) },
    { header: 'Balance', align: 'right', cell: (e) => money(e.balance) },
  ];

  return (
    <div className="tab-page">
      <VirtualTable rows={rows} columns={columns} rowKey={(e) => e.id} empty="Nothing yet." />
    </div>
  );
}
