import { create } from 'zustand';

/** Fake dial-up loading delay (spec §9 advanced settings). */
export type Dialup = 'off' | 'short' | 'authentic';

export interface Favourite {
  url: string;
  title: string;
}

interface BrowserStore {
  favourites: Favourite[];
  /** Visited URLs, most recent last; links to them show purple (spec §14). */
  history: string[];
  dialup: Dialup;

  visit(url: string): void;
  addFavourite(favourite: Favourite): void;
  removeFavourite(url: string): void;
  clearHistory(): void;
  setDialup(dialup: Dialup): void;
}

const HISTORY_LIMIT = 300;

export const HOME_PAGE = 'http://www.yeehaw.com/';

export const newBrowserState = () => ({
  favourites: [
    { url: HOME_PAGE, title: 'Yeehaw!' },
    { url: 'http://www.quotezone.com/', title: 'QuoteZone' },
    { url: 'http://www.wsjottings.com/', title: 'The Wall Street Jottings' },
    { url: 'http://www.askreeves.com/', title: 'Ask Reeves (help)' },
  ],
  history: [] as string[],
  dialup: 'short' as Dialup,
});

export const useBrowser = create<BrowserStore>()((set) => ({
  ...newBrowserState(),

  visit: (url) => set((s) => ({ history: [...s.history.filter((u) => u !== url), url].slice(-HISTORY_LIMIT) })),
  addFavourite: (favourite) =>
    set((s) => (s.favourites.some((f) => f.url === favourite.url) ? s : { favourites: [...s.favourites, favourite] })),
  removeFavourite: (url) => set((s) => ({ favourites: s.favourites.filter((f) => f.url !== url) })),
  clearHistory: () => set({ history: [] }),
  setDialup: (dialup) => set({ dialup }),
}));
