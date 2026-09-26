/** A modal 98-style message box over the whole screen, for errors. */
export function MessageBox({ title = 'Majorsoft Doors 98', text, onClose }: { title?: string; text: string; onClose(): void }) {
  return (
    <div className="modal-backdrop">
      <div className="window message-box" role="alertdialog" aria-label={title}>
        <div className="title-bar">
          <div className="title-bar-text">{title}</div>
          <div className="title-bar-controls">
            <button aria-label="Close" onClick={onClose} />
          </div>
        </div>
        <div className="window-body">
          <div className="dialog-row">
            <span className="message-box-icon" aria-hidden="true">✕</span>
            <p>{text}</p>
          </div>
          <div className="dialog-buttons">
            <button className="default" autoFocus onClick={onClose}>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
