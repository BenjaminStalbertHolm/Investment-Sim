import { useEffect, useMemo, useRef, useState } from 'react';
import { Portrait } from '../../art/portrait/Portrait';
import { formatClock } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import type { Contact, ImChoice } from '../../sim/desk';
import { decodeCeo } from '../../world/ceo';
import { showError, useGame } from '../../state/game';
import { useTrade } from '../../state/trade';
import { useWindows } from '../../state/windows';
import { useDesk, useFetched, useStaff } from '../../sites/hooks';
import { AppMenuBar } from '../AppMenuBar';
import type { AppProps } from '../types';
import { REPLIES, answerText, text } from './words';
import '../programs.css';

const GROUPS: [Contact['kind'][], string][] = [
  [['broker', 'mom'], 'Contacts'],
  [['staff'], 'Staff'],
  [['informant'], 'Informants'],
  [['journalist'], 'Press'],
  [['rival'], 'Rivals'],
];

/**
 * ISeekYou (spec §4A): the broker, staff, informants, bribed journalists, rival CEOs and your mother. Conversations use
 * multiple-choice replies; informants' tips arrive here, and trading on a genuine one is insider trading.
 */
export default function Messenger({ windowId }: AppProps) {
  const desk = useDesk();
  const staff = useStaff();
  const journalists = useFetched(() => simulation().journalists(), []);
  const { directory, seed } = useGame.getState();
  const [open, setOpen] = useState<number>();
  const contacts = desk?.contacts ?? [];
  const contact = contacts.find((c) => c.id === open);
  const log = useRef<HTMLDivElement>(null);
  const messages = useMemo(() => (desk?.messages ?? []).filter((m) => m.contact === open), [desk, open]);
  const unread = (c: Contact) => (desk?.messages ?? []).filter((m) => m.contact === c.id && !m.read).length;

  useEffect(() => {
    if (open !== undefined && messages.some((m) => !m.read)) void simulation().deskAction({ do: 'read', contact: open });
    log.current?.scrollTo(0, log.current.scrollHeight);
  }, [open, messages]);

  const face = (c: Contact) => {
    const code = c.kind === 'informant' ? c.ceo : c.kind === 'staff' ? staff?.people.find((p) => p.id === c.ref)?.ceo : c.kind === 'journalist' ? journalists?.[c.ref ?? -1]?.face : undefined;
    return code ? decodeCeo(code) : undefined;
  };
  const reply = (id: number, choice: ImChoice) =>
    void simulation()
      .deskAction({ do: 'answer', message: id, choice })
      .then((e) => e && showError(e));
  const actOn = (company: number, direction: number) => {
    useTrade.getState().trade(company, direction > 0 ? 'buy' : 'sell');
    useWindows.getState().open('trade');
  };

  return (
    <div className="app messenger">
      <AppMenuBar windowId={windowId} />
      <div className="messenger-body">
        <ul className="messenger-contacts sunken-panel" aria-label="Contacts">
          {GROUPS.map(([kinds, label]) => {
            const list = contacts.filter((c) => kinds.includes(c.kind));
            if (!list.length) return null;
            return (
              <li key={label}>
                <b>{label}</b>
                <ul>
                  {list.map((c) => (
                    <li key={c.id} className={`messenger-contact${c.id === open ? ' selected' : ''}`} onClick={() => setOpen(c.id)}>
                      <span className={`messenger-flower ${c.blocked ? 'away' : 'online'}`} aria-hidden="true">✿</span>
                      {c.name}
                      {unread(c) > 0 && <span className="messenger-unread">{unread(c)}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
        <div className="messenger-chat">
          {!contact && <p className="hint">Double-click… well, click a contact to chat. New messages play the chime.</p>}
          {contact && (
            <>
              <div className="messenger-header">
                {face(contact) && <Portrait ceo={face(contact)!} size={40} title={contact.name} />}
                <div>
                  <b>{contact.name}</b>
                  <br />
                  <span className="hint">{contact.blocked ? 'Has blocked you' : 'Online'}{contact.where ? ` — met at ${contact.where}` : ''}</span>
                </div>
              </div>
              <div className="messenger-log sunken-panel" ref={log}>
                {messages.map((m) => (
                  <div key={m.id} className="messenger-message">
                    <div className="messenger-line">
                      <span className="messenger-who them">{contact.name.split(' ')[0]}</span> <span className="hint">({formatClock(m.time)})</span>
                      <br />
                      {text(m, contact, directory, seed)}
                    </div>
                    {m.answer && (
                      <div className="messenger-line">
                        <span className="messenger-who me">Me</span>: {REPLIES[m.answer]}
                      </div>
                    )}
                    {answerText(m, contact) && (
                      <div className="messenger-line">
                        <span className="messenger-who them">{contact.name.split(' ')[0]}</span>: {answerText(m, contact)}
                      </div>
                    )}
                    {!m.answer && m.choices && !contact.blocked && (
                      <div className="button-row">
                        {m.choices.map((choice) => (
                          <button key={choice} onClick={() => reply(m.id, choice)}>
                            {REPLIES[choice]}
                          </button>
                        ))}
                        {m.topic === 'tip' && m.company !== undefined && <button onClick={() => actOn(m.company!, m.direction ?? 1)}>Act on it…</button>}
                      </div>
                    )}
                  </div>
                ))}
                {!messages.length && <p className="hint">No messages yet.</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
