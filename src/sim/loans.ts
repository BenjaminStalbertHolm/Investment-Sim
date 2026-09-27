import { pmt } from 'financial';
import { isTradingDay, nextTradingDay } from './calendar';

/**
 * Bank loans and credit (spec §16A). First Continental Bank lends up to $5,000,000 in all; the tier the firm's total bank
 * debt falls in sets the spread over the Federal Reservoir's rate, so a second loan can't dodge a higher rate. The rate
 * floats with the policy rate, moves up to 2 points with the credit score and scales with the difficulty's multiplier.
 * Payments come out on the first trading day of each month; a missed one gets five trading days' grace and a late fee,
 * and a second miss is a default: the bank sells the firm's positions to recover the loan.
 */

export const TIERS = [
  { name: 'Bronze', max: 100_000, spread: 0.03 },
  { name: 'Silver', max: 500_000, spread: 0.05 },
  { name: 'Gold', max: 1_000_000, spread: 0.075 },
  { name: 'Platinum', max: 5_000_000, spread: 0.11 },
] as const;
export type Tier = (typeof TIERS)[number];

/** The most the bank will lend in all. Beyond it are only loan sharks (Phase 9). */
export const BANK_LIMIT = 5_000_000;
export const MIN_LOAN = 10_000;
/** Fee on repaying early, and on a missed payment, as shares of the amount. */
export const EARLY_FEE = 0.01;
export const LATE_FEE = 0.05;
/** Trading days to make a missed payment good. */
export const GRACE_DAYS = 5;
/** Terms on offer, in months: one to five years. */
export const TERMS = [12, 24, 36, 48, 60];
/** Days in the year interest is counted over. */
export const DAY_COUNT = 365;

export type Structure = 'amortising' | 'interestOnly';

export interface Loan {
  id: number;
  principal: number;
  /** Principal still owed. */
  balance: number;
  structure: Structure;
  months: number;
  /** Day signed: payments fall on the first trading day of each following month. */
  opened: number;
  /** Payments made. */
  paid: number;
  /** Interest accrued since the last payment and not yet paid, and the day it has been counted up to. */
  interest: number;
  accruedTo: number;
  missed: number;
  /**
   * A missed payment being given time: its interest and the late fee (charged when missed, owed until paid), its
   * principal, and the last trading day to pay.
   */
  late?: { interest: number; fee: number; principal: number; deadline: number };
  interestPaid: number;
  status: 'active' | 'repaid' | 'defaulted';
  closed?: number;
}

/** A line of the credit report (spec §16A, Equifacts). */
export interface CreditEvent {
  day: number;
  kind: 'opened' | 'late' | 'paidLate' | 'default' | 'repaid';
  loan: number;
  amount: number;
}

export interface LoansState {
  loans: Loan[];
  nextId: number;
  /** Payment history points on the credit report: up with each payment made on time, down with misses and defaults. */
  history: number;
  record: CreditEvent[];
}

export const newLoans = (): LoansState => ({ loans: [], nextId: 1, history: 0, record: [] });

/** Principal owed to the bank (a defaulted loan's is what the bank could not recover). */
export const bankDebt = (state: LoansState) => state.loans.reduce((a, l) => a + (l.status === 'repaid' ? 0 : l.balance), 0);

/** Interest accrued and not yet paid, and the interest and late fees of missed payments: debts, like the principal. */
export const accrued = (state: LoansState) =>
  state.loans.reduce((a, l) => a + (l.status === 'active' ? l.interest : 0) + (l.late ? l.late.interest + l.late.fee : 0), 0);

/** Counts a loan's interest up to `day` at an annual `rate`. Returns the interest added. */
export function accrue(loan: Loan, day: number, rate: number): number {
  const days = day - loan.accruedTo;
  if (days <= 0 || loan.status !== 'active') return 0;
  const interest = (loan.balance * rate * days) / DAY_COUNT;
  loan.interest += interest;
  loan.accruedTo = day;
  return interest;
}

export const tierOf = (debt: number): Tier => TIERS.find((t) => debt <= t.max) ?? TIERS[TIERS.length - 1];

/** The bank's rate on all its loans to the firm: policy rate + the tier's spread × the difficulty's multiplier, ±2 points of credit. */
export function bankRate(debt: number, score: number, policy: number, multiplier: number): number {
  const credit = Math.max(-0.02, Math.min(0.02, (0.02 * (650 - score)) / 200));
  return policy + tierOf(debt).spread * multiplier + credit;
}

const monthOf = (day: number) => {
  const d = new Date(day * 86_400_000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

/** The first trading day of a month (year × 12 + month). */
export function firstTradingDay(month: number): number {
  const day = Date.UTC(Math.floor(month / 12), month % 12, 1) / 86_400_000;
  return isTradingDay(day) ? day : nextTradingDay(day);
}

/** The day a loan's `n`th payment falls due. */
export const paymentDay = (loan: Loan, n: number) => firstTradingDay(monthOf(loan.opened) + n);

/** Whether a day is the first trading day of its month: when payments fall due. */
export const isPaymentDay = (day: number) => firstTradingDay(monthOf(day)) === day;

export interface Payment {
  day: number;
  interest: number;
  principal: number;
}

/**
 * The payments still to come at an annual `rate` (the rate floats, so later ones will differ): each month's interest
 * as it accrues day by day, and the principal — for an amortising loan the rest of an even payment over the months left,
 * worked out afresh each month on what is still owed (so repaying early lowers the payments); for an interest-only
 * loan all of it at the end. A missed payment being given time is not among them.
 */
export function schedule(loan: Loan, rate: number): Payment[] {
  const out: Payment[] = [];
  let balance = loan.balance - (loan.late?.principal ?? 0);
  let interest = loan.interest;
  let from = loan.accruedTo;
  for (let n = loan.paid + (loan.late ? 2 : 1); n <= loan.months && balance > 0.005; n++) {
    const day = paymentDay(loan, n);
    interest += (balance * rate * Math.max(0, day - from)) / DAY_COUNT;
    const left = loan.months - n + 1;
    const principal =
      left <= 1 ? balance : loan.structure === 'interestOnly' ? 0 : Math.min(balance, Math.max(0, pmt(rate / 12, left, -balance) - interest));
    out.push({ day, interest, principal });
    balance -= principal;
    interest = 0;
    from = day;
  }
  return out;
}

/** The next payment due, if any. */
export const nextPayment = (loan: Loan, rate: number): Payment | undefined => schedule(loan, rate)[0];

/** A missed payment still owed: its interest, late fee and principal. */
export const lateAmount = (loan: Loan) => (loan.late ? loan.late.interest + loan.late.fee + loan.late.principal : 0);

/** Everything it takes to clear a loan today: a missed payment, interest to date, and the principal plus the early fee. */
export const payoffAmount = (loan: Loan) => lateAmount(loan) + loan.interest + (loan.balance - (loan.late?.principal ?? 0)) * (1 + EARLY_FEE);

export interface Repayment {
  /** A missed payment, paid first; then interest accrued to date; then principal, with the early repayment fee on it. */
  late: number;
  interest: number;
  principal: number;
  fee: number;
  total: number;
  /** Whether it clears the loan. */
  payoff: boolean;
}

/**
 * How a payment of `amount` to the bank is applied (spec §16A): a missed payment first, then the interest accrued to
 * date, then principal, which carries the 1% early repayment fee. More than the payoff amount pays only that.
 */
export function splitRepayment(loan: Loan, amount: number): Repayment {
  const late = Math.min(lateAmount(loan), amount);
  const open = loan.balance - (loan.late?.principal ?? 0);
  let rest = Math.min(amount, payoffAmount(loan)) - late;
  const interest = Math.max(0, Math.min(rest, loan.interest));
  rest -= interest;
  let principal = Math.max(0, Math.min(open, rest / (1 + EARLY_FEE)));
  if (open - principal < 0.005) principal = open;
  const fee = principal * EARLY_FEE;
  const payoff = open - principal < 0.005 && late >= lateAmount(loan) - 0.005 && loan.interest - interest < 0.005;
  return { late, interest, principal, fee, total: late + interest + principal + fee, payoff };
}

/** What a new loan costs at today's rate: the rate, the first monthly payment and the interest over its whole term. */
export function quoteLoan(amount: number, structure: Structure, months: number, rate: number): { payment: number; totalInterest: number; balloon: number } {
  const monthly = rate / 12;
  if (structure === 'interestOnly') return { payment: amount * monthly, totalInterest: amount * monthly * months, balloon: amount };
  const payment = pmt(monthly, months, -amount);
  return { payment, totalInterest: payment * months - amount, balloon: 0 };
}

/**
 * The credit score (spec §16A, Equifacts, 300–850): payment history, leverage and the trend of net worth. The regulator's
 * record joins it with Phase 8. `debt` includes margin borrowing; `trend` is net worth's change over six months.
 */
export function creditScore(history: number, debt: number, netWorth: number, trend: number): { score: number; history: number; leverage: number; trend: number } {
  const leverage = netWorth <= 0 ? -250 : -130 * Math.min(1, debt / (2 * netWorth));
  const growth = Math.max(-60, Math.min(60, 150 * trend));
  return { score: Math.max(300, Math.min(850, Math.round(680 + history + leverage + growth))), history, leverage, trend: growth };
}

/** Payment history points: made on time, repaid in full, paid late, missed and defaulted. */
export const HISTORY = { onTime: 2, maxOnTime: 80, repaid: 20, late: -70, default: -200 };
