import { useState } from 'react';
import { simulation } from '../../sim/client';
import type { Tone } from '../../sim/desk';
import { quarterOf } from '../../sim/desk';
import { dayOf } from '../../sim/calendar';
import { showError, useGame } from '../../state/game';
import { deleteFile, saveFile, usePrograms, type Doc } from '../../state/programs';
import { useDesk, useFetched } from '../../sites/hooks';
import { Modal, Prompt } from '../../ui98/Modal';
import { AppMenuBar } from '../AppMenuBar';
import { signedPct } from '../format';
import type { AppProps } from '../types';
import '../programs.css';

const TONES: { id: Tone; label: string; hint: string; body: string }[] = [
  { id: 'confident', label: 'Confident', hint: 'Pleases clients after a good quarter; grates after a bad one.',
    body: 'Another quarter of disciplined, first-class investing. We are exactly where we planned to be, and we see no reason to change course.' },
  { id: 'humble', label: 'Humble', hint: 'Always taken kindly, especially after a bad quarter.',
    body: 'Markets humble everyone, and we are no exception. We are grateful for your trust and are working hard to deserve it.' },
  { id: 'blame', label: 'Blame the Federal Reservoir', hint: 'Works only when the whole market fell.',
    body: 'The Federal Reservoir’s erratic policy made this a difficult quarter for every investor. We are confident its mistakes will not last.' },
  { id: 'silent', label: 'Say nothing', hint: 'Silence after a bad quarter is noticed.', body: '' },
];
const FONTS: Record<Doc['font'], string> = { serif: '"Times New Roman", Times, serif', sans: 'Arial, Helvetica, sans-serif', mono: '"Courier New", Courier, monospace' };

/**
 * MajorWord 98 (spec §4A): documents kept in the saved game, and the quarterly letter to clients, whose tone nudges their
 * mood depending on how the quarter really went.
 */
export default function Word({ windowId }: AppProps) {
  const documents = usePrograms((s) => s.documents);
  const [id, setId] = useState<number | undefined>(documents[0]?.id);
  const [letter, setLetter] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const doc = documents.find((d) => d.id === id);
  const update = (patch: Partial<Doc>) => doc && saveFile('documents', { ...doc, ...patch });
  const create = (name = `Document ${documents.length + 1}`, text = '') => setId(saveFile('documents', { name, text, font: 'serif', size: 14 }));
  return (
    <div className="app word">
      <AppMenuBar
        windowId={windowId}
        menus={[
          { label: 'Document', items: [
            { label: 'New', onClick: () => create() },
            { label: 'Rename…', disabled: !doc, onClick: () => setRenaming(true) },
            { label: 'Delete', disabled: !doc, onClick: () => { if (doc) deleteFile('documents', doc.id); setId(undefined); } },
          ] },
          { label: 'Templates', items: [{ label: 'Quarterly Letter to Clients…', onClick: () => setLetter(true) }] },
        ]}
      />
      <div className="toolbar">
        <select aria-label="Document" value={id ?? ''} onChange={(e) => setId(Number(e.target.value) || undefined)}>
          <option value="">(no document open)</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button onClick={() => create()}>New</button>
        <span className="toolbar-gap" />
        <select aria-label="Font" disabled={!doc} value={doc?.font ?? 'serif'} onChange={(e) => update({ font: e.target.value as Doc['font'] })}>
          <option value="serif">Times New Roman</option>
          <option value="sans">Arial</option>
          <option value="mono">Courier New</option>
        </select>
        <select aria-label="Size" disabled={!doc} value={doc?.size ?? 14} onChange={(e) => update({ size: Number(e.target.value) })}>
          {[10, 12, 14, 18, 24, 36].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button onClick={() => setLetter(true)}>Letter to Clients…</button>
      </div>
      <div className="word-page-area">
        {doc ? (
          <textarea
            className="word-page"
            aria-label={doc.name}
            style={{ fontFamily: FONTS[doc.font], fontSize: doc.size }}
            value={doc.text}
            onChange={(e) => update({ text: e.target.value })}
          />
        ) : (
          <p className="hint">Documents are kept in your saved game. Choose Document → New, or write your quarterly letter to clients.</p>
        )}
      </div>
      {letter && <LetterDialog onClose={() => setLetter(false)} onDraft={(name, text) => create(name, text)} />}
      {renaming && doc && (
        <Prompt title="Rename" label="Document name:" initial={doc.name} onOk={(name) => (update({ name }), setRenaming(false))} onCancel={() => setRenaming(false)} />
      )}
    </div>
  );
}

function LetterDialog({ onClose, onDraft }: { onClose(): void; onDraft(name: string, text: string): void }) {
  const [tone, setTone] = useState<Tone>('humble');
  const desk = useDesk();
  const time = useGame((s) => s.snapshot?.time ?? 0);
  const { firmName, player } = useGame.getState();
  const quarter = useFetched(() => simulation().news({ kinds: ['firmQuarter'], limit: 1 }), [time]);
  const last = quarter?.[0];
  const sent = desk?.letter?.quarter === quarterOf(dayOf(time));
  const chosen = TONES.find((t) => t.id === tone)!;
  const text = [
    'Dear clients,',
    last ? `Last quarter your portfolio returned ${signedPct(last.move!)} against ${signedPct(last.expect!)} for the MAJOR 500.` : 'This is our first letter to you.',
    chosen.body || '(This page is intentionally left blank.)',
    `Yours,\n${player?.ceoName ?? ''}\n${firmName}`,
  ].join('\n\n');
  const send = () =>
    void simulation()
      .deskAction({ do: 'letter', tone })
      .then((error) => {
        if (error) return showError(error);
        onDraft(`Letter to clients (${chosen.label})`, text);
        onClose();
      });
  return (
    <Modal title="Letter Wizard: Quarterly Letter to Clients" onClose={onClose}>
      <div className="dialog-body word-letter">
        <p>Choose a tone. Your clients will read it against how the quarter really went.</p>
        {TONES.map((t) => (
          <div key={t.id} className="field-row">
            <input id={`tone-${t.id}`} type="radio" name="tone" checked={tone === t.id} onChange={() => setTone(t.id)} />
            <label htmlFor={`tone-${t.id}`}>
              <b>{t.label}</b> — {t.hint}
            </label>
          </div>
        ))}
        <pre className="word-preview sunken-panel">{text}</pre>
        <div className="dialog-buttons">
          <button className="default" disabled={sent} onClick={send}>
            {sent ? 'Sent this quarter' : 'Send to All Clients'}
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}
