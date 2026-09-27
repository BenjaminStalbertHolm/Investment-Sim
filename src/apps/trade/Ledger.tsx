import type { LedgerEntry } from '../../sim/account';
import { formatClock } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { contractLabel } from '../../sim/commodities';
import { CONTRACTS } from '../../sim/data/commodities';
import { FUNDS } from '../../sim/data/funds';
import { useAccountData, useGame } from '../../state/game';
import { VirtualTable, type Column } from '../../ui98/VirtualTable';
import { count, money, price, signedMoney, tone } from '../format';

const KIND: Record<LedgerEntry['kind'], string> = {
  deposit: 'Deposit', withdrawal: 'Withdrawal', buy: 'Purchase', sell: 'Sale', short: 'Short sale', cover: 'Cover',
  commission: 'Commission', dividend: 'Dividend', acquisition: 'Takeover', writeoff: 'Write-off', borrowFee: 'Borrow fees',
  interest: 'Interest', futures: 'Futures', variation: 'Variation margin', delivery: 'Delivery', storage: 'Storage',
  goods: 'Goods sold', fine: 'Fine', loan: 'Loan', repayment: 'Repayment', loanInterest: 'Loan interest', loanFee: 'Loan fee',
  fund: 'Index fund', sobFine: 'SOB fine', investment: 'Investment', feeShare: 'Investor’s fees',
  consulting: 'Consulting fees', offshore: 'Offshore transfer', lawsuit: 'Legal settlement', shark: 'Private loan', sharkInterest: 'Private loan interest',
};

/** What goods a commodity code stands for: "bushels of corn". */
const goods = (code?: string) => {
  const d = CONTRACTS.find((c) => c.code === code)?.delivery;
  return d ? `${d.unit} of ${d.what}` : 'goods';
};

/** Cash ledger (spec §12.7), newest first: trades, fees, dividends, interest, borrow fees and futures variation margin. */
export function Ledger() {
  const tickers = useGame((s) => s.directory.tickers);
  const ledger = useAccountData(() => simulation().ledger());
  const rows = (ledger ?? []).map((entry, id) => ({ ...entry, id })).reverse();

  const describe = (e: LedgerEntry) => {
    const what = `${count(e.shares ?? 0)} ${e.company !== undefined ? tickers[e.company] : ''} @ ${price(e.price ?? 0)}`;
    switch (e.kind) {
      case 'deposit':
        return e.note === 'Founding clients' || !e.note ? 'Seed money' + (e.note ? ' from the founding clients' : '') : `From ${e.note}`;
      case 'withdrawal':
        return `Redemption paid to ${e.note}`;
      case 'dividend':
        return e.amount < 0 ? `${count(-e.shares!)} ${tickers[e.company!]} short: paid to the lender` : `${what} a share`;
      case 'acquisition':
        return e.shares! < 0 ? `${count(-e.shares!)} ${tickers[e.company!]} short: covered at the offer @ ${price(e.price!)}` : `${what.replace(' @ ', ' bought out @ ')}`;
      case 'writeoff':
        return `${count(Math.abs(e.shares!))} ${tickers[e.company!]}: the company is bankrupt`;
      case 'commission':
        if (e.fund !== undefined) return `${count(e.shares!)} ${FUNDS[e.fund].ticker} units @ ${price(e.price!)}`;
        return e.contract ? `${count(e.shares!)} ${contractLabel(e.contract)} @ ${price(e.price!)}` : `Order ${e.order}: ${what}`;
      case 'fund':
        return `${e.note === 'sell' ? 'Sold' : 'Bought'} ${count(e.shares!)} ${FUNDS[e.fund!].ticker} units @ ${price(e.price!)}`;
      case 'sobFine':
        return 'Paid to the Securities Oversight Bureau';
      case 'investment':
        return `From ${e.note}, for a share of future fees`;
      case 'feeShare':
        return `${e.note}’s share of the fees earned`;
      case 'borrowFee':
        return `Borrowed shares, ${e.note}`;
      case 'interest':
        return 'On money borrowed from the broker';
      case 'futures':
        return `${e.note === 'sell' ? 'Sold' : 'Bought'} ${count(e.shares!)} ${contractLabel(e.contract!)} @ ${price(e.price!)}${e.amount ? ': closed since the last settlement' : ''}`;
      case 'variation':
        return `${count(e.shares!)} ${contractLabel(e.contract!)} settled @ ${price(e.price!)}`;
      case 'delivery':
        return `${contractLabel(e.contract!)} delivered to the lobby @ ${price(e.price!)}`;
      case 'storage':
        return `${count(e.shares!)} ${goods(e.contract)} in the lobby`;
      case 'goods':
        return `${count(e.shares!)} ${goods(e.contract)}, to a local merchant`;
      case 'fine':
        return `${e.note ?? 'Fine'}${e.contract ? `: ${contractLabel(e.contract)}` : ''}`;
      case 'loan':
      case 'repayment':
      case 'loanInterest':
      case 'loanFee':
        return `First Continental Bank: ${e.note ?? ''}`;
      case 'consulting':
      case 'offshore':
      case 'shark':
      case 'sharkInterest':
        return e.note ?? '';
      case 'lawsuit':
        return `Damages awarded to ${e.note}`;
      default:
        return what;
    }
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
