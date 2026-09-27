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
  const cause = report?.cause === 'loan' ? 'LOAN_DEFAULT' : 'MARGIN_CALL_NOT_MET';
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
