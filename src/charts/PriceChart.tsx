import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart, type IChartApi,
  type ISeriesApi, type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { count, price as formatPrice } from '../apps/format';
import { dayOf, formatClock, formatDate } from '../sim/calendar';
import { simulation } from '../sim/client';
import type { Bar, LiveBars, Timeframe } from '../sim/types';
import { useGame } from '../state/game';

export type ChartType = 'candles' | 'line';

const UP = '#008000';
const DOWN = '#c00000';

/** 90s financial software (spec §13): grey panel, dotted grid, small sans labels, green and red. */
export const LOOK = {
  autoSize: true,
  layout: {
    background: { type: ColorType.Solid, color: '#c0c0c0' },
    textColor: '#000',
    fontFamily: 'Tahoma, Geneva, Verdana, sans-serif',
    fontSize: 10,
    // TradingView's licence asks for credit and a link; they are in My Computer → About and the README.
    attributionLogo: false,
    panes: { separatorColor: '#808080', separatorHoverColor: 'rgba(0, 0, 128, 0.2)' },
  },
  grid: {
    vertLines: { color: '#8a8a8a', style: LineStyle.Dotted },
    horzLines: { color: '#8a8a8a', style: LineStyle.Dotted },
  },
  rightPriceScale: { borderColor: '#808080' },
  timeScale: { borderColor: '#808080', rightOffset: 2 },
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: { color: '#000080', labelBackgroundColor: '#000080' },
    horzLine: { color: '#000080', labelBackgroundColor: '#000080' },
  },
};

type PriceSeries = { kind: 'candles'; api: ISeriesApi<'Candlestick'> } | { kind: 'line'; api: ISeriesApi<'Line'> };

const time = (b: Bar) => b.time as UTCTimestamp;
const candle = (b: Bar) => ({ time: time(b), open: b.open, high: b.high, low: b.low, close: b.close });
const line = (b: Bar) => ({ time: time(b), value: b.close });
const volume = (b: Bar) => ({ time: time(b), value: b.volume, color: b.close >= b.open ? '#80b080' : '#d08080' });

/**
 * Price chart for a company or the MAJOR 500 (id -1): line or candles with a volume pane, crosshair legend, drag to
 * pan and wheel to zoom. Bars come from the worker; snapshots keep the last one live.
 */
export function PriceChart({ id, timeframe, type }: { id: number; timeframe: Timeframe; type: ChartType }) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi>(undefined);
  const series = useRef<{ price: PriceSeries; volume?: ISeriesApi<'Histogram'> }>(undefined);
  const bars = useRef(new Map<number, Bar>());
  const last = useRef<Bar>(undefined);
  const [legend, setLegend] = useState<Bar>();
  const intraday = timeframe === '1D' || timeframe === '5D';
  const weekly = timeframe === '5Y' || timeframe === 'MAX';
  // Reload at each new day and when the session opens or closes; snapshots update the last bar in between.
  const session = useGame((s) => (s.snapshot ? `${dayOf(s.snapshot.time)}:${s.snapshot.phase}` : ''));

  useEffect(() => {
    const c = createChart(box.current!, LOOK);
    chart.current = c;
    c.subscribeCrosshairMove((param) => setLegend(param.time ? bars.current.get(param.time as number) : undefined));
    return () => {
      c.remove();
      chart.current = undefined;
      series.current = undefined;
    };
  }, []);

  useEffect(() => {
    const c = chart.current!;
    let cancelled = false;
    if (series.current) {
      c.removeSeries(series.current.price.api);
      if (series.current.volume) c.removeSeries(series.current.volume);
    }
    const price: PriceSeries =
      type === 'candles'
        ? { kind: 'candles', api: c.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, borderVisible: false }) }
        : { kind: 'line', api: c.addSeries(LineSeries, { color: '#000080', lineWidth: 1, priceLineColor: '#000080' }) };
    const vol = id < 0 ? undefined : c.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }, 1);
    c.panes()[1]?.setHeight(56);
    c.applyOptions({ timeScale: { timeVisible: intraday, secondsVisible: false } });
    series.current = { price, volume: vol };
    void simulation()
      .bars(id, timeframe)
      .then((data) => {
        if (cancelled || !data.length) return;
        const penny = data.at(-1)!.close < 1;
        price.api.applyOptions({ priceFormat: { type: 'price', precision: penny ? 4 : 2, minMove: penny ? 0.0001 : 0.01 } });
        if (price.kind === 'candles') price.api.setData(data.map(candle));
        else price.api.setData(data.map(line));
        vol?.setData(data.map(volume));
        bars.current = new Map(data.map((b) => [b.time, b]));
        last.current = data.at(-1);
        c.timeScale().fitContent();
      });
    return () => {
      cancelled = true;
    };
  }, [id, timeframe, type, intraday, session]);

  useEffect(() => {
    const onLive = (live: LiveBars | undefined) => {
      const s = series.current;
      const previous = last.current;
      if (!s || !previous || !live) return;
      let bar = intraday ? live.bar : live.day;
      // Weekly bars: today's bar merged into this week's.
      if (bar && weekly) {
        bar = { ...previous, high: Math.max(previous.high, bar.high), low: Math.min(previous.low, bar.low), close: bar.close };
      }
      if (!bar || bar.time < previous.time) return;
      if (s.price.kind === 'candles') s.price.api.update(candle(bar));
      else s.price.api.update(line(bar));
      if (!weekly) s.volume?.update(volume(bar));
      bars.current.set(bar.time, bar);
      last.current = bar;
    };
    return useGame.subscribe((state) => onLive(state.snapshot?.live[id]));
  }, [id, intraday, weekly]);

  const shown = legend ?? last.current;
  return (
    <div className="price-chart">
      <div className="chart-legend">
        {shown && (
          <>
            <span>{intraday ? formatClock(shown.time / 60) : formatDate(Math.floor(shown.time / 86_400))}</span>
            <span>O {formatPrice(shown.open)}</span>
            <span>H {formatPrice(shown.high)}</span>
            <span>L {formatPrice(shown.low)}</span>
            <span>C {formatPrice(shown.close)}</span>
            {id >= 0 && <span>Vol {count(shown.volume)}</span>}
          </>
        )}
      </div>
      <div className="chart-canvas sunken-panel" ref={box} />
    </div>
  );
}
