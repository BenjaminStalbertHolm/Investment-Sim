import { useState } from 'react';
import { formatDate } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { BANK_LIMIT, GRACE_DAYS, LATE_FEE, MIN_LOAN, TERMS, TIERS, type Structure } from '../../sim/loans';
import { autosave, useGame } from '../../state/game';
import { useFetched } from '../../sites/hooks';
import { Confirm } from '../../ui98/Modal';
import { money, pct } from '../format';

const STEP = 10_000;

/**
 * Snaps the amount slider to a tier's limit when it is close (spec §16A: the slider snaps to tiers), so the player sees
 * where the rate steps up.
 */
function snap(value: number, max: number): number {
  const near = TIERS.find((t) => t.max <= max && Math.abs(value - t.max) <= max * 0.03);
  return near ? near.max : Math.round(value / STEP) * STEP;
}

/**
 * Applying for a loan (spec §16A), in MajorTrade → Financing and on First Continental Bank's web site: amount, how to
 * repay, term; before signing, the rate, the monthly payment, the interest over the term and what a missed payment
 * means. The game autosaves before the loan is signed (spec §18).
 */
export function LoanForm({ headroom, onSigned }: { headroom: number; onSigned?(text: string): void }) {
  const [amount, setAmount] = useState(Math.min(100_000, headroom));
  const [structure, setStructure] = useState<Structure>('amortising');
  const [months, setMonths] = useState(24);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const busy = useGame((s) => s.busy);
  const max = Math.min(headroom, BANK_LIMIT);
  const valid = amount >= MIN_LOAN && amount <= max;
  const quote = useFetched(() => simulation().loanQuote(Math.max(amount, 1), structure, months), [amount, structure, months]);

  const sign = async () => {
    setConfirming(false);
    await autosave();
    const r = await simulation().takeLoan(amount, structure, months);
    if ('error' in r) return setError(r.error);
    setError(undefined);
    onSigned?.(`Loan ${r.loan.id} signed: ${money(amount)} has been paid into your account.`);
  };

  if (max < MIN_LOAN) return <p>You have borrowed all the bank will lend ({money(BANK_LIMIT)}). Beyond this lie only loan sharks.</p>;
  return (
    <div className="loan-form">
      <div className="field-row">
        <label htmlFor="loan-amount">Amount:</label>
        <input
          id="loan-amount-slider"
          type="range"
          min={MIN_LOAN}
          max={max}
          step={STEP}
          value={amount}
          onChange={(e) => setAmount(snap(Number(e.target.value), max))}
        />
        <input id="loan-amount" value={amount} size={10} onChange={(e) => setAmount(Math.round(Number(e.target.value.replace(/[$,\s]/g, '')) || 0))} />
      </div>
      <div className="field-row">
        <span>Repayment:</span>
        {(['amortising', 'interestOnly'] as const).map((s) => (
          <span key={s} className="field-row">
            <input id={`loan-${s}`} type="radio" checked={structure === s} onChange={() => setStructure(s)} />
            <label htmlFor={`loan-${s}`}>{s === 'amortising' ? 'Amortising (even monthly payments)' : 'Interest only, principal at the end'}</label>
          </span>
        ))}
      </div>
      <div className="field-row">
        <label htmlFor="loan-term">Term:</label>
        <select id="loan-term" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          {TERMS.map((m) => (
            <option key={m} value={m}>
              {m / 12} year{m > 12 ? 's' : ''}
            </option>
          ))}
        </select>
      </div>
      {quote && valid && (
        <table className="ticket-estimate">
          <tbody>
            <tr>
              <td>Rate</td>
              <td>
                {pct(quote.rate, 2)} a year ({quote.tier} tier), floating with the Federal Reservoir’s rate
              </td>
            </tr>
            <tr>
              <td>Monthly payment</td>
              <td>
                {money(quote.payment)}
                {quote.balloon ? `, then ${money(quote.balloon)} at the end` : ''}, from {formatDate(quote.firstPayment)}
              </td>
            </tr>
            <tr>
              <td>Interest over the term</td>
              <td>{money(quote.totalInterest)} at today’s rate</td>
            </tr>
            <tr>
              <td>If you miss a payment</td>
              <td>
                A {Math.round(LATE_FEE * 100)}% late fee, a mark on your credit report and {GRACE_DAYS} trading days to pay. Miss again and
                the loan is in default: the bank sells your positions to recover it, and any shortfall is bankruptcy.
              </td>
            </tr>
          </tbody>
        </table>
      )}
      {!valid && <p className="down">The bank lends between {money(MIN_LOAN)} and {money(max)}.</p>}
      <div className="button-row">
        <button className="default" disabled={!valid || !!busy} onClick={() => setConfirming(true)}>
          Sign…
        </button>
        {error && <span className="down">{error}</span>}
      </div>
      {confirming && quote && (
        <Confirm title="Sign Loan Agreement" ok="Sign" onOk={() => void sign()} onCancel={() => setConfirming(false)}>
          <p>
            Borrow {money(amount)} from First Continental Bank at {pct(quote.rate, 2)} a year, over {months / 12} year{months > 12 ? 's' : ''},{' '}
            {structure === 'amortising' ? `repaid ${money(quote.payment)} a month` : `interest of ${money(quote.payment)} a month and ${money(amount)} at the end`}.
          </p>
          <p>Missing a payment costs a late fee; missing two defaults the loan. The game will be autosaved first.</p>
        </Confirm>
      )}
    </div>
  );
}
