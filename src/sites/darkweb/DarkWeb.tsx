import { useEffect, useMemo, useState } from 'react';
import { pct } from '../../apps/format';
import { TIP_CLAIMS } from '../../apps/mail/data';
import { dayOf, formatClock, formatDate, formatTime, isTradingDay, previousTradingDay, type GameTime } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import type { DarkRequest, Terms } from '../../sim/darkweb';
import { CELLAR, CLOVE, MARKETS, SERVICE, SERVICES, type Market, type Service } from '../../sim/data/darkweb';
import { OUTLET } from '../../sim/data/outlets';
import type { Journalist } from '../../sim/press';
import type { DarkWebView, Directory, PurchaseView, VendorView } from '../../sim/types';
import { autosave, showError, useGame } from '../../state/game';
import { Modal } from '../../ui98/Modal';
import { Rng } from '../../world/rng';
import { CHATTER } from '../data/articles';
import { useFetched } from '../hooks';
import { write } from '../text';
import { Link, useTitle } from '../web';
import { stateTerms, usd } from './terms';
import './darkweb.css';

/** The markets, the firm's orders and The Cellar, refetched as the account changes and every game hour. */
function useDarkWeb(): DarkWebView | undefined {
  const revision = useGame((s) => s.snapshot?.revision);
  const hour = useGame((s) => Math.floor((s.snapshot?.time ?? 0) / 60));
  return useFetched(() => simulation().darkweb(), [revision, hour]);
}

/** The press, fetched once (journalists are hired at the start of a game). */
const useJournalists = () => useFetched(() => simulation().journalists(), []) ?? NO_JOURNALISTS;
const NO_JOURNALISTS: Journalist[] = [];

const MARKET_BY_HOST = new Map(MARKETS.map((m) => [m.host, m]));

/**
 * What lives at a .garlic address (spec §14A): The Clove (the network's directory), The Cellar (its forum) and the
 * eleven markets. Ugly tables, monospace, and the terms of every listing stated before anything is bought.
 */
export function DarkSite({ url }: { url: URL }) {
  const view = useDarkWeb();
  const market = MARKET_BY_HOST.get(url.hostname);
  const known = market || url.hostname === CLOVE || url.hostname === CELLAR;
  useTitle(market?.name ?? (url.hostname === CELLAR ? 'The Cellar' : url.hostname === CLOVE ? 'The Clove' : 'Unknown clove'));
  const body = !view ? (
    <p>Negotiating circuit…</p>
  ) : !view.enabled ? (
    <p>The Garlic network is unreachable. (The dark web is switched off in this game’s advanced settings.)</p>
  ) : !known ? (
    <p>
      No such clove: <b>{url.hostname}</b>. Addresses on the Garlic network change often. Try <Link href={`http://${CLOVE}/`}>The Clove</Link>.
    </p>
  ) : market ? (
    <MarketPage market={market} view={view} />
  ) : url.hostname === CELLAR ? (
    <Cellar view={view} />
  ) : (
    <Clove view={view} />
  );
  return (
    <div className="garlic-site">
      <pre className="garlic-banner">{`  ,--.   ${market?.name ?? (url.hostname === CELLAR ? 'THE CELLAR' : 'THE CLOVE')}
 (    )  ${market?.motto ?? (url.hostname === CELLAR ? 'what happens in the cellar stays in the cellar' : 'a directory of the garlic network')}
  \`--'   heat: ${view ? `${Math.round(view.heat)}/100` : '?'}`}</pre>
      {body}
      <p className="garlic-footer">
        <Link href={`http://${CLOVE}/`}>[the clove]</Link> <Link href={`http://${CELLAR}/`}>[the cellar]</Link> — nothing here is endorsed by anyone
      </p>
    </div>
  );
}

// ---------- The Clove: the directory, and the firm's orders ----------

const RESULTS: Record<NonNullable<PurchaseView['result']>, string> = {
  success: 'Delivered', failure: 'Failed', scam: 'Vendor vanished (exit scam)', sting: 'Vendor was the SOB', refund: 'Refunded',
};

export function Clove({ view }: { view: DarkWebView }) {
  const directory = useGame((s) => s.directory);
  const journalists = useJournalists();
  return (
    <>
      <p className="garlic-warning">
        Every listing states its price, its chance of working, what failure costs and the heat it adds. Read them. Vendors are not
        vetted: some are exit scams and some are the Securities Oversight Bureau. Ratings and account age are all you have.
      </p>
      <table className="garlic-table">
        <thead>
          <tr><th>market</th><th>what</th><th>address</th></tr>
        </thead>
        <tbody>
          {MARKETS.map((m) => (
            <tr key={m.id}>
              <td><Link href={`http://${m.host}/`}>{m.name}</Link></td>
              <td>{m.motto}</td>
              <td>{m.host}</td>
            </tr>
          ))}
          <tr>
            <td><Link href={`http://${CELLAR}/`}>The Cellar</Link></td>
            <td>forum: reviews, scam warnings, the odd tip</td>
            <td>{CELLAR}</td>
          </tr>
        </tbody>
      </table>
      <h3>your orders</h3>
      <Orders purchases={view.purchases} directory={directory} journalists={journalists} />
      {view.shell && (
        <p>
          Your shell: <b>{view.shell.name}</b> ({view.shell.jurisdiction}), fee due {formatDate(view.shell.renews)}.{' '}
          <Link href={`http://${MARKETS.find((m) => m.id === 'shells')!.host}/`}>[manage]</Link>
        </p>
      )}
      {view.shark && (
        <p>
          You owe <b>{usd(view.shark.owed)}</b> to the loan sharks: {usd(view.shark.weekly)} every Friday.{' '}
          <Link href={`http://${MARKETS.find((m) => m.id === 'sharks')!.host}/`}>[pay off]</Link>
        </p>
      )}
      {view.bribed.length > 0 && (
        <p>
          Journalists who took your money:{' '}
          {view.bribed.map((b) => `${journalists[b.journalist]?.name ?? '?'} (${OUTLET[journalists[b.journalist]?.outlet ?? 'newswire'].name}, ${b.bribes}×)`).join('; ')}
        </p>
      )}
    </>
  );
}

function Orders({ purchases, directory, journalists }: { purchases: PurchaseView[]; directory: Directory; journalists: readonly Journalist[] }) {
  if (!purchases.length) return <p>No orders yet.</p>;
  return (
    <table className="garlic-table">
      <thead>
        <tr><th>#</th><th>placed</th><th>what</th><th>vendor</th><th>paid</th><th>status</th></tr>
      </thead>
      <tbody>
        {purchases.map((p) => (
          <tr key={p.id}>
            <td>{p.id}</td>
            <td>{formatClock(p.time)}</td>
            <td>
              {SERVICE[p.request.service].name}
              {p.request.company !== undefined ? ` — ${directory.tickers[p.request.company]}` : ''}
              {p.request.firm !== undefined ? ` — ${directory.firms[p.request.firm]?.name}` : ''}
              {p.request.journalist !== undefined ? ` — ${journalists[p.request.journalist]?.name ?? ''}` : ''}
            </td>
            <td>{p.handle}</td>
            <td>{usd(p.terms.price + p.terms.fee)}</td>
            <td>{p.result ? RESULTS[p.result] : `in transit (due ${formatClock(p.due)})`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------- A market: its vendors' listings ----------

const stars = (rating: number) => `${'★'.repeat(Math.round(rating))}${'☆'.repeat(5 - Math.round(rating))} ${rating.toFixed(1)}`;
const age = (days: number) => (days >= 730 ? `${Math.floor(days / 365)} years` : days >= 60 ? `${Math.floor(days / 30)} months` : `${days} days`);

export function MarketPage({ market, view }: { market: Market; view: DarkWebView }) {
  const [viaShell, setViaShell] = useState(false);
  const vendors = view.vendors.filter((v) => v.market === market.id && v.left === undefined);
  const services = SERVICES.filter((s) => s.market === market.id);
  const payable = view.shell && market.id !== 'shells' && market.id !== 'sharks';
  return (
    <>
      <table className="garlic-table">
        <thead>
          <tr><th>vendor</th><th>rating</th><th>reviews</th><th>account age</th></tr>
        </thead>
        <tbody>
          {vendors.map((v) => (
            <tr key={v.id}>
              <td>{v.handle}</td>
              <td>{stars(v.rating)}</td>
              <td>{v.reviews}</td>
              <td>{age(v.age)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {market.risky && <p className="garlic-warning">Vendors here are not vetted. New accounts with perfect ratings and low prices have been known to vanish — or to be the SOB.</p>}
      {payable && (
        <div className="field-row garlic-shell">
          <input id={`shell-${market.id}`} type="checkbox" checked={viaShell} onChange={(e) => setViaShell(e.target.checked)} />
          <label htmlFor={`shell-${market.id}`}>
            Pay through {view.shell!.name} (10% fee, half the heat and less for the auditors to find)
          </label>
        </div>
      )}
      {services.map((s) => (
        <ServiceSection key={s.id} service={s} view={view} vendors={vendors} viaShell={!!payable && viaShell} />
      ))}
      {market.id === 'sharks' && <SharkPanel view={view} />}
      {market.id === 'shells' && <ShellPanel view={view} />}
    </>
  );
}

/** The targets a service needs, chosen once for all its vendors' listings. */
function ServiceSection({ service, view, vendors, viaShell }: { service: Service; view: DarkWebView; vendors: VendorView[]; viaShell: boolean }) {
  const initial = view.listings.find((l) => l.service === service.id)?.request;
  const [target, setTarget] = useState<Partial<DarkRequest>>(() => ({
    journalist: initial?.journalist, company: initial?.company, firm: initial?.firm, amount: initial?.amount,
  }));
  return (
    <div className="garlic-service">
      <h3>{service.name}</h3>
      <p>{service.blurb}</p>
      <Targets service={service} view={view} target={target} onChange={(t) => setTarget({ ...target, ...t })} />
      <table className="garlic-table garlic-listings">
        <thead>
          <tr><th>vendor</th><th>price</th><th>success</th><th>what you get</th><th>if it fails</th><th>heat</th><th /></tr>
        </thead>
        <tbody>
          {vendors.map((v) => {
            const request: DarkRequest = { ...target, service: service.id, vendor: v.id, viaShell: viaShell || undefined };
            // The terms the market listed, until the vendor has been asked about this very request.
            const listed = view.listings.find((l) => l.service === service.id && l.vendor === v.id);
            const same = listed && !viaShell && (['journalist', 'company', 'firm', 'amount'] as const).every((k) => listed.request[k] === request[k]);
            return <Listing key={v.id} vendor={v} request={request} initial={same ? (listed.terms ?? { error: listed.error! }) : undefined} />;
          })}
        </tbody>
      </table>
    </div>
  );
}

function Targets({ service, view, target, onChange }: { service: Service; view: DarkWebView; target: Partial<DarkRequest>; onChange(t: Partial<DarkRequest>): void }) {
  const directory = useGame((s) => s.directory);
  const journalists = useJournalists();
  const [ticker, setTicker] = useState(target.company !== undefined ? directory.tickers[target.company] : '');
  return (
    <div className="garlic-targets">
      {service.params.includes('journalist') && (
        <label>
          journalist:{' '}
          <select value={target.journalist ?? ''} onChange={(e) => onChange({ journalist: Number(e.target.value) })}>
            {journalists.map((j) => (
              <option key={j.id} value={j.id}>
                {OUTLET[j.outlet].name} — {j.name} ({j.beat})
              </option>
            ))}
          </select>
        </label>
      )}
      {service.params.includes('company') &&
        (service.id === 'leakEarnings' ? (
          <label>
            company reporting soon:{' '}
            <select value={target.company ?? ''} onChange={(e) => onChange({ company: Number(e.target.value) })}>
              {view.reporting.map((i) => (
                <option key={i} value={i}>
                  {directory.tickers[i]} — {directory.names[i]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            ticker:{' '}
            <input
              size={6}
              value={ticker}
              onChange={(e) => {
                const t = e.target.value.toUpperCase();
                setTicker(t);
                onChange({ company: directory.tickers.indexOf(t) });
              }}
            />{' '}
            {target.company !== undefined && target.company >= 0 ? directory.names[target.company] : '(unknown ticker)'}
          </label>
        ))}
      {service.params.includes('firm') && (
        <label>
          competitor:{' '}
          <select value={target.firm ?? ''} onChange={(e) => onChange({ firm: Number(e.target.value) })}>
            {directory.firms.map((f, k) => (
              <option key={f.id} value={k}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {service.params.includes('amount') && (
        <label>
          {service.id === 'shark' ? 'borrow' : 'buy-in'}: ${' '}
          <input type="number" step={service.id === 'shark' ? 1_000_000 : 10_000} value={target.amount ?? 0} onChange={(e) => onChange({ amount: Number(e.target.value) })} />
        </label>
      )}
    </div>
  );
}

/** A vendor's listing: its terms for the request, fetched afresh when the request or the account changes, and Buy. */
function Listing({ vendor, request, initial }: { vendor: VendorView; request: DarkRequest; initial?: Terms | { error: string } }) {
  const directory = useGame((s) => s.directory);
  const revision = useGame((s) => s.snapshot?.revision);
  const journalists = useJournalists();
  const key = JSON.stringify(request);
  const fetched = useFetched<Terms | { error: string }>(() => simulation().darkQuote(request) as Promise<Terms | { error: string }>, [key, revision]);
  const quote = fetched ?? initial;
  const [confirm, setConfirm] = useState<Terms>();
  const [done, setDone] = useState<string>();
  useEffect(() => setDone(undefined), [key]);
  if (!quote) return <tr><td>{vendor.handle}</td><td colSpan={6}>asking…</td></tr>;
  if ('error' in quote) return <tr><td>{vendor.handle}</td><td colSpan={6}>{quote.error}</td></tr>;
  const stated = stateTerms(request, quote, directory, journalists);
  const buy = async (terms: Terms) => {
    setConfirm(undefined);
    // A risky action: the game autosaves first (spec §18).
    await autosave();
    const result = await simulation().darkBuy(request, terms);
    if ('error' in result) showError(result.error);
    else setDone(`Order #${result.purchase.id} placed.`);
  };
  return (
    <tr>
      <td>{vendor.handle}</td>
      <td>{stated.price}</td>
      <td>{stated.chance}</td>
      <td>{stated.success}</td>
      <td>{stated.failure}</td>
      <td>{stated.heat}</td>
      <td>
        {done ?? <button onClick={() => setConfirm(quote)}>Buy…</button>}
        {confirm && (
          <Modal title="Confirm order" onClose={() => setConfirm(undefined)}>
            <div className="dialog-body garlic-confirm">
              <p>
                <b>{SERVICE[request.service].name}</b> from <b>{vendor.handle}</b> ({stars(vendor.rating)}, {vendor.reviews} reviews, account {age(vendor.age)} old)
              </p>
              <table>
                <tbody>
                  <tr><th>Price</th><td>{stated.price}</td></tr>
                  <tr><th>Success {stated.chance}</th><td>{stated.success}</td></tr>
                  <tr><th>Failure {SERVICE[request.service].certain ? '' : pct(1 - confirm.chance, 0)}</th><td>{stated.failure}</td></tr>
                  <tr><th>Heat</th><td>{stated.heat}</td></tr>
                </tbody>
              </table>
              <p>Payment is up front, {request.viaShell ? 'through your shell' : 'from firm cash, as “Consulting fees” in the ledger'}. The game will be autosaved first.</p>
              <div className="dialog-buttons">
                <button className="default" onClick={() => void buy(confirm)}>Buy</button>
                <button onClick={() => setConfirm(undefined)}>Cancel</button>
              </div>
            </div>
          </Modal>
        )}
      </td>
    </tr>
  );
}

function SharkPanel({ view }: { view: DarkWebView }) {
  if (!view.shark) return <p>You owe us nothing. Yet.</p>;
  const pay = async () => {
    const result = await simulation().repayShark();
    if ('error' in result) showError(result.error);
  };
  return (
    <div className="garlic-service">
      <h3>your loan</h3>
      <p>
        Borrowed {usd(view.shark.principal)} on {formatDate(view.shark.opened)}. Interest owed so far: {usd(view.shark.accrued)}. Every Friday:{' '}
        {usd(view.shark.weekly)}. To pay it all off today: <b>{usd(view.shark.owed)}</b>.
      </p>
      <button onClick={() => void pay()}>Pay it all off</button>
    </div>
  );
}

function ShellPanel({ view }: { view: DarkWebView }) {
  const directory = useGame((s) => s.directory);
  const close = async () => {
    const result = await simulation().closeShell();
    if (result.error) showError(result.error);
  };
  return (
    <div className="garlic-service">
      <h3>your companies</h3>
      {view.shell ? (
        <>
          <p>
            <b>{view.shell.name}</b>, {view.shell.jurisdiction}. Registered {formatDate(view.shell.opened)}; next fee {formatDate(view.shell.renews)}. Chance of
            discovery at today’s heat: {pct(view.shell.discovery, 0)} a year.
          </p>
          <p>Stakes held through it, unfiled: {view.hidden.length ? view.hidden.map((i) => directory.tickers[i]).join(', ') : 'none'}.</p>
          <button onClick={() => void close()}>Wind it up (its stakes are filed, late)</button>
        </>
      ) : (
        <p>You own no shell companies.</p>
      )}
      {view.shells.filter((x) => x.closed !== undefined).map((x) => (
        <p key={x.name + x.opened}>
          {x.name}: {x.discovered ? 'discovered by the SOB' : 'wound up'} on {formatDate(x.closed!)}.
        </p>
      ))}
    </div>
  );
}

// ---------- The Cellar ----------

interface Post {
  time: GameTime;
  handle: string;
  text: string;
}

const CELLAR_HANDLES = ['anon', 'n0body', 'ghost_in_the_modem', 'CloveHunter', 'paranoid_andy', 'TripleHop', 'xX_shadow_Xx', 'ByteBandit', 'LurkerSince96', 'Whistle'];
const PARANOIA = [
  'Use three hops. Always three hops.',
  'The SOB reads this forum. Hi, SOB.',
  'Pay through a shell or don’t pay at all.',
  'New vendor, perfect rating, half the price? Ask yourself why.',
  'Heard the Bureau is busy this month. Lie low.',
  'Anyone else’s modem making funny noises?',
];

/**
 * The Cellar (spec §14A): generated chatter and vendor talk, the same every time it is read, among the posts that
 * matter — scam warnings, stings unmasked, and now and then a real tip.
 */
function Cellar({ view }: { view: DarkWebView }) {
  const directory = useGame((s) => s.directory);
  const seed = useGame((s) => s.seed);
  const now = useGame((s) => s.snapshot?.time ?? 0);
  const day = dayOf(now);
  const posts = useMemo(() => cellarPosts(view, directory, seed, day), [view, directory, seed, day]);
  return (
    <table className="garlic-table garlic-forum">
      <tbody>
        {posts.filter((p) => p.time <= now).map((p, k) => (
          <tr key={k}>
            <td>
              <b>{p.handle}</b>
              <br />
              <small>
                {formatDate(dayOf(p.time))} {formatTime(p.time)}
              </small>
            </td>
            <td>{p.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function cellarPosts(view: DarkWebView, directory: Directory, seed: string, today: number): Post[] {
  const vendor = (id?: number) => view.vendors.find((v) => v.id === id)?.handle ?? 'some vendor';
  const posts: Post[] = view.cellar.map((c) => {
    const rng = Rng.stream(seed, `cellar:${c.time}:${c.kind}`);
    const handle = rng.pick(CELLAR_HANDLES);
    switch (c.kind) {
      case 'tip': {
        const words = { name: directory.names[c.company!], ticker: directory.tickers[c.company!], short: directory.names[c.company!], date: 'long' };
        return { time: c.time, handle, text: `${write(TIP_CLAIMS[c.claim ?? 'default'] ?? TIP_CLAIMS.default, words, rng)} ${rng.pick(['Friend of a friend.', 'Source is solid.', 'Do with it what you like.'])}` };
      }
      case 'scam':
        return { time: c.time, handle, text: `SCAM WARNING: ${vendor(c.vendor)} took the money and vanished. Exit scam. Stay away.` };
      case 'sting':
        return { time: c.time, handle, text: `${vendor(c.vendor)} is LE. Somebody ordered, got a letter from the SOB the next morning. Burn your bookmarks.` };
      default:
        return { time: c.time, handle, text: `${vendor(c.vendor)} says they’re retiring somewhere sunny. Good vendor. Will be missed.` };
    }
  });
  // Chatter for the last ten trading days: vendor talk, paranoia, and tips worth exactly what they cost.
  const active = view.vendors.filter((v) => v.left === undefined);
  let day = today;
  for (let k = 0; k < 10; k++, day = previousTradingDay(day)) {
    if (!isTradingDay(day)) continue;
    const rng = Rng.stream(seed, `cellar:${day}`);
    for (let n = rng.int(2, 5); n > 0; n--) {
      const time = day * 1440 + rng.int(0, 23 * 60);
      const handle = rng.pick(CELLAR_HANDLES);
      const v = rng.pick(active);
      const i = rng.int(0, directory.tickers.length - 1);
      const words = { ticker: directory.tickers[i], short: directory.names[i] };
      const kind = rng.int(0, 3);
      const text =
        kind === 0 && v
          ? v.age < 120
            ? `Anyone used ${v.handle}? Account’s only ${v.age} days old and the prices are low.`
            : v.reviews < 30
              ? `${v.handle}: few reviews. Anyone?`
              : `${v.handle} delivered again. ${rng.pick(['A+++', 'Fast, quiet.', 'Recommended.'])}`
          : kind === 1
            ? rng.pick(PARANOIA)
            : write(rng.pick(CHATTER[kind === 2 ? 'nonsense' : 'hype']), words, rng);
      posts.push({ time, handle, text });
    }
  }
  return posts.sort((a, b) => b.time - a.time);
}
