import { beforeAll, describe, expect, it } from 'vitest';
import { describeConstraint, writeLetter, type LetterContext } from '../src/apps/mail/letters';
import { CLOSE, START_DAY, at, dayOf, nextTradingDay } from '../src/sim/calendar';
import type { Client } from '../src/sim/clients';
import { Engine } from '../src/sim/engine';
import type { Mail } from '../src/sim/mail';
import { DIFFICULTIES } from '../src/sim/settings';
import { INDUSTRIES } from '../src/world/industries';
import { generateWorld, type World } from '../src/world/generator';

// Spec §19, Phase 6: "A new game yields a meaningful first month of mail; accepting a mandate changes AUM and
// constraints are enforced."

let world: World;
beforeAll(() => {
  world = generateWorld({ seed: 'outbox', companyCount: 1000 });
});
const game = () => Engine.create(world, { settings: DIFFICULTIES.medium, firmName: 'Garage Capital' });
const RTC = 41;
const TOBACCO = INDUSTRIES.findIndex((i) => i.id === 'tobacco');

function context(e: Engine): LetterContext {
  const state = e.exportState();
  return {
    directory: e.directory(),
    firmName: e.firmName,
    ceoName: e.player.ceoName,
    seed: e.seed,
    clients: new Map(state.clients.clients.map((c) => [c.id, c])),
    news: new Map(state.events.news.map((n) => [n.id, n])),
  };
}

/** Every letter reads as a letter: a sender, a subject, a body, and no template left unfilled. */
function checkLetters(e: Engine): void {
  const ctx = context(e);
  for (const m of e.mail().messages) {
    const letter = writeLetter(m, ctx);
    expect(letter.from, m.kind).toBeTruthy();
    expect(letter.subject, m.kind).toBeTruthy();
    expect(letter.body.length, m.kind).toBeGreaterThan(0);
    const blocks = letter.body.flatMap((b) => ('p' in b ? [b.p] : 'list' in b ? b.list : 'link' in b ? [b.link, b.url] : b.table.rows.flat()));
    const text = [letter.from, letter.to, letter.subject, ...blocks].join('\n').replace(/\{c:\d+\}/g, '');
    expect(text, `${m.kind}: ${text}`).not.toMatch(/\{\w+\}|undefined|NaN|[[\]|]/);
  }
}

/** Runs to the close `n` trading days after today's. */
const closes = (e: Engine, n: number) => {
  let day = dayOf(e.time);
  for (let k = 0; k < n; k++) day = nextTradingDay(day);
  e.advanceTo(at(day, CLOSE));
};

describe('Outbox Express: the first month (spec §15)', () => {
  it('fills the first month with meaningful mail', () => {
    const e = game();
    e.placeOrder({ company: 3, side: 'buy', type: 'market', shares: 300, tif: 'day' });
    e.placeOrder({ company: RTC, side: 'buy', type: 'market', shares: 20, tif: 'day' });
    e.runSessions(21);
    const mail = e.mail().messages;
    const kinds = (k: Mail['kind']) => mail.filter((m) => m.kind === k).length;
    expect(kinds('welcome')).toBe(1);
    expect(kinds('founders')).toBe(1);
    expect(kinds('briefing')).toBe(20); // every morning after the first
    expect(kinds('offer')).toBeGreaterThanOrEqual(1);
    expect(kinds('tip')).toBeGreaterThanOrEqual(1);
    expect(kinds('digest')).toBe(1); // the day's fills, in one letter
    expect(kinds('spam') + kinds('mom')).toBeGreaterThanOrEqual(1);
    // Four folders' worth of mail, and the briefings have stories and a calendar.
    expect(new Set(mail.map((m) => m.kind)).size).toBeGreaterThanOrEqual(7);
    const briefing = mail.filter((m) => m.kind === 'briefing').at(-1)!;
    expect(briefing.items!.length).toBeGreaterThan(0);
    expect(e.mailStatus().unread).toBe(mail.filter((m) => !m.read).length);
    checkLetters(e);
  });

  it('marks letters read, flagged and deleted', () => {
    const e = game();
    const [welcome] = e.mail().messages;
    e.markMail([welcome.id], { read: true, flagged: true });
    expect(e.mail().messages[0]).toMatchObject({ read: true, flagged: true, deleted: false });
    e.markMail([welcome.id], { deleted: true });
    expect(e.mail().messages[0].deleted).toBe(true);
    expect(e.mailStatus().unread).toBe(e.mail().messages.filter((m) => !m.read && !m.deleted).length);
  });
});

/** Runs until the next mandate offer arrives, and gives it the constraints the test wants. */
function offer(e: Engine, constraints: Client['constraints']): { mail: Mail; client: Client } {
  for (let k = 0; k < 40 && !e.mail().messages.some((m) => m.kind === 'offer' && !m.answer); k++) closes(e, 1);
  const mail = e.mail().messages.find((m) => m.kind === 'offer' && !m.answer)!;
  const client = e.s.clients.clients.find((c) => c.id === mail.client)!;
  client.constraints = constraints;
  return { mail, client };
}

describe('clients and mandates (spec §15.1)', () => {
  it('accepting a mandate brings in the money: AUM and units grow, and the ledger shows the deposit', () => {
    const e = game();
    const { mail, client } = offer(e, []);
    const before = e.clients();
    expect(before.clients.filter((c) => c.status === 'active')).toHaveLength(2); // the founders
    expect(e.mailAction(mail.id, 'accept')).toBeUndefined();
    const after = e.clients();
    expect(after.aum).toBeCloseTo(before.aum + client.amount, 4);
    expect(after.clientAssets).toBeCloseTo(before.clientAssets + client.amount, 4);
    expect(after.unit).toBeCloseTo(before.unit, 9);
    expect(after.clients.find((c) => c.id === client.id)).toMatchObject({ status: 'active', deposited: client.amount });
    expect(e.ledger().at(-1)).toMatchObject({ kind: 'deposit', amount: client.amount, note: client.name });
    expect(e.mail().messages.find((m) => m.id === mail.id)!.answer).toBe('accepted');
    expect(e.mail().messages.some((m) => m.kind === 'joined' && m.client === client.id)).toBe(true);
    expect(e.news({ kinds: ['mandate'] })).toHaveLength(1);
    expect(e.mailAction(mail.id, 'accept')).toMatch(/already/);
    // Declining another offer leaves the money where it is.
    const second = offer(e, []);
    const aum = e.clients().aum;
    e.mailAction(second.mail.id, 'decline');
    expect(e.clients().aum).toBeCloseTo(aum, 6);
    expect(e.s.clients.clients.find((c) => c.id === second.client.id)!.status).toBe('declined');
  });

  it('enforces a constraint: a warning, then the client leaves and takes its money', () => {
    const e = game();
    const exclusion = [{ kind: 'exclude' as const, industries: [TOBACCO], label: 'tobacco', limit: 0 }];
    const { mail, client } = offer(e, exclusion);
    e.mailAction(mail.id, 'accept');
    closes(e, 1);
    e.advanceTo(at(nextTradingDay(dayOf(e.time)), 10 * 60));
    // The order ticket warns before the breach…
    const shares = Math.floor((0.05 * e.nav()) / e.market.price[RTC]);
    const estimate = e.estimate({ company: RTC, side: 'buy', type: 'market', shares, tif: 'day' });
    expect(estimate.warnings.join()).toMatch(/no tobacco/);
    expect('order' in e.placeOrder({ company: RTC, side: 'buy', type: 'market', shares, tif: 'day' })).toBe(true);
    closes(e, 0);
    // …the client warns at the close…
    const warning = e.mail().messages.find((m) => m.kind === 'warning' && m.client === client.id);
    expect(warning).toBeDefined();
    expect(describeConstraint(client.constraints[warning!.constraint!])).toBe('No tobacco');
    expect(e.s.clients.clients.find((c) => c.id === client.id)!.breach).toBeDefined();
    // …and, the tobacco still held a week later, leaves: notice, then the money goes out.
    closes(e, 5);
    expect(e.mail().messages.some((m) => m.kind === 'terminated' && m.client === client.id && m.reason === 'breach')).toBe(true);
    const aum = e.clients().aum;
    const owed = e.s.clients.clients.find((c) => c.id === client.id)!.units * e.clients().unit;
    closes(e, 6);
    const gone = e.s.clients.clients.find((c) => c.id === client.id)!;
    expect(gone.status).toBe('left');
    expect(gone.units).toBe(0);
    expect(e.ledger().some((l) => l.kind === 'withdrawal' && l.note === client.name)).toBe(true);
    expect(e.clients().aum).toBeLessThan(aum - 0.8 * owed);
    expect(e.mail().messages.some((m) => m.kind === 'settled' && m.client === client.id)).toBe(true);
    expect(e.clients().reputation).toBeLessThan(25);
  });

  it('forgives a breach fixed in time, but not a second one', () => {
    const e = game();
    const limit = [{ kind: 'maxPosition' as const, limit: 0.1 }];
    const { mail, client } = offer(e, limit);
    e.mailAction(mail.id, 'accept');
    const big = (share: number) => Math.floor((share * e.nav()) / e.market.price[0]);
    e.advanceTo(at(nextTradingDay(dayOf(e.time)), 10 * 60));
    e.placeOrder({ company: 0, side: 'buy', type: 'market', shares: big(0.2), tif: 'day' });
    closes(e, 0);
    expect(e.mail().messages.filter((m) => m.kind === 'warning' && m.client === client.id)).toHaveLength(1);
    e.advanceTo(at(nextTradingDay(dayOf(e.time)), 10 * 60));
    e.placeOrder({ company: 0, side: 'sell', type: 'market', shares: e.held(0), tif: 'day' });
    closes(e, 2);
    const fixed = e.s.clients.clients.find((c) => c.id === client.id)!;
    expect(fixed.breach).toBeUndefined();
    expect(fixed.redeeming).toBeUndefined();
    e.advanceTo(at(nextTradingDay(dayOf(e.time)), 10 * 60));
    e.placeOrder({ company: 0, side: 'buy', type: 'market', shares: big(0.2), tif: 'day' });
    closes(e, 0);
    expect(e.mail().messages.some((m) => m.kind === 'terminated' && m.client === client.id)).toBe(true);
  });

  it('charges fees and sends quarterly statements', () => {
    const e = game();
    e.runSessions(60); // to the end of March
    const view = e.clients();
    expect(view.feesEarned).toBeGreaterThan(0);
    expect(view.firmCapital).toBeGreaterThan(0);
    expect(view.firmCapital + view.clientAssets).toBeCloseTo(view.aum, 4);
    const statements = e.mail().messages.filter((m) => m.kind === 'statement');
    expect(statements).toHaveLength(2); // one per founding client
    expect(e.news({ kinds: ['firmQuarter'] })).toHaveLength(1);
    checkLetters(e);
  });

  it('runs a pure sandbox when clients are switched off', () => {
    const e = Engine.create(world, { settings: { ...DIFFICULTIES.medium, clients: false }, firmName: 'Solo' });
    e.runSessions(25);
    expect(e.clients().clients).toHaveLength(0);
    expect(e.clients().firmCapital).toBeCloseTo(e.nav(), 4);
    expect(e.mail().messages.some((m) => m.kind === 'offer' || m.kind === 'founders')).toBe(false);
  });
});

describe('tips (spec §15.4)', () => {
  it('can be reported, and trading on a genuine one before the news is on the record', () => {
    const e = game();
    closes(e, 30);
    const tips = e.s.mail.tips;
    expect(tips.length).toBeGreaterThan(0);
    const mail = e.mail().messages.find((m) => m.kind === 'tip')!;
    expect(mail).not.toHaveProperty('truth');
    const reputation = e.clients().reputation;
    expect(e.mailAction(mail.id, 'report')).toBeUndefined();
    expect(e.clients().reputation).toBeGreaterThan(reputation);
    expect(e.s.mail.tips.find((t) => t.id === mail.tip)!.reported).toBe(true);
    expect(e.mail().messages.some((m) => m.kind === 'reply' && m.tip === mail.tip)).toBe(true);
    // Trade in every genuine tip's company still pending: those trades are noted for the regulator.
    const pending = tips.filter((t) => t.truth === 'genuine' && !t.reported && t.until > e.time);
    for (const t of pending) e.placeOrder({ company: t.company, side: 'buy', type: 'market', shares: 10, tif: 'gtc' });
    closes(e, 1);
    for (const t of pending) {
      if (e.s.events.plans.some((p) => p.id === t.plan)) continue;
      expect(e.s.mail.insider.some((x) => x.tip === t.id)).toBe(true);
    }
  });

  it('is genuine about as often as the difficulty says', () => {
    const e = Engine.create(world, { settings: { ...DIFFICULTIES.easy }, firmName: 'Tipped' });
    e.runSessions(250);
    const tips = e.s.mail.tips;
    expect(tips.length).toBeGreaterThan(10);
    const genuine = tips.filter((t) => t.truth === 'genuine').length / tips.length;
    expect(genuine).toBeGreaterThan(0.3);
    expect(genuine).toBeLessThan(0.9);
    expect(START_DAY).toBeLessThan(dayOf(e.time));
  }, 60_000);
});
