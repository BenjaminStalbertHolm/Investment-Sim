import { useState } from 'react';
import { count, money, signedMoney, tone } from '../../apps/format';
import { START_DAY, dayOf, formatDate, gameYear } from '../../sim/calendar';
import { simulation } from '../../sim/client';
import { ASSET, ASSETS, CATEGORIES, CONFERENCES, EBUY_FEE, LOTTO, PHASES } from '../../sim/data/lifestyle';
import { conferenceDay } from '../../sim/lifestyle';
import type { LifestyleView } from '../../sim/types';
import { useGame } from '../../state/game';
import { act, SiteFrame } from '../frame';
import { useLifestyle } from '../hooks';
import { DAVOZ, EBUY, LIFESTYLES, LOTTO as LOTTO_HOST } from '../urls';
import { HitCounter, Link, Marquee, useTitle } from '../web';

const KIND_GLYPH = { car: '🏎', watch: '⌚', art: '🖼', yacht: '🛥', jet: '✈', home: '🏛', team: '⚾', title: '👑' } as const;

/**
 * The Lifestyles Catalogue (spec §14.2): cars, watches, art, a yacht, a jet, a mansion and a minor-league team. Each has
 * a price, a month's upkeep and a resale value (most depreciate; art can appreciate), counts towards net worth at what a
 * dealer would pay, and lends the firm prestige that brings bigger mandate offers.
 */
export function Lifestyles() {
  useTitle('The Lifestyles Catalogue — Because You Are Worth It (Probably)');
  const view = useLifestyle();
  const modules = useGame((s) => s.settings?.modules);
  const owned = (view?.assets ?? []).filter((a) => a.sold === undefined);
  const catalogue = ASSETS.filter((a) => !a.module || modules?.[a.module]);
  return (
    <SiteFrame
      home={LIFESTYLES}
      logo="The Lifestyles Catalogue"
      tagline="For the investor who has made it, or would like to look as if they had."
      look={{ head: '#1a1a1a', ink: '#d9b44a', accent: '#8c6d1f', page: '#fbf7ec', font: 'Georgia, "Times New Roman", serif' }}
      footer={`All prices in US dollars, cash only. Delivery, crew, stabling and insurance are the monthly upkeep, billed on the first trading day. We buy back at our dealer’s price. © ${gameYear(START_DAY)}.`}
    >
      {view && (
        <p className="frame-box">
          Your collection is worth <b>{money(owned.reduce((a, x) => a + x.value, 0))}</b> to a dealer today, and lends your firm{' '}
          <b>prestige {view.prestige.toFixed(1)}</b> (your office included). Prestige brings bigger mandate offers, more often.
        </p>
      )}
      <div className="catalogue">
        {catalogue.map((a) => (
          <div key={a.id} className="catalogue-item">
            <div className="catalogue-glyph" aria-hidden="true">
              {KIND_GLYPH[a.kind]}
            </div>
            <b>{a.name}</b>
            <p>
              <i>{a.blurb}</i>
            </p>
            <p>
              <b>{money(a.price)}</b> · upkeep {money(a.upkeep)} a month · prestige +{a.prestige}
              <br />
              <small>
                A dealer pays {Math.round(a.resale * 100)}% back the day after. {a.drift > 0 ? 'Tends to appreciate.' : a.drift < 0 ? 'Depreciates.' : 'Holds its value, such as it is.'}
              </small>
            </p>
            <button onClick={() => void act(simulation().lifestyleAction({ do: 'buyAsset', asset: a.id }))}>Buy it now</button>
          </div>
        ))}
      </div>
      <h2>What you own</h2>
      {owned.length ? (
        <table className="frame-table" cellPadding={3}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Bought</th>
              <th className="right">Paid</th>
              <th className="right">Worth today</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {owned.map((a) => (
              <tr key={a.id}>
                <td>{ASSET[a.asset]?.name ?? a.asset}</td>
                <td>{formatDate(a.bought)}</td>
                <td className="right">{money(a.cost)}</td>
                <td className={`right ${tone(a.value - a.cost)}`}>{money(a.value)}</td>
                <td>
                  <button onClick={() => void act(simulation().lifestyleAction({ do: 'sellAsset', id: a.id }))}>Sell to dealer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>Nothing yet. The yacht is very nice this time of year.</p>
      )}
      {view && view.realized !== 0 && (
        <p>
          Profit and loss on luxuries and collectibles sold so far: <span className={tone(view.realized)}>{signedMoney(view.realized)}</span>
        </p>
      )}
    </SiteFrame>
  );
}

const PHASE_WORDS = ['Steady', 'Heating up', 'MANIA', 'Crashing'];

/**
 * eBuy (spec §14.2): auctions for collectibles whose prices follow hype cycles — Meanie Babies, trading cards, retro
 * computers. Bid against AI buyers; sell what you own, less eBuy's fee.
 */
export function Ebuy({ url }: { url: URL }) {
  useTitle('eBuy — Your Personal Trading Community');
  const view = useLifestyle();
  const category = url.searchParams.get('c');
  const cat = category === null ? undefined : Number(category);
  const day = useGame((s) => (s.snapshot ? dayOf(s.snapshot.time) : 0));
  const open = (view?.auctions ?? []).filter((a) => !a.result && (cat === undefined || a.category === cat)).sort((a, b) => a.ends - b.ends);
  const done = (view?.auctions ?? []).filter((a) => a.result && (a.max !== undefined || a.selling !== undefined)).reverse();
  return (
    <SiteFrame
      home={EBUY}
      logo={
        <span className="ebuy-logo">
          <i style={{ color: '#e53238' }}>e</i>
          <i style={{ color: '#0064d2' }}>B</i>
          <i style={{ color: '#f5af02' }}>u</i>
          <i style={{ color: '#86b817' }}>y</i>
        </span>
      }
      tagline="Your personal trading community"
      look={{ head: '#fff', ink: '#333', accent: '#0064d2', page: '#fff', font: 'Verdana, Geneva, sans-serif' }}
      nav={[[`http://${EBUY}/`, 'All'], ...CATEGORIES.map((c, k): [string, string] => [`http://${EBUY}/?c=${k}`, c.name])]}
      footer={`eBuy takes ${Math.round(EBUY_FEE * 100)}% of the final price when you sell. Winning bidders must pay. © ${gameYear(START_DAY)} eBuy Inc.`}
    >
      {view && (
        <p className="frame-box">
          {CATEGORIES.map((c, k) => (
            <span key={c.id}>
              {k > 0 && ' · '}
              <b>{c.name}</b>: {PHASE_WORDS[view.hype[k].phase]} <small>(prices ×{Math.exp(view.hype[k].level).toFixed(2)})</small>
            </span>
          ))}
        </p>
      )}
      {view?.hype.some((h) => PHASES[h.phase].name === 'mania') && (
        <Marquee speed={16} className="frame-marquee">
          *** RECORD PRICES *** Collectors say it can only go up *** Grandma’s attic is a gold mine ***
        </Marquee>
      )}
      <h2>Auctions ending soon</h2>
      {!open.length && <p>No auctions right now. New items are listed at every day’s close.</p>}
      <table className="frame-table" cellPadding={3} hidden={!open.length}>
        <thead>
          <tr>
            <th>Item</th>
            <th className="right">Current bid</th>
            <th>Ends</th>
            <th>Your bid</th>
          </tr>
        </thead>
        <tbody>
          {open.slice(0, 40).map((a) => (
            <Lot key={a.id} auction={a} today={day} />
          ))}
        </tbody>
      </table>
      <h2>My eBuy</h2>
      {view?.items.length ? (
        <table className="frame-table" cellPadding={3}>
          <thead>
            <tr>
              <th>Item</th>
              <th className="right">Paid</th>
              <th className="right">Worth now</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {view.items.map((i) => (
              <tr key={i.id}>
                <td>{CATEGORIES[i.category].items[i.item][0]}</td>
                <td className="right">{money(i.cost)}</td>
                <td className={`right ${tone(i.value - i.cost)}`}>{money(i.value)}</td>
                <td>{i.listed !== undefined ? 'Up for auction' : <SellButton id={i.id} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>You own no collectibles. Yet.</p>
      )}
      {done.length > 0 && (
        <>
          <h3>Finished</h3>
          <ul>
            {done.map((a) => (
              <li key={a.id}>
                {CATEGORIES[a.category].items[a.item][0]}: {RESULT[a.result!]} at {money(a.price)}
              </li>
            ))}
          </ul>
        </>
      )}
      <HitCounter count={8_675_309 + open.length} />
    </SiteFrame>
  );
}

const RESULT = { won: 'you won', lost: 'outbid', sold: 'sold', unsold: 'did not reach the reserve', unpaid: 'won, but you could not pay' } as const;

function Lot({ auction: a, today }: { auction: LifestyleView['auctions'][number]; today: number }) {
  const [max, setMax] = useState('');
  const left = Math.max(0, a.ends - today);
  return (
    <tr>
      <td>
        {CATEGORIES[a.category].items[a.item][0]}
        {a.selling !== undefined && <i> (yours)</i>}
      </td>
      <td className="right">{money(a.price)}</td>
      <td>{left ? `${left} day${left === 1 ? '' : 's'}` : 'Today'}</td>
      <td>
        {a.selling !== undefined ? (
          a.reserve ? `Reserve ${money(a.reserve)}` : 'No reserve'
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(simulation().lifestyleAction({ do: 'bid', auction: a.id, max: Number(max.replace(/[$,]/g, '')) })).then((ok) => ok && setMax(''));
            }}
          >
            {a.leader === 'player' ? <b className="up">High bidder (up to {money(a.max!)}) </b> : a.max !== undefined ? <b className="down">Outbid! </b> : null}
            <input size={7} aria-label="Maximum bid" placeholder="Max bid" value={max} onChange={(e) => setMax(e.target.value)} /> <button type="submit">Bid</button>
          </form>
        )}
      </td>
    </tr>
  );
}

function SellButton({ id }: { id: number }) {
  const [reserve, setReserve] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void act(simulation().lifestyleAction({ do: 'sellItem', id, reserve: Number(reserve.replace(/[$,]/g, '')) || 0 }));
      }}
    >
      <input size={6} aria-label="Reserve price" placeholder="Reserve" value={reserve} onChange={(e) => setReserve(e.target.value)} /> <button type="submit">Sell</button>
    </form>
  );
}

/**
 * The Davoz Economic Forum and the other conferences (spec §14.2): a ticket buys a few days of networking — mandate
 * offers, new ISeekYou contacts and their tips.
 */
export function Conferences() {
  useTitle('Davoz Economic Forum — Committed to Improving the State of the World’s Ski Slopes');
  const view = useLifestyle();
  const today = useGame((s) => (s.snapshot ? dayOf(s.snapshot.time) : START_DAY));
  const year = new Date(today * 86_400_000).getUTCFullYear();
  return (
    <SiteFrame
      home={DAVOZ}
      logo="DAVOZ ECONOMIC FORUM"
      tagline="And other places to be seen"
      look={{ head: '#003a70', ink: '#fff', accent: '#003a70', page: '#f7f9fc', font: 'Arial, Helvetica, sans-serif' }}
      footer={`The Davoz Economic Forum is a not-for-profit foundation. Tickets are non-refundable. We sell tickets to other people’s conferences as a courtesy. © ${gameYear(START_DAY)}.`}
    >
      <p>
        Business is people. Meet the pension trustees who hand out mandates, the insiders who know things and the moguls who
        know the insiders. What you take home depends on the room: Davoz for the mandates, COMDEXX for the gossip.
      </p>
      <table className="frame-table" cellPadding={4}>
        <tbody>
          {CONFERENCES.map((c) => {
            const when = conferenceDay(c.id, year) > today ? year : year + 1;
            const has = view?.tickets.some((t) => t.conference === c.id && t.year === when);
            return (
              <tr key={c.id}>
                <td>
                  <b>{c.name}</b>
                  <br />
                  {c.where}, {formatDate(conferenceDay(c.id, when))}
                  <br />
                  <small>{c.blurb}</small>
                </td>
                <td className="right">{money(c.price)}</td>
                <td>
                  {has ? (
                    <b>Ticket booked</b>
                  ) : (
                    <button onClick={() => void act(simulation().lifestyleAction({ do: 'ticket', conference: c.id }))}>Buy a ticket</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </SiteFrame>
  );
}

/** The State Lotto (spec §14.2): negative expected value, as in life. Drawn at each week’s last close. */
export function Lotto() {
  useTitle('State Lotto 6/49 — Somebody Has To Win');
  const view = useLifestyle();
  const [n, setN] = useState('10');
  const draws = [...(view?.lotto.draws ?? [])].reverse();
  const spent = draws.reduce((a, d) => a + d.tickets * LOTTO.price, 0);
  const won = draws.reduce((a, d) => a + d.won, 0);
  return (
    <SiteFrame
      home={LOTTO_HOST}
      logo="★ STATE LOTTO 6/49 ★"
      tagline="Somebody has to win. Statistically, it is not you."
      look={{ head: '#ffcc00', ink: '#c8102e', accent: '#c8102e', page: '#fffbe6', font: '"Arial Black", Arial, sans-serif' }}
      footer={`Tickets ${money(LOTTO.price)}. Match 6 of ${LOTTO.of}: ${money(LOTTO.jackpot)}. Match 5: ${money(LOTTO.prizes[5])}. Match 4: ${money(LOTTO.prizes[4])}. Match 3: ${money(LOTTO.prizes[3])}. Odds of the jackpot: 1 in 13,983,816. Proceeds support the State Education Fund. Play responsibly. © ${gameYear(START_DAY)}.`}
    >
      <p className="frame-box">
        This week you hold <b>{count(view?.lotto.tickets ?? 0)}</b> Quick Pick ticket{view?.lotto.tickets === 1 ? '' : 's'}. The draw is at the
        close on the last trading day of the week.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act(simulation().lifestyleAction({ do: 'lotto', count: Number(n) }));
        }}
      >
        Quick Picks: <input size={5} aria-label="Tickets" value={n} onChange={(e) => setN(e.target.value)} /> <button type="submit">Buy tickets</button>
      </form>
      <h3>Your draws</h3>
      {draws.length ? (
        <>
          <table className="frame-table" cellPadding={3}>
            <tbody>
              {draws.map((d) => (
                <tr key={d.day}>
                  <td>{formatDate(d.day)}</td>
                  <td>
                    {d.numbers.map((x) => (
                      <span key={x} className="lotto-ball">
                        {x}
                      </span>
                    ))}
                  </td>
                  <td>{count(d.tickets)} tickets</td>
                  <td className={d.won ? 'up' : ''}>{d.won ? `Won ${money(d.won)}!` : 'No win'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Spent {money(spent)}, won {money(won)}: <span className={tone(won - spent)}>{signedMoney(won - spent)}</span>.
          </p>
        </>
      ) : (
        <p>
          You have not played. <Link href={`http://${LOTTO_HOST}/`}>You gotta be in it to win it.</Link>
        </p>
      )}
    </SiteFrame>
  );
}
