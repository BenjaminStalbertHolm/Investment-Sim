import { useState } from 'react';
import { formatDate } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { EARLY_FEE } from '../../sim/loans';
import type { LoansView } from '../../sim/types';
import { openUrl, showError, useGame } from '../../state/game';
import { BANK, EQUIFACTS } from '../../sites/urls';
import { useFetched } from '../../sites/hooks';
import { Modal } from '../../ui98/Modal';
import { VirtualTable, type Column } from '../../ui98/VirtualTable';
import { money, pct } from '../format';
import { LoanForm } from './LoanForm';

type LoanRow = LoansView['loans'][number];

const STATUS = { active: 'Active', repaid: 'Repaid', defaulted: 'Defaulted' };

/** Financing (spec §12.9): bank loans, the credit score, payments due and payoff — what First Continental Bank shows too. */
export function Financing() {
  const revision = useGame((s) => s.snapshot?.revision);
  const day = useGame((s) => (s.snapshot ? Math.floor(s.snapshot.time / 1440) : 0));
  const cash = useGame((s) => s.snapshot?.account.cash ?? 0);
  const view = useFetched(() => simulation().loans(), [revision, day]);
  const [dialog, setDialog] = useState<'new' | 'repay'>();
  const [selected, setSelected] = useState<number>();
  const [notice, setNotice] = useState<string>();
  if (!view) return <div className="tab-page">Calling the bank…</div>;
  const loan = view.loans.find((l) => l.id === selected);

  const columns: Column<LoanRow>[] = [
    { header: 'Loan', align: 'right', cell: (l) => l.id },
    { header: 'Signed', cell: (l) => formatDate(l.opened) },
    { header: 'Principal', align: 'right', cell: (l) => money(l.principal) },
    { header: 'Owed', align: 'right', cell: (l) => money(l.balance) },
    { header: 'Repayment', cell: (l) => (l.structure === 'amortising' ? `Amortising, ${l.months} months` : `Interest only, ${l.months} months`) },
    { header: 'Next payment', cell: (l) => (l.next ? `${formatDate(l.next.day)}: ${money(l.next.interest + l.next.principal)}` : '') },
    { header: 'Status', cell: (l) => (l.late ? `LATE — pay by ${formatDate(l.late.deadline)}` : STATUS[l.status]), tone: (l) => (l.late || l.status === 'defaulted' ? 'down' : '') },
  ];

  return (
    <div className="tab-page">
      <div className="summary">
        <div className="figure">
          <span>Credit score</span>
          <b className={view.score < 580 ? 'down' : view.score >= 740 ? 'up' : ''}>{view.score}</b>
        </div>
        <div className="figure">
          <span>Bank rate</span>
          <b>{pct(view.rate, 2)}</b>
        </div>
        <div className="figure">
          <span>Bank debt</span>
          <b>{money(view.debt + view.accrued)}</b>
        </div>
        <div className="figure">
          <span>Can borrow</span>
          <b>{money(view.headroom)}</b>
        </div>
      </div>
      <div className="credit-meter" title="Equifacts credit score, 300–850">
        <span style={{ width: `${((view.score - 300) / 550) * 100}%` }} />
      </div>
      <p className="hint">
        Payment history {view.factors.history >= 0 ? '+' : ''}
        {Math.round(view.factors.history)}, leverage {Math.round(view.factors.leverage)}, net worth trend {view.factors.trend >= 0 ? '+' : ''}
        {Math.round(view.factors.trend)} points. <a role="link" className="mail-link" onClick={() => openUrl(`http://${EQUIFACTS}/`)}>Full report at Equifacts</a> ·{' '}
        <a role="link" className="mail-link" onClick={() => openUrl(`http://${BANK}/`)}>First Continental Bank</a>
      </p>
      <table className="ticket-estimate loan-tiers">
        <tbody>
          <tr>
            {view.tiers.map((t) => (
              <td key={t.name}>
                <b>{t.name}</b> up to {money(t.max)}: {pct(t.rate, 2)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <VirtualTable
        className="loans"
        rows={view.loans}
        columns={columns}
        rowKey={(l) => l.id}
        selected={selected}
        onSelect={(l) => setSelected(l.id)}
        empty="No loans. The rate is set by the tier your total bank debt falls into."
      />
      <div className="button-row">
        <button onClick={() => setDialog('new')}>New Loan…</button>
        <button disabled={!loan || loan.status !== 'active'} onClick={() => setDialog('repay')}>
          Repay Early…
        </button>
        {notice && <span className="ticket-result">{notice}</span>}
      </div>
      <p className="hint">
        {cash < 0
          ? `You are borrowing ${money(-cash)} from your broker on margin, at ${pct(view.marginRate, 2)} a year.`
          : `Money borrowed from your broker on margin costs ${pct(view.marginRate, 2)} a year.`}{' '}
        Payments come out on the first trading day of each month.
      </p>
      {dialog === 'new' && (
        <Modal title="New Loan — First Continental Bank" onClose={() => setDialog(undefined)}>
          <LoanForm
            headroom={view.headroom}
            onSigned={(text) => {
              setDialog(undefined);
              setNotice(text);
            }}
          />
        </Modal>
      )}
      {dialog === 'repay' && loan && <Repay loan={loan} onClose={() => setDialog(undefined)} onDone={setNotice} />}
    </div>
  );
}

function Repay({ loan, onClose, onDone }: { loan: LoanRow; onClose(): void; onDone(text: string): void }) {
  const [amount, setAmount] = useState(String(Math.round(loan.balance * 100) / 100));
  const value = Number(amount.replace(/[$,\s]/g, ''));
  const valid = value > 0 && value <= loan.balance + 0.005;
  const repay = async () => {
    const r = await simulation().repayLoan(loan.id, value);
    if ('error' in r) return showError(r.error);
    onClose();
    onDone(r.loan.status === 'repaid' ? `Loan ${loan.id} repaid in full.` : `Repaid ${money(value)} of loan ${loan.id}.`);
  };
  return (
    <Modal title={`Repay Loan ${loan.id}`} onClose={onClose}>
      <div className="dialog-body">
        <div className="field-row">
          <label htmlFor="repay-amount">Amount to repay:</label>
          <input id="repay-amount" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} size={12} />
        </div>
        <p>
          Early repayment costs {Math.round(EARLY_FEE * 100)}%: {valid ? `${money(value)} plus a fee of ${money(value * EARLY_FEE)}.` : `up to ${money(loan.balance)}.`}
        </p>
        <div className="dialog-buttons">
          <button className="default" disabled={!valid} onClick={() => void repay()}>
            Repay
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}
