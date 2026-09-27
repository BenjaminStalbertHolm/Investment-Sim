import { Rng } from '../../world/rng';

/** Soli-Tear's rules (spec §4A): Klondike, draw one, as Doors' Solitaire plays it. */
export interface Card {
  /** ♠ ♥ ♦ ♣ */
  suit: 0 | 1 | 2 | 3;
  rank: number;
  up: boolean;
}

export interface Klondike {
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
  tableau: Card[][];
}

export type From = { pile: 'waste' } | { pile: 'tableau'; column: number; index: number } | { pile: 'foundation'; column: number };
export type To = { pile: 'tableau' | 'foundation'; column: number };

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const red = (c: Card) => c.suit === 1 || c.suit === 2;

export function deal(seed: string): Klondike {
  const rng = Rng.stream(seed, 'klondike');
  const deck = rng.shuffle(Array.from({ length: 52 }, (_, k): Card => ({ suit: (k % 4) as Card['suit'], rank: Math.floor(k / 4) + 1, up: false })));
  const tableau = Array.from({ length: 7 }, (_, i) => deck.splice(0, i + 1).map((c, k) => ({ ...c, up: k === i })));
  return { stock: deck, waste: [], foundations: [[], [], [], []], tableau };
}

/** Turns the next stock card onto the waste; an empty stock takes the waste back, face down. */
export function draw(g: Klondike): Klondike {
  if (!g.stock.length) return { ...g, stock: g.waste.map((c) => ({ ...c, up: false })).reverse(), waste: [] };
  const stock = g.stock.slice(0, -1);
  return { ...g, stock, waste: [...g.waste, { ...g.stock[g.stock.length - 1], up: true }] };
}

/** The cards a move would pick up. */
export function picked(g: Klondike, from: From): Card[] {
  if (from.pile === 'waste') return g.waste.slice(-1);
  if (from.pile === 'foundation') return g.foundations[from.column].slice(-1);
  const column = g.tableau[from.column];
  return column[from.index]?.up ? column.slice(from.index) : [];
}

export function allowed(g: Klondike, from: From, to: To): boolean {
  const cards = picked(g, from);
  if (!cards.length) return false;
  const card = cards[0];
  if (to.pile === 'foundation') {
    const pile = g.foundations[to.column];
    const top = pile[pile.length - 1];
    return cards.length === 1 && (top ? top.suit === card.suit && top.rank === card.rank - 1 : card.rank === 1);
  }
  const column = g.tableau[to.column];
  const top = column[column.length - 1];
  return top ? top.up && red(top) !== red(card) && top.rank === card.rank + 1 : card.rank === 13;
}

export function move(g: Klondike, from: From, to: To): Klondike {
  if (!allowed(g, from, to)) return g;
  const cards = picked(g, from);
  const next: Klondike = { stock: g.stock, waste: g.waste.slice(), foundations: g.foundations.map((f) => f.slice()), tableau: g.tableau.map((c) => c.slice()) };
  if (from.pile === 'waste') next.waste.pop();
  else if (from.pile === 'foundation') next.foundations[from.column].pop();
  else {
    const column = next.tableau[from.column];
    column.splice(from.index);
    // The card left on top turns face up.
    if (column.length && !column[column.length - 1].up) column[column.length - 1] = { ...column[column.length - 1], up: true };
  }
  (to.pile === 'foundation' ? next.foundations : next.tableau)[to.column].push(...cards);
  return next;
}

/** The foundation a single card can go to, if any (a double-click sends it there). */
export function foundationFor(g: Klondike, from: From): To | undefined {
  for (let column = 0; column < 4; column++) if (allowed(g, from, { pile: 'foundation', column })) return { pile: 'foundation', column };
  return undefined;
}

export const won = (g: Klondike) => g.foundations.every((f) => f.length === 13);
