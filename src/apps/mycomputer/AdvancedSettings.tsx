import { useId, useState, type ReactNode } from 'react';
import type { Dialup } from '../../state/browser';
import { randomSeed } from '../../state/game';
import { changeSettings, difficultyOf, type Difficulty, type GameSettings, type Level } from '../../sim/settings';
import { Modal } from '../../ui98/Modal';

/** Everything the Setup Wizard asks (spec §9): world options, the settings and the browser's dial-up delay. */
export interface SetupOptions {
  seed: string;
  companyCount: number;
  /** Competitor firms, 0–20; the default is the unchosen presets plus 4–8 generated firms. */
  competitorCount?: number;
  settings: GameSettings;
  dialup: Dialup;
}

/** The difficulty label (spec §9): Custom once any value that changes the game differs from a preset. */
export function difficultyLabel(o: SetupOptions): Difficulty {
  return o.companyCount !== 10_000 || o.competitorCount !== undefined ? 'custom' : difficultyOf(o.settings);
}

function NumberField(props: { label: string; value: number; min: number; max: number; step?: number; scale?: number; onChange(v: number): void }) {
  const id = useId();
  const scale = props.scale ?? 1;
  const [text, setText] = useState<string>();
  return (
    <div className="field-row">
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        type="number"
        min={props.min * scale}
        max={props.max * scale}
        step={props.step ?? 'any'}
        value={text ?? String(Math.round(props.value * scale * 1e6) / 1e6)}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value) / scale;
          if (e.target.value !== '' && v >= props.min && v <= props.max) props.onChange(v);
        }}
        onBlur={() => setText(undefined)}
      />
    </div>
  );
}

function Check(props: { label: string; value: boolean; onChange(v: boolean): void }) {
  const id = useId();
  return (
    <div className="field-row">
      <input id={id} type="checkbox" checked={props.value} onChange={(e) => props.onChange(e.target.checked)} />
      <label htmlFor={id}>{props.label}</label>
    </div>
  );
}

function Choice<T extends string>(props: { label: string; value: T; options: [T, string][]; onChange(v: T): void }) {
  const id = useId();
  return (
    <div className="field-row">
      <label htmlFor={id}>{props.label}</label>
      <select id={id} value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

const levels = (low: string, normal: string, high: string): [Level, string][] => [['low', low], ['normal', normal], ['high', high]];

const TABS = ['Market', 'Trading', 'Competitors & clients', 'Risk', 'Fun modules'] as const;

/** The tabbed Advanced Settings dialog (spec §9). Changing any value that affects play switches the label to Custom. */
export function AdvancedSettings({ value, onChange, onClose }: { value: SetupOptions; onChange(o: SetupOptions): void; onClose(): void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Market');
  const s = value.settings;
  const set = (change: Partial<GameSettings>) => onChange({ ...value, settings: changeSettings(s, change) });
  const pages: Record<(typeof TABS)[number], ReactNode> = {
    Market: (
      <>
        <NumberField label="Starting capital ($)" value={s.startingCapital} min={1_000} max={10_000_000_000} step={1000} onChange={(v) => set({ startingCapital: Math.round(v) })} />
        <NumberField label="Number of companies" value={value.companyCount} min={1_000} max={10_000} step={100} onChange={(v) => onChange({ ...value, companyCount: Math.round(v) })} />
        <div className="field-row">
          <label htmlFor="advanced-seed">World seed</label>
          <input id="advanced-seed" value={value.seed} size={12} onChange={(e) => onChange({ ...value, seed: e.target.value })} />
          <button onClick={() => onChange({ ...value, seed: randomSeed() })}>Randomise</button>
        </div>
        <p className="hint">The same seed always builds the same market, so you can share it.</p>
        <NumberField label="Start year (5 Jan)" value={s.startYear} min={1970} max={2030} step={1} onChange={(v) => set({ startYear: Math.round(v) })} />
        <NumberField label="Volatility multiplier (×)" value={s.volatility} min={0.25} max={3} step={0.05} onChange={(v) => set({ volatility: v })} />
        <NumberField label="Event frequency (×)" value={s.events} min={0} max={3} step={0.25} onChange={(v) => set({ events: v })} />
        <NumberField label="Crash and bubble frequency (×)" value={s.crashes} min={0} max={4} step={0.25} onChange={(v) => set({ crashes: v })} />
      </>
    ),
    Trading: (
      <>
        <NumberField label="Commission per trade ($)" value={s.commission.fixed} min={0} max={1000} step={0.05} onChange={(v) => set({ commission: { ...s.commission, fixed: v } })} />
        <NumberField label="Commission on value traded (%)" value={s.commission.rate} scale={100} min={0} max={0.05} step={0.01} onChange={(v) => set({ commission: { ...s.commission, rate: v } })} />
        <NumberField label="Spread multiplier (×)" value={s.spread} min={0.1} max={5} step={0.1} onChange={(v) => set({ spread: v })} />
        <NumberField label="Extra spread under $2B (×)" value={s.smallCapSpread} min={1} max={5} step={0.1} onChange={(v) => set({ smallCapSpread: v })} />
        <NumberField label="Market impact of your orders (×)" value={s.impact} min={0} max={3} step={0.1} onChange={(v) => set({ impact: v })} />
        <NumberField label="Max leverage on stocks (x:1)" value={s.maxLeverage} min={1} max={4} step={0.25} onChange={(v) => set({ maxLeverage: v })} />
        <NumberField label="Margin call grace (trading days)" value={s.marginGrace} min={1} max={5} step={1} onChange={(v) => set({ marginGrace: Math.round(v) })} />
        <Check label="Short selling" value={s.shortSelling} onChange={(v) => set({ shortSelling: v })} />
        <Check label="Futures and commodities" value={s.futures} onChange={(v) => set({ futures: v })} />
      </>
    ),
    'Competitors & clients': (
      <>
        <Check label="Default number of competitors (the other presets and 4–8 more)" value={value.competitorCount === undefined} onChange={(v) => onChange({ ...value, competitorCount: v ? undefined : 12 })} />
        {value.competitorCount !== undefined && (
          <NumberField label="Competitor firms" value={value.competitorCount} min={0} max={20} step={1} onChange={(v) => onChange({ ...value, competitorCount: Math.round(v) })} />
        )}
        <Choice label="Competitor aggressiveness" value={s.aggression} options={levels('Passive', 'Normal', 'Aggressive')} onChange={(aggression) => set({ aggression })} />
        <Check label="Client system (off: a sandbox with your own capital)" value={s.clients} onChange={(v) => set({ clients: v })} />
        <Choice label="Client patience" value={s.clientPatience} options={levels('Forgiving', 'Normal', 'Demanding')} onChange={(clientPatience) => set({ clientPatience })} />
        <Check label="Insider tips" value={s.insiderTips} onChange={(v) => set({ insiderTips: v })} />
        <NumberField label="Genuine tips (%)" value={s.tipReliability} scale={100} min={0} max={1} step={5} onChange={(v) => set({ tipReliability: v })} />
      </>
    ),
    Risk: (
      <>
        <Check label="Ironman (single autosave, no reloading)" value={s.ironman} onChange={(v) => set({ ironman: v })} />
        <Check label="No bankruptcy (cash can go negative)" value={s.noBankruptcy} onChange={(v) => set({ noBankruptcy: v })} />
        <Check label="Dark web" value={s.darkWeb} onChange={(v) => set({ darkWeb: v })} />
        <NumberField label="Dark web odds (points)" value={s.darkWebOdds} scale={100} min={-0.5} max={0.5} step={5} onChange={(v) => set({ darkWebOdds: v })} />
        <NumberField label="Loan interest multiplier (×)" value={s.loanRates} min={0} max={3} step={0.05} onChange={(v) => set({ loanRates: v })} />
        <NumberField label="Heat decay (×)" value={s.heatDecay} min={0} max={3} step={0.25} onChange={(v) => set({ heatDecay: v })} />
        <Choice label="Regulator and audit strictness" value={s.scrutiny} options={levels('Lenient', 'Normal', 'Strict')} onChange={(scrutiny) => set({ scrutiny })} />
        <Choice<Dialup>
          label="Dial-up loading delay"
          value={value.dialup}
          options={[['off', 'Off'], ['short', 'Short'], ['authentic', 'Authentic']]}
          onChange={(dialup) => onChange({ ...value, dialup })}
        />
      </>
    ),
    'Fun modules': (
      <>
        <p>Optional extras. They don't change the difficulty label, and you can switch them later in My Computer → Game.</p>
        <Check label="Geopolitics (Encarter 98 world atlas)" value={s.modules.geopolitics} onChange={(v) => set({ modules: { ...s.modules, geopolitics: v } })} />
        <Check label="1998-era events" value={s.modules.periodEvents} onChange={(v) => set({ modules: { ...s.modules, periodEvents: v } })} />
        <Check label="Recurring gags and storylines" value={s.modules.gags} onChange={(v) => set({ modules: { ...s.modules, gags: v } })} />
      </>
    ),
  };
  const label = difficultyLabel(value);

  return (
    <Modal title="Advanced Settings" onClose={onClose}>
      <div className="advanced-settings">
        <menu role="tablist" className="multirows">
          {TABS.map((t) => (
            <li key={t} role="tab" aria-selected={tab === t}>
              <a
                href={`#${t}`}
                onClick={(e) => {
                  e.preventDefault();
                  setTab(t);
                }}
              >
                {t}
              </a>
            </li>
          ))}
        </menu>
        <div className="window tab-panel" role="tabpanel">
          {pages[tab]}
        </div>
        <div className="dialog-buttons">
          <span>
            Difficulty: <b>{label[0].toUpperCase() + label.slice(1)}</b>
          </span>
          <button className="default" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </Modal>
  );
}
