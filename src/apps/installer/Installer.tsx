import { useEffect, useState } from 'react';
import { Icon } from '../../art/icons';
import { APPS, type AppId } from '../catalog';
import { useGame } from '../../state/game';
import { useShell } from '../../state/shell';
import { useWindows } from '../../state/windows';
import type { AppProps } from '../types';
import './installer.css';

const STEPS = ['Welcome', 'Warning', 'Installing', 'Finish'] as const;
/** The install takes this long, so it reads as an install. */
const INSTALL_MS = 2400;
/** What Tucats installs (spec §4A): each program's setup title, what it says while copying, and its welcome text. */
const SETUPS: Partial<Record<AppId, { name: string; status: string[]; welcome: string }>> = {
  garlic: {
    name: 'Garlic Browser 0.9 beta',
    status: ['Copying files…', 'Peeling cloves…', 'Installing onion routing… wrong vegetable, retrying…', 'Setting up three layers of anonymity…', 'Deleting browser history (there was none)…'],
    welcome: '',
  },
  winramp: {
    name: 'WinRamp 2.0',
    status: ['Copying files…', 'Tuning the equaliser…', 'Whipping the market…', 'Registering file types you didn’t ask for…'],
    welcome: 'WinRamp plays original synthesised music while you trade. It really whips the market.',
  },
  sweeper: {
    name: 'Margin Sweeper',
    status: ['Copying files…', 'Burying bankrupt companies…', 'Counting neighbours…'],
    welcome: 'Margin Sweeper is Minesweeper, except the mines are the companies that went bankrupt in your world.',
  },
  solitear: {
    name: 'Soli-Tear',
    status: ['Copying files…', 'Shuffling fifty-two cards…', 'Printing your logo on the backs…'],
    welcome: 'Soli-Tear is Klondike solitaire. Your firm’s logo is on the back of every card.',
  },
};

/**
 * A setup program for a download from Tucats (spec §4A: optional apps are installed with a 98-style installer). The
 * Garlic Browser's shows an ominous warning first (spec §14A).
 */
export default function Installer({ windowId }: AppProps) {
  const program = (useWindows((s) => s.windows.find((w) => w.id === windowId)?.params?.view) ?? 'garlic') as AppId;
  const setup = SETUPS[program];
  const garlic = program === 'garlic';
  const allowed = useGame((s) => s.settings?.darkWeb ?? true) || !garlic;
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
    if (setup) useWindows.getState().setTitle(windowId, `${setup.name} Setup`);
  }, [windowId, setup]);

  const finish = () => {
    close();
    if (launch) useWindows.getState().open(program);
  };

  if (!setup || !allowed) {
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
    garlic ? (
      <>
        <h2>Welcome to Garlic Browser 0.9 beta Setup</h2>
        <p>This program will install the Garlic Browser on your computer.</p>
        <p>The Garlic Browser opens addresses ending in <code>.garlic</code>, which no ordinary browser can reach. Your connection passes through three other computers on the way, so nobody can see where it comes from — including, mostly, you.</p>
        <p>Close all other programs before continuing. Or don’t. We can’t see you.</p>
      </>
    ) : (
      <>
        <h2>Welcome to {setup.name} Setup</h2>
        <p>This program will install {setup.name} on your computer.</p>
        <p>{setup.welcome}</p>
        <p>It is strongly recommended that you close all other programs before continuing.</p>
      </>
    ),
    garlic ? (
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
    </>
    ) : (
      <>
        <h2>License Agreement</h2>
        <p className="installer-small">By installing this software you agree that it is provided “as is”, that Tucats and its cats are not responsible for lost productivity, and that you will not use it during client meetings.</p>
        <p>Press Install to agree.</p>
      </>
    ),
    <>
      <h2>Installing</h2>
      <p>Please wait while Setup installs the Garlic Browser.</p>
      <div className="install-progress progress-indicator segmented">
        <span className="progress-indicator-bar" style={{ width: `${Math.min(1, elapsed / INSTALL_MS) * 100}%` }} />
      </div>
      <p>{setup.status[Math.min(setup.status.length - 1, Math.floor((elapsed / INSTALL_MS) * setup.status.length))]}</p>
    </>,
    <>
      <h2>Setup is complete</h2>
      <p>{setup.name} is installed. Its icon is on your desktop and in Start → Programs.</p>
      <div className="field-row">
        <input id={`${windowId}-launch`} type="checkbox" checked={launch} onChange={(e) => setLaunch(e.target.checked)} />
        <label htmlFor={`${windowId}-launch`}>Launch {setup.name} now</label>
      </div>
    </>,
  ][step];

  return (
    <div className="installer">
      <div className="installer-body">
        <div className="installer-banner">
          <Icon name={APPS[program].icon} size={48} />
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
            <button className="default spacer" disabled={step === 2 || (step === 1 && garlic && !agreed)} onClick={() => setStep(step + 1)}>
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
