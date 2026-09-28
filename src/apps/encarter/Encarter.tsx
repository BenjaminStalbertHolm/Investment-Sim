import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { feature, merge } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { Portrait } from '../../art/portrait/Portrait';
import { applause } from '../../audio/applause';
import { dayOf, formatDate } from '../../sim/calendar';
import { COUNTRIES, COUNTRY, COUNTRY_OF_CITY, PAIRS, type CountrySpec } from '../../sim/data/countries';
import type { ModulesView } from '../../sim/types';
import { decodeCeo } from '../../world/ceo';
import { openUrl, useGame } from '../../state/game';
import { useWindows } from '../../state/windows';
import { companyOf, useModules } from '../../sites/hooks';
import { useNews } from '../../sites/news/data';
import { headlineOf } from '../../sites/news/articles';
import { quoteUrl, storyUrl } from '../../sites/urls';
import { AppMenuBar } from '../AppMenuBar';
import { bigMoney } from '../format';
import type { AppProps } from '../types';
import '../modules.css';
import { TensionList } from './TensionList';

const WIDTH = 600;
const HEIGHT = 310;

/** A shape on the map: a listed country (its Natural Earth shapes merged, spec §16C.1), or an unlisted one by its real name. */
interface Shape {
  key: string;
  d: string;
  country?: CountrySpec;
  name: string;
}

type Atlas = Topology<{ countries: GeometryCollection<{ name: string }> }>;

/** The world as the Geopolitics module draws it: listed countries merged from their shapes, the rest as they are. */
function drawWorld(atlas: Atlas): { shapes: Shape[]; markers: { country: CountrySpec; x: number; y: number }[]; sphere: string } {
  const projection = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], { type: 'Sphere' });
  const path = geoPath(projection);
  const geometries = atlas.objects.countries.geometries;
  const taken = new Set(COUNTRIES.flatMap((c) => c.shapes));
  const shapes: Shape[] = [];
  for (const c of COUNTRIES) {
    if (!c.shapes.length) continue;
    const parts = geometries.filter((g) => c.shapes.includes(String(g.id)));
    const d = path(merge(atlas, parts as never));
    if (d) shapes.push({ key: c.id, d, country: c, name: c.name });
  }
  for (const g of geometries) {
    if (taken.has(String(g.id))) continue;
    const d = path(feature(atlas, g as never) as never);
    const name = (g.properties as { name?: string } | undefined)?.name ?? 'Unknown';
    if (d) shapes.push({ key: `u${g.id ?? name}`, d, name });
  }
  const markers = COUNTRIES.filter((c) => c.marker).map((country) => {
    const [x, y] = projection(country.marker!)!;
    return { country, x, y };
  });
  return { shapes, markers, sphere: path({ type: 'Sphere' }) ?? '' };
}

const UNLISTED = 'Not much to report. Its markets move with the rest of its region.';
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/**
 * Encarter 98 (spec §16C.1): the world atlas of the Geopolitics module. Hover a country for its name, its one line and its
 * leader; click for stability, exports, tensions, headlines and the companies based there. The Israel/Palestine region is
 * greyed out: "Nope".
 */
export default function Encarter({ windowId }: AppProps) {
  const on = useGame((s) => s.settings?.modules.geopolitics);
  const modules = useModules();
  const [atlas, setAtlas] = useState<Atlas>();
  const [hover, setHover] = useState<{ shape: Shape | { country: CountrySpec; name: string; key: string }; x: number; y: number }>();
  const [open, setOpen] = useState<string>();

  useEffect(() => {
    let current = true;
    void import('world-atlas/countries-110m.json').then((m) => current && setAtlas(m.default as unknown as Atlas));
    return () => {
      current = false;
    };
  }, []);
  const world = useMemo(() => atlas && drawWorld(atlas), [atlas]);
  const tense = useMemo(() => {
    const rung = new Map<string, number>();
    for (const t of modules?.geo?.tensions ?? []) {
      const p = PAIRS.find((x) => x.id === t.pair);
      if (!p) continue;
      for (const c of [p.a, p.b]) rung.set(c, Math.max(rung.get(c) ?? 0, t.rung));
    }
    return rung;
  }, [modules]);

  if (!on) {
    return (
      <div className="app">
        <AppMenuBar windowId={windowId} />
        <p className="encarter-off">
          Encarter 98 needs the Geopolitics module. Switch it on in <a onClick={() => useWindows.getState().open('mycomputer', { view: 'game' })}>My Computer → Game</a>.
        </p>
      </div>
    );
  }

  const fill = (s: Shape) => {
    if (s.country?.nope) return '#9a9a9a';
    if (!s.country) return '#e8dcb0';
    const r = tense.get(s.country.id) ?? 0;
    if (r >= 3) return '#d04030';
    if (r) return '#e89040';
    return '#90c070';
  };
  const move = (e: MouseEvent, shape: NonNullable<typeof hover>['shape']) => {
    const box = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
    if (hover?.shape.key !== shape.key && shape.key === 'northKorea') applause();
    setHover({ shape, x: e.clientX - box.left, y: e.clientY - box.top });
  };
  const country = open ? COUNTRY[open] : undefined;

  return (
    <div className="app encarter">
      <AppMenuBar
        windowId={windowId}
        menus={[{ label: 'Countries', items: COUNTRIES.filter((c) => !c.nope).sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ label: c.name, onClick: () => setOpen(c.id) })) }]}
      />
      <div className="encarter-banner">
        <b>Encarter 98</b> <i>World Atlas</i>
      </div>
      <div className="encarter-body">
        <div className="encarter-map sunken-panel">
          {!world ? (
            <p className="hint">Loading the world…</p>
          ) : (
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="World map" onMouseLeave={() => setHover(undefined)}>
              <path d={world.sphere} fill="#3d6fb0" />
              {world.shapes.map((s) => (
                <path
                  key={s.key}
                  d={s.d}
                  fill={s.key === open ? '#ffe070' : fill(s)}
                  stroke="#305020"
                  strokeWidth={0.4}
                  className={s.country && !s.country.nope ? 'encarter-country' : ''}
                  onMouseMove={(e) => move(e, s)}
                  onClick={() => s.country && !s.country.nope && setOpen(s.country.id)}
                  data-country={s.country?.id}
                />
              ))}
              {world.markers.map((m) => (
                <circle
                  key={m.country.id}
                  cx={m.x}
                  cy={m.y}
                  r={3}
                  fill={m.country.id === open ? '#ffe070' : '#f0d040'}
                  stroke="#000"
                  strokeWidth={0.6}
                  className="encarter-country"
                  onMouseMove={(e) => move(e, { key: m.country.id, country: m.country, name: m.country.name })}
                  onClick={() => setOpen(m.country.id)}
                  data-country={m.country.id}
                />
              ))}
            </svg>
          )}
          {hover && <HoverCard hover={hover} modules={modules} />}
        </div>
        <div className="encarter-page sunken-panel">
          {country ? <CountryPage country={country} modules={modules} /> : <Welcome modules={modules} onOpen={setOpen} />}
        </div>
      </div>
    </div>
  );
}

function Leader({ id, modules, size }: { id: string; modules?: ModulesView; size: number }) {
  const l = modules?.geo?.leaders[id];
  const c = COUNTRY[id];
  if (!l) return null;
  return (
    <div className="encarter-leader">
      <Portrait ceo={decodeCeo(l.ceo)} size={size} title={l.name} variant={c.leader.portrait} />
      <div>
        <b>
          {l.title} {l.name}
        </b>
        {l.note && !c.dry && (
          <>
            <br />
            <i>{l.note}</i>
          </>
        )}
      </div>
    </div>
  );
}

function HoverCard({ hover, modules }: { hover: { shape: { country?: CountrySpec; name: string; key: string }; x: number; y: number }; modules?: ModulesView }) {
  const c = hover.shape.country;
  return (
    <div className="encarter-hover" style={{ left: Math.min(hover.x + 12, WIDTH - 230), top: hover.y + 12 }}>
      <b>{hover.shape.name}</b>
      <p>{c ? c.hover : UNLISTED}</p>
      {c && <Leader id={c.id} modules={modules} size={40} />}
    </div>
  );
}

function Welcome({ modules, onOpen }: { modules?: ModulesView; onOpen(id: string): void }) {
  const tensions = modules?.geo?.tensions ?? [];
  return (
    <>
      <h3>Welcome to Encarter 98</h3>
      <p>The world, as it stands in your game. Point at a country for a summary; click it for the full entry.</p>
      <h4>Current tensions</h4>
      {tensions.length ? <TensionList tensions={tensions} onOpen={onOpen} /> : <p className="hint">All quiet. Suspiciously quiet.</p>}
    </>
  );
}

function CountryPage({ country: c, modules }: { country: CountrySpec; modules?: ModulesView }) {
  const directory = useGame((s) => s.directory);
  const { firmName, seed } = useGame.getState();
  const news = useNews({ kinds: ['story'], limit: 400 });
  const headlines = (news ?? []).filter((n) => n.args?.includes(c.id)).slice(0, 6);
  const companies = useMemo(
    () =>
      directory.genomes
        .map((g, i) => [companyOf(g), i] as const)
        .filter(([co]) => COUNTRY_OF_CITY[co.hq.country] === c.id)
        .sort((a, b) => b[0].marketCap - a[0].marketCap),
    [directory, c.id],
  );
  const tensions = (modules?.geo?.tensions ?? []).filter((t) => {
    const p = PAIRS.find((x) => x.id === t.pair);
    return p && (p.a === c.id || p.b === c.id);
  });
  return (
    <>
      <h3>{c.name}</h3>
      <p>
        <i>{c.hover}</i>
      </p>
      <Leader id={c.id} modules={modules} size={64} />
      <table className="encarter-facts">
        <tbody>
          <tr><th>Stability</th><td title={`${c.stability} of 5`}>{stars(c.stability)}</td></tr>
          <tr><th>Key exports</th><td>{c.exports}</td></tr>
          <tr><th>In the markets</th><td>{c.role}</td></tr>
          <tr><th>Companies</th><td>{companies.length ? `${companies.length} listed, worth ${bigMoney(companies.reduce((a, [co]) => a + co.marketCap, 0))} at the start` : 'None listed'}</td></tr>
        </tbody>
      </table>
      {companies.length > 0 && (
        <p>
          Largest:{' '}
          {companies.slice(0, 5).map(([co], k) => (
            <span key={co.ticker}>
              {k > 0 && ', '}
              <a onClick={() => openUrl(quoteUrl(co.ticker))}>{co.name}</a>
            </span>
          ))}
        </p>
      )}
      <h4>Tensions</h4>
      {tensions.length ? <TensionList tensions={tensions} /> : <p className="hint">None at present.</p>}
      <h4>Recent headlines</h4>
      {headlines.length ? (
        <ul>
          {headlines.map((n) => (
            <li key={n.id}>
              {formatDate(dayOf(n.time))}: <a onClick={() => openUrl(storyUrl(n))}>{headlineOf(n, directory, firmName, seed)}</a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Nothing lately.</p>
      )}
    </>
  );
}
