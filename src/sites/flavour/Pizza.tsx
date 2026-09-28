import { START_DAY, dayOf, formatDate, gameYear, isTradingDay } from '../../sim/calendar';
import { hash } from '../../sim/press';
import { useGame } from '../../state/game';
import { SiteFrame } from '../frame';
import { useModules } from '../hooks';
import { PIZZA } from '../urls';
import { useTitle } from '../web';

const HOTSPOTS = [
  ['Securities Oversight Bureau', '450 Fifth Street'],
  ['First Continental Bank', 'Financial Square'],
  ['Majorsoft Newswire', 'Redmond Road'],
  ['Federal Reservoir', 'Constitution Avenue'],
  ['St. Jude’s Hospital', 'Elm Street'],
] as const;

/**
 * Papa Jonas Pizza's delivery hotspots (spec §16C.3, the gags module): late-night deliveries by address. Deliveries to the
 * Securities Oversight Bureau pick up in the fortnight before an audit — the pizza knows before you do.
 */
export default function Pizza() {
  useTitle('Papa Jonas Pizza — Delivery Hotspots');
  const gags = useModules()?.gags;
  const today = useGame((s) => (s.snapshot ? dayOf(s.snapshot.time) : START_DAY));
  const seed = useGame((s) => s.seed);
  const nights: number[] = [];
  for (let d = today; nights.length < 10; d--) if (isTradingDay(d)) nights.unshift(d);
  const pizza = gags?.pizza;
  const count = (row: number, night: number) => {
    const base = 1 + (hash(seed, 'pizza', row, night) % (row === 3 ? 3 : 5));
    // Working late on an audit: pizza every night from the day it was decided.
    const late = row === 0 && pizza?.audit && night >= pizza.decided ? 6 + (hash(seed, 'late', night) % 9) : 0;
    return base + late;
  };
  return (
    <SiteFrame
      home={PIZZA}
      logo="🍕 Papa Jonas Pizza"
      tagline="Better Ingredients. Better Pizza. Better Delivery Data."
      look={{ head: '#c8102e', ink: '#fff', accent: '#006341', page: '#fff8ee', font: 'Arial, Helvetica, sans-serif' }}
      footer={`Papa Jonas Pizza, Inc. © ${gameYear(START_DAY)}. Delivery counts after 10 p.m., by address. We do not know why people keep asking for this page.`}
    >
      <h2>Late-Night Delivery Hotspots</h2>
      <table className="frame-table pizza-map" cellPadding={2}>
        <thead>
          <tr>
            <th>Address</th>
            {nights.map((n) => (
              <th key={n}>{formatDate(n).slice(0, 6)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOTSPOTS.map(([name, street], row) => (
            <tr key={name}>
              <td>
                <b>{name}</b>
                <br />
                <small>{street}</small>
              </td>
              {nights.map((n) => {
                const c = count(row, n);
                return (
                  <td key={n} className={`right ${c >= 8 ? 'down' : ''}`}>
                    {c}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">Large pepperoni, extra cheese. The usual.</p>
    </SiteFrame>
  );
}
