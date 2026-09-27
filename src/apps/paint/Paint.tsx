import { useRef, useState } from 'react';
import { PAINT_PALETTE, PICTURE_SIZE, blankPicture } from '../../art/pixels';
import { showError, updatePlayer, useGame } from '../../state/game';
import { deleteFile, saveFile, usePrograms } from '../../state/programs';
import { Confirm, Prompt } from '../../ui98/Modal';
import { AppMenuBar } from '../AppMenuBar';
import type { AppProps } from '../types';
import '../programs.css';

type Tool = 'pencil' | 'fill' | 'eraser' | 'picker';
const TOOLS: [Tool, string, string][] = [
  ['pencil', '✎', 'Pencil'],
  ['fill', '▧', 'Fill With Colour'],
  ['eraser', '▭', 'Eraser'],
  ['picker', '⌖', 'Pick Colour'],
];
const ZOOM = 10;

const setPixel = (pixels: string, i: number, c: number) => pixels.slice(0, i) + c.toString(16) + pixels.slice(i + 1);

/** Flood fill of the same-coloured area around pixel `start`. */
export function floodFill(pixels: string, start: number, c: number): string {
  const target = pixels[start];
  const colour = c.toString(16);
  if (target === colour) return pixels;
  const out = pixels.split('');
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    if (out[i] !== target) continue;
    out[i] = colour;
    const x = i % PICTURE_SIZE;
    if (x > 0) stack.push(i - 1);
    if (x < PICTURE_SIZE - 1) stack.push(i + 1);
    if (i >= PICTURE_SIZE) stack.push(i - PICTURE_SIZE);
    if (i < PICTURE_SIZE * (PICTURE_SIZE - 1)) stack.push(i + PICTURE_SIZE);
  }
  return out.join('');
}

/**
 * MajorPaint (spec §4A): pixel paint in the 16-colour palette. Pictures are kept in the saved game; one can become the
 * desktop wallpaper, or the firm's logo emblem (stored in the save with the firm's logo).
 */
export default function Paint({ windowId }: AppProps) {
  const pictures = usePrograms((s) => s.pictures);
  const [id, setId] = useState<number>();
  const picture = pictures.find((p) => p.id === id);
  const [pixels, setPixels] = useState(picture?.pixels ?? blankPicture());
  const [tool, setTool] = useState<Tool>('pencil');
  const [colours, setColours] = useState<[number, number]>([0, 15]);
  const [undo, setUndo] = useState<string[]>([]);
  const [dialog, setDialog] = useState<'save' | 'emblem'>();
  const drawing = useRef<number | undefined>(undefined);
  const firmName = useGame((s) => s.firmName);

  const paint = (i: number, button: number) => {
    const c = tool === 'eraser' ? 15 : colours[button === 2 ? 1 : 0];
    if (tool === 'picker') return setColours(button === 2 ? [colours[0], parseInt(pixels[i], 16)] : [parseInt(pixels[i], 16), colours[1]]);
    setPixels((p) => (tool === 'fill' ? floodFill(p, i, c) : setPixel(p, i, c)));
  };
  const start = (i: number, button: number) => {
    setUndo((u) => [...u.slice(-29), pixels]);
    drawing.current = button;
    paint(i, button);
  };
  const open = (pid: number | undefined) => {
    setId(pid);
    setPixels(pictures.find((p) => p.id === pid)?.pixels ?? blankPicture());
    setUndo([]);
  };
  const save = (name: string) => setId(saveFile('pictures', { id: picture?.id, name, pixels }));

  return (
    <div className="app paint">
      <AppMenuBar
        windowId={windowId}
        menus={[
          { label: 'Image', items: [
            { label: 'New', onClick: () => open(undefined) },
            { label: 'Save Picture…', onClick: () => setDialog('save') },
            { label: 'Delete Picture', disabled: !picture, onClick: () => { if (picture) deleteFile('pictures', picture.id); open(undefined); } },
            { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !undo.length, onClick: () => { setPixels(undo.at(-1)!); setUndo(undo.slice(0, -1)); } },
            { label: 'Clear Image', onClick: () => (setUndo([...undo, pixels]), setPixels(blankPicture())) },
          ] },
          { label: 'Use As', items: [
            { label: 'Set As Wallpaper', onClick: () => usePrograms.setState({ wallpaper: { kind: 'picture', pixels } }) },
            { label: 'Restore Teal Wallpaper', onClick: () => usePrograms.setState({ wallpaper: { kind: 'teal' } }) },
            { label: 'Use As Logo Emblem…', onClick: () => setDialog('emblem') },
          ] },
        ]}
      />
      <div className="toolbar">
        <select aria-label="Picture" value={id ?? ''} onChange={(e) => open(Number(e.target.value) || undefined)}>
          <option value="">(untitled)</option>
          {pictures.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button onClick={() => setDialog('save')}>Save…</button>
      </div>
      <div className="paint-body">
        <div className="paint-tools">
          {TOOLS.map(([t, glyph, label]) => (
            <button key={t} className={tool === t ? 'pressed' : ''} title={label} aria-label={label} onClick={() => setTool(t)}>
              {glyph}
            </button>
          ))}
        </div>
        <div
          className="paint-canvas"
          style={{ width: PICTURE_SIZE * ZOOM, height: PICTURE_SIZE * ZOOM }}
          onContextMenu={(e) => e.preventDefault()}
          onMouseUp={() => (drawing.current = undefined)}
          onMouseLeave={() => (drawing.current = undefined)}
        >
          {Array.from(pixels, (c, i) => (
            <span
              key={i}
              style={{ background: PAINT_PALETTE[parseInt(c, 16)] }}
              onMouseDown={(e) => start(i, e.button)}
              onMouseEnter={() => drawing.current !== undefined && (tool === 'pencil' || tool === 'eraser') && paint(i, drawing.current)}
            />
          ))}
        </div>
      </div>
      <div className="paint-palette">
        <span className="paint-current" title="Left and right button colours">
          <i style={{ background: PAINT_PALETTE[colours[0]] }} />
          <i style={{ background: PAINT_PALETTE[colours[1]] }} />
        </span>
        {PAINT_PALETTE.map((hex, c) => (
          <button
            key={hex}
            aria-label={`Colour ${hex}`}
            style={{ background: hex }}
            onClick={() => setColours([c, colours[1]])}
            onContextMenu={(e) => (e.preventDefault(), setColours([colours[0], c]))}
          />
        ))}
      </div>
      <div className="status-bar">
        <p className="status-bar-field">Left button draws in the first colour, right button in the second. Pictures are kept in your saved game.</p>
      </div>
      {dialog === 'save' && (
        <Prompt title="Save Picture" label="Picture name:" initial={picture?.name ?? `Picture ${pictures.length + 1}`} onOk={(name) => (save(name), setDialog(undefined))} onCancel={() => setDialog(undefined)} />
      )}
      {dialog === 'emblem' && (
        <Confirm
          title="Use As Logo Emblem"
          ok="Use It"
          onOk={() => {
            setDialog(undefined);
            void updatePlayer({ emblem: pixels }).catch(showError);
          }}
          onCancel={() => setDialog(undefined)}
        >
          Use this picture as {firmName}’s logo emblem, in place of the motif? White counts as transparent. My Computer → Firm → Edit logo… keeps it; choose Use As → Logo Emblem again to replace it.
        </Confirm>
      )}
    </div>
  );
}
