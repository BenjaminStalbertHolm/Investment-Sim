import { useMemo, useReducer, useState } from 'react';
import { Icon } from '../../art/icons';
import { formatClock } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { FOLDER_OF, type Mail, type MailAction } from '../../sim/mail';
import { openQuote, openUrl, showError, useGame } from '../../state/game';
import { useMailView, type MailFolder, type MailSort } from '../../state/mail';
import { useTrade, type TradeTab } from '../../state/trade';
import { useWindows } from '../../state/windows';
import { useFetched } from '../../sites/hooks';
import { Modal } from '../../ui98/Modal';
import { VirtualTable, type Column } from '../../ui98/VirtualTable';
import { AppMenuBar } from '../AppMenuBar';
import type { AppProps } from '../types';
import { letterHeader, writeLetter, type Block, type LetterContext } from './letters';
import './mail.css';

const FOLDERS: { id: MailFolder; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'clients', label: 'Clients' },
  { id: 'broker', label: 'Broker' },
  { id: 'news', label: 'News' },
  { id: 'tips', label: 'Tips' },
  { id: 'junk', label: 'Junk' },
  { id: 'sent', label: 'Sent Items' },
  { id: 'deleted', label: 'Deleted Items' },
];

const SORTS: Record<string, MailSort> = { From: 'from', Subject: 'subject', Received: 'date' };

type Row = Mail & { from: string; subject: string };

/** Which folder a letter shows in. */
const folderOf = (m: Mail, junkFilter: boolean): MailFolder =>
  m.deleted ? 'deleted' : m.kind === 'spam' && !junkFilter ? 'inbox' : FOLDER_OF[m.kind];

/**
 * Outbox Express (spec §15): the consequence layer. Folders with unread counts, a sortable, searchable message list,
 * a preview pane, flags, and action buttons that change the game — accept a mandate, report a tip.
 */
export default function MailApp({ windowId }: AppProps) {
  const view = useMailView();
  const set = useMailView.setState;
  const latest = useGame((s) => s.snapshot?.mail.latest ?? 0);
  const { directory, firmName, seed, player } = useGame.getState();
  const [revision, refresh] = useReducer((x: number) => x + 1, 0);
  const [search, setSearch] = useState('');
  const [about, setAbout] = useState(false);
  const data = useFetched(() => simulation().mail(), [latest, revision]);
  const clients = useFetched(() => simulation().clients(), [latest, revision]);
  const messages = data?.messages;
  // Alerts need their stories' headlines for the subject line; the open briefing, its top stories.
  const selected = messages?.find((m) => m.id === view.selected);
  const ids = useMemo(() => {
    const wanted = new Set<number>();
    for (const m of messages ?? []) if (m.kind === 'alert' && m.news !== undefined) wanted.add(m.news);
    for (const id of selected?.items ?? []) wanted.add(id);
    return [...wanted];
  }, [messages, selected?.id]);
  const news = useFetched(() => simulation().news({ ids }), [ids.join()]);
  const journalists = useFetched(() => simulation().journalists(), []);
  const ctx: LetterContext = useMemo(
    () => ({
      directory,
      firmName,
      ceoName: player?.ceoName ?? 'The CEO',
      seed,
      clients: new Map((clients?.clients ?? []).map((c) => [c.id, c])),
      news: new Map((news ?? []).map((n) => [n.id, n])),
      journalists,
    }),
    [clients, news, journalists, firmName, player?.ceoName],
  );

  const rows: Row[] = useMemo(() => (messages ?? []).map((m) => ({ ...m, ...letterHeader(m, ctx) })), [messages, ctx]);
  const inFolder = rows.filter((m) => folderOf(m, view.junkFilter) === view.folder);
  const q = search.trim().toLowerCase();
  const shown = (q ? inFolder.filter((m) => `${m.from} ${m.subject}`.toLowerCase().includes(q)) : inFolder).sort((a, b) => {
    const by = view.sort.by;
    const d = by === 'date' ? a.time - b.time || a.id - b.id : (by === 'from' ? a.from : a.subject).localeCompare(by === 'from' ? b.from : b.subject);
    return view.sort.ascending ? d : -d;
  });
  const unread = (f: MailFolder) => rows.filter((m) => !m.read && folderOf(m, view.junkFilter) === f).length;

  const mark = (ids: number[], patch: Partial<Pick<Mail, 'read' | 'flagged' | 'deleted'>>) =>
    void simulation().markMail(ids, patch).then(refresh);
  const select = (m: Row) => {
    set({ selected: m.id });
    if (!m.read) mark([m.id], { read: true });
  };
  const act = (m: Mail, action: MailAction) =>
    void simulation()
      .mailAction(m.id, action)
      .then((error) => (error ? showError(error) : refresh()));
  const sortBy = (header: string) => {
    const by = SORTS[header];
    if (by) set({ sort: { by, ascending: view.sort.by === by ? !view.sort.ascending : by !== 'date' } });
  };

  const columns: Column<Row>[] = [
    { header: '!', width: 16, cell: (m) => (m.flagged ? <span className="mail-flag">⚑</span> : m.answer === undefined && (ACTIONS[m.kind] || m.kind === 'tip') ? '•' : '') },
    { header: view.folder === 'sent' ? 'To' : 'From', cell: (m) => (view.folder === 'sent' ? writeLetter(m, ctx, true).to : m.from) },
    { header: 'Subject', cell: (m) => m.subject },
    { header: 'Received', cell: (m) => formatClock(m.time) },
  ];

  return (
    <div className="app outbox">
      <AppMenuBar
        windowId={windowId}
        menus={[
          {
            label: 'View',
            items: [
              { label: 'Sort by Received', checked: view.sort.by === 'date', onClick: () => sortBy('Received') },
              { label: 'Sort by From', checked: view.sort.by === 'from', onClick: () => sortBy('From') },
              { label: 'Sort by Subject', checked: view.sort.by === 'subject', onClick: () => sortBy('Subject') },
            ],
          },
          {
            label: 'Tools',
            items: [
              { label: 'Junk Mail Filter', checked: view.junkFilter, onClick: () => set({ junkFilter: !view.junkFilter }) },
              { label: 'News Alerts for My Holdings', checked: data?.alerts ?? true, onClick: () => void simulation().setAlerts(!(data?.alerts ?? true)).then(refresh) },
              { label: 'Mark All as Read', onClick: () => mark(shown.filter((m) => !m.read).map((m) => m.id), { read: true }) },
            ],
          },
          { label: 'Help', items: [{ label: 'About Outbox Express…', onClick: () => setAbout(true) }] },
        ]}
      />
      <div className="toolbar">
        <button disabled={!selected} onClick={() => selected && mark([selected.id], { read: !selected.read })}>
          {selected && !selected.read ? 'Mark Read' : 'Mark Unread'}
        </button>
        <button disabled={!selected} onClick={() => selected && mark([selected.id], { flagged: !selected.flagged })}>
          Flag
        </button>
        <button disabled={!selected} onClick={() => selected && mark([selected.id], { deleted: !selected.deleted })}>
          {selected?.deleted ? 'Restore' : 'Delete'}
        </button>
        <span className="toolbar-gap" />
        <label htmlFor={`${windowId}-search`}>Find:</label>
        <input id={`${windowId}-search`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="From or subject" />
      </div>
      <div className="outbox-body">
        <ul className="outbox-folders sunken-panel" role="tree">
          <li className="outbox-root">
            <Icon name="mail" size={16} /> Outbox Express
          </li>
          {FOLDERS.map((f) => {
            const n = f.id === 'sent' ? 0 : unread(f.id);
            return (
              <li
                key={f.id}
                role="treeitem"
                aria-selected={view.folder === f.id}
                className={view.folder === f.id ? 'selected' : ''}
                onClick={() => set({ folder: f.id, selected: undefined })}
              >
                {f.label}
                {n > 0 && <b> ({n})</b>}
              </li>
            );
          })}
        </ul>
        <div className="outbox-main">
          <VirtualTable
            className="outbox-list"
            rows={shown}
            columns={columns}
            rowKey={(m) => m.id}
            selected={view.selected}
            onSelect={select}
            rowClass={(m) => (m.read ? undefined : 'unread')}
            onSort={sortBy}
            sort={{ header: Object.keys(SORTS).find((h) => SORTS[h] === view.sort.by)!, ascending: view.sort.ascending }}
            empty={messages ? 'There are no items in this view.' : 'Loading…'}
          />
          <div className="outbox-preview sunken-panel">
            {selected ? <Preview mail={selected} ctx={ctx} onAction={act} onDelete={() => mark([selected.id], { deleted: true })} /> : <p className="hint">Select a message to read it.</p>}
          </div>
        </div>
      </div>
      <div className="status-bar">
        <p className="status-bar-field">{shown.length} message(s)</p>
        <p className="status-bar-field">{shown.filter((m) => !m.read).length} unread</p>
        {clients && (
          <p className="status-bar-field">
            {clients.clients.filter((c) => c.status === 'active').length} active client(s)
          </p>
        )}
      </div>
      {about && (
        <Modal title="About Outbox Express" onClose={() => setAbout(false)}>
          <div className="dialog-body about">
            <p>
              <b>Outbox Express</b> 5.0 for Majorsoft Doors 98.
              <br />
              Now with 40% fewer chain letters.
            </p>
            <div className="dialog-buttons">
              <button className="default" onClick={() => setAbout(false)}>
                OK
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Company mentions become "Name (TICK)", the ticker opening a quote window. */
function MailText({ text }: { text: string }) {
  const { names, tickers } = useGame.getState().directory;
  const parts = text.split(/\{c:(\d+)\}/);
  return (
    <p>
      {parts.map((part, k) =>
        k % 2 ? (
          <span key={k}>
            {names[Number(part)]} (
            <a role="link" className="mail-link" onClick={() => openQuote(Number(part))}>
              {tickers[Number(part)]}
            </a>
            )
          </span>
        ) : (
          part
        ),
      )}
    </p>
  );
}

function BlockView({ block }: { block: Block }) {
  if ('p' in block) return <MailText text={block.p} />;
  if ('list' in block) {
    return (
      <ul>
        {block.list.map((t, k) => (
          <li key={k}>{t}</li>
        ))}
      </ul>
    );
  }
  if ('link' in block) {
    return (
      <p>
        <a role="link" className="mail-link" onClick={() => openUrl(block.url)}>
          {block.link}
        </a>
      </p>
    );
  }
  return (
    <table className="mail-table">
      <thead>
        <tr>
          {block.table.head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {block.table.rows.map((r, k) => (
          <tr key={k}>
            {r.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const ANSWERS: Record<NonNullable<Mail['answer']>, string> = {
  accepted: 'You accepted.', declined: 'You declined.', reported: 'You reported this tip to the Securities Oversight Bureau.', expired: 'This offer has expired.',
  for: 'You voted FOR.', against: 'You voted AGAINST.', abstain: 'You abstained.', done: 'Your instructions have been passed to the board.',
  paid: 'You paid.', refused: 'You refused to pay.',
};

/** Letters with buttons (spec §15, §15.5–15.6), and the buttons: an action and its label. */
const ACTIONS: Partial<Record<Mail['kind'], [MailAction, string][]>> = {
  offer: [['accept', 'Accept'], ['decline', 'Decline']],
  proxy: [['for', 'Vote For'], ['against', 'Vote Against'], ['abstain', 'Abstain']],
  boardSeat: [['accept', 'Join the Board'], ['decline', 'Decline']],
  control: [['replaceCeo', 'Replace the CEO'], ['raiseDividend', 'Raise the Dividend'], ['cutDividend', 'Cut the Dividend']],
  stakeBid: [['accept', 'Sell the Shares'], ['decline', 'Decline']],
  investmentOffer: [['accept', 'Accept the Investment'], ['decline', 'Decline']],
  blackmail: [['pay', 'Pay'], ['refuse', 'Refuse']],
};

/** Letters from the broker and the bank open the MajorTrade tab they are about. */
const GOTO: Partial<Record<Mail['kind'], { tab: TradeTab; label: string }>> = {
  marginCall: { tab: 'portfolio', label: 'Open Portfolio' },
  liquidation: { tab: 'portfolio', label: 'Open Portfolio' },
  recall: { tab: 'portfolio', label: 'Open Portfolio' },
  buyIn: { tab: 'portfolio', label: 'Open Portfolio' },
  expiry: { tab: 'futures', label: 'Open Futures' },
  delivery: { tab: 'futures', label: 'Open Futures' },
  ftd: { tab: 'futures', label: 'Open Futures' },
  loan: { tab: 'financing', label: 'Open Financing' },
  loanLate: { tab: 'financing', label: 'Open Financing' },
  loanDefault: { tab: 'financing', label: 'Open Financing' },
};

/** Switches MajorTrade Pro to a tab or a ticket, and brings it up. */
function openTrade(set: () => void): void {
  set();
  useWindows.getState().open('trade');
}

function Preview({ mail, ctx, onAction, onDelete }: { mail: Mail; ctx: LetterContext; onAction(m: Mail, a: MailAction): void; onDelete(): void }) {
  const letter = useMemo(() => writeLetter(mail, ctx), [mail, ctx]);
  const actOnTip = () => {
    useTrade.getState().trade(mail.company!, (mail.direction ?? 1) > 0 ? 'buy' : 'sell');
    useWindows.getState().open('trade');
  };
  return (
    <div className="mail-letter">
      <table className="mail-header">
        <tbody>
          <tr><th>From:</th><td>{letter.from}</td></tr>
          <tr><th>Date:</th><td>{formatClock(mail.time)}</td></tr>
          <tr><th>To:</th><td>{letter.to}</td></tr>
          <tr><th>Subject:</th><td><b>{letter.subject}</b></td></tr>
        </tbody>
      </table>
      <div className="mail-body">
        {letter.body.map((b, k) => (
          <BlockView key={k} block={b} />
        ))}
      </div>
      {mail.answer && <p className="mail-answer">{ANSWERS[mail.answer]}</p>}
      {!mail.answer && ACTIONS[mail.kind] && (
        <div className="button-row">
          {ACTIONS[mail.kind]!.map(([action, label], k) => (
            <button key={action} className={k ? '' : 'default'} onClick={() => onAction(mail, action)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {!mail.answer && mail.kind === 'tip' && (
        <div className="button-row">
          <button onClick={actOnTip}>Act on It…</button>
          <button onClick={() => onAction(mail, 'report')}>Report to SOB</button>
          <button onClick={onDelete}>Delete</button>
        </div>
      )}
      {GOTO[mail.kind] && (
        <div className="button-row">
          {mail.kind === 'recall' && mail.company !== undefined && (
            <button onClick={() => openTrade(() => useTrade.getState().trade(mail.company!, 'cover', { shares: String(mail.amount ?? '') }))}>
              Buy to Cover…
            </button>
          )}
          <button onClick={() => openTrade(() => useTrade.getState().setTab(GOTO[mail.kind]!.tab))}>{GOTO[mail.kind]!.label}</button>
        </div>
      )}
    </div>
  );
}
