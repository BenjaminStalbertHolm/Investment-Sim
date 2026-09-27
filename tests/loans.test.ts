import { pmt } from 'financial';
import { beforeAll, describe, expect, it } from 'vitest';
import { writeLetter } from '../src/apps/mail/letters';
import { CLOSE, OPEN, addTradingDays, at, dayOf, formatDate, nextTradingDay } from '../src/sim/calendar';
import { Engine } from '../src/sim/engine';
import { BANK_LIMIT, EARLY_FEE, HISTORY, LATE_FEE, TIERS, bankRate, creditScore, firstTradingDay, tierOf } from '../src/sim/loans';
import { DIFFICULTIES, type GameSettings } from '../src/sim/settings';
import { generateWorld, type World } from '../src/world/generator';

// Spec §16A: loan tiers by total bank debt, a floating rate, interest-only or amortising over one to five years, interest
// on the 1st, 1% for repaying early, five trading days' grace for a missed payment and default on the second; Equifacts
// credit scores of 300–850. Spec §16: bankruptcy when an obligation cannot be met after selling everything.

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
    for (let n = 1; n <= 12; n++) {
      const payday = firstTradingDay(start + n);
      const before = e.loans().loans[0];
      const quoted = e.loans().rate;
      e.advanceTo(at(payday, OPEN));
      const lines = e.ledger().filter((l) => dayOf(l.time) === payday && l.note?.startsWith(`Loan ${loan.id}`));
      const interest = -lines.find((l) => l.kind === 'loanInterest')!.amount;
      const principal = -lines.find((l) => l.kind === 'repayment')!.amount;
      // The rate floats (a Federal Reservoir meeting or the credit score may have moved it since): a month's interest at
      // the day's rate, and the principal that makes the payment even over the months left.
      const rate = (interest * 12) / before.balance;
      expect(Math.abs(rate - quoted)).toBeLessThan(0.006);
      const left = 12 - (n - 1);
      expect(principal).toBeCloseTo(left > 1 ? pmt(rate / 12, left, -before.balance) - interest : before.balance, 6);
    }
    const [done] = e.loans().loans;
    expect(done).toMatchObject({ status: 'repaid', balance: 0, paid: 12 });
    expect(e.mail().messages.some((m) => m.kind === 'loanRepaid')).toBe(true);
    expect(e.loans().record.map((r) => r.kind)).toEqual(['opened', 'repaid']);
    expect(e.loans().score).toBeGreaterThan(680);
    const a = e.account();
    expect(a.netWorth - a.deposits).toBeCloseTo(a.realized + a.unrealized, 4);
  }, 60_000);

  it('charges only interest on an interest-only loan, and the whole principal at the end; early repayment costs 1%', () => {
    const e = game();
    sign(e, 200_000, 'interestOnly', 12);
    const start = month(dayOf(e.time));
    e.advanceTo(at(firstTradingDay(start + 3), OPEN));
    expect(e.ledger().filter((l) => l.kind === 'repayment')).toHaveLength(0);
    expect(e.ledger().filter((l) => l.kind === 'loanInterest')).toHaveLength(3);
    expect(e.loans().loans[0].balance).toBe(200_000);
    const cash = e.account().cash;
    const repaid = e.repayLoan(1, 50_000);
    expect('loan' in repaid && repaid.loan.balance).toBe(150_000);
    expect(e.account().cash).toBeCloseTo(cash - 50_000 * (1 + EARLY_FEE), 6);
    expect(e.ledger().at(-1)).toMatchObject({ kind: 'loanFee', amount: -500 });
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
