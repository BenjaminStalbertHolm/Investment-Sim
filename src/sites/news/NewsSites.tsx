import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Portrait } from '../../art/portrait/Portrait';
import { PriceChart } from '../../charts/PriceChart';
import { OPEN, dayOf, formatClock, formatDate, formatTime, gameYear, isTradingDay, minuteOf, previousTradingDay, START_DAY } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { OUTLET, type Outlet } from '../../sim/data/outlets';
import type { NewsQuery } from '../../sim/news';
import type { Journalist } from '../../sim/press';
import { INDEX } from '../../sim/types';
import { useGame } from '../../state/game';
import { decodeCeo } from '../../world/ceo';
import { INDUSTRIES } from '../../world/industries';
import { companyOf, useTable } from '../hooks';
import { companyUrl, quoteUrl, sites } from '../urls';
import { Link, Marquee, usePage, useTitle } from '../web';
import { articlesOf, writeArticle, type Article } from './articles';
import { useJournalists, useNews } from './data';
import { dailyStories, marketStats, weeklyStories, type Story } from './stories';

// ---------- Data ----------

/** The latest session's market stories, and the week's for Barren's (Phase 4: written from the market itself). */
export function useStories(): { daily: Story[]; weekly: Story[]; ready: boolean } {
  const table = useTable();
  const { directory, seed } = useGame.getState();
  const snapshot = useGame((s) => s.snapshot);
  return useMemo(() => {
    if (!table || !snapshot) return { daily: [], weekly: [], ready: false };
    const today = dayOf(snapshot.time);
    const started = isTradingDay(today) && minuteOf(snapshot.time) >= OPEN;
    const session = { day: started ? today : previousTradingDay(today), open: snapshot.phase === 'open', index: snapshot.index };
    const stats = marketStats(table);
    return { daily: dailyStories(table, stats, directory, seed, session), weekly: weeklyStories(table, stats), ready: true };
    // Stories are rewritten when the table refreshes, not on every snapshot.
  }, [table]);
}

const useNow = () => useGame((s) => s.snapshot?.time ?? 0);

/** An outlet's published articles among some news items, newest first. */
export function useOutletArticles(outlet: Outlet, query: NewsQuery | undefined): Article[] | undefined {
  const items = useNews(query);
  const journalists = useJournalists();
  const directory = useGame((s) => s.directory);
  const now = useNow();
  const minute = Math.floor(now / 5);
  return useMemo(
    () =>
      items
        ?.flatMap((item) => articlesOf(item, directory, journalists).filter((a) => a.outlet.id === outlet.id && a.time <= now))
        .sort((a, b) => b.time - a.time || b.item.id - a.item.id),
    [items, journalists, minute, outlet.id],
  );
}

/** How far back each kind of outlet looks for its front page. */
function frontQuery(outlet: Outlet, now: number): NewsQuery {
  const industry = outlet.industry ? INDUSTRIES.findIndex((i) => i.id === outlet.industry) : undefined;
  if (industry !== undefined) return { industry, limit: 120 };
  if (outlet.cadence === 'weekly') return { from: now - 16 * 1440, limit: 4000, minCap: 2e9 };
  if (outlet.id === 'motleyfowl') return { limit: 1500, from: now - 5 * 1440 };
  return { limit: outlet.cadence === 'morning' ? 1200 : 400, from: now - 5 * 1440 };
}

// ---------- Shared pieces ----------

/** Story text with company mentions as "Name (TICK)", the ticker linked to its QuoteZone quote. */
export function Paragraph({ text }: { text: string }) {
  const { names, tickers } = useGame.getState().directory;
  const parts = text.split(/\{c:(\d+)\}/);
  return (
    <p>
      {parts.map((part, k) =>
        k % 2 ? (
          <span key={k}>
            {names[Number(part)]} (<Link href={quoteUrl(tickers[Number(part)])}>{tickers[Number(part)]}</Link>)
          </span>
        ) : (
          part
        ),
      )}
    </p>
  );
}

const storyUrl = (a: Article) => `/story?id=${a.id}`;

/** A writer's photo; the Jottings draws its writers as hatched ink sketches (spec §14.1). */
function Mugshot({ j, size = 48 }: { j: Journalist; size?: number }) {
  return (
    <span className={`mugshot ${j.outlet === 'jottings' ? 'stipple' : ''}`}>
      <Portrait ceo={decodeCeo(j.face)} size={size} title={`Photo of ${j.name}`} />
    </span>
  );
}

function SearchBox({ label = 'Search our archive' }: { label?: string }) {
  const page = usePage();
  const [q, setQ] = useState('');
  return (
    <form
      className="news-search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) page.navigate(new URL(`/search?q=${encodeURIComponent(q.trim())}`, page.url).href);
      }}
    >
      <label>
        {label}: <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ticker, company, writer or date" />
      </label>{' '}
      <button type="submit">Search</button>
    </form>
  );
}

function StaffBox({ outlet }: { outlet: Outlet }) {
  const writers = useJournalists().filter((j) => j.outlet === outlet.id);
  if (!writers.length) return null;
  return (
    <div className="news-staff">
      <h4>Our Writers</h4>
      {writers.map((j) => (
        <div key={j.id} className="news-staff-row">
          <Mugshot j={j} size={28} />
          <span>
            <Link href={`/staff?id=${j.id}`}>{j.name}</Link>
            <br />
            <small>{j.beat}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function Headlines({ articles, empty, max = 20, time }: { articles: Article[] | undefined; empty: string; max?: number; time?: boolean }) {
  const { directory, firmName, seed } = useGame.getState();
  if (!articles) return <p>Loading…</p>;
  if (!articles.length) return <p>{empty}</p>;
  return (
    <ul className="news-list">
      {articles.slice(0, max).map((a) => (
        <li key={a.id}>
          {time && <span className="news-time">{formatDate(dayOf(a.time))} {formatTime(a.time)} </span>}
          <Link href={storyUrl(a)}>{writeArticle(a.item, a.outlet.id, directory, firmName, seed, [], true).headline}</Link>
        </li>
      ))}
    </ul>
  );
}

// ---------- Pages ----------

function ArticlePage({ article, datelineDefault = 'NEW YORK' }: { article: Article; datelineDefault?: string }) {
  const { directory, firmName, seed } = useGame.getState();
  const journalists = useJournalists();
  const w = useMemo(
    () => writeArticle(article.item, article.outlet.id, directory, firmName, seed, journalists),
    [article.id, journalists],
  );
  useTitle(w.headline);
  const item = article.item;
  const subject = item.company >= 0 ? item.company : INDEX;
  const s = sites(directory, firmName);
  const writer = article.journalist && journalists.find((j) => j.id === article.journalist!.id);
  const dateline =
    article.outlet.id === 'ftimez' ? 'LONDON' : item.company >= 0 ? companyOf(directory.genomes[item.company]).hq.name.toUpperCase() : datelineDefault;
  return (
    <div className="article">
      <h1>{w.headline}</h1>
      <p className="byline">
        {writer ? (
          <>
            <Mugshot j={writer} size={32} /> By <Link href={`/staff?id=${writer.id}`}>{writer.name}</Link>, {writer.beat}
          </>
        ) : (
          w.byline
        )}{' '}
        — {formatClock(article.time)}
      </p>
      <div className="article-chart">
        <PriceChart id={subject} timeframe="1M" type="line" skin="web" />
        <small>{item.company >= 0 ? directory.names[item.company] : 'MAJOR 500'}, last month</small>
      </div>
      {w.paragraphs.map((text, k) => (
        <Paragraph key={k} text={k ? text : `${dateline} — ${text}`} />
      ))}
      {item.company >= 0 && (
        <p>
          <Link href={companyUrl(s, item.company)}>Visit the company’s web site</Link> ·{' '}
          <Link href={`/search?q=${directory.tickers[item.company]}`}>More on {directory.tickers[item.company]}</Link>
        </p>
      )}
      <p>
        <Link href="/">Back to the front page</Link>
      </p>
    </div>
  );
}

function NotAvailable() {
  useTitle('Story not found');
  return (
    <div className="article">
      <h1>Story Not Available</h1>
      <p>This story is not available. It may not have been published yet, or it may have been moved. Please return to the <Link href="/">front page</Link>.</p>
    </div>
  );
}

/** /story?id=… : an archived article ("<news id>-<outlet>") or one of the latest session's market stories. */
function StoryRoute({ outlet, id, market }: { outlet: Outlet; id: string; market?: Story[] }) {
  const n = /^(\d+)-/.exec(id);
  const items = useNews(n ? { ids: [Number(n[1])] } : undefined);
  const journalists = useJournalists();
  const directory = useGame((s) => s.directory);
  const now = useNow();
  if (!n) {
    const story = market?.find((s) => s.id === id);
    return story ? <MarketStory story={story} /> : <NotAvailable />;
  }
  if (!items) return <p>Loading story…</p>;
  const article = items[0] && articlesOf(items[0], directory, journalists).find((a) => a.outlet.id === outlet.id);
  return article && article.time <= now ? <ArticlePage article={article} /> : <NotAvailable />;
}

/** A Phase 4 market story (the session wrap, movers, sectors, the week). */
function MarketStory({ story }: { story: Story }) {
  useTitle(story.headline);
  const { directory, firmName } = useGame.getState();
  const s = sites(directory, firmName);
  return (
    <div className="article">
      <h1>{story.headline}</h1>
      <p className="byline">By the Markets Desk — {formatDate(story.day)}</p>
      <div className="article-chart">
        <PriceChart id={story.subject >= 0 ? story.subject : INDEX} timeframe="5D" type="line" skin="web" />
        <small>{story.subject >= 0 ? directory.names[story.subject] : 'MAJOR 500'}, last five sessions</small>
      </div>
      {story.paragraphs.map((text, k) => (
        <Paragraph key={k} text={k ? text : `NEW YORK — ${text}`} />
      ))}
      {story.subject >= 0 && (
        <p>
          <Link href={companyUrl(s, story.subject)}>Visit the company’s web site</Link>
        </p>
      )}
    </div>
  );
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "05 Jan 1998" (in the game's years) → a day, or undefined. */
function parseDate(q: string): number | undefined {
  const m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})$/i.exec(q.trim());
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0) return undefined;
  const shift = gameYear(START_DAY) - 1998;
  return Date.UTC(Number(m[3]) - shift, month, Number(m[1])) / 86_400_000;
}

/** /search?q=… (spec §14.1): the archive by ticker or company, firm, writer, date, or words in the headline. */
function SearchPage({ outlet, q }: { outlet: Outlet; q: string }) {
  const { directory, firmName, seed } = useGame.getState();
  const journalists = useJournalists();
  const lower = q.toLowerCase();
  const ticker = directory.tickers.indexOf(q.toUpperCase());
  const company = ticker >= 0 ? ticker : lower.length >= 3 ? directory.names.findIndex((n) => n.toLowerCase().includes(lower)) : -1;
  const firm = company < 0 && lower.length >= 3 ? directory.firms.findIndex((f) => f.name.toLowerCase().includes(lower)) : -1;
  const writer = lower.length >= 3 ? journalists.find((j) => j.outlet === outlet.id && j.name.toLowerCase().includes(lower)) : undefined;
  const day = parseDate(q);
  const query: NewsQuery =
    company >= 0 ? { company, limit: 300 } : firm >= 0 ? { firm, limit: 300 } : day !== undefined ? { from: day * 1440, to: (day + 1) * 1440, limit: 2000 } : { limit: 1500 };
  let found = useOutletArticles(outlet, query);
  if (found && writer) found = found.filter((a) => a.journalist?.id === writer.id);
  else if (found && company < 0 && firm < 0 && day === undefined) {
    found = found.filter((a) => writeArticle(a.item, outlet.id, directory, firmName, seed, [], true).headline.toLowerCase().includes(lower));
  }
  useTitle(`Search: ${q}`);
  const what = company >= 0 ? directory.names[company] : firm >= 0 ? directory.firms[firm].name : writer ? writer.name : day !== undefined ? formatDate(day) : `“${q}”`;
  return (
    <div className="news-search-page">
      <h2>Archive search: {what}</h2>
      <SearchBox label="Search again" />
      <Headlines articles={found} empty="No stories found. Try a ticker (MVDA), a company, one of our writers or a date (05 Jan 1998)." max={60} time />
    </div>
  );
}

/** /staff?id=… : a writer's page, with their recent stories. */
function StaffPage({ outlet, id }: { outlet: Outlet; id: number }) {
  const staff = useJournalists();
  const j = staff.find((x) => x.id === id && x.outlet === outlet.id);
  const now = useNow();
  const articles = useOutletArticles(outlet, { limit: 1500, from: now - 30 * 1440 });
  useTitle(j ? j.name : 'Staff');
  if (!j) return <p className="news-search-page">{staff.length ? 'We have no writer by that name. ' : 'Loading…'}</p>;
  const mine = articles?.filter((a) => a.journalist?.id === j.id);
  return (
    <div className="news-staff-page">
      <Mugshot j={j} size={120} />
      <div>
        <h2>{j.name}</h2>
        <p>
          {outlet.name} · {j.beat}
        </p>
        <h3>Recent stories</h3>
        <Headlines articles={mine} empty="Nothing this month." time />
      </div>
    </div>
  );
}

// ---------- Outlets ----------

/** The routes every outlet has: front page, story, archive search, and writers' pages. */
function OutletSite({ url, outlet, className, masthead, front, market }: {
  url: URL;
  outlet: Outlet;
  className: string;
  masthead: ReactNode;
  front: ReactNode;
  market?: Story[];
}) {
  const path = url.pathname;
  let body = front;
  if (path === '/story') body = <StoryRoute outlet={outlet} id={url.searchParams.get('id') ?? ''} market={market} />;
  else if (path === '/search') body = <SearchPage outlet={outlet} q={url.searchParams.get('q') ?? ''} />;
  else if (path === '/staff') body = <StaffPage outlet={outlet} id={Number(url.searchParams.get('id'))} />;
  return (
    <div className={`news-site ${className}`}>
      {masthead}
      {body}
    </div>
  );
}

const home = (outlet: Outlet) => `http://${outlet.host}/`;

/** Majorsoft Newswire: terse wire flashes that update as the news breaks. */
export function Newswire({ url }: { url: URL }) {
  const outlet = OUTLET.newswire;
  const { daily } = useStories();
  const now = useNow();
  const articles = useOutletArticles(outlet, { limit: 60 });
  useTitle(outlet.name);
  const { directory, firmName, seed } = useGame.getState();
  return (
    <OutletSite
      url={url}
      outlet={outlet}
      className="site-newswire"
      market={daily}
      masthead={
        <div className="nw-masthead">
          <Link href={home(outlet)}>MAJORSOFT NEWSWIRE</Link>
          <span>{formatDate(dayOf(now))} {formatTime(now)} ET — updates automatically</span>
        </div>
      }
      front={
        <>
          <SearchBox />
          <ul className="nw-flashes">
            {daily.slice(0, 3).map((s) => (
              <li key={s.id}>
                <span className="nw-flash">MARKETS</span> <Link href={`/story?id=${s.id}`}>{s.headline.toUpperCase()}</Link>
              </li>
            ))}
            {!articles && <li>Connecting to wire…</li>}
            {articles?.slice(0, 50).map((a) => (
              <li key={a.id}>
                <span className="nw-time">{formatTime(a.time)}</span> <span className="nw-flash">FLASH</span>{' '}
                <Link href={storyUrl(a)}>{writeArticle(a.item, outlet.id, directory, firmName, seed, [], true).headline.toUpperCase()}</Link>
              </li>
            ))}
          </ul>
          <StaffBox outlet={outlet} />
        </>
      }
    />
  );
}

/** A broadsheet's front page: the lead story in columns, and What's News down the side. */
function Broadsheet({ url, outlet, className, title, market }: { url: URL; outlet: Outlet; className: string; title: string; market?: Story[] }) {
  const now = useNow();
  const articles = useOutletArticles(outlet, frontQuery(outlet, now));
  const { directory, firmName, seed } = useGame.getState();
  const journalists = useJournalists();
  useTitle(outlet.name);
  const today = articles?.filter((a) => dayOf(a.time) === dayOf(articles[0]?.time ?? 0)) ?? [];
  const lead = today[0];
  const written = lead && writeArticle(lead.item, outlet.id, directory, firmName, seed, journalists);
  const marketLead = market?.[0];
  return (
    <OutletSite
      url={url}
      outlet={outlet}
      className={className}
      market={market}
      masthead={
        <div className="wsj-masthead">
          <Link href={home(outlet)}>{title}</Link>
          <div className="wsj-dateline">{formatDate(dayOf(now))} · Online Edition · 75¢</div>
        </div>
      }
      front={
        !articles ? (
          <p>Loading today’s edition…</p>
        ) : (
          <>
            <div className="wsj-front">
              <div className="wsj-lead">
                {marketLead && outlet.id === 'jottings' ? (
                  <>
                    <h1>
                      <Link href={`/story?id=${marketLead.id}`}>{marketLead.headline}</Link>
                    </h1>
                    {marketLead.paragraphs.map((t, k) => (
                      <Paragraph key={k} text={t} />
                    ))}
                  </>
                ) : written ? (
                  <>
                    <h1>
                      <Link href={storyUrl(lead)}>{written.headline}</Link>
                    </h1>
                    <p className="byline">{written.byline}</p>
                    {written.paragraphs.slice(0, 3).map((t, k) => (
                      <Paragraph key={k} text={t} />
                    ))}
                  </>
                ) : (
                  <p>Our first edition goes to press tomorrow morning.</p>
                )}
              </div>
              <div className="wsj-whats-news">
                <h3>What’s News—</h3>
                {market?.slice(outlet.id === 'jottings' ? 1 : 0).map((s) => (
                  <p key={s.id}>
                    ■ <Link href={`/story?id=${s.id}`}>{s.headline}</Link>
                  </p>
                ))}
                {(outlet.id === 'jottings' ? articles : articles.slice(1)).slice(0, 14).map((a) => (
                  <p key={a.id}>
                    ■ <Link href={storyUrl(a)}>{writeArticle(a.item, outlet.id, directory, firmName, seed, [], true).headline}</Link>
                  </p>
                ))}
              </div>
            </div>
            <SearchBox />
            <StaffBox outlet={outlet} />
          </>
        )
      }
    />
  );
}

/** The Wall Street Jottings: the daily markets paper, front page each morning. */
export const Jottings = ({ url }: { url: URL }) => {
  const { daily } = useStories();
  return <Broadsheet url={url} outlet={OUTLET.jottings} className="site-jottings" title="THE WALL STREET JOTTINGS" market={daily} />;
};

/** The New York Journal: investigations and exposés, broadsheet grey. */
export const NyJournal = ({ url }: { url: URL }) => (
  <Broadsheet url={url} outlet={OUTLET.nyjournal} className="site-jottings site-nyjournal" title="The New York Journal" />
);

/** Financial Timez: salmon pink, global, commodities and rates. */
export const FinancialTimez = ({ url }: { url: URL }) => (
  <Broadsheet url={url} outlet={OUTLET.ftimez} className="site-jottings site-ftimez" title="FINANCIAL TIMEZ" />
);

/** A magazine cover: Barren's Weekly and Wyred. */
function Magazine({ url, outlet, className, title, tagline, market }: { url: URL; outlet: Outlet; className: string; title: string; tagline: string; market?: Story[] }) {
  const now = useNow();
  const articles = useOutletArticles(outlet, frontQuery(outlet, now));
  const { directory, firmName, seed } = useGame.getState();
  const journalists = useJournalists();
  useTitle(outlet.name);
  const issue = articles?.[0] ? dayOf(articles[0].time) : undefined;
  const cover = articles?.filter((a) => outlet.cadence !== 'weekly' || dayOf(a.time) === issue).slice(0, 12) ?? [];
  return (
    <OutletSite
      url={url}
      outlet={outlet}
      className={className}
      market={market}
      masthead={
        <div className="barrens-masthead">
          <Link href={home(outlet)}>{title}</Link>
          <Marquee speed={16}>{tagline}</Marquee>
        </div>
      }
      front={
        <div className="barrens-cover">
          {issue !== undefined && outlet.cadence === 'weekly' && <p className="barrens-issue">Issue of {formatDate(issue)}</p>}
          {market?.map((s) => (
            <div key={s.id} className="barrens-story">
              <h2>
                <Link href={`/story?id=${s.id}`}>{s.headline}</Link>
              </h2>
              <Paragraph text={s.paragraphs[0]} />
            </div>
          ))}
          {cover.map((a) => {
            const w = writeArticle(a.item, outlet.id, directory, firmName, seed, journalists);
            return (
              <div key={a.id} className="barrens-story">
                <h2>
                  <Link href={storyUrl(a)}>{w.headline}</Link>
                </h2>
                <Paragraph text={w.paragraphs[0]} />
              </div>
            );
          })}
          {articles && !cover.length && !market?.length && <p>Our next issue is at the printers. See you at the newsstand!</p>}
          <SearchBox />
          <StaffBox outlet={outlet} />
        </div>
      }
    />
  );
}

/** Barren's Weekly: weekly picks and the week's big stories. */
export const Barrens = ({ url }: { url: URL }) => {
  const { weekly } = useStories();
  return (
    <Magazine
      url={url}
      outlet={OUTLET.barrens}
      className="site-barrens"
      title="BARREN’S"
      tagline="The Business and Financial Weekly — for people who read the fine print"
      market={weekly}
    />
  );
};

/** Wyred: the neon tech magazine. */
export const Wyred = ({ url }: { url: URL }) => (
  <Magazine url={url} outlet={OUTLET.wyred} className="site-barrens site-wyred" title="WYRED" tagline=">>> the future is ONLINE. the future is NOW. >>>" />
);

/** MoneyTV Online: a fake video player with a talking head and a scrolling lower third. */
export function MoneyTv({ url }: { url: URL }) {
  const outlet = OUTLET.moneytv;
  const now = useNow();
  const articles = useOutletArticles(outlet, frontQuery(outlet, now));
  const anchor = useJournalists().find((j) => j.outlet === outlet.id);
  const { directory, firmName, seed } = useGame.getState();
  useTitle(outlet.name);
  const heads = (articles ?? []).slice(0, 8).map((a) => writeArticle(a.item, outlet.id, directory, firmName, seed, [], true).headline);
  const pick = articles?.find((a) => a.item.kind === 'tvPick');
  return (
    <OutletSite
      url={url}
      outlet={outlet}
      className="site-moneytv"
      masthead={
        <div className="tv-masthead">
          <Link href={home(outlet)}>MoneyTV ONLINE</Link> <span className="tv-live">● LIVE</span>
        </div>
      }
      front={
        <>
          <div className="tv-player">
            <div className="tv-screen">
              {anchor && <Mugshot j={anchor} size={150} />}
              <div className="tv-lower-third">
                <b>{anchor?.name ?? 'MoneyTV'}</b>
                <Marquee speed={30}>{heads.join('  ✦  ') || 'Markets are open — stay tuned!'}</Marquee>
              </div>
            </div>
            <div className="tv-controls">
              ▶ ❚❚ ■ <span>{formatTime(now)} / LIVE</span> <span>RealPlayer-ish 5.0 · 28.8k stream</span>
            </div>
          </div>
          {pick && (
            <div className="tv-pick">
              <b>★ STOCK OF THE DAY ★</b> <Link href={storyUrl(pick)}>{directory.names[pick.item.company]}</Link>
            </div>
          )}
          <Headlines articles={articles} empty="No stories yet — stay tuned!" time />
          <SearchBox />
          <StaffBox outlet={outlet} />
        </>
      }
    />
  );
}

/** The Daily Scoop: red tabloid, ALL CAPS. */
export function DailyScoop({ url }: { url: URL }) {
  const outlet = OUTLET.dailyscoop;
  const now = useNow();
  const articles = useOutletArticles(outlet, frontQuery(outlet, now));
  const { directory, firmName, seed } = useGame.getState();
  useTitle(outlet.name);
  const [top, ...rest] = articles ?? [];
  return (
    <OutletSite
      url={url}
      outlet={outlet}
      className="site-scoop"
      masthead={
        <div className="scoop-masthead">
          <Link href={home(outlet)}>THE DAILY SCOOP</Link>
          <span>ALL THE DIRT ON WALL STREET</span>
        </div>
      }
      front={
        <>
          {top ? (
            <h1 className="scoop-splash">
              <Link href={storyUrl(top)}>{writeArticle(top.item, outlet.id, directory, firmName, seed, [], true).headline}</Link>
            </h1>
          ) : (
            <p>NO SCANDALS TODAY. SUSPICIOUS, ISN’T IT?</p>
          )}
          <Headlines articles={rest} empty="" />
          <SearchBox label="DIG THROUGH THE DIRT" />
          <StaffBox outlet={outlet} />
        </>
      }
    />
  );
}

/** The Motley Fowl: jester-themed advice for retail investors. */
export function MotleyFowl({ url }: { url: URL }) {
  const outlet = OUTLET.motleyfowl;
  const now = useNow();
  const articles = useOutletArticles(outlet, frontQuery(outlet, now));
  const { directory } = useGame.getState();
  useTitle(outlet.name);
  const pick = articles?.find((a) => a.item.kind === 'fowlPick');
  return (
    <OutletSite
      url={url}
      outlet={outlet}
      className="site-fowl"
      masthead={
        <div className="fowl-masthead">
          <Link href={home(outlet)}>The Motley Fowl</Link>
          <span>To educate, amuse and enrich — mostly amuse</span>
        </div>
      }
      front={
        <>
          {pick && (
            <div className="fowl-pick">
              Today’s Foolish Pick: <Link href={storyUrl(pick)}>{directory.names[pick.item.company]}</Link>
            </div>
          )}
          <Headlines articles={articles} empty="The Fowls are thinking. Check back tomorrow." time />
          <SearchBox />
          <StaffBox outlet={outlet} />
        </>
      }
    />
  );
}

/** A trade paper (spec §14.1): its industry's news, and the rumours it hears first. */
export function TradePress({ url, outlet }: { url: URL; outlet: Outlet }) {
  const now = useNow();
  const articles = useOutletArticles(outlet, frontQuery(outlet, now));
  const industry = INDUSTRIES.findIndex((i) => i.id === outlet.industry);
  const directory = useGame((s) => s.directory);
  const [rumours, setRumours] = useState<{ time: number; company: number; direction: 1 | -1 }[]>([]);
  const count = useGame((s) => s.snapshot?.news ?? 0);
  useEffect(() => {
    let current = true;
    void simulation()
      .rumours(undefined, 400)
      .then((r) => {
        if (!current) return;
        const industryName = INDUSTRIES[industry].name;
        setRumours(r.filter((x) => x.where === 'trade' && directory.industries[x.company] === industryName).slice(0, 6));
      });
    return () => {
      current = false;
    };
  }, [count, industry]);
  useTitle(outlet.name);
  const hue = (industry * 47) % 360;
  return (
    <OutletSite
      url={url}
      outlet={outlet}
      className="site-trade"
      masthead={
        <div className="trade-masthead" style={{ background: `hsl(${hue} 45% 28%)` }}>
          <Link href={home(outlet)}>{outlet.name}</Link>
          <span>The newspaper of the {INDUSTRIES[industry].name.toLowerCase()} industry</span>
        </div>
      }
      front={
        <>
          <div className="trade-rumours">
            <h3>Industry Grapevine</h3>
            {rumours.length ? (
              <ul>
                {rumours.map((r, k) => (
                  <li key={k}>
                    {formatDate(dayOf(r.time))}: sources say {directory.names[r.company]} (
                    <Link href={quoteUrl(directory.tickers[r.company])}>{directory.tickers[r.company]}</Link>){' '}
                    {r.direction > 0 ? 'has good news coming' : 'is in trouble'}.
                  </li>
                ))}
              </ul>
            ) : (
              <p>Quiet on the grapevine.</p>
            )}
          </div>
          <h3>Industry News</h3>
          <Headlines articles={articles} empty="No news from the industry yet." time />
          <SearchBox />
          <StaffBox outlet={outlet} />
        </>
      }
    />
  );
}
