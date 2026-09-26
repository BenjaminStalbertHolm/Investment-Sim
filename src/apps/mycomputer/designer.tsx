import { useId, useRef, useState } from 'react';
import { randomSeed } from '../../state/game';
import { Rng } from '../../world/rng';
import './designers.css';

/** "toothbrushMoustache" → "Toothbrush moustache". */
export const label = (id: string) => {
  const words = id.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words[0].toUpperCase() + words.slice(1);
};

/**
 * The designers' randomness: a seeded stream like everything else, started from a fresh seed each time a designer
 * opens (as a new world seed is), so Randomise gives new faces every session.
 */
export function useDesignerRng(name: string): () => Rng {
  const rng = useRef<Rng>(undefined);
  return () => (rng.current ??= Rng.stream(randomSeed(), `designer:${name}`));
}

/** A labelled drop-down with ◄ ► buttons that step through the options. */
export function Picker<T extends string>(props: {
  label: string;
  options: readonly T[];
  value: T;
  onChange(value: T): void;
  names?: Partial<Record<T, string>>;
}) {
  const id = useId();
  const i = props.options.indexOf(props.value);
  const step = (d: number) => props.onChange(props.options[(i + d + props.options.length) % props.options.length]);
  return (
    <div className="field-row picker">
      <label htmlFor={id}>{props.label}:</label>
      <button className="picker-step" aria-label={`Previous ${props.label.toLowerCase()}`} onClick={() => step(-1)}>
        ◄
      </button>
      <select id={id} value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map((o) => (
          <option key={o} value={o}>
            {props.names?.[o] ?? label(o)}
          </option>
        ))}
      </select>
      <button className="picker-step" aria-label={`Next ${props.label.toLowerCase()}`} onClick={() => step(1)}>
        ►
      </button>
    </div>
  );
}

/** A shareable code: shown for copying, and a box to paste one in. */
export function CodeField<T>(props: { label: string; code: string; decode(code: string): T; onApply(value: T): void }) {
  const id = useId();
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string>();
  const apply = () => {
    try {
      props.onApply(props.decode(pasted));
      setPasted('');
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <fieldset className="code-field">
      <legend>{props.label}</legend>
      <div className="field-row">
        <input id={id} className="code" readOnly value={props.code} onFocus={(e) => e.target.select()} aria-label={props.label} />
        <button onClick={() => void navigator.clipboard?.writeText(props.code)}>Copy</button>
      </div>
      <div className="field-row">
        <input
          className="code"
          placeholder="Paste a code…"
          value={pasted}
          aria-label={`Paste a ${props.label.toLowerCase()}`}
          onChange={(e) => setPasted(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
        />
        <button disabled={!pasted.trim()} onClick={apply}>
          Apply
        </button>
      </div>
      {error && <p className="code-error">{error}</p>}
    </fieldset>
  );
}
