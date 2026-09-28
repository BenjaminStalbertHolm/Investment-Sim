import type { Rng } from '../world/rng';
import { addTradingDays, dayOf } from './calendar';
import type { Sim } from './context';
import { jump } from './events';
import { conferenceDay } from './lifestyle';

/**
 * 1998-era events (spec §16C.2), on the calendar the game runs on (1998's; the start year is cosmetic): the dot-com mania
 * from mid-1998, building across technology until it pops around 2000; Long-Term Capital Mismanagement blowing up in a
 * turbulent market; a mad cow scare; El Niño; Doors crashing on stage at COMDEXX; Birkshire Hatchaway, which never splits;
 * and the Tamagotcha. The desktop sheep is the UI's. Everything draws on the module's own stream.
 */
export interface PeriodState {
  /** How far technology has inflated (a log move), and the day the bubble popped. */
  bubble: number;
  popped?: number;
  /** Companies that announced a ".com" name. */
  renamed: number[];
  ltcm?: { day: number; bailout: number; done?: boolean };
  madCow?: number;
  elNino?: { from: number; to: number };
  demoCrash?: number;
  /** Birkshire Hatchaway's id and the highest $50,000 mark its price has passed. */
  birkshire?: { company: number; mark: number };
  tamagotcha?: Tamagotcha;
}

/** The virtual pet (spec §16C.2): it dies if ignored for two game weeks; resurrection costs $1. */
export interface Tamagotcha {
  name: string;
  born: number;
  /** The last day it was fed and played with. */
  fed: number;
  played: number;
  alive: boolean;
  died?: number;
  deaths: number;
}

const DAY = (y: number, m: number, d: number) => Date.UTC(y, m, d) / 86_400_000;
/** "From mid-1998"; "pops around 2000". */
const MANIA = DAY(1998, 6, 1);
const MILLENNIUM = DAY(2000, 0, 1);
const LTCM_LATEST = DAY(1998, 8, 15);
const TECH: Readonly<Record<string, number>> = { internet: 1.6, software: 1.1, hardware: 0.9, semiconductors: 0.9, telecom: 0.8, videoGames: 0.7, media: 0.4 };
/** Birkshire Hatchaway has never split: its shares trade at about a quarter of a million dollars when the module starts. */
const NEVER_SPLIT_PRICE = 250_000;
const MARK = 50_000;
/** Two game weeks without attention, and the pet dies. */
const NEGLECT = 14;

export function newPeriod(sim: Sim): PeriodState {
  const s: PeriodState = { bubble: 0, renamed: [] };
  neverSplit(sim, s);
  return s;
}

/**
 * Birkshire Hatchaway (spec §16C.2: it never splits; its price climbs past $400,000). Switching the module on undoes the
 * splits it would never have made — one new share for as many old ones as bring it to about $250,000, with cash for
 * fractions — and it is spared splits from then on.
 */
export function neverSplit(sim: Sim, s: PeriodState): void {
  const i = sim.companies.findIndex((c) => c.ticker === 'BRKH');
  if (i < 0 || sim.market.state.status[i]) return;
  s.birkshire ??= { company: i, mark: 0 };
  if (sim.market.price[i] >= 10_000) return;
  sim.reverseSplit(i, Math.max(2, Math.round(NEVER_SPLIT_PRICE / sim.market.price[i] / 10) * 10));
  s.birkshire.mark = Math.floor(sim.market.price[i] / MARK) * MARK;
}

export const exemptFromSplits = (sim: Sim) => {
  const b = sim.s.modules.period?.birkshire;
  return sim.s.settings.modules.periodEvents && b ? (i: number) => i === b.company : undefined;
};

const techWeight = (sim: Sim, i: number) => TECH[sim.companies[i].industry.id] ?? 0;

function tech(sim: Sim, rng: Rng, logMove: number, persist: number, bars: number): void {
  const { status } = sim.market.state;
  for (let i = 0; i < sim.companies.length; i++) {
    const w = techWeight(sim, i);
    if (w && !status[i]) jump(sim, i, logMove * w * rng.range(0.7, 1.3), persist, bars);
  }
}

const dotcom = (name: string) =>
  `${name.replace(/\s+(Inc|Corp|Co|Ltd|PLC|Holdings|Group|Company|Corporation|Industries|Systems|Technologies)\.?$/i, '').replace(/[^A-Za-z0-9]/g, '')}.com`;
const story = (sim: Sim, text: string, company = -1, args: string[] = [], move?: number) =>
  sim.report({ kind: 'story', company, text: `period.${text}`, args, ...(move !== undefined ? { move } : {}) });

/** 07:00: LTCM's bailout, Doors at COMDEXX, the pet's health, and Birkshire's climb on the first trading day of the month. */
export function morningPeriod(sim: Sim, day: number, monthStart: boolean): void {
  const s = sim.s.modules.period!;
  const rng = sim.rng.period;
  if (s.ltcm && !s.ltcm.done && day >= s.ltcm.bailout) {
    s.ltcm.done = true;
    story(sim, 'ltcmBailout');
    // A brief panic, then relief: most of it comes back.
    for (let i = 0; i < sim.companies.length; i++) if (!sim.market.state.status[i]) jump(sim, i, Math.log1p(rng.range(-0.03, -0.015)), 0, rng.int(20, 60));
  }
  const year = new Date(day * 86_400_000).getUTCFullYear();
  if (s.demoCrash === undefined && day === conferenceDay('comdexx', year)) {
    s.demoCrash = day;
    const i = sim.companies.findIndex((c) => c.ticker === 'MJSF');
    if (i >= 0 && !sim.market.state.status[i]) {
      jump(sim, i, Math.log1p(-0.03), 0.2, rng.int(5, 20));
      story(sim, 'demoCrash', i);
    }
    sim.emit({ kind: 'demoCrash' });
  }
  const pet = s.tamagotcha;
  if (pet?.alive && day - Math.max(pet.fed, pet.played) > NEGLECT) {
    pet.alive = false;
    pet.died = day;
    pet.deaths++;
  }
  const b = s.birkshire;
  if (monthStart && b && !sim.market.state.status[b.company]) jump(sim, b.company, Math.log1p(0.012), 1, rng.int(5, 30));
}

/** Each close: El Niño's weather, LTCM in a turbulent market, Birkshire's milestones; at a week's end, the mania. */
export function closePeriod(sim: Sim, day: number, weekEnd: boolean): void {
  const s = sim.s.modules.period!;
  const rng = sim.rng.period;
  if (s.elNino && day <= s.elNino.to) {
    for (const code of ['ZC', 'ZW', 'ZS', 'KC', 'CC', 'SB', 'OJ']) sim.commodityShock(code, rng.normal(0, 0.025), rng.int(1, 6));
  }
  // LTCM blows up when the market turns turbulent; if it doesn't by the autumn of 1998, its own leverage makes it turbulent.
  const regime = sim.market.state.regime;
  const turbulent = regime === 2 || regime === 3;
  if (!s.ltcm && day >= MANIA && (turbulent ? rng.chance(0.15) : day >= LTCM_LATEST && rng.chance(0.02))) {
    s.ltcm = { day, bailout: addTradingDays(day, 3) };
    if (!turbulent) sim.market.state.regime = 2;
    story(sim, 'ltcm');
    // Its book — the largest companies — is dumped.
    const big = sim.companies.map((c, i) => [c.marketCap, i] as const).filter(([, i]) => !sim.market.state.status[i]).sort((a, b) => b[0] - a[0]).slice(0, 60);
    for (const [, i] of rng.shuffle(big).slice(0, 15)) jump(sim, i, Math.log1p(rng.range(-0.1, -0.04)), 0.3, rng.int(5, 30));
  }
  const b = s.birkshire;
  if (b && !sim.market.state.status[b.company] && sim.market.price[b.company] >= b.mark + MARK) {
    b.mark = Math.floor(sim.market.price[b.company] / MARK) * MARK;
    if (b.mark >= 250_000) story(sim, 'birkshire', b.company, [String(b.mark)]);
  }
  if (weekEnd) weeklyPeriod(sim, day, rng);
}

function weeklyPeriod(sim: Sim, day: number, rng: Rng): void {
  const s = sim.s.modules.period!;
  if (day >= MANIA && s.popped === undefined) {
    // The froth builds across technology, and prices take their values with them: a bubble, not a mispricing.
    const build = Math.max(0, rng.normal(0.012, 0.005));
    s.bubble += build;
    tech(sim, rng, build, 1, rng.int(40, 200));
    if (rng.chance(0.6)) rename(sim, rng, s);
    const stretch = Math.max(0, s.bubble - 0.3) * 0.03 + (day >= MILLENNIUM ? 0.05 : 0);
    if (rng.chance(Math.min(0.35, stretch))) {
      s.popped = day;
      story(sim, 'pop', -1, [], -s.bubble);
      const crash = 0.7 * s.bubble;
      s.bubble -= crash;
      tech(sim, rng, -crash, 1, 255);
    }
  } else if (s.popped !== undefined && s.bubble > 0.01) {
    // The rest of the froth leaks out over the weeks that follow.
    const leak = s.bubble * 0.3;
    s.bubble -= leak;
    tech(sim, rng, -leak, 1, rng.int(60, 200));
  }
  if (s.madCow === undefined && day >= DAY(1998, 2, 1) && rng.chance(0.01)) {
    s.madCow = day;
    sim.commodityShock('LE', Math.log1p(-rng.range(0.15, 0.25)), rng.int(6, 20));
    const i = sim.companies.findIndex((c) => c.ticker === 'MCRD');
    if (i >= 0 && !sim.market.state.status[i]) jump(sim, i, Math.log1p(-rng.range(0.06, 0.1)), 0.5, rng.int(5, 20));
    for (let k = 0; k < sim.companies.length; k++) {
      if (k !== i && sim.companies[k].industry.id === 'restaurants' && !sim.market.state.status[k]) jump(sim, k, Math.log1p(-rng.range(0.01, 0.03)), 0.3, rng.int(5, 20));
    }
    story(sim, 'madCow', i);
  }
  if (s.elNino === undefined && day >= DAY(1998, 5, 1) && rng.chance(0.02)) {
    s.elNino = { from: day, to: day + 120 };
    story(sim, 'elNino');
  }
}

/** A company announces it is becoming a ".com" (spec §16C.2: it jumps 20–60%); technology names are likeliest. */
function rename(sim: Sim, rng: Rng, s: PeriodState): void {
  const { status } = sim.market.state;
  const candidates: number[] = [];
  const weights: number[] = [];
  for (let i = 0; i < sim.companies.length; i++) {
    const cap = sim.market.price[i] * sim.model.shares[i];
    if (status[i] || cap > 20e9 || s.renamed.includes(i) || sim.companies[i].name.endsWith('.com')) continue;
    candidates.push(i);
    weights.push(1 + 3 * techWeight(sim, i));
  }
  if (!candidates.length) return;
  const i = candidates[rng.weighted(weights)];
  s.renamed.push(i);
  const move = rng.range(0.2, 0.6);
  jump(sim, i, Math.log1p(move), 0.4, rng.int(3, 15));
  story(sim, 'dotcom', i, [dotcom(sim.companies[i].name)], move);
}

/** The pet's owner: adopt, feed, play, or bring it back for a dollar. */
export function tamagotcha(sim: Sim, action: 'adopt' | 'feed' | 'play' | 'resurrect', name?: string): string | undefined {
  const s = sim.s.modules.period;
  if (!s || !sim.s.settings.modules.periodEvents) return 'Tamagotcha needs the 1998-era events module.';
  const day = dayOf(sim.time);
  const pet = s.tamagotcha;
  switch (action) {
    case 'adopt':
      if (pet) return 'You already have a Tamagotcha.';
      s.tamagotcha = { name: (name ?? '').trim().slice(0, 16) || 'Lucky', born: day, fed: day, played: day, alive: true, deaths: 0 };
      return undefined;
    case 'feed':
    case 'play':
      if (!pet) return 'Adopt a Tamagotcha first.';
      if (!pet.alive) return `${pet.name} has died. Resurrection costs $1.`;
      if (action === 'feed') pet.fed = day;
      else pet.played = day;
      return undefined;
    case 'resurrect':
      if (!pet || pet.alive) return 'There is nothing to resurrect.';
      if (!sim.payable(1)) return 'You do not have a dollar.';
      sim.settle(1, { kind: 'pet', note: `${pet.name}: resurrection`, cause: 'bills' });
      Object.assign(pet, { alive: true, fed: day, played: day, died: undefined });
      delete pet.died;
      return undefined;
  }
}

/** Switched off: El Niño's season and LTCM's story end quietly. The bubble stays as it is; nothing more inflates it. */
export function wrapUpPeriod(sim: Sim): void {
  const s = sim.s.modules.period!;
  const day = dayOf(sim.time);
  if (s.elNino && s.elNino.to > day) s.elNino.to = day;
  if (s.ltcm) s.ltcm.done = true;
}
