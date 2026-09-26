import { CODE128 } from 'jsbarcode/bin/barcodes/CODE128';
import { useState } from 'react';
import { START_DAY, formatDate } from '../../sim/calendar';
import type { Ceo } from '../../world/ceo';
import { Logo, inkColour, type LogoSpec } from '../logo/Logo';
import { Portrait } from '../portrait/Portrait';
import './badge.css';

/** A Code 128 barcode of `text` (the CEO code), as SVG bars: a real one, readable by a scanner. */
export function Barcode({ text, height = 26 }: { text: string; height?: number }) {
  const modules = new CODE128(text, {}).encode().data;
  const bars: [number, number][] = [];
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] !== '1') continue;
    const start = i;
    while (modules[i + 1] === '1') i++;
    bars.push([start, i - start + 1]);
  }
  return (
    <svg className="barcode" viewBox={`0 0 ${modules.length} ${height}`} preserveAspectRatio="none" height={height} aria-label={`Barcode ${text}`}>
      {bars.map(([x, w]) => (
        <rect key={x} x={x} width={w} height={height} />
      ))}
    </svg>
  );
}

export interface BadgeProps {
  firmName: string;
  logo: LogoSpec;
  ceoName: string;
  ceo: Ceo;
  ceoCode: string;
  employeeNo: string;
  /** Shows the back (controlled); otherwise a click flips the card. */
  flipped?: boolean;
}

/**
 * The CEO's ID badge (spec §8): a laminated card with a lanyard hole and a hologram sheen. The front has the firm's
 * logo, photo, name, title, employee number, access level, issue date and a barcode of the CEO code; click it to
 * see the magnetic stripe on the back.
 */
export function Badge(props: BadgeProps) {
  const [own, setOwn] = useState(false);
  const flipped = props.flipped ?? own;
  const [main, accent] = props.logo.palette.colors;
  return (
    <button
      type="button"
      className={`id-badge${flipped ? ' flipped' : ''}`}
      onClick={() => setOwn(!flipped)}
      aria-pressed={flipped}
      title="Click to flip"
      style={{ ['--firm' as string]: main, ['--firm-accent' as string]: accent }}
    >
      <span className="id-badge-card">
        <span className="id-badge-face id-badge-front">
          <span className="id-badge-hole" />
          <span className="id-badge-header">
            <span className="id-badge-logo">
              <Logo spec={props.logo} name={props.firmName} height={26} />
            </span>
          </span>
          <span className="id-badge-body">
            <span className="id-badge-photo">
              <Portrait ceo={props.ceo} size={84} title={`Photo of ${props.ceoName}`} />
            </span>
            <span className="id-badge-details">
              <b className="id-badge-name">{props.ceoName}</b>
              <span className="id-badge-title" style={{ color: inkColour(props.logo.palette) }}>
                Chief Executive Officer
              </span>
              <span>
                Employee No. <b>{props.employeeNo}</b>
              </span>
              <span>
                Access: <b className="id-badge-access">ALL FLOORS</b>
              </span>
              <span>Issued {formatDate(START_DAY)}</span>
            </span>
          </span>
          <span className="id-badge-barcode">
            <Barcode text={props.ceoCode} />
          </span>
          <span className="id-badge-sheen" />
        </span>
        <span className="id-badge-face id-badge-back">
          <span className="id-badge-hole" />
          <span className="id-badge-stripe" />
          <span className="id-badge-small">
            This card remains the property of {props.firmName}. If found, please drop it in any mailbox. Postage
            guaranteed.
          </span>
          <span className="id-badge-signature">{props.ceoName}</span>
          <span className="id-badge-small">Authorised signature</span>
          <span className="id-badge-small">CEO code {props.ceoCode}</span>
          <span className="id-badge-sheen" />
        </span>
      </span>
    </button>
  );
}
