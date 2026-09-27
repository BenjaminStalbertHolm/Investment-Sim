import { useEffect, useState } from 'react';
import { dayOf } from '../../sim/calendar';
import type { Snapshot } from '../../sim/types';
import { openUrl, useGame } from '../../state/game';
import { usePrograms } from '../../state/programs';
import { useShell } from '../../state/shell';
import { useTrade } from '../../state/trade';
import { useWindows } from '../../state/windows';
import { helpUrl } from '../../sites/urls';
import '../programs.css';

interface Tip {
  id: string;
  /** Shown once a game, or once a game day. */
  once?: boolean;
  when(s: Snapshot): boolean;
  text(s: Snapshot): string;
  action?: [string, () => void];
}

const trade = (tab: 'portfolio' | 'financing') => () => {
  useTrade.getState().setTab(tab);
  useWindows.getState().open('trade');
};

/** What Stapley has to say, most important first (spec §4A: contextual tips for new players and sarcastic remarks). */
const TIPS: Tip[] = [
  { id: 'margin', when: (s) => !!s.account.call, text: () => 'It looks like you’re about to be margin called. Would you like me to panic?', action: ['Open Portfolio', trade('portfolio')] },
  { id: 'wages', when: (s) => s.account.wages > 0, text: () => 'Your staff haven’t been paid. They’ve noticed. So has their lawyer.', action: ['Open PeopleSoftie', () => useWindows.getState().open('hr')] },
  { id: 'heat', when: (s) => s.sob.heat >= 40, text: () => 'It looks like the Securities Oversight Bureau is interested in you. Would you like me to shred some documents? (That was a joke. Please don’t.)', action: ['What is heat?', () => openUrl(helpUrl())] },
  { id: 'losing', when: (s) => s.phase === 'open' && s.account.netWorth > 0 && s.account.dayChange < -0.015 * s.account.netWorth, text: () => 'It looks like you’re losing money. Would you like help with that?', action: ['Show me the damage', trade('portfolio')] },
  { id: 'mail', when: (s) => s.mail.unread >= 12, text: (s) => `You have ${s.mail.unread} unread messages. Most of them are probably from your mother.`, action: ['Open Outbox Express', () => useWindows.getState().open('mail')] },
  { id: 'welcome', once: true, when: () => true, text: () => 'Hi! I’m Stapley. It looks like you’re running an investment firm. Would you like help?', action: ['Ask Reeves', () => openUrl(helpUrl())] },
  { id: 'im', when: (s) => s.desk.im.unread >= 3, text: (s) => `${s.desk.im.unread} ISeekYou messages are waiting. One of them might be a tip. One of them is definitely your mother.`, action: ['Open ISeekYou', () => useWindows.getState().open('messenger')] },
];

/** Stapley (spec §4A): a stapler-shaped assistant. It can be dismissed, or disabled altogether. */
export default function Stapley() {
  const enabled = usePrograms((s) => s.stapley.enabled);
  const seen = usePrograms((s) => s.stapley.seen);
  const snapshot = useGame((s) => s.snapshot);
  const setup = useShell((s) => s.setup);
  const [tip, setTip] = useState<{ tip: Tip; key: string }>();

  useEffect(() => {
    if (!enabled || !snapshot || tip || setup) return;
    const day = dayOf(snapshot.time);
    const next = TIPS.find((t) => !seen.includes(t.once ? t.id : `${t.id}:${day}`) && t.when(snapshot));
    if (!next) return;
    // Stapley waits a moment before interrupting, as all good assistants do.
    const timer = setTimeout(() => setTip({ tip: next, key: next.once ? next.id : `${next.id}:${day}` }), 1500);
    return () => clearTimeout(timer);
  }, [enabled, snapshot, tip, seen, setup]);

  if (!enabled || !tip || !snapshot) return null;
  const dismiss = () => {
    const stapley = usePrograms.getState().stapley;
    usePrograms.setState({ stapley: { ...stapley, seen: [...stapley.seen.filter((k) => !k.includes(':') || k.endsWith(`:${dayOf(snapshot.time)}`)), tip.key] } });
    setTip(undefined);
  };
  return (
    <div className="stapley" role="dialog" aria-label="Stapley">
      <div className="stapley-bubble">
        <p>{tip.tip.text(snapshot)}</p>
        <div className="button-row">
          {tip.tip.action && (
            <button
              onClick={() => {
                tip.tip.action![1]();
                dismiss();
              }}
            >
              {tip.tip.action[0]}
            </button>
          )}
          <button onClick={dismiss}>No thanks</button>
          <button onClick={() => (dismiss(), usePrograms.setState({ stapley: { ...usePrograms.getState().stapley, enabled: false } }))}>Hide Stapley</button>
        </div>
      </div>
      <svg className="stapley-body" width="72" height="64" viewBox="0 0 72 64" aria-hidden="true">
        <rect x="6" y="48" width="60" height="8" rx="3" fill="#505050" />
        <path d="M8 44L60 30Q68 28 66 36L64 42Q62 46 56 46H10Z" fill="#c02020" stroke="#600" />
        <path d="M10 44L58 32" stroke="#fff" strokeWidth="2" opacity="0.5" />
        <circle cx="42" cy="30" r="6" fill="#fff" stroke="#000" />
        <circle cx="54" cy="27" r="6" fill="#fff" stroke="#000" />
        <circle cx="43" cy="31" r="2.5" fill="#000" />
        <circle cx="55" cy="28" r="2.5" fill="#000" />
        <path d="M37 21l9 3M50 17l9 5" stroke="#000" strokeWidth="2" />
      </svg>
    </div>
  );
}
