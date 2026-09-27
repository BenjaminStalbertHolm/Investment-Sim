import { create } from 'zustand';
import type { OrderType, Side, TimeInForce } from '../sim/account';

export type TradeTab = 'quotes' | 'ticket' | 'portfolio' | 'futures' | 'orders' | 'ledger' | 'calendar' | 'financing';

export interface Watchlist {
  id: string;
  name: string;
  companies: number[];
}

/** The order ticket's fields, as typed. */
export interface Ticket {
  company?: number;
  side: Side;
  type: OrderType;
  shares: string;
  limit: string;
  /** Stop price (stop and stop-limit orders), and a trailing stop's trail in percent. */
  stop: string;
  trail: string;
  tif: TimeInForce;
  /** Open order being modified. */
  replaces?: number;
}

interface TradeStore {
  watchlists: Watchlist[];
  active: string;
  tab: TradeTab;
  ticket: Ticket;

  setTab(tab: TradeTab): void;
  setActive(id: string): void;
  addWatchlist(name: string): void;
  renameWatchlist(id: string, name: string): void;
  deleteWatchlist(id: string): void;
  watch(company: number, list?: string): void;
  unwatch(company: number): void;
  setTicket(patch: Partial<Ticket>): void;
  /** Opens the order ticket for a company. */
  trade(company: number, side: Side, patch?: Partial<Ticket>): void;
}

/** The first watchlist of a new game: the top of the market, and the world's favourite cigarettes. */
const STARTER = [0, 1, 2, 3, 4, 8, 9, 41];
const EMPTY_TICKET: Ticket = { side: 'buy', type: 'market', shares: '100', limit: '', stop: '', trail: '5', tif: 'day' };

export const newTradeState = () => ({
  watchlists: [{ id: 'w1', name: 'My Watchlist', companies: [...STARTER] }],
  active: 'w1',
  tab: 'quotes' as TradeTab,
  ticket: EMPTY_TICKET,
});

export const useTrade = create<TradeStore>()((set, get) => {
  const edit = (id: string, fn: (w: Watchlist) => Watchlist) =>
    set((s) => ({ watchlists: s.watchlists.map((w) => (w.id === id ? fn(w) : w)) }));
  return {
    ...newTradeState(),

    setTab: (tab) => set({ tab }),
    setActive: (active) => set({ active }),
    addWatchlist(name) {
      const id = `w${Math.max(0, ...get().watchlists.map((w) => Number(w.id.slice(1)))) + 1}`;
      set((s) => ({ watchlists: [...s.watchlists, { id, name, companies: [] }], active: id }));
    },
    renameWatchlist: (id, name) => edit(id, (w) => ({ ...w, name })),
    deleteWatchlist(id) {
      const watchlists = get().watchlists.filter((w) => w.id !== id);
      if (watchlists.length) set({ watchlists, active: watchlists[0].id });
    },
    watch: (company, list = get().active) =>
      edit(list, (w) => (w.companies.includes(company) ? w : { ...w, companies: [...w.companies, company] })),
    unwatch: (company) => edit(get().active, (w) => ({ ...w, companies: w.companies.filter((c) => c !== company) })),
    setTicket: (patch) => set((s) => ({ ticket: { ...s.ticket, ...patch } })),
    trade: (company, side, patch) => set({ tab: 'ticket', ticket: { ...EMPTY_TICKET, company, side, ...patch } }),
  };
});
