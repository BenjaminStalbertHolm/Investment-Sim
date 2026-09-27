import type { ClosedPosition } from './account';
import { START_DAY } from './calendar';
import type { Client } from './clients';
import { CONTRACTS, CONTRACT_INDEX } from './data/commodities';
import { FUNDS } from './data/funds';
import { parseContract } from './commodities';

/**
 * Bankruptcy (spec §16): the only way the game ends. It comes when an obligation falls due — a margin call, a loan, an
 * SOB fine — that
 * the firm cannot meet even after the forced sale of everything it owns. The report is what the Blue Screen of Debt
 * leads to, and what the Hall of Shame keeps.
 */
export type Cause = 'margin' | 'loan' | 'fine';

export interface Trade {
  /** "MVDA", "CL Mar 98" (as a contract key) or a commodity's name. */
  label: string;
  company?: number;
  contract?: string;
  realized: number;
}

export interface BankruptcyReport {
  day: number;
  cause: Cause;
  /** What fell due, and how much of it could not be paid. */
  owed: number;
  shortfall: number;
  firmName: string;
  ceoName: string;
  ceoCode: string;
  logoCode: string;
  seed: string;
  founded: number;
  peak: { day: number; netWorth: number };
  /** Net worth when it died: negative. */
  netWorth: number;
  best?: Trade;
  worst?: Trade;
  clients: { won: number; lost: number };
  /** [day, net worth, MAJOR 500], thinned to about a point a week, for the chart. */
  history: [number, number, number][];
}

function trade(c: ClosedPosition, tickers: readonly string[]): Trade {
  if (c.company >= 0) return { label: tickers[c.company], company: c.company, realized: c.realized };
  if (c.contract) return { label: CONTRACTS[parseContract(c.contract)!.k].name, contract: c.contract, realized: c.realized };
  if (c.fund !== undefined) return { label: FUNDS[c.fund].ticker, realized: c.realized };
  return { label: `${CONTRACTS[CONTRACT_INDEX[c.goods!]].name} (goods)`, realized: c.realized };
}

export function bankruptcyReport(input: {
  day: number;
  cause: Cause;
  owed: number;
  shortfall: number;
  netWorth: number;
  player: { firmName: string; ceoName: string; ceoCode: string; logoCode: string };
  seed: string;
  stats: readonly [number, number, number][];
  closed: readonly ClosedPosition[];
  tickers: readonly string[];
  clients: readonly Client[];
}): BankruptcyReport {
  const { stats, closed } = input;
  const peak = stats.reduce((best, [day, worth]) => (worth > best.netWorth ? { day, netWorth: worth } : best), { day: START_DAY, netWorth: stats[0]?.[1] ?? 0 });
  const sorted = [...closed].sort((a, b) => b.realized - a.realized);
  const history = stats.filter((_, k) => k % 5 === 0 || k === stats.length - 1);
  return {
    day: input.day,
    cause: input.cause,
    owed: input.owed,
    shortfall: input.shortfall,
    ...input.player,
    seed: input.seed,
    founded: START_DAY,
    peak,
    netWorth: input.netWorth,
    best: sorted.length && sorted[0].realized > 0 ? trade(sorted[0], input.tickers) : undefined,
    worst: sorted.length && sorted.at(-1)!.realized < 0 ? trade(sorted.at(-1)!, input.tickers) : undefined,
    clients: {
      won: input.clients.filter((c) => c.kind !== 'founder' && c.status !== 'prospect' && c.status !== 'declined' && c.status !== 'expired').length,
      lost: input.clients.filter((c) => c.status === 'left').length,
    },
    history,
  };
}
