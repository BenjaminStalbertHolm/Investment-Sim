import { useMemo, type ReactNode } from 'react';
import { Logo, type LogoSpec } from '../../art/logo/Logo';
import { LOGO_FONTS, LOGO_LAYOUTS, LOGO_SHAPES, PALETTES, type LogoMotif } from '../../art/logo/options';
import { PerformanceChart } from '../../charts/PerformanceChart';
import { bigMoney, count, pct, signedPct } from '../../apps/format';
import { START_DAY, formatDate } from '../../sim/calendar';
import { useAccountData, useGame } from '../../state/game';
import { simulation } from '../../sim/client';
import { CITIES } from '../../world/cities';
import { FIRST_NAMES, LAST_NAMES } from '../../world/people-names';
import { PRESET_FIRMS } from '../../world/presetFirms';
import { Rng } from '../../world/rng';
import { STRATEGY_BLURBS } from '../data/copy';
import { Photo } from '../company/CompanySite';
import { useFirm } from '../hooks';
import { companyUrl, sites } from '../urls';
import { BestViewed, Link, Marquee, Rule, useTitle } from '../web';

const MOTIFS: LogoMotif[] = ['bull', 'eagle', 'lion', 'owl', 'tower', 'pillar', 'globe', 'arrowUp', 'rock', 'mountain', 'ship', 'anchor', 'key', 'crown', 'coin', 'star', 'bridge'];
const HUBS = ['New York', 'Boston', 'London', 'Chicago', 'San Francisco', 'Toronto', 'Edinburgh', 'Zurich', 'Philadelphia'];

export interface FirmProfile {
  logo: LogoSpec;
  ceo: string;
  /** Chief investment officer and chief financial officer. */
  officers: [string, string];
  founded: number;
  city: string;
}

/**
 * A competitor's identity: presets use their spec §6 logo direction and CEO; generated firms draw theirs from a
 * stream named after the firm, as does everyone's supporting cast.
 */
export function firmProfile(seed: string, firm: { id: string; preset: boolean }): FirmProfile {
  const preset = PRESET_FIRMS.find((f) => f.id === firm.id);
  const rng = Rng.stream(firm.preset ? 'preset firms' : seed, `firm:${firm.id}`);
  const person = () => `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
  const logo: LogoSpec = preset
    ? { ...preset.logo, palette: PALETTES.find((p) => p.id === preset.logo.palette)! }
    : {
        shape: rng.pick(LOGO_SHAPES),
        motif: rng.pick(MOTIFS),
        palette: rng.pick(PALETTES.filter((p) => p.family !== 'purple')),
        font: rng.pick(LOGO_FONTS.filter((f) => f !== 'pixel')),
        layout: rng.pick(LOGO_LAYOUTS),
      };
  const ceo = preset?.ceo ?? person();
  const city = CITIES.find((c) => c.name === rng.pick(HUBS));
  return { logo, ceo, officers: [person(), person()], founded: rng.int(1870, 1990), city: city ? `${city.name}, ${city.country}` : 'New York' };
}

/** The player's firm until the logo designer (Phase 5) gives it one of its own. */
const PLAYER_LOGO: LogoSpec = { shape: 'circle', motif: 'bull', palette: PALETTES.find((p) => p.id === 'navyGold')!, font: 'serif', layout: 'iconLeft' };

const PAGES = [
  ['index.html', 'Home'],
  ['holdings.html', 'Holdings'],
  ['leadership.html', 'Leadership'],
] as const;

function Shell({ name, logo, page, children, colour }: { name: string; logo: LogoSpec; page: string; children: ReactNode; colour: string }) {
  const current = page || 'index.html';
  return (
    <div className="firm-site" style={{ ['--firm' as string]: colour }}>
      <div className="firm-header">
        <Logo spec={logo} name={name} height={44} />
      </div>
      <nav className="firm-nav">
        {PAGES.map(([file, label]) => (
          <Link key={file} href={file} className={file === current ? 'current' : ''}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="firm-body">{children}</div>
      <Rule />
      <div className="firm-footer">
        Past performance is no guarantee of future results. © 1998 {name}.
        <BestViewed />
      </div>
    </div>
  );
}

const returns = (history: readonly [number, number, number][]) => {
  const [first, last] = [history[0], history.at(-1)!];
  return { firm: last[1] / first[1] - 1, index: last[2] / first[2] - 1 };
};

/** A competitor's website (spec §14): AUM, strategy, performance against the MAJOR 500, top holdings, leadership. */
export function FirmWebsite({ id, page }: { id: number; page: string }) {
  const directory = useGame((s) => s.directory);
  const seed = useGame((s) => s.seed);
  const firmName = useGame((s) => s.firmName);
  const firm = directory.firms[id];
  const profile = useMemo(() => firmProfile(seed, firm), [seed, firm]);
  const view = useFirm(id);
  const s = sites(directory, firmName);
  const title = PAGES.find(([f]) => f === (page || 'index.html'))?.[1] ?? 'Not Found';
  useTitle(`${firm.name} — ${title}`);
  const body = (() => {
    if (!view) return <p>Loading…</p>;
    switch (page || 'index.html') {
      case 'index.html': {
        const r = returns(view.history);
        return (
          <>
            <Marquee>Assets under management: {bigMoney(view.aum)} · Serving investors since {profile.founded}</Marquee>
            <h1>Welcome to {firm.name}</h1>
            <p>{STRATEGY_BLURBS[firm.strategy]}</p>
            <table className="firm-facts" border={1} cellPadding={4}>
              <tbody>
                <tr><th>Assets under management</th><td>{bigMoney(view.aum)}</td></tr>
                <tr><th>Headquarters</th><td>{profile.city}</td></tr>
                <tr><th>Founded</th><td>{profile.founded}</td></tr>
                <tr><th>Return since {formatDate(START_DAY)}</th><td>{signedPct(r.firm)} (MAJOR 500 {signedPct(r.index)})</td></tr>
              </tbody>
            </table>
            <h2>Performance vs. the MAJOR 500</h2>
            <div className="firm-chart">
              <PerformanceChart stats={view.history.slice(1)} deposits={view.history[0][1]} label={firm.name} web />
            </div>
          </>
        );
      }
      case 'holdings.html': {
        const subsidiaries = view.holdings.filter((h) => h.pct > 0.5);
        return (
          <>
            <h1>Top Holdings</h1>
            <p>
              Our largest positions, from our most recent filing with the Securities Oversight Bureau. {firm.name} holds{' '}
              {count(view.holdings.length)} stocks.
            </p>
            <table className="firm-holdings" border={1} cellPadding={3}>
              <thead>
                <tr><th>Company</th><th>Shares</th><th>Value</th><th>% of company</th><th>% of fund</th></tr>
              </thead>
              <tbody>
                {view.holdings.slice(0, 25).map((h) => (
                  <tr key={h.company}>
                    <td><Link href={companyUrl(s, h.company)}>{directory.names[h.company]}</Link></td>
                    <td>{count(h.shares)}</td>
                    <td>{bigMoney(h.value)}</td>
                    <td>{pct(h.pct, 2)}</td>
                    <td>{pct(h.value / view.aum, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h2>Subsidiaries</h2>
            {subsidiaries.length ? (
              <ul>
                {subsidiaries.map((h) => (
                  <li key={h.company}>
                    <Link href={companyUrl(s, h.company)}>{directory.names[h.company]}</Link> ({pct(h.pct)} owned)
                  </li>
                ))}
              </ul>
            ) : (
              <p>{firm.name} controls no listed companies.</p>
            )}
          </>
        );
      }
      case 'leadership.html':
        return (
          <>
            <h1>Leadership</h1>
            {[[profile.ceo, 'Chief Executive Officer'], [profile.officers[0], 'Chief Investment Officer'], [profile.officers[1], 'Chief Financial Officer']].map(
              ([name, role]) => (
                <div key={role} className="firm-person">
                  <Photo name={name} />
                  <p>
                    <b>{name}</b>
                    <br />
                    <i>{role}</i>
                  </p>
                </div>
              ),
            )}
          </>
        );
      default:
        return <p>The page you requested could not be found.</p>;
    }
  })();
  return (
    <Shell name={firm.name} logo={profile.logo} page={page} colour={profile.logo.palette.colors[0]}>
      {body}
    </Shell>
  );
}

/** The player's own firm (spec §14): its name, assets and returns, updated as it grows. */
export function PlayerWebsite({ page }: { page: string }) {
  const firmName = useGame((s) => s.firmName);
  const account = useGame((s) => s.snapshot?.account);
  const stats = useAccountData(() => simulation().stats());
  useTitle(`${firmName} — Home`);
  const history: [number, number, number][] = stats ?? [];
  const last = history.at(-1);
  const deposits = account?.deposits ?? 0;
  const body = (() => {
    switch (page || 'index.html') {
      case 'index.html':
        return (
          <>
            <h1>Welcome to {firmName}</h1>
            <p>A young investment firm with big ambitions, founded in {new Date(START_DAY * 86_400_000).getUTCFullYear()}.</p>
            <table className="firm-facts" border={1} cellPadding={4}>
              <tbody>
                <tr><th>Assets under management</th><td>{account ? bigMoney(account.netWorth) : '…'}</td></tr>
                <tr>
                  <th>Return since inception</th>
                  <td>{last && deposits ? `${signedPct(last[1] / deposits - 1)} (MAJOR 500 ${signedPct(last[2] / 1000 - 1)})` : 'Our first trading day is under way.'}</td>
                </tr>
              </tbody>
            </table>
            <h2>Performance vs. the MAJOR 500</h2>
            <div className="firm-chart">{deposits > 0 && <PerformanceChart stats={history} deposits={deposits} label={firmName} web />}</div>
          </>
        );
      case 'holdings.html':
        return (
          <>
            <h1>Holdings</h1>
            <p>Our holdings are confidential. Clients receive a full statement every quarter.</p>
          </>
        );
      case 'leadership.html':
        return (
          <>
            <h1>Leadership</h1>
            <div className="firm-person">
              <Photo name="Chief Executive Officer" />
              <p>
                <b>Chief Executive Officer</b>
                <br />
                <i>Founder</i>
              </p>
            </div>
          </>
        );
      default:
        return <p>The page you requested could not be found.</p>;
    }
  })();
  return (
    <Shell name={firmName} logo={PLAYER_LOGO} page={page} colour={PLAYER_LOGO.palette.colors[0]}>
      {body}
    </Shell>
  );
}
