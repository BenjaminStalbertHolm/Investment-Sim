import { useMemo } from 'react';
import { PriceChart } from '../../charts/PriceChart';
import { OPEN, dayOf, formatDate, formatTime, isTradingDay, minuteOf, previousTradingDay } from '../../sim/calendar';
import { INDEX } from '../../sim/types';
import { useGame } from '../../state/game';
import { useTable } from '../hooks';
import { BARRENS, JOTTINGS, NEWSWIRE, companyUrl, quoteUrl, sites } from '../urls';
import { Link, Marquee, useTitle } from '../web';
import { dailyStories, marketStats, weeklyStories, type Story } from './stories';

/** The latest session's stories, and the week's for Barren's. */
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

/** Story text with company mentions as "Name (TICK)", the ticker linked to its QuoteZone quote. */
function Paragraph({ text }: { text: string }) {
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

function Article({ story, related, byline }: { story: Story; related: Story[]; byline: string }) {
  const { directory, firmName } = useGame.getState();
  const s = sites(directory, firmName);
  useTitle(story.headline);
  return (
    <div className="article">
      <h1>{story.headline}</h1>
      <p className="byline">
        {byline} — {formatDate(story.day)}
      </p>
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
      <h3>Related Stories</h3>
      <ul>
        {related
          .filter((r) => r.id !== story.id)
          .map((r) => (
            <li key={r.id}>
              <Link href={`/story?id=${r.id}`}>{r.headline}</Link>
            </li>
          ))}
      </ul>
    </div>
  );
}

function StoryPage({ id, stories, byline }: { id: string | null; stories: Story[]; byline: string }) {
  const story = stories.find((s) => s.id === id);
  useTitle(story ? story.headline : 'Story not found');
  if (!story) {
    return (
      <div className="article">
        <h1>Story Not Available</h1>
        <p>This story has been moved to our archives. Please return to the <Link href="/">front page</Link>.</p>
      </div>
    );
  }
  return <Article story={story} related={stories} byline={byline} />;
}

/** Majorsoft Newswire: terse wire flashes that update as the market moves. */
export function Newswire({ url }: { url: URL }) {
  const { daily, ready } = useStories();
  const time = useGame((s) => s.snapshot?.time ?? 0);
  useTitle('Majorsoft Newswire');
  const story = url.pathname === '/story';
  return (
    <div className="site-newswire">
      <div className="nw-masthead">
        <Link href={`http://${NEWSWIRE}/`}>MAJORSOFT NEWSWIRE</Link>
        <span>{formatDate(dayOf(time))} {formatTime(time)} ET — updates automatically</span>
      </div>
      {story ? (
        <StoryPage id={url.searchParams.get('id')} stories={daily} byline="By Newswire Staff" />
      ) : (
        <ul className="nw-flashes">
          {!ready && <li>Connecting to wire…</li>}
          {daily.map((s) => (
            <li key={s.id}>
              <span className="nw-flash">FLASH</span> <Link href={`/story?id=${s.id}`}>{s.headline.toUpperCase()}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The Wall Street Jottings: a broadsheet front page each morning. */
export function Jottings({ url }: { url: URL }) {
  const { daily, ready } = useStories();
  useTitle('The Wall Street Jottings');
  const [lead, ...rest] = daily;
  return (
    <div className="site-jottings">
      <div className="wsj-masthead">
        <Link href={`http://${JOTTINGS}/`}>THE WALL STREET JOTTINGS</Link>
        <div className="wsj-dateline">
          {lead ? formatDate(lead.day) : ''} · Online Edition · 75¢
        </div>
      </div>
      {url.pathname === '/story' ? (
        <StoryPage id={url.searchParams.get('id')} stories={daily} byline="By a Staff Reporter of THE WALL STREET JOTTINGS" />
      ) : !ready ? (
        <p>Loading today’s edition…</p>
      ) : (
        <div className="wsj-front">
          <div className="wsj-lead">
            <h1>
              <Link href={`/story?id=${lead.id}`}>{lead.headline}</Link>
            </h1>
            {lead.paragraphs.map((text, k) => (
              <Paragraph key={k} text={text} />
            ))}
          </div>
          <div className="wsj-whats-news">
            <h3>What’s News—</h3>
            {rest.map((s) => (
              <p key={s.id}>
                ■ <Link href={`/story?id=${s.id}`}>{s.headline}</Link>
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Barren's Weekly: a glossy weekly with the week's winners, losers and picks. */
export function Barrens({ url }: { url: URL }) {
  const { weekly, ready } = useStories();
  useTitle("Barren's Weekly");
  return (
    <div className="site-barrens">
      <div className="barrens-masthead">
        <Link href={`http://${BARRENS}/`}>BARREN’S</Link>
        <Marquee speed={16}>The Business and Financial Weekly — for people who read the fine print</Marquee>
      </div>
      {url.pathname === '/story' ? (
        <StoryPage id={url.searchParams.get('id')} stories={weekly} byline="By Barren’s Staff" />
      ) : !ready ? (
        <p>Loading this week’s issue…</p>
      ) : !weekly.length ? (
        <p className="barrens-cover">Our first issue of the year goes to press on Friday. See you at the newsstand!</p>
      ) : (
        <div className="barrens-cover">
          <p className="barrens-issue">Week ended {formatDate(weekly[0].day)}</p>
          {weekly.map((s) => (
            <div key={s.id} className="barrens-story">
              <h2>
                <Link href={`/story?id=${s.id}`}>{s.headline}</Link>
              </h2>
              <Paragraph text={s.paragraphs[0]} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
