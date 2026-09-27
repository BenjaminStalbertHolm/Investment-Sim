import { useState } from 'react';
import { formatDate } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { EARLY_FEE, lateAmount } from '../../sim/loans';
import type { LoansView } from '../../sim/types';
import { openUrl, useGame } from '../../state/game';
import { BANK, EQUIFACTS, helpUrl } from '../../sites/urls';
import { useFetched } from '../../sites/hooks';
import { Modal } from '../../ui98/Modal';
import { VirtualTable, type Column } from '../../ui98/VirtualTable';
import { money, pct } from '../format';
import { LoanForm } from './LoanForm';
import { RepayForm } from './RepayForm';

type LoanRow = LoansView['loans'][number];

const STATUS = { active: 'Active', repaid: 'Repaid', defaulted: 'Defaulted' };

/** Financing (spec §12.9): bank loans, the credit score, payments due and payoff — what First Continental Bank shows too. */
export function Financing() {
  const revision = useGame((s) => s.snapshot?.revision);
  const day = useGame((s) => (s.snapshot ? Math.floor(s.snapshot.time / 1440) : 0));
  const cash = useGame((s) => s.snapshot?.account.cash ?? 0);
  const view = useFetched(() => simulation().loans(), [revision, day]);
  const [dialog, setDialog] = useState<{ kind: 'new' } | { kind: 'repay'; loan?: number }>();
  const [selected, setSelected] = useState<number>();
  const [notice, setNotice] = useState<string>();
  if (!view) return <div className="tab-page">Calling the bank…</div>;
  const active = view.loans.filter((l) => l.status === 'active');
  const overdue = active.filter((l) => l.late);
  const done = (text: string) => {
    setDialog(undefined);
    setNotice(text);
  };

  const columns: Column<LoanRow>[] = [
    { header: 'Loan', align: 'right', cell: (l) => l.id },
    { header: 'Signed', cell: (l) => formatDate(l.opened) },
    { header: 'Principal', align: 'right', cell: (l) => money(l.principal) },
    { header: 'Owed', align: 'right', cell: (l) => (l.status === 'active' ? money(l.balance) : '') },
    { header: 'Interest so far', align: 'right', cell: (l) => (l.status === 'active' ? money(l.interest + (l.late ? l.late.interest + l.late.fee : 0)) : '') },
    { header: 'Repayment', cell: (l) => `${l.structure === 'amortising' ? 'Amortising' : 'Interest only'}, ${l.months} months` },
    { header: 'Next payment', cell: (l) => (l.next ? `${formatDate(l.next.day)}: ${money(l.next.interest + l.next.principal)}` : '') },
    { header: 'To pay off', align: 'right', cell: (l) => (l.status === 'active' ? money(l.payoff) : '') },
    { header: 'Status', cell: (l) => (l.late ? `LATE — pay by ${formatDate(l.late.deadline)}` : STATUS[l.status]), tone: (l) => (l.late || l.status === 'defaulted' ? 'down' : '') },
  ];

  return (
    <div className="tab-page">
      {overdue.map((l) => (
        <p key={l.id} className="margin-banner">
          ⚠ A payment of {money(lateAmount(l))} on loan {l.id} is overdue. Pay it by {formatDate(l.late!.deadline)}, or the loan
          defaults and the bank sells your positions to recover it.{' '}
          <button onClick={() => setDialog({ kind: 'repay', loan: l.id })}>Pay Now…</button>
        </p>
      ))}
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
        {Math.round(view.factors.trend)} points. <a role="link" className="help-link" onClick={() => openUrl(`http://${EQUIFACTS}/`)}>Full report at Equifacts</a> ·{' '}
        <a role="link" className="help-link" onClick={() => openUrl(`http://${BANK}/`)}>First Continental Bank</a> ·{' '}
        <a role="link" className="help-link" onClick={() => openUrl(helpUrl('loans'))}>How loans work</a>
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
        onOpen={(l) => l.status === 'active' && setDialog({ kind: 'repay', loan: l.id })}
        empty="No loans. The rate is set by the tier your total bank debt falls into."
      />
      <div className="button-row">
        <button onClick={() => setDialog({ kind: 'new' })}>New Loan…</button>
        <button
          disabled={!active.length}
          onClick={() => setDialog({ kind: 'repay', loan: active.find((l) => l.id === selected)?.id })}
        >
          Repay…
        </button>
        {notice && <span className="ticket-result">{notice}</span>}
      </div>
      <p className="hint">
        {cash < 0
          ? `You are borrowing ${money(-cash)} from your broker on margin, at ${pct(view.marginRate, 2)} a year.`
          : `Money borrowed from your broker on margin costs ${pct(view.marginRate, 2)} a year.`}{' '}
        Bank interest accrues every day and is paid with each monthly payment, on the first trading day of the month. Repay
        early at any time for a {Math.round(EARLY_FEE * 100)}% fee on the principal repaid.
      </p>
      {dialog?.kind === 'new' && (
        <Modal title="New Loan — First Continental Bank" onClose={() => setDialog(undefined)}>
          <LoanForm headroom={view.headroom} onSigned={done} />
        </Modal>
      )}
      {dialog?.kind === 'repay' && (
        <Modal title="Repay a Loan — First Continental Bank" onClose={() => setDialog(undefined)}>
          <RepayForm loans={view.loans} initial={dialog.loan} onDone={done} />
        </Modal>
      )}
    </div>
  );
}
