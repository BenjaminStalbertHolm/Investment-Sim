import { Suspense, lazy, useCallback, useEffect } from 'react';
import { installClickSounds, startup } from '../audio/sounds';
import { boot, useGame } from '../state/game';
import { usePrefs } from '../state/prefs';
import { useShell } from '../state/shell';
import { MessageBox } from '../ui98/MessageBox';
import { TickerTape } from '../ui98/TickerTape';
import { BlueScreen, DemoCrash } from './BlueScreen';
import { BootScreen } from './BootScreen';
import { Desktop } from './Desktop';
import { Screensaver, useIdleSaver } from './Screensaver';
import { onShortcut } from './shortcuts';
import { ShutdownScreen } from './ShutdownScreen';
import { Taskbar } from './Taskbar';

const SetupWizard = lazy(() => import('../apps/mycomputer/SetupWizard'));
const FinalReportDialog = lazy(() => import('../apps/mycomputer/FinalReport'));
const BouncingCards = lazy(() => import('../apps/games/BouncingCards').then((m) => ({ default: m.BouncingCards })));
const Stapley = lazy(() => import('../apps/stapley/Stapley'));
const Sheep = lazy(() => import('./Sheep'));

export function Shell() {
  const power = useShell((s) => s.power);
  const setPower = useShell((s) => s.setPower);
  const ready = useGame((s) => s.ready);
  const busy = useGame((s) => s.busy);
  const alert = useGame((s) => s.alert);
  const setup = useShell((s) => s.setup);
  const bankrupt = useGame((s) => s.bankrupt);
  const bust = useGame((s) => s.bust);
  const bounce = useGame((s) => s.bounce);
  const stopBounce = useCallback(() => useGame.setState({ bounce: false }), []);
  const demoCrash = useGame((s) => s.demoCrash);
  const stopCrash = useCallback(() => useGame.setState({ demoCrash: false }), []);
  const periodEvents = useGame((s) => s.settings?.modules.periodEvents);
  const toReport = useCallback(() => useGame.setState({ bust: 'report' }), []);
  const booted = useCallback(() => {
    setPower('running');
    startup();
  }, [setPower]);
  const scheme = usePrefs((s) => s.scheme);
  const crt = usePrefs((s) => s.crt);

  // Colour scheme (spec §17); the sound of a click.
  useEffect(() => {
    document.documentElement.dataset.scheme = scheme;
  }, [scheme]);
  useEffect(() => installClickSounds(), []);
  useIdleSaver(power === 'running' && !setup && ready);

  // Power on: continue the latest save or start a new game while the splash shows.
  useEffect(() => {
    if (power === 'booting') void boot();
  }, [power]);

  // Ctrl+Alt+Del, F1 and Cmd/Ctrl+S work anywhere on the desktop.
  useEffect(() => {
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  const glass = crt && <div className="crt" aria-hidden="true" />;
  if (power === 'booting') return <>{glass}<BootScreen ready={ready || setup} status={busy} onDone={booted} /></>;
  if (power === 'off') return <>{glass}<ShutdownScreen onPowerOn={() => setPower('booting')} /></>;
  if (setup) {
    return (
      <Suspense fallback={<div className="setup-screen" />}>
        {glass}
        <SetupWizard />
        {alert && <MessageBox text={alert} onClose={() => useGame.setState({ alert: undefined })} />}
      </Suspense>
    );
  }
  return (
    <div className="screen">
      {glass}
      <Screensaver />
      <Desktop />
      <TickerTape />
      <Taskbar />
      {bust === 'report' && (
        <Suspense fallback={null}>
          <FinalReportDialog />
        </Suspense>
      )}
      {bust === 'blueScreen' && <BlueScreen report={bankrupt} onDone={toReport} />}
      <Suspense fallback={null}>
        <Stapley />
        {bounce && <BouncingCards onDone={stopBounce} />}
        {periodEvents && <Sheep />}
      </Suspense>
      {demoCrash && <DemoCrash onDone={stopCrash} />}
      {alert && <MessageBox text={alert} onClose={() => useGame.setState({ alert: undefined })} />}
    </div>
  );
}
