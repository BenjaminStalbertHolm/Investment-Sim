import { useEffect } from 'react';
import type { BankruptcyReport } from '../sim/bankruptcy';

const money = (v: number) => `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;

/**
 * The Blue Screen of Debt (spec §4, §16): what bankruptcy looks like on Majorsoft Doors 98. Any key or click moves on to
 * the final report.
 */
export function BlueScreen({ report, onDone }: { report?: BankruptcyReport; onDone(): void }) {
  useEffect(() => {
    const done = () => onDone();
    // A moment's grace, so the key that was already down doesn't dismiss it.
    const timer = setTimeout(() => window.addEventListener('keydown', done), 400);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', done);
    };
  }, [onDone]);
  const cause = { margin: 'MARGIN_CALL_NOT_MET', loan: 'LOAN_DEFAULT', fine: 'UNPAID_FINE', shark: 'COLLECTORS_AT_THE_DOOR', bills: 'BILLS_NOT_PAID', payroll: 'PAYROLL_EXCEPTION' }[report?.cause ?? 'margin'];
  return (
    <div className="bsod" role="alertdialog" aria-label="Blue Screen of Debt" onClick={onDone}>
      <div className="bsod-text">
        <p className="bsod-title">
          <span>Majorsoft Doors</span>
        </p>
        <p>
          A fatal exception 0D has occurred at 0028:C0FFEE98 in VXD DEBT(01) + 0001BAD5. The current firm will be
          terminated.
        </p>
        <p>
          * {cause}: {report ? `${money(report.shortfall)} could not be paid after the sale of all assets.` : 'The firm could not pay.'}
          <br />* Net worth: {report ? money(report.netWorth) : 'unknown'}.
          <br />* Press any key to see the final report.
          <br />* Pressing CTRL+ALT+DEL again will not bring the money back. You will lose any unsaved clients in all applications.
        </p>
        <p className="bsod-prompt">
          Press any key to continue <span className="bsod-cursor">_</span>
        </p>
      </div>
    </div>
  );
}

/**
 * Doors crashes on stage at COMDEXX (spec §16C.2) — and, for two seconds, on the player's screen too. Any key or click
 * skips it; it only ever happens once.
 */
export function DemoCrash({ onDone }: { onDone(): void }) {
  useEffect(() => {
    const done = () => onDone();
    const timer = setTimeout(done, 2000);
    window.addEventListener('keydown', done);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', done);
    };
  }, [onDone]);
  return (
    <div className="bsod" role="alertdialog" aria-label="Doors has crashed (not really)" onClick={onDone}>
      <div className="bsod-text">
        <p className="bsod-title">
          <span>Majorsoft Doors</span>
        </p>
        <p>A fatal exception 0E has occurred at 0028:C0MDEXX8 in VXD KEYNOTE(01) + 00000098. The demonstration will be terminated.</p>
        <p>
          * This happened on stage at COMDEXX, too. Your computer is fine.
          <br />* Press any key to continue <span className="bsod-cursor">_</span>
        </p>
      </div>
    </div>
  );
}
