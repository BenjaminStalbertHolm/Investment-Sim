import { addTradingDays, at, dayOf, isTradingDay, nextTradingDay } from './calendar';
import type { Sim } from './context';
import {
  ASSET, AUCTIONS_A_DAY, AUCTION_DAYS, CATEGORIES, CONFERENCES, EBUY_FEE, HINDSIGHT_FEE, HINDSIGHT_LEAD, HYPE, LOTTO, MAX_PRESTIGE, PHASES,
} from './data/lifestyle';
import { OFFICES } from './data/staff';
import { enqueue } from './events';
import { addInformant, informantTip } from './desk';
import { offerMandate, type Fees } from './clients';

/**
 * The firm's money outside the markets (spec §14.2). Luxuries from the Lifestyles Catalogue count towards net worth at what
 * a dealer would pay for them, cost upkeep every month, and lend the firm prestige that brings bigger and more frequent
 * mandate offers. eBuy auctions collectibles whose prices follow hype cycles, against AI bidders. Conference tickets buy
 * networking: mandate offers, ISeekYou contacts and their tips. The State Lotto draws every week. Hindsight Research's
 * subscribers read its short reports an hour early.
 */
export interface OwnedAsset {
  id: number;
  asset: string;
  cost: number;
  /** What a dealer would pay now: revalued each month. */
  value: number;
  bought: number;
  sold?: number;
  proceeds?: number;
}

export interface Auction {
  id: number;
  category: number;
  item: number;
  /** The item's worth at a category index of 1. */
  base: number;
  ends: number;
  /** The price now, the AI bidders' highest (hidden), and who leads. */
  price: number;
  ai: number;
  leader?: 'ai' | 'player';
  /** The player's maximum bid (a proxy bid, as eBuy places it). */
  max?: number;
  /** An item the player is selling: which, and the lowest price it will go for. */
  selling?: number;
  reserve?: number;
  result?: 'won' | 'lost' | 'sold' | 'unsold' | 'unpaid';
}

export interface OwnedItem {
  id: number;
  category: number;
  item: number;
  base: number;
  cost: number;
  bought: number;
  /** Listed for sale on this auction. */
  listed?: number;
}

export interface LifestyleState {
  assets: OwnedAsset[];
  nextAsset: number;
  /** eBuy: each category's log price index and hype phase, the auctions, and what the firm owns. */
  hype: { level: number; phase: number }[];
  auctions: Auction[];
  items: OwnedItem[];
  nextItem: number;
  /** Profit and loss on luxuries and collectibles sold. */
  realized: number;
  /** Conference tickets: conference id and the year. */
  tickets: { conference: string; year: number }[];
  /** Lotto tickets for the next draw (six numbers each), and the draws so far (numbers and what the firm won). */
  lotto: { tickets: number[][]; draws: { day: number; numbers: number[]; won: number; tickets: number }[] };
  /** Hindsight Research (spec §14.2): subscribed since, and the short reports delivered early (plan ids). */
  hindsight?: { since: number; delivered: number[] };
}

export function newLifestyle(): LifestyleState {
  return {
    assets: [], nextAsset: 1, hype: CATEGORIES.map(() => ({ level: 0, phase: 0 })), auctions: [], items: [], nextItem: 1, realized: 0, tickets: [],
    lotto: { tickets: [], draws: [] },
  };
}

const held = (s: LifestyleState) => s.assets.filter((a) => a.sold === undefined);
export const itemValue = (s: LifestyleState, i: Pick<OwnedItem, 'category' | 'base'>) => i.base * Math.exp(s.hype[i.category].level);

/** Luxuries at what a dealer would pay and collectibles at eBuy prices: they count towards net worth (spec §14.2). */
export function lifestyleValue(s: LifestyleState): { value: number; cost: number } {
  let value = 0;
  let cost = 0;
  for (const a of held(s)) {
    value += a.value;
    cost += a.cost;
  }
  for (const i of s.items) {
    value += itemValue(s, i);
    cost += i.cost;
  }
  return { value, cost };
}

/**
 * The firm's standing beyond its record (spec §14.2): its address and its luxuries impress prospective clients. It adds to
 * reputation when clients decide how much to offer and how often.
 */
export function prestige(sim: Sim): number {
  const things = held(sim.s.lifestyle).reduce((a, x) => a + (ASSET[x.asset]?.prestige ?? 0), 0);
  return Math.min(MAX_PRESTIGE, OFFICES[sim.s.staff.office].prestige + things);
}

// ---------- The Lifestyles Catalogue ----------

export function buyAsset(sim: Sim, id: string): OwnedAsset | string {
  const spec = ASSET[id];
  if (!spec || (spec.module && !sim.s.settings.modules[spec.module])) return 'That is not in the catalogue.';
  if (!sim.payable(spec.price)) return 'You do not have the cash: the catalogue does not take credit.';
  const s = sim.s.lifestyle;
  const asset: OwnedAsset = { id: s.nextAsset++, asset: id, cost: spec.price, value: spec.price * spec.resale, bought: dayOf(sim.time) };
  sim.s.account.cash -= spec.price;
  sim.s.account.ledger.push({ time: sim.time, kind: 'asset', amount: -spec.price, balance: sim.s.account.cash, note: spec.name });
  s.assets.push(asset);
  return asset;
}

/** Sold back to a dealer at its value today. */
export function sellAsset(sim: Sim, id: number, note = 'Sold'): number | string {
  const s = sim.s.lifestyle;
  const a = s.assets.find((x) => x.id === id && x.sold === undefined);
  if (!a) return 'You do not own that.';
  a.sold = dayOf(sim.time);
  a.proceeds = a.value;
  s.realized += a.value - a.cost;
  sim.s.account.cash += a.value;
  sim.s.account.ledger.push({ time: sim.time, kind: 'asset', amount: a.value, balance: sim.s.account.cash, note: `${note}: ${ASSET[a.asset].name}` });
  return a.value;
}

/** The first trading day of each month: luxuries are revalued (art may appreciate; most things don't). */
export function revalue(sim: Sim): void {
  const rng = sim.rng.lifestyle;
  for (const a of held(sim.s.lifestyle)) {
    const spec = ASSET[a.asset];
    a.value *= Math.exp(spec.drift / 12 + spec.vol * Math.sqrt(1 / 12) * rng.normal());
  }
}

/** A month's bills beyond wages: rent, upkeep and subscriptions, in one sum per kind. */
export function monthlyBills(sim: Sim): { rent: number; upkeep: number; subscriptions: number } {
  const s = sim.s.lifestyle;
  return {
    rent: OFFICES[sim.s.staff.office].rent,
    upkeep: held(s).reduce((a, x) => a + ASSET[x.asset].upkeep, 0),
    subscriptions: s.hindsight ? HINDSIGHT_FEE : 0,
  };
}

/**
 * Forced sales (spec §16: bankruptcy comes after the sale of all positions and assets): luxuries to dealers, collectibles
 * to the first eBuy bidder at 80% of their price, until `enough` says stop. Returns what they fetched.
 */
export function sellEverything(sim: Sim, enough: () => boolean): number {
  const s = sim.s.lifestyle;
  let total = 0;
  for (const a of held(s).sort((x, y) => y.value - x.value || x.id - y.id)) {
    if (enough()) return total;
    const v = sellAsset(sim, a.id, 'Forced sale');
    if (typeof v === 'number') total += v;
  }
  for (const i of s.items.slice()) {
    if (enough()) return total;
    const price = 0.8 * itemValue(s, i);
    sellItemNow(sim, i, price, 'Forced sale');
    total += price;
  }
  return total;
}

// ---------- eBuy (spec §14.2) ----------

/**
 * Each close: every category's index moves with its hype phase (quiet, building, mania, bust; manias end likelier the
 * higher prices are), new auctions are listed, and auctions ending today are settled.
 */
export function closeEbuy(sim: Sim, day: number): void {
  const s = sim.s.lifestyle;
  const rng = sim.rng.lifestyle;
  s.hype.forEach((h) => {
    const phase = PHASES[h.phase];
    h.level += phase.drift / 252 + (phase.vol / Math.sqrt(252)) * rng.normal();
    h.level = Math.max(-1.5, h.level);
    if (h.phase === 0 && rng.chance(HYPE.build)) h.phase = 1;
    else if (h.phase === 1 && rng.chance(HYPE.mania)) h.phase = 2;
    else if (h.phase === 2 && rng.chance(HYPE.bust * Math.exp(h.level))) h.phase = 3;
    else if (h.phase === 3 && h.level < HYPE.calm) h.phase = 0;
  });
  for (const a of s.auctions) if (!a.result && a.ends <= day) settleAuction(sim, a);
  // Settled auctions stay a fortnight, for the record.
  s.auctions = s.auctions.filter((a) => !a.result || a.ends > day - 14);
  for (let k = 0; k < AUCTIONS_A_DAY; k++) {
    const category = rng.int(0, CATEGORIES.length - 1);
    const item = rng.int(0, CATEGORIES[category].items.length - 1);
    const base = CATEGORIES[category].items[item][1] * rng.range(0.7, 1.3);
    const value = base * Math.exp(s.hype[category].level);
    s.auctions.push({
      id: s.nextItem++, category, item, base, ends: addTradingDays(day, rng.int(...AUCTION_DAYS)), price: round(0.3 * value),
      ai: aiBid(sim, category, value),
    });
  }
}

/** What the AI bidders will go to: around the item's worth, more while the hype builds, less in a bust. */
function aiBid(sim: Sim, category: number, value: number): number {
  const rng = sim.rng.lifestyle;
  const mood = [0, 0.15, 0.4, -0.25][sim.s.lifestyle.hype[category].phase];
  return round(value * (1 + mood) * Math.exp(rng.normal(0, 0.25)));
}

const round = (v: number) => (v < 100 ? Math.round(v * 100) / 100 : Math.round(v));
const increment = (price: number) => (price < 100 ? 1 : price < 1000 ? 10 : price < 10_000 ? 50 : 250);

/** A proxy bid (spec §14.2: bid against AI buyers): eBuy bids for the player up to `max`, one increment at a time. */
export function bid(sim: Sim, id: number, max: number): Auction | string {
  const a = sim.s.lifestyle.auctions.find((x) => x.id === id);
  if (!a || a.result) return 'This auction has ended.';
  if (a.selling !== undefined) return 'You cannot bid on your own item.';
  const minimum = a.leader === 'player' ? (a.max ?? 0) + 0.01 : a.price + increment(a.price);
  if (!(max >= minimum)) return `Bid at least $${minimum.toLocaleString('en-US', { maximumFractionDigits: 2 })}.`;
  if (!sim.payable(max)) return 'eBuy checks that bidders can pay: you do not have the cash.';
  a.max = max;
  if (max > a.ai) {
    a.leader = 'player';
    a.price = Math.max(a.price, round(Math.min(max, a.ai + increment(a.ai))));
  } else {
    a.leader = 'ai';
    a.price = round(Math.min(a.ai, max + increment(max)));
  }
  return a;
}

function settleAuction(sim: Sim, a: Auction): void {
  const s = sim.s.lifestyle;
  if (a.selling !== undefined) {
    const item = s.items.find((i) => i.id === a.selling);
    if (!item) return void (a.result = 'unsold');
    item.listed = undefined;
    if (a.ai < (a.reserve ?? 0)) return void (a.result = 'unsold');
    a.price = a.ai;
    a.result = 'sold';
    sellItemNow(sim, item, a.ai * (1 - EBUY_FEE), 'Sold on eBuy');
    sim.send({ kind: 'ebuy', amount: a.ai, category: item.category, item: item.item, result: 'sold' });
    return;
  }
  if (a.leader !== 'player') {
    a.result = 'lost';
    if (a.max !== undefined) sim.send({ kind: 'ebuy', amount: a.price, category: a.category, item: a.item, result: 'lost' });
    return;
  }
  // The winner pays; a winner who can't is a non-paying bidder, and the item goes to the next.
  if (!sim.payable(a.price)) {
    a.result = 'unpaid';
    sim.send({ kind: 'ebuy', amount: a.price, category: a.category, item: a.item, result: 'unpaid' });
    return;
  }
  a.result = 'won';
  sim.s.account.cash -= a.price;
  sim.s.account.ledger.push({ time: sim.time, kind: 'collectible', amount: -a.price, balance: sim.s.account.cash, note: CATEGORIES[a.category].items[a.item][0] });
  s.items.push({ id: s.nextItem++, category: a.category, item: a.item, base: a.base, cost: a.price, bought: dayOf(sim.time) });
  sim.send({ kind: 'ebuy', amount: a.price, category: a.category, item: a.item, result: 'won' });
}

function sellItemNow(sim: Sim, item: OwnedItem, proceeds: number, note: string): void {
  const s = sim.s.lifestyle;
  s.items = s.items.filter((i) => i.id !== item.id);
  s.realized += proceeds - item.cost;
  sim.s.account.cash += proceeds;
  sim.s.account.ledger.push({ time: sim.time, kind: 'collectible', amount: proceeds, balance: sim.s.account.cash, note: `${note}: ${CATEGORIES[item.category].items[item.item][0]}` });
}

/** Puts an owned item up for auction: AI bidders decide what it fetches, above the reserve or not at all; eBuy takes 5%. */
export function sellItem(sim: Sim, id: number, reserve = 0): Auction | string {
  const s = sim.s.lifestyle;
  const item = s.items.find((i) => i.id === id);
  if (!item) return 'You do not own that.';
  if (item.listed !== undefined) return 'It is already up for auction.';
  const day = dayOf(sim.time);
  const auction: Auction = {
    id: s.nextItem++, category: item.category, item: item.item, base: item.base, ends: addTradingDays(isTradingDay(day) ? day : nextTradingDay(day), 5),
    price: round(Math.max(reserve, 0.3 * itemValue(s, item))), ai: aiBid(sim, item.category, itemValue(s, item)), selling: item.id, reserve,
  };
  item.listed = auction.id;
  s.auctions.push(auction);
  return auction;
}

// ---------- Conferences (spec §14.2) ----------

/** The trading day a conference opens in a year. */
export function conferenceDay(id: string, year: number): number {
  const c = CONFERENCES.find((x) => x.id === id)!;
  const day = Date.UTC(year, c.month, c.date) / 86_400_000;
  return isTradingDay(day) ? day : nextTradingDay(day);
}

export function buyTicket(sim: Sim, id: string): string | undefined {
  const c = CONFERENCES.find((x) => x.id === id);
  if (!c) return 'There is no such conference.';
  const day = dayOf(sim.time);
  const year = new Date(day * 86_400_000).getUTCFullYear();
  const when = conferenceDay(id, year) > day ? year : year + 1;
  const s = sim.s.lifestyle;
  if (s.tickets.some((t) => t.conference === id && t.year === when)) return 'You already have a ticket.';
  if (!sim.payable(c.price)) return 'You do not have the cash for a ticket.';
  sim.settle(c.price, { kind: 'ticket', note: `${c.name} ${when}`, cause: 'bills' });
  s.tickets.push({ conference: id, year: when });
  return undefined;
}

/**
 * The morning a conference opens: the firm's delegate networks. A mandate offer, a new contact on ISeekYou, and perhaps a
 * tip from the people met there.
 */
export function conferences(sim: Sim, day: number, fees: Fees): void {
  const s = sim.s.lifestyle;
  if (!s.tickets.length) return;
  const year = new Date(day * 86_400_000).getUTCFullYear();
  const rng = sim.rng.lifestyle;
  for (const t of s.tickets) {
    if (t.year !== year || conferenceDay(t.conference, year) !== day) continue;
    const c = CONFERENCES.find((x) => x.id === t.conference)!;
    if (sim.s.settings.clients && rng.chance(c.mandate)) offerMandate(sim, fees);
    const contact = rng.chance(c.contact) ? addInformant(sim, rng, c.name) : undefined;
    if (contact && rng.chance(c.tip)) informantTip(sim, contact, rng);
    sim.send({ kind: 'conference', text: c.id });
  }
  s.tickets = s.tickets.filter((t) => t.year >= year);
}

// ---------- The State Lotto (spec §14.2: negative expected value, as in life) ----------

export function buyLotto(sim: Sim, count: number): string | undefined {
  const s = sim.s.lifestyle;
  if (!Number.isInteger(count) || count < 1) return 'Buy at least one ticket.';
  if (s.lotto.tickets.length + count > LOTTO.maxTickets) return `At most ${LOTTO.maxTickets.toLocaleString('en-US')} tickets a draw.`;
  if (!sim.payable(count * LOTTO.price)) return 'You do not have the cash.';
  const rng = sim.rng.lifestyle;
  for (let k = 0; k < count; k++) s.lotto.tickets.push(pickNumbers(rng));
  sim.settle(count * LOTTO.price, { kind: 'lotto', note: `${count} Quick Pick${count > 1 ? 's' : ''}`, cause: 'bills' });
  return undefined;
}

function pickNumbers(rng: Sim['rng']['lifestyle']): number[] {
  const pool = Array.from({ length: LOTTO.of }, (_, k) => k + 1);
  return rng.shuffle(pool).slice(0, LOTTO.pick).sort((a, b) => a - b);
}

/** Each week's last close: the draw. Winnings are paid at once. */
export function lottoDraw(sim: Sim, day: number): void {
  const s = sim.s.lifestyle;
  if (!s.lotto.tickets.length) return;
  const numbers = pickNumbers(sim.rng.lifestyle);
  let won = 0;
  for (const t of s.lotto.tickets) {
    const hits = t.filter((n) => numbers.includes(n)).length;
    won += hits === LOTTO.pick ? LOTTO.jackpot : LOTTO.prizes[hits] ?? 0;
  }
  s.lotto.draws.push({ day, numbers, won, tickets: s.lotto.tickets.length });
  if (s.lotto.draws.length > 52) s.lotto.draws.shift();
  s.lotto.tickets = [];
  if (won) {
    sim.s.account.charges -= won;
    sim.s.account.cash += won;
    sim.s.account.ledger.push({ time: sim.time, kind: 'lotto', amount: won, balance: sim.s.account.cash, note: 'State Lotto winnings' });
  }
  sim.send({ kind: 'lotto', amount: won, day });
}

// ---------- Hindsight Research (spec §14.2) ----------

export function subscribe(sim: Sim, on: boolean): string | undefined {
  const s = sim.s.lifestyle;
  if (!on) {
    s.hindsight = undefined;
    return undefined;
  }
  if (s.hindsight) return 'You are already a subscriber.';
  if (!sim.payable(HINDSIGHT_FEE)) return 'You do not have the cash for the first month.';
  sim.settle(HINDSIGHT_FEE, { kind: 'subscription', note: 'Hindsight Research: first month', cause: 'bills' });
  s.hindsight = { since: dayOf(sim.time), delivered: [] };
  scheduleHindsight(sim, dayOf(sim.time));
  return undefined;
}

/** Subscribers get each of today's short reports an hour before it is published. */
export function scheduleHindsight(sim: Sim, day: number): void {
  if (!sim.s.lifestyle.hindsight) return;
  const end = at(day + 1, 0);
  for (const p of sim.s.events.plans) {
    if (p.kind !== 'shortReport' || p.time <= sim.time || p.time >= end) continue;
    enqueue(sim.s.events, Math.max(sim.time, p.time - HINDSIGHT_LEAD), { do: 'hindsight', plan: p.id });
  }
}

export function deliverHindsight(sim: Sim, plan: number): void {
  const h = sim.s.lifestyle.hindsight;
  const p = sim.s.events.plans.find((x) => x.id === plan);
  if (!h || !p || h.delivered.includes(plan) || sim.market.state.status[p.company]) return;
  h.delivered.push(plan);
  if (h.delivered.length > 100) h.delivered.shift();
  sim.send({ kind: 'hindsight', company: p.company, amount: p.move, day: dayOf(p.time) });
}

export const hindsightPlan = (sim: Sim, plan: number) => !!sim.s.lifestyle.hindsight?.delivered.includes(plan);

