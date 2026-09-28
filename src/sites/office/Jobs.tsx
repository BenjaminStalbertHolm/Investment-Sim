import { Portrait } from '../../art/portrait/Portrait';
import { money } from '../../apps/format';
import { START_DAY, formatDate, gameYear } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { ADVERT_WEEKS, OFFICES, ROLE, ROLES } from '../../sim/data/staff';
import { hash } from '../../sim/press';
import { decodeCeo } from '../../world/ceo';
import { useGame } from '../../state/game';
import { useWindows } from '../../state/windows';
import { act, SiteFrame } from '../frame';
import { useStaff } from '../hooks';
import { GREGSLIST, MONSTROUS } from '../urls';
import { HitCounter, Link, useTitle } from '../web';

const stars = (skill: number) => '★'.repeat(Math.max(1, Math.round(skill * 5))).padEnd(5, '☆');

/**
 * Monstrous.com (spec §14.2): the job board where applicants for PeopleSoftie HR post their résumés. Hiring here or in
 * PeopleSoftie is the same; the office must have room.
 */
export function Monstrous({ url }: { url: URL }) {
  useTitle('Monstrous.com — There’s a Monster Job Out There');
  const staff = useStaff();
  const role = url.searchParams.get('role');
  const applicants = (staff?.people ?? []).filter((p) => p.status === 'applicant' && (!role || p.role === role));
  const onStaff = (staff?.people ?? []).filter((p) => p.status === 'staff').length;
  return (
    <SiteFrame
      home={MONSTROUS}
      logo="Monstrous.com"
      tagline="There’s a monster job out there. Or a monster candidate."
      look={{ head: '#5b2a86', ink: '#f6e6ff', accent: '#5b2a86', page: '#fff', font: 'Arial, Helvetica, sans-serif' }}
      nav={[[`http://${MONSTROUS}/`, 'All résumés'], ...ROLES.map((r): [string, string] => [`http://${MONSTROUS}/?role=${r.id}`, `${r.title}s`])]}
      footer={`Monstrous.com — the #1 career site on the World Wide Web. © ${gameYear(START_DAY)}. Résumés stay up for ${ADVERT_WEEKS} weeks.`}
    >
      {staff && (
        <p className="frame-box">
          You employ <b>{onStaff}</b> of the <b>{staff.capacity}</b> your office has room for.{' '}
          {onStaff >= staff.capacity ? (
            <>
              Full up. <Link href={`http://${GREGSLIST}/offices`}>Find a bigger office on Greg’s List »</Link>
            </>
          ) : (
            'Hire below, or in PeopleSoftie HR.'
          )}{' '}
          <button onClick={() => useWindows.getState().open('hr')}>Open PeopleSoftie HR</button>
        </p>
      )}
      <h2>{role ? `${ROLE[role as keyof typeof ROLE]?.title ?? 'Candidate'}s` : 'Candidates'} looking for work</h2>
      {applicants.length ? (
        applicants.map((p) => (
          <div key={p.id} className="frame-card">
            <Portrait ceo={decodeCeo(p.ceo)} size={56} title={p.name} />
            <div>
              <b>{p.name}</b>, {ROLE[p.role].title} <span title="Skill">{stars(p.skill)}</span>
              <br />
              Asking {money(p.salary)} a year. Posted {formatDate(p.posted)}.
              <br />
              <i>“{PITCHES[hash(p.name) % PITCHES.length]}”</i>
            </div>
            <button onClick={() => void act(simulation().staffAction({ do: 'hire', id: p.id }))}>Hire</button>
          </div>
        ))
      ) : (
        <p>No résumés in this category right now. New ones are posted every week.</p>
      )}
      <HitCounter count={4_200_000 + (staff?.people.length ?? 0) * 17} />
    </SiteFrame>
  );
}

const PITCHES = [
  'Team player. Proficient in Exceed 98 and MajorWord. Can type 60 words a minute.',
  'Results-driven self-starter with a passion for synergy.',
  'I have read every issue of Barren’s since 1987. Twice.',
  'Seeking a challenging role in a dynamic environment where I can leverage my skills.',
  'Fluent in Visual Basic and in golf.',
  'References available on request. Please do not call my current employer.',
  'I am detail-oriented. I am detail-oriented.',
  'Former intern at a firm you have heard of. Left on good terms. Mostly.',
];

/** Classified ads that are only there to be read (spec §14.2 Greg's List). */
const ADS = [
  ['For sale', 'Pager, barely used. Still gets pages from my ex. $20 obo.'],
  ['For sale', 'Complete set of Meanie Babies, tags attached, in protective cases. Retirement fund. Serious offers only.'],
  ['For sale', '14.4k modem. Upgraded to 56k. It is FAST.'],
  ['Wanted', 'Roommate for 2-bed near the financial district. Must not be a day trader. We have had three.'],
  ['Wanted', 'Y2K-compliant generator. Will pay cash. Will pay gold.'],
  ['Services', 'Web pages built! Frames, animated GIFs, MIDI music. Your business ONLINE for $299.'],
  ['Services', 'Tax preparer, strip mall, next to the nail salon. Walk-ins welcome.'],
  ['Lost', 'Tamagotcha, blue, answers to “Lucky”. Last seen in the food court. It is probably dead by now.'],
  ['Free', 'Couch. You carry it down four floors. It has seen things.'],
] as const;

/**
 * Greg's List (spec §14.2): classifieds with office space from the garage to the penthouse tower. Rent is monthly; an
 * office caps how many people the firm can employ and lends it standing with prospective clients.
 */
export function GregsList({ url }: { url: URL }) {
  useTitle('Greg’s List');
  const offices = url.pathname === '/offices';
  return (
    <SiteFrame
      home={GREGSLIST}
      logo="greg’s list"
      className="gregs"
      look={{ head: '#fff', ink: '#551a8b', accent: '#551a8b', page: '#fff', font: '"Times New Roman", Times, serif' }}
      nav={[[`http://${GREGSLIST}/`, 'all ads'], [`http://${GREGSLIST}/offices`, 'office / commercial'], [`http://${MONSTROUS}/`, 'jobs']]}
      footer={`© ${gameYear(START_DAY)} greg’s list. Please flag anything weird. There is a lot of it.`}
    >
      {offices ? <Offices /> : <Front />}
    </SiteFrame>
  );
}

function Front() {
  const seed = useGame((s) => s.seed);
  const ads = [...ADS].sort((a, b) => hash(seed, a[1]) - hash(seed, b[1]));
  return (
    <>
      <p>
        <Link href="/offices">
          <b>office / commercial</b>
        </Link>{' '}
        — {OFFICES.length} listings
      </p>
      <ul>
        {ads.map(([section, text]) => (
          <li key={text}>
            <small>[{section}]</small> {text}
          </li>
        ))}
      </ul>
    </>
  );
}

function Offices() {
  const staff = useStaff();
  const onStaff = (staff?.people ?? []).filter((p) => p.status === 'staff').length;
  return (
    <>
      <h2>office / commercial</h2>
      {OFFICES.map((o, tier) => (
        <div key={o.id} className="frame-listing">
          <b>
            {money(o.rent)}/mo — {o.name} — room for {o.capacity}
          </b>{' '}
          <small>({o.address})</small>
          <p>{o.blurb}</p>
          {staff?.office === tier ? (
            <p>
              <i>You work here, since {formatDate(staff.moved)}.</i>
            </p>
          ) : (
            <button disabled={!staff || onStaff > o.capacity} onClick={() => void act(simulation().staffAction({ do: 'move', office: tier }))}>
              Sign the lease ({money(o.rent)} up front)
            </button>
          )}
        </div>
      ))}
      <p className="hint">
        Rent is paid on the first trading day of each month. A better address impresses prospective clients: prestige{' '}
        {OFFICES.map((o) => o.prestige).join(' → ')}, from the garage to the tower.
      </p>
    </>
  );
}
