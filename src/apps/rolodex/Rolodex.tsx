import { useMemo, useState } from 'react';
import { Portrait } from '../../art/portrait/Portrait';
import { formatDate, dayOf } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { ROLE } from '../../sim/data/staff';
import { MARKET } from '../../sim/data/darkweb';
import { decodeCeo, type Ceo } from '../../world/ceo';
import { useGame } from '../../state/game';
import { companyOf, useDesk, useFetched, useStaff } from '../../sites/hooks';
import { AppMenuBar } from '../AppMenuBar';
import type { AppProps } from '../types';
import '../programs.css';

interface Card {
  key: string;
  name: string;
  title: string;
  ceo?: Ceo;
  lines: string[];
}

/**
 * Rolodex (spec §4A): a card for everyone the firm has dealt with — staff, informants, journalists, rival firms, the chief
 * executives who wrote, clients, dark web vendors — with their portrait and the history of dealings. Worked out from the
 * game's records, so it needs nothing of its own in the save.
 */
export default function Rolodex({ windowId }: AppProps) {
  const staff = useStaff();
  const desk = useDesk();
  const latest = useGame((s) => s.snapshot?.mail.latest ?? 0);
  const mail = useFetched(() => simulation().mail(), [latest]);
  const clients = useFetched(() => simulation().clients(), [latest]);
  const journalists = useFetched(() => simulation().journalists(), []);
  const dark = useFetched(() => simulation().darkweb(), [latest]);
  const { directory } = useGame.getState();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string>();

  const cards = useMemo(() => {
    const out: Card[] = [];
    const letters = mail?.messages ?? [];
    const imCount = (contact: number) => (desk?.messages ?? []).filter((m) => m.contact === contact).length;
    for (const c of desk?.contacts ?? []) {
      if (c.kind === 'staff') continue;
      const title = { broker: 'Your broker, MajorTrade Pro', mom: 'Mother', informant: `Informant${c.where ? `, met at ${c.where}` : ''}`, journalist: 'Journalist', rival: 'Rival firm' }[c.kind] ?? c.kind;
      const face = c.kind === 'informant' && c.ceo ? decodeCeo(c.ceo) : c.kind === 'journalist' && journalists?.[c.ref ?? -1] ? decodeCeo(journalists[c.ref!].face) : undefined;
      const lines = [`In contact since ${formatDate(dayOf(c.since))}`, `ISeekYou messages: ${imCount(c.id)}`];
      if (c.blocked) lines.push('Has blocked you.');
      if (c.kind === 'journalist') {
        const j = journalists?.[c.ref ?? -1];
        const b = dark?.bribed.find((x) => x.journalist === c.ref);
        if (j) lines.push(`Writes for ${j.outlet} (${j.beat})`);
        if (b) lines.push(`Paid for ${b.bribes} article${b.bribes === 1 ? '' : 's'}`);
      }
      out.push({ key: `c${c.id}`, name: c.name, title, ceo: face, lines });
    }
    for (const p of staff?.people ?? []) {
      if (p.hired === undefined) continue;
      const lines = [`Hired ${formatDate(p.hired)} at ${p.salary.toLocaleString('en-US')} dollars a year`];
      if (p.left !== undefined) lines.push(`Left ${formatDate(p.left)} (${p.why === 'poached' ? 'poached by a rival' : p.why === 'unpaid' ? 'unpaid' : p.why ?? 'left'})`);
      out.push({ key: `s${p.id}`, name: p.name, title: `${ROLE[p.role].title}${p.status === 'former' ? ' (former)' : ''}`, ceo: decodeCeo(p.ceo), lines });
    }
    const ceos = new Map<number, number[]>();
    for (const m of letters) if ((m.kind === 'ceoLetter' || m.kind === 'boardSeat' || m.kind === 'control') && m.company !== undefined) ceos.set(m.company, [...(ceos.get(m.company) ?? []), m.time]);
    for (const [company, times] of ceos) {
      const c = companyOf(directory.genomes[company]);
      out.push({
        key: `ceo${company}`, name: `${c.ceo.firstName} ${c.ceo.lastName}`, title: `Chief Executive, ${c.name}`,
        lines: [`Letters: ${times.length}, the last on ${formatDate(dayOf(times.at(-1)!))}`],
      });
    }
    for (const c of clients?.clients ?? []) {
      if (c.status !== 'active' && c.status !== 'left') continue;
      const lines = [`${c.status === 'active' ? 'Client' : 'Former client'} since ${c.joined ? formatDate(dayOf(c.joined)) : 'the founding'}`, `Deposited ${c.deposited.toLocaleString('en-US', { maximumFractionDigits: 0 })} dollars`];
      if (c.withdrawn) lines.push(`Withdrew ${c.withdrawn.toLocaleString('en-US', { maximumFractionDigits: 0 })} dollars`);
      out.push({ key: `cl${c.id}`, name: c.contact.split(',')[0], title: `${c.contact.split(',').slice(1).join(',').trim()}, ${c.name}`, lines });
    }
    const vendors = new Map<string, string[]>();
    for (const p of dark?.purchases ?? []) vendors.set(p.handle, [...(vendors.get(p.handle) ?? []), `${formatDate(dayOf(p.time))}: ${p.request.service}${p.result ? ` (${p.result})` : ' (pending)'}`]);
    for (const [handle, lines] of vendors) {
      const v = dark?.vendors.find((x) => x.handle === handle);
      out.push({ key: `v${handle}`, name: handle, title: `Vendor, ${v ? MARKET[v.market].name : 'the Garlic network'}`, lines: lines.slice(-6) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [staff, desk, mail, clients, journalists, dark, directory]);

  const q = query.trim().toLowerCase();
  const shown = q ? cards.filter((c) => `${c.name} ${c.title}`.toLowerCase().includes(q)) : cards;
  const card = cards.find((c) => c.key === open) ?? shown[0];
  const index = card ? shown.indexOf(card) : -1;

  return (
    <div className="app rolodex">
      <AppMenuBar windowId={windowId} />
      <div className="toolbar">
        <label htmlFor={`${windowId}-find`}>Find</label>
        <input id={`${windowId}-find`} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button disabled={index <= 0} onClick={() => setOpen(shown[index - 1].key)}>◀</button>
        <button disabled={index < 0 || index >= shown.length - 1} onClick={() => setOpen(shown[index + 1].key)}>▶</button>
        <span className="hint">{shown.length} cards</span>
      </div>
      {card ? (
        <div className="rolodex-card">
          {card.ceo ? <Portrait ceo={card.ceo} size={72} title={card.name} /> : <div className="rolodex-blank" aria-hidden="true">?</div>}
          <div>
            <h3>{card.name}</h3>
            <p><i>{card.title}</i></p>
            <ul>
              {card.lines.map((l, k) => (
                <li key={k}>{l}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="hint">Nobody yet. Everyone you deal with gets a card.</p>
      )}
    </div>
  );
}
