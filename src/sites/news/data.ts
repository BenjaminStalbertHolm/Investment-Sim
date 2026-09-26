import { useEffect, useState } from 'react';
import { simulation } from '../../sim/client';
import type { NewsItem, NewsQuery } from '../../sim/news';
import type { Journalist } from '../../sim/press';
import { useGame } from '../../state/game';

let staff: { seed: string; list: Promise<Journalist[]> } | undefined;

/** Every outlet's writers (spec §14.1), fetched once a game. */
export function useJournalists(): Journalist[] {
  const seed = useGame((s) => s.seed);
  const [list, setList] = useState<Journalist[]>([]);
  useEffect(() => {
    if (staff?.seed !== seed) staff = { seed, list: simulation().journalists() };
    let current = true;
    void staff.list.then((l) => current && setList(l));
    return () => {
      current = false;
    };
  }, [seed]);
  return list;
}

/** News from the archive, refetched as news arrives. */
export function useNews(query: NewsQuery | undefined): NewsItem[] | undefined {
  const count = useGame((s) => s.snapshot?.news ?? 0);
  const key = query ? JSON.stringify(query) : '';
  const [items, setItems] = useState<NewsItem[]>();
  useEffect(() => {
    if (!query) return;
    let current = true;
    void simulation()
      .news(query)
      .then((n) => current && setItems(n));
    return () => {
      current = false;
    };
    // The key stands for the query.
  }, [key, count]);
  return items;
}
