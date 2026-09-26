import type { Company } from '../world/company';
import { INDUSTRIES } from '../world/industries';
import { Rng } from '../world/rng';
import { BARS_PER_DAY } from './calendar';
import type { GameSettings } from './settings';

/** The overnight gap carries the variance of this many bars, about a sixth of a day's. */
export const GAP_BARS = 15;
/** Years per bar: a trading day is 78 bars plus the gap, 252 trading days a year. */
export const BAR_YEARS = 1 / (252 * (BARS_PER_DAY + GAP_BARS));
/** Held by the Federal Reservoir until the macro layer arrives. Sets, with the premium, the drift of value. */
export const POLICY_RATE = 0.055;
export const EQUITY_PREMIUM = 0.045;
/** Slow mean reversion to fundamental value (spec §11.2): a mispricing halves in about six months. */
export const REVERSION = (Math.LN2 / 0.5) * BAR_YEARS;
/** Earnings seasons are ~6 weeks of trading days; each company reports on its own day of them. */
export const SEASON_DAYS = 30;
/** Constituents of the MAJOR 500 (spec §11.5). */
export const INDEX_SIZE = 500;
/** Long-run market volatility, used to split a company's volatility into market, sector and its own. */
const MARKET_VOL = 0.15;

/** Per-company parameters derived from the genomes and settings: regenerated on load, never saved (spec §18). */
export interface Model {
  count: number;
  /** Industry index. */
  sector: Uint8Array;
  /** Annualised volatility of each industry's factor. */
  sectorVol: Float64Array;
  beta: Float64Array;
  /** A company's own volatility per √bar. */
  idio: Float64Array;
  /** Growth of fundamental value per bar: the cost of equity, r + β·premium. */
  drift: Float64Array;
  shares: Float64Array;
  /** Annualised, as generated. */
  volatility: Float64Array;
  quality: Float64Array;
  /** Trading day of each earnings season on which the company reports. */
  slot: Uint8Array;
  /** MAJOR 500 constituents: the 500 largest companies at the start. */
  members: Int32Array;
}

export function buildModel(seed: string, companies: readonly Company[], settings: GameSettings): Model {
  const count = companies.length;
  const sectorVol = Float64Array.from(INDUSTRIES, (industry) => {
    const [lo, hi] = industry.priors.volatility;
    return 0.35 * ((lo + hi) / 2);
  });
  const model: Model = {
    count,
    sector: Uint8Array.from(companies, (c) => c.genes.industry),
    sectorVol: sectorVol.map((v) => v * settings.volatility),
    beta: Float64Array.from(companies, (c) => c.beta),
    idio: new Float64Array(count),
    drift: Float64Array.from(companies, (c) => (POLICY_RATE + c.beta * EQUITY_PREMIUM) * BAR_YEARS),
    shares: Float64Array.from(companies, (c) => c.sharesOutstanding),
    volatility: Float64Array.from(companies, (c) => c.volatility),
    quality: Float64Array.from(companies, (c) => c.quality),
    slot: new Uint8Array(count),
    members: Int32Array.from(
      companies
        .map((c, i) => [c.marketCap, i])
        .sort((a, b) => b[0] - a[0] || a[1] - b[1])
        .slice(0, INDEX_SIZE)
        .map(([, i]) => i),
    ),
  };
  companies.forEach((c, i) => {
    const s = sectorVol[model.sector[i]];
    const own = Math.sqrt(Math.max(c.volatility ** 2 - (c.beta * MARKET_VOL) ** 2 - s ** 2, (0.4 * c.volatility) ** 2));
    model.idio[i] = own * settings.volatility * Math.sqrt(BAR_YEARS);
  });
  const rng = Rng.stream(seed, 'earnings:slots');
  for (let i = 0; i < count; i++) model.slot[i] = rng.int(0, SEASON_DAYS - 1);
  return model;
}
