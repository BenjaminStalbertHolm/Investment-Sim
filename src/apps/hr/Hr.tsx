import { useState } from 'react';
import { Portrait } from '../../art/portrait/Portrait';
import { formatDate } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { FUNDS } from '../../sim/data/funds';
import { OFFICES, ROLE, ROLES } from '../../sim/data/staff';
import type { Employee } from '../../sim/staff';
import { decodeCeo } from '../../world/ceo';
import { openUrl, showError, useGame } from '../../state/game';
import { useDesk, useStaff } from '../../sites/hooks';
import { GREGSLIST, MONSTROUS } from '../../sites/urls';
import { Confirm, Prompt } from '../../ui98/Modal';
import { Tabs } from '../../ui98/Tabs';
import { AppMenuBar } from '../AppMenuBar';
import { money, pct } from '../format';
import type { AppProps } from '../types';
import '../programs.css';

type Tab = 'staff' | 'applicants' | 'office' | 'rules';

const act = (p: Promise<string | undefined>) => void p.then((e) => e && showError(e));
const Meter = ({ value, label }: { value: number; label: string }) => (
  <span className="hr-meter" title={`${label} ${pct(value, 0)}`}>
    <span style={{ width: `${Math.round(value * 100)}%` }} />
  </span>
);

/**
 * PeopleSoftie HR (spec §4A): the staff, applicants from Monstrous.com, the office they work in (Greg's List), and the
 * automated rules a Trader runs.
 */
export default function Hr({ windowId }: AppProps) {
  const [tab, setTab] = useState<Tab>('staff');
  const staff = useStaff();
  const people = staff?.people ?? [];
  const onStaff = people.filter((p) => p.status === 'staff');
  return (
    <div className="app hr">
      <AppMenuBar windowId={windowId} menus={[{ label: 'Go', items: [{ label: 'Monstrous.com', onClick: () => openUrl(`http://${MONSTROUS}/`) }, { label: 'Greg’s List (offices)', onClick: () => openUrl(`http://${GREGSLIST}/`) }] }]} />
      <Tabs<Tab> tabs={[['staff', `Staff (${onStaff.length})`], ['applicants', 'Applicants'], ['office', 'Office & Payroll'], ['rules', 'Trader’s Rules']]} value={tab} onChange={setTab} />
      <div className="window tab-panel" role="tabpanel">
        {tab === 'staff' && <People list={onStaff} kind="staff" empty="Nobody works here yet. The Applicants tab has people looking for work." />}
        {tab === 'applicants' && <People list={people.filter((p) => p.status === 'applicant')} kind="applicant" empty="No applicants this week. Check back after Friday." />}
        {tab === 'office' && staff && <Office />}
        {tab === 'rules' && <Rules />}
      </div>
      <div className="status-bar">
        <p className="status-bar-field">{staff ? `${onStaff.length} of ${staff.capacity} desks` : '…'}</p>
        <p className="status-bar-field">Payroll {staff ? money(staff.payroll) : '—'} a month</p>
        {!!staff?.owed && <p className="status-bar-field down">Wages owed {money(staff.owed)}</p>}
      </div>
    </div>
  );
}

function People({ list, kind, empty }: { list: Employee[]; kind: 'staff' | 'applicant'; empty: string }) {
  const [raise, setRaise] = useState<Employee>();
  const [firing, setFiring] = useState<Employee>();
  if (!list.length) return <p className="hint">{empty}</p>;
  return (
    <div className="hr-people">
      {list.map((p) => (
        <div key={p.id} className="hr-card">
          <Portrait ceo={decodeCeo(p.ceo)} size={56} title={p.name} />
          <div className="hr-card-text">
            <b>{p.name}</b> — {ROLE[p.role].title}
            <br />
            {money(p.salary)} a year{kind === 'staff' && p.hired !== undefined ? `, since ${formatDate(p.hired)}` : ''}
            <br />
            Skill <Meter value={p.skill} label="Skill" /> Loyalty <Meter value={p.loyalty} label="Loyalty" />
            {p.owed > 0 && <span className="down"> Owed {money(p.owed)}</span>}
            {p.offer && <span className="down"> Has an offer from a rival</span>}
            <p className="hint">{ROLE[p.role].duty}</p>
          </div>
          <div className="hr-card-buttons">
            {kind === 'applicant' ? (
              <button className="default" onClick={() => act(simulation().staffAction({ do: 'hire', id: p.id }))}>
                Hire
              </button>
            ) : (
              <>
                <button onClick={() => setRaise(p)}>Give a Raise…</button>
                <button onClick={() => setFiring(p)}>Let Go…</button>
              </>
            )}
          </div>
        </div>
      ))}
      {raise && (
        <Prompt
          title="Give a Raise"
          label={`Raise ${raise.name}’s salary of ${money(raise.salary)} by what percentage?`}
          initial="10"
          onOk={(v) => {
            setRaise(undefined);
            act(simulation().staffAction({ do: 'raise', id: raise.id, pct: Number(v) / 100 }));
          }}
          onCancel={() => setRaise(undefined)}
        />
      )}
      {firing && (
        <Confirm
          title="Let Go"
          ok="Let Go"
          onOk={() => {
            setFiring(undefined);
            act(simulation().staffAction({ do: 'fire', id: firing.id }));
          }}
          onCancel={() => setFiring(undefined)}
        >
          Let {firing.name} go? Severance is a month’s salary ({money(firing.salary / 12)}).
        </Confirm>
      )}
    </div>
  );
}

function Office() {
  const staff = useStaff()!;
  const office = OFFICES[staff.office];
  return (
    <div className="tab-page">
      <fieldset>
        <legend>Your office</legend>
        <p>
          <b>{office.name}</b>, {office.address}
          <br />
          Rent {money(office.rent)} a month · room for {office.capacity} staff · prestige {office.prestige}
        </p>
        <p className="hint">{office.blurb}</p>
        <button onClick={() => openUrl(`http://${GREGSLIST}/`)}>Look for Offices on Greg’s List…</button>
      </fieldset>
      <fieldset>
        <legend>This month’s bills (paid on the first trading day)</legend>
        <table className="ticket-estimate">
          <tbody>
            <tr><td>Wages</td><td>{money(staff.payroll)}</td></tr>
            <tr><td>Rent</td><td>{money(staff.bills.rent)}</td></tr>
            <tr><td>Upkeep of luxuries</td><td>{money(staff.bills.upkeep)}</td></tr>
            <tr><td>Subscriptions</td><td>{money(staff.bills.subscriptions)}</td></tr>
            <tr><td><b>Total</b></td><td><b>{money(staff.payroll + staff.bills.rent + staff.bills.upkeep + staff.bills.subscriptions)}</b></td></tr>
          </tbody>
        </table>
        <p className="hint">Prestige {staff.prestige}: an impressive address and luxuries bring bigger mandate offers.</p>
      </fieldset>
      <fieldset>
        <legend>Roles</legend>
        <ul>
          {ROLES.map((r) => (
            <li key={r.id}>
              <b>{r.title}</b>: {r.duty}
            </li>
          ))}
        </ul>
      </fieldset>
    </div>
  );
}

/** The Trader's automated rules (spec §4A): stop-losses and dollar-cost averaging; the monthly rebalance comes from the Defragmenter. */
function Rules() {
  const desk = useDesk();
  const { tickers } = useGame.getState().directory;
  const [ticker, setTicker] = useState('');
  const [stop, setStop] = useState('10');
  const [dca, setDca] = useState({ what: 'MJR', amount: '10000', every: 'month' as 'week' | 'month' });
  const find = (t: string) => tickers.indexOf(t.trim().toUpperCase());
  const addStop = () => {
    const company = find(ticker);
    if (company < 0) return showError('Unknown symbol.');
    act(simulation().deskAction({ do: 'addRule', rule: { kind: 'stopLoss', company, pct: Number(stop) / 100 } }));
  };
  const addDca = () => {
    const fund = FUNDS.findIndex((f) => f.ticker === dca.what.trim().toUpperCase());
    const company = find(dca.what);
    if (fund < 0 && company < 0) return showError('Unknown symbol.');
    act(simulation().deskAction({ do: 'addRule', rule: { kind: 'dca', ...(fund >= 0 ? { fund } : { company }), amount: Number(dca.amount), every: dca.every } }));
  };
  return (
    <div className="tab-page">
      {!desk?.trader && <p className="ticket-warning">No Trader on staff: rules are kept, but nothing runs until you hire one.</p>}
      <fieldset>
        <legend>Stop-loss</legend>
        <div className="field-row">
          <label htmlFor="hr-stop-ticker">Sell</label>
          <input id="hr-stop-ticker" size={6} value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="Symbol" />
          <label htmlFor="hr-stop-pct">if it falls</label>
          <input id="hr-stop-pct" size={3} value={stop} onChange={(e) => setStop(e.target.value)} />% below cost
          <button onClick={addStop}>Add</button>
        </div>
      </fieldset>
      <fieldset>
        <legend>Dollar-cost averaging</legend>
        <div className="field-row">
          <label htmlFor="hr-dca-what">Buy</label>
          <input id="hr-dca-amount" size={8} value={dca.amount} onChange={(e) => setDca({ ...dca, amount: e.target.value })} aria-label="Amount" />
          <span>dollars of</span>
          <input id="hr-dca-what" size={6} value={dca.what} onChange={(e) => setDca({ ...dca, what: e.target.value })} />
          <select aria-label="How often" value={dca.every} onChange={(e) => setDca({ ...dca, every: e.target.value as 'week' | 'month' })}>
            <option value="week">every week</option>
            <option value="month">every month</option>
          </select>
          <button onClick={addDca}>Add</button>
        </div>
      </fieldset>
      <p className="hint">Rules run while a Trader is on staff. Task Mangler lists them all, including the Portfolio Defragmenter’s monthly rebalance, and ends them.</p>
      <ul className="hr-rules">
        {(desk?.rules ?? []).map((r) => (
          <li key={r.id}>
            {r.kind === 'stopLoss' && `Stop-loss: ${tickers[r.company]} at ${pct(r.pct, 0)} below cost`}
            {r.kind === 'dca' && `Buy ${money(r.amount)} of ${r.fund !== undefined ? FUNDS[r.fund].ticker : tickers[r.company!]} every ${r.every}; next ${formatDate(r.next)}`}
            {r.kind === 'rebalance' && `Monthly rebalance to ${r.targets.length} targets; next ${formatDate(r.next)}`}{' '}
            <button onClick={() => act(simulation().deskAction({ do: 'removeRule', id: r.id }))}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
