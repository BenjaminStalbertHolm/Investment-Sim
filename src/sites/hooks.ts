import { useEffect, useState } from 'react';
import { dayOf } from '../sim/calendar';
import { simulation } from '../sim/client';
import type { CompanyDetails, FirmView, FuturesView, LoansView, MarketTable, ModulesView, OutlookView, SobView } from '../sim/types';
import { decodeCompany, type Company } from '../world/company';
import { useGame } from '../state/game';

/** Data fetched from the worker, refetched whenever `key` changes. */
export function useFetched<T>(fetch: () => Promise<T>, key: unknown[]): T | undefined {
  const [data, setData] = useState<T>();
  useEffect(() => {
    let current = true;
    void fetch().then((d) => current && setData(d));
    return () => {
      current = false;
    };
    // The key says when to refetch; the fetch function is recreated on every render.
  }, key);
  return data;
}

const useDay = () => useGame((s) => (s.snapshot ? dayOf(s.snapshot.time) : 0));

/** A company's stats, quarters and holders, refreshed daily and when its account changes. */
export function useDetails(company: number): CompanyDetails | undefined {
  const day = useDay();
  return useFetched(() => simulation().details(company), [company, day]);
}

export function useFirm(firm: number): FirmView | undefined {
  const day = useDay();
  return useFetched(() => simulation().firm(firm), [firm, day]);
}

/** Every company's numbers, refreshed every 15 game minutes and at the open and close. */
export function useTable(): MarketTable | undefined {
  const tick = useGame((s) => (s.snapshot ? `${Math.floor(s.snapshot.time / 15)}:${s.snapshot.phase}` : ''));
  return useFetched(() => simulation().table(), [tick]);
}

/** The futures board (spec §14 Chicago Murkantile Exchange), refreshed every 15 game minutes like the stock tables. */
export function useFutures(): FuturesView | undefined {
  const tick = useGame((s) => (s.snapshot ? `${Math.floor(s.snapshot.time / 15)}:${s.snapshot.phase}` : ''));
  return useFetched(() => simulation().futures(), [tick]);
}

/** Weather warnings and OPEK meetings, newest first, refetched as their news breaks. */
export function useOutlooks(): OutlookView[] | undefined {
  const news = useGame((s) => s.snapshot?.news ?? 0);
  const day = useDay();
  return useFetched(() => simulation().outlooks(), [news, day]);
}

/** The firm's loans and credit report (First Continental Bank, Equifacts), refetched when the account changes. */
export function useLoans(): LoansView | undefined {
  const revision = useGame((s) => s.snapshot?.revision);
  const day = useDay();
  return useFetched(() => simulation().loans(), [revision, day]);
}

/** The SOB's filings and the firm's record with it, refetched daily and when the account changes. */
export function useSob(): SobView | undefined {
  const revision = useGame((s) => s.snapshot?.revision);
  const day = useDay();
  return useFetched(() => simulation().sob(), [revision, day]);
}

/** Phase 10's worker views, refetched when the account changes, each day, and when a page or a message arrives. */
function useDesked<T>(fetch: () => Promise<T>): T | undefined {
  const key = useGame((s) => (s.snapshot ? `${s.snapshot.revision}:${dayOf(s.snapshot.time)}:${s.snapshot.desk.im.latest}:${s.snapshot.desk.page}:${s.snapshot.mail.latest}` : ''));
  return useFetched(fetch, [key]);
}
export const useStaff = () => useDesked(() => simulation().staff());
export const useLifestyle = () => useDesked(() => simulation().lifestyle());
export const useDesk = () => useDesked(() => simulation().desk());
export const useIpos = () => useDesked(() => simulation().ipos());

/** The fun modules as they stand (Phase 10B), refetched daily, as news arrives and when modules are switched on or off. */
export function useModules(): ModulesView | undefined {
  const key = useGame((s) => (s.snapshot ? `${dayOf(s.snapshot.time)}:${s.snapshot.news}:${s.snapshot.revision}` : ''));
  const flags = useGame((s) => JSON.stringify(s.settings?.modules ?? {}));
  return useFetched(() => simulation().modules(), [key, flags]);
}

/** Barren's league tables and this year's standings so far, refetched daily. */
export function useLeague() {
  const day = useDay();
  return useFetched(() => simulation().league(), [day]);
}

/** The firm's record (spec §16): performance, league places, achievements. */
export function useRecord() {
  const day = useDay();
  return useFetched(() => simulation().record(), [day]);
}

const decoded = new Map<string, Company>();

/** A company decoded from its genome (cached: decoding is pure). */
export function companyOf(genome: string): Company {
  let c = decoded.get(genome);
  if (!c) decoded.set(genome, (c = decodeCompany(genome)));
  return c;
}
