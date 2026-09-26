import { useState, type ReactNode } from 'react';

/** A dialog over its app window (the window's other controls are blocked until it closes). */
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose(): void }) {
  return (
    <div className="modal-backdrop in-window">
      <div className="window modal" role="dialog" aria-label={title}>
        <div className="title-bar">
          <div className="title-bar-text">{title}</div>
          <div className="title-bar-controls">
            <button aria-label="Close" onClick={onClose} />
          </div>
        </div>
        <div className="window-body">{children}</div>
      </div>
    </div>
  );
}

/** Asks for a line of text (a watchlist or save name). */
export function Prompt(props: { title: string; label: string; initial?: string; onOk(value: string): void; onCancel(): void }) {
  const [value, setValue] = useState(props.initial ?? '');
  return (
    <Modal title={props.title} onClose={props.onCancel}>
      <form
        className="dialog-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) props.onOk(value.trim());
        }}
      >
        <div className="field-row-stacked">
          <label htmlFor="prompt-value">{props.label}</label>
          <input id="prompt-value" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="dialog-buttons">
          <button type="submit" className="default" disabled={!value.trim()}>
            OK
          </button>
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Asks OK / Cancel. */
export function Confirm(props: { title: string; children: ReactNode; ok?: string; onOk(): void; onCancel(): void }) {
  return (
    <Modal title={props.title} onClose={props.onCancel}>
      <div className="dialog-body">
        <div>{props.children}</div>
        <div className="dialog-buttons">
          <button className="default" autoFocus onClick={props.onOk}>
            {props.ok ?? 'OK'}
          </button>
          <button onClick={props.onCancel}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}
