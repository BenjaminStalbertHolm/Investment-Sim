import { fv, pmt } from 'financial';
import { useEffect, useReducer, useState } from 'react';
import { usePrograms } from '../../state/programs';
import { Tabs } from '../../ui98/Tabs';
import { AppMenuBar } from '../AppMenuBar';
import { count, money } from '../format';
import type { AppProps } from '../types';
import { initial, press, type Key } from './engine';
import '../programs.css';

const STANDARD: Key[][] = [
  ['MC', '7', '8', '9', '÷', '√'],
  ['MR', '4', '5', '6', '×', '%'],
  ['MS', '1', '2', '3', '−', '1/x'],
  ['M+', '0', '±', '.', '+', '='],
];
const SCIENTIFIC: Key[] = ['sin', 'cos', 'tan', 'xʸ', 'x²', 'ln', 'log', 'n!', 'π', 'e'];
const KEYS: Record<string, Key> = { '/': '÷', '*': '×', '-': '−', Enter: '=', Escape: 'C', Backspace: '⌫', Delete: 'CE' };

/** Calculator (spec §4A): Standard, Scientific (degrees) and Financial modes. */
export default function Calculator({ windowId }: AppProps) {
  const mode = usePrograms((s) => s.calculator.mode);
  const setMode = (m: typeof mode) => usePrograms.setState({ calculator: { mode: m } });
  return (
    <div className="app calculator">
      <AppMenuBar windowId={windowId} />
      <Tabs tabs={[['standard', 'Standard'], ['scientific', 'Scientific'], ['financial', 'Financial']] as const} value={mode} onChange={setMode} />
      <div className="window tab-panel" role="tabpanel">
        {mode === 'financial' ? <Financial /> : <Keypad scientific={mode === 'scientific'} />}
      </div>
    </div>
  );
}

function Keypad({ scientific }: { scientific: boolean }) {
  const [s, dispatch] = useReducer(press, initial);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.calculator') || target.tagName === 'INPUT') return;
      const key = KEYS[e.key] ?? e.key;
      if (/^[0-9.+=]$/.test(key) || Object.values(KEYS).includes(key)) {
        e.preventDefault();
        dispatch(key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="calc-body" tabIndex={0}>
      <div className="calc-display sunken-panel" aria-live="polite">
        {s.memory !== 0 && <span className="calc-memory">M</span>}
        {s.display}
      </div>
      <div className="calc-row">
        <button onClick={() => dispatch('⌫')}>Back</button>
        <button onClick={() => dispatch('CE')}>CE</button>
        <button onClick={() => dispatch('C')}>C</button>
      </div>
      {scientific && (
        <div className="calc-grid calc-sci">
          {SCIENTIFIC.map((k) => (
            <button key={k} onClick={() => dispatch(k)}>
              {k}
            </button>
          ))}
        </div>
      )}
      <div className="calc-grid">
        {STANDARD.flat().map((k, i) => (
          <button key={`${k}${i}`} className={/^M/.test(k) ? 'calc-mem' : /[0-9.±]/.test(k) ? 'calc-digit' : 'calc-op'} onClick={() => dispatch(k)}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The Financial mode: compound interest, a loan's payment and position sizing. Arithmetic by `financial`. */
function Financial() {
  const [f, setF] = useState({ principal: 100_000, rate: 7, years: 10, perYear: 12, loan: 250_000, loanRate: 8.5, loanYears: 5, equity: 1_000_000, risk: 1, entry: 50, stop: 45 });
  const n = (key: keyof typeof f) => ({ value: f[key], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [key]: Number(e.target.value) }) });
  const future = -fv(f.rate / 100 / f.perYear, f.years * f.perYear, 0, f.principal);
  const monthly = -pmt(f.loanRate / 100 / 12, f.loanYears * 12, f.loan);
  const perShare = f.entry - f.stop;
  const shares = perShare > 0 ? Math.floor((f.equity * f.risk) / 100 / perShare) : 0;
  return (
    <div className="calc-financial">
      <fieldset>
        <legend>Compound interest</legend>
        <label>Principal <input type="number" {...n('principal')} /></label>
        <label>Rate % a year <input type="number" step="0.1" {...n('rate')} /></label>
        <label>Years <input type="number" {...n('years')} /></label>
        <label>Compounded
          <select value={f.perYear} onChange={(e) => setF({ ...f, perYear: Number(e.target.value) })}>
            <option value={1}>yearly</option>
            <option value={4}>quarterly</option>
            <option value={12}>monthly</option>
            <option value={365}>daily</option>
          </select>
        </label>
        <p>Grows to <b>{Number.isFinite(future) ? money(future) : '—'}</b></p>
      </fieldset>
      <fieldset>
        <legend>Loan payment</legend>
        <label>Amount <input type="number" {...n('loan')} /></label>
        <label>Rate % a year <input type="number" step="0.1" {...n('loanRate')} /></label>
        <label>Years <input type="number" {...n('loanYears')} /></label>
        <p>Pays <b>{Number.isFinite(monthly) ? money(monthly) : '—'}</b> a month, {Number.isFinite(monthly) ? money(monthly * f.loanYears * 12 - f.loan) : '—'} in interest</p>
      </fieldset>
      <fieldset>
        <legend>Position sizing</legend>
        <label>Equity <input type="number" {...n('equity')} /></label>
        <label>Risk % a trade <input type="number" step="0.1" {...n('risk')} /></label>
        <label>Entry <input type="number" step="0.01" {...n('entry')} /></label>
        <label>Stop <input type="number" step="0.01" {...n('stop')} /></label>
        <p>{shares ? <>Buy <b>{count(shares)}</b> shares ({money(shares * f.entry)}): a stop-out loses {money(shares * perShare)}.</> : 'The stop must be below the entry.'}</p>
      </fieldset>
    </div>
  );
}
