import { useMemo, type ReactNode } from 'react';
import { decodeLogo } from '../../art/logo/code';
import { Logo } from '../../art/logo/Logo';
import { Portrait } from '../../art/portrait/Portrait';
import { PerformanceChart } from '../../charts/PerformanceChart';
import type { BankruptcyReport } from '../../sim/bankruptcy';
import { formatDate } from '../../sim/calendar';
import { contractLabel } from '../../sim/commodities';
import { decodeCeo } from '../../world/ceo';
import { openSetup, useGame } from '../../state/game';
import { useWindows } from '../../state/windows';
import { money, signedMoney, tone } from '../format';

const CAUSES = {
  margin: 'A margin call it could not meet, even after its broker had sold everything it owned.',
  loan: 'A First Continental Bank loan it could not repay, even after the bank had sold everything it owned.',
  fine: 'A Securities Oversight Bureau fine it could not pay, even after its broker had sold everything it owned.',
  shark: 'A loan shark’s loan, called in when a weekly payment was missed. The collectors took everything, and it was not enough.',
};

/**
 * The final report (spec §16): the firm's history, its net worth against the MAJOR 500, its best and worst trades, and
 * the cause of death. Shown after the Blue Screen of Debt, and from the Hall of Shame.
 */
export function FinalReport({ report, children }: { report: BankruptcyReport; children?: ReactNode }) {
  const logo = useMemo(() => decodeLogo(report.logoCode), [report.logoCode]);
  const ceo = useMemo(() => decodeCeo(report.ceoCode), [report.ceoCode]);
  const days = report.day - report.founded;
  const trade = (t: BankruptcyReport['best']) =>
    t ? (
      <>
        {t.contract ? contractLabel(t.contract) : t.label} <b className={tone(t.realized)}>{signedMoney(t.realized)}</b>
      </>
    ) : (
      'None'
    );
  return (
    <div className="final-report">
      <div className="final-report-head">
        <Logo spec={logo} name={report.firmName} height={40} />
        <div className="final-report-ceo">
          <Portrait ceo={ceo} size={64} title={`Photo of ${report.ceoName}`} />
          <span>
            {report.ceoName}
            <br />
            <small>Chief Executive Officer</small>
          </span>
        </div>
      </div>
      <table className="ticket-estimate">
        <tbody>
          <tr>
            <td>In business</td>
            <td>
              {formatDate(report.founded)} – {formatDate(report.day)} ({days.toLocaleString('en-US')} days)
            </td>
          </tr>
          <tr>
            <td>Cause of death</td>
            <td>{CAUSES[report.cause]}</td>
          </tr>
          <tr>
            <td>Owed, and short</td>
            <td>
              {money(report.owed)} fell due; {money(report.shortfall)} of it could not be paid
            </td>
          </tr>
          <tr>
            <td>Peak net worth</td>
            <td>
              {money(report.peak.netWorth)} on {formatDate(report.peak.day)}
            </td>
          </tr>
          <tr>
            <td>Final net worth</td>
            <td className="down">{money(report.netWorth)}</td>
          </tr>
          <tr>
            <td>Best trade</td>
            <td>{trade(report.best)}</td>
          </tr>
          <tr>
            <td>Worst trade</td>
            <td>{trade(report.worst)}</td>
          </tr>
          <tr>
            <td>Clients</td>
            <td>
              {report.clients.won} won, {report.clients.lost} lost
            </td>
          </tr>
        </tbody>
      </table>
      <div className="section-title">Net worth against the MAJOR 500</div>
      <PerformanceChart stats={report.history} deposits={report.history[0]?.[1] ?? 1} label={report.firmName} fit />
      {children}
    </div>
  );
}

/**
 * The final report over the desktop, after the Blue Screen of Debt or on loading a bankrupt save: the firm is finished,
 * so the ways on are a new firm or the Hall of Shame. Closing it leaves the desktop to browse, read-only.
 */
export default function FinalReportDialog() {
  const report = useGame((s) => s.bankrupt);
  if (!report) return null;
  const close = () => useGame.setState({ bust: undefined });
  return (
    <div className="modal-backdrop final-report-backdrop">
      <div className="window modal final-report-window" role="dialog" aria-label="Final Report">
        <div className="title-bar">
          <div className="title-bar-text">Final Report — {report.firmName} (Bankrupt)</div>
          <div className="title-bar-controls">
            <button aria-label="Close" onClick={close} />
          </div>
        </div>
        <div className="window-body">
          <FinalReport report={report}>
            <div className="dialog-buttons">
              <button className="default" autoFocus onClick={() => (close(), openSetup())}>
                New Firm…
              </button>
              <button onClick={() => (close(), useWindows.getState().open('mycomputer', { view: 'shame' }))}>Hall of Shame</button>
              <button onClick={close}>Close</button>
            </div>
          </FinalReport>
        </div>
      </div>
    </div>
  );
}
