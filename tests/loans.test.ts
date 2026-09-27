import { pmt } from 'financial';
import { beforeAll, describe, expect, it } from 'vitest';
import { writeLetter } from '../src/apps/mail/letters';
import { CLOSE, OPEN, addTradingDays, at, dayOf, formatDate, nextTradingDay } from '../src/sim/calendar';
import { Engine } from '../src/sim/engine';
import {
  BANK_LIMIT, DAY_COUNT, EARLY_FEE, HISTORY, LATE_FEE, TIERS, bankRate, creditScore, firstTradingDay, payoffAmount, tierOf,
} from '../src/sim/loans';
import { DIFFICULTIES, type GameSettings } from '../src/sim/settings';
import { generateWorld, type World } from '../src/world/generator';

// Spec §16A: loan tiers by total bank debt, a floating rate, interest-only or amortising over one to five years, interest
// on the 1st, 1% for repaying early, five trading days' grace for a missed payment and default on the second; Equifacts
// credit scores of 300–850. Spec §16: bankruptcy when an obligation cannot be met after selling everything. Interest
// accrues day by day (actual/365), so a payment carries the interest of the days since the last one.

let world: World;
beforeAll(() => {
  world = generateWorld({ seed: 'loans', companyCount: 1000 });
});
const game = (settings: GameSettings = DIFFICULTIES.medium) => Engine.create(world, { settings, firmName: 'Borrower' });
const month = (day: number) => {
  const d = new Date(day * 86_400_000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};
const sign = (e: Engine, amount: number, structure: 'amortising' | 'interestOnly', months: number) => {
  const r = e.takeLoan(amount, structure, months);
  if ('error' in r) throw new Error(r.error);
  return r.loan;
};

describe('bank loans (spec §16A)', () => {
  it('prices by the tier of the whole bank debt, over the policy rate, adjusted for credit and difficulty', () => {
    expect(TIERS.map((t) => [t.name, t.max, t.spread])).toEqual([
      ['Bronze', 100_000, 0.03], ['Silver', 500_000, 0.05], ['Gold', 1_000_000, 0.075], ['Platinum', 5_000_000, 0.11],
    ]);
    expect(tierOf(100_000).name).toBe('Bronze');
    expect(tierOf(100_001).name).toBe('Silver');
    expect(bankRate(50_000, 650, 0.055, 1)).toBeCloseTo(0.085, 12);
    expect(bankRate(2e6, 650, 0.055, 1.5)).toBeCloseTo(0.055 + 0.165, 12);
    // Up to 2 points either way for credit.
    expect(bankRate(50_000, 850, 0.055, 1)).toBeCloseTo(0.065, 12);
    expect(bankRate(50_000, 300, 0.055, 1)).toBeCloseTo(0.105, 12);
    const e = game();
    const quote = e.loanQuote(80_000, 'amortising', 12);
    expect(quote.tier).toBe('Bronze');
    sign(e, 80_000, 'amortising', 12);
    // A second loan can't dodge the higher rate: both are charged at the tier of the total.
    expect(e.loanQuote(80_000, 'amortising', 12).tier).toBe('Silver');
    sign(e, 80_000, 'amortising', 12);
    expect(e.loans().rate).toBeGreaterThan(quote.rate + 0.015);
    expect(e.takeLoan(BANK_LIMIT, 'amortising', 12)).toEqual({ error: 'The bank lends at most $5,000,000 in all: you can borrow up to $4,840,000 more.' });
    expect(e.takeLoan(5_000, 'amortising', 12)).toEqual({ error: 'The bank lends at least $10,000.' });
    expect(e.takeLoan(50_000, 'amortising', 7)).toEqual({ error: 'Choose a term of one to five years.' });
    // Loan proceeds are cash, and buying power: a loan is leverage too.
    expect(e.account().cash).toBeCloseTo(1_160_000, 6);
    expect(e.account().netWorth).toBeCloseTo(1_000_000, 6);
    expect(e.account().buyingPower).toBeCloseTo(2 * 1_160_000, 6);
  });

  it('debits interest and principal on the first trading day of each month until an amortising loan is repaid', () => {
    const e = game();
    const loan = sign(e, 120_000, 'amortising', 12);
    const start = month(dayOf(e.time));
    let from = dayOf(e.time);
    for (let n = 1; n <= 12; n++) {
      const payday = firstTradingDay(start + n);
      // Just before the payment: interest has accrued each night since the last one at the day's floating rate.
      e.advanceTo(at(payday, OPEN - 1));
      const before = e.loans().loans[0];
      const rate = e.loans().rate;
      expect(before.accruedTo).toBe(payday);
      expect(Math.abs(before.interest - (before.balance * rate * (payday - from)) / DAY_COUNT)).toBeLessThan(before.balance * 0.006 * (payday - from) / DAY_COUNT);
      e.advanceTo(at(payday, OPEN));
      const lines = e.ledger().filter((l) => dayOf(l.time) === payday && l.note?.startsWith(`Loan ${loan.id}`));
      const interest = -lines.find((l) => l.kind === 'loanInterest')!.amount;
      const principal = -lines.find((l) => l.kind === 'repayment')!.amount;
      expect(interest).toBeCloseTo(before.interest, 6);
      // The principal makes an even payment over the months left, worked out on what is owed at the day's rate.
      const left = 12 - (n - 1);
      expect(principal).toBeCloseTo(left > 1 ? pmt(rate / 12, left, -before.balance) - interest : before.balance, 6);
      from = payday;
    }
    const [done] = e.loans().loans;
    expect(done).toMatchObject({ status: 'repaid', balance: 0, paid: 12, interest: 0 });
    expect(e.mail().messages.some((m) => m.kind === 'loanRepaid')).toBe(true);
    expect(e.loans().record.map((r) => r.kind)).toEqual(['opened', 'repaid']);
    expect(e.loans().score).toBeGreaterThan(680);
    const a = e.account();
    expect(a.netWorth - a.deposits).toBeCloseTo(a.realized + a.unrealized, 4);
  }, 60_000);

  it('charges a loan signed late in the month only for the days it was out', () => {
    const e = game();
    // Signed on Friday 30 January: the first payment, on Monday 2 February, carries three days' interest, not a month's.
    e.advanceTo(at(Date.UTC(1998, 0, 30) / 86_400_000, OPEN + 60));
    sign(e, 50_000, 'interestOnly', 12);
    const rate = e.loans().rate;
    const payday = Date.UTC(1998, 1, 2) / 86_400_000;
    expect(e.loans().loans[0].next).toMatchObject({ day: payday, principal: 0 });
    expect(e.loans().loans[0].next!.interest).toBeCloseTo((50_000 * rate * 3) / DAY_COUNT, 6);
    e.advanceTo(at(payday, OPEN));
    const interest = -e.ledger().find((l) => l.kind === 'loanInterest')!.amount;
    expect(interest).toBeCloseTo((50_000 * rate * 3) / DAY_COUNT, 1);
    expect(interest).toBeLessThan(50_000 * rate / 12 / 5);
  });

  it('charges only interest on an interest-only loan, and the whole principal at the end; early repayment costs 1%', () => {
    const e = game();
    sign(e, 200_000, 'interestOnly', 12);
    const start = month(dayOf(e.time));
    e.advanceTo(at(firstTradingDay(start + 3), OPEN));
    expect(e.ledger().filter((l) => l.kind === 'repayment')).toHaveLength(0);
    expect(e.ledger().filter((l) => l.kind === 'loanInterest')).toHaveLength(3);
    expect(e.loans().loans[0].balance).toBe(200_000);
    const cash = e.account().cash;
    // Paying $50,500 right after a payment: no interest has accrued yet, so it is $50,000 of principal and the 1% fee.
    const repaid = e.repayLoan(1, 50_500);
    expect('loan' in repaid && repaid.loan.balance).toBeCloseTo(150_000, 6);
    expect(e.account().cash).toBeCloseTo(cash - 50_000 * (1 + EARLY_FEE), 6);
    expect(e.ledger().at(-1)).toMatchObject({ kind: 'loanFee' });
    expect(e.ledger().at(-1)!.amount).toBeCloseTo(-500, 6);
    e.advanceTo(at(firstTradingDay(start + 12), OPEN));
    const balloon = e.ledger().filter((l) => l.kind === 'repayment').at(-1)!;
    expect(balloon.amount).toBeCloseTo(-150_000, 6);
    expect(e.loans().loans[0].status).toBe('repaid');
  }, 60_000);

  it('gives a missed payment five trading days’ grace and a late fee; a second miss defaults, and the bank sells up', () => {
    const e = game();
    sign(e, 300_000, 'amortising', 24);
    // Spend every dollar of buying power, so the account cannot pay.
    const company = 0;
    const shares = Math.floor((e.account().buyingPower * 0.995) / (e.market.price[company] * 1.02));
    e.placeOrder({ company, side: 'buy', type: 'market', shares, tif: 'day' });
    const payday = firstTradingDay(month(dayOf(e.time)) + 1);
    // Keep the account overdrawn whatever the market does: well short of the payment, well clear of a margin call.
    const drain = () => {
      const excess = e.account().excess;
      if (excess > -60_000) e.s.account.cash -= excess + 60_000;
    };
    e.advanceTo(at(payday, OPEN - 10));
    drain();
    e.advanceTo(at(payday, OPEN));
    const late = e.mail().messages.find((m) => m.kind === 'loanLate')!;
    const loan = e.loans().loans[0];
    expect(loan.missed).toBe(1);
    expect(loan.late).toBeDefined();
    expect(loan.late!.fee).toBeCloseTo(LATE_FEE * (loan.late!.interest + loan.late!.principal), 9);
    expect(late.day).toBe(addTradingDays(payday, 5));
    expect(e.loans().record.at(-1)!.kind).toBe('late');
    // The interest and fee are owed, and count against net worth until paid.
    expect(e.loans().accrued).toBeCloseTo(loan.late!.interest + loan.late!.fee, 6);
    for (let d = payday; d <= addTradingDays(payday, 5); d = nextTradingDay(d)) {
      e.advanceTo(at(d, CLOSE));
      drain();
    }
    e.advanceTo(at(addTradingDays(payday, 6), OPEN + 5));
    const defaulted = e.loans().loans[0];
    expect(defaulted.status).toBe('defaulted');
    expect(e.mail().messages.some((m) => m.kind === 'loanDefault')).toBe(true);
    expect(e.orders().some((o) => o.forced === 'loan')).toBe(true);
    expect(e.loans().record.map((r) => r.kind)).toEqual(['opened', 'late', 'default']);
    expect(e.loans().score).toBeLessThan(600);
  }, 60_000);

  it('applies a payment to interest to date, then principal with the fee, and clears the loan at its payoff amount', () => {
    const e = game();
    sign(e, 300_000, 'amortising', 36);
    e.runSessions(10);
    const loan = e.loans().loans[0];
    expect(loan.interest).toBeGreaterThan(0);
    // The preview and the payment agree.
    const quote = e.repayQuote(loan.id, 100_000)!;
    expect(quote.interest).toBeCloseTo(loan.interest, 6);
    expect(quote.principal).toBeCloseTo((100_000 - loan.interest) / (1 + EARLY_FEE), 6);
    expect(quote.fee).toBeCloseTo(quote.principal * EARLY_FEE, 6);
    expect(quote.total).toBeCloseTo(100_000, 6);
    expect(quote.after!.interest + quote.after!.principal).toBeLessThan(quote.before!.interest + quote.before!.principal);
    const cash = e.account().cash;
    e.repayLoan(loan.id, 100_000);
    const after = e.loans().loans[0];
    expect(after.interest).toBeCloseTo(0, 9);
    expect(after.balance).toBeCloseTo(300_000 - quote.principal, 6);
    expect(e.account().cash).toBeCloseTo(cash - 100_000, 6);
    // Paying off: principal, interest to date and the fee, and not a cent more whatever is offered.
    e.runSessions(3);
    const payoff = payoffAmount(e.loans().loans[0]);
    expect(e.loans().loans[0].payoff).toBeCloseTo(payoff, 6);
    const before = e.account().cash;
    const result = e.repayLoan(loan.id, payoff + 1_000);
    expect('paid' in result && result.paid).toBeCloseTo(payoff, 6);
    expect(e.account().cash).toBeCloseTo(before - payoff, 6);
    expect(e.loans().loans[0]).toMatchObject({ status: 'repaid', balance: 0, interest: 0 });
    expect(e.loans().debt + e.loans().accrued).toBe(0);
    const a = e.account();
    expect(a.netWorth - a.deposits).toBeCloseTo(a.realized + a.unrealized, 4);
    // Nothing more is taken afterwards.
    const count = e.ledger().length;
    e.runSessions(30);
    expect(e.ledger().slice(count).some((l) => l.kind === 'loanInterest' || l.kind === 'repayment')).toBe(false);
  }, 60_000);

  it('only lets the bank take money the positions do not need as margin', () => {
    const e = game();
    sign(e, 100_000, 'amortising', 12);
    const shares = Math.floor((e.account().buyingPower * 0.99) / (e.market.price[0] * 1.02));
    e.placeOrder({ company: 0, side: 'buy', type: 'market', shares, tif: 'day' });
    const available = e.repayQuote(1, 100_000)!.available;
    expect(available).toBeLessThan(100_000);
    const r = e.repayLoan(1, 100_000);
    expect('error' in r && r.error).toMatch(/needed as margin/);
  });

  it('takes a missed payment at once when the firm pays it, instead of waiting for the next open', () => {
    const e = game();
    sign(e, 300_000, 'amortising', 24);
    const shares = Math.floor((e.account().buyingPower * 0.995) / (e.market.price[0] * 1.02));
    e.placeOrder({ company: 0, side: 'buy', type: 'market', shares, tif: 'day' });
    const payday = firstTradingDay(month(dayOf(e.time)) + 1);
    e.advanceTo(at(payday, OPEN - 10));
    // Take the money out (as a withdrawal, so the books still balance): the payment can't be made.
    const drained = e.account().excess + 60_000;
    e.s.account.cash -= drained;
    e.s.account.deposits -= drained;
    e.advanceTo(at(payday, OPEN + 30));
    const late = e.loans().loans[0];
    expect(late.late).toBeDefined();
    const missed = late.late!.interest + late.late!.fee + late.late!.principal;
    // Too little is refused; then the money arrives (a client, a sale) and the firm pays the missed payment itself.
    expect(e.repayLoan(1, missed / 2)).toMatchObject({ error: expect.stringMatching(/missed payment/) });
    e.s.account.cash += 200_000;
    e.s.account.deposits += 200_000;
    const quote = e.repayQuote(1, missed)!;
    expect(quote).toMatchObject({ principal: 0 });
    expect(quote.late).toBeCloseTo(missed, 6);
    const r = e.repayLoan(1, missed);
    expect('loan' in r && r.loan.late).toBeUndefined();
    expect(e.loans().loans[0]).toMatchObject({ status: 'active', paid: 1, missed: 1 });
    expect(e.loans().record.map((x) => x.kind)).toEqual(['opened', 'late', 'paidLate']);
    expect(e.loans().loans[0].next!.day).toBe(firstTradingDay(month(payday) + 1));
    const a = e.account();
    expect(a.netWorth - a.deposits).toBeCloseTo(a.realized + a.unrealized, 4);
  }, 60_000);

  it('goes bankrupt when selling everything cannot repay a defaulted loan', () => {
    const e = game();
    const loan = sign(e, 1_000_000, 'interestOnly', 12);
    // Put everything in one stock, without borrowing from the broker, then lose most of it.
    const shares = Math.floor(2_000_000 / (e.market.price[0] * 1.01));
    e.placeOrder({ company: 0, side: 'buy', type: 'market', shares, tif: 'day' });
    e.advanceTo(at(dayOf(e.time), CLOSE - 5));
    e.market.push(0, -0.7);
    // The balloon falls due at the first payment.
    e.s.loans.loans[0].months = 1;
    e.runSessions(40);
    expect(e.bankrupt).toBe(true);
    const report = e.bankruptcy()!;
    expect(report.cause).toBe('loan');
    expect(report.shortfall).toBeGreaterThan(0);
    expect(report.owed).toBeGreaterThanOrEqual(loan.principal);
    expect(report.history.length).toBeGreaterThan(5);
    expect(report.peak.netWorth).toBeGreaterThan(report.netWorth);
    expect(e.positions()).toHaveLength(0);
    // The court's letter.
    const s = e.exportState();
    const ctx = { directory: e.directory(), firmName: e.firmName, ceoName: e.player.ceoName, seed: e.seed, clients: new Map(s.clients.clients.map((c) => [c.id, c])), news: new Map() };
    const letter = writeLetter(e.mail().messages.find((m) => m.kind === 'bankrupt')!, ctx);
    expect(letter.subject).toContain('Borrower');
    expect(JSON.stringify(letter)).not.toMatch(/undefined|NaN/);
  }, 60_000);
});

describe('credit scores (spec §16A, Equifacts)', () => {
  it('stay between 300 and 850, rising with good payment history and falling with debt and losses', () => {
    expect(creditScore(0, 0, 1e6, 0).score).toBe(680);
    expect(creditScore(HISTORY.maxOnTime + 200, 0, 1e6, 1).score).toBe(850);
    expect(creditScore(-1000, 5e6, -1, -1).score).toBe(300);
    expect(creditScore(0, 1e6, 1e6, 0).score).toBeLessThan(creditScore(0, 0, 1e6, 0).score);
    expect(creditScore(0, 0, 1e6, -0.3).score).toBeLessThan(680);
    const e = game();
    expect(e.loans().score).toBe(680);
    expect(e.loans().tiers).toHaveLength(4);
  });

  it('puts loan payments, OPEK meetings and futures expiries on the calendar (spec §12.8)', () => {
    const e = game();
    sign(e, 50_000, 'amortising', 12);
    const day = dayOf(e.time);
    const entries = e.calendar(day, day + 100, []);
    const loans = entries.filter((x) => x.kind === 'loan');
    expect(loans.map((x) => formatDate(x.day))).toEqual(['02 Feb 1998', '02 Mar 1998', '01 Apr 1998']);
    expect(entries.find((x) => x.kind === 'opek')!.day).toBe(Date.UTC(1998, 2, 25) / 86_400_000);
  });
});
