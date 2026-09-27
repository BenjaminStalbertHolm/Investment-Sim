import { useState } from 'react';
import { formatDate } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { EARLY_FEE, LATE_FEE, lateAmount } from '../../sim/loans';
import type { LoansView } from '../../sim/types';
import { useGame } from '../../state/game';
import { useFetched } from '../../sites/hooks';
import { money, pct } from '../format';

type LoanRow = LoansView['loans'][number];
type Mode = 'payoff' | 'missed' | 'amount';

/**
 * Paying the bank (spec §16A), in MajorTrade → Financing and on First Continental Bank's site. Pick a loan and how much —
 * all of it, just a missed payment, or an amount — and see before paying how the money is applied (a missed payment,
 * interest to date, principal, the 1% early repayment fee), whether it is free to pay, and what the next payment becomes.
 */
export function RepayForm({ loans, initial, onDone }: { loans: readonly LoanRow[]; initial?: number; onDone?(text: string): void }) {
  const active = loans.filter((l) => l.status === 'active');
  const [id, setId] = useState<number | undefined>(initial ?? (active.find((l) => l.late) ?? active[0])?.id);
  const loan = active.find((l) => l.id === id) ?? active[0];
  const [mode, setMode] = useState<Mode>(loan?.late ? 'missed' : 'payoff');
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const busy = useGame((s) => s.busy);
  const revision = useGame((s) => s.snapshot?.revision);
  const time = useGame((s) => s.snapshot?.time);
  const typed = Number(text.replace(/[$,\s]/g, ''));
  // Paying off sends "everything": the bank takes the payoff amount as it stands when the payment arrives.
  const amount = !loan ? 0 : mode === 'payoff' ? Infinity : mode === 'missed' ? lateAmount(loan) : Number.isFinite(typed) ? typed : 0;
  const quote = useFetched(() => (loan ? simulation().repayQuote(loan.id, amount) : Promise.resolve(undefined)), [loan?.id, amount, revision, time]);

  if (!loan) return <p>You have no loans to repay.</p>;
  const short = quote && quote.total > quote.available + 0.005;
  const canPay = !!quote && quote.total > 0.005 && !short && !busy && (!loan.late || quote.late >= quote.missed - 0.005);

  const pay = async () => {
    const r = await simulation().repayLoan(loan.id, amount);
    if ('error' in r) return setError(r.error);
    setError(undefined);
    setText('');
    onDone?.(r.loan.status === 'repaid' ? `Loan ${loan.id} is paid off: ${money(r.paid)} paid.` : `Paid ${money(r.paid)} on loan ${loan.id}.`);
  };

  const choose = (m: Mode) => {
    setMode(m);
    setError(undefined);
  };

  return (
    <div className="repay-form">
      {active.length > 1 && (
        <div className="field-row">
          <label htmlFor="repay-loan">Loan:</label>
          <select
            id="repay-loan"
            value={loan.id}
            onChange={(e) => {
              const next = active.find((l) => l.id === Number(e.target.value));
              setId(next?.id);
              choose(next?.late ? 'missed' : 'payoff');
            }}
          >
            {active.map((l) => (
              <option key={l.id} value={l.id}>
                No. {l.id}: {money(l.balance)} owed{l.late ? ' (payment overdue)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="repay-owed">
        Loan {loan.id} today: {money(loan.balance)} of principal and {money(loan.interest + (loan.late ? loan.late.interest + loan.late.fee : 0))} of
        interest{loan.late ? ' and late fees' : ''}. Paying it off takes {money(loan.payoff)}, the 1% early repayment fee included.
      </p>
      <div className="field-row">
        <input id="repay-payoff" type="radio" checked={mode === 'payoff'} onChange={() => choose('payoff')} />
        <label htmlFor="repay-payoff">Pay off the whole loan</label>
      </div>
      {loan.late && (
        <div className="field-row">
          <input id="repay-missed" type="radio" checked={mode === 'missed'} onChange={() => choose('missed')} />
          <label htmlFor="repay-missed">
            Only the missed payment: {money(lateAmount(loan))}, due by {formatDate(loan.late.deadline)}
          </label>
        </div>
      )}
      <div className="field-row">
        <input id="repay-amount-mode" type="radio" checked={mode === 'amount'} onChange={() => choose('amount')} />
        <label htmlFor="repay-amount-mode">Pay</label>
        <input
          id="repay-amount"
          aria-label="Amount to pay"
          value={text}
          size={12}
          placeholder="amount"
          onFocus={() => choose('amount')}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {quote && (
        <table className="ticket-estimate">
          <tbody>
            {quote.late > 0 && (
              <tr>
                <td>Missed payment</td>
                <td>{money(quote.late)} (with its interest and the {Math.round(LATE_FEE * 100)}% late fee)</td>
              </tr>
            )}
            <tr>
              <td>Interest to date</td>
              <td>{money(quote.interest)}</td>
            </tr>
            <tr>
              <td>Principal</td>
              <td>{money(quote.principal)}</td>
            </tr>
            <tr>
              <td>Early repayment fee</td>
              <td>
                {money(quote.fee)} ({Math.round(EARLY_FEE * 100)}% of the principal repaid)
              </td>
            </tr>
            <tr>
              <td>
                <b>You pay</b>
              </td>
              <td>
                <b>{money(quote.total)}</b>
              </td>
            </tr>
            <tr>
              <td>Afterwards</td>
              <td>
                {quote.payoff
                  ? 'The loan is paid off.'
                  : `${money(quote.balanceAfter)} still owed${
                      quote.after ? `; the next payment is about ${money(quote.after.interest + quote.after.principal)} on ${formatDate(quote.after.day)}` : ''
                    }${quote.before && quote.after ? ` (was ${money(quote.before.interest + quote.before.principal)})` : ''}.`}
                {quote.rateAfter < quote.rate - 1e-6 && ` Your borrowing moves to a cheaper tier: ${pct(quote.rateAfter, 2)} instead of ${pct(quote.rate, 2)}.`}
              </td>
            </tr>
          </tbody>
        </table>
      )}
      {quote && (
        <p className={short ? 'down' : 'hint'}>
          {short
            ? `You can pay the bank ${money(quote.available)} now. Your positions need the rest of your money as margin: sell something or wait for more cash.`
            : `Money free to pay the bank: ${money(quote.available)}.`}
          {mode === 'amount' && quote.total > 0 && quote.total < amount - 0.005 && ` That is more than the loan needs: only ${money(quote.total)} is taken.`}
        </p>
      )}
      {loan.late && quote && quote.late < quote.missed - 0.005 && <p className="down">The missed payment of {money(quote.missed)} has to be paid first.</p>}
      <div className="button-row">
        <button className="default" disabled={!canPay} onClick={() => void pay()}>
          {quote && quote.total > 0 ? `Pay ${money(quote.total)}` : 'Pay'}
        </button>
        {error && <span className="down">{error}</span>}
      </div>
    </div>
  );
}
