import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { AppId } from './catalog';
import type { AppProps } from './types';

type LazyApp = LazyExoticComponent<ComponentType<AppProps>>;

// Each app is lazy-loaded (spec §20). Apps not built yet render the placeholder.
const Placeholder: LazyApp = lazy(() => import('./placeholder/Placeholder'));

const components: Partial<Record<AppId, LazyApp>> = {
  mycomputer: lazy(() => import('./mycomputer/MyComputer')),
  trade: lazy(() => import('./trade/TradeApp')),
  quote: lazy(() => import('./quote/QuoteWindow')),
  recyclebin: lazy(() => import('./recyclebin/RecycleBin')),
  run: lazy(() => import('./run/RunDialog')),
  shutdown: lazy(() => import('./shutdown/ShutdownDialog')),
};

export const appComponent = (id: AppId): LazyApp => components[id] ?? Placeholder;
