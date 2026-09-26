import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Logo } from '../../art/logo/Logo';
import { MOTIF_ICONS } from '../../art/logo/motifs';
import { PriceChart } from '../../charts/PriceChart';
import { bigMoney, count, money, pct, price, signed, signedPct, tone } from '../../apps/format';
import { START_DAY, dayOf, formatDate } from '../../sim/calendar';
import { TIMEFRAMES, type CompanyDetails, type Directory, type Quote, type QuarterResult, type Timeframe } from '../../sim/types';
import { useGame } from '../../state/game';
import type { Company } from '../../world/company';
import { companyOf, useDetails } from '../hooks';
import { companyUrl, firmUrl, playerUrl, quoteUrl, sites, type Sites } from '../urls';
import { BestViewed, HitCounter, Link, Marquee, Rule, UnderConstruction, tileStyle, useTitle } from '../web';
import { companySite, shortName, type CompanySite } from './content';

export const PAGES = [
  ['index.html', 'Home'],
  ['about.html', 'About Us'],
  ['products.html', 'Products'],
  ['investor.html', 'Investor Relations'],
  ['guestbook.html', 'Guestbook'],
] as const;

export type CompanyPage = (typeof PAGES)[number][0];

/** Live data a company's pages show: the worker's details and the snapshot's quote. */
export interface Live {
  details?: CompanyDetails;
  quote?: Quote;
  /** Shares the player's firm holds. */
  held: number;
  day: number;
}

/** A company's website (spec §14), from its genome and live market data. */
export default function CompanyWebsite({ id, page }: { id: number; page: string }) {
  const directory = useGame((s) => s.directory);
  const firmName = useGame((s) => s.firmName);
  const quote = useGame((s) => s.snapshot?.quotes[id]);
  const held = useGame((s) => s.snapshot?.positions.find((p) => p.company === id)?.shares ?? 0);
  const day = useGame((s) => (s.snapshot ? dayOf(s.snapshot.time) : START_DAY));
  const details = useDetails(id);
  const company = companyOf(directory.genomes[id]);
  return (
    <CompanyPages
      id={id}
      company={company}
      page={page}
      directory={directory}
      sites={sites(directory, firmName)}
      firmName={firmName}
      live={{ details, quote, held, day }}
    />
  );
}

interface Props {
  id: number;
  company: Company;
  page: string;
  directory: Directory;
  sites: Sites;
  firmName: string;
  live: Live;
}

/** The pages themselves, from plain data (tests render every company's site through here). */
export function CompanyPages(props: Props) {
  const { company: c, page } = props;
  const site = useMemo(() => companySite(c), [c]);
  const title = PAGES.find(([file]) => file === (page || 'index.html'))?.[1];
  useTitle(title ? `${c.name} — ${title}` : 'HTTP 404 Not Found');
  const content = (() => {
    switch (page || 'index.html') {
      case 'index.html':
        return <Home {...props} site={site} />;
      case 'about.html':
        return <About {...props} site={site} />;
      case 'products.html':
        return <Products {...props} site={site} />;
      case 'investor.html':
        return <Investors {...props} site={site} />;
      case 'guestbook.html':
        return <Guestbook {...props} site={site} />;
      default:
        return <p>The page you requested could not be found on this server. <Link href="index.html">Return to the home page.</Link></p>;
    }
  })();
  return (
    <Frame {...props} site={site}>
      {content}
    </Frame>
  );
}

type PageProps = Props & { site: CompanySite };

function Nav({ page, style }: { page: string; style: 'buttons' | 'links' | 'tabs' | 'plain' }) {
  const current = page || 'index.html';
  if (style === 'links') {
    return (
      <p className="cs-nav-links">
        [{' '}
        {PAGES.map(([file, label], k) => (
          <span key={file}>
            {k > 0 && ' | '}
            {file === current ? <b>{label}</b> : <Link href={file}>{label}</Link>}
          </span>
        ))}{' '}
        ]
      </p>
    );
  }
  return (
    <nav className={`cs-nav cs-nav-${style}`}>
      {PAGES.map(([file, label]) => (
        <Link key={file} href={file} className={file === current ? 'current' : ''}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

function Header({ c, site, big }: { c: Company; site: CompanySite; big?: boolean }) {
  return (
    <div className="cs-header">
      <Logo spec={big ? { ...site.logo, layout: site.logo.layout === 'iconLeft' ? 'iconAbove' : site.logo.layout } : site.logo} name={c.name} height={big ? 72 : 48} />
      <Marquee className="cs-slogan">{site.slogan}</Marquee>
    </div>
  );
}

/** Previous and next company in the same industry (spec §14.2 web rings). */
function WebRing({ id, directory, sites: s }: { id: number; directory: Directory; sites: Sites }) {
  const industry = directory.industries[id];
  const peers = useMemo(() => directory.industries.flatMap((x, i) => (x === industry ? [i] : [])), [directory, industry]);
  const k = peers.indexOf(id);
  const prev = peers[(k - 1 + peers.length) % peers.length];
  const next = peers[(k + 1) % peers.length];
  return (
    <p className="web-ring">
      <Link href={companyUrl(s, prev)}>← Prev</Link> | <b>{industry} Web Ring</b> | <Link href={companyUrl(s, next)}>Next →</Link>
    </p>
  );
}

function Footer(props: PageProps) {
  const { company: c, sites: s, id } = props;
  return (
    <div className="cs-footer">
      <Rule />
      <WebRing {...props} />
      <p>
        © {new Date(props.live.day * 86_400_000).getUTCFullYear()} {c.name.replace(/\.$/, '')}. All rights reserved. Questions? E-mail the{' '}
        <u>webmaster@{s.company[id].replace(/^www\./, '')}</u>
      </p>
      <BestViewed />
    </div>
  );
}

/** The eight layouts: where the header and the navigation go (spec §14). */
function Frame(props: PageProps & { children: ReactNode }) {
  const { company: c, site, page, children } = props;
  const style = { ...tileStyle(site.tile, site.colours.main, site.colours.accent), fontFamily: site.font };
  const main = (
    <div className="cs-main">
      {children}
      <Footer {...props} />
    </div>
  );
  const vars = { '--cs-main': site.colours.main, '--cs-accent': site.colours.accent, '--cs-ink': site.colours.ink } as CSSProperties;
  const wrap = (body: ReactNode) => (
    <div className={`company-site cs-${site.layout}`} style={{ ...style, ...vars }}>
      {body}
    </div>
  );
  switch (site.layout) {
    case 'classic':
      return wrap(
        <>
          <Header c={c} site={site} />
          <div className="cs-columns">
            <Nav page={page} style="buttons" />
            {main}
          </div>
        </>,
      );
    case 'frames':
      return wrap(
        <div className="cs-columns">
          <Nav page={page} style="plain" />
          <div className="cs-framed">
            <Header c={c} site={site} />
            {main}
          </div>
        </div>,
      );
    case 'centered':
    case 'homepage':
      return wrap(
        <div className="cs-column">
          <Header c={c} site={site} big={site.layout === 'homepage'} />
          {site.layout === 'homepage' && <UnderConstruction />}
          <Nav page={page} style="links" />
          <Rule />
          {main}
        </div>,
      );
    case 'tabs':
      return wrap(
        <>
          <Header c={c} site={site} />
          <Nav page={page} style="tabs" />
          {main}
        </>,
      );
    case 'sidebar':
      return wrap(
        <>
          <Header c={c} site={site} />
          <div className="cs-columns">
            {main}
            <Nav page={page} style="buttons" />
          </div>
        </>,
      );
    case 'corporate':
      return wrap(
        <>
          <div className="cs-bar">
            <span className="cs-logo-box">
              <Logo spec={site.logo} name={c.name} height={36} />
            </span>
            <Nav page={page} style="plain" />
          </div>
          <div className="cs-panel">{main}</div>
        </>,
      );
    case 'brochure':
      return wrap(
        <div className="cs-column">
          <Header c={c} site={site} big />
          <Nav page={page} style="buttons" />
          {main}
        </div>,
      );
  }
}

const quarterName = (q: number) => `Q${(q % 4) + 1} ${Math.floor(q / 4)}`;
const ORDINAL = ['First', 'Second', 'Third', 'Fourth'];

function pressReleases(c: Company, quarters: readonly QuarterResult[]) {
  return quarters
    .slice()
    .reverse()
    .map((q) => ({
      day: q.reported,
      title: `${shortName(c.name)} Reports ${ORDINAL[q.quarter % 4]}-Quarter ${Math.floor(q.quarter / 4)} Results`,
      text: `Revenue of ${bigMoney(q.revenue)}; net ${q.income >= 0 ? 'income' : 'loss'} of ${bigMoney(Math.abs(q.income))} (${money(q.eps)} per share).`,
    }));
}

function Home(props: PageProps) {
  const { company: c, site, live } = props;
  const highlights = site.products.slice(0, 3);
  const news = live.details ? pressReleases(c, live.details.quarters).slice(0, 3) : [];
  return (
    <>
      <h1>Welcome to {c.name}!</h1>
      <p>{site.welcome}</p>
      <h2>Product Highlights</h2>
      <table className="cs-highlights">
        <tbody>
          <tr>
            {highlights.map((p) => (
              <td key={p.name}>
                <ClipArt motif={p.motif} />
                <br />
                <Link href="products.html">{p.name}</Link>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <h2>Latest News</h2>
      <ul>
        {news.map((n) => (
          <li key={n.day}>
            <b>{formatDate(n.day)}</b> — <Link href="investor.html">{n.title}</Link>
          </li>
        ))}
        {!news.length && <li>Loading news…</li>}
      </ul>
      {live.quote && (
        <p className="cs-ticker-box">
          <b>{c.ticker}</b> {price(live.quote.last)}{' '}
          <span className={tone(live.quote.change)}>
            {signed(live.quote.change, live.quote.last)} ({signedPct(live.quote.pct)})
          </span>{' '}
          — <Link href="investor.html">Investor Relations</Link>
        </p>
      )}
      <HitCounter count={site.visitors + (live.day - START_DAY) * site.visitorsPerDay} />
    </>
  );
}

function ClipArt({ motif, size = 64 }: { motif: CompanySite['products'][number]['motif']; size?: number }) {
  const Icon = MOTIF_ICONS[motif];
  return (
    <span className="clip-art">
      <Icon size={size} />
    </span>
  );
}

function About({ company: c, site }: PageProps) {
  return (
    <>
      <h1>About {shortName(c.name)}</h1>
      <table className="cs-facts">
        <tbody>
          <tr><th>Founded</th><td>{new Date(START_DAY * 86_400_000).getUTCFullYear() - c.founded}</td></tr>
          <tr><th>Headquarters</th><td>{c.hq.name}, {c.hq.country}</td></tr>
          <tr><th>Industry</th><td>{c.industry.name} ({c.subIndustry})</td></tr>
          <tr><th>Ticker symbol</th><td>{c.ticker}</td></tr>
        </tbody>
      </table>
      <h2>Our History</h2>
      {site.history.map((text) => (
        <p key={text}>{text}</p>
      ))}
      <h2>Our Leadership</h2>
      <div className="cs-ceo">
        <Photo name={`${c.ceo.firstName} ${c.ceo.lastName}`} />
        <div>
          <b>
            {c.ceo.firstName} {c.ceo.lastName}
          </b>
          <br />
          <i>Chief Executive Officer</i>
          {site.bio.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </div>
      </div>
    </>
  );
}

/** A framed photo of a person; the portraits themselves arrive with the portrait system (Phase 5). */
export function Photo({ name }: { name: string }) {
  return (
    <div className="web-photo" title={name}>
      <svg viewBox="0 0 60 72" width="90" height="108" aria-label={`Photo of ${name}`}>
        <rect width="60" height="72" fill="#c8d4e0" />
        <circle cx="30" cy="28" r="13" fill="#7a8794" />
        <path d="M6 72c2-16 12-24 24-24s22 8 24 24z" fill="#7a8794" />
      </svg>
      <span>Photo coming soon</span>
    </div>
  );
}

function Products({ company: c, site }: PageProps) {
  return (
    <>
      <h1>Our Products</h1>
      <p>
        {shortName(c.name)} offers a full range of {c.subIndustry.toLowerCase()} products. Call <b>{site.phone}</b> to order!
      </p>
      <table className="cs-products">
        <tbody>
          {site.products.map((p) => (
            <tr key={p.name}>
              <td>
                <ClipArt motif={p.motif} size={48} />
              </td>
              <td>
                <b>{p.name}</b>
                <br />
                {p.blurb}
                <br />
                <span className="cs-price">Only {money(p.price)}!</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Investors(props: PageProps) {
  const { company: c, id, live, directory, sites: s, firmName } = props;
  const [timeframe, setTimeframe] = useState<Timeframe>('1Y');
  const d = live.details;
  const q = live.quote;
  const last = q?.last ?? c.price;
  return (
    <>
      <h1>Investor Relations</h1>
      <p className="cs-quote-line">
        <b>
          {c.ticker} {price(last)}
        </b>{' '}
        {q && (
          <span className={tone(q.change)}>
            {signed(q.change, q.last)} ({signedPct(q.pct)})
          </span>
        )}{' '}
        <small>
          Quotes delayed 0 minutes. <Link href={quoteUrl(c.ticker)}>More on QuoteZone</Link>
        </small>
      </p>
      <div className="cs-chart">
        <p className="cs-timeframes">
          {TIMEFRAMES.map((tf) => (
            <button key={tf} className={tf === timeframe ? 'current' : ''} onClick={() => setTimeframe(tf)}>
              {tf === 'MAX' ? 'Max' : tf}
            </button>
          ))}
        </p>
        <PriceChart id={id} timeframe={timeframe} type="line" skin="web" />
      </div>
      {d ? (
        <>
          <h2>Key Statistics</h2>
          <KeyStats c={c} d={d} last={last} />
          <h2>Quarterly Results</h2>
          <QuarterTable quarters={d.quarters} />
          <h2>Top Shareholders</h2>
          <Holders d={d} directory={directory} sites={s} firmName={firmName} held={live.held} />
          <h2>Press Releases</h2>
          <ul>
            {pressReleases(c, d.quarters).slice(0, 4).map((n) => (
              <li key={n.day}>
                <b>{formatDate(n.day)}</b> — {n.title}. {n.text}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>Loading investor information…</p>
      )}
      <p className="cs-registration">
        Registration No. <code>{c.genome}</code>
      </p>
    </>
  );
}

function KeyStats({ c, d, last }: { c: Company; d: CompanyDetails; last: number }) {
  const eps = d.eps;
  const rows: [string, string][] = [
    ['Price', `$${price(last)}`],
    ['Market cap', bigMoney(last * d.shares)],
    ['P/E ratio', d.pe === null ? 'n/a' : (last / eps).toFixed(1)],
    ['EPS (TTM)', money(eps)],
    ['Dividend', c.dividendYield ? `${money(c.dividendYield * last)} (${pct(c.dividendYield, 2)})` : 'None'],
    ['52-week range', `${price(Math.min(d.low52, last))} – ${price(Math.max(d.high52, last))}`],
    ['Shares outstanding', count(d.shares)],
    ['Float', `${count(d.shares * d.floatPct)} (${pct(d.floatPct)})`],
    ['Beta', d.beta.toFixed(2)],
    // Short selling arrives in Phase 7; until then nobody is short.
    ['Short interest', 'n/a'],
    ['Next earnings', formatDate(d.nextEarnings)],
    ['Revenue (TTM)', bigMoney(d.revenue)],
  ];
  return (
    <table className="cs-stats" border={1} cellPadding={3}>
      <tbody>
        {Array.from({ length: rows.length / 2 }, (_, k) => (
          <tr key={k}>
            <th>{rows[2 * k][0]}</th>
            <td>{rows[2 * k][1]}</td>
            <th>{rows[2 * k + 1][0]}</th>
            <td>{rows[2 * k + 1][1]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function QuarterTable({ quarters }: { quarters: readonly QuarterResult[] }) {
  return (
    <table className="cs-quarters" border={1} cellPadding={3}>
      <thead>
        <tr>
          <th>Quarter</th>
          <th>Revenue</th>
          <th>Net income</th>
          <th>EPS</th>
          <th>Reported</th>
        </tr>
      </thead>
      <tbody>
        {quarters
          .slice()
          .reverse()
          .map((q) => (
            <tr key={q.quarter}>
              <td>{quarterName(q.quarter)}</td>
              <td>{bigMoney(q.revenue)}</td>
              <td className={tone(q.income)}>{q.income < 0 ? `−${bigMoney(-q.income)}` : bigMoney(q.income)}</td>
              <td>{money(q.eps)}</td>
              <td>{formatDate(q.reported)}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

function Holders({ d, directory, sites: s, firmName, held }: { d: CompanyDetails; directory: Directory; sites: Sites; firmName: string; held: number }) {
  const rows: { key: string; name: ReactNode; shares: number }[] = d.holders.map((h) => ({
    key: `f${h.firm}`,
    name: <Link href={firmUrl(s, h.firm)}>{directory.firms[h.firm].name}</Link>,
    shares: h.shares,
  }));
  if (held > 0) rows.push({ key: 'player', name: <Link href={playerUrl(s)}>{firmName}</Link>, shares: held });
  rows.sort((a, b) => b.shares - a.shares);
  rows.push({ key: 'insiders', name: 'Officers and directors', shares: d.insiderPct * d.shares });
  return (
    <table className="cs-holders" border={1} cellPadding={3}>
      <thead>
        <tr>
          <th>Holder</th>
          <th>Shares</th>
          <th>% of shares out</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.name}</td>
            <td>{count(r.shares)}</td>
            <td>{pct(r.shares / d.shares, 2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Guestbook({ company: c, site }: PageProps) {
  const [signed, setSigned] = useState(false);
  return (
    <>
      <h1>Guestbook</h1>
      <p>Thank you for visiting! Please sign our guestbook and tell us what you think of {shortName(c.name)}.</p>
      {site.guestbook.map((g, k) => (
        <div key={k} className="guestbook-entry">
          <b>{g.name}</b> from {g.city} wrote on {formatDate(START_DAY - g.daysAgo)}:
          <blockquote>{g.text}</blockquote>
        </div>
      ))}
      <Rule />
      {signed ? (
        <p>
          <b>Thank you!</b> Your entry will appear once our webmaster has approved it.
        </p>
      ) : (
        <form
          className="guestbook-form"
          onSubmit={(e) => {
            e.preventDefault();
            setSigned(true);
          }}
        >
          Name: <input type="text" size={20} /> Comments: <input type="text" size={30} /> <button type="submit">Sign Guestbook</button>
        </form>
      )}
    </>
  );
}
