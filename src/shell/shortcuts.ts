import { saveGame, useGame } from '../state/game';
import { useShell } from '../state/shell';
import { useWindows } from '../state/windows';

/**
 * The desktop's keyboard shortcuts: Ctrl+Alt+Delete opens the Task Mangler (spec §4A), F1 the help file (spec §4) and
 * Ctrl/⌘+S saves anywhere (spec §18). They work on the desktop, not over Setup or the boot screen.
 */
export function onShortcut(e: KeyboardEvent): void {
  const { power, setup } = useShell.getState();
  const desktop = power === 'running' && !setup;
  if (e.ctrlKey && e.altKey && (e.key === 'Delete' || e.key === 'Backspace') && power === 'running') {
    e.preventDefault();
    useWindows.getState().open('taskmangler');
  } else if (e.key === 'F1' && desktop) {
    e.preventDefault();
    useWindows.getState().open('help');
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (useGame.getState().ready && desktop) void saveGame();
  }
}
