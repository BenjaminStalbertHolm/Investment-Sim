import { useMemo, useState } from 'react';
import { Icon } from '../../art/icons';
import { DIFFICULTIES } from '../../sim/settings';
import { SECTIONS, TOPIC, TOPICS, ask, type Topic } from '../../sites/help/topics';
import { REEVES, helpUrl } from '../../sites/urls';
import { PageContext, type Page } from '../../sites/web';
import { openUrl, useGame } from '../../state/game';
import { useWindows } from '../../state/windows';
import { Tabs } from '../../ui98/Tabs';
import { AppMenuBar } from '../AppMenuBar';
import type { AppProps } from '../types';
import '../../sites/web.css';
import './help.css';

type Pane = 'contents' | 'index' | 'search';
const PANES = [['contents', 'Contents'], ['index', 'Index'], ['search', 'Search']] as const;

/** The first page: what a 90s help file said before you chose anything. */
const HOME = 'welcome';

/** Every question the guides answer, alphabetically, each pointing at its guide: the Index tab. */
export const INDEX_ENTRIES: { text: string; topic: string }[] = TOPICS.flatMap((t) => [
  { text: t.title, topic: t.id },
  ...t.questions.map((q) => ({ text: q, topic: t.id })),
]).sort((a, b) => a.text.localeCompare(b.text));

/**
 * Doors Help (spec §4 Start → Help; "the in-game manual, a 90s help file styled window"): Contents, Index and Search on the
 * left, the guide on the right. The guides are Ask Reeves's, the same text and the same numbers from the game in progress;
 * a link to another guide stays in this window and a link out to the web opens Internet Exploiter.
 */
export default function Help({ windowId }: AppProps) {
  const topicId = useWindows((s) => s.windows.find((w) => w.id === windowId)?.params?.topic) ?? HOME;
  const settings = useGame((s) => s.settings) ?? DIFFICULTIES.medium;
  const [pane, setPane] = useState<Pane>('contents');
  const [back, setBack] = useState<string[]>([]);
  const [forward, setForward] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [hidden, setHidden] = useState(false);
  const topic = TOPIC[topicId] ?? TOPIC[HOME];

  const show = (id: string, move: 'go' | 'back' | 'forward' = 'go') => {
    if (!TOPIC[id] || id === topic.id) return;
    if (move === 'go') {
      setBack((b) => [...b, topic.id]);
      setForward([]);
    }
    useWindows.getState().setParams(windowId, { topic: id });
  };
  const goBack = () => {
    const id = back[back.length - 1];
    if (!id) return;
    setBack(back.slice(0, -1));
    setForward([topic.id, ...forward]);
    useWindows.getState().setParams(windowId, { topic: id });
  };
  const goForward = () => {
    const id = forward[0];
    if (!id) return;
    setForward(forward.slice(1));
    setBack([...back, topic.id]);
    useWindows.getState().setParams(windowId, { topic: id });
  };

  // Links inside a guide are the web's links: guides stay here; a question goes to the Search tab; anything else is a page.
  const page = useMemo<Page>(
    () => ({
      url: new URL(helpUrl(topic.id)),
      navigate: (href) => {
        const url = new URL(href);
        if (url.hostname === REEVES && url.pathname === '/guide') show(url.searchParams.get('t') ?? HOME);
        else if (url.hostname === REEVES && url.pathname === '/ask') {
          setQuery(url.searchParams.get('q') ?? '');
          setPane('search');
        } else openUrl(href);
      },
      status: () => undefined,
      setTitle: () => undefined,
    }),
    // `show` reads the current topic; it is rebuilt with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topic.id, back, forward],
  );

  const section = SECTIONS.find((s) => s.id === topic.section);
  const siblings = TOPICS.filter((t) => t.section === topic.section);

  return (
    <div className="app help-app">
      <AppMenuBar
        windowId={windowId}
        menus={[
          {
            label: 'Options',
            items: [
              { label: 'Back', onClick: goBack, disabled: !back.length },
              { label: 'Forward', onClick: goForward, disabled: !forward.length },
              { label: hidden ? 'Show Navigation' : 'Hide Navigation', onClick: () => setHidden(!hidden) },
              { label: 'Ask Reeves…', onClick: () => openUrl(helpUrl()) },
            ],
          },
        ]}
      />
      <div className="toolbar">
        <button onClick={() => setHidden(!hidden)}>{hidden ? 'Show' : 'Hide'}</button>
        <button onClick={goBack} disabled={!back.length}>
          Back
        </button>
        <button onClick={goForward} disabled={!forward.length}>
          Forward
        </button>
        <button onClick={() => show(HOME)}>Home</button>
        <button onClick={() => openUrl(helpUrl())}>Ask Reeves…</button>
      </div>
      <div className="help-body">
        {!hidden && (
          <div className="help-nav">
            <Tabs<Pane> tabs={PANES} value={pane} onChange={setPane} />
            <div className="window help-nav-panel" role="tabpanel">
              {pane === 'contents' && <Contents current={topic.id} onOpen={show} />}
              {pane === 'index' && <IndexPane onOpen={show} />}
              {pane === 'search' && <Search query={query} setQuery={setQuery} onOpen={show} />}
            </div>
          </div>
        )}
        <PageContext.Provider value={page}>
          <div className="help-topic web-page site-reeves" key={topic.id}>
            <p className="reeves-crumbs">
              {section?.title}
            </p>
            <h1>{topic.title}</h1>
            {topic.body({ settings })}
            <div className="reeves-related">
              <b>Questions this topic answers</b>
              <ul>
                {topic.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
              <p>
                {siblings.indexOf(topic) > 0 && (
                  <a role="link" tabIndex={0} onClick={() => show(siblings[siblings.indexOf(topic) - 1].id)}>
                    « {siblings[siblings.indexOf(topic) - 1].title}
                  </a>
                )}
                {siblings.indexOf(topic) > 0 && siblings.indexOf(topic) < siblings.length - 1 && ' | '}
                {siblings.indexOf(topic) < siblings.length - 1 && (
                  <a role="link" tabIndex={0} onClick={() => show(siblings[siblings.indexOf(topic) + 1].id)}>
                    {siblings[siblings.indexOf(topic) + 1].title} »
                  </a>
                )}
              </p>
            </div>
          </div>
        </PageContext.Provider>
      </div>
    </div>
  );
}

function Contents({ current, onOpen }: { current: string; onOpen(id: string): void }) {
  return (
    <ul className="tree-view help-contents">
      {SECTIONS.map((s) => (
        <li key={s.id}>
          <details open={TOPIC[current]?.section === s.id || s.id === 'start'}>
            <summary>
              <Icon name="documents" size={16} /> {s.title}
            </summary>
            <ul>
              {TOPICS.filter((t) => t.section === s.id).map((t: Topic) => (
                <li key={t.id}>
                  <a role="link" tabIndex={0} className={t.id === current ? 'current' : ''} onClick={() => onOpen(t.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(t.id)}>
                    <Icon name="help" size={16} /> {t.title}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}

function IndexPane({ onOpen }: { onOpen(id: string): void }) {
  const [filter, setFilter] = useState('');
  const shown = INDEX_ENTRIES.filter((e) => e.text.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <div className="help-list">
      <label>
        Type the word you’re looking for
        <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </label>
      <ul className="help-results sunken-panel">
        {shown.map((e, k) => (
          <li key={k}>
            <a role="link" tabIndex={0} onClick={() => onOpen(e.topic)} onKeyDown={(ev) => ev.key === 'Enter' && onOpen(e.topic)}>
              {e.text}
            </a>
          </li>
        ))}
        {!shown.length && <li className="hint">No entries.</li>}
      </ul>
    </div>
  );
}

function Search({ query, setQuery, onOpen }: { query: string; setQuery(q: string): void; onOpen(id: string): void }) {
  const [asked, setAsked] = useState(query);
  const results = useMemo(() => ask(asked), [asked]);
  return (
    <div className="help-list">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setAsked(query);
        }}
      >
        <label>
          Type a question
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="How do I short a stock?" />
        </label>{' '}
        <button type="submit">List Topics</button>
      </form>
      <ul className="help-results sunken-panel">
        {results.map((t) => (
          <li key={t.id}>
            <a role="link" tabIndex={0} onClick={() => onOpen(t.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(t.id)}>
              {t.title}
            </a>
          </li>
        ))}
        {asked.trim() && !results.length && <li className="hint">Nothing found. Try Ask Reeves.</li>}
      </ul>
    </div>
  );
}
