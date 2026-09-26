import { FIRST_NAMES, LAST_NAMES } from '../world/people-names';
import { INDUSTRIES } from '../world/industries';
import type { Rng } from '../world/rng';
import { OPEN, at, dayOf, type GameTime } from './calendar';
import type { Sim } from './context';
import {
  CLIENT_KINDS, CLIENT_NAMES, CONTACT_TITLES, EXCLUSIONS, LIMITS, SAINTS, TOWNS, TRADES, VIRTUES, type ClientKind,
  type ConstraintKind,
} from './data/clients';
import { addTradingDays, enqueue } from './events';
import type { Level } from './settings';

/**
 * Clients and mandates (spec §15.1). The firm runs one book; clients own units of it, like a fund. The starting capital
 * is the founding clients' seed money; mandates add clients, redemptions take their units' worth out in cash. Fees move
 * units from the clients to the firm, so the firm's own capital is the units nobody else owns.
 */
export interface Constraint {
  kind: ConstraintKind;
  /** exclude: industry indices, and what the client calls them. */
  industries?: number[];
  label?: string;
  /** maxDrawdown, maxPosition: a fraction; minCap: dollars; beatIndex: quarters. */
  limit: number;
}

export interface Client {
  id: number;
  name: string;
  kind: ClientKind;
  /** Who signs their letters. */
  contact: string;
  status: 'prospect' | 'active' | 'left' | 'declined' | 'expired';
  /** The mandate offered, and the day the offer lapses. */
  amount: number;
  expires?: number;
  joined?: GameTime;
  left?: GameTime;
  units: number;
  deposited: number;
  withdrawn: number;
  fees: number;
  constraints: Constraint[];
  /** Unit price and MAJOR 500 at the start of the quarter (or when they joined). */
  mark: { unit: number; index: number };
  /** Highest unit price since they joined, for drawdown limits. */
  peak: number;
  /** A benchmark mandate's period: where it started and the quarter-ends left. */
  horizon?: { unit: number; index: number; quarters: number };
  /** 0–100. */
  mood: number;
  /** Quarters in a row behind the index. */
  lagging: number;
  breaches: number;
  /** A breach being given time to fix: the constraint and the trading day it must be fixed by. */
  breach?: { constraint: number; deadline: number };
  /** A redemption on notice: the share of their units, and the day it is paid. */
  redeeming?: { fraction: number; due: number };
}

export interface ClientsState {
  units: number;
  clients: Client[];
  /** 0–100 (spec §16): Phase 8 adds drawdowns and the regulator's record. */
  reputation: number;
  feesEarned: number;
  /** The book's unit price and the MAJOR 500 at the start of the quarter. */
  quarter: { unit: number; index: number };
  /** Trading day of the next mandate offer. */
  nextOffer: number;
}

/** Fees (spec §15.1): 1% a year of assets and 20% of any return above the index, unless the player changes them. */
export interface Fees {
  management: number;
  performance: number;
}
export const DEFAULT_FEES: Fees = { management: 0.01, performance: 0.2 };

const nice = (v: number) => {
  const p = 10 ** Math.floor(Math.log10(v) - 1);
  return Math.round(v / p) * p;
};

export const unitPrice = (sim: Sim) => (sim.s.clients.units > 0 ? sim.nav() / sim.s.clients.units : 1);

/** Units the clients hold; the rest are the firm's own. */
export const clientUnits = (c: ClientsState) => c.clients.reduce((a, x) => a + (x.status === 'active' ? x.units : 0), 0);

function person(rng: Rng, kind: ClientKind): string {
  return `${rng.pick(FIRST_NAMES.slice(0, 400))} ${rng.pick(LAST_NAMES.slice(0, 400))}, ${rng.pick(CONTACT_TITLES[kind])}`;
}

/** A new game's clients: the seed money comes from the CEO's family and a friends-and-family fund (spec §15.1). */
export function founding(rng: Rng, capital: number, index: number, ceoName: string, firmName: string, enabled: boolean): ClientsState {
  const state: ClientsState = {
    units: capital,
    clients: [],
    reputation: 25,
    feesEarned: 0,
    quarter: { unit: 1, index },
    nextOffer: 0,
  };
  if (!enabled) return state;
  const family = Math.round(capital * rng.range(0.5, 0.7));
  const surname = ceoName.trim().split(/\s+/).at(-1) ?? 'Founder';
  for (const [name, amount] of [[`The ${surname} Family`, family], [`${firmName} Friends & Family Fund`, capital - family]] as const) {
    state.clients.push({
      ...blank(state.clients.length + 1, name, 'founder', person(rng, 'founder'), amount, [], index),
      status: 'active', joined: 0, units: amount, deposited: amount,
    });
  }
  return state;
}

function blank(id: number, name: string, kind: ClientKind, contact: string, amount: number, constraints: Constraint[], index: number): Client {
  return {
    id, name, kind, contact, status: 'prospect', amount, units: 0, deposited: 0, withdrawn: 0, fees: 0, constraints,
    mark: { unit: 1, index }, peak: 1, mood: 60, lagging: 0, breaches: 0,
  };
}

/** How much a fee structure puts clients off: cheaper than 1%/20% attracts more and bigger mandates. */
export const feeAppeal = (fees: Fees) =>
  Math.min(1.6, Math.max(0.3, 1 - 20 * (fees.management - 0.01) - 1.5 * (fees.performance - 0.2)));

/**
 * A mandate offer arrives (spec §15.1): a prospective client with an amount that grows with the firm's AUM and
 * reputation, one to three constraints, and a week to answer.
 */
export function offerMandate(sim: Sim, fees: Fees): void {
  const rng = sim.rng.clients;
  const state = sim.s.clients;
  const pick = CLIENT_KINDS[rng.weighted(CLIENT_KINDS.map((k) => k.weight))];
  const kind = pick.kind;
  const surname = rng.pick(LAST_NAMES.slice(0, 400));
  const company = sim.companies[rng.int(0, sim.companies.length - 1)].name.replace(/\s*\(.*?\)/, '').replace(/,?\s(Co|Inc|Corp|Ltd|PLC)\.?$/i, '');
  const name = rng.pick(CLIENT_NAMES[kind]).replace(/\{(\w+)\}/g, (_, slot: string) => {
    switch (slot) {
      case 'town': return rng.pick(TOWNS);
      case 'surname': return surname;
      case 'surname2': return rng.pick(LAST_NAMES.slice(0, 400));
      case 'saint': return rng.pick(SAINTS);
      case 'virtue': return rng.pick(VIRTUES);
      case 'trade': return rng.pick(TRADES);
      case 'number': return String(rng.int(12, 987));
      default: return company;
    }
  });
  const aum = Math.max(sim.nav(), 10_000);
  const size = aum * Math.exp(rng.normal(Math.log(0.3), 0.6)) * (0.5 + state.reputation / 50) * feeAppeal(fees);
  const amount = nice(Math.min(5 * aum, Math.max(25_000, size)));
  const kinds = Object.entries(pick.constraints) as [ConstraintKind, number][];
  const count = rng.weighted([0, 5, 3, 1]);
  const constraints: Constraint[] = [];
  for (let k = 0; k < count && kinds.length; k++) {
    const [c] = kinds.splice(rng.weighted(kinds.map(([, w]) => w)), 1)[0];
    constraints.push(constraint(c, rng));
  }
  const day = dayOf(sim.time);
  const index = sim.market.indexLevel;
  const client: Client = { ...blank(state.clients.length + 1, name, kind, person(rng, kind), amount, constraints, index), expires: addTradingDays(day, 5) };
  state.clients.push(client);
  sim.send({ kind: 'offer', client: client.id, amount, day: client.expires });
}

function constraint(kind: ConstraintKind, rng: Rng): Constraint {
  switch (kind) {
    case 'exclude': {
      const e = rng.pick(EXCLUSIONS);
      return { kind, label: e.label, industries: e.industries.map((id) => INDUSTRIES.findIndex((i) => i.id === id)), limit: 0 };
    }
    case 'maxDrawdown':
      return { kind, limit: rng.pick(LIMITS.maxDrawdown) };
    case 'maxPosition':
      return { kind, limit: rng.pick(LIMITS.maxPosition) };
    case 'minCap':
      return { kind, limit: rng.pick(LIMITS.minCap) };
    case 'beatIndex':
      return { kind, limit: rng.pick(LIMITS.beatIndex) };
  }
}

/** The player takes a mandate: the client's money arrives and buys units at today's price. */
export function accept(sim: Sim, id: number): string | undefined {
  const c = sim.s.clients.clients.find((x) => x.id === id);
  if (!c || c.status !== 'prospect') return 'This offer is no longer open.';
  if (c.expires !== undefined && dayOf(sim.time) > c.expires) return 'This offer has expired.';
  const unit = unitPrice(sim);
  const index = sim.market.indexLevel;
  c.status = 'active';
  c.joined = sim.time;
  c.mark = { unit, index };
  c.peak = unit;
  const bench = c.constraints.find((k) => k.kind === 'beatIndex');
  if (bench) c.horizon = { unit, index, quarters: bench.limit };
  deposit(sim, c, c.amount, unit);
  sim.send({ kind: 'joined', client: c.id, amount: c.amount });
  sim.report({ kind: 'mandate', company: -1, amount: c.amount, text: c.name });
  return undefined;
}

export function decline(sim: Sim, id: number): void {
  const c = sim.s.clients.clients.find((x) => x.id === id);
  if (c?.status === 'prospect') c.status = 'declined';
}

/** Money in: cash and a ledger line, and units for the client. */
function deposit(sim: Sim, c: Client, amount: number, unit: number): void {
  const account = sim.s.account;
  account.cash += amount;
  account.deposits += amount;
  account.ledger.push({ time: sim.time, kind: 'deposit', amount, balance: account.cash, note: c.name });
  const units = amount / unit;
  c.units += units;
  c.deposited += amount;
  sim.s.clients.units += units;
}

/** Notice of a redemption (spec §15.1): paid five trading days later, the broker selling positions if cash is short. */
export function redeem(sim: Sim, c: Client, fraction: number, reason: 'breach' | 'benchmark' | 'performance'): void {
  if (c.redeeming || c.status !== 'active') return;
  const due = addTradingDays(dayOf(sim.time), 5);
  c.redeeming = { fraction, due };
  c.breach = undefined;
  const kind = fraction >= 1 && reason !== 'performance' ? 'terminated' : 'redemption';
  sim.send({ kind, client: c.id, reason, amount: c.units * fraction * unitPrice(sim), day: due });
  enqueue(sim.s.events, at(due, OPEN), { do: 'redeem', client: c.id });
}

/** A redemption falls due: units out, cash out. */
export function settle(sim: Sim, id: number): void {
  const c = sim.s.clients.clients.find((x) => x.id === id);
  if (!c?.redeeming) return;
  const account = sim.s.account;
  const units = c.units * c.redeeming.fraction;
  const owed = units * unitPrice(sim);
  if (account.cash < owed) sim.raiseCash(owed);
  // Pay what the cash covers; any rest stays invested for the client (it only happens when the market is halted).
  const paid = Math.max(0, Math.min(owed, account.cash));
  const out = owed > 0 ? units * (paid / owed) : units;
  account.cash -= paid;
  account.deposits -= paid;
  account.ledger.push({ time: sim.time, kind: 'withdrawal', amount: -paid, balance: account.cash, note: c.name });
  c.units -= out;
  c.withdrawn += paid;
  sim.s.clients.units -= out;
  c.redeeming = undefined;
  if (c.units < 1e-9) {
    c.units = 0;
    c.status = 'left';
    c.left = sim.time;
  }
  sim.send({ kind: 'settled', client: c.id, amount: paid });
}

const PATIENCE: Record<Level, number> = { low: 4, normal: 3, high: 2 };

/** Whether the book breaks a constraint today. */
function breaks(sim: Sim, k: Constraint, c: Client, unit: number): boolean {
  const { price } = sim.market;
  const nav = sim.nav();
  const positions = sim.s.account.positions;
  switch (k.kind) {
    case 'exclude':
      return positions.some((p) => k.industries!.includes(sim.model.sector[p.company]));
    case 'maxPosition':
      return nav > 0 && positions.some((p) => (p.shares * price[p.company]) / nav > k.limit);
    case 'minCap':
      return positions.some((p) => price[p.company] * sim.model.shares[p.company] < k.limit);
    case 'maxDrawdown':
      return unit / c.peak - 1 < -k.limit;
    case 'beatIndex':
      return false;
  }
}

/**
 * At each close: management fees, then every mandate's constraints (spec §15.1). A first breach gets a warning and a
 * week to fix it (a drawdown can't be fixed by selling, so it only ends the mandate when it deepens by half again);
 * a second breach, or a missed deadline, loses the client.
 */
export function closeOfDay(sim: Sim, fees: Fees): void {
  const state = sim.s.clients;
  if (!state.units) return;
  const unit = unitPrice(sim);
  const day = dayOf(sim.time);
  for (const c of state.clients) {
    if (c.status !== 'active') continue;
    const fee = c.units * unit * (fees.management / 252);
    if (fee > 0 && unit > 0) {
      c.units -= fee / unit;
      c.fees += fee;
      state.feesEarned += fee;
    }
    c.peak = Math.max(c.peak, unit);
    if (c.redeeming || !c.constraints.length) continue;
    if (c.breach) {
      const k = c.constraints[c.breach.constraint];
      if (!breaks(sim, k, c, unit)) c.breach = undefined;
      else if (k.kind === 'maxDrawdown' ? unit / c.peak - 1 < -1.5 * k.limit : day >= c.breach.deadline) {
        lose(sim, c, 'breach');
      }
      continue;
    }
    const broken = c.constraints.findIndex((k) => breaks(sim, k, c, unit));
    if (broken < 0) continue;
    c.breaches++;
    if (c.breaches >= 2) lose(sim, c, 'breach');
    else {
      c.breach = { constraint: broken, deadline: addTradingDays(day, 5) };
      sim.send({ kind: 'warning', client: c.id, constraint: broken, day: c.breach.deadline });
    }
  }
}

function lose(sim: Sim, c: Client, reason: 'breach' | 'benchmark'): void {
  sim.s.clients.reputation = Math.max(0, sim.s.clients.reputation - (reason === 'breach' ? 8 : 5));
  redeem(sim, c, 1, reason);
}

/**
 * The last close of a quarter (spec §15.1): statements go out, performance fees are charged, clients reply — praise,
 * questions, top-ups after good quarters, redemptions after too many bad ones — and benchmark mandates are judged.
 */
export function quarterEnd(sim: Sim, fees: Fees, patience: Level): void {
  const state = sim.s.clients;
  const rng = sim.rng.clients;
  const unit = unitPrice(sim);
  const index = sim.market.indexLevel;
  const firm = unit / state.quarter.unit - 1 - (index / state.quarter.index - 1);
  state.reputation = Math.min(100, Math.max(0, state.reputation + Math.max(-6, Math.min(6, firm * 150))));
  sim.report({ kind: 'firmQuarter', company: -1, move: unit / state.quarter.unit - 1, expect: index / state.quarter.index - 1, amount: sim.nav() });
  state.quarter = { unit, index };
  for (const c of state.clients) {
    if (c.status !== 'active' || c.redeeming) continue;
    const mine = unit / c.mark.unit - 1;
    const market = index / c.mark.index - 1;
    const excess = mine - market;
    if (excess > 0 && fees.performance > 0) {
      const fee = fees.performance * excess * c.units * c.mark.unit;
      c.units -= fee / unit;
      c.fees += fee;
      state.feesEarned += fee;
    }
    sim.send({ kind: 'statement', client: c.id, returns: [mine, market], amount: c.units * unit, read: true });
    c.mood = Math.min(100, Math.max(0, c.mood + Math.max(-25, Math.min(25, excess * 400))));
    c.lagging = excess < 0 ? c.lagging + 1 : 0;
    c.mark = { unit, index };
    if (c.horizon && --c.horizon.quarters <= 0) {
      const beat = unit / c.horizon.unit > index / c.horizon.index;
      if (!beat) {
        lose(sim, c, 'benchmark');
        continue;
      }
      const topUp = nice(c.units * unit * rng.range(0.2, 0.4));
      deposit(sim, c, topUp, unit);
      state.reputation = Math.min(100, state.reputation + 5);
      sim.send({ kind: 'completed', client: c.id, amount: topUp, returns: [unit / c.horizon.unit - 1, index / c.horizon.index - 1] });
      c.horizon = { unit, index, quarters: c.constraints.find((k) => k.kind === 'beatIndex')!.limit };
      continue;
    }
    const threshold = PATIENCE[patience] + (c.kind === 'founder' ? 1 : 0);
    if (c.lagging >= threshold) {
      c.lagging = 0;
      redeem(sim, c, c.mood < 30 ? 1 : 0.5, 'performance');
    } else if (excess > 0.02 && rng.chance(0.3 + c.mood / 200)) {
      const topUp = nice(c.units * unit * rng.range(0.1, 0.3));
      deposit(sim, c, topUp, unit);
      sim.send({ kind: 'topUp', client: c.id, amount: topUp, returns: [mine, market] });
    } else {
      sim.send({ kind: excess >= 0 ? 'praise' : 'question', client: c.id, returns: [mine, market], variant: rng.int(0, 999) });
    }
  }
}

/** Morning: lapsed offers, and maybe a new one. */
export function morningClients(sim: Sim, day: number, fees: Fees): void {
  const state = sim.s.clients;
  for (const c of state.clients) {
    if (c.status === 'prospect' && c.expires !== undefined && day > c.expires) {
      c.status = 'expired';
      const offer = sim.s.mail.messages.find((m) => m.kind === 'offer' && m.client === c.id);
      if (offer && !offer.answer) offer.answer = 'expired';
      sim.send({ kind: 'offerExpired', client: c.id });
    }
  }
  if (day < state.nextOffer) return;
  offerMandate(sim, fees);
  // About one offer every two to three weeks, more for a well-regarded, cheap firm.
  const rate = (1 / 12) * (0.6 + state.reputation / 60) * feeAppeal(fees);
  const gap = Math.max(2, Math.round(-Math.log(1 - sim.rng.clients.float()) / rate));
  state.nextOffer = addTradingDays(day, gap);
}

/** Would holding `shares` of a company break a mandate? The order ticket warns before you send it. */
export function mandateWarnings(sim: Sim, company: number, shares: number): string[] {
  const { price } = sim.market;
  const nav = sim.nav();
  const out: string[] = [];
  if (shares <= 0) return out;
  for (const c of sim.s.clients.clients) {
    if (c.status !== 'active') continue;
    for (const k of c.constraints) {
      if (k.kind === 'exclude' && k.industries!.includes(sim.model.sector[company])) out.push(`${c.name}: no ${k.label}.`);
      if (k.kind === 'maxPosition' && nav > 0 && (shares * price[company]) / nav > k.limit) {
        out.push(`${c.name}: no position over ${Math.round(k.limit * 100)}% of the portfolio.`);
      }
      if (k.kind === 'minCap' && price[company] * sim.model.shares[company] < k.limit) {
        out.push(`${c.name}: no companies worth under $${k.limit >= 1e9 ? `${k.limit / 1e9} billion` : `${k.limit / 1e6} million`}.`);
      }
    }
  }
  return out;
}

export const firstOffer = (start: number) => addTradingDays(start, 3);
