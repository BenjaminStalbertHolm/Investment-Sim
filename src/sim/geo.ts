import { encodeCeo, randomCeo, type Ceo } from '../world/ceo';
import { FIRST_NAMES, LAST_NAMES } from '../world/people-names';
import { Rng } from '../world/rng';
import * as O from '../art/portrait/options';
import { at, nextTradingDay, OPEN } from './calendar';
import type { Sim } from './context';
import { COUNTRIES, COUNTRY, COUNTRY_OF_CITY, NAME_POOLS, PAIRS, REGIONS, type CountrySpec } from './data/countries';
import { EVENT_TYPES } from './data/events';
import { jump, plan } from './events';

/**
 * Geopolitics (spec §16C.1): a light, joking world. Companies take their home country from their HQ city. Pairs of
 * countries escalate along a ladder of rhetoric, tariffs, sanctions, a blockade and skirmishes, then a ceasefire; each rung
 * is news that moves the countries' companies, the industries that suffer or gain, and commodities. Countries have their
 * own events — Italy's governments, the United Kingdom's referendums, Iceland's banks, Argentina's defaults — and the dry
 * ones only supply and sanctions news. Leaders come and go with elections, except the fixed gag leaders. Everything here
 * draws on the module's own stream, so with the module off nothing changes.
 */
export interface GeoState {
  /** Pair → the rung it stands on (0 calm) and the day it got there. */
  tensions: Record<string, { rung: number; since: number }>;
  /** Country → its leader's portrait code and, where the country's leader is generated, their name. */
  leaders: Record<string, { ceo: string; name?: string; since: number }>;
  /** Months since Iceland's last banking crisis, and Argentina's defaults so far. */
  iceland: number;
  defaults: number;
  /** The day Italy's government next falls. */
  italy: number;
}

const TERRITORIES = ['Bermuda', 'the Bahamas', 'Iceland (again)', 'the Moon', 'a Scottish island nobody lives on', 'Baja California', 'Tasmania', 'Antarctica'];

/** A leader's face and, if the table names none, a name: generated from the country's own pool. */
function newLeader(rng: Rng, c: CountrySpec, day: number): GeoState['leaders'][string] {
  const ceo: Ceo = randomCeo(rng);
  const pick = <T extends string>(list: readonly T[], name: string | undefined, fallback: number) => {
    const k = name ? list.indexOf(name as T) : -1;
    return k >= 0 ? k : fallback;
  };
  const look = c.leader.look ?? {};
  ceo.hair = pick(O.HAIR_STYLES, look.hair, ceo.hair);
  ceo.accessory = pick(O.ACCESSORIES, look.accessory, ceo.accessory);
  ceo.mouth = pick(O.MOUTHS, look.mouth, ceo.mouth);
  ceo.eyes = pick(O.EYES, look.eyes, ceo.eyes);
  ceo.facialHair = pick(O.FACIAL_HAIR, look.facialHair, ceo.facialHair);
  // Leaders must not resemble real politicians or historical dictators.
  if (O.FACIAL_HAIR[ceo.facialHair] === 'toothbrushMoustache') ceo.facialHair = 0;
  const pool = NAME_POOLS[c.id];
  const name = c.leader.name ?? (pool ? `${rng.pick(pool[0])} ${rng.pick(pool[1])}` : `${rng.pick(FIRST_NAMES.slice(0, 200))} ${rng.pick(LAST_NAMES.slice(0, 200))}`);
  return { ceo: encodeCeo(ceo), since: day, ...(c.leader.name ? {} : { name }) };
}

/** The module's world as it stands the day it is switched on. Leaders come from a stream of their own. */
export function newGeo(seed: string, day: number): GeoState {
  const rng = Rng.stream(seed, 'geo:leaders');
  const leaders: GeoState['leaders'] = {};
  for (const c of COUNTRIES) leaders[c.id] = newLeader(rng, c, day);
  return { tensions: {}, leaders, iceland: 0, defaults: 0, italy: day + rng.int(10, 40) };
}

const homes = new WeakMap<readonly unknown[], { length: number; country: (string | undefined)[] }>();

/** Each company's home country in the module's world (spec §16C.1: HQ cities map to countries), undefined if unlisted. */
export function homeCountries(sim: Pick<Sim, 'companies'>): (string | undefined)[] {
  let cached = homes.get(sim.companies);
  if (!cached || cached.length !== sim.companies.length) {
    cached = { length: sim.companies.length, country: sim.companies.map((c) => COUNTRY_OF_CITY[c.hq.country]) };
    homes.set(sim.companies, cached);
  }
  return cached.country;
}

type Filter = (i: number) => boolean;

/** Moves every listed company the filter picks by a log move drawn from [lo, hi] (fractions), part of it lasting. */
function hit(sim: Sim, rng: Rng, filter: Filter, lo: number, hi: number, persist = 0.3): number {
  let n = 0;
  const { status } = sim.market.state;
  for (let i = 0; i < sim.companies.length; i++) {
    if (status[i] || !filter(i)) continue;
    jump(sim, i, Math.log1p(rng.range(lo, hi)), persist, rng.int(3, 20));
    n++;
  }
  return n;
}

const inCountry = (sim: Sim, ...ids: string[]): Filter => {
  const home = homeCountries(sim);
  return (i) => ids.includes(home[i] ?? '');
};
const inIndustry = (sim: Sim, ...ids: string[]): Filter => (i) => ids.includes(sim.companies[i].industry.id);
const shock = (sim: Sim, rng: Rng, code: string, lo: number, hi: number) => sim.commodityShock(code, Math.log1p(rng.range(lo, hi)), rng.int(4, 12));
const story = (sim: Sim, text: string, args: string[] = [], company = -1, move?: number) =>
  sim.report({ kind: 'story', company, text: `geo.${text}`, args, ...(move !== undefined ? { move } : {}) });

/** A rung's effects on markets (spec §16C.1: exporters' commodities move, defence up, airlines, insurers, shipping hit). */
function rungEffects(sim: Sim, rng: Rng, a: string, b: string, rung: number, max: number): void {
  const both = inCountry(sim, a, b);
  if (max === 1) {
    // Harsh words only: a flicker in the two countries' shares.
    if (a !== b) hit(sim, rng, both, -0.008, -0.002, 0);
    return;
  }
  switch (rung) {
    case 1:
      hit(sim, rng, both, -0.01, -0.003, 0);
      return;
    case 2:
      hit(sim, rng, inCountry(sim, b), -0.04, -0.015);
      hit(sim, rng, (i) => inCountry(sim, a)(i) && inIndustry(sim, 'autos', 'retail', 'agriculture')(i), -0.03, -0.01);
      shock(sim, rng, 'ZC', -0.06, -0.02);
      return;
    case 3:
      hit(sim, rng, inCountry(sim, b), -0.08, -0.03);
      hit(sim, rng, inCountry(sim, a), -0.02, -0.005);
      shock(sim, rng, 'SB', 0.02, 0.06);
      return;
    case 4:
      hit(sim, rng, inCountry(sim, b), -0.1, -0.04);
      hit(sim, rng, inIndustry(sim, 'shipping'), -0.06, -0.02);
      hit(sim, rng, inIndustry(sim, 'airlines', 'insurance'), -0.04, -0.01);
      hit(sim, rng, inIndustry(sim, 'aerospace'), 0.02, 0.05, 0.5);
      shock(sim, rng, 'CL', 0.02, 0.05);
      return;
    case 5:
      hit(sim, rng, inCountry(sim, b), -0.12, -0.05);
      hit(sim, rng, inCountry(sim, a), -0.03, -0.01);
      hit(sim, rng, inIndustry(sim, 'airlines', 'insurance'), -0.06, -0.02);
      hit(sim, rng, inIndustry(sim, 'aerospace'), 0.03, 0.07, 0.5);
      hit(sim, rng, () => true, -0.02, -0.005, 0);
      shock(sim, rng, 'CL', 0.03, 0.08);
      shock(sim, rng, 'GC', 0.02, 0.05);
  }
}

/** A tension spike sends money to the safe haven (spec §16C.1: Switzerland). */
function safeHaven(sim: Sim, rng: Rng): void {
  hit(sim, rng, inCountry(sim, 'switzerland'), 0.01, 0.02, 0);
  shock(sim, rng, 'GC', 0.01, 0.03);
}

/** Each week's end: the pairs' tensions move, and the countries have their weeks. */
export function weeklyGeo(sim: Sim, day: number): void {
  const g = sim.s.modules.geo!;
  const rng = sim.rng.geo;
  for (const p of PAIRS) {
    const t = g.tensions[p.id] ?? { rung: 0, since: day };
    let next = t.rung;
    if (t.rung === 0) next = rng.chance(p.flare) ? 1 : 0;
    else if (t.rung < p.max && rng.chance(0.22)) next = t.rung + 1;
    else if (rng.chance(t.rung >= p.max ? 0.3 : 0.12)) next = 0;
    if (next === t.rung) continue;
    g.tensions[p.id] = { rung: next, since: day };
    if (next === 0) {
      delete g.tensions[p.id];
      story(sim, t.rung >= 2 ? 'ceasefire' : 'calm', [p.a, p.b]);
      if (t.rung >= 2) {
        hit(sim, rng, inCountry(sim, p.a, p.b), 0.01, 0.03);
        hit(sim, rng, inIndustry(sim, 'aerospace'), -0.02, -0.005, 0.5);
      }
      continue;
    }
    story(sim, p.a === p.b ? 'letter' : p.max === 1 ? 'rhetoricOnly' : `rung${next}`, [p.a, p.b]);
    rungEffects(sim, rng, p.a, p.b, next, p.max);
    if (next >= 3) safeHaven(sim, rng);
  }
  countryWeek(sim, day, rng);
  elections(sim, day, rng);
}

function countryWeek(sim: Sim, day: number, rng: Rng): void {
  const g = sim.s.modules.geo!;
  const month = new Date(day * 86_400_000).getUTCMonth();
  if (day >= g.italy) {
    g.italy = day + rng.int(15, 45);
    g.leaders.italy = newLeader(rng, COUNTRY.italy, day);
    story(sim, 'italy', ['italy', g.leaders.italy.name!]);
    hit(sim, rng, inCountry(sim, 'italy'), -0.02, -0.005, 0.2);
  }
  if (rng.chance(0.03)) {
    const up = rng.chance(0.5);
    story(sim, up ? 'referendumYes' : 'referendumNo', ['uk']);
    hit(sim, rng, inCountry(sim, 'uk'), up ? 0.015 : -0.04, up ? 0.04 : -0.015, 0.3);
  }
  if (rng.chance(0.02)) story(sim, 'buyTerritory', ['usga', rng.pick(TERRITORIES)]);
  if (rng.chance(0.002 * g.iceland)) {
    g.iceland = 0;
    story(sim, 'iceland', ['iceland']);
    hit(sim, rng, (i) => inCountry(sim, 'iceland')(i) && inIndustry(sim, 'banks')(i), -0.7, -0.4, 1);
    hit(sim, rng, inIndustry(sim, 'banks'), -0.04, -0.015, 0.3);
  }
  if (rng.chance(0.004)) {
    g.defaults++;
    story(sim, 'argentina', ['argentina', String(9 + g.defaults)]);
    hit(sim, rng, inCountry(sim, 'argentina'), -0.15, -0.08, 0.6);
    shock(sim, rng, 'ZS', -0.03, -0.01);
  }
  if (rng.chance(0.03)) {
    story(sim, 'missile', ['northKorea']);
    hit(sim, rng, () => true, -0.008, -0.003, 0);
    shock(sim, rng, 'GC', 0.005, 0.015);
  }
  if (rng.chance(month >= 5 && month <= 7 ? 0.05 : 0.005)) {
    story(sim, 'frost', ['brazil']);
    shock(sim, rng, 'KC', 0.1, 0.25);
  }
  if (rng.chance(0.01)) {
    story(sim, 'copper', ['chile']);
    shock(sim, rng, 'HG', 0.04, 0.08);
  }
  if (rng.chance(0.006)) {
    story(sim, 'canal', ['egypt']);
    hit(sim, rng, inIndustry(sim, 'shipping'), 0.05, 0.12, 0.2);
    hit(sim, rng, inIndustry(sim, 'retail'), -0.015, -0.003, 0);
    shock(sim, rng, 'CL', 0.01, 0.03);
  }
  // The dry countries: supply and sanctions, told plainly.
  if (rng.chance(0.01)) {
    story(sim, 'sanctions', ['russia']);
    shock(sim, rng, 'NG', 0.06, 0.12);
    shock(sim, rng, 'CL', 0.03, 0.06);
    hit(sim, rng, inCountry(sim, 'russia'), -0.1, -0.05, 0.5);
  }
  if (rng.chance(0.012)) {
    const from = rng.chance(0.5) ? 'ukraine' : 'russia';
    story(sim, 'grain', [from]);
    shock(sim, rng, 'ZW', 0.04, 0.1);
    shock(sim, rng, 'ZC', 0.02, 0.06);
  }
  if (rng.chance(0.012)) {
    story(sim, 'strait', ['iran']);
    shock(sim, rng, 'CL', 0.04, 0.09);
    shock(sim, rng, 'BZ', 0.04, 0.09);
    hit(sim, rng, inIndustry(sim, 'airlines'), -0.04, -0.015, 0.2);
  }
  if (rng.chance(0.012)) {
    story(sim, 'exportControls', ['china']);
    hit(sim, rng, inIndustry(sim, 'semiconductors', 'hardware'), -0.05, -0.02, 0.4);
    hit(sim, rng, inCountry(sim, 'china'), -0.04, -0.02, 0.4);
  }
  if (rng.chance(0.01)) {
    story(sim, 'tariffsChina', ['china']);
    hit(sim, rng, inIndustry(sim, 'retail', 'hardware'), -0.03, -0.01, 0.3);
  }
  if (rng.chance(0.01)) {
    story(sim, 'chips', ['taiwan']);
    hit(sim, rng, inIndustry(sim, 'semiconductors'), -0.07, -0.03, 0.3);
  }
  if (rng.chance(0.008)) {
    story(sim, 'oilSupply', ['nigeria']);
    shock(sim, rng, 'CL', 0.02, 0.05);
  }
  if (rng.chance(0.01)) {
    story(sim, 'mines', ['southAfrica']);
    shock(sim, rng, 'PL', 0.04, 0.08);
    shock(sim, rng, 'GC', 0.01, 0.02);
  }
  const home = homeCountries(sim);
  if (rng.chance(0.02)) {
    // A family feud at a conglomerate.
    const korean = sim.companies.flatMap((_, i) => (home[i] === 'southKorea' && !sim.market.state.status[i] ? [i] : []));
    if (korean.length) {
      const i = rng.pick(korean);
      story(sim, 'feud', ['southKorea'], i);
      jump(sim, i, Math.log1p(rng.range(-0.08, -0.03)), 0.3, rng.int(3, 12));
    }
  }
  // Strikes hit French companies twice as often (spec §16C.1): as many again as the events model plans.
  const strike = EVENT_TYPES.find((e) => e.kind === 'strike')!;
  for (let i = 0; i < sim.companies.length; i++) {
    if (home[i] !== 'france' || sim.market.state.status[i] || !rng.chance((strike.rate * 5) / 252)) continue;
    plan(sim, 'strike', i, at(nextTradingDay(day), OPEN + 5 * rng.int(1, 77)), -rng.range(...strike.move), 0);
  }
  // Unlisted countries: regional news only.
  if (rng.chance(0.01)) {
    const region = rng.pick([...new Set(Object.values(REGIONS))]);
    const up = rng.chance(0.5);
    story(sim, up ? 'regionalUp' : 'regionalDown', [region]);
    hit(sim, rng, (i) => REGIONS[sim.companies[i].hq.country] === region, up ? 0.01 : -0.04, up ? 0.04 : -0.01, 0.3);
  }
  if (rng.chance(0.005)) story(sim, 'antarctica', ['antarctica']);
}

/** Elections, and now and then a coup where things are fragile (never where there is a war, never the gag leaders). */
function elections(sim: Sim, day: number, rng: Rng): void {
  const g = sim.s.modules.geo!;
  for (const c of COUNTRIES) {
    if (c.leader.fixed || c.nope || c.id === 'italy' || !rng.chance(0.004)) continue;
    const coup = !c.dry && c.stability <= 2 && rng.chance(0.25);
    g.leaders[c.id] = newLeader(rng, { ...c, leader: { ...c.leader, name: undefined } }, day);
    story(sim, coup ? 'coup' : 'election', [c.id, g.leaders[c.id].name!]);
    if (coup) hit(sim, rng, inCountry(sim, c.id), -0.08, -0.03, 0.4);
  }
}

/** The first trading day of each month: Iceland's banks grow another month more precarious. */
export function monthlyGeo(sim: Sim): void {
  sim.s.modules.geo!.iceland++;
}

/** A leader as the atlas shows it: title, name and note. */
export function leaderOf(g: GeoState, id: string): { title: string; name: string; note?: string; ceo: string; since: number } {
  const c = COUNTRY[id];
  const l = g.leaders[id];
  // A leader who replaced the table's named one has no joke of their own yet.
  return { title: c.leader.title, name: l.name ?? c.leader.name ?? '', note: l.name && c.leader.name ? undefined : c.leader.note, ceo: l.ceo, since: l.since };
}
