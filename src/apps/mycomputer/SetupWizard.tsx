import { useEffect, useRef, useState } from 'react';
import { Badge } from '../../art/badge/Badge';
import { DEFAULT_LOGO, encodeLogo } from '../../art/logo/code';
import { Logo, type LogoSpec } from '../../art/logo/Logo';
import { employeeNumber } from '../../sim/player';
import { DIFFICULTIES, type GameSettings } from '../../sim/settings';
import { useBrowser } from '../../state/browser';
import { closeSetup, newGame, randomSeed, showError, standardGame, useGame } from '../../state/game';
import { Confirm } from '../../ui98/Modal';
import { ceoName, encodeCeo, randomCeo, type Ceo } from '../../world/ceo';
import { Rng } from '../../world/rng';
import { PRESET_FIRMS, playerFirmName, presetLogo, type Strategy } from '../../world/presetFirms';
import { money } from '../format';
import { AdvancedSettings, difficultyLabel, type SetupOptions } from './AdvancedSettings';
import { LogoDesigner } from './LogoDesigner';
import { PortraitDesigner } from './PortraitDesigner';
import { PlayerBadge } from './PlayerBadge';
import { label } from './designer';

const STEPS = ['Welcome', 'Choose your firm', 'Design your CEO', 'Difficulty', 'Generating the market', 'Finish'] as const;
const STRATEGIES: Record<Strategy, string> = {
  index: 'Index', balanced: 'Balanced', momentum: 'Momentum', growth: 'Growth', value: 'Value',
  stockPicking: 'Active stock-picking', quant: 'Quant', macro: 'Macro', activist: 'Activist',
};
const LEVELS = ['easy', 'medium', 'hard'] as const;
/** The install takes at least this long, so it reads as an install (spec §5). */
const INSTALL_MS = 2600;

function DifficultyCard({ level, selected, onPick }: { level: (typeof LEVELS)[number]; selected: boolean; onPick(): void }) {
  const s = DIFFICULTIES[level];
  return (
    <button className={`difficulty-card${selected ? ' selected' : ''}`} aria-pressed={selected} onClick={onPick}>
      <b>{label(level)}</b>
      <span>Starting capital {money(s.startingCapital)}</span>
      <span>
        Commission {money(s.commission.fixed)}
        {s.commission.rate ? ` + ${s.commission.rate * 100}%` : ''} a trade
      </span>
      <span>Volatility {s.volatility}×</span>
      <span>Leverage {s.maxLeverage}:1</span>
      <span>{{ easy: 'Forgiving clients, tight spreads', medium: 'Normal everything', hard: 'Demanding clients, wide spreads on small caps' }[level]}</span>
    </button>
  );
}

/** The install animation: real world generation, padded so it reads as an install. */
function Install({ companies, done }: { companies: number; done: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(() => setElapsed(performance.now() - start), 50);
    return () => clearInterval(timer);
  }, []);
  // Hold at 95% until the market really exists.
  const progress = Math.min(done ? 1 : 0.95, elapsed / INSTALL_MS);
  const status =
    progress < 0.7
      ? `Installing market… ${Math.round((progress / 0.7) * companies).toLocaleString('en-US')} of ${companies.toLocaleString('en-US')} companies`
      : progress < 0.85
        ? 'Registering competitors…'
        : progress < 1
          ? 'Printing money…'
          : 'Setup is complete.';
  return (
    <>
      <p>Please wait while Setup installs your market. This may take a few moments.</p>
      <div className="install-progress progress-indicator segmented">
        <span className="progress-indicator-bar" style={{ width: `${progress * 100}%` }} />
      </div>
      <p>{status}</p>
    </>
  );
}

/**
 * The Setup Wizard (spec §5): a 98 installer with Back / Next / Cancel. It fills the screen at first power-on and
 * when My Computer → New Game relaunches it.
 */
export default function SetupWizard() {
  const hadGame = useRef(useGame.getState().ready).current;
  const rng = useRef(Rng.stream(randomSeed(), 'setup')).current;
  const [step, setStep] = useState(0);
  const [firm, setFirm] = useState<string>('own');
  const [ownName, setOwnName] = useState('Garage Capital');
  const [ownLogo, setOwnLogo] = useState<LogoSpec>(DEFAULT_LOGO);
  const [ceo, setCeo] = useState<Ceo>(() => randomCeo(rng));
  const [name, setName] = useState(() => ceoName(ceo));
  const [options, setOptions] = useState<SetupOptions>(() => ({
    seed: randomSeed(),
    companyCount: 10_000,
    settings: DIFFICULTIES.medium,
    dialup: useBrowser.getState().dialup,
  }));
  const [advanced, setAdvanced] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [animating, setAnimating] = useState(false);

  const preset = PRESET_FIRMS.find((f) => f.id === firm);
  const firmName = preset ? playerFirmName(preset) : ownName.trim();
  const logo = preset ? presetLogo(preset) : ownLogo;
  const taken = !preset && PRESET_FIRMS.some((f) => f.name.toLowerCase() === firmName.toLowerCase());
  const level = difficultyLabel(options);
  const ceoCode = encodeCeo(ceo);

  const install = async () => {
    setStep(4);
    setAnimating(true);
    setTimeout(() => setAnimating(false), INSTALL_MS);
    try {
      const settings: GameSettings = { ...options.settings, difficulty: level };
      await newGame({
        seed: options.seed.trim() || randomSeed(),
        companyCount: options.companyCount,
        competitorCount: options.competitorCount,
        playerFirm: preset?.id,
        settings,
        firmName,
        player: { logoCode: encodeLogo(logo), ceoName: name.trim() || ceoName(ceo), ceoCode },
      });
      useBrowser.getState().setDialup(options.dialup);
      setInstalled(true);
    } catch (error) {
      showError(error);
      setStep(3);
    }
  };
  const done = installed && !animating;
  useEffect(() => {
    if (done && step === 4) setStep(5);
  }, [done, step]);

  const canNext = [true, !!firmName && !taken, !!name.trim(), true, false, false][step];
  const next = () => (step === 3 ? void install() : setStep(step + 1));

  const page = (() => {
    switch (step) {
      case 0:
        return (
          <>
            <h2>Welcome to Majorsoft Doors 98 Firm Setup.</h2>
            <p>This wizard sets up your investment firm: its name and logo, your chief executive, and how hard the market will be on you.</p>
            <p>Setup then installs a market of listed companies, registers your competitors and prints your clients' money.</p>
            <p>To continue, click Next.</p>
          </>
        );
      case 1:
        return (
          <>
            <h2>Choose your firm</h2>
            <p>Run one of the big names (the others become your competitors), or found your own.</p>
            <div className="firm-choices">
              {PRESET_FIRMS.map((f) => (
                <button key={f.id} className={`firm-choice${firm === f.id ? ' selected' : ''}`} aria-pressed={firm === f.id} onClick={() => setFirm(f.id)}>
                  <Logo spec={presetLogo(f)} name={f.name} height={22} />
                  <small>
                    {STRATEGIES[f.strategy]}
                    {f.parent ? ` · the asset-management arm; ${f.parent} stays listed` : ''}
                  </small>
                </button>
              ))}
              <button className={`firm-choice${firm === 'own' ? ' selected' : ''}`} aria-pressed={firm === 'own'} onClick={() => setFirm('own')}>
                <b>Create my own firm</b>
                <small>Name it and design its logo.</small>
              </button>
            </div>
            {firm === 'own' && (
              <fieldset>
                <legend>Your firm</legend>
                <div className="field-row">
                  <label htmlFor="setup-firm-name">Firm name:</label>
                  <input id="setup-firm-name" value={ownName} maxLength={40} size={32} onChange={(e) => setOwnName(e.target.value)} />
                </div>
                {taken && <p className="code-error">That name belongs to a competitor. Pick it from the list above instead.</p>}
                <LogoDesigner name={ownName} value={ownLogo} onChange={setOwnLogo} />
              </fieldset>
            )}
          </>
        );
      case 2:
        return (
          <>
            <h2>Design your CEO</h2>
            <PortraitDesigner
              name={name}
              onName={setName}
              value={ceo}
              onChange={setCeo}
              preview={
                <Badge
                  firmName={firmName}
                  logo={logo}
                  ceoName={name.trim() || '—'}
                  ceo={ceo}
                  ceoCode={ceoCode}
                  employeeNo={employeeNumber(options.seed)}
                />
              }
            />
          </>
        );
      case 3:
        return (
          <>
            <h2>Difficulty</h2>
            <p>Hard is hard because of fees, volatility, demanding clients and market impact at scale, not just the capital.</p>
            <div className="difficulty-cards">
              {LEVELS.map((l) => (
                <DifficultyCard
                  key={l}
                  level={l}
                  selected={level === l}
                  onPick={() => {
                    const { startYear, modules } = options.settings;
                    setOptions({ ...options, companyCount: 10_000, competitorCount: undefined, settings: { ...DIFFICULTIES[l], startYear, modules } });
                  }}
                />
              ))}
            </div>
            <p className="difficulty-label">
              Difficulty: <b>{label(level)}</b>
              {level === 'custom' && ' (you changed the advanced settings)'} · World seed <b>{options.seed}</b>
            </p>
            <button onClick={() => setAdvanced(true)}>Advanced settings…</button>
            {advanced && <AdvancedSettings value={options} onChange={setOptions} onClose={() => setAdvanced(false)} />}
          </>
        );
      case 4:
        return (
          <>
            <h2>Generating the market</h2>
            <Install companies={options.companyCount} done={installed} />
          </>
        );
      default:
        return (
          <div className="finish-page">
            <PlayerBadge />
            <div>
              <h2>Setup is complete</h2>
              <p>
                Welcome aboard, {name.trim() || 'boss'}. {firmName} is open for business with {money(options.settings.startingCapital)} of
                your founding clients' money.
              </p>
              <p>Click your badge to flip it. Click Start Doors to go to your desktop.</p>
            </div>
          </div>
        );
    }
  })();

  return (
    <div className="setup-screen">
      <h1 className="setup-title">Majorsoft Doors 98 Setup</h1>
      <div className="window setup-window" role="dialog" aria-label="Majorsoft Doors 98 Firm Setup">
        <div className="title-bar">
          <div className="title-bar-text">Majorsoft Doors 98 Firm Setup</div>
        </div>
        <div className="window-body">
          <div className="setup-body">
            <div className="setup-banner">
              <b>Firm Setup</b>
              <ol>
                {STEPS.map((s, i) => (
                  <li key={s} className={i === step ? 'current' : undefined}>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
            <div className="setup-page">{page}</div>
          </div>
          <div className="setup-buttons">
            {step < 5 ? (
              <>
                <button disabled={step === 0 || step === 4} onClick={() => setStep(step - 1)}>
                  &lt; Back
                </button>
                <button className="default spacer" disabled={!canNext} onClick={next}>
                  {step === 3 ? 'Install' : 'Next >'}
                </button>
                <button disabled={step === 4} onClick={() => setCancelling(true)}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="default" onClick={closeSetup}>
                Start Doors
              </button>
            )}
          </div>
        </div>
        {cancelling && (
          <Confirm
            title="Exit Setup"
            ok="Exit Setup"
            onOk={() => {
              setCancelling(false);
              if (hadGame) closeSetup();
              else void standardGame().then(closeSetup, showError);
            }}
            onCancel={() => setCancelling(false)}
          >
            {hadGame
              ? 'Setup is not complete. Exit Setup and go back to your game?'
              : 'Setup is not complete. Exit Setup and install Doors with the standard settings?'}
          </Confirm>
        )}
      </div>
    </div>
  );
}
