import { Suspense, lazy, useCallback, useEffect } from 'react';
import { boot, saveGame, useGame } from '../state/game';
import { useShell } from '../state/shell';
import { MessageBox } from '../ui98/MessageBox';
import { TickerTape } from '../ui98/TickerTape';
import { BlueScreen } from './BlueScreen';
import { BootScreen } from './BootScreen';
import { Desktop } from './Desktop';
import { ShutdownScreen } from './ShutdownScreen';
import { Taskbar } from './Taskbar';

const SetupWizard = lazy(() => import('../apps/mycomputer/SetupWizard'));
const FinalReportDialog = lazy(() => import('../apps/mycomputer/FinalReport'));

export function Shell() {
  const power = useShell((s) => s.power);
  const setPower = useShell((s) => s.setPower);
  const ready = useGame((s) => s.ready);
  const busy = useGame((s) => s.busy);
  const alert = useGame((s) => s.alert);
  const setup = useShell((s) => s.setup);
  const bankrupt = useGame((s) => s.bankrupt);
  const bust = useGame((s) => s.bust);
  const toReport = useCallback(() => useGame.setState({ bust: 'report' }), []);
  const booted = useCallback(() => setPower('running'), [setPower]);

  // Power on: continue the latest save or start a new game while the splash shows.
  useEffect(() => {
    if (power === 'booting') void boot();
  }, [power]);

  // Cmd/Ctrl+S saves anywhere (spec §18).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const { power, setup } = useShell.getState();
        if (useGame.getState().ready && power === 'running' && !setup) void saveGame();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (power === 'booting') return <BootScreen ready={ready || setup} status={busy} onDone={booted} />;
  if (power === 'off') return <ShutdownScreen onPowerOn={() => setPower('booting')} />;
  if (setup) {
    return (
      <Suspense fallback={<div className="setup-screen" />}>
        <SetupWizard />
        {alert && <MessageBox text={alert} onClose={() => useGame.setState({ alert: undefined })} />}
      </Suspense>
    );
  }
  return (
    <div className="screen">
      <Desktop />
      <TickerTape />
      <Taskbar />
      {bust === 'report' && (
        <Suspense fallback={null}>
          <FinalReportDialog />
        </Suspense>
      )}
      {bust === 'blueScreen' && <BlueScreen report={bankrupt} onDone={toReport} />}
      {alert && <MessageBox text={alert} onClose={() => useGame.setState({ alert: undefined })} />}
    </div>
  );
}
