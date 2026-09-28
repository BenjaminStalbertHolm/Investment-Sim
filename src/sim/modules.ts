import { dayOf } from './calendar';
import type { Sim } from './context';
import { closeGags, morningGags, newGags, wrapUpGags, type GagsState } from './gags';
import { monthlyGeo, newGeo, weeklyGeo, type GeoState } from './geo';
import { closePeriod, morningPeriod, neverSplit, newPeriod, wrapUpPeriod, type PeriodState } from './period';
import type { GameSettings } from './settings';

/**
 * The optional fun modules (spec §16C): Geopolitics, 1998-era events, and recurring gags and storylines. All are off by
 * default. Each keeps its state here and draws on a stream of its own, so with every module off the simulation is exactly
 * as it was without them: no state changes, no random draws. A module's state is made the first time it is switched on
 * and kept when it is switched off, so switching it back on picks up where it left off; switching off wraps up running
 * storylines quietly.
 */
export interface ModulesState {
  geo?: GeoState;
  period?: PeriodState;
  gags?: GagsState;
}

export type ModuleFlags = GameSettings['modules'];
type Key = keyof ModuleFlags;

const on = (sim: Sim, key: Key) => sim.s.settings.modules[key];

/** A new game's modules: those switched on in Setup start with it. */
export function startModules(sim: Sim): void {
  for (const key of ['geopolitics', 'periodEvents', 'gags'] as const) if (on(sim, key)) switchOn(sim, key);
}

/** My Computer → Game → Fun modules (spec §16C: each toggles cleanly mid-game). */
export function setModules(sim: Sim, flags: ModuleFlags): void {
  const before = sim.s.settings.modules;
  sim.s.settings.modules = { geopolitics: !!flags.geopolitics, periodEvents: !!flags.periodEvents, gags: !!flags.gags };
  for (const key of ['geopolitics', 'periodEvents', 'gags'] as const) {
    if (flags[key] && !before[key]) switchOn(sim, key);
    if (!flags[key] && before[key]) switchOff(sim, key);
  }
}

function switchOn(sim: Sim, key: Key): void {
  const m = sim.s.modules;
  if (key === 'geopolitics') m.geo ??= newGeo(sim.s.world.seed, dayOf(sim.time));
  if (key === 'periodEvents') {
    if (m.period) neverSplit(sim, m.period);
    else m.period = newPeriod(sim);
  }
  if (key === 'gags') m.gags ??= newGags(sim);
}

function switchOff(sim: Sim, key: Key): void {
  const m = sim.s.modules;
  // Tensions die down unreported; storylines end without their finales.
  if (key === 'geopolitics' && m.geo) m.geo.tensions = {};
  if (key === 'periodEvents' && m.period) wrapUpPeriod(sim);
  if (key === 'gags' && m.gags) wrapUpGags(sim);
}

/** 07:00 on a trading day. */
export function morningModules(sim: Sim, day: number, monthStart: boolean): void {
  const m = sim.s.modules;
  if (on(sim, 'geopolitics') && m.geo && monthStart) monthlyGeo(sim);
  if (on(sim, 'periodEvents') && m.period) morningPeriod(sim, day, monthStart);
  if (on(sim, 'gags') && m.gags) morningGags(sim, day);
}

/** Each close, after everything else the day brings. */
export function closeModules(sim: Sim, day: number, weekEnd: boolean, quarter: boolean): void {
  const m = sim.s.modules;
  if (on(sim, 'geopolitics') && m.geo && weekEnd) weeklyGeo(sim, day);
  if (on(sim, 'periodEvents') && m.period) closePeriod(sim, day, weekEnd);
  if (on(sim, 'gags') && m.gags) closeGags(sim, day, weekEnd, quarter);
}
