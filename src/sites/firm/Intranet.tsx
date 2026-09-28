import { Portrait } from '../../art/portrait/Portrait';
import { money, signedPct } from '../../apps/format';
import { dayOf, formatDate } from '../../sim/calendar';
import { OFFICES, ROLE } from '../../sim/data/staff';
import type { Employee } from '../../sim/staff';
import { decodeCeo } from '../../world/ceo';
import { useGame } from '../../state/game';
import { usePlayerLook } from '../../apps/mycomputer/PlayerBadge';
import { SiteFrame } from '../frame';
import { useDesk, useLifestyle, useRecord, useStaff } from '../hooks';
import { MONSTROUS, intranetHost } from '../urls';
import { Link, useTitle } from '../web';

const TONE = { confident: 'confident', humble: 'humble', blame: 'firm but fair (it was the market)', silent: 'silent' } as const;
const WHY = { fired: 'has left the firm', quit: 'has resigned', poached: 'has joined a competitor', whistleblower: 'has left the firm. Please do not talk to reporters', unpaid: 'has left over unpaid wages' } as const;

/**
 * intranet.<firm>.com (spec §14.2): the staff directory, internal memos written from what has happened at the firm, and
 * the trophy shelf. Only the firm's own computers reach it, which in 1998 was security enough.
 */
export default function Intranet() {
  const firmName = useGame((s) => s.firmName);
  const player = useGame((s) => s.player);
  const look = usePlayerLook();
  useTitle(`${firmName} Intranet`);
  const staff = useStaff();
  const desk = useDesk();
  const lifestyle = useLifestyle();
  const record = useRecord();
  const people = staff?.people ?? [];
  const onStaff = people.filter((p) => p.status === 'staff');
  const today = useGame((s) => (s.snapshot ? dayOf(s.snapshot.time) : 0));
  const memos = memosOf(people, staff?.office ?? 0, staff?.moved, desk?.letter, lifestyle?.assets[0]?.bought, today);
  const trophies = (record?.achievements ?? []).filter((a) => a.day !== undefined);
  return (
    <SiteFrame
      home={intranetHost(firmName)}
      logo={`${firmName} Intranet`}
      tagline="CONFIDENTIAL — for employees only"
      look={{ head: '#404040', ink: '#fff', accent: '#404040', page: '#e8e8e8', font: 'Tahoma, Verdana, sans-serif' }}
      footer="If you can read this and you do not work here, please close your browser and forget what you saw."
    >
      <div className="intranet">
        <div>
          <h2>Staff Directory</h2>
          <div className="frame-card">
            {look && <Portrait ceo={look.ceo} size={48} title={look.player.ceoName} />}
            <div>
              <b>{player?.ceoName ?? 'You'}</b>
              <br />
              Chief Executive
            </div>
          </div>
          {onStaff.map((p) => (
            <div key={p.id} className="frame-card">
              <Portrait ceo={decodeCeo(p.ceo)} size={48} title={p.name} />
              <div>
                <b>{p.name}</b>
                <br />
                {ROLE[p.role].title}, since {formatDate(p.hired!)}
              </div>
            </div>
          ))}
          {!onStaff.length && (
            <p className="hint">
              Nobody else works here yet. <Link href={`http://${MONSTROUS}/`}>Monstrous.com</Link> has résumés.
            </p>
          )}
        </div>
        <div>
          <h2>Memos</h2>
          {memos.length ? (
            memos.slice(0, 12).map((m, k) => (
              <div key={k} className="memo">
                <small>
                  MEMO — {formatDate(m.day)} — FROM: {player?.ceoName ?? 'The Chief Executive'}
                </small>
                <p>{m.text}</p>
              </div>
            ))
          ) : (
            <p className="hint">No memos. It is quiet. Too quiet.</p>
          )}
          <h2>Trophy Shelf</h2>
          <div className="trophy-shelf">
            {trophies.map((a) => (
              <span key={a.id} className="trophy" title={`${a.text} (${formatDate(a.day!)})`}>
                🏆
                <small>{a.name}</small>
              </span>
            ))}
            {(record?.league ?? []).map((l) => (
              <span key={l.year} className="trophy" title={`Barren’s league table ${l.year}: ${l.rank} of ${l.of}, ${signedPct(l.ret)}`}>
                {l.rank === 1 ? '🥇' : l.rank <= 3 ? '🥈' : '📜'}
                <small>
                  {l.year}: #{l.rank}
                </small>
              </span>
            ))}
            {!trophies.length && !record?.league.length && <p className="hint">Empty, apart from a dusty “World’s Best Boss” mug.</p>}
          </div>
        </div>
      </div>
    </SiteFrame>
  );
}

/** Memos from the facts: hires and departures, wages owed, the move, the quarterly letter, the first luxury. Newest first. */
function memosOf(
  people: Employee[], office: number, moved: number | undefined, letter: { quarter: number; tone: keyof typeof TONE } | undefined, luxury: number | undefined, today: number,
) {
  const memos: { day: number; text: string }[] = [];
  for (const p of people) {
    if (p.hired !== undefined) memos.push({ day: p.hired, text: `Please welcome ${p.name}, our new ${ROLE[p.role].title}. Their desk is ${OFFICES[office].capacity > 6 ? 'by the window' : 'next to the photocopier'}.` });
    if (p.left !== undefined && p.why) memos.push({ day: p.left, text: `${p.name} ${WHY[p.why]}. Their stapler is now available.` });
    if (p.status === 'staff' && p.owed > 0) memos.push({ day: today, text: `Payroll: wages owed to ${p.name} (${money(p.owed)}) will be paid as soon as cash allows. Thank you for your patience.` });
  }
  if (moved !== undefined && office > 0) memos.push({ day: moved, text: `We have moved to ${OFFICES[office].name}, ${OFFICES[office].address}. Please update your letterhead.` });
  if (letter) {
    const day = Date.UTC(Math.floor(letter.quarter / 4), (letter.quarter % 4) * 3, 1) / 86_400_000;
    memos.push({ day: Math.min(today, day), text: `This quarter’s letter to clients went out in a ${TONE[letter.tone]} tone. If a client calls, stay on message.` });
  }
  if (luxury !== undefined) memos.push({ day: luxury, text: 'A reminder that the firm’s luxuries are for client entertainment only. Yes, the yacht too.' });
  return memos.sort((a, b) => b.day - a.day);
}
