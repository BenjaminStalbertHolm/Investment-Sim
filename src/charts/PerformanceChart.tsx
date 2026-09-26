import { LineSeries, createChart, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import { CLOSE, OPEN, START_DAY } from '../sim/calendar';
import { LOOK } from './PriceChart';

const percent = { type: 'custom' as const, formatter: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` };

/** The firm's net worth against the MAJOR 500 since the start, in percent, at each close (spec §12.5). */
export function PerformanceChart({ stats, deposits }: { stats: readonly [number, number, number][]; deposits: number }) {
  const box = useRef<HTMLDivElement>(null);
  const series = useRef<{ firm: ISeriesApi<'Line'>; index: ISeriesApi<'Line'> }>(undefined);

  useEffect(() => {
    const c = createChart(box.current!, LOOK);
    series.current = {
      index: c.addSeries(LineSeries, { color: '#808080', lineWidth: 1, priceFormat: percent, title: 'MAJOR 500' }),
      firm: c.addSeries(LineSeries, { color: '#000080', lineWidth: 2, priceFormat: percent, title: 'Your firm' }),
    };
    return () => c.remove();
  }, []);

  useEffect(() => {
    // The first point is the opening bell of the first day.
    const points: [number, number, number][] = [[START_DAY, deposits, 1000], ...stats];
    const time = (day: number, k: number) => ((day * 1440 + (k ? CLOSE : OPEN)) * 60) as UTCTimestamp;
    series.current?.firm.setData(points.map(([day, worth], k) => ({ time: time(day, k), value: (worth / deposits - 1) * 100 })));
    series.current?.index.setData(points.map(([day, , index], k) => ({ time: time(day, k), value: (index / 1000 - 1) * 100 })));
  }, [stats, deposits]);

  return <div className="chart-canvas sunken-panel performance-chart" ref={box} />;
}
