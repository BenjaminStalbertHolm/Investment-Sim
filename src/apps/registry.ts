import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { AppId } from './catalog';
import type { AppProps } from './types';

type LazyApp = LazyExoticComponent<ComponentType<AppProps>>;

// Each app is lazy-loaded (spec §20). Apps not built yet render the placeholder.
const Placeholder: LazyApp = lazy(() => import('./placeholder/Placeholder'));

const components: Partial<Record<AppId, LazyApp>> = {
  mycomputer: lazy(() => import('./mycomputer/MyComputer')),
  browser: lazy(() => import('./browser/Browser')),
  garlic: lazy(() => import('./garlic/Garlic')),
  installer: lazy(() => import('./installer/Installer')),
  trade: lazy(() => import('./trade/TradeApp')),
  mail: lazy(() => import('./mail/MailApp')),
  quote: lazy(() => import('./quote/QuoteWindow')),
  recyclebin: lazy(() => import('./recyclebin/RecycleBin')),
  // Phase 10 (spec §4A).
  notepad: lazy(() => import('./notepad/Notepad')),
  calculator: lazy(() => import('./calculator/Calculator')),
  messenger: lazy(() => import('./messenger/Messenger')),
  word: lazy(() => import('./word/Word')),
  sheet: lazy(() => import('./sheet/Sheet')),
  hr: lazy(() => import('./hr/Hr')),
  rolodex: lazy(() => import('./rolodex/Rolodex')),
  defrag: lazy(() => import('./defrag/Defrag')),
  taskmangler: lazy(() => import('./taskmangler/TaskMangler')),
  paint: lazy(() => import('./paint/Paint')),
  pager: lazy(() => import('./pager/Pager')),
  winramp: lazy(() => import('./winramp/WinRamp')),
  sweeper: lazy(() => import('./games/Sweeper')),
  solitear: lazy(() => import('./games/Solitaire')),
  // Phase 10B: the fun modules' programs (spec §16C).
  encarter: lazy(() => import('./encarter/Encarter')),
  tamagotcha: lazy(() => import('./tamagotcha/Tamagotcha')),
  // Phase 11: the help file (spec §4 Start → Help).
  help: lazy(() => import('./help/Help')),
  run: lazy(() => import('./run/RunDialog')),
  shutdown: lazy(() => import('./shutdown/ShutdownDialog')),
};

export const appComponent = (id: AppId): LazyApp => components[id] ?? Placeholder;
