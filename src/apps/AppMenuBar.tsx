import { useState } from 'react';
import { formatDate, dayOf } from '../sim/calendar';
import { saveGame, useGame } from '../state/game';
import { useWindows } from '../state/windows';
import { MenuBar, type MenuItem } from '../ui98/MenuBar';
import { Prompt } from '../ui98/Modal';

/** An app's menu bar, starting with the File menu every app has (spec §18: save from anywhere). */
export function AppMenuBar({ windowId, menus = [] }: { windowId: string; menus?: { label: string; items: MenuItem[] }[] }) {
  const [saveAs, setSaveAs] = useState(false);
  const file = {
    label: 'File',
    items: [
      { label: 'Save', shortcut: 'Ctrl+S', onClick: () => void saveGame() },
      { label: 'Save As…', onClick: () => setSaveAs(true) },
      { label: 'Close', onClick: () => useWindows.getState().close(windowId) },
    ],
  };
  const { firmName, snapshot } = useGame.getState();
  return (
    <>
      <MenuBar menus={[file, ...menus]} />
      {saveAs && (
        <Prompt
          title="Save As"
          label="Save this game in C:\Saves\ as:"
          initial={`${firmName} ${formatDate(dayOf(snapshot?.time ?? 0))}`}
          onOk={(name) => {
            setSaveAs(false);
            void saveGame({ id: `save-${Date.now()}`, name });
          }}
          onCancel={() => setSaveAs(false)}
        />
      )}
    </>
  );
}
