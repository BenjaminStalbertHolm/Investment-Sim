import { useState } from 'react';
import { bigMoney, count, money, price, signedPct, tone } from '../../apps/format';
import { START_DAY, formatDate, gameYear } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import type { IpoView } from '../../sim/types';
import { useGame } from '../../state/game';
import { act, SiteFrame } from '../frame';
import { companyOf, useIpos, useTable } from '../hooks';
import { IPO_HOTLINE, quoteUrl } from '../urls';
import { Link, Marquee, useTitle } from '../web';

const TIER = ['Large', 'Mid', 'Small', 'Micro'];

/**
 * The IPO Hotline (spec §14.2): the calendar of companies going public, with their price ranges; applications for an
 * allocation, granted by a lottery weighted by the firm's reputation; and how recent listings have fared since.
 */
export default function IpoHotline() {
  useTitle('The IPO Hotline — Get In On The Ground Floor');
  const ipos = useIpos();
  const table = useTable();
  const pending = (ipos?.pending ?? []).filter((p) => p.company === undefined).sort((a, b) => a.day - b.day);
  const listed = (ipos?.pending ?? []).filter((p) => p.company !== undefined).reverse();
  return (
    <SiteFrame
      home={IPO_HOTLINE}
      logo="☎ The IPO Hotline"
      tagline="Every deal. Every day. Every first-day pop."
      look={{ head: '#006b3c', ink: '#fffbe0', accent: '#006b3c', page: '#fffff4', font: 'Verdana, Geneva, sans-serif' }}
      footer={`The IPO Hotline is not an underwriter. Allocations are made by the syndicate, by lottery, and favour firms with the best reputations. © ${gameYear(START_DAY)}.`}
    >
      <Marquee speed={30} className="frame-marquee">
        {listed.slice(0, 6).map((p) => {
          const last = table?.last[p.company!] ?? p.price!;
          return `${companyOf(p.genome).ticker} priced ${price(p.price!)}, now ${price(last)} (${signedPct(last / p.price! - 1)})   ·   `;
        })}
        IPO fever! Ask your broker about allocations.
      </Marquee>
      <h2>IPO Calendar</h2>
      {pending.length ? (
        <table className="frame-table" cellPadding={3}>
          <thead>
            <tr>
              <th>Expected</th>
              <th>Company</th>
              <th>Size</th>
              <th className="right">Range</th>
              <th className="right">Shares offered</th>
              <th>Your application</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((p) => (
              <Deal key={p.id} ipo={p} />
            ))}
          </tbody>
        </table>
      ) : (
        <p>No deals on the calendar this week. The bankers are on the golf course.</p>
      )}
      <p className="hint">
        Apply for up to a tenth of a deal. You pay only for the shares you are allotted, at the offer price, the morning it lists.
        Hot deals price above their range and allot less; cold ones price below it. The better your firm’s reputation, the better
        your chances.
      </p>
      <h2>Recent Listings</h2>
      {listed.length ? (
        <table className="frame-table" cellPadding={3}>
          <thead>
            <tr>
              <th>Listed</th>
              <th>Company</th>
              <th className="right">Offer</th>
              <th className="right">Last</th>
              <th className="right">Since the offer</th>
              <th className="right">Raised</th>
              <th>You</th>
            </tr>
          </thead>
          <tbody>
            {listed.map((p) => {
              const c = companyOf(p.genome);
              const last = table?.last[p.company!] ?? p.price!;
              return (
                <tr key={p.id}>
                  <td>{formatDate(p.day)}</td>
                  <td>
                    <Link href={quoteUrl(c.ticker)}>{c.name}</Link> ({c.ticker})
                  </td>
                  <td className="right">{price(p.price!)}</td>
                  <td className="right">{price(last)}</td>
                  <td className={`right ${tone(last - p.price!)}`}>{signedPct(last / p.price! - 1)}</td>
                  <td className="right">{bigMoney(p.price! * p.offered)}</td>
                  <td>{p.applied ? (p.allotted ? `Allotted ${count(p.allotted)}` : 'Not allotted') : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p>No listings yet.</p>
      )}
    </SiteFrame>
  );
}

function Deal({ ipo: p }: { ipo: IpoView['pending'][number] }) {
  const c = companyOf(p.genome);
  const [shares, setShares] = useState('');
  const max = Math.floor(p.offered / 10);
  const cash = useGame((s) => s.snapshot?.account.cash ?? 0);
  return (
    <tr>
      <td>{formatDate(p.day)}</td>
      <td>
        <b>{c.name}</b> ({c.ticker})
        <br />
        <small>
          {c.subIndustry}, {c.hq.name}. Filed {formatDate(p.filed)}.
        </small>
      </td>
      <td>{TIER[p.tier]} cap</td>
      <td className="right">
        {price(p.low)}–{price(p.high)}
      </td>
      <td className="right">{count(p.offered)}</td>
      <td>
        {p.applied ? (
          <>
            {count(p.applied)} shares (about {money(p.applied * p.high)}){' '}
            <button onClick={() => void act(simulation().ipoAction({ do: 'withdraw', id: p.id }))}>Withdraw</button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(simulation().ipoAction({ do: 'apply', id: p.id, shares: Number(shares) })).then((ok) => ok && setShares(''));
            }}
          >
            <input size={7} aria-label={`Shares of ${c.ticker}`} placeholder={`≤ ${count(Math.min(max, Math.floor(cash / p.high)))}`} value={shares} onChange={(e) => setShares(e.target.value.replace(/,/g, ''))} />{' '}
            <button type="submit">Apply</button>
          </form>
        )}
      </td>
    </tr>
  );
}
