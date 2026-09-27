import { money, pct, signedMoney, tone } from '../../apps/format';
import { LoanForm } from '../../apps/trade/LoanForm';
import { RepayForm } from '../../apps/trade/RepayForm';
import type { LedgerEntry } from '../../sim/account';
import { START_DAY, formatClock, formatDate, gameYear } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import type { CreditEvent } from '../../sim/loans';
import type { LoansView } from '../../sim/types';
import { useAccountData, useGame } from '../../state/game';
import { useLoans } from '../hooks';
import { BANK, EQUIFACTS, FED } from '../urls';
import { Link, useTitle } from '../web';

const BANKING: Partial<Record<LedgerEntry['kind'], string>> = { loan: 'Loan proceeds', repayment: 'Principal repaid', loanInterest: 'Interest', loanFee: 'Fee' };
const STATUS = { active: 'Current', repaid: 'Paid in full', defaulted: 'DEFAULTED' };

/**
 * First Continental Bank (spec §14.2, §16A): its business lending rates, the loan application — the same form as
 * MajorTrade → Financing — and the firm's loans and statements.
 */
export function FirstContinental({ url }: { url: URL }) {
  const page = url.pathname.replace(/^\//, '');
  const firmName = useGame((s) => s.firmName);
  const view = useLoans();
  return (
    <div className="site-bank">
      <div className="bank-header">
        <Link href={`http://${BANK}/`} className="bank-logo">
          First Continental Bank
        </Link>
        <span className="bank-nav">
          <Link href="/">Business Lending</Link> | <Link href="/apply">Apply Online</Link> | <Link href="/loans">Your Loans &amp; Statements</Link> |{' '}
          <Link href="/pay">Make a Payment</Link>
        </span>
      </div>
      <div className="bank-body">
        {!view ? (
          <p>Please wait while we verify your connection is secure…</p>
        ) : page === 'apply' ? (
          <Apply headroom={view.headroom} />
        ) : page === 'pay' ? (
          <Pay view={view} />
        ) : page === 'loans' ? (
          <Statements firmName={firmName} view={view} />
        ) : (
          <Lending firmName={firmName} view={view} />
        )}
      </div>
      <p className="bank-footer">
        First Continental Bank, N.A. Member FDIF. Equal Housing Lender. © {gameYear(START_DAY)}. Rates float with the{' '}
        <Link href={`http://${FED}/`}>Federal Reservoir</Link>’s policy rate and depend on your{' '}
        <Link href={`http://${EQUIFACTS}/`}>Equifacts credit score</Link>.
      </p>
    </div>
  );
}

function Lending({ firmName, view }: { firmName: string; view: LoansView }) {
  useTitle('First Continental Bank — Business Lending');
  return (
    <>
      <h2>Business Lending for {firmName}</h2>
      <p>
        Term loans from $10,000 to $5,000,000 for investment firms, over one to five years. Choose even monthly payments, or pay the
        interest only and the principal at the end. Your rate is set by the tier your <b>total</b> borrowing with us falls into.
      </p>
      <table className="bank-table" cellPadding={4}>
        <thead>
          <tr>
            <th>Tier</th>
            <th>Total borrowing up to</th>
            <th>Your rate today</th>
          </tr>
        </thead>
        <tbody>
          {view.tiers.map((t) => (
            <tr key={t.name}>
              <td>{t.name}</td>
              <td className="right">{money(t.max)}</td>
              <td className="right">{pct(t.rate, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Federal Reservoir rate: {pct(view.policy, 2)}. Your Equifacts score: <b>{view.score}</b>. You have borrowed{' '}
        {money(view.debt)}; we could lend you {money(view.headroom)} more.
      </p>
      <p>
        <Link href="/apply">Apply online in minutes »</Link>
      </p>
    </>
  );
}

function Pay({ view }: { view: LoansView }) {
  useTitle('First Continental Bank — Make a Payment');
  return (
    <>
      <h2>Make a Payment</h2>
      <p>
        Pay a missed payment, part of a loan, or all of it. We apply your money to any missed payment first, then to the
        interest accrued to today, then to the principal, which carries a fee of 1%. Paying early lowers your later
        payments, and a smaller debt may fall into a cheaper tier.
      </p>
      {view.loans.some((l) => l.status === 'active') ? (
        <div className="bank-form">
          <RepayForm loans={view.loans} />
        </div>
      ) : (
        <p>
          You have no loans with us. <Link href="/apply">Apply online »</Link>
        </p>
      )}
    </>
  );
}

function Apply({ headroom }: { headroom: number }) {
  useTitle('First Continental Bank — Apply Online');
  return (
    <>
      <h2>Loan Application</h2>
      <div className="bank-form">
        <LoanForm headroom={headroom} />
      </div>
      <p>
        Funds are paid into your brokerage account at once. Payments are collected on the first trading day of each month.
      </p>
    </>
  );
}

function Statements({ firmName, view }: { firmName: string; view: LoansView }) {
  useTitle('First Continental Bank — Your Loans');
  const ledger = useAccountData(() => simulation().ledger());
  const lines = (ledger ?? []).filter((e) => BANKING[e.kind]).reverse();
  return (
    <>
      <h2>Loans for {firmName}</h2>
      {view.loans.length ? (
        <table className="bank-table" cellPadding={4}>
          <thead>
            <tr>
              <th>Loan</th>
              <th>Signed</th>
              <th>Principal</th>
              <th>Balance</th>
              <th>Repayment</th>
              <th>Next payment</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {view.loans.map((l) => (
              <tr key={l.id}>
                <td>No. {l.id}</td>
                <td>{formatDate(l.opened)}</td>
                <td className="right">{money(l.principal)}</td>
                <td className="right">{money(l.balance)}</td>
                <td>
                  {l.structure === 'amortising' ? 'Amortising' : 'Interest only'}, {l.months} months
                </td>
                <td>{l.next ? `${formatDate(l.next.day)}: ${money(l.next.interest + l.next.principal)}` : ''}</td>
                <td className={l.late || l.status === 'defaulted' ? 'down' : ''}>
                  {l.late ? `PAST DUE — pay ${money(l.late.interest + l.late.fee + l.late.principal)} by ${formatDate(l.late.deadline)}` : STATUS[l.status]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>
          You have no loans with us. <Link href="/apply">Apply online »</Link>
        </p>
      )}
      {view.loans.some((l) => l.status === 'active') && (
        <p>
          <Link href="/pay">Make a payment or pay off a loan »</Link>
        </p>
      )}
      <h3>Statement</h3>
      {lines.length ? (
        <table className="bank-table" cellPadding={4}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.slice(0, 40).map((e, j) => (
              <tr key={j}>
                <td>{formatClock(e.time)}</td>
                <td>
                  {BANKING[e.kind]}: {e.note}
                </td>
                <td className={`right ${tone(e.amount)}`}>{signedMoney(e.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No transactions.</p>
      )}
      <p>
        Interest accrues every day on what you owe, at your floating rate, and is collected with each monthly payment. You can
        also make payments in MajorTrade Pro 98 → Financing.
      </p>
    </>
  );
}

const BANDS: [number, string][] = [
  [800, 'Exceptional'],
  [740, 'Very Good'],
  [670, 'Good'],
  [580, 'Fair'],
  [300, 'Poor'],
];

const EVENTS: Record<CreditEvent['kind'], (e: CreditEvent) => string> = {
  opened: (e) => `Loan No. ${e.loan} opened with First Continental Bank: ${money(e.amount)}`,
  late: (e) => `Payment of ${money(e.amount)} on loan No. ${e.loan} MISSED`,
  paidLate: (e) => `Late payment of ${money(e.amount)} on loan No. ${e.loan} received`,
  default: (e) => `Loan No. ${e.loan} IN DEFAULT: ${money(e.amount)} recovered by the lender`,
  repaid: (e) => `Loan No. ${e.loan} paid in full`,
};

/** Equifacts (spec §14.2, §16A): the firm's credit score, what makes it up, and its record. */
export function Equifacts() {
  useTitle('Equifacts — Your Credit Report');
  const firmName = useGame((s) => s.firmName);
  const view = useLoans();
  const band = view && BANDS.find(([min]) => view.score >= min)![1];
  const factor = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))} points`;
  return (
    <div className="site-equifacts">
      <div className="eq-header">
        <Link href={`http://${EQUIFACTS}/`} className="eq-logo">
          EQUIFACTS
        </Link>
        <span>The facts about your credit. Most of them.</span>
      </div>
      {!view ? (
        <p>Retrieving your file…</p>
      ) : (
        <div className="eq-body">
          <h2>Business Credit Report: {firmName}</h2>
          <div className="eq-score">
            <span className="eq-number">{view.score}</span>
            <span>
              <b>{band}</b>
              <br />
              on a scale of 300 to 850
            </span>
          </div>
          <table className="eq-table" cellPadding={4}>
            <tbody>
              <tr>
                <th>Payment history</th>
                <td>{factor(view.factors.history)}</td>
                <td>Payments made on time raise it; missed payments and defaults cut it hard.</td>
              </tr>
              <tr>
                <th>Leverage</th>
                <td>{factor(view.factors.leverage)}</td>
                <td>What you owe the bank ({money(view.debt)}) and your broker, against your net worth.</td>
              </tr>
              <tr>
                <th>Net worth trend</th>
                <td>{factor(view.factors.trend)}</td>
                <td>Whether your firm has grown or shrunk over the last six months.</td>
              </tr>
              <tr>
                <th>Regulatory record</th>
                <td>{factor(view.factors.sob)}</td>
                <td>{view.factors.sob < 0 ? 'Actions by the Securities Oversight Bureau are on file.' : 'No actions by the Securities Oversight Bureau on file.'}</td>
              </tr>
            </tbody>
          </table>
          <h3>Record</h3>
          {view.record.length ? (
            <ul>
              {[...view.record].reverse().map((e, j) => (
                <li key={j} className={e.kind === 'late' || e.kind === 'default' ? 'down' : ''}>
                  {formatDate(e.day)}: {EVENTS[e.kind](e)}
                </li>
              ))}
            </ul>
          ) : (
            <p>Nothing on file. A thin file, as we say in the trade.</p>
          )}
          <p>
            Want a better score? Borrow a little, and pay it back on time. <Link href={`http://${BANK}/`}>First Continental Bank</Link>
          </p>
        </div>
      )}
      <p className="eq-footer">Equifacts Credit Information Services, Inc. © {gameYear(START_DAY)}. We know what you did last quarter.</p>
    </div>
  );
}
