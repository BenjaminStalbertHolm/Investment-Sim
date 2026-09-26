import { useState } from 'react';
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
  const [logo, setLogo] = useState(look?.logo);
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
          <p className="hint">Fee structure arrives with your clients (Phase 6).</p>
        </div>
      </div>
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
