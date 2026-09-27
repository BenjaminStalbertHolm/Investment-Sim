import { useMemo } from 'react';
import { WALLPAPERS } from '../../art/wallpapers';
import { START_DAY, dayOf, formatClock, gameYear } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { shownYear } from '../../sim/desk';
import { hash } from '../../sim/press';
import { FIRST_NAMES, LAST_NAMES } from '../../world/people-names';
import { useGame } from '../../state/game';
import { usePrograms } from '../../state/programs';
import { TILES } from '../data/themes';
import { SiteFrame } from '../frame';
import { useFetched } from '../hooks';
import { DANCING_BABY, HAMSTERS, HOMECITIES, MAJORSOFT, NEWSWIRE, TUCATS, Y2K, YEEHAW, quoteUrl } from '../urls';
import { BestViewed, HitCounter, Link, Marquee, Rule, UnderConstruction, tileStyle, useTitle } from '../web';

/**
 * The Service Packs: majorsoft.com's notes are the game's own changelog (spec §14.2), a pack per phase of its
 * development, newest first.
 */
const SERVICE_PACKS: [string, string[]][] = [
  ['Service Pack 10', [
    'New programs: ISeekYou, MajorWord, Exceed, PeopleSoftie HR, Stapley, WinRamp, the Pager, Rolodex, Portfolio Defragmenter, Task Mangler, MajorPaint, Notepad, Calculator, Margin Sweeper and Soli-Tear.',
    'Staff: hire analysts, traders, compliance officers, PR managers, IT admins and assistants from Monstrous.com. Offices from the garage to the penthouse on Greg’s List.',
    'Luxuries from the Lifestyles Catalogue, collectibles on eBuy, conferences, the State Lotto and Hindsight Research’s subscription.',
    'Companies now go public (the IPO Hotline) and split their shares. Standard & Pours and Moody Blues rate every company.',
    'Fixed: Stapley no longer offers help while you are writing a letter. He still offers help.',
  ]],
  ['Service Pack 9', ['The Garlic Browser 0.9 beta and the markets it reaches. We do not endorse them.']],
  ['Service Pack 8', ['Competitor firms, annual meetings, board seats and takeovers; the fund league tables; index funds; the Securities Oversight Bureau.']],
  ['Service Pack 7', ['Short selling, margin, commodity futures, the weather, OPEK, bank loans, credit scores and bankruptcy.']],
  ['Service Pack 6', ['Outbox Express: clients, mandates and quarterly statements. Company events and the news that follows them.']],
  ['Service Pack 5', ['Your character, your firm’s logo and the New Game wizard.']],
  ['Service Pack 4', ['Internet Exploiter 4.0 and the World Wide Web, including a web site for every listed company.']],
  ['Service Pack 3', ['The market engine, MajorTrade Pro 98 and saved games.']],
  ['Service Pack 2', ['Ten thousand companies, generated.']],
  ['Service Pack 1', ['Doors 98. Windows that open, move and close.']],
];

/** majorsoft.com (spec §14.2): the OS maker's site, with its Service Pack notes and wallpapers to download. */
export function Majorsoft({ url }: { url: URL }) {
  const page = url.pathname.replace(/^\//, '');
  const wallpaper = usePrograms((s) => s.wallpaper);
  useTitle(page === 'wallpapers' ? 'Majorsoft Desktop Themes' : 'Majorsoft Corporation — Where Do You Want To Invest Today?');
  return (
    <SiteFrame
      home={MAJORSOFT}
      logo="Majorsoft®"
      tagline="Where do you want to invest today?"
      look={{ head: '#000080', ink: '#fff', accent: '#000080', page: '#fff', font: 'Verdana, Arial, sans-serif' }}
      nav={[[`http://${MAJORSOFT}/`, 'Doors 98'], [`http://${MAJORSOFT}/servicepacks`, 'Service Packs'], [`http://${MAJORSOFT}/wallpapers`, 'Desktop Themes'], [`http://${NEWSWIRE}/`, 'Majorsoft Newswire']]}
      footer={`© ${gameYear(START_DAY)} Majorsoft Corporation. All rights reserved. Majorsoft, Doors and the Doors logo are trademarks of Majorsoft Corporation. Terms of Use.`}
    >
      {page === 'wallpapers' ? (
        <>
          <h2>Desktop Themes</h2>
          <p>Free wallpapers for Doors 98. Click Download and they are on your desktop at once.</p>
          <div className="wallpapers">
            {WALLPAPERS.map((w) => (
              <div key={w.id} className="wallpaper-sample">
                <div style={w.style} className="wallpaper-swatch" />
                <b>{w.name}</b>
                <button disabled={wallpaper.kind === 'pattern' && wallpaper.id === w.id} onClick={() => usePrograms.setState({ wallpaper: { kind: 'pattern', id: w.id } })}>
                  {wallpaper.kind === 'pattern' && wallpaper.id === w.id ? 'Installed' : 'Download'}
                </button>
              </div>
            ))}
            <div className="wallpaper-sample">
              <div className="wallpaper-swatch" style={{ background: '#008080' }} />
              <b>Teal (the classic)</b>
              <button disabled={wallpaper.kind === 'teal'} onClick={() => usePrograms.setState({ wallpaper: { kind: 'teal' } })}>
                {wallpaper.kind === 'teal' ? 'Installed' : 'Restore'}
              </button>
            </div>
          </div>
          <p className="hint">Or paint your own in MajorPaint and choose Use As → Set As Wallpaper.</p>
        </>
      ) : page === 'servicepacks' ? (
        <>
          <h2>Doors 98 Service Pack notes</h2>
          {SERVICE_PACKS.map(([name, notes]) => (
            <div key={name}>
              <h3>{name}</h3>
              <ul>
                {notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ))}
        </>
      ) : (
        <>
          <h2>Doors 98 is here.</h2>
          <p>
            The operating system for investors. Faster, friendlier and 40% more Stapley. Doors 98 is installed on this computer,
            which is how you are reading this.
          </p>
          <p>
            <Link href="/servicepacks">Read the Service Pack notes »</Link> · <Link href="/wallpapers">Download free desktop themes »</Link> ·{' '}
            <Link href={`http://${TUCATS}/`}>More downloads at Tucats »</Link>
          </p>
          <p className="hint">If Doors 98 has stopped responding, press Ctrl+Alt+Del to open Task Mangler.</p>
        </>
      )}
    </SiteFrame>
  );
}

/** Y2K Countdown (spec §14.2): the days to 1 January 2000. If the game gets there, a mild panic fires. */
export function Y2kCountdown() {
  useTitle('Y2K Countdown — Are YOU Ready?');
  const time = useGame((s) => s.snapshot?.time ?? START_DAY * 1440);
  const startYear = useGame((s) => s.settings?.startYear ?? 1998);
  const today = dayOf(time);
  // The calendar is 1998's shifted by the cosmetic start year: 2000 arrives in the game's own (2000 − start) years.
  const target = Date.UTC(2000 - startYear + 1998, 0, 1) / 86_400_000;
  const past = shownYear(today, startYear) >= 2000;
  const minutes = Math.max(0, target * 1440 - time);
  const parts = [Math.floor(minutes / 1440), Math.floor((minutes % 1440) / 60), minutes % 60];
  return (
    <div className="site-y2k">
      <h1>Y2K COUNTDOWN</h1>
      {past ? (
        <p className="y2k-digits">The millennium is here. The lights stayed on. We are as surprised as you are.</p>
      ) : (
        <>
          <p className="y2k-digits">
            {parts[0]} DAYS {String(parts[1]).padStart(2, '0')} HOURS {String(parts[2]).padStart(2, '0')} MINUTES
          </p>
          <p>until the year 2000, when every computer that stores the year in two digits thinks it is 1900.</p>
        </>
      )}
      <Marquee speed={20}>
        Stock up on canned food * Withdraw your savings * Is your VCR compliant? * Banks, airlines and chip makers MOST AT RISK *
      </Marquee>
      <ul>
        <li>Will the banks open? Will the planes fly? Will your microwave work?</li>
        <li>Majorsoft says Doors 98 is Y2K compliant. Majorsoft would say that.</li>
        <li>Experts expect a panic in technology and bank shares on the first trading day of 2000.</li>
      </ul>
      <UnderConstruction />
      <HitCounter count={1_999_999 - parts[0]} />
      <p>
        <Link href={`http://${YEEHAW}/`}>Back to Yeehaw!</Link> · Last updated {formatClock(time)}
      </p>
    </div>
  );
}

const HOODS = ['WallStreet/Vault', 'WallStreet/Floor', 'SiliconValley/Lab', 'Heartland/Prairie', 'Tokyo/Garden', 'Colosseum/Arena'];
const TITLES = ['{n}’s AWESOME Stock Picks!!!', 'The {n} Investment Page', 'Welcome to {n}’s World of Money', '{n}’s Hot Tips (updated weekly!!)', 'Stocks, Guitars and My Cat, by {n}', 'THE MARKET ORACLE ({n})'];
const BRAGS = [
  'I made 400% last year trading from my kitchen. My wife says I should get a real job.',
  'My system uses the phases of the moon AND moving averages.',
  'I have been right about everything since 1996, except the things I was wrong about.',
  'Not financial advice. Well, it kind of is.',
  'Quit my job in March to trade full time! Going GREAT so far!!',
  'These picks come from my brother-in-law, who works near a bank.',
];

interface HomePage {
  path: string;
  author: string;
  title: string;
  brag: string;
  tile: (typeof TILES)[number];
  colours: [string, string];
  garlic: boolean;
}

function homePages(seed: string): HomePage[] {
  return Array.from({ length: 8 }, (_, k) => {
    const h = (s: string) => hash(seed, 'homecities', k, s);
    const author = `${FIRST_NAMES[h('first') % FIRST_NAMES.length]}`;
    return {
      path: `/${HOODS[h('hood') % HOODS.length]}/${1000 + (h('num') % 8999)}/`,
      author: `${author} ${LAST_NAMES[h('last') % LAST_NAMES.length][0]}.`,
      title: TITLES[h('title') % TITLES.length].replace('{n}', author),
      brag: BRAGS[h('brag') % BRAGS.length],
      tile: TILES[h('tile') % TILES.length],
      colours: [`hsl(${h('hue') % 360} 70% 40%)`, `hsl(${h('hue2') % 360} 80% 50%)`],
      // One page links to the Garlic Browser (spec §14A: the other way in).
      garlic: k === hash(seed, 'homecities:garlic') % 8,
    };
  });
}

/**
 * HomeCities (spec §14.1): amateur traders' home pages with hot picks, mostly wrong and occasionally prophetic. One of
 * them knows where to download the Garlic Browser.
 */
export function HomeCities({ url }: { url: URL }) {
  const seed = useGame((s) => s.seed);
  const directory = useGame((s) => s.directory);
  const darkWeb = useGame((s) => s.settings?.darkWeb ?? true);
  const pages = useMemo(() => homePages(seed), [seed]);
  const week = useGame((s) => (s.snapshot ? Math.floor((dayOf(s.snapshot.time) + 3) / 7) : 0));
  const picks = useFetched(() => simulation().hotPicks(), [week]);
  const page = pages.find((p) => url.pathname === p.path || url.pathname === p.path.slice(0, -1));
  useTitle(page ? page.title : 'HomeCities — Build Your Free Home Page!');
  if (!page) {
    return (
      <SiteFrame
        home={HOMECITIES}
        logo="HomeCities"
        tagline="Free home pages for everyone! 11 MB of space!"
        look={{ head: '#003399', ink: '#ffff66', accent: '#003399', page: '#fff', font: '"Comic Sans MS", "Comic Neue", cursive' }}
        footer={`HomeCities is a Yeehaw! company. © ${gameYear(START_DAY)}. Pages are the work of their authors, who are responsible for them. Mostly.`}
      >
        <h2>Neighbourhood: Money &amp; Investing</h2>
        <ul>
          {pages.map((p) => (
            <li key={p.path}>
              <Link href={p.path}>{p.title}</Link> — {p.author} <small>({p.path})</small>
            </li>
          ))}
        </ul>
      </SiteFrame>
    );
  }
  const k = pages.indexOf(page);
  const mine = (picks ?? []).slice(k * 3, k * 3 + 3);
  return (
    <div className="site-homecities" style={tileStyle(page.tile, page.colours[0], page.colours[1])}>
      <h1 style={{ color: page.colours[0] }}>{page.title}</h1>
      <Marquee>Welcome to my home page!!! You are on the INTERNET!!!</Marquee>
      <p>{page.brag}</p>
      <Rule />
      <h2>🔥 THIS WEEK’S HOT PICKS 🔥</h2>
      <ol>
        {mine.map((p, j) => (
          <li key={j}>
            <Link href={quoteUrl(directory.tickers[p.company])}>{directory.names[p.company]}</Link> ({directory.tickers[p.company]}) —{' '}
            <b className={p.up ? 'up' : 'down'}>{p.up ? 'GOING TO THE MOON' : 'SELL SELL SELL'}</b>
          </li>
        ))}
      </ol>
      {page.garlic && darkWeb && (
        <p>
          Want the REAL information the big boys don’t want you to have? Get the <Link href={`http://${TUCATS}/garlic.html`}>Garlic Browser</Link>. Don’t
          tell anyone where you got it.
        </p>
      )}
      <UnderConstruction />
      <p>
        <Link href={`http://${HOMECITIES}/`}>← Prev</Link> | <b>Stock Pickers Web Ring</b> | <Link href={pages[(k + 1) % pages.length].path}>Next →</Link>
      </p>
      <p>
        Visit my friends: <Link href={`http://${HAMSTERS}/`}>Hamster Prance</Link> · <Link href={`http://${DANCING_BABY}/`}>The Dancing Baby</Link> ·{' '}
        <Link href={`http://${Y2K}/`}>Y2K Countdown</Link>
      </p>
      <HitCounter count={hash(seed, page.path) % 20_000} />
      <BestViewed />
    </div>
  );
}

/** Hamster Prance (spec §14.2): pure flavour. */
export function Hamsters() {
  useTitle('The Hamster Prance');
  return (
    <div className="site-hamsters">
      <h1>~*~ THE HAMSTER PRANCE ~*~</h1>
      <div className="hamster-rows" aria-label="Dancing hamsters">
        {Array.from({ length: 32 }, (_, k) => (
          <svg key={k} className="hamster" viewBox="0 0 40 32" width={40} height={32} style={{ animationDelay: `${(k % 4) * 0.12}s` }}>
            <ellipse cx="20" cy="19" rx="14" ry="11" fill={k % 3 ? '#d9a066' : '#f1e3c8'} />
            <circle cx="10" cy="8" r="4" fill="#e8b98a" />
            <circle cx="30" cy="8" r="4" fill="#e8b98a" />
            <circle cx="15" cy="16" r="2" fill="#000" />
            <circle cx="25" cy="16" r="2" fill="#000" />
            <ellipse cx="20" cy="21" rx="3" ry="2" fill="#f08080" />
          </svg>
        ))}
      </div>
      <p>Dee dee dee, doo doo doo. (Turn your speakers up. Actually, don’t.)</p>
      <HitCounter count={6_000_000} />
    </div>
  );
}

/** The Dancing Baby (spec §14.2): pure flavour, once forwarded to every inbox in America. */
export function DancingBaby() {
  useTitle('The Dancing Baby');
  return (
    <div className="site-baby">
      <h1>The Dancing Baby</h1>
      <svg className="baby" viewBox="0 0 60 100" width={120} height={200} aria-label="A dancing baby">
        <circle cx="30" cy="18" r="13" fill="#f4c7a1" />
        <circle cx="25" cy="16" r="1.6" fill="#000" />
        <circle cx="35" cy="16" r="1.6" fill="#000" />
        <path d="M24 23q6 4 12 0" stroke="#a0522d" fill="none" />
        <rect x="18" y="32" width="24" height="30" rx="10" fill="#f4c7a1" />
        <path d="M18 56h24v10H18z" fill="#fff" />
        <path className="baby-arm-l" d="M18 38L6 30" stroke="#f4c7a1" strokeWidth="6" strokeLinecap="round" />
        <path className="baby-arm-r" d="M42 38L54 46" stroke="#f4c7a1" strokeWidth="6" strokeLinecap="round" />
        <path className="baby-leg-l" d="M24 64L20 90" stroke="#f4c7a1" strokeWidth="7" strokeLinecap="round" />
        <path className="baby-leg-r" d="M36 64L42 90" stroke="#f4c7a1" strokeWidth="7" strokeLinecap="round" />
      </svg>
      <p>Ooga chaka. Forward this page to ten friends or nothing bad will happen.</p>
      <p>
        <Link href={`http://${HAMSTERS}/`}>See also: The Hamster Prance</Link>
      </p>
    </div>
  );
}
