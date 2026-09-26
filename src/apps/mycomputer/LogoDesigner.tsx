import { useRef, useState } from 'react';
import { decodeLogo, encodeLogo } from '../../art/logo/code';
import { Logo, type LogoSpec } from '../../art/logo/Logo';
import { MOTIF_ICONS } from '../../art/logo/motifs';
import { LOGO_EFFECTS, LOGO_FONTS, LOGO_LAYOUTS, LOGO_MOTIFS, LOGO_SHAPES, PALETTES } from '../../art/logo/options';
import type { Rng } from '../../world/rng';
import { CodeField, Picker, label, useDesignerRng } from './designer';

/** A random logo, as the designer's Randomise button draws it. */
export function randomLogo(rng: Rng): LogoSpec {
  return {
    shape: rng.pick(LOGO_SHAPES),
    motif: rng.pick(LOGO_MOTIFS),
    palette: rng.pick(PALETTES),
    font: rng.pick(LOGO_FONTS),
    layout: rng.pick(LOGO_LAYOUTS),
    effect: rng.chance(0.5) ? 'none' : rng.pick(LOGO_EFFECTS),
  };
}

/** Downloads the logo as an SVG file, drawn from the preview itself. */
async function exportSvg(node: HTMLElement, name: string) {
  const { toSvg } = await import('html-to-image');
  const link = document.createElement('a');
  link.href = await toSvg(node);
  link.download = `${name.replace(/[\\/:*?"<>|]/g, '_') || 'logo'}.svg`;
  link.click();
}

/**
 * The Logo Designer (spec §7): container, motif, palette (or custom colours), wordmark font, layout and WordArt
 * effect, previewed at three sizes. Its output is a logo code, and an SVG on request.
 */
export function LogoDesigner({ name, value, onChange }: { name: string; value: LogoSpec; onChange(spec: LogoSpec): void }) {
  const rng = useDesignerRng('logo');
  const header = useRef<HTMLDivElement>(null);
  const [custom, setCustom] = useState(false);
  const set = (change: Partial<LogoSpec>) => onChange({ ...value, ...change });
  const base = PALETTES.find((p) => p.id === value.palette.id)!;
  const colour = (i: number, hex: string | undefined) => {
    const colors = [...value.palette.colors] as [string, string, string?];
    colors[i] = hex;
    if (!colors[2]) colors.length = 2;
    set({ palette: { ...value.palette, colors } });
  };
  const code = encodeLogo(value);
  const shown = name.trim() || 'Your Firm';

  return (
    <div className="designer logo-designer">
      <div className="designer-controls">
        <Picker label="Container" options={LOGO_SHAPES} value={value.shape} onChange={(shape) => set({ shape })} />
        <Picker label="Wordmark font" options={LOGO_FONTS} value={value.font} onChange={(font) => set({ font })} />
        <Picker label="Layout" options={LOGO_LAYOUTS} value={value.layout} onChange={(layout) => set({ layout })} />
        <Picker label="Effect" options={LOGO_EFFECTS} value={value.effect ?? 'none'} onChange={(effect) => set({ effect })} />
        <fieldset>
          <legend>Motif</legend>
          <div className="motif-grid" role="listbox" aria-label="Motif">
            {LOGO_MOTIFS.map((motif) => {
              const Icon = MOTIF_ICONS[motif];
              return (
                <button
                  key={motif}
                  role="option"
                  aria-selected={motif === value.motif}
                  className={motif === value.motif ? 'selected' : undefined}
                  title={label(motif)}
                  onClick={() => set({ motif })}
                >
                  <Icon size={18} />
                </button>
              );
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend>Palette</legend>
          <div className="palette-grid" role="listbox" aria-label="Palette">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                role="option"
                aria-selected={p.id === value.palette.id}
                className={p.id === value.palette.id ? 'selected' : undefined}
                title={label(p.id)}
                onClick={() => set({ palette: p })}
                style={{ background: `linear-gradient(135deg, ${p.colors[0]} 50%, ${p.colors[1]} 50%)` }}
              />
            ))}
          </div>
          <div className="field-row">
            <input id="logo-custom" type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} />
            <label htmlFor="logo-custom">Custom colours</label>
          </div>
          {custom && (
            <div className="field-row custom-colours">
              {(['Main', 'Accent', 'Background'] as const).map((slot, i) => (
                <label key={slot}>
                  {slot}{' '}
                  <input
                    type="color"
                    value={value.palette.colors[i] ?? '#ffffff'}
                    onChange={(e) => colour(i, e.target.value)}
                  />
                </label>
              ))}
              <button onClick={() => set({ palette: base })}>Reset</button>
            </div>
          )}
        </fieldset>
      </div>
      <div className="designer-preview">
        <fieldset>
          <legend>Website header</legend>
          <div className="logo-preview-web" ref={header}>
            <Logo spec={value} name={shown} height={48} />
          </div>
        </fieldset>
        <div className="logo-preview-row">
          <fieldset>
            <legend>Taskbar icon</legend>
            <div className="logo-preview-icon">
              <Logo spec={{ ...value, layout: value.layout === 'textOnly' || value.layout === 'textInside' ? 'monogram' : value.layout }} name={shown} height={16} showName={false} />
            </div>
          </fieldset>
          <fieldset>
            <legend>ID badge</legend>
            <div className="logo-preview-badge" style={{ background: value.palette.colors[0] }}>
              <span>
                <Logo spec={value} name={shown} height={26} />
              </span>
            </div>
          </fieldset>
        </div>
        <CodeField label="Logo code" code={code} decode={decodeLogo} onApply={onChange} />
        <div className="button-row">
          <button onClick={() => onChange(randomLogo(rng()))}>Randomise</button>
          <button onClick={() => header.current && void exportSvg(header.current, shown)}>Export SVG…</button>
        </div>
      </div>
    </div>
  );
}
