import { FUNDS, SECTOR_SIZE } from './data/funds';

/**
 * Index funds (spec §11.5): MJR tracks the MAJOR 500, and each industry has a fund of its fifty largest companies. A fund
 * holds a basket of shares per unit, weighted by market value (each member's shares in proportion to its shares
 * outstanding, so the weights follow prices by themselves), plus cash per unit: dividends and takeover proceeds, reinvested
 * at each close. The expense ratio comes out of that cash every night, so a unit's value is the index's total return less
 * fees. Sector funds pick their members again at each quarter's end; MJR follows the MAJOR 500's members.
 */
export interface FundState {
  /** Per fund: its members, and the shares of each held per unit. */
  members: number[][];
  basket: number[][];
  /** Per fund: cash per unit, waiting to be reinvested. */
  cash: number[];
  /** Each fund's value a unit at the last close. */
  prevClose: number[];
  /** Days since launch, and each fund's closing value a unit on them (a row of FUNDS.length per day). */
  days: number[];
  closes: number[];
}

/** What the funds need from the market: prices, shares outstanding, industries, listings and the MAJOR 500's members. */
export interface FundMarket {
  price: ArrayLike<number>;
  shares: ArrayLike<number>;
  sector: ArrayLike<number>;
  status: ArrayLike<number>;
  index: ArrayLike<number>;
}

/** Net asset value of a unit of fund `f`. */
export function fundNav(s: FundState, f: number, price: ArrayLike<number>): number {
  const members = s.members[f];
  const basket = s.basket[f];
  let nav = s.cash[f];
  for (let k = 0; k < members.length; k++) nav += basket[k] * price[members[k]];
  return nav;
}

/** Who a fund should hold now: the MAJOR 500, or its industry's largest listed companies. */
export function constituents(f: number, m: FundMarket): number[] {
  if (f === 0) return Array.from(m.index);
  const industry = FUNDS[f].industry;
  const pool: number[] = [];
  for (let i = 0; i < m.price.length; i++) if (m.sector[i] === industry && !m.status[i]) pool.push(i);
  const cap = (i: number) => m.price[i] * m.shares[i];
  return pool.sort((a, b) => cap(b) - cap(a) || a - b).slice(0, SECTOR_SIZE);
}

/** Invests a unit's whole value in `members`, weighted by market value. */
function invest(s: FundState, f: number, members: number[], m: FundMarket, nav: number): void {
  let total = 0;
  for (const i of members) total += m.price[i] * m.shares[i];
  s.members[f] = members;
  s.basket[f] = members.map((i) => (total > 0 ? (nav * m.shares[i]) / total : 0));
  s.cash[f] = total > 0 ? 0 : nav;
}

/** The funds' first day: each unit starts at its launch value. */
export function launchFunds(m: FundMarket): FundState {
  const s: FundState = { members: [], basket: [], cash: [], prevClose: FUNDS.map((f) => f.launch), days: [], closes: [] };
  FUNDS.forEach((spec, f) => invest(s, f, constituents(f, m), m, spec.launch));
  return s;
}

/** A member pays a dividend (a share): the funds holding it keep the cash until the close. */
export function fundDividend(s: FundState, company: number, paid: number): void {
  s.members.forEach((members, f) => {
    const k = members.indexOf(company);
    if (k >= 0) s.cash[f] += s.basket[f][k] * paid;
  });
}

/** A member leaves the market at `price` (0 in a bankruptcy): its shares become cash, and it leaves the fund. */
export function fundDelisted(s: FundState, company: number, price: number): void {
  s.members.forEach((members, f) => {
    const k = members.indexOf(company);
    if (k < 0) return;
    s.cash[f] += s.basket[f][k] * price;
    members.splice(k, 1);
    s.basket[f].splice(k, 1);
  });
}

/**
 * Each close: a night's fees (the annual expense ratio over the calendar days to the next session), then the cash is
 * reinvested — in the same members, or at a quarter's end (`reconstitute`) in the members the rules pick now — and
 * the closing values are recorded.
 */
export function closeFunds(s: FundState, m: FundMarket, day: number, nights: number, fees: { index: number; sector: number }, reconstitute: boolean): void {
  FUNDS.forEach((spec, f) => {
    const before = fundNav(s, f, m.price);
    const nav = before * (1 - ((spec.industry < 0 ? fees.index : fees.sector) * nights) / 365);
    // MJR's members change whenever the MAJOR 500's do.
    const members = reconstitute || f === 0 ? constituents(f, m) : s.members[f];
    invest(s, f, members, m, nav);
    s.prevClose[f] = nav;
  });
  s.days.push(day);
  s.closes.push(...s.prevClose);
}

/** A fund's closing values as [day, value], oldest first. */
export function fundCloses(s: FundState, f: number): [number, number][] {
  return s.days.map((day, row) => [day, s.closes[row * FUNDS.length + f]]);
}
