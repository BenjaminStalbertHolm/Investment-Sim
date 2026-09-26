// Corporate event types (spec §11.6) and their magnitudes (spec §11.7). Data only: sim/events.ts draws and applies
// them, sites/data/articles.ts writes them up.

export type EventKind =
  | 'fraud'
  | 'scandal'
  | 'recall'
  | 'lawsuit'
  | 'trialFail'
  | 'approval'
  | 'guidance'
  | 'investment'
  | 'takeover'
  | 'activist'
  | 'shortReport'
  | 'downgrade'
  | 'upgrade'
  | 'contract'
  | 'strike'
  | 'hack'
  | 'launch'
  | 'ceoChange'
  | 'dividendChange'
  | 'buyback'
  | 'bankruptcy';

export interface EventType {
  kind: EventKind;
  /** Expected events per company-year at industry weight 1 (spec §11.6: industry-weighted probabilities). */
  rate: number;
  /** Typical size of the move, smallest and largest (spec §11.7), before scaling by company size. */
  move: readonly [number, number];
  /** 1 always up, −1 always down, 0 either way (better companies lean up). */
  sign: 1 | -1 | 0;
  /** Share of the move fundamental value follows: 1 is permanent, 0 drifts back (spec §11.7: drift or reversal). */
  persist: number;
  /** Chance of a rumour hours or days beforehand (spec §11.7: information leakage). */
  leak: number;
  /** Chance the next morning's papers cause a second move (spec §11.7: follow-up stories). */
  followUp: number;
  /** Industry weights by industry id; industries not listed get `others`. */
  industries?: Readonly<Record<string, number>>;
  others?: number;
  /** How quality shifts the odds: weight × e^(quality·(q − ½)). Negative: poorly run companies are likelier. */
  quality?: number;
  /** Weight by starting tier (Mega, Large, Mid, Small, Micro, Nano); default 1 for all. */
  tiers?: readonly [number, number, number, number, number, number];
}

const TECH = { software: 2, semiconductors: 1.5, hardware: 2, internet: 2, telecom: 1, videoGames: 2 };

export const EVENT_TYPES: readonly EventType[] = [
  { kind: 'fraud', rate: 0.004, move: [0.4, 0.9], sign: -1, persist: 1, leak: 0.3, followUp: 0.5, quality: -3,
    tiers: [0.3, 0.6, 1, 1, 1.2, 1.2] },
  { kind: 'scandal', rate: 0.03, move: [0.08, 0.35], sign: -1, persist: 0.4, leak: 0.15, followUp: 0.4, quality: -1.5 },
  { kind: 'recall', rate: 0.05, move: [0.05, 0.2], sign: -1, persist: 0.5, leak: 0.1, followUp: 0.2, quality: -1,
    industries: { autos: 2, foodBeverage: 1.5, pharma: 1, medicalDevices: 1.5, hardware: 1, apparel: 0.5, restaurants: 1, videoGames: 0.5, agriculture: 0.5, retail: 0.5, aerospace: 0.5 },
    others: 0 },
  { kind: 'lawsuit', rate: 0.05, move: [0.03, 0.25], sign: -1, persist: 0.7, leak: 0.1, followUp: 0.2, quality: -1,
    industries: { tobacco: 3, pharma: 2, software: 1.5, internet: 1.5, chemicals: 1.5, banks: 1.2 } },
  { kind: 'trialFail', rate: 0.25, move: [0.3, 0.8], sign: -1, persist: 1, leak: 0.2, followUp: 0.2, quality: -1,
    industries: { biotech: 1, pharma: 0.4, medicalDevices: 0.2 }, others: 0 },
  { kind: 'approval', rate: 0.2, move: [0.15, 1.2], sign: 1, persist: 1, leak: 0.25, followUp: 0.3, quality: 1,
    industries: { biotech: 1, pharma: 0.5, medicalDevices: 0.4 }, others: 0 },
  { kind: 'guidance', rate: 0.15, move: [0.03, 0.15], sign: 0, persist: 0.8, leak: 0.15, followUp: 0.2 },
  { kind: 'investment', rate: 0.02, move: [0.05, 0.25], sign: 1, persist: 0.7, leak: 0.2, followUp: 0.2,
    tiers: [0, 0.3, 1, 1.5, 1.5, 0.5] },
  // A takeover's move is its own: 70–95% of a 20–60% premium (sim/events.ts).
  { kind: 'takeover', rate: 0.015, move: [0.2, 0.6], sign: 1, persist: 1, leak: 0.4, followUp: 0, tiers: [0.05, 0.5, 1, 1.2, 1, 0.5] },
  { kind: 'activist', rate: 0.02, move: [0.04, 0.12], sign: 1, persist: 0.5, leak: 0.2, followUp: 0.2, quality: -1,
    tiers: [0.2, 1, 1, 1, 0.3, 0] },
  { kind: 'shortReport', rate: 0.015, move: [0.1, 0.4], sign: -1, persist: 0.4, leak: 0.05, followUp: 0.4, quality: -2,
    tiers: [0.3, 1, 1, 1, 0.8, 0.2] },
  { kind: 'downgrade', rate: 0.04, move: [0.03, 0.12], sign: -1, persist: 0.6, leak: 0.1, followUp: 0.1, quality: -1 },
  { kind: 'upgrade', rate: 0.03, move: [0.02, 0.06], sign: 1, persist: 0.6, leak: 0.1, followUp: 0.1, quality: 1 },
  { kind: 'contract', rate: 0.08, move: [0.03, 0.18], sign: 1, persist: 0.8, leak: 0.2, followUp: 0.1,
    industries: { aerospace: 2.5, construction: 1.5, software: 1, telecom: 0.8, shipping: 1, railroads: 1, hardware: 1, semiconductors: 0.8, healthServices: 0.5, conglomerate: 1, steel: 0.8, renewables: 1, oilGas: 0.5, media: 0.5, utilities: 0.5 },
    others: 0.2 },
  { kind: 'strike', rate: 0.03, move: [0.02, 0.1], sign: -1, persist: 0.3, leak: 0.3, followUp: 0.2,
    industries: { autos: 2, airlines: 2.5, railroads: 2, steel: 2, shipping: 1.5, mining: 1.5, telecom: 0.8, retail: 0.5, restaurants: 0.5, construction: 0.8, aerospace: 1, paper: 0.8, logging: 0.8 },
    others: 0.1, tiers: [1, 1, 1, 0.7, 0.3, 0.1] },
  { kind: 'hack', rate: 0.015, move: [0.01, 0.06], sign: -1, persist: 0.2, leak: 0, followUp: 0.1,
    industries: { internet: 3, software: 2, banks: 2, payments: 3, retail: 1, telecom: 1.5, videoGames: 2, media: 1, insurance: 1, hardware: 1 },
    others: 0.3 },
  { kind: 'launch', rate: 0.1, move: [0.02, 0.12], sign: 0, persist: 0.7, leak: 0.2, followUp: 0.2, quality: 1,
    industries: { ...TECH, autos: 1.5, foodBeverage: 1, apparel: 1, restaurants: 1, retail: 0.5, media: 1, medicalDevices: 1 },
    others: 0.4 },
  { kind: 'ceoChange', rate: 0.06, move: [0.01, 0.08], sign: 0, persist: 0.5, leak: 0.2, followUp: 0.1 },
  // Payers raise or cut; profitable non-payers may start paying (sim/events.ts).
  { kind: 'dividendChange', rate: 0.1, move: [0.01, 0.08], sign: 0, persist: 0.8, leak: 0.1, followUp: 0.1, quality: 1 },
  { kind: 'buyback', rate: 0.04, move: [0.01, 0.06], sign: 1, persist: 0.6, leak: 0.1, followUp: 0.1, quality: 1,
    tiers: [1.5, 1.2, 1, 0.5, 0.2, 0] },
  // Filing for bankruptcy wipes out the shareholders: the company is delisted at that day's close.
  { kind: 'bankruptcy', rate: 0.006, move: [0.85, 0.98], sign: -1, persist: 1, leak: 0.5, followUp: 0, quality: -3,
    tiers: [0, 0, 0.05, 0.3, 1, 1.5] },
];

export const EVENT_TYPE = Object.fromEntries(EVENT_TYPES.map((t) => [t.kind, t])) as Record<EventKind, EventType>;

/** Share of a leaked event's move that the rumour moves the price in advance (the rest comes with the news). */
export const LEAK_SHARE: readonly [number, number] = [0.15, 0.35];
/** A takeover bid's premium over the price, and the share of it the target's price jumps to (spec §11.7). */
export const TAKEOVER_PREMIUM: readonly [number, number] = [0.2, 0.6];
export const TAKEOVER_JUMP: readonly [number, number] = [0.7, 0.95];
/** Chance a bid completes, and trading days until it does or falls apart. */
export const TAKEOVER_COMPLETES = 0.75;
export const TAKEOVER_DAYS: readonly [number, number] = [20, 60];
/** Trading days ahead the generator decides each day's events (tips and rumours need to know the future). */
export const HORIZON_DAYS = 10;
