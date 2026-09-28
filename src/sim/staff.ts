import { ceoName, encodeCeo, randomCeo } from '../world/ceo';
import { Rng } from '../world/rng';
import { addTradingDays, dayOf } from './calendar';
import type { Sim } from './context';
import {
  ADVERT_WEEKS, BOARD_SIZE, HACK_CHANCE, HACK_REPUTATION, OFFICES, POACH_DAYS, POACH_RAISE, QUIT_LOYALTY, ROLE, ROLES, SEVERANCE_MONTHS,
  UNPAID_MONTHS, WHISTLE_HEAT, WHISTLE_LOYALTY, type Role,
} from './data/staff';
import { OUTAGE_DAYS } from './data/darkweb';
import { contactOf } from './desk';
import { addHeat, openAudit } from './regulator';

/**
 * Staff (spec §4A PeopleSoftie HR). Applicants appear on Monstrous.com; the firm hires as many as its office holds (spec
 * §14.2 Greg's List) and pays them on the first trading day of each month. Each role does something for the firm:
 * analysts write research reports whose calls are right as often as they are skilled, traders run the automated rules,
 * compliance officers cool the regulator and warn of mandate breaches, PR managers soften scandals, IT admins keep
 * hackers out, and assistants file the junk mail. People can be poached, quit when unpaid or unhappy, and blow the
 * whistle when the heat is on and their loyalty is gone.
 */
export interface Employee {
  id: number;
  name: string;
  role: Role;
  /** Portrait (spec §4A: each has a generated portrait). */
  ceo: string;
  /** A year's salary. */
  salary: number;
  /** 0–1. */
  skill: number;
  loyalty: number;
  status: 'applicant' | 'staff' | 'former';
  /** The day the advert went up, and the days they joined and left. */
  posted: number;
  hired?: number;
  left?: number;
  why?: 'fired' | 'quit' | 'poached' | 'whistleblower' | 'unpaid';
  /** Wages owed, and months in a row they went unpaid. */
  owed: number;
  unpaid: number;
  /** A rival's offer waiting for an answer (the letter with Match and Let go). */
  offer?: { firm: number; salary: number; mail: number; expires: number };
}

export interface StaffState {
  people: Employee[];
  nextId: number;
  /** Index into OFFICES, and the day the firm moved in. */
  office: number;
  moved: number;
  /** Mandate constraints the compliance officer has warned about: "client:constraint" → the day. */
  flagged: Record<string, number>;
}

const ROLE_WEIGHTS = { analyst: 3, trader: 2, compliance: 1.5, pr: 1.5, it: 1.5, assistant: 2 } as const;
/** Months of wages a rival's offer, a whistleblower's timing… scale with competitor aggressiveness (spec §9). */
const AGGRESSION = { low: 0.5, normal: 1, high: 1.6 } as const;

export function newStaff(seed: string, day: number): StaffState {
  const rng = Rng.stream(seed, 'staff:board');
  const state: StaffState = { people: [], nextId: 1, office: 0, moved: day, flagged: {} };
  for (let k = 0; k < BOARD_SIZE; k++) state.people.push(applicant(rng, state.nextId++, day));
  return state;
}

function applicant(rng: Rng, id: number, day: number): Employee {
  const role = ROLES[rng.weighted(ROLES.map((r) => ROLE_WEIGHTS[r.id]))].id;
  const ceo = randomCeo(rng);
  const skill = Math.min(0.97, Math.max(0.05, rng.normal(0.55, 0.2)));
  const salary = Math.round((ROLE[role].salary * (0.6 + 0.9 * skill) * rng.range(0.9, 1.15)) / 1000) * 1000;
  return {
    id, name: ceoName(ceo), role, ceo: encodeCeo(ceo), salary, skill, loyalty: rng.range(0.35, 0.9), status: 'applicant', posted: day, owed: 0, unpaid: 0,
  };
}

/** Everyone on the payroll, or those in one role. */
export const employed = (sim: Sim, role?: Role) => sim.s.staff.people.filter((p) => p.status === 'staff' && (!role || p.role === role));
/** The best skill on staff in a role, 0 without one. */
export const bestSkill = (sim: Sim, role: Role) => employed(sim, role).reduce((a, p) => Math.max(a, p.skill), 0);
export const capacity = (sim: Sim) => OFFICES[sim.s.staff.office].capacity;
/** Wages owed to staff: a debt against net worth. */
export const wagesOwed = (sim: Sim) => sim.s.staff.people.reduce((a, p) => a + p.owed, 0);

/**
 * How much of a scandal's damage reaches the firm (spec §4A PR Manager): a skilled PR manager halves it. 1 without one,
 * so the numbers are exactly as before.
 */
export const damage = (sim: Sim) => 1 - 0.5 * bestSkill(sim, 'pr');

export function hire(sim: Sim, id: number): string | undefined {
  const p = sim.s.staff.people.find((x) => x.id === id);
  if (!p || p.status !== 'applicant') return 'This applicant has found another job.';
  if (employed(sim).length >= capacity(sim)) return `Your office has room for ${capacity(sim)} staff. Move somewhere bigger on Greg’s List first.`;
  p.status = 'staff';
  p.hired = dayOf(sim.time);
  sim.im({ contact: contactOf(sim, 'staff', p.id), topic: 'hello', variant: p.id });
  return undefined;
}

/** Lets someone go, with a month's severance and any wages owed. */
export function fire(sim: Sim, id: number): string | undefined {
  const p = sim.s.staff.people.find((x) => x.id === id && x.status === 'staff');
  if (!p) return 'They no longer work here.';
  const severance = (p.salary / 12) * SEVERANCE_MONTHS;
  if (!sim.payable(severance + p.owed)) return 'You cannot afford the severance pay.';
  sim.settle(severance, { kind: 'payroll', note: `${p.name}: severance`, cause: 'payroll' });
  leave(sim, p, 'fired');
  return undefined;
}

export function raise(sim: Sim, id: number, pct: number): string | undefined {
  const p = sim.s.staff.people.find((x) => x.id === id && x.status === 'staff');
  if (!p) return 'They no longer work here.';
  if (!(pct > 0 && pct <= 1)) return 'Enter a raise between 1% and 100%.';
  p.salary = Math.round((p.salary * (1 + pct)) / 1000) * 1000;
  p.loyalty = Math.min(1, p.loyalty + 1.5 * pct);
  return undefined;
}

/** Moving office (spec §14.2 Greg's List): the first month's rent up front, and room for everyone on staff. */
export function moveOffice(sim: Sim, tier: number): string | undefined {
  const office = OFFICES[tier];
  const s = sim.s.staff;
  if (!office) return 'There is no such office.';
  if (tier === s.office) return 'You already work there.';
  const staff = employed(sim).length;
  if (staff > office.capacity) return `${office.name} has room for ${office.capacity} staff; you employ ${staff}.`;
  if (!sim.payable(office.rent)) return `You need ${office.rent.toLocaleString('en-US')} dollars of free cash for the first month’s rent.`;
  sim.settle(office.rent, { kind: 'rent', note: `${office.name}: first month`, cause: 'bills' });
  s.office = tier;
  s.moved = dayOf(sim.time);
  return undefined;
}

function leave(sim: Sim, p: Employee, why: NonNullable<Employee['why']>): void {
  p.status = 'former';
  p.left = dayOf(sim.time);
  p.why = why;
  p.offer = undefined;
}

/**
 * The first trading day of each month, at the open: wages. Each month's salary is charged as it falls due and paid from
 * equity the positions don't need; when there isn't enough it is owed, and staff unpaid for two months walk out, their
 * wages then due at once (spec §16: payroll the firm cannot meet ends it). Then loyalty moves, rivals make offers, and
 * the disloyal may blow the whistle.
 */
export function payday(sim: Sim, day: number): void {
  for (const p of employed(sim)) {
    const month = p.salary / 12;
    sim.s.account.charges += month;
    p.owed += month;
    if (sim.payable(p.owed)) {
      sim.settle(p.owed, { kind: 'payroll', note: p.name, accrued: true, cause: 'payroll' });
      p.owed = 0;
      p.unpaid = 0;
      continue;
    }
    p.unpaid++;
    p.loyalty = Math.max(0, p.loyalty - 0.3);
    if (p.unpaid < UNPAID_MONTHS) continue;
    const owed = p.owed;
    p.owed = 0;
    leave(sim, p, 'unpaid');
    sim.send({ kind: 'staffLeft', employee: p.id, reason: 'payroll', amount: owed });
    sim.settle(owed, { kind: 'payroll', note: `${p.name}: wages owed`, accrued: true, cause: 'payroll' });
    if (sim.s.bankruptcy) return;
  }
  monthlyStaff(sim, day);
}

function monthlyStaff(sim: Sim, day: number): void {
  const rng = sim.rng.staff;
  const heat = sim.s.regulator.heat;
  const aggression = AGGRESSION[sim.s.settings.aggression];
  const rivals = sim.s.world.firms.flatMap((f, k) => (f.strategy !== 'index' ? [k] : []));
  for (const p of employed(sim)) {
    // Loyalty grows with time and cools with the heat.
    p.loyalty = Math.min(1, Math.max(0, p.loyalty + 0.02 - heat / 2000));
    if (heat >= WHISTLE_HEAT && p.loyalty < WHISTLE_LOYALTY && rng.chance(0.3)) {
      whistle(sim, p);
      continue;
    }
    if (p.loyalty < QUIT_LOYALTY) {
      leave(sim, p, 'quit');
      sim.send({ kind: 'staffLeft', employee: p.id, reason: 'quit' });
      continue;
    }
    if (!p.offer && rivals.length && rng.chance(0.05 * p.skill * (1.2 - p.loyalty) * aggression)) {
      const firm = rng.pick(rivals);
      const salary = Math.round((p.salary * (1 + rng.range(...POACH_RAISE))) / 1000) * 1000;
      const expires = addTradingDays(day, POACH_DAYS);
      const mail = sim.send({ kind: 'poached', employee: p.id, firm, amount: salary, day: expires });
      p.offer = { firm, salary, mail: mail.id, expires };
      sim.im({ contact: contactOf(sim, 'staff', p.id), topic: 'poached', amount: salary, variant: firm });
    }
  }
  itCheck(sim, day);
}

/** A disloyal employee goes to the regulator (spec §4A): an examination, heat, and evidence from the inside. */
function whistle(sim: Sim, p: Employee): void {
  leave(sim, p, 'whistleblower');
  sim.s.regulator.evidence.push({ time: sim.time, company: -1, kind: 'whistleblower', gain: 0 });
  addHeat(sim, 10);
  openAudit(sim, dayOf(sim.time));
  sim.send({ kind: 'staffLeft', employee: p.id, reason: 'whistleblower' });
}

/** Match a rival's offer (a raise, and loyalty for it) or let them go. */
export function answerOffer(sim: Sim, id: number, match: boolean): string | undefined {
  const p = sim.s.staff.people.find((x) => x.id === id && x.status === 'staff');
  if (!p?.offer) return 'The offer has lapsed.';
  if (match) {
    p.salary = p.offer.salary;
    p.loyalty = Math.min(1, p.loyalty + 0.25);
    p.offer = undefined;
    return undefined;
  }
  leave(sim, p, 'poached');
  return undefined;
}

/**
 * Attacks on the firm's computers (spec §4A IT Admin), a small chance each month, likelier with heat and aggressive
 * rivals. An IT admin stops most of them; what gets through takes the web site down and costs some reputation.
 */
export function itCheck(sim: Sim, day: number): void {
  const rng = sim.rng.staff;
  const chance = HACK_CHANCE * (1 + sim.s.regulator.heat / 50) * AGGRESSION[sim.s.settings.aggression];
  if (!rng.chance(chance)) return;
  const it = employed(sim, 'it').sort((a, b) => b.skill - a.skill)[0];
  if (it && rng.chance(0.5 + 0.45 * it.skill)) {
    sim.send({ kind: 'hackBlocked', employee: it.id });
    return;
  }
  sim.s.darkweb.outages.push({ player: true, until: addTradingDays(day, OUTAGE_DAYS), crew: undefined });
  sim.s.clients.reputation = Math.max(0, sim.s.clients.reputation - HACK_REPUTATION);
  sim.report({ kind: 'story', company: -1, text: 'firmHacked' });
  sim.send({ kind: 'hacked' });
}

/**
 * Each week's end: new applicants replace stale adverts on Monstrous.com, analysts file their reports, and the compliance
 * officer's work cools the regulator's interest (spec §16B: faster with a Compliance Officer).
 */
export function weeklyStaff(sim: Sim, day: number): void {
  const s = sim.s.staff;
  const rng = sim.rng.staff;
  for (const p of s.people) if (p.status === 'applicant' && day - p.posted > 7 * ADVERT_WEEKS) p.status = 'former';
  // Old adverts are forgotten; people who worked here are remembered (the Rolodex).
  s.people = s.people.filter((p) => p.status !== 'former' || p.hired !== undefined);
  const open = s.people.filter((p) => p.status === 'applicant').length;
  for (let k = open; k < BOARD_SIZE; k++) if (k < open + 3) s.people.push(applicant(rng, s.nextId++, day));
  for (const a of employed(sim, 'analyst')) research(sim, a);
  const compliance = bestSkill(sim, 'compliance');
  if (compliance) sim.s.regulator.heat = Math.max(0, sim.s.regulator.heat - (1 + 2 * compliance) * sim.s.settings.heatDecay);
}

/**
 * An analyst's weekly report (spec §4A: accuracy = skill). A right call finds a company the market has mispriced and says
 * which way it should go (towards its worth, where prices drift); a wrong one is a guess. Half are about holdings.
 */
function research(sim: Sim, a: Employee): void {
  const rng = sim.rng.staff;
  const { price, state } = sim.market;
  const cap = (i: number) => price[i] * sim.model.shares[i];
  const held = sim.s.account.positions.filter((p) => !state.status[p.company]).map((p) => p.company);
  const draw = () => {
    for (let tries = 0; tries < 50; tries++) {
      const i = rng.int(0, sim.companies.length - 1);
      if (!state.status[i] && cap(i) >= 500e6) return i;
    }
    return held[0] ?? 0;
  };
  const right = rng.chance(a.skill);
  const onHolding = held.length > 0 && rng.chance(0.5);
  let company = onHolding ? rng.pick(held) : draw();
  if (right && !onHolding) {
    // A good analyst finds the most mispriced of a handful.
    for (let k = 0; k < 12; k++) {
      const i = draw();
      if (Math.abs(state.lnV[i] - state.lnP[i]) > Math.abs(state.lnV[company] - state.lnP[company])) company = i;
    }
  }
  const gap = state.lnV[company] - state.lnP[company];
  const direction: 1 | -1 = right ? (gap >= 0 ? 1 : -1) : rng.chance(0.5) ? 1 : -1;
  const target = price[company] * Math.exp(direction * (right ? Math.max(0.08, Math.abs(gap)) : rng.range(0.08, 0.3)));
  sim.send({ kind: 'research', employee: a.id, company, direction, amount: target, variant: rng.int(0, 999) });
}

/** Each close: the compliance officer warns of constraints about to be breached (spec §4A), once a month each. */
export function complianceCheck(sim: Sim, day: number): void {
  if (!employed(sim, 'compliance').length) return;
  const s = sim.s.staff;
  const nav = sim.nav();
  if (nav <= 0) return;
  const unit = sim.s.clients.units > 0 ? nav / sim.s.clients.units : 1;
  const { price } = sim.market;
  for (const c of sim.s.clients.clients) {
    if (c.status !== 'active' || c.breach || c.redeeming) continue;
    c.constraints.forEach((k, n) => {
      const key = `${c.id}:${n}`;
      if ((s.flagged[key] ?? -Infinity) > day - 30) return;
      let company: number | undefined;
      let near = false;
      for (const p of sim.s.account.positions) {
        const value = Math.abs(p.shares) * price[p.company];
        if (k.kind === 'maxPosition' && value / nav > 0.85 * k.limit && value / nav <= k.limit) company = p.company;
        if (k.kind === 'minCap' && price[p.company] * sim.model.shares[p.company] < 1.15 * k.limit && price[p.company] * sim.model.shares[p.company] >= k.limit) company = p.company;
      }
      if (company !== undefined) near = true;
      if (k.kind === 'maxDrawdown' && unit / c.peak - 1 < -0.75 * k.limit && unit / c.peak - 1 >= -k.limit) near = true;
      if (!near) return;
      s.flagged[key] = day;
      sim.send({ kind: 'compliance', client: c.id, constraint: n, company, employee: employed(sim, 'compliance')[0].id });
    });
  }
}

/** Mornings: a rival's offer nobody answered lapses, and they go. */
export function morningStaff(sim: Sim, day: number): void {
  for (const p of employed(sim)) {
    if (!p.offer || day <= p.offer.expires) continue;
    const mail = sim.s.mail.messages.find((m) => m.id === p.offer!.mail);
    if (mail && !mail.answer) mail.answer = 'expired';
    leave(sim, p, 'poached');
  }
}
