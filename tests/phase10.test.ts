import { beforeAll, describe, expect, it } from 'vitest';
import { CLOSE, OPEN, START_DAY, addTradingDays, at, dayOf, nextTradingDay } from '../src/sim/calendar';
import { Engine } from '../src/sim/engine';
import { expose } from '../src/sim/darkweb';
import { ASSET, CONFERENCES, HINDSIGHT_FEE, LOTTO } from '../src/sim/data/lifestyle';
import { OFFICES } from '../src/sim/data/staff';
import { rebalanceOrders, shownYear, y2k } from '../src/sim/desk';
import { plan } from '../src/sim/events';
import { conferenceDay } from '../src/sim/lifestyle';
import { firstTradingDay } from '../src/sim/loans';
import { itCheck, payday } from '../src/sim/staff';
import { DIFFICULTIES, changeSettings, type GameSettings } from '../src/sim/settings';
import { generateWorld, type World } from '../src/world/generator';

// Phase 10 (spec §19): "Each app's state is saved; staff, office and luxury assets affect the simulation as specified."
// These tests hold the simulation's half: what each role does, rent and the office's room, luxuries in net worth and in
// mandate offers, and the rest of §14.2's money — eBuy, conferences, the lotto, Hindsight Research, IPOs and splits.

let world: World;
beforeAll(() => {
  world = generateWorld({ seed: 'phase 10', companyCount: 1000 });
});

const game = (settings: GameSettings = DIFFICULTIES.medium) => Engine.create(world, { settings, firmName: 'Ten Capital' });
const ok = (error: string | undefined) => expect(error).toBeUndefined();
const balanced = (e: Engine) => {
  const a = e.account();
  expect(a.netWorth - a.deposits).toBeCloseTo(a.realized + a.unrealized, 3);
};
/** Hires the first applicant in a role (a new one is posted if none is on the board), with the skill given. */
function hireRole(e: Engine, role: string, skill = 0.9): number {
  const s = e.s.staff;
  let p = s.people.find((x) => x.status === 'applicant' && x.role === role);
  if (!p) {
    p = { ...s.people.find((x) => x.status === 'applicant')!, id: s.nextId++, role: role as never };
    s.people.push(p);
  }
  p.skill = skill;
  p.loyalty = 0.8;
  ok(e.staffAction({ do: 'hire', id: p.id }));
  return p.id;
}
/** Room for everyone: the downtown floor. */
const bigOffice = (e: Engine) => ok(e.staffAction({ do: 'move', office: 2 }));
const nextMonth = (e: Engine) => {
  const d = new Date(dayOf(e.time) * 86_400_000);
  return firstTradingDay(d.getUTCFullYear() * 12 + d.getUTCMonth() + 1);
};

describe('staff and the office (spec §4A PeopleSoftie HR, §14.2 Greg’s List)', () => {
  it('posts applicants, hires only as many as the office holds, and pays them every month', () => {
    const e = game();
    const board = e.staff().people.filter((p) => p.status === 'applicant');
    expect(board.length).toBe(8);
    expect(new Set(board.map((p) => p.role)).size).toBeGreaterThan(2);
    // The garage holds two.
    ok(e.staffAction({ do: 'hire', id: board[0].id }));
    ok(e.staffAction({ do: 'hire', id: board[1].id }));
    expect(e.staffAction({ do: 'hire', id: board[2].id })).toMatch(/room for 2/);
    bigOffice(e);
    expect(e.staff().office).toBe(2);
    expect(e.ledger().at(-1)).toMatchObject({ kind: 'rent', amount: -OFFICES[2].rent });
    ok(e.staffAction({ do: 'hire', id: board[2].id }));
    // Payday: a month's salary each, and the new office's rent.
    const payroll = e.staff().payroll;
    e.advanceTo(at(nextMonth(e), OPEN + 5));
    const lines = e.ledger().filter((l) => dayOf(l.time) === dayOf(e.time));
    expect(lines.filter((l) => l.kind === 'payroll').reduce((a, l) => a - l.amount, 0)).toBeCloseTo(payroll, 6);
    expect(lines.find((l) => l.kind === 'rent')!.amount).toBe(-OFFICES[2].rent);
    // Moving to somewhere smaller than the staff needs is refused.
    expect(e.staffAction({ do: 'move', office: 0 })).toMatch(/room for 2/);
    // Letting someone go costs a month's severance.
    const before = e.account().cash;
    ok(e.staffAction({ do: 'fire', id: board[0].id }));
    expect(before - e.account().cash).toBeCloseTo(board[0].salary / 12, 6);
    expect(e.staff().people.find((p) => p.id === board[0].id)).toMatchObject({ status: 'former', why: 'fired' });
    balanced(e);
  });

  it('analysts’ calls are right as often as they are skilled (spec §4A: accuracy = skill)', () => {
    const rate = (skill: number) => {
      const e = game();
      bigOffice(e);
      for (let k = 0; k < 4; k++) hireRole(e, 'analyst', skill);
      let right = 0;
      let calls = 0;
      for (let week = 0; week < 10; week++) {
        const seen = e.mail().messages.length;
        e.runSessions(5);
        for (const m of e.mail().messages.slice(seen)) {
          if (m.kind !== 'research') continue;
          const gap = e.market.state.lnV[m.company!] - e.market.state.lnP[m.company!];
          calls++;
          if (Math.sign(gap) === m.direction) right++;
        }
      }
      expect(calls).toBeGreaterThanOrEqual(30);
      return right / calls;
    };
    expect(rate(0.95)).toBeGreaterThan(0.85);
    expect(rate(0.05)).toBeLessThan(0.7);
  }, 60_000);

  it('the Trader runs stop-losses, dollar-cost averaging and the monthly rebalance; without one, rules wait', () => {
    const run = (withTrader: boolean) => {
      const e = game();
      if (withTrader) hireRole(e, 'trader');
      e.placeOrder({ company: 20, side: 'buy', type: 'market', shares: 1000, tif: 'day' });
      // A stop so tight the spread and commission already cross it.
      ok(e.deskAction({ do: 'addRule', rule: { kind: 'stopLoss', company: 20, pct: 0.0001 } }));
      ok(e.deskAction({ do: 'addRule', rule: { kind: 'dca', company: 30, amount: 20_000, every: 'week' } }));
      ok(e.deskAction({ do: 'addRule', rule: { kind: 'rebalance', targets: [{ fund: 0, weight: 0.4 }] } }));
      e.advanceTo(at(nextMonth(e), CLOSE));
      return e;
    };
    const idle = run(false);
    expect(idle.held(20)).toBe(1000);
    expect(idle.held(30)).toBe(0);
    expect(idle.desk().rules).toHaveLength(3);
    const busy = run(true);
    expect(busy.held(20)).toBe(0);
    expect(busy.desk().rules.map((r) => r.kind)).toEqual(['dca', 'rebalance']);
    // Weekly purchases of about $20,000, one a week.
    const buys = busy.orders().filter((o) => o.company === 30 && o.side === 'buy');
    expect(buys.length).toBeGreaterThanOrEqual(3);
    // The first of the month, 40% of the book went into MJR.
    const mjr = busy.funds().positions.find((p) => p.fund === 0)!;
    expect(mjr.value / busy.nav()).toBeGreaterThan(0.35);
    expect(mjr.value / busy.nav()).toBeLessThan(0.45);
    expect(busy.desk().messages.some((m) => m.topic === 'stopped')).toBe(true);
    expect(busy.desk().pages.some((p) => p.code === '7337')).toBe(true);
    balanced(busy);
  });

  it('rebalances to whole shares, sales first', () => {
    const orders = rebalanceOrders(
      [{ company: 1, weight: 0.5 }, { fund: 0, weight: 0.2 }],
      [{ company: 1, units: 900 }, { company: 2, units: 50 }],
      (t) => (t.fund !== undefined ? 100 : 10),
      10_000,
    );
    expect(orders).toEqual([{ company: 1, shares: -400 }, { fund: 0, shares: 20 }]);
  });

  it('a compliance officer cools the heat faster and warns before a mandate is breached', () => {
    const cool = (compliance: boolean) => {
      const e = game();
      if (compliance) hireRole(e, 'compliance', 1);
      e.s.regulator.heat = 60;
      e.runSessions(20);
      return e.s.regulator.heat;
    };
    const plain = cool(false);
    const helped = cool(true);
    // Four weeks: 2 a week without; with the best officer, 3 a week more.
    expect(plain).toBeCloseTo(52, 6);
    expect(helped).toBeCloseTo(40, 6);

    const e = game();
    hireRole(e, 'compliance');
    const offer = e.mail().messages.find((m) => m.kind === 'offer');
    e.runSessions(4);
    const letter = e.mail().messages.find((m) => m.kind === 'offer')!;
    const client = e.clients().clients.find((c) => c.id === letter.client)!;
    client.constraints = [{ kind: 'maxPosition', limit: 0.1 }];
    e.s.clients.clients.find((c) => c.id === client.id)!.constraints = client.constraints;
    ok(e.mailAction(letter.id, 'accept'));
    void offer;
    e.advanceTo(at(nextTradingDay(dayOf(e.time)), OPEN + 10));
    // A position just under the 10% limit.
    const nav = e.nav();
    e.placeOrder({ company: 3, side: 'buy', type: 'market', shares: Math.floor((0.093 * nav) / e.market.price[3]), tif: 'day' });
    e.runSessions(1);
    expect(e.mail().messages.some((m) => m.kind === 'compliance' && m.company === 3)).toBe(true);
  });

  it('a PR manager halves the damage of an exposé', () => {
    const hit = (pr: boolean) => {
      const e = game();
      if (pr) hireRole(e, 'pr', 1);
      e.s.clients.reputation = 50;
      expose(e, 'bribe', { reputation: 20, heat: 20, redeem: 0 });
      return 50 - e.s.clients.reputation;
    };
    expect(hit(false)).toBe(20);
    expect(hit(true)).toBe(10);
  });

  it('an IT admin keeps most hackers out; what gets through takes the web site down', () => {
    const attacks = (it: boolean) => {
      const e = game();
      if (it) hireRole(e, 'it', 0.95);
      e.s.regulator.heat = 100;
      for (let k = 0; k < 300; k++) itCheck(e, START_DAY);
      const mail = e.mail().messages;
      return { blocked: mail.filter((m) => m.kind === 'hackBlocked').length, hacked: mail.filter((m) => m.kind === 'hacked').length, e };
    };
    const open = attacks(false);
    expect(open.blocked).toBe(0);
    expect(open.hacked).toBeGreaterThan(15);
    expect(open.e.darkwebStatus().outages.some((o) => o.player)).toBe(true);
    const guarded = attacks(true);
    expect(guarded.blocked / (guarded.blocked + guarded.hacked)).toBeGreaterThan(0.8);
  });

  it('an executive assistant files the junk mail, unread', () => {
    const e = game();
    hireRole(e, 'assistant');
    e.runSessions(40);
    const spam = e.mail().messages.filter((m) => m.kind === 'spam');
    expect(spam.length).toBeGreaterThan(2);
    expect(spam.every((m) => m.read && m.filed)).toBe(true);
  });

  it('staff unpaid for two months walk out; rivals poach the skilled and disloyal blow the whistle', () => {
    const e = game();
    const id = hireRole(e, 'analyst');
    // No money for wages.
    e.s.account.cash = -1e9;
    payday(e, dayOf(e.time));
    expect(e.staff().owed).toBeGreaterThan(0);
    expect(e.staff().people.find((p) => p.id === id)?.status).toBe('staff');
    e.s.settings = { ...e.s.settings, noBankruptcy: true };
    payday(e, dayOf(e.time));
    expect(e.staff().people.find((p) => p.id === id)).toMatchObject({ status: 'former', why: 'unpaid' });
    expect(e.mail().messages.some((m) => m.kind === 'staffLeft' && m.reason === 'payroll')).toBe(true);

    const w = game(changeSettings(DIFFICULTIES.medium, { aggression: 'high' }));
    bigOffice(w);
    const people = [hireRole(w, 'trader', 0.99), hireRole(w, 'analyst', 0.99)];
    for (const p of w.s.staff.people) if (people.includes(p.id)) p.loyalty = 0.2;
    w.s.regulator.heat = 90;
    for (let k = 0; k < 12 && w.s.staff.people.some((p) => p.status === 'staff'); k++) payday(w, dayOf(w.time));
    const gone = w.s.staff.people.filter((p) => people.includes(p.id));
    expect(gone.some((p) => p.why === 'whistleblower' || p.offer)).toBe(true);
    if (gone.some((p) => p.why === 'whistleblower')) expect(w.s.regulator.audit).toBeDefined();
  });

  it('rivals’ offers can be matched, or the employee goes', () => {
    const e = game();
    const id = hireRole(e, 'trader');
    const p = e.s.staff.people.find((x) => x.id === id)!;
    const mail = e.send({ kind: 'poached', employee: id, firm: 1, amount: 200_000, day: addTradingDays(dayOf(e.time), 5) });
    p.offer = { firm: 1, salary: 200_000, mail: mail.id, expires: addTradingDays(dayOf(e.time), 5) };
    ok(e.mailAction(mail.id, 'match'));
    expect(p.salary).toBe(200_000);
    expect(p.status).toBe('staff');
  });
});

describe('the Lifestyles Catalogue, prestige and mandate offers (spec §14.2)', () => {
  it('luxuries count at resale value, cost upkeep, and sell back at what a dealer pays', () => {
    const e = game();
    const worth = e.netWorth();
    ok(e.lifestyleAction({ do: 'buyAsset', asset: 'sportsCar' }));
    // The dealer's margin is lost the day it leaves the showroom.
    expect(e.netWorth()).toBeCloseTo(worth - ASSET.sportsCar.price * (1 - ASSET.sportsCar.resale), 3);
    expect(e.account().lifestyleValue).toBeCloseTo(ASSET.sportsCar.price * ASSET.sportsCar.resale, 3);
    balanced(e);
    e.advanceTo(at(nextMonth(e), OPEN + 5));
    expect(e.ledger().find((l) => l.kind === 'upkeep')!.amount).toBe(-ASSET.sportsCar.upkeep);
    const car = e.lifestyle().assets[0];
    expect(car.value).not.toBe(ASSET.sportsCar.price * ASSET.sportsCar.resale);
    ok(e.lifestyleAction({ do: 'sellAsset', id: car.id }));
    expect(e.account().lifestyleValue).toBe(0);
    balanced(e);
  });

  it('prestige — an address and luxuries — brings bigger mandate offers', () => {
    const plain = game(changeSettings(DIFFICULTIES.easy, {}));
    const grand = game(changeSettings(DIFFICULTIES.easy, {}));
    ok(grand.staffAction({ do: 'move', office: 3 }));
    ok(grand.lifestyleAction({ do: 'buyAsset', asset: 'mansion' }));
    expect(grand.staff().prestige).toBe(OFFICES[3].prestige + ASSET.mansion.prestige);
    plain.runSessions(4);
    grand.runSessions(4);
    const first = (e: Engine) => e.mail().messages.find((m) => m.kind === 'offer')!.amount! / e.nav();
    // Offers scale with (0.5 + standing / 50): reputation 25 against 25 + 19.
    expect(first(grand) / first(plain)).toBeGreaterThan(1.3);
  });

  it('forced sales take the luxuries after the positions', () => {
    const e = game();
    ok(e.lifestyleAction({ do: 'buyAsset', asset: 'art' }));
    e.s.account.cash -= 500_000;
    e.settle(e.account().cash + e.account().lifestyleValue * 0.5, { kind: 'rent', note: 'Test bill', cause: 'bills' });
    expect(e.lifestyle().assets[0].sold).toBeDefined();
    expect(e.bankruptcy()).toBeUndefined();
  });
});

describe('eBuy, conferences, the lotto and Hindsight Research (spec §14.2)', () => {
  it('auctions follow hype cycles; the highest proxy bid wins, and collectibles count in net worth', () => {
    const e = game();
    e.runSessions(3);
    const view = e.lifestyle();
    expect(view.auctions.length).toBeGreaterThanOrEqual(6);
    // A bid far above anyone's is sure to win.
    const a = view.auctions.find((x) => !x.result)!;
    ok(e.lifestyleAction({ do: 'bid', auction: a.id, max: a.value * 20 }));
    expect(e.lifestyle().auctions.find((x) => x.id === a.id)!.leader).toBe('player');
    e.advanceTo(at(a.ends, CLOSE));
    const items = e.lifestyle().items;
    expect(items).toHaveLength(1);
    expect(e.account().lifestyleValue).toBeCloseTo(items[0].value, 6);
    balanced(e);
    // Sell it back through an auction: AI bidders decide the price, eBuy takes 5%.
    ok(e.lifestyleAction({ do: 'sellItem', id: items[0].id }));
    e.runSessions(6);
    expect(e.lifestyle().items).toHaveLength(0);
    expect(e.mail().messages.some((m) => m.kind === 'ebuy' && m.result === 'sold')).toBe(true);
    balanced(e);
    // Over a few years each category goes through its phases.
    const long = game();
    const phases = new Set<string>();
    for (let k = 0; k < 150; k++) {
      long.runSessions(5);
      long.lifestyle().hype.forEach((h, c) => phases.add(`${c}:${h.phase}`));
    }
    expect([...phases].filter((p) => p.endsWith(':2')).length).toBeGreaterThan(0);
  }, 120_000);

  it('a conference ticket brings contacts, and their tips come over ISeekYou', () => {
    const e = game();
    const davoz = CONFERENCES.find((c) => c.id === 'davoz')!;
    ok(e.lifestyleAction({ do: 'ticket', conference: 'davoz' }));
    expect(e.ledger().at(-1)).toMatchObject({ kind: 'ticket', amount: -davoz.price });
    e.advanceTo(at(conferenceDay('davoz', 1998), CLOSE));
    expect(e.mail().messages.some((m) => m.kind === 'conference')).toBe(true);
    const informants = e.desk().contacts.filter((c) => c.kind === 'informant');
    expect(informants.length).toBeLessThanOrEqual(1);
    if (informants.length) {
      e.runSessions(25);
      const tips = e.desk().messages.filter((m) => m.topic === 'tip');
      expect(tips.length).toBeGreaterThan(0);
      // Reporting one to the SOB ends the acquaintance.
      ok(e.deskAction({ do: 'answer', message: tips[0].id, choice: 'report' }));
      expect(e.desk().contacts.find((c) => c.id === tips[0].contact)!.blocked).toBe(true);
    }
  });

  it('the State Lotto draws weekly and pays by matches', () => {
    const e = game();
    ok(e.lifestyleAction({ do: 'lotto', count: LOTTO.maxTickets }));
    expect(e.lifestyleAction({ do: 'lotto', count: 1 })).toMatch(/At most/);
    e.runSessions(5);
    const draw = e.lifestyle().lotto.draws[0];
    expect(draw.numbers).toHaveLength(6);
    expect(draw.tickets).toBe(LOTTO.maxTickets);
    // Three matches or more pay: about one ticket in 57 wins something.
    expect(draw.won).toBeGreaterThan(0);
    expect(draw.won).toBeLessThan(LOTTO.jackpot);
    balanced(e);
  });

  it('Hindsight Research subscribers read short reports an hour early, and may trade on them', () => {
    const e = game();
    // A short report later today (reports are planned ten trading days ahead).
    const time = at(dayOf(e.time), 13 * 60);
    plan(e, 'shortReport', 40, time, -0.2, 0);
    ok(e.lifestyleAction({ do: 'subscribe', on: true }));
    expect(e.ledger().at(-1)).toMatchObject({ kind: 'subscription', amount: -HINDSIGHT_FEE });
    e.advanceTo(time - 50);
    const preview = e.mail().messages.find((m) => m.kind === 'hindsight');
    expect(preview).toMatchObject({ company: 40 });
    expect(preview!.time).toBe(time - 60);
    // Selling short on the preview is legal: no flag from the SOB's surveillance.
    e.placeOrder({ company: 40, side: 'short', type: 'market', shares: 20_000, tif: 'day' });
    e.advanceTo(time + 30);
    expect(e.s.regulator.evidence).toHaveLength(0);
  });
});

describe('the desk: alerts, the pager and ISeekYou (spec §4A)', () => {
  it('pages price alerts, margin calls and urgent mail', () => {
    const e = game();
    ok(e.deskAction({ do: 'addAlert', company: 5, level: e.market.price[5] * 1.0001 }));
    ok(e.deskAction({ do: 'addAlert', company: 6, level: e.market.price[6] * 0.9999 }));
    e.runSessions(2);
    const pages = e.desk().pages.filter((p) => p.code === '411');
    expect(pages.map((p) => p.company).sort()).toEqual([5, 6]);
    expect(e.desk().alerts).toHaveLength(0);
    e.send({ kind: 'audit', day: dayOf(e.time) });
    expect(e.desk().pages.at(-1)).toMatchObject({ code: '0800' });
  });

  it('a letter to clients moves their mood by how the quarter really went', () => {
    const mood = (tone: 'confident' | 'humble' | 'blame' | 'silent') => {
      const e = game();
      e.runSessions(70);
      const before = e.clients().clients.filter((c) => c.status === 'active').map((c) => c.mood);
      ok(e.deskAction({ do: 'letter', tone }));
      expect(e.deskAction({ do: 'letter', tone })).toMatch(/already/);
      const after = e.clients().clients.filter((c) => c.status === 'active').map((c) => c.mood);
      const quarter = e.news({ kinds: ['firmQuarter'], limit: 1 })[0];
      return { change: after[0] - before[0], good: quarter.move! >= quarter.expect! };
    };
    const confident = mood('confident');
    const humble = mood('humble');
    expect(Math.abs(confident.change)).toBe(8);
    expect(confident.change > 0).toBe(confident.good);
    expect(humble.change).toBeGreaterThan(0);
    expect(mood('silent').change).toBeLessThanOrEqual(0);
  }, 60_000);

  it('Y2K: a mild panic the first trading morning of 2000, if the game gets there', () => {
    const e = game(changeSettings(DIFFICULTIES.medium, { startYear: 1999 }));
    // With the start year 1999, 1998's calendar shows 1999; its successor year shows as 2000.
    const newYear = Date.UTC(1999, 0, 4) / 86_400_000;
    expect(shownYear(newYear, 1999)).toBe(2000);
    const before = e.newsCount;
    y2k(e, newYear, newYear - 4);
    expect(e.news({ limit: 1 })[0]).toMatchObject({ kind: 'story', text: 'y2k' });
    expect(e.newsCount).toBe(before + 1);
    y2k(e, newYear + 1, newYear);
    expect(e.newsCount).toBe(before + 1);
  });
});

describe('IPOs and stock splits (spec §11.6, §14.2 IPO Hotline)', () => {
  it('files IPOs to keep the market near its size; listings grow every per-company array', () => {
    const e = game();
    const n = e.companies.length;
    e.runSessions(10);
    const filed = e.ipos().pending.filter((p) => p.company === undefined);
    expect(filed.length).toBeGreaterThan(0);
    // Apply for one, the most we can.
    const deal = filed[0];
    ok(e.ipoAction({ do: 'apply', id: deal.id, shares: Math.floor(deal.offered / 10) }));
    e.s.clients.reputation = 100;
    e.advanceTo(at(deal.day, CLOSE));
    const listed = e.ipos().pending.find((p) => p.id === deal.id)!;
    const i = listed.company!;
    expect(i).toBeGreaterThanOrEqual(n);
    const state = e.exportState();
    const count = e.companies.length;
    for (const a of [state.market.lnP, state.market.status, state.market.rating, state.fundamentals.revenue, state.world.tiers, state.world.floatPct]) expect(a.length).toBe(count);
    expect(state.world.genomes).toHaveLength(count);
    expect(state.history.count).toBe(count);
    expect(state.fundamentals.quarterRevenue.length).toBe(count * 8);
    expect(e.model.shares.length).toBe(count);
    expect(e.market.price.length).toBe(count);
    expect(e.details(i)).toMatchObject({ listed: listed.day, status: 0 });
    // Its chart starts on its first day.
    expect(e.bars(i, '1Y').every((b) => b.time >= listed.day * 86_400)).toBe(true);
    expect(e.news({ company: i })[0]).toMatchObject({ kind: 'ipo', level: listed.price });
    const mail = e.mail().messages.find((m) => m.kind === 'ipo' && m.company === i)!;
    expect(mail.contracts).toBe(e.held(i));
    balanced(e);
    // A save plays on exactly as the game would have.
    const again = Engine.restore(e.exportState());
    expect(again.companies.length).toBe(count);
    e.runSessions(5);
    again.runSessions(5);
    expect(again.market.price[i]).toBe(e.market.price[i]);
  });

  it('a split multiplies shares and divides prices, and nothing is worth more or less', () => {
    const e = game();
    e.placeOrder({ company: 7, side: 'buy', type: 'market', shares: 100, tif: 'day' });
    e.placeOrder({ company: 7, side: 'buy', type: 'limit', limit: e.market.price[7] * 0.9, shares: 50, tif: 'gtc' });
    e.tradeFund(0, 1000);
    e.runSessions(3);
    const before = { cap: e.details(7).marketCap, worth: e.netWorth(), index: e.market.indexLevel, mjr: e.fundPrice(0), close: e.bars(7, '1M').at(-2)!.close };
    e.split(7, 4);
    expect(e.held(7)).toBe(400);
    expect(e.openOrders()[0]).toMatchObject({ shares: 200 });
    expect(e.details(7).marketCap).toBeCloseTo(before.cap, 0);
    expect(e.netWorth()).toBeCloseTo(before.worth, 3);
    expect(e.market.indexLevel).toBeCloseTo(before.index, 6);
    expect(e.fundPrice(0)).toBeCloseTo(before.mjr, 6);
    // Charts are split-adjusted.
    expect(e.bars(7, '1M').at(-2)!.close).toBeCloseTo(before.close / 4, 2);
    expect(e.news({ company: 7 })[0]).toMatchObject({ kind: 'split', level: 4 });
    balanced(e);
    const again = Engine.restore(e.exportState());
    expect(Array.from(again.model.shares)).toEqual(Array.from(e.model.shares));
  });

  it('keeps the market near its size over two years', () => {
    const e = game();
    e.runSessions(504);
    const listed = e.market.state.status.filter((s) => s === 0).length;
    expect(e.companies.length).toBeGreaterThan(1000);
    expect(Math.abs(listed - 1000)).toBeLessThan(30);
    expect(Object.keys(e.exportState().world.splits).length).toBeGreaterThan(0);
    balanced(e);
  }, 120_000);
});
