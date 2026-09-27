import { useState } from 'react';
import { START_DAY, gameYear } from '../../sim/calendar';
import { DIFFICULTIES } from '../../sim/settings';
import { useGame } from '../../state/game';
import { REEVES, helpUrl } from '../urls';
import { Link, usePage, useTitle } from '../web';
import { Butler } from './parts';
import { SECTIONS, TOPIC, TOPICS, ask, type HelpContext, type Topic } from './topics';

const askUrl = (q: string) => `http://${REEVES}/ask?q=${encodeURIComponent(q)}`;

/** What people ask most: the front page's shortcuts. */
const POPULAR = ['welcome', 'buying', 'margin', 'shorting', 'futures', 'trading-futures', 'expiry', 'loans', 'repaying', 'clients'];

/**
 * Ask Reeves (spec §14.2): a butler who answers questions, and the game's help. Type a question, or browse the guides:
 * how the market works, how to buy, margin and short selling, futures step by step, loans, clients and bankruptcy. The
 * guides quote the rules the game actually plays by, and the settings of the game in progress.
 */
export default function AskReeves({ url }: { url: URL }) {
  const settings = useGame((s) => s.settings) ?? DIFFICULTIES.medium;
  const ctx: HelpContext = { settings };
  const page = url.pathname.replace(/^\//, '');
  const question = url.searchParams.get('q') ?? '';
  return (
    <div className="site-reeves">
      <div className="reeves-header">
        <Link href={`http://${REEVES}/`} className="reeves-home">
          <Butler size={56} />
        </Link>
        <div>
          <Link href={`http://${REEVES}/`} className="reeves-logo">
            Ask Reeves
          </Link>
          <div className="reeves-tagline">Have a question? Just ask. Reeves knows about money, markets and everything in between.</div>
          <QuestionBox initial={page === 'ask' ? question : ''} />
        </div>
      </div>
      <div className="reeves-body">
        {page === 'guide' ? (
          <Guide topic={TOPIC[url.searchParams.get('t') ?? '']} ctx={ctx} />
        ) : page === 'ask' ? (
          <Answers question={question} />
        ) : (
          <Front />
        )}
      </div>
      <p className="reeves-footer">
        Ask Reeves © {gameYear(START_DAY)}. Reeves is a butler, not a financial adviser. <Link href={`http://${REEVES}/`}>All guides</Link>
      </p>
    </div>
  );
}

function QuestionBox({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const { navigate } = usePage();
  return (
    <form
      className="reeves-ask"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) navigate(askUrl(text.trim()));
      }}
    >
      <input type="text" size={44} value={text} placeholder="How do I short a stock?" aria-label="Your question" onChange={(e) => setText(e.target.value)} />{' '}
      <button type="submit">Ask!</button>
    </form>
  );
}

function Front() {
  useTitle('Ask Reeves');
  return (
    <>
      <div className="reeves-welcome">
        <p>
          <b>Good day.</b> Reeves at your service. Type a question in the box above — “How do I buy a stock?”, “What is a
          margin call?”, “Why is there oil in my lobby?” — or choose from the guides below. Reeves has taken the liberty of
          putting the most asked questions first.
        </p>
      </div>
      <h2>People often ask</h2>
      <ul className="reeves-popular">
        {POPULAR.map((id) => (
          <li key={id}>
            <Link href={helpUrl(id)}>{TOPIC[id].questions[0]}</Link>
          </li>
        ))}
      </ul>
      <h2>All guides</h2>
      <div className="reeves-sections">
        {SECTIONS.map((section) => (
          <div key={section.id} className="reeves-section">
            <h3>{section.title}</h3>
            <ul>
              {TOPICS.filter((t) => t.section === section.id).map((t) => (
                <li key={t.id}>
                  <Link href={helpUrl(t.id)}>{t.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

function Answers({ question }: { question: string }) {
  useTitle(`Ask Reeves — ${question}`);
  const found = ask(question);
  const [best, ...more] = found;
  if (!best) {
    return (
      <>
        <p>
          Reeves is terribly sorry, but he could not find an answer to “{question}”. Perhaps try other words — “futures”,
          “margin call”, “repay a loan” — or browse the guides.
        </p>
        <Front />
      </>
    );
  }
  return (
    <>
      <p>
        You asked: <i>“{question}”</i>
      </p>
      <div className="reeves-answer">
        Reeves knows the answer to <b>{best.questions[0]}</b>
        <br />
        <Link href={helpUrl(best.id)}>{best.title} »</Link>
      </div>
      {more.length > 0 && (
        <>
          <p>Reeves also knows the answers to:</p>
          <ul>
            {more.slice(0, 6).map((t) => (
              <li key={t.id}>
                <Link href={helpUrl(t.id)}>{t.questions[0]}</Link> <small>({t.title})</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function Guide({ topic, ctx }: { topic?: Topic; ctx: HelpContext }) {
  useTitle(`Ask Reeves — ${topic?.title ?? 'Guide not found'}`);
  if (!topic) {
    return (
      <p>
        Reeves cannot find that guide. <Link href={`http://${REEVES}/`}>See all guides</Link>
      </p>
    );
  }
  const section = SECTIONS.find((s) => s.id === topic.section)!;
  const siblings = TOPICS.filter((t) => t.section === topic.section);
  const k = siblings.indexOf(topic);
  return (
    <div className="reeves-guide">
      <p className="reeves-crumbs">
        <Link href={`http://${REEVES}/`}>Ask Reeves</Link> : {section.title}
      </p>
      <h1>{topic.title}</h1>
      {topic.body(ctx)}
      <div className="reeves-related">
        <b>Questions this guide answers</b>
        <ul>
          {topic.questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
        <p>
          {k > 0 && <Link href={helpUrl(siblings[k - 1].id)}>« {siblings[k - 1].title}</Link>}
          {k > 0 && k < siblings.length - 1 && ' | '}
          {k < siblings.length - 1 && <Link href={helpUrl(siblings[k + 1].id)}>{siblings[k + 1].title} »</Link>}
        </p>
      </div>
    </div>
  );
}
