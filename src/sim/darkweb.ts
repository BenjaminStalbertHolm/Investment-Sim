import { Rng } from '../world/rng';
import { book } from './account';
import { CLOSE, DAY_MINUTES, OPEN, addTradingDays, at, dayOf, isTradingDay, minuteOf, nextTradingDay, type GameTime } from './calendar';
import { redeem } from './clients';
import { clientOutflow, firmAum, plannedTrades } from './competitors';
import type { Sim } from './context';
import {
  BLACKMAIL, BOT_MAX_CAP, CELLAR_TIP, CHURN, CREWS, DISCOVERY, FORGERY_FOUND, HANDLES, HEAT_PENALTY, JURISDICTIONS, LEAK_DAYS,
  MARKET, MARKETS, NATURES, OUTAGE_DAYS, PRICES, PUMP_BUY_IN, PUMP_GAIN, PUMP_LOSS, REPEAT_BONUS, REPEAT_DISCOUNT, SERVICE,
  SHARK_RANGE, SHARK_WEEKLY, SHELL_FEE, SHELL_FORMS, SHELL_NAMES, SHELL_TRAIL, type MarketId, type ServiceId,
} from './data/darkweb';
import { EVENT_TYPE } from './data/events';
import { OUTLET } from './data/outlets';
import { nextReport } from './earnings';
import { enqueue, jump, plan } from './events';
import { discloseHidden } from './governance';
import type { Mail, MailDraft, MailLine } from './mail';
import { isPaymentDay } from './loans';
import { hash, publishTime } from './press';
import { STRICTNESS, addHeat, imposeFine, openAudit, surveil } from './regulator';
import { damage } from './staff';
import { contactOf } from './desk';

/**
 * The dark web (spec §14A), reached through the Garlic Browser. Vendors in eleven markets sell bribed articles, leaks,
 * bot farms, espionage, hacking, offshore shells, pump-and-dumps, rumours, forged statements, loans and fakes. Every
 * listing states its price, its chance of working, what failure costs and the heat it adds (`quote`), and the purchase
 * repeats those terms. Whether it works is decided when it is bought, from the saved `darkweb` stream, so reloading a
 * save does not re-roll it; what came of it lands later (`resolve`), as a news story, a letter, a price move. Some
 * vendors are exit scams or SOB stings: their rating and account age are the only warning.
 */
export type Outcome = 'success' | 'failure' | 'scam' | 'sting';

export interface Vendor {
  id: number;
  handle: string;
  market: MarketId;
  /** Hidden from the player: an honest vendor, an exit scam, or the Securities Oversight Bureau. */
  nature: 'honest' | 'scam' | 'sting';
  /** What the market shows: stars out of five, reviews, and the day the account was opened (spec §14A). */
  rating: number;
  reviews: number;
  joined: number;
  /** Price factor over the market's typical price. */
  markup: number;
  /** Leak vendors: how often their information is right (spec §14A: 50–90%). */
  accuracy: number;
  /** The day it vanished (a scam), was unmasked (a sting) or retired. */
  left?: number;
}

/** What the player asks for: the service, from which vendor, about whom, how much; paid through the shell or not. */
export interface DarkRequest {
  service: ServiceId;
  vendor: number;
  journalist?: number;
  company?: number;
  firm?: number;
  amount?: number;
  viaShell?: boolean;
}

/** A listing's terms, stated before purchase and repeated in the confirmation (spec §14A transparency rule). */
export interface Terms {
  /** To the vendor; plus the shell's handling fee when paid through one. */
  price: number;
  fee: number;
  chance: number;
  /** Heat added now, and more if it fails. */
  heat: number;
  failHeat: number;
  /** What a failure costs besides heat: reputation, damages a court may award, a fine. */
  reputation?: number;
  damages?: number;
  fine?: number;
  /** What success does: a bought article's move (a fraction of the price), a pump's gain, the reputation won. */
  move?: number;
  /** Shells: the yearly fee and the chance a year of discovery at today's heat. Sharks: the weekly interest. */
  yearly?: number;
  discovery?: number;
  weekly?: number;
  /** The Pump Syndicate's stock, the earnings leak's report day. */
  company?: number;
  day?: number;
}

export interface Purchase {
  id: number;
  time: GameTime;
  request: DarkRequest;
  terms: Terms;
  /** Decided at purchase from the saved stream (spec §14A: reloading does not re-roll it). Never shown before it is due. */
  outcome: Outcome;
  due: GameTime;
  done?: GameTime;
  handle: string;
  /** What it produced: the company a leak names and which way it says, a refund, the news item. */
  company?: number;
  direction?: 1 | -1;
  refund?: boolean;
  news?: number;
}

export interface Shell {
  name: string;
  jurisdiction: string;
  opened: number;
  /** The next yearly fee. */
  renews: number;
  closed?: number;
  discovered?: boolean;
}

/** A loan shark's loan (spec §14A): interest accrues daily and is paid every Friday; missing it calls in the whole loan. */
export interface SharkLoan {
  principal: number;
  opened: number;
  accrued: number;
  accruedTo: number;
  vendor: number;
  paid: number;
}

export interface Bribed {
  journalist: number;
  bribes: number;
  last: number;
  blackmail?: { mail: number; expires: number; amount: number };
}

/** A post in The Cellar that isn't chatter: a real tip, a scam warning, a sting unmasked, a vendor retiring. */
export interface CellarPost {
  time: GameTime;
  kind: 'tip' | 'scam' | 'sting' | 'retired';
  company?: number;
  claim?: string;
  direction?: 1 | -1;
  vendor?: number;
}

/** Bought information: an earnings surprise fixed for a company's next report, or a takeover target. */
export interface Leak {
  purchase: number;
  company: number;
  report?: number;
  z?: number;
  plan?: number;
}

export interface Outage {
  firm?: number;
  company?: number;
  /** The player's own web site, hacked (Phase 10). */
  player?: boolean;
  until: number;
  crew?: string;
}

export interface DarkWebState {
  vendors: Vendor[];
  purchases: Purchase[];
  shells: Shell[];
  shark?: SharkLoan;
  bribed: Bribed[];
  leaks: Leak[];
  /** The Forgery Desk's statements, waiting for the quarter's end (a purchase id). */
  forged?: number;
  cellar: CellarPost[];
  outages: Outage[];
  /** The collectors took the office furniture until this trading day (spec §14A). */
  repossessed?: number;
  /** The trading day the anonymous letter pointing to the Garlic Browser arrives (spec §14A), until it has. */
  invite?: number;
}

const CELLAR_KEPT = 200;
const INVITE_DAYS = 12;

/** A vendor as it appears on the market: honest or not, only its rating, reviews and age hint at it. */
function newVendor(rng: Rng, id: number, market: MarketId, day: number, taken: Set<string>): Vendor {
  const risky = MARKET[market].risky;
  const r = rng.float();
  const nature = !risky || r < NATURES.honest ? 'honest' : r < NATURES.honest + NATURES.scam ? 'scam' : 'sting';
  const age = nature === 'honest' ? rng.int(150, 1500) : nature === 'scam' ? rng.int(20, 400) : rng.int(5, 150);
  // Scammers buy perfect reviews; stings haven't been around long enough to earn many; both undercut the market.
  const rating = nature === 'honest' ? rng.range(4.1, 4.9) : nature === 'scam' ? rng.range(4.6, 5) : rng.range(3.9, 4.8);
  const reviews = Math.round(age * (nature === 'honest' ? rng.range(0.1, 0.6) : nature === 'scam' ? rng.range(0.05, 0.3) : rng.range(0, 0.2)));
  const markup = nature === 'honest' ? rng.range(0.9, 1.3) : rng.range(0.55, 0.9);
  const accuracy = rng.range(0.5, 0.9);
  const free = HANDLES[market].filter((h) => !taken.has(h));
  const handle = free.length ? rng.pick(free) : `${rng.pick(HANDLES[market])}${rng.int(2, 99)}`;
  taken.add(handle);
  return { id, handle, market, nature, rating: Math.round(rating * 10) / 10, reviews, joined: day - age, markup, accuracy };
}

/** The dark web at the start of a game (or where an older save stands): the vendors, and the invitation to come. */
export function newDarkWeb(seed: string, day: number): DarkWebState {
  const rng = Rng.stream(seed, 'darkweb:vendors');
  const taken = new Set<string>();
  const vendors: Vendor[] = [];
  for (const m of MARKETS) for (let k = 0; k < m.vendors; k++) vendors.push(newVendor(rng, vendors.length, m.id, day, taken));
  return { vendors, purchases: [], shells: [], bribed: [], leaks: [], cellar: [], outages: [], invite: addTradingDays(day, INVITE_DAYS) };
}

export const activeShell = (d: DarkWebState) => d.shells.find((s) => s.closed === undefined);
const clamp = (lo: number, hi: number, v: number) => Math.min(hi, Math.max(lo, v));
/** Prices in round numbers, as vendors quote them. */
const round = (v: number) => {
  const p = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, v))) - 1);
  return Math.round(v / p) * p;
};
const capOf = (sim: Sim, i: number) => sim.market.price[i] * sim.model.shares[i];
const listed = (sim: Sim, i: number | undefined) => i !== undefined && Number.isInteger(i) && i >= 0 && i < sim.companies.length && !sim.market.state.status[i];

/** How far readers believe an outlet, from the Daily Scoop (0) to the New York Journal (1): prices, odds and damage scale with it. */
const standing = (credibility: number) => clamp(0, 1, (credibility - 0.25) / 0.7);

/** The chance a year that a shell is discovered, at a given heat (spec §14A: it scales with heat). */
export const discoveryChance = (heat: number) => DISCOVERY[0] + (DISCOVERY[1] - DISCOVERY[0]) * (heat / 100);
/** The fine for a discovered shell, and for forged statements. */
const shellFine = (sim: Sim) => 250_000 * STRICTNESS[sim.s.settings.scrutiny];
const forgeryFine = (sim: Sim) => 1_000_000 * STRICTNESS[sim.s.settings.scrutiny];

/** Next trading day's report for a company (today's, before the bell). */
export function reportOf(sim: Sim, i: number): number {
  const today = dayOf(sim.time);
  const reported = sim.s.fundamentals.reported[i] === today || (isTradingDay(today) && minuteOf(sim.time) >= OPEN);
  return nextReport(reported ? today + 1 : today, sim.model.slot[i]);
}

/** The penny stock a Pump Syndicate vendor is pumping this week. */
export function scheme(sim: Sim, vendor: number): number | undefined {
  const pool: number[] = [];
  for (let i = 0; i < sim.companies.length; i++) {
    if (!sim.market.state.status[i] && sim.market.price[i] < 5 && capOf(sim, i) < 300e6) pool.push(i);
  }
  return pool.length ? pool[hash('pump', vendor, Math.floor((dayOf(sim.time) + 3) / 7)) % pool.length] : undefined;
}

/**
 * The terms a vendor offers for a request, or why it can't be had (spec §14A: price, success chance, failure outcome and
 * heat, stated before purchase).
 */
export function quote(sim: Sim, r: DarkRequest): Terms | string {
  const d = sim.s.darkweb;
  const settings = sim.s.settings;
  if (!settings.darkWeb) return 'The dark web is switched off in this game.';
  const service = SERVICE[r.service];
  if (!service) return 'No such listing.';
  const vendor = d.vendors[r.vendor];
  if (!vendor || vendor.left !== undefined || vendor.market !== service.market) return 'This vendor is no longer trading.';
  const heat = sim.s.regulator.heat;
  const shell = activeShell(d);
  if (r.viaShell && !shell) return 'You have no offshore shell company to pay through.';
  if (r.viaShell && (r.service === 'shell' || r.service === 'shark')) return 'This cannot be paid through a shell.';
  let price = 0;
  let chance = service.chance;
  const extra: Partial<Terms> = {};
  let failHeat = service.failHeat;
  switch (r.service) {
    case 'puffFirm':
    case 'puffStock':
    case 'hitFirm':
    case 'hitCompany': {
      const j = sim.s.journalists[r.journalist ?? -1];
      if (!j) return 'Choose a journalist.';
      if ((r.service === 'puffStock' || r.service === 'hitCompany') && !listed(sim, r.company)) return 'Choose a listed company.';
      if (r.service === 'hitFirm' && !sim.s.world.firms[r.firm ?? -1]) return 'Choose a competitor.';
      const x = standing(OUTLET[j.outlet].credibility);
      const repeat = (d.bribed.find((b) => b.journalist === j.id)?.bribes ?? 0) > 0;
      price = PRICES.press[0] * (PRICES.press[1] / PRICES.press[0]) ** x * (repeat ? 1 - REPEAT_DISCOUNT : 1);
      // Spec §14A: about 85% at a tabloid down to about 35% at the New York Journal, by the journalist's integrity and your heat.
      chance = 1.05 - 0.75 * j.integrity - HEAT_PENALTY * heat + (repeat ? REPEAT_BONUS : 0);
      failHeat = Math.round(25 + 20 * x);
      extra.reputation = Math.round(10 + 20 * x);
      extra.move = r.service === 'puffFirm' ? Math.round(3 + 9 * x) : 0.02 + 0.1 * x;
      if (r.service === 'hitFirm') extra.damages = round(3 * price * vendor.markup);
      if (r.service === 'hitCompany') extra.damages = round(2 * price * vendor.markup);
      break;
    }
    case 'leakEarnings': {
      if (!listed(sim, r.company)) return 'Choose a listed company.';
      const report = reportOf(sim, r.company!);
      if (report > addTradingDays(dayOf(sim.time), LEAK_DAYS)) return 'The vendor only has leaks on companies reporting in the next two weeks.';
      if (d.leaks.some((l) => l.company === r.company && l.report === report)) return 'You already have this leak.';
      price = clamp(PRICES.leakEarnings[0], PRICES.leakEarnings[1], 25_000 * Math.sqrt(capOf(sim, r.company!) / 1e9));
      chance = vendor.accuracy;
      extra.day = report;
      break;
    }
    case 'leakDeal':
      price = PRICES.leakDeal;
      chance = vendor.accuracy - 0.1;
      break;
    case 'botHype':
    case 'botFud': {
      if (!listed(sim, r.company)) return 'Choose a listed company.';
      const cap = capOf(sim, r.company!);
      if (cap >= BOT_MAX_CAP) return 'Bot farms only move companies worth under $2 billion.';
      price = clamp(PRICES.bots[0], PRICES.bots[1], PRICES.bots[0] * (cap / 20e6) ** 0.7);
      extra.move = (r.service === 'botHype' ? 1 : -1) * 0.06;
      break;
    }
    case 'spyHoldings':
    case 'spyTrades':
    case 'ddos': {
      if (!sim.s.world.firms[r.firm ?? -1]) return 'Choose a competitor.';
      const aum = firmAum(sim, r.firm!);
      price = r.service === 'ddos'
        ? clamp(PRICES.hackers[0], PRICES.hackers[1], PRICES.hackers[0] * Math.max(1, aum / 1e9) ** 0.45)
        : clamp(PRICES.spies[0], PRICES.spies[1], PRICES.spies[0] * Math.max(1, aum / 1e9) ** 0.4);
      if (r.service !== 'ddos') extra.damages = round(2 * price * vendor.markup);
      break;
    }
    case 'deface':
      if (!listed(sim, r.company)) return 'Choose a listed company.';
      price = clamp(PRICES.hackers[0], PRICES.hackers[1], PRICES.hackers[0] * Math.max(1, capOf(sim, r.company!) / 1e9) ** 0.3);
      break;
    case 'shell':
      if (shell) return `You already own ${shell.name}.`;
      price = PRICES.shell;
      extra.yearly = PRICES.shellYear;
      extra.discovery = discoveryChance(heat);
      extra.fine = shellFine(sim);
      extra.reputation = 20;
      break;
    case 'pump': {
      const amount = r.amount ?? 0;
      if (!(amount >= PUMP_BUY_IN[0] && amount <= PUMP_BUY_IN[1])) return 'The syndicate takes buy-ins of $10,000 to $500,000.';
      const company = scheme(sim, vendor.id);
      if (company === undefined) return 'The syndicate has nothing to pump this week.';
      extra.company = company;
      extra.move = (PUMP_GAIN[0] + PUMP_GAIN[1]) / 2;
      return finish(sim, r, service.id, amount, chance, service.heat, failHeat, extra, true);
    }
    case 'rumour':
      if (!listed(sim, r.company)) return 'Choose a listed company.';
      price = PRICES.rumour;
      extra.move = 0.1;
      break;
    case 'forgery':
      if (!settings.clients) return 'You have no clients to send statements to.';
      if (d.forged !== undefined) return 'Your next statements are already being doctored.';
      price = PRICES.forgery;
      extra.fine = forgeryFine(sim);
      extra.reputation = 25;
      break;
    case 'shark': {
      const amount = r.amount ?? 0;
      if (d.shark) return 'Pay off the loan you have first.';
      if (!(amount >= SHARK_RANGE[0] && amount <= SHARK_RANGE[1])) return 'Loans run from $5,000,000 to $50,000,000.';
      extra.weekly = amount * SHARK_WEEKLY;
      return finish(sim, r, service.id, 0, 1, service.heat, 0, extra, false);
    }
    default:
      price = PRICES.bazaar[r.service];
  }
  return finish(sim, r, service.id, round(price * vendor.markup), chance, service.heat, failHeat, extra, true);
}

function finish(sim: Sim, r: DarkRequest, id: ServiceId, price: number, base: number, heat: number, failHeat: number, extra: Partial<Terms>, odds: boolean): Terms {
  const certain = SERVICE[id].certain;
  const chance = certain ? 1 : clamp(0.05, 0.95, base + (odds ? sim.s.settings.darkWebOdds : 0));
  return {
    price,
    fee: r.viaShell ? round(price * SHELL_FEE) : 0,
    chance: Math.round(chance * 100) / 100,
    // Paid through a shell, the payment leaves less of a trail (spec §14A: lower detection).
    heat: r.viaShell ? Math.round(heat * SHELL_TRAIL) : heat,
    failHeat,
    ...extra,
  };
}

/** Whether two statements of terms say the same (the purchase repeats what the listing showed). */
export const sameTerms = (a: Terms, b: Terms) =>
  (['price', 'fee', 'chance', 'heat', 'failHeat', 'damages', 'fine', 'weekly', 'company'] as const).every((k) => (a[k] ?? 0) === (b[k] ?? 0));

/**
 * Money to the dark web (spec §14A): from the firm's cash as "Consulting fees", which auditors can see, or through the
 * shell with its handling fee and less of a trail. It is a loss the day it is paid.
 */
function pay(sim: Sim, amount: number, viaShell: boolean, note: string): void {
  if (!amount) return;
  const shell = activeShell(sim.s.darkweb);
  const account = sim.s.account;
  book(account, sim.time, viaShell ? 'offshore' : 'consulting', -amount, { note: viaShell && shell ? `${shell.name}: ${note}` : note });
  account.charges += amount;
  sim.s.regulator.evidence.push({ time: sim.time, company: -1, kind: viaShell ? 'offshore' : 'consulting', gain: 0, amount });
}

/** Money back from the dark web: a refund, or a pump-and-dump's payout. */
function receive(sim: Sim, amount: number, viaShell: boolean, note: string): void {
  if (amount <= 0) return;
  const account = sim.s.account;
  book(account, sim.time, viaShell ? 'offshore' : 'consulting', amount, { note });
  account.charges -= amount;
}

/** When a purchase's result is due. */
function dueTime(sim: Sim, r: DarkRequest): GameTime {
  const now = sim.time;
  const day = dayOf(now);
  switch (r.service) {
    case 'puffFirm':
    case 'puffStock':
    case 'hitFirm':
    case 'hitCompany':
      // In the journalist's paper's next edition.
      return Math.max(now + 30, publishTime(OUTLET[sim.s.journalists[r.journalist!].outlet].cadence, now));
    case 'spyHoldings':
    case 'spyTrades':
      return at(nextTradingDay(day), 8 * 60);
    case 'pump':
      return at(addTradingDays(day, 4), CLOSE);
    case 'forgery':
      return at(quarterEndDay(now), CLOSE);
    case 'watch':
    case 'software':
    case 'meanie':
    case 'newsletter':
      return now + 2 * DAY_MINUTES;
    case 'leakEarnings':
    case 'leakDeal':
      return now + 30;
    default:
      return now + 60;
  }
}

/** The last trading day of the current quarter (its close still to come). */
export function quarterEndDay(time: GameTime): number {
  const month = (d: number) => Math.floor(new Date(d * 86_400_000).getUTCMonth() / 3);
  let day = dayOf(time);
  if (!isTradingDay(day) || minuteOf(time) >= CLOSE) day = nextTradingDay(day);
  while (month(nextTradingDay(day)) === month(day)) day = nextTradingDay(day);
  return day;
}

/**
 * Buys a listing on the terms quoted (the engine has checked them and the money). Whether it works is decided now, from
 * the saved stream; what came of it arrives when it is due.
 */
export function buy(sim: Sim, r: DarkRequest, terms: Terms): Purchase {
  const d = sim.s.darkweb;
  const rng = sim.rng.darkweb;
  const vendor = d.vendors[r.vendor];
  const service = SERVICE[r.service];
  const outcome: Outcome = service.certain
    ? 'success'
    : vendor.nature !== 'honest'
      ? vendor.nature
      : rng.chance(terms.chance) ? 'success' : 'failure';
  const purchase: Purchase = {
    id: d.purchases.length + 1, time: sim.time, request: { ...r }, terms: { ...terms }, outcome, due: dueTime(sim, r), handle: vendor.handle,
  };
  const note = `${MARKET[service.market].name} (${vendor.handle})`;
  pay(sim, terms.price + terms.fee, !!r.viaShell, note);
  addHeat(sim, terms.heat);
  const genuine = outcome === 'success' || outcome === 'failure';
  switch (r.service) {
    case 'leakEarnings':
      if (genuine) {
        // The vendor's surprise becomes the company's (spec §14A): right as often as the listing says, wrong otherwise.
        const sign = rng.chance(0.5) ? 1 : -1;
        d.leaks.push({ purchase: purchase.id, company: r.company!, report: terms.day, z: sign * rng.range(1, 2.5) });
        purchase.company = r.company;
        purchase.direction = (outcome === 'success' ? sign : -sign) as 1 | -1;
      }
      break;
    case 'leakDeal':
      if (genuine) dealLeak(sim, purchase);
      break;
    case 'pump':
      purchase.company = terms.company;
      // The syndicate pumps the stock tomorrow whoever bought in (spec §15.4's pump-and-dump, bigger).
      if (genuine) plan(sim, 'pump', terms.company!, at(nextTradingDay(dayOf(sim.time)), OPEN + 5 * rng.int(1, 40)), rng.range(0.15, 0.4), 1, 'forum');
      break;
    case 'forgery':
      if (genuine) d.forged = purchase.id;
      break;
    case 'shark': {
      const day = dayOf(sim.time);
      d.shark = { principal: r.amount!, opened: day, accrued: 0, accruedTo: day, vendor: vendor.id, paid: 0 };
      book(sim.s.account, sim.time, 'shark', r.amount!, { note: `Loan from ${vendor.handle}` });
      purchase.done = sim.time;
      sim.send({ kind: 'darkweb', purchase: purchase.id, service: 'shark', handle: vendor.handle, result: 'success', amount: r.amount });
      break;
    }
  }
  d.purchases.push(purchase);
  if (!purchase.done) enqueue(sim.s.events, purchase.due, { do: 'darkweb', purchase: purchase.id });
  return purchase;
}

/** The Leak Bazaar's takeover target: a real one if the information is good (and there is one), a plausible decoy if not. */
function dealLeak(sim: Sim, p: Purchase): void {
  const rng = sim.rng.darkweb;
  const deals = sim.s.events.plans.filter((x) => x.kind === 'takeover' && x.time > sim.time && !sim.market.state.status[x.company]);
  if (p.outcome === 'success') {
    if (!deals.length) {
      p.refund = true;
      return;
    }
    const deal = deals.reduce((a, b) => (b.time < a.time ? b : a));
    p.company = deal.company;
    sim.s.darkweb.leaks.push({ purchase: p.id, company: deal.company, plan: deal.id });
    return;
  }
  const targets = new Set(deals.map((x) => x.company));
  for (let tries = 0; tries < 500; tries++) {
    const i = rng.int(0, sim.companies.length - 1);
    const cap = capOf(sim, i);
    if (!sim.market.state.status[i] && !targets.has(i) && cap > 300e6 && cap < 20e9) {
      p.company = i;
      return;
    }
  }
}

/** A vendor leaves the market (spec §14A): The Cellar warns the rest, and a new vendor sets up shop. */
function leave(sim: Sim, vendor: Vendor, why: CellarPost['kind']): void {
  const d = sim.s.darkweb;
  if (vendor.left !== undefined) return;
  vendor.left = dayOf(sim.time);
  post(sim, { time: sim.time, kind: why, vendor: vendor.id });
  const taken = new Set(d.vendors.map((v) => v.handle));
  d.vendors.push(newVendor(sim.rng.darkweb, d.vendors.length, vendor.market, dayOf(sim.time), taken));
}

function post(sim: Sim, p: CellarPost): void {
  const cellar = sim.s.darkweb.cellar;
  cellar.push(p);
  if (cellar.length > CELLAR_KEPT) cellar.splice(0, cellar.length - CELLAR_KEPT);
}

/** A purchase falls due: the vendor delivers, fails, vanishes with the money, or turns out to be the SOB. */
export function resolve(sim: Sim, id: number): void {
  const d = sim.s.darkweb;
  const p = d.purchases.find((x) => x.id === id);
  if (!p || p.done !== undefined) return;
  p.done = sim.time;
  const vendor = d.vendors[p.request.vendor];
  const mail = (extra: Partial<MailDraft> = {}) =>
    sim.send({ kind: 'darkweb', purchase: p.id, service: p.request.service, handle: p.handle, result: p.outcome, ...extra });
  if (p.outcome === 'scam') {
    // An exit scam (spec §14A): the money is gone, and so is the vendor.
    leave(sim, vendor, 'scam');
    mail();
    return;
  }
  if (p.outcome === 'sting') {
    // The vendor was the Securities Oversight Bureau: evidence, heat, and an examination.
    sim.s.regulator.evidence.push({ time: sim.time, company: -1, kind: 'sting', gain: 0, amount: p.terms.price });
    addHeat(sim, 35);
    openAudit(sim, dayOf(sim.time));
    leave(sim, vendor, 'sting');
    mail();
    return;
  }
  const ok = p.outcome === 'success';
  const r = p.request;
  const rng = sim.rng.darkweb;
  const day = dayOf(sim.time);
  switch (r.service) {
    case 'puffFirm':
    case 'puffStock':
    case 'hitFirm':
    case 'hitCompany':
      return press(sim, p, ok, mail);
    case 'leakEarnings':
      // Whether the information is right shows only when the company reports.
      return void mail({ company: p.company, direction: p.direction, day: p.terms.day, result: 'success' });
    case 'leakDeal':
      if (p.refund) receive(sim, p.terms.price + p.terms.fee, !!r.viaShell, 'Refund: nothing in the pipeline');
      return void mail({ company: p.company, result: p.refund ? 'refund' : 'success', amount: p.refund ? p.terms.price + p.terms.fee : undefined });
    case 'botHype':
    case 'botFud': {
      const up = r.service === 'botHype' ? 1 : -1;
      if (!ok || sim.market.state.status[r.company!]) {
        // The moderators notice (spec §14A): a notice on the board naming the firm.
        sim.s.events.rumours.push({ time: sim.time, company: r.company!, kind: 'mod', direction: up, where: 'forum' });
        addHeat(sim, p.terms.failHeat);
        return void mail({ company: r.company, result: 'failure' });
      }
      const posts = rng.int(4, 8);
      for (let k = 0; k < posts; k++) {
        sim.s.events.rumours.push({ time: sim.time + k * rng.int(10, 45), company: r.company!, kind: up > 0 ? 'pump' : 'fud', direction: up, where: 'forum' });
      }
      const move = up * rng.range(0.03, 0.1);
      jump(sim, r.company!, Math.log1p(move), 0, rng.int(6, 24));
      fade(sim, r.company!, move, rng.int(1, 3));
      return void mail({ company: r.company });
    }
    case 'spyHoldings':
    case 'spyTrades': {
      if (!ok) {
        lawsuit(sim, p.terms.damages!, sim.s.world.firms[r.firm!].name);
        addHeat(sim, p.terms.failHeat);
        return void mail({ firm: r.firm, amount: p.terms.damages, result: 'failure' });
      }
      return void mail({ firm: r.firm, lines: r.service === 'spyHoldings' ? holdingsOf(sim, r.firm!) : plannedTrades(sim, r.firm!).slice(0, 12) });
    }
    case 'ddos':
    case 'deface': {
      if (!ok) {
        addHeat(sim, p.terms.failHeat);
        return void mail({ firm: r.firm, company: r.company, result: 'failure' });
      }
      const until = addTradingDays(day, OUTAGE_DAYS);
      if (r.service === 'ddos') d.outages.push({ firm: r.firm, until });
      else if (listed(sim, r.company)) {
        const crew = rng.pick(CREWS);
        d.outages.push({ company: r.company, until, crew });
        // A defaced web site is news, and costs the company a little (spec §11.7: −1% to −6%).
        const [lo, hi] = EVENT_TYPE.hack.move;
        const move = -rng.range(lo, hi);
        surveil(sim, r.company!, move, -1);
        jump(sim, r.company!, Math.log1p(move), EVENT_TYPE.hack.persist);
        p.news = sim.report({ kind: 'hack', company: r.company!, move }).id;
      }
      return void mail({ firm: r.firm, company: r.company });
    }
    case 'shell': {
      const shell: Shell = {
        name: `${rng.pick(SHELL_NAMES)} ${rng.pick(SHELL_FORMS)}`, jurisdiction: rng.pick(JURISDICTIONS), opened: day, renews: day + 365,
      };
      d.shells.push(shell);
      return void mail({ text: `${shell.name} (${shell.jurisdiction})` });
    }
    case 'pump': {
      const amount = r.amount!;
      const payout = ok ? amount * (1 + rng.range(...PUMP_GAIN)) : amount * (1 - rng.range(...PUMP_LOSS));
      receive(sim, payout, !!r.viaShell, `Syndicate payout (${vendor.handle})`);
      if (!ok) addHeat(sim, p.terms.failHeat);
      return void mail({ company: p.company, amount: payout });
    }
    case 'rumour': {
      if (!listed(sim, r.company)) return void mail({ company: r.company, result: 'failure' });
      if (!ok) {
        // A market-manipulation investigation (spec §14A).
        sim.s.regulator.evidence.push({ time: sim.time, company: r.company!, kind: 'manipulation', gain: 0 });
        addHeat(sim, p.terms.failHeat);
        openAudit(sim, day);
        return void mail({ company: r.company, result: 'failure' });
      }
      sim.s.events.rumours.push({ time: sim.time, company: r.company!, kind: 'takeover', direction: 1, where: 'trade' });
      const move = rng.range(0.05, 0.15);
      jump(sim, r.company!, Math.log1p(move), 0, rng.int(3, 12));
      fade(sim, r.company!, move, rng.int(3, 8));
      return void mail({ company: r.company });
    }
    case 'forgery':
      d.forged = undefined;
      if (!ok) enqueue(sim.s.events, at(addTradingDays(day, rng.int(...FORGERY_FOUND)), 7 * 60 + 15), { do: 'forgeryFound', purchase: p.id });
      // Forged statements that will be found out look like any others, for now.
      return void mail({ result: 'success' });
    default:
      return void mail();
  }
}

/** A price moved by the dark web drifts back after a few trading days: the hype or the rumour fades. */
function fade(sim: Sim, company: number, move: number, days: number): void {
  const rng = sim.rng.darkweb;
  enqueue(sim.s.events, at(addTradingDays(dayOf(sim.time), days), OPEN + 5 * rng.int(1, 77)), { do: 'dump', company, move: Math.expm1(-0.8 * Math.log1p(move)) });
}

/** Damages a court awards against the firm: paid at once, a loss the day it is paid. */
function lawsuit(sim: Sim, amount: number, plaintiff: string): void {
  book(sim.s.account, sim.time, 'lawsuit', -amount, { note: plaintiff });
  sim.s.account.charges += amount;
}

/** The competitor's holdings now, largest first: what a thief finds in its filing cabinet. */
function holdingsOf(sim: Sim, firm: number): MailLine[] {
  return sim.s.world.holdings
    .filter((h) => h.firm === firm)
    .map((h) => ({ company: h.company, shares: h.shares, amount: h.shares * sim.market.price[h.company] }))
    .sort((a, b) => b.amount - a.amount || a.company - b.company)
    .slice(0, 25);
}

/** A bought article runs, or the journalist writes about the bribe instead (spec §14A). */
function press(sim: Sim, p: Purchase, ok: boolean, mail: (extra?: Partial<MailDraft>) => Mail): void {
  const r = p.request;
  const rng = sim.rng.darkweb;
  const j = sim.s.journalists[r.journalist!];
  const outlet = OUTLET[j.outlet];
  if (!ok) {
    expose(sim, 'bribe', { journalist: j.id, outlet: j.outlet, reputation: p.terms.reputation!, heat: p.terms.failHeat, redeem: 0.15 + 0.35 * standing(outlet.credibility) });
    if (r.service === 'hitFirm') lawsuit(sim, p.terms.damages!, sim.s.world.firms[r.firm!].name);
    const sued = r.service === 'hitCompany' && rng.chance(0.5);
    if (sued) lawsuit(sim, p.terms.damages!, sim.companies[r.company!].name);
    return void mail({ journalist: j.id, result: 'failure', firm: r.firm, company: r.company, amount: r.service === 'hitFirm' || sued ? p.terms.damages : undefined });
  }
  const list = sim.s.darkweb.bribed;
  let bribed = list.find((b) => b.journalist === j.id);
  if (!bribed) list.push((bribed = { journalist: j.id, bribes: 0, last: 0 }));
  // A bought journalist becomes an ISeekYou contact (spec §14A).
  if (!sim.s.desk.contacts.some((x) => x.kind === 'journalist' && x.ref === j.id)) sim.im({ contact: contactOf(sim, 'journalist', j.id), topic: 'hello', variant: j.id });
  bribed.bribes++;
  bribed.last = p.terms.price;
  const outlets = [j.outlet];
  switch (r.service) {
    case 'puffFirm': {
      const c = sim.s.clients;
      c.reputation = Math.min(100, c.reputation + p.terms.move!);
      p.news = sim.report({ kind: 'puff', company: -1, outlets, journalist: j.id, level: p.terms.move }).id;
      break;
    }
    case 'hitFirm': {
      const amount = clientOutflow(sim, r.firm!, p.terms.move!);
      p.news = sim.report({ kind: 'hitPiece', company: -1, firm: r.firm, outlets, journalist: j.id, amount }).id;
      break;
    }
    default: {
      if (!listed(sim, r.company)) break;
      // A bought article moves the price by 2–12%, by how far readers believe the outlet (spec §11.7); it doesn't last.
      const move = (r.service === 'puffStock' ? 1 : -1) * p.terms.move! * rng.range(0.7, 1.3);
      jump(sim, r.company!, Math.log1p(move), 0, rng.int(2, 8));
      fade(sim, r.company!, move, rng.int(3, 8));
      p.news = sim.report({ kind: r.service === 'puffStock' ? 'puff' : 'hitPiece', company: r.company!, move, outlets, journalist: j.id }).id;
    }
  }
  mail({ journalist: j.id, company: r.company, firm: r.firm, news: p.news });
}

/**
 * An exposé naming the firm (spec §14A): the story runs where it happened and in the wire and the tabloids; the firm's
 * name suffers, heat rises and clients who read the papers may leave.
 */
export function expose(
  sim: Sim,
  what: 'bribe' | 'forgery' | 'shell' | 'blackmail',
  o: { journalist?: number; outlet?: string; reputation: number; heat: number; redeem: number; founders?: number; amount?: number },
): void {
  const outlets = [...new Set([...(o.outlet ? [o.outlet] : ['nyjournal', 'jottings']), 'newswire', 'dailyscoop'])];
  sim.report({ kind: 'expose', company: -1, text: what, outlets, journalist: o.journalist, amount: o.amount });
  const c = sim.s.clients;
  // A PR manager softens the damage (spec §4A), bribe exposés included.
  const shield = damage(sim);
  c.reputation = Math.max(0, c.reputation - o.reputation * shield);
  addHeat(sim, o.heat);
  for (const client of c.clients) {
    if (client.status !== 'active') continue;
    if (sim.rng.darkweb.chance((client.kind === 'founder' ? (o.founders ?? 0) : o.redeem) * shield)) redeem(sim, client, 1, 'scandal');
  }
}

/** The forged statements come to light (spec §14A: mass redemptions and a large fine). */
export function forgeryFound(sim: Sim, id: number): void {
  const p = sim.s.darkweb.purchases.find((x) => x.id === id);
  if (!p) return;
  const fine = p.terms.fine ?? forgeryFine(sim);
  expose(sim, 'forgery', { reputation: p.terms.reputation ?? 25, heat: p.terms.failHeat, redeem: 0.75, founders: 0.25, amount: fine });
  imposeFine(sim, fine);
  sim.send({ kind: 'forgeryFound', amount: fine, day: sim.s.regulator.fine?.due });
}

/**
 * Each trading morning: the invitation to the Garlic Browser, blackmail that lapsed, a tip in The Cellar; on the first
 * trading day of the month vendors come and go, and shells pay their fees and risk discovery.
 */
export function morningDarkWeb(sim: Sim, day: number): void {
  const d = sim.s.darkweb;
  if (!sim.s.settings.darkWeb) return;
  const rng = sim.rng.darkweb;
  if (d.invite !== undefined && day >= d.invite) {
    d.invite = undefined;
    sim.send({ kind: 'garlicInvite', variant: rng.int(0, 999) });
  }
  for (const b of d.bribed) {
    if (!b.blackmail || day <= b.blackmail.expires) continue;
    const mail = sim.s.mail.messages.find((m) => m.id === b.blackmail!.mail);
    if (mail && !mail.answer) mail.answer = 'expired';
    refuseBlackmail(sim, b);
  }
  d.outages = d.outages.filter((o) => o.until > day);
  d.leaks = d.leaks.filter((l) => (l.report !== undefined ? l.report >= day : sim.s.events.plans.some((x) => x.id === l.plan)));
  if (rng.chance(CELLAR_TIP)) cellarTip(sim);
  if (!isPaymentDay(day)) return;
  for (const v of d.vendors.slice()) if (v.left === undefined && rng.chance(CHURN[v.nature])) leave(sim, v, v.nature === 'honest' ? 'retired' : v.nature);
  const shell = activeShell(d);
  if (!shell) return;
  if (day >= shell.renews) {
    shell.renews += 365;
    pay(sim, PRICES.shellYear, true, `${shell.name}: registered agent’s yearly fee`);
  }
  if (rng.chance(1 - (1 - discoveryChance(sim.s.regulator.heat)) ** (1 / 12))) shellFound(sim, shell);
}

/** A real tip in The Cellar (spec §14A: the occasional real tip), dressed as any other post. */
function cellarTip(sim: Sim): void {
  const rng = sim.rng.darkweb;
  const soon = sim.time + DAY_MINUTES;
  const plans = sim.s.events.plans.filter((p) => p.kind !== 'pump' && p.time > soon && Math.abs(p.move) >= 0.06 && sim.companies[p.company].marketCap >= 100e6);
  if (!plans.length) return;
  const p = rng.pick(plans);
  post(sim, { time: sim.time + rng.int(0, 14 * 60), kind: 'tip', company: p.company, claim: p.kind, direction: p.move >= 0 ? 1 : -1 });
}

/** A shell company is discovered (spec §14A): its stakes are disclosed, the firm is fined, and it is a scandal. */
export function shellFound(sim: Sim, shell: Shell): void {
  const day = dayOf(sim.time);
  shell.closed = day;
  shell.discovered = true;
  const hidden = discloseHidden(sim);
  const value = hidden.reduce((a, i) => a + Math.max(0, sim.held(i)) * sim.market.price[i], 0);
  const fine = Math.round(shellFine(sim) + 0.05 * value);
  expose(sim, 'shell', { reputation: 20, heat: SERVICE.shell.failHeat, redeem: 0.3, amount: fine });
  imposeFine(sim, fine);
  sim.send({ kind: 'shellFound', text: shell.name, amount: fine, companies: hidden, day: sim.s.regulator.fine?.due });
}

/** Winds up the firm's shell (Shell Company Registry): its hidden stakes are filed with the SOB, late. */
export function closeShell(sim: Sim): string | undefined {
  const shell = activeShell(sim.s.darkweb);
  if (!shell) return 'You have no shell company.';
  shell.closed = dayOf(sim.time);
  addHeat(sim, 5 * discloseHidden(sim).length);
  return undefined;
}

/**
 * Each week's end: bribed journalists may try blackmail (spec §14A: rare, likelier with heat), and every stake hidden in
 * a shell adds a little heat (spec §16B: hidden stakes).
 */
export function weeklyDarkWeb(sim: Sim, day: number): void {
  const d = sim.s.darkweb;
  const hidden = sim.s.governance.stakes.filter((s) => s.hidden).length;
  if (hidden) addHeat(sim, hidden);
  if (!sim.s.settings.darkWeb) return;
  const rng = sim.rng.darkweb;
  const heat = sim.s.regulator.heat;
  for (const b of d.bribed) {
    if (b.blackmail || !b.bribes || !rng.chance(BLACKMAIL.base + BLACKMAIL.perHeat * heat)) continue;
    const amount = round(b.last * BLACKMAIL.demand);
    const expires = addTradingDays(day, BLACKMAIL.days);
    const mail = sim.send({ kind: 'blackmail', journalist: b.journalist, amount, day: expires });
    b.blackmail = { mail: mail.id, expires, amount };
  }
}

/** The blackmailer's letter answered: paid (as consulting fees), or refused — and then, likely, published. */
export function answerBlackmail(sim: Sim, journalist: number, paid: boolean): void {
  const b = sim.s.darkweb.bribed.find((x) => x.journalist === journalist);
  if (!b?.blackmail) return;
  if (paid) {
    pay(sim, b.blackmail.amount, false, 'Private arrangement');
    b.blackmail = undefined;
    return;
  }
  refuseBlackmail(sim, b);
}

function refuseBlackmail(sim: Sim, b: Bribed): void {
  b.blackmail = undefined;
  if (!sim.rng.darkweb.chance(BLACKMAIL.publish)) return;
  const j = sim.s.journalists[b.journalist];
  const x = standing(OUTLET[j.outlet].credibility);
  expose(sim, 'blackmail', { journalist: j.id, outlet: j.outlet, reputation: Math.round(10 + 20 * x), heat: Math.round(25 + 20 * x), redeem: 0.15 + 0.35 * x });
  b.bribes = 0;
}

export type { MarketId, ServiceId };
