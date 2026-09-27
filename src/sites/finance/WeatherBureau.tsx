import { useMemo } from 'react';
import { START_DAY, dayOf, formatDate, gameYear } from '../../sim/calendar';
import { CONTRACTS, HAZARDS, WEATHER_LEAD } from '../../sim/data/commodities';
import type { OutlookView } from '../../sim/types';
import { useGame } from '../../state/game';
import { Rng } from '../../world/rng';
import { useOutlooks } from '../hooks';
import { EXCHANGE, WEATHER } from '../urls';
import { Link, useTitle } from '../web';

/** The six regions of the national forecast, their climate (°F: yearly mean high and swing) and the hazards they suffer. */
const REGIONS = [
  { name: 'Northeast', city: 'New York', mean: 61, swing: 22, hazards: ['coldSnap', 'mildWinter'] },
  { name: 'Corn Belt', city: 'Des Moines', mean: 60, swing: 26, hazards: ['cornDrought', 'flood', 'bumperCrop', 'mildWinter'] },
  { name: 'Great Plains', city: 'Wichita', mean: 67, swing: 23, hazards: ['plainsDrought', 'heatwave'] },
  { name: 'Gulf Coast', city: 'Houston', mean: 79, swing: 14, hazards: ['hurricane'] },
  { name: 'Florida', city: 'Orlando', mean: 83, swing: 9, hazards: ['floridaFreeze', 'hurricane'] },
  { name: 'Pacific Northwest', city: 'Seattle', mean: 60, swing: 15, hazards: ['wildfire'] },
];

const SKIES = [
  ['Snow showers', 'Cold and clear', 'Freezing drizzle', 'Overcast', 'Flurries', 'Sunny and bitter'],
  ['Showers', 'Partly cloudy', 'Thunderstorms', 'Mild and sunny', 'Breezy'],
  ['Hot and humid', 'Sunny', 'Scattered thunderstorms', 'Hazy', 'Clear'],
  ['Crisp and clear', 'Rain', 'Partly cloudy', 'Windy', 'Fog, then sun'],
];

const hazardOf = (o: OutlookView) => HAZARDS.find((h) => h.id === o.kind);

/**
 * The National Weather Bureau (spec §14): warnings of droughts, frosts, freezes and hurricanes a few days before they
 * strike — the same warnings that move the farm and energy futures, so a genuine signal for alert players — what came of
 * the earlier ones, and a national forecast for colour.
 */
export default function WeatherBureau() {
  useTitle('National Weather Bureau');
  const outlooks = useOutlooks();
  const weather = (outlooks ?? []).filter((o) => o.source === 'weather');
  const active = weather.filter((o) => !o.done);
  const past = weather.filter((o) => o.done);
  const verified = past.filter((o) => o.result === 'hit').length;
  return (
    <div className="site-nwb">
      <div className="nwb-header">
        <Link href={`http://${WEATHER}/`} className="nwb-logo">
          National Weather Bureau
        </Link>
        <span>Watching the sky so the farmers don’t have to</span>
      </div>
      <div className="nwb-body">
        <h2>Active Warnings and Outlooks</h2>
        {!outlooks ? (
          <p>Receiving data from the field offices…</p>
        ) : active.length ? (
          active.map((o) => <Warning key={o.id} outlook={o} />)
        ) : (
          <p>No warnings are in effect. Enjoy the weather.</p>
        )}
        <p className="nwb-small">
          Warnings are issued {WEATHER_LEAD[0]} to {WEATHER_LEAD[1]} trading days before the weather is expected.
          {past.length > 0 &&
            ` Of our last ${past.length} warnings, ${verified} verified (${Math.round((verified / past.length) * 100)}%).`}
        </p>
        <Forecast active={active} />
        <h2>Recent Events</h2>
        {past.length ? (
          <table className="nwb-table" cellPadding={3}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Warning</th>
                <th>Region</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {past.slice(0, 15).map((o) => {
                const h = hazardOf(o);
                return (
                  <tr key={o.id}>
                    <td>{formatDate(dayOf(o.due))}</td>
                    <td>{h?.warning ?? o.kind}</td>
                    <td>{h?.region}</td>
                    <td className={o.result === 'hit' ? 'nwb-hit' : ''}>
                      {o.result === 'hit' ? `${h?.name ?? 'The weather'} arrived as forecast` : 'Did not verify'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p>No events on record yet.</p>
        )}
      </div>
      <p className="nwb-footer">
        National Weather Bureau · A service of the Department of Agriculture and Commerce · {gameYear(START_DAY)} · Farm and futures
        traders: see the <Link href={`http://${EXCHANGE}/`}>Chicago Murkantile Exchange</Link>.
      </p>
    </div>
  );
}

function Warning({ outlook }: { outlook: OutlookView }) {
  const h = hazardOf(outlook);
  return (
    <div className="nwb-warning">
      <b>
        ⚠ {h?.warning ?? 'Warning'} for {h?.region ?? 'the region'}
      </b>
      <br />
      Issued {formatDate(dayOf(outlook.issued))}. Expected by {formatDate(dayOf(outlook.due))}.
      <br />
      Crops and commodities at risk:{' '}
      {outlook.moves.map(([k, move], j) => (
        <span key={k}>
          {j > 0 && ', '}
          <Link href={`http://${EXCHANGE}/contract?c=${CONTRACTS[k].code}`}>{CONTRACTS[k].name}</Link> {move > 0 ? '(supply at risk)' : '(bumper supply)'}
        </span>
      ))}
    </div>
  );
}

/** Today's national forecast: seeded by the day, and bent by whatever warnings are in effect. */
function Forecast({ active }: { active: OutlookView[] }) {
  const seed = useGame((s) => s.seed);
  const day = useGame((s) => (s.snapshot ? dayOf(s.snapshot.time) : START_DAY));
  const rows = useMemo(() => {
    const yearDay = (day - Date.UTC(new Date(day * 86_400_000).getUTCFullYear(), 0, 1) / 86_400_000) / 365;
    const season = Math.floor(((new Date(day * 86_400_000).getUTCMonth() + 1) % 12) / 3);
    return REGIONS.map((r) => {
      const rng = Rng.stream(seed, `nwb:${day}:${r.name}`);
      const high = Math.round(r.mean - r.swing * Math.cos(2 * Math.PI * (yearDay - 0.05)) + rng.range(-5, 5));
      const warning = active.map(hazardOf).find((h) => h && r.hazards.includes(h.id));
      return { ...r, high, low: high - rng.int(10, 20), sky: warning ? warning.name : rng.pick(SKIES[season]), warning };
    });
  }, [seed, day, active]);
  return (
    <>
      <h2>National Forecast for {formatDate(day)}</h2>
      <table className="nwb-table" cellPadding={3}>
        <thead>
          <tr>
            <th>Region</th>
            <th>City</th>
            <th>Sky</th>
            <th>High</th>
            <th>Low</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.city}</td>
              <td className={r.warning ? 'nwb-alert' : ''}>{r.sky}</td>
              <td className="right">{r.high}°F</td>
              <td className="right">{r.low}°F</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
