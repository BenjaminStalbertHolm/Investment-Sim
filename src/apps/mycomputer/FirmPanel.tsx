import { useState } from 'react';
import type { LogoSpec } from '../../art/logo/Logo';
import { simulation } from '../../sim/client';
import type { Client } from '../../sim/clients';
import { DEFAULT_FEES } from '../../sim/clients';
import { formatDate, dayOf } from '../../sim/calendar';
import { useAccountData } from '../../state/game';
import { VirtualTable, type Column } from '../../ui98/VirtualTable';
import { describeConstraint } from '../mail/letters';
import { money, pct } from '../format';
import { encodeLogo } from '../../art/logo/code';
import { Logo } from '../../art/logo/Logo';
import { showError, updatePlayer } from '../../state/game';
import { Prompt } from '../../ui98/Modal';
import { encodeCeo } from '../../world/ceo';
import { LogoDesigner } from './LogoDesigner';
import { PlayerBadge, usePlayerLook } from './PlayerBadge';
import { PortraitDesigner } from './PortraitDesigner';

type Editing = 'logo' | 'ceo' | 'rename';

/** My Computer → Firm (spec §17): rename the firm, edit its logo and CEO, and view the ID badge. */
export function FirmPanel() {
  const look = usePlayerLook();
  const [editing, setEditing] = useState<Editing>();
  const [logo, setLogo] = useState<LogoSpec | undefined>(look?.logo);
  const [ceo, setCeo] = useState(look?.ceo);
  const [name, setName] = useState(look?.player.ceoName ?? '');
  if (!look) return null;
  const { player } = look;
  const save = (change: Parameters<typeof updatePlayer>[0]) => {
    setEditing(undefined);
    void updatePlayer(change).catch(showError);
  };
  const edit = (what: Editing) => {
    setLogo(look.logo);
    setCeo(look.ceo);
    setName(player.ceoName);
    setEditing(what);
  };

  if (editing === 'logo' && logo) {
    return (
      <div className="tab-page firm-panel">
        <LogoDesigner name={player.firmName} value={logo} onChange={setLogo} />
        <div className="button-row">
          <button className="default" onClick={() => save({ logoCode: encodeLogo(logo) })}>
            OK
          </button>
          <button onClick={() => setEditing(undefined)}>Cancel</button>
        </div>
      </div>
    );
  }
  if (editing === 'ceo' && ceo) {
    return (
      <div className="tab-page firm-panel">
        <PortraitDesigner name={name} onName={setName} value={ceo} onChange={setCeo} />
        <div className="button-row">
          <button className="default" disabled={!name.trim()} onClick={() => save({ ceoCode: encodeCeo(ceo), ceoName: name.trim() })}>
            OK
          </button>
          <button onClick={() => setEditing(undefined)}>Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div className="tab-page firm-panel">
      <div className="firm-panel-summary">
        <PlayerBadge />
        <div>
          <Logo spec={look.logo} name={player.firmName} height={40} />
          <p>
            Chief Executive Officer: <b>{player.ceoName}</b>
          </p>
          <p>
            Logo code: <code>{player.logoCode}</code>
            <br />
            CEO code: <code>{player.ceoCode}</code>
          </p>
          <div className="button-row">
            <button onClick={() => setEditing('rename')}>Rename…</button>
            <button onClick={() => edit('logo')}>Edit logo…</button>
            <button onClick={() => edit('ceo')}>Edit CEO…</button>
          </div>
        </div>
      </div>
      <Clients />
      {editing === 'rename' && (
        <Prompt
          title="Rename Firm"
          label="New name for your firm:"
          initial={player.firmName}
          onOk={(firmName) => save({ firmName })}
          onCancel={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

const STATUS: Record<Client['status'], string> = { prospect: 'Offer open', active: 'Client', left: 'Left', declined: 'Declined', expired: 'Offer lapsed' };

/** Clients, fees and reputation (spec §15.1, §17 Firm: fee structure). */
function Clients() {
  const view = useAccountData(() => simulation().clients());
  const [fees, setFees] = useState<{ management: string; performance: string }>();
  if (!view) return null;
  const current = view.fees ?? DEFAULT_FEES;
  const typed = fees ?? { management: String(current.management * 100), performance: String(current.performance * 100) };
  const management = Number(typed.management) / 100;
  const performance = Number(typed.performance) / 100;
  const valid = management >= 0 && management <= 0.05 && performance >= 0 && performance <= 0.5;
  const rows = view.clients.filter((c) => c.status === 'active' || c.status === 'left').sort((a, b) => a.id - b.id);
  const columns: Column<Client>[] = [
    { header: 'Client', cell: (c) => c.name },
    { header: 'Status', cell: (c) => (c.redeeming ? 'Leaving' : STATUS[c.status]) },
    { header: 'Assets', align: 'right', cell: (c) => (c.status === 'active' ? money(c.units * view.unit) : '—') },
    { header: 'Since', cell: (c) => (c.joined !== undefined ? formatDate(dayOf(c.joined)) : '') },
    { header: 'Mandate', cell: (c) => (c.constraints.length ? c.constraints.map(describeConstraint).join('; ') : 'No restrictions') },
  ];
  return (
    <fieldset className="firm-clients">
      <legend>Clients and fees</legend>
      <p>
        Assets under management <b>{money(view.aum)}</b> · clients’ money {money(view.clientAssets)} · the firm’s own{' '}
        {money(view.firmCapital)} · fees earned {money(view.feesEarned)} · reputation <b>{Math.round(view.reputation)}</b>/100
      </p>
      <div className="field-row">
        <label htmlFor="fee-management">Management fee:</label>
        <input id="fee-management" size={4} value={typed.management} onChange={(e) => setFees({ ...typed, management: e.target.value })} />
        <span>% a year</span>
        <label htmlFor="fee-performance">Performance fee:</label>
        <input id="fee-performance" size={4} value={typed.performance} onChange={(e) => setFees({ ...typed, performance: e.target.value })} />
        <span>% above the MAJOR 500</span>
        <button
          disabled={!valid || (management === current.management && performance === current.performance)}
          onClick={() => void updatePlayer({ fees: { management, performance } }).then(() => setFees(undefined), showError)}
        >
          Apply
        </button>
      </div>
      <p className="hint">
        Fees come out of your clients’ share of the book and add to the firm’s own. Charge less than 1% and 20% and more
        mandates come your way; charge more and fewer do. Current: {pct(current.management)} and {pct(current.performance, 0)}.
      </p>
      <VirtualTable rows={rows} columns={columns} rowKey={(c) => c.id} empty="No clients: the firm invests its own capital." />
    </fieldset>
  );
}
