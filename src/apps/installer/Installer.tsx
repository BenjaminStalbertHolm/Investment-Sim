import { useEffect, useState } from 'react';
import { Icon } from '../../art/icons';
import { useGame } from '../../state/game';
import { useShell } from '../../state/shell';
import { useWindows } from '../../state/windows';
import type { AppProps } from '../types';
import './installer.css';

const STEPS = ['Welcome', 'Warning', 'Installing', 'Finish'] as const;
/** The install takes this long, so it reads as an install. */
const INSTALL_MS = 2400;
const STATUS = [
  'Copying files…',
  'Peeling cloves…',
  'Installing onion routing… wrong vegetable, retrying…',
  'Setting up three layers of anonymity…',
  'Deleting browser history (there was none)…',
];

/**
 * A setup program for a download from Tucats (spec §4A: optional apps are installed with a 98-style installer). The
 * Garlic Browser's shows an ominous warning first (spec §14A).
 */
export default function Installer({ windowId }: AppProps) {
  const program = useWindows((s) => s.windows.find((w) => w.id === windowId)?.params?.view) ?? 'garlic';
  const allowed = useGame((s) => s.settings?.darkWeb ?? true);
  const installed = useShell((s) => s.installed.includes(program));
  const [step, setStep] = useState(installed ? 3 : 0);
  const [agreed, setAgreed] = useState(false);
  const [launch, setLaunch] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const close = () => useWindows.getState().close(windowId);

  useEffect(() => {
    if (step !== 2) return;
    const start = performance.now();
    const timer = setInterval(() => {
      const t = performance.now() - start;
      setElapsed(t);
      if (t >= INSTALL_MS) {
        clearInterval(timer);
        useShell.getState().install(program);
        setStep(3);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [step, program]);

  useEffect(() => {
    useWindows.getState().setTitle(windowId, 'Garlic Browser 0.9 beta Setup');
  }, [windowId]);

  const finish = () => {
    close();
    if (launch) useWindows.getState().open('garlic');
  };

  if (program !== 'garlic' || !allowed) {
    return (
      <div className="installer">
        <p>This download is damaged or no longer available. Setup cannot continue.</p>
        <div className="setup-buttons">
          <button className="default" onClick={close}>
            OK
          </button>
        </div>
      </div>
    );
  }

  const page = [
    <>
      <h2>Welcome to Garlic Browser 0.9 beta Setup</h2>
      <p>This program will install the Garlic Browser on your computer.</p>
      <p>The Garlic Browser opens addresses ending in <code>.garlic</code>, which no ordinary browser can reach. Your connection passes through three other computers on the way, so nobody can see where it comes from — including, mostly, you.</p>
      <p>Close all other programs before continuing. Or don’t. We can’t see you.</p>
    </>,
    <>
      <h2 className="installer-warning">⚠ Warning</h2>
      <ul className="installer-risks">
        <li>The vendors on the Garlic network are anonymous. Some are criminals. Some are the Securities Oversight Bureau pretending to be criminals.</li>
        <li>Everything is paid for up front. Nothing can be returned. There is no customer service.</li>
        <li>What you buy there can raise your heat with the regulator, cost your firm its good name and its clients, and end in fines and lawsuits.</li>
        <li>Every listing states its price, its chance of working, what happens if it fails and the heat it adds. Read them.</li>
      </ul>
      <p className="installer-small">Majorsoft Corporation, Tucats and the Garlic Project accept no responsibility for anything, ever.</p>
      <div className="field-row">
        <input id={`${windowId}-agree`} type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <label htmlFor={`${windowId}-agree`}>I understand the risks, and I am doing this anyway.</label>
      </div>
    </>,
    <>
      <h2>Installing</h2>
      <p>Please wait while Setup installs the Garlic Browser.</p>
      <div className="install-progress progress-indicator segmented">
        <span className="progress-indicator-bar" style={{ width: `${Math.min(1, elapsed / INSTALL_MS) * 100}%` }} />
      </div>
      <p>{STATUS[Math.min(STATUS.length - 1, Math.floor((elapsed / INSTALL_MS) * STATUS.length))]}</p>
    </>,
    <>
      <h2>Setup is complete</h2>
      <p>The Garlic Browser is installed. A garlic bulb is on your desktop and in Start → Programs.</p>
      <div className="field-row">
        <input id={`${windowId}-launch`} type="checkbox" checked={launch} onChange={(e) => setLaunch(e.target.checked)} />
        <label htmlFor={`${windowId}-launch`}>Launch the Garlic Browser now</label>
      </div>
    </>,
  ][step];

  return (
    <div className="installer">
      <div className="installer-body">
        <div className="installer-banner">
          <Icon name="garlic" size={48} />
          <ol>
            {STEPS.map((s, i) => (
              <li key={s} className={i === step ? 'current' : undefined}>
                {s}
              </li>
            ))}
          </ol>
        </div>
        <div className="installer-page">{page}</div>
      </div>
      <div className="setup-buttons">
        {step < 3 ? (
          <>
            <button disabled={step === 0 || step === 2} onClick={() => setStep(step - 1)}>
              &lt; Back
            </button>
            <button className="default spacer" disabled={step === 2 || (step === 1 && !agreed)} onClick={() => setStep(step + 1)}>
              {step === 1 ? 'Install' : 'Next >'}
            </button>
            <button disabled={step === 2} onClick={close}>
              Cancel
            </button>
          </>
        ) : (
          <button className="default" onClick={finish}>
            Finish
          </button>
        )}
      </div>
    </div>
  );
}
