import { beforeAll, describe, expect, it } from 'vitest';
import { writeLetter } from '../src/apps/mail/letters';
import { CLOSE, OPEN, START_DAY, addTradingDays, at, dayOf, formatDate, nextTradingDay, previousTradingDay, weekday } from '../src/sim/calendar';
import { chain, contract, lastTradingDay, nextOpekMeeting, notePrice, opekMeetings, parseContract } from '../src/sim/commodities';
import { CONTRACTS, CONTRACT_INDEX, FTD_FINE, HAZARDS, MJ, PHYSICAL_DISCOUNT, ZN } from '../src/sim/data/commodities';
import { Engine } from '../src/sim/engine';
import { DIFFICULTIES } from '../src/sim/settings';
import { INDUSTRIES } from '../src/world/industries';
import { generateWorld, type World } from '../src/world/generator';

// Spec §19, Phase 7: "futures settle daily correctly; delivery email fires". Spec §12.3: contract chains, initial and
// maintenance margin, daily mark-to-market into cash, the Roll button, physical delivery to the lobby, failure-to-deliver
// fines; commodity spot models with seasonality and supply shocks from the weather and OPEK.

let world: World;
let year: Engine;
beforeAll(() => {
  world = generateWorld({ seed: 'futures', companyCount: 1000 });
  year = Engine.create(world, { settings: DIFFICULTIES.medium, firmName: 'Pit' });
  year.runSessions(504);
}, 180_000);
const game = () => Engine.create(world, { settings: DIFFICULTIES.medium, firmName: 'Pit' });
const k = (code: string) => CONTRACT_INDEX[code];
const trade = (e: Engine, key: string, n: number) => {
  const r = e.tradeFuture(key, n);
  if ('error' in r) throw new Error(r.error);
  return r.price;
};
/** The letters of a game, written as the player reads them. */
const letters = (e: Engine) => {
  const s = e.exportState();
  const ctx = { directory: e.directory(), firmName: e.firmName, ceoName: e.player.ceoName, seed: e.seed, clients: new Map(s.clients.clients.map((c) => [c.id, c])), news: new Map() };
  return e.mail().messages.map((m) => ({ mail: m, letter: writeLetter(m, ctx) }));
};

describe('contracts (spec §12.3)', () => {
  it('lists every contract of the table, with its months and a last trading day on the third Friday', () => {
    expect(CONTRACTS.map((c) => c.code)).toEqual(['CL', 'BZ', 'NG', 'HO', 'RB', 'GC', 'SI', 'HG', 'PL', 'ZC', 'ZW', 'ZS', 'KC', 'CC', 'SB', 'CT', 'OJ', 'LE', 'HE', 'LBS', 'MJ', 'ZN']);
    expect(formatDate(lastTradingDay(1998 * 12 + 2))).toBe('20 Mar 1998');
    for (let month = 1998 * 12; month < 2001 * 12; month++) {
      const day = lastTradingDay(month);
      expect(weekday(day) === 5 || weekday(day + 1) === 5 || weekday(day + 3) === 5).toBe(true);
    }
    const cl = chain(k('CL'), START_DAY);
    expect(cl.map((c) => formatDate(c.expiry))).toEqual(['16 Jan 1998', '20 Feb 1998', '20 Mar 1998', '17 Apr 1998', '15 May 1998', '19 Jun 1998']);
    expect(chain(k('GC'), START_DAY).map((c) => c.month % 12)).toEqual([1, 3, 5, 7, 9, 11]);
    expect(chain(MJ, START_DAY).map((c) => c.month % 12)).toEqual([2, 5, 8, 11]);
    // Past its last trading day a contract leaves the board.
    expect(chain(k('CL'), nextTradingDay(cl[0].expiry))[0].key).toBe(cl[1].key);
    expect(parseContract(cl[2].key)).toEqual(cl[2]);
    expect(parseContract('XX:1')).toBeUndefined();
  });

  it('prices futures from the spot: equal at expiry, contango when cheap, backwardation when dear', () => {
    const e = game();
    const p = e.prices();
    const oil = k('CL');
    const [front] = chain(oil, p.day);
    const s = e.commodities.state;
    // At expiry the future is the spot.
    expect(e.commodities.futures(oil, p.day, p)).toBeCloseTo(e.commodities.spot(oil, p), 9);
    s.y[oil] = s.mean[oil] - 0.3;
    const cheap = chain(oil, p.day).map((c) => e.commodities.futures(oil, c.expiry, p));
    cheap.slice(1).forEach((f, n) => expect(f).toBeGreaterThan(cheap[n]));
    s.y[oil] = s.mean[oil] + 0.3;
    const dear = chain(oil, p.day).map((c) => e.commodities.futures(oil, c.expiry, p));
    dear.slice(1).forEach((f, n) => expect(f).toBeLessThan(dear[n]));
    expect(front.expiry).toBeGreaterThanOrEqual(p.day);
    // The index future carries the MAJOR 500 at the policy rate less dividends; the note future prices a 6% note.
    const [mj] = chain(MJ, p.day);
    const T = (mj.expiry - p.day) / 365.25;
    expect(e.commodities.futures(MJ, mj.expiry, p)).toBeCloseTo(p.index * Math.exp((p.rate - 0.016) * T), 9);
    expect(notePrice(0.06)).toBeCloseTo(100, 9);
    expect(notePrice(0.05)).toBeGreaterThan(100);
    expect(e.commodities.spot(ZN, p)).toBeCloseTo(notePrice(s.yield10), 9);
  });
});

describe('daily settlement (spec §12.3)', () => {
  it('pays each day’s change in the settlement price into cash, and the rest when the position closes', () => {
    const e = game();
    const [, second] = chain(k('CL'), dayOf(e.time));
    const cash0 = e.account().cash;
    const entry = trade(e, second.key, 3);
    const commission = DIFFICULTIES.medium.commission.fixed;
    expect(e.account().cash).toBeCloseTo(cash0 - commission, 6);
    expect(e.account().futuresMargin).toBeCloseTo(3 * e.futuresPrice(second.key) * 1000 * CONTRACTS[k('CL')].margin, 6);
    let mark = entry;
    for (let session = 0; session < 6; session++) {
      const cash = e.account().cash;
      const lines = e.ledger().length;
      e.runSessions(1);
      const settle = e.exportState().commodities.settle.prices[second.key];
      const variation = e.ledger().slice(lines).filter((l) => l.kind === 'variation');
      expect(variation).toHaveLength(1);
      expect(variation[0]).toMatchObject({ contract: second.key, shares: 3, price: settle });
      expect(variation[0].amount).toBeCloseTo((settle - mark) * 1000 * 3, 6);
      // Cash moves by the variation margin (and the night's interest, if the account had borrowed; it hasn't).
      expect(e.account().cash - cash).toBeCloseTo(variation[0].amount, 6);
      expect(e.account().futuresPnl).toBeCloseTo(0, 9);
      mark = settle;
    }
    // Close it mid-session: the move since the last settlement is paid at once.
    e.advanceTo(at(nextTradingDay(dayOf(e.time)), OPEN + 60));
    const exit = trade(e, second.key, -3);
    const close = e.ledger().filter((l) => l.kind === 'futures').at(-1)!;
    expect(close.amount).toBeCloseTo((exit - mark) * 1000 * 3, 6);
    expect(e.futures().positions).toHaveLength(0);
    // In all: the price change times the contract size, less two commissions.
    const [closed] = e.closedPositions();
    expect(closed.contract).toBe(second.key);
    expect(closed.realized).toBeCloseTo((exit - entry) * 1000 * 3 - 2 * commission, 6);
    const a = e.account();
    expect(a.netWorth - a.deposits).toBeCloseTo(a.realized + a.unrealized, 4);
  });

  it('needs the initial margin free to open, and rolls a position into the next month', () => {
    const e = game();
    const [front, next] = chain(k('GC'), dayOf(e.time));
    const r = e.tradeFuture(front.key, 10_000);
    expect('error' in r && r.error).toMatch(/Not enough margin/);
    trade(e, front.key, -2);
    expect(e.futures().positions[0]).toMatchObject({ contract: front.key, contracts: -2 });
    const rolled = e.rollFuture(front.key);
    expect('price' in rolled).toBe(true);
    expect(e.futures().positions.map((p) => [p.contract, p.contracts])).toEqual([[next.key, -2]]);
    expect(e.orders()).toHaveLength(0);
    expect(e.ledger().filter((l) => l.kind === 'futures')).toHaveLength(3);
    // The pit shuts with the market.
    e.runSessions(1);
    expect(e.tradeFuture(next.key, 1)).toEqual({ error: 'The pit is closed: futures trade from 09:30 to 16:00.' });
    expect(e.tradeFuture('ZC:1', 1)).toEqual({ error: 'That contract is not listed.' });
    const off = Engine.create(world, { settings: { ...DIFFICULTIES.medium, futures: false }, firmName: 'Pit' });
    expect(off.tradeFuture(front.key, 1)).toEqual({ error: 'Futures trading is switched off in this game.' });
  });
});

describe('expiry (spec §12.3)', () => {
  it('delivers corn to the lobby when a long is held past the last trading day, and charges storage until it is sold', () => {
    const e = game();
    const corn = chain(k('ZC'), dayOf(e.time))[0];
    trade(e, corn.key, 2);
    e.advanceTo(at(corn.expiry, CLOSE));
    // A warning three trading days ahead, then the delivery.
    const warning = e.mail().messages.find((m) => m.kind === 'expiry')!;
    expect(warning).toMatchObject({ contract: corn.key, contracts: 2, quantity: 10_000, day: corn.expiry });
    expect(addTradingDays(dayOf(warning.time), 3)).toBe(corn.expiry);
    const delivery = e.mail().messages.find((m) => m.kind === 'delivery')!;
    expect(delivery).toMatchObject({ contract: corn.key, contracts: 2, quantity: 10_000 });
    const text = letters(e).find((l) => l.mail.id === delivery.id)!.letter;
    expect(JSON.stringify(text.body)).toContain('10,000 bushels of corn have been delivered to your office lobby');
    const spot = e.futures().spot[k('ZC')];
    const invoice = e.ledger().find((l) => l.kind === 'delivery')!;
    expect(invoice.amount).toBeCloseTo(-spot * 10_000, 4);
    const [goods] = e.futures().goods;
    expect(goods).toMatchObject({ code: 'ZC', quantity: 10_000 });
    expect(goods.value).toBeCloseTo(spot * 10_000 * (1 - PHYSICAL_DISCOUNT), 4);
    expect(e.futures().positions).toHaveLength(0);
    e.runSessions(2);
    expect(e.ledger().filter((l) => l.kind === 'storage').length).toBeGreaterThanOrEqual(2);
    const sale = e.sellGoods('ZC');
    expect('amount' in sale && sale.amount).toBeCloseTo(e.futures().spot[k('ZC')] * 10_000 * (1 - PHYSICAL_DISCOUNT), 4);
    expect(e.futures().goods).toHaveLength(0);
    expect(e.sellGoods('ZC')).toEqual({ error: 'There is nothing like that in the lobby.' });
    const a = e.account();
    expect(a.netWorth - a.deposits).toBeCloseTo(a.realized + a.unrealized, 4);
  });

  it('fines a short that fails to deliver, and settles financial futures in cash', () => {
    const e = game();
    const wheat = chain(k('ZW'), dayOf(e.time))[0];
    const index = chain(MJ, dayOf(e.time))[0];
    trade(e, wheat.key, -1);
    trade(e, index.key, 1);
    e.advanceTo(at(Math.max(wheat.expiry, index.expiry), CLOSE));
    const ftd = e.mail().messages.find((m) => m.kind === 'ftd')!;
    const fine = e.ledger().find((l) => l.kind === 'fine')!;
    expect(ftd).toMatchObject({ contract: wheat.key, contracts: -1 });
    expect(-fine.amount).toBeCloseTo(FTD_FINE * fine.price! * 5000, 4);
    expect(ftd.amount).toBeCloseTo(-fine.amount, 6);
    expect(e.mail().messages.find((m) => m.kind === 'cashSettled')).toMatchObject({ contract: index.key, contracts: 1 });
    expect(e.futures().positions).toHaveLength(0);
    expect(e.futures().goods).toHaveLength(0);
    for (const { letter } of letters(e)) expect(JSON.stringify(letter)).not.toMatch(/undefined|NaN|\{\w+\}/);
  });
});

describe('commodity markets (spec §12.3, §14)', () => {
  const closes = (e: Engine, code: string) => {
    const s = e.exportState().commodities;
    const n = CONTRACTS.length;
    return s.days.map((day, row) => [day, s.closes[row * n + k(code)]] as const);
  };

  it('moves commodities at about their volatility, with seasons and mean reversion', () => {
    for (const code of ['CL', 'GC', 'ZC', 'KC', 'LE']) {
      const series = closes(year, code);
      expect(series).toHaveLength(504);
      const returns = series.slice(1).map(([, c], n) => Math.log(c / series[n][1]));
      const mean = returns.reduce((a, r) => a + r, 0) / returns.length;
      const vol = Math.sqrt((returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length) * 252);
      const spec = CONTRACTS[k(code)].vol;
      expect(vol, code).toBeGreaterThan(0.6 * spec);
      expect(vol, code).toBeLessThan(2 * spec);
      for (const [, c] of series) expect(c, code).toBeGreaterThan(0);
    }
  });

  it('warns of weather a few trading days ahead, and the warning is a genuine signal', () => {
    const outlooks = year.exportState().commodities.outlooks.filter((o) => o.source === 'weather' && o.done);
    expect(outlooks.length).toBeGreaterThan(8);
    const series = new Map(CONTRACTS.map((c) => [c.code, new Map(closes(year, c.code))]));
    let right = 0;
    let hits = 0;
    for (const o of outlooks) {
      expect(HAZARDS.some((h) => h.id === o.kind)).toBe(true);
      const lead = dayOf(o.due) - dayOf(o.issued);
      expect(lead).toBeGreaterThanOrEqual(2);
      expect(lead).toBeLessThanOrEqual(9);
      if (o.result !== 'hit') continue;
      hits++;
      // From the close before the warning to the close after the weather, the price went the way the warning said.
      const [main, move] = o.moves[0];
      const prices = series.get(CONTRACTS[main].code)!;
      const before = prices.get(previousTradingDay(dayOf(o.issued)));
      const after = prices.get(nextTradingDay(dayOf(o.due)));
      if (before === undefined || after === undefined) continue;
      if (Math.sign(Math.log(after / before)) === Math.sign(move)) right++;
    }
    expect(hits).toBeGreaterThan(5);
    expect(right / hits).toBeGreaterThan(0.7);
    const news = year.exportState().events.news;
    expect(news.filter((n) => n.kind === 'weather').length).toBe(year.exportState().commodities.outlooks.filter((o) => o.source === 'weather').length);
    expect(news.filter((n) => n.kind === 'weatherHit').length + news.filter((n) => n.kind === 'weatherBust').length).toBe(outlooks.length);
  });

  it('holds OPEK meetings on its calendar, hinted at five trading days before', () => {
    const meetings = opekMeetings(1998);
    expect(meetings.map(formatDate)).toEqual(['25 Mar 1998', '24 Jun 1998', '25 Nov 1998']);
    expect(nextOpekMeeting(START_DAY)).toBe(meetings[0]);
    const opek = year.exportState().commodities.outlooks.filter((o) => o.source === 'opek');
    expect(opek.length).toBe(6);
    for (const o of opek) {
      expect(opekMeetings(new Date(dayOf(o.due) * 86_400_000).getUTCFullYear())).toContain(dayOf(o.due));
      expect(addTradingDays(dayOf(o.issued), 5)).toBe(dayOf(o.due));
      expect(['cut', 'hold', 'raise']).toContain(o.result);
    }
    expect(year.exportState().events.news.filter((n) => n.kind === 'opek')).toHaveLength(6);
  });

  it('moves the industries that depend on a commodity with it', () => {
    const logging = INDUSTRIES.findIndex((i) => i.id === 'logging');
    const e = game();
    const members = world.companies.flatMap((c, i) => (c.genes.industry === logging ? [i] : []));
    const lumber: number[] = [];
    const stocks: number[] = [];
    for (let day = 0; day < 120; day++) {
      const before = members.map((i) => e.market.price[i]);
      const wood = e.futures().spot[k('LBS')];
      e.runSessions(1);
      lumber.push(Math.log(e.futures().spot[k('LBS')] / wood));
      stocks.push(members.reduce((a, i, n) => a + Math.log(e.market.price[i] / before[n]), 0) / members.length);
    }
    const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
    const [ml, ms] = [mean(lumber), mean(stocks)];
    const cov = mean(lumber.map((l, n) => (l - ml) * (stocks[n] - ms)));
    const corr = cov / Math.sqrt(mean(lumber.map((l) => (l - ml) ** 2)) * mean(stocks.map((s) => (s - ms) ** 2)));
    expect(corr).toBeGreaterThan(0.2);
    expect(contract(k('LBS'), 1998 * 12).key).toBe('LBS:23976');
  }, 60_000);
});
