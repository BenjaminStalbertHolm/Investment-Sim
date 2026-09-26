import { useCallback } from 'react';
import { useShell } from '../state/shell';
import { BootScreen } from './BootScreen';
import { Desktop } from './Desktop';
import { ShutdownScreen } from './ShutdownScreen';
import { Taskbar } from './Taskbar';

export function Shell() {
  const power = useShell((s) => s.power);
  const setPower = useShell((s) => s.setPower);
  const booted = useCallback(() => setPower('running'), [setPower]);

  if (power === 'booting') return <BootScreen onDone={booted} />;
  if (power === 'off') return <ShutdownScreen onPowerOn={() => setPower('booting')} />;
  return (
    <div className="screen">
      <Desktop />
      <Taskbar />
    </div>
  );
}
