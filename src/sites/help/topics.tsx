import type { ReactNode } from 'react';
import { money, pct } from '../../apps/format';
import { CONTRACTS, CONTRACT_INDEX, EXPIRY_WARNING_DAYS, FTD_FINE, MAINTENANCE, OPEK_HINT_DAYS, OPEK_RELIABILITY, PHYSICAL_DISCOUNT, STORAGE_RATE, WEATHER_LEAD, WEATHER_PRICED, WEATHER_RELIABILITY } from '../../sim/data/commodities';
import { BANK_LIMIT, EARLY_FEE, GRACE_DAYS, LATE_FEE, MIN_LOAN, TIERS, quoteLoan } from '../../sim/loans';
import { FUNDS, FUND_SPONSOR, SECTOR_SIZE } from '../../sim/data/funds';
import { MARGIN_SPREAD, maintenanceRates } from '../../sim/margin';
import { FINE_DAYS, HEAT_DECAY } from '../../sim/regulator';
import { MAX_LEVERAGE, type GameSettings } from '../../sim/settings';
import { ALWAYS_AVAILABLE, GC_FEE, MAX_FEE, RECALL_DAYS } from '../../sim/shorts';
import { BANK, EQUIFACTS, EXCHANGE, FED, OPEK, QUOTEZONE, RAGINGBEAR, TUCATS, WEATHER } from '../urls';
import { PRICES, SEIZE_DISCOUNT, SHARK_RANGE, SHARK_WEEKLY, SHELL_FEE } from '../../sim/data/darkweb';
import { usd } from '../darkweb/terms';
import { Link } from '../web';
import { Example, Go, See, Steps, Tip } from './parts';

/** What a guide may quote from the game in progress: its settings (commission, leverage, grace…). */
export interface HelpContext {
  settings: GameSettings;
}

export const SECTIONS = [
  { id: 'start', title: 'Getting Started' },
  { id: 'stocks', title: 'Stocks and Orders' },
  { id: 'margin', title: 'Margin and Short Selling' },
  { id: 'futures', title: 'Futures and Commodities' },
  { id: 'loans', title: 'Loans and Credit' },
  { id: 'firm', title: 'Clients, News and Your Firm' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

export interface Topic {
  id: string;
  title: string;
  section: SectionId;
  /** Questions this guide answers: listed with it, and what the question box matches first. */
  questions: string[];
  /** More words the question box matches. */
  keywords: string;
  body(ctx: HelpContext): ReactNode;
}

const commission = (s: GameSettings) =>
  `${money(s.commission.fixed)} an order${s.commission.rate ? ` plus ${pct(s.commission.rate, 2)} of the value traded` : ''}`;
const leverage = (s: GameSettings) => `${s.maxLeverage}:1`;
const days = (n: number) => `${n} trading day${n === 1 ? '' : 's'}`;
const spec = (code: string) => CONTRACTS[CONTRACT_INDEX[code]];

export const TOPICS: Topic[] = [
  // ---------- Getting started ----------
  {
    id: 'welcome',
    title: 'Your first day: what is going on here?',
    section: 'start',
    questions: ['What am I supposed to do?', 'How do I play?', 'How do I win the game?', 'Where do I start?'],
    keywords: 'beginner new start begin goal aim tutorial basics overview confused help',
    body: ({ settings }) => (
      <>
        <p>
          You run an investment firm. You start with {money(settings.startingCapital)} of your founding clients’ money, and
          your job is to make it grow by buying and selling investments: shares of the 10,000 companies on the market,
          futures on commodities such as oil, gold and corn, and — if you are brave — borrowed money.
        </p>
        <p>
          There is no winning post: the game goes on for as long as you like, and your score is your firm’s net worth and
          how it compares with the <b>MAJOR 500</b>, the index of the 500 largest companies. Beat it and clients bring you
          more money; lag it and they take theirs away. The only way to lose is <See topic="bankruptcy">bankruptcy</See>: owing
          money you cannot pay.
        </p>
        <h3>The programs you will use</h3>
        <ul>
          <li>
            <b>MajorTrade Pro 98</b> — quotes, the order ticket, your portfolio, futures, loans. <Go app="trade" tab="quotes">Open it</Go>
          </li>
          <li>
            <b>Internet Exploiter</b> — company web sites, the news, market data (QuoteZone) and this guide.
          </li>
          <li>
            <b>Outbox Express</b> — letters from clients, your broker, your bank and tipsters. <Go app="mail">Open it</Go>
          </li>
          <li>
            <b>My Computer</b> — saves, your firm, its fees and its clients. <Go app="mycomputer">Open it</Go>
          </li>
        </ul>
        <h3>A sensible first day</h3>
        <Steps>
          <li>Read your mail: the welcome letter and the morning briefing tell you what the day holds.</li>
          <li>
            Look around the market: the watchlist in MajorTrade’s Quotes tab, <Link href={`http://${QUOTEZONE}/`}>QuoteZone</Link>’s
            movers and a few company web sites. See <See topic="research">Finding companies to buy</See>.
          </li>
          <li>
            Buy a handful of large, steady companies to start with. See <See topic="buying">How do I buy shares?</See>
          </li>
          <li>Let the clock run and watch your portfolio. Save with Ctrl+S.</li>
        </Steps>
        <Tip>
          Keep it simple at first. Margin, short selling, futures and loans all multiply your gains and your losses; learn
          each before you lean on it.
        </Tip>
      </>
    ),
  },
  {
    id: 'time',
    title: 'Time, trading hours and the speed buttons',
    section: 'start',
    questions: ['When is the market open?', 'How do I make time go faster?', 'Why did my order not fill?', 'How do I pause the game?'],
    keywords: 'clock speed pause fast skip hours open close weekend holiday premarket halt time tray',
    body: () => (
      <>
        <p>
          The market trades from <b>09:30 to 16:00</b>, Monday to Friday, except on holidays. Before the open (from 08:00) is the
          pre-market: news breaks and orders queue, but nothing trades. The light in the tray is green when the market is open,
          amber before it and red when it is shut.
        </p>
        <p>
          The buttons in the tray set the speed: ⏸ pauses, 1× runs a trading day in about two real minutes, and 2×, 5× and 20×
          go faster. ⏭ skips to the next opening bell. Nights and weekends pass in a couple of seconds whatever the speed.
        </p>
        <p>
          Orders placed while the market is shut wait for the open and fill then, after the overnight gap — the price can
          open some way from where it closed. If the MAJOR 500 falls 10% in a day, trading halts until the next morning.
        </p>
        <Tip>Pause while you think. Nothing moves while the clock is stopped, and you can still read, research and place orders.</Tip>
      </>
    ),
  },
  {
    id: 'saving',
    title: 'Saving and loading your game',
    section: 'start',
    questions: ['How do I save?', 'How do I load a game?', 'Where are my saves?'],
    keywords: 'save load autosave export import d98 slot file',
    body: () => (
      <>
        <p>
          Press <b>Ctrl+S</b> (⌘S on a Mac) at any time, or use File → Save in any program. The game also saves itself at the
          end of each trading week and before you sign a loan, into three rotating autosaves.
        </p>
        <p>
          <Go app="mycomputer" view="saves">My Computer → Saves</Go> lists your saved games: load, delete, or export one as a
          .d98 file to keep it safe (and import it again later, or drop it on the desktop). When you switch the computer on,
          it carries on from your most recent save.
        </p>
      </>
    ),
  },

  // ---------- Stocks ----------
  {
    id: 'stocks',
    title: 'What is a stock, and why do prices move?',
    section: 'stocks',
    questions: ['What is a stock?', 'Why do stock prices go up and down?', 'What moves prices?', 'What is the MAJOR 500?'],
    keywords: 'share shares equity company price move value earnings index market cap crash regime sector fundamentals',
    body: () => (
      <>
        <p>
          A share of stock is a small piece of a company. Its price is whatever buyers and sellers agree on, and it moves for
          four kinds of reasons:
        </p>
        <ul>
          <li>
            <b>The whole market.</b> Moods come and go: calm, nervous, turbulent, the occasional crash (every few years) and
            the occasional bout of euphoria. Most stocks rise and fall together with them.
          </li>
          <li>
            <b>The industry.</b> Oil companies move with oil, airlines against it; banks care about interest rates, tech
            companies about everything.
          </li>
          <li>
            <b>The company’s own news.</b> Quarterly earnings (reported in seasons starting mid-January, April, July and
            October), product launches, lawsuits, takeovers, scandals, a new chief executive. News breaks on the Majorsoft
            Newswire first. See <See topic="news">News, rumours and tips</See>.
          </li>
          <li>
            <b>Its value.</b> Every company has a value set by its earnings and growth. Prices wander away from it, but over
            months they are pulled back towards it. A well-run company’s value grows; a badly run one’s may not.
          </li>
        </ul>
        <p>
          A company’s <b>market capitalisation</b> is its share price times the number of shares: what the whole company is
          worth to the market. The <b>MAJOR 500</b> is an index of the 500 largest, starting at 1,000 in January 1998: when
          people say “the market”, they mean it.
        </p>
        <Tip>
          Large companies move less than small ones, and bad news hits small, poorly run companies hardest. Quality and
          patience pay.
        </Tip>
      </>
    ),
  },
  {
    id: 'research',
    title: 'Finding companies to buy',
    section: 'stocks',
    questions: ['How do I find a good stock?', 'What do P/E, EPS, beta and dividend yield mean?', 'How do I add a stock to my watchlist?'],
    keywords: 'research watchlist quote window key stats screener pe ratio eps beta yield dividend website investor relations quotezone',
    body: () => (
      <>
        <p>Places to look:</p>
        <ul>
          <li>
            <b>MajorTrade → Quotes</b>: your watchlists. Type a ticker or name in the <i>Add</i> box to add a company;
            double-click a row to open its quote window, with a chart and key statistics. <Go app="trade" tab="quotes">Open Quotes</Go>
          </li>
          <li>
            <b><Link href={`http://${QUOTEZONE}/`}>QuoteZone</Link></b>: the day’s biggest movers, a map of every industry, and a
            screener to filter companies by size, P/E and dividend yield.
          </li>
          <li>
            <b>Company web sites</b>: type a company’s name in the address bar. Its Investor Relations page has eight quarters
            of results, its largest shareholders and its short interest.
          </li>
          <li>
            <b>The news</b> and the <Link href={`http://${RAGINGBEAR}/`}>Raging Bear</Link> message boards, where rumours start.
          </li>
        </ul>
        <h3>What the numbers mean</h3>
        <dl className="reeves-terms">
          <dt>EPS</dt>
          <dd>Earnings per share: the company’s profit over the last year, divided by its shares.</dd>
          <dt>P/E ratio</dt>
          <dd>
            Price divided by EPS: how many years of today’s profits the price pays for. High for companies expected to grow,
            low for dull or troubled ones. Loss-makers have none.
          </dd>
          <dt>Dividend yield</dt>
          <dd>The dividend paid over a year as a share of the price. Dividends are paid each quarter, on the day a company reports.</dd>
          <dt>Beta</dt>
          <dd>How much the stock moves with the market: 1.5 means it tends to rise or fall one and a half times as much.</dd>
          <dt>52-week range</dt>
          <dd>The lowest and highest price of the past year.</dd>
          <dt>Short interest</dt>
          <dd>The share of its freely traded stock that investors have sold short, betting it will fall.</dd>
        </dl>
      </>
    ),
  },
  {
    id: 'buying',
    title: 'How do I buy (and sell) shares?',
    section: 'stocks',
    questions: ['How do I buy a stock?', 'How do I sell my shares?', 'What does it cost to trade?', 'What is the bid and the ask?'],
    keywords: 'buy sell purchase trade order ticket commission spread bid ask impact cost fee place review',
    body: ({ settings }) => (
      <>
        <Steps>
          <li>
            Open <Go app="trade" tab="ticket">MajorTrade → Order Ticket</Go> (or press Buy… in a quote window, which fills it in
            for you).
          </li>
          <li>Type the ticker or the company’s name in <i>Symbol</i> and pick it from the list.</li>
          <li>
            <i>Action</i>: <b>Buy</b>. (To sell shares you own, choose <b>Sell</b>.)
          </li>
          <li>
            <i>Quantity</i>: the number of shares. The estimate below shows what it will cost and your buying power afterwards.
          </li>
          <li>
            <i>Order type</i>: <b>Market</b> buys at once at the going price. See <See topic="orders">order types</See> for the others.
          </li>
          <li>Press <b>Review Order…</b>, check it, then <b>Place Order</b>.</li>
        </Steps>
        <p>The notice in the tray confirms the fill, and the shares appear in your Portfolio.</p>
        <h3>What trading costs</h3>
        <ul>
          <li>
            <b>Commission</b>: {commission(settings)}.
          </li>
          <li>
            <b>The spread</b>: you buy at the <i>ask</i> and sell at the <i>bid</i>, a little either side of the price. Small
            companies have wider spreads.
          </li>
          <li>
            <b>Market impact</b>: a big order moves the price against you. The ticket warns you when an order is more than 5%
            of the stock’s average daily volume.
          </li>
        </ul>
        <Tip>A few large orders cost less in commission than many small ones, but don’t try to buy a small company in one go.</Tip>
      </>
    ),
  },
  {
    id: 'orders',
    title: 'Order types: market, limit, stop, stop-limit and trailing stop',
    section: 'stocks',
    questions: ['What is a limit order?', 'What is a stop loss?', 'What is a trailing stop?', 'How do I cancel an order?', 'What is Day and GTC?'],
    keywords: 'order type market limit stop stoploss stop-limit trailing tif day gtc good till cancelled cancel modify partial fill',
    body: () => (
      <>
        <dl className="reeves-terms">
          <dt>Market</dt>
          <dd>Buy or sell now, at the going price. Certain to fill (while the market is open), but not at a price you choose.</dd>
          <dt>Limit</dt>
          <dd>
            Buy at this price or lower (sell at this price or higher). If the market is already there it fills at once;
            otherwise it waits for the market to come to it, and fills a little at a time — at most a fifth of each five
            minutes’ trading volume.
          </dd>
          <dt>Stop</dt>
          <dd>
            Waits until the price reaches the stop, then becomes a market order. A sell stop below the price is a
            <i> stop loss</i>: it gets you out if things go wrong. If the price jumps past the stop overnight, it fills at the
            opening price, which may be worse.
          </dd>
          <dt>Stop-limit</dt>
          <dd>Like a stop, but becomes a limit order when triggered: no worse than the limit, but it may not fill at all.</dd>
          <dt>Trailing stop</dt>
          <dd>
            A stop that follows the price at a distance you choose (say 10%): as the price rises, the stop rises with it; it
            never falls. It lets a winner run and sells when it turns.
          </dd>
        </dl>
        <p>
          <b>Time in force</b>: a <i>Day</i> order is cancelled at the close if it hasn’t filled; <i>Good ’til cancelled</i> waits
          until it fills or you cancel it. See your open orders, cancel or change them in <Go app="trade" tab="orders">MajorTrade → Orders</Go>.
        </p>
        <Example>
          <p>
            You own 1,000 shares bought at $40, now $50. A trailing stop at 10% sits at $45. The price climbs to $60: the stop
            climbs to $54. The price falls back to $54 and you are sold out, keeping most of the gain.
          </p>
        </Example>
      </>
    ),
  },
  {
    id: 'portfolio',
    title: 'Reading your portfolio: net worth, equity and profit',
    section: 'stocks',
    questions: ['What is my net worth?', 'What is unrealised profit?', 'What is buying power?', 'Where do I see my money?'],
    keywords: 'portfolio net worth equity cash buying power unrealised realised profit loss pnl p&l ledger performance recycle bin',
    body: () => (
      <>
        <p>
          <Go app="trade" tab="portfolio">MajorTrade → Portfolio</Go> sums up the firm:
        </p>
        <dl className="reeves-terms">
          <dt>Net worth</dt>
          <dd>Everything you own less everything you owe: cash, positions at today’s prices, goods in the lobby, less loans.</dd>
          <dt>Cash</dt>
          <dd>Money in your brokerage account. Negative means you are borrowing from your broker (see <See topic="margin">margin</See>).</dd>
          <dt>Equity</dt>
          <dd>Your account’s worth to the broker: cash plus the stocks you own, less the shares you are short, plus open futures profits.</dd>
          <dt>Buying power</dt>
          <dd>How much more stock you could buy now, borrowing included.</dd>
          <dt>Unrealised and realised</dt>
          <dd>
            Unrealised profit is on paper: positions you still hold, at today’s price. Realised profit is banked: from
            positions you have sold, dividends, futures settlements, less fees and interest.
          </dd>
          <dt>Since start</dt>
          <dd>Your return since the firm was founded; the chart compares it with the MAJOR 500.</dd>
        </dl>
        <p>
          Every dollar in and out is in <Go app="trade" tab="ledger">the Ledger</Go>. Losing trades end up in the Recycle Bin on
          the desktop, sized by what they cost you.
        </p>
      </>
    ),
  },
  {
    id: 'events',
    title: 'Dividends, takeovers and companies that go bust',
    section: 'stocks',
    questions: ['What happens when a company I own is taken over?', 'What happens if a company goes bankrupt?', 'How do dividends work?'],
    keywords: 'dividend takeover acquisition merger buyout bankrupt delisted written off offer',
    body: () => (
      <>
        <ul>
          <li>
            <b>Dividends</b> are paid every quarter on the day the company reports, into your cash. The price drops by the
            dividend that morning, so you are no richer on the day — the reward is getting paid to wait.
          </li>
          <li>
            <b>Takeovers</b>: when a company is bid for, its price jumps towards the offer. Most deals complete a month or two
            later, and you are paid the offer price in cash for your shares; some collapse and the price falls back.
          </li>
          <li>
            <b>Bankruptcies</b>: a failed company is delisted and its shares are worth nothing. You lose what you paid. (If you
            were short, you keep your winnings.)
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'funds',
    title: 'Index funds: buying the whole market',
    section: 'stocks',
    questions: ['What is an index fund?', 'How do I buy the MAJOR 500?', 'What are sector funds?', 'What does a fund cost?'],
    keywords: 'index fund funds mjr sector etf tracker mutual fund diversify diversification expense ratio fee units nav whole market passive',
    body: ({ settings }) => (
      <>
        <p>
          An index fund buys a whole list of companies for you. {FUND_SPONSOR} run {FUNDS.length} of them: <b>MJR</b>, which holds
          all 500 companies of the MAJOR 500, and one fund for each industry, holding its {SECTOR_SIZE} largest companies. Each
          owns its companies in proportion to their market value, collects their dividends and reinvests them.
        </p>
        <Steps>
          <li>
            Open <Go app="trade" tab="funds">MajorTrade → Funds</Go> and pick a fund: MJR, or an industry you believe in.
          </li>
          <li>Enter a number of units and press Buy. Units are filled at once at the fund’s value, while the market is open.</li>
          <li>To get out, pick your fund under “Your funds” and press Sell All, or sell some units.</li>
        </Steps>
        <h3>What they cost</h3>
        <p>
          The usual commission on each trade, a tiny spread, and a yearly fee taken out of the fund’s value a little each day:
          in this game {pct(settings.fundFees.index, 2)} a year for MJR and {pct(settings.fundFees.sector, 2)} for a sector fund.
          Funds are bought and sold, never shorted; to bet against the market, sell the MAJOR 500 future short.
        </p>
        <Example>
          <p>
            {money(100_000)} in MJR follows the MAJOR 500 up and down, and adds its dividends. Over a year the fee costs about{' '}
            {money(100_000 * settings.fundFees.index)}. Beating that with your own stock picks is harder than it looks — and it’s what
            your clients pay you for.
          </p>
        </Example>
        <Tip>A fund of a whole industry still falls with it. A client who bans tobacco bans the tobacco fund too.</Tip>
      </>
    ),
  },

  // ---------- Margin and short selling ----------
  {
    id: 'margin',
    title: 'Margin: buying with borrowed money',
    section: 'margin',
    questions: ['What is margin?', 'What is a margin call?', 'Why is my cash negative?', 'How much can I borrow from my broker?', 'What happens if I get a margin call?'],
    keywords: 'margin leverage borrow broker buying power margin call maintenance initial requirement liquidation forced sale debit interest negative cash',
    body: ({ settings }) => {
      const L = settings.maxLeverage;
      const rates = maintenanceRates(L);
      const fall = 1 - (L - 1) / ((1 - rates.long) * L);
      return (
        <>
          {L > 1 ? (
            <p>
              Your account at the broker is a <b>margin account</b>: you can buy more stock than you have cash for, and the
              broker lends you the difference. In this game the limit is <b>{leverage(settings)}</b>: each dollar of your equity
              buys up to {money(L)} of stock. Borrowing shows as negative cash, and costs the Federal Reservoir’s rate plus{' '}
              {pct(MARGIN_SPREAD * settings.loanRates, 1)} a year, charged every night.
            </p>
          ) : (
            <p>
              Leverage is <b>switched off</b> in this game: you can buy only as much stock as your equity pays for, and the
              broker lends you nothing. (A new game can switch it on in Advanced Settings → Trading, up to {MAX_LEVERAGE}:1.) The
              rules below still matter for short sales and futures, and a bank loan is borrowed money all the same.
            </p>
          )}
          <p>The broker has two rules:</p>
          <ul>
            <li>
              <b>To open</b> a position you need equity of {pct(1 / L, 0)} of its value (the <i>initial requirement</i>). Your
              buying power is what that leaves.
            </li>
            <li>
              <b>To keep</b> your positions, your equity must stay above {pct(rates.long, 1)} of what you own and{' '}
              {pct(rates.short, 1)} of what you are short, plus the margin on any futures (the <i>maintenance
              requirement</i>).
            </li>
          </ul>
          <h3>Margin calls</h3>
          <p>
            If at the close your equity is below the maintenance requirement, the broker sends a <b>margin call</b> and a red
            banner appears in your Portfolio. You have {days(settings.marginGrace)} to put it right: sell something, or hope
            prices recover. If it is still short at the opening bell on the deadline, the broker sells for you — your worst
            positions first — until the account is safe. If your equity has gone below zero, it sells at the very next open.
          </p>
          {L > 1 && (
            <Example>
              <p>
                You have {money(100_000)} and buy {money(100_000 * L)} of stock, borrowing {money(100_000 * (L - 1))}. If the
                stock rises 10%, you make {money(10_000 * L)}: {pct(0.1 * L, 0)} on your money. If it falls 10%, you lose the
                same. A fall of about {pct(fall, 0)} brings a margin call; a fall of {pct(1 / L, 0)} wipes you out.
              </p>
            </Example>
          )}
          <Tip>
            Keep some buying power spare. The broker doesn’t ask whether now is a good time to sell, and a margin call in a
            crash sells at the bottom.
          </Tip>
        </>
      );
    },
  },
  {
    id: 'shorting',
    title: 'Short selling: making money when a price falls',
    section: 'margin',
    questions: ['How do I short a stock?', 'What is short selling?', 'What is a borrow fee?', 'What is a short squeeze?', 'What is a recall?'],
    keywords: 'short sell short cover buy to cover borrow fee locate hard to borrow recall buy-in squeeze short interest bet fall',
    body: ({ settings }) => (
      <>
        <p>
          Short selling is selling shares you don’t own: your broker borrows them for you, you sell them now, and later you
          buy them back (<i>cover</i>) and return them. If the price has fallen in between, you keep the difference.
        </p>
        <Steps>
          <li>
            In <Go app="trade" tab="ticket">the Order Ticket</Go>, choose the company and the action <b>Sell Short</b>. The estimate
            shows how many shares the broker can borrow and the <b>borrow fee</b>.
          </li>
          <li>Place the order. The position shows in your Portfolio with a minus: “100 short”.</li>
          <li>
            To close it, use the action <b>Buy to Cover</b> for the same number of shares.
          </li>
        </Steps>
        <h3>What it costs, and the risks</h3>
        <ul>
          <li>
            <b>Borrow fees</b>: large companies (worth ${ALWAYS_AVAILABLE / 1e9} billion or more) cost {pct(GC_FEE, 1)} a year to borrow.
            Small, heavily shorted ones are “hard to borrow” and can cost up to {pct(MAX_FEE, 0)} a year, charged every night.
          </li>
          <li>
            <b>Dividends</b>: while you are short you pay the lender the dividends.
          </li>
          <li>
            <b>Unlimited losses</b>: a stock can only fall to zero, but it can rise without limit. The broker requires equity of{' '}
            {pct(maintenanceRates(settings.maxLeverage).short, 0)} of your shorts’ value, so a rising short can bring a <See topic="margin">margin call</See>.
          </li>
          <li>
            <b>Recalls</b>: a lender can ask for its shares back. You get a letter and {days(RECALL_DAYS)} to cover; after that
            the broker buys them back for you at the open.
          </li>
          <li>
            <b>Squeezes</b>: good news on a heavily shorted stock sends it up much further than usual, as short sellers rush to
            cover. Check the short interest on the company’s Investor Relations page.
          </li>
        </ul>
        <Example>
          <p>
            You short 1,000 shares at $50 and receive $50,000. The price falls to $40: you buy them back for $40,000 and keep
            $10,000, less commissions and borrow fees. Had it risen to $80, covering would have cost $80,000: a $30,000 loss.
          </p>
        </Example>
        {!settings.shortSelling && <p className="down">Short selling is switched off in this game’s advanced settings.</p>}
      </>
    ),
  },

  // ---------- Futures ----------
  {
    id: 'futures',
    title: 'What is a futures contract?',
    section: 'futures',
    questions: ['What are futures?', 'How do futures work?', 'What is a contract?', 'What does going long or short a future mean?'],
    keywords: 'futures future contract commodity oil gold corn long short margin leverage face value notional multiplier month contango backwardation hedge index note',
    body: () => {
      const cl = spec('CL');
      const price = Math.round(cl.start);
      return (
        <>
          <p>
            A futures contract is a promise to buy (or sell) a fixed amount of something — 1,000 barrels of crude oil, 5,000
            bushels of corn, 100 ounces of gold — on a date in the future, at a price agreed today. They trade on the{' '}
            <Link href={`http://${EXCHANGE}/`}>Chicago Murkantile Exchange</Link>.
          </p>
          <ul>
            <li>
              <b>Buying</b> a contract (going <i>long</i>) profits if the price rises.
            </li>
            <li>
              <b>Selling</b> one you don’t own (going <i>short</i>) profits if it falls. No borrowing is needed.
            </li>
            <li>
              You don’t pay the price up front. You put down <b>margin</b>, a deposit of a few percent of the contract’s value
              (3–12% here), so a small move in the price is a big move in your money.
            </li>
            <li>Every contract has a <b>last trading day</b>, in its contract month. Most traders close or roll before then.</li>
          </ul>
          <Example>
            <p>
              Crude oil at ${price} a barrel. One contract is 1,000 barrels, so it is worth {money(price * 1000)}, and the margin
              is {pct(cl.margin, 0)} of that: {money(price * 1000 * cl.margin)}. If oil rises $1, you make{' '}
              {money(cl.multiplier)} — {pct(cl.multiplier / (price * 1000 * cl.margin), 0)} on the margin you put down. If it
              falls $1, you lose as much.
            </p>
          </Example>
          <h3>The contracts</h3>
          <table className="reeves-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Contract</th>
                <th>Size</th>
                <th>Margin</th>
                <th>At expiry</th>
              </tr>
            </thead>
            <tbody>
              {CONTRACTS.map((c) => (
                <tr key={c.code}>
                  <td>
                    <Link href={`http://${EXCHANGE}/contract?c=${c.code}`}>{c.code}</Link>
                  </td>
                  <td>{c.name}</td>
                  <td>{c.size}</td>
                  <td>{pct(c.margin, 0)}</td>
                  <td>{c.delivery ? 'Delivered' : 'Cash'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Why different months have different prices</h3>
          <p>
            Each commodity lists several months (its <i>chain</i>). Their prices differ because the market expects the price to
            change by then: heating oil is dear for winter, and a price that has shot up is expected to drift back. When later
            months are dearer the market is in <i>contango</i>; when they are cheaper, <i>backwardation</i>.
          </p>
          <p>
            Two contracts aren’t commodities: the <b>MAJOR 500 Index</b> future (MJ) moves with the stock market — selling it
            protects a portfolio of stocks against a fall — and the <b>10-Year Note</b> (ZN) moves opposite to interest rates.
          </p>
          <p>
            Next: <See topic="trading-futures">How do I trade futures?</See>
          </p>
        </>
      );
    },
  },
  {
    id: 'trading-futures',
    title: 'How do I trade futures? Step by step',
    section: 'futures',
    questions: ['How do I buy a futures contract?', 'How do I trade oil?', 'How do I close a futures position?', 'What does Roll do?'],
    keywords: 'trade futures buy sell contract oil gold corn close roll chain front month futures tab steps how',
    body: ({ settings }) => (
      <>
        <Steps>
          <li>
            Open <Go app="trade" tab="futures">MajorTrade → Futures</Go>. The board on the left lists every commodity with its price
            today.
          </li>
          <li>Click a commodity. Its contract chain appears on the right: one row per month, nearest (the <i>front month</i>) first.</li>
          <li>Click the month you want. The front month is the busiest, but it expires soonest.</li>
          <li>
            Type the number of <b>contracts</b>, then press <b>Buy…</b> to go long (you think the price will rise) or{' '}
            <b>Sell…</b> to go short (you think it will fall).
          </li>
          <li>The confirmation shows the contract’s value, the margin it needs and its last trading day. Press Buy or Sell.</li>
        </Steps>
        <p>
          Futures trade only while the market is open, 09:30 to 16:00, at the market price, filled at once. Commission is{' '}
          {commission(settings)}.
        </p>
        <h3>Watching and closing</h3>
        <p>Your positions are listed under <b>Your futures</b>:</p>
        <ul>
          <li>
            <b>Today</b> is the profit or loss since last night’s settlement; <b>Since entry</b> since you opened it. See{' '}
            <See topic="settlement">daily settlement</See>.
          </li>
          <li>
            <b>Close</b> sells what you bought (or buys back what you sold): the position is gone and the profit or loss is yours.
          </li>
          <li>
            <b>Roll</b> closes the position and opens the same one in the next month, to keep a bet going past the last trading
            day.
          </li>
        </ul>
        <Tip>
          Close or roll before the last trading day unless you want to own the goods. Hold a crude oil contract to the end and
          1,000 barrels arrive in your office lobby. See <See topic="expiry">Expiry and delivery</See>.
        </Tip>
        {!settings.futures && <p className="down">Futures trading is switched off in this game’s advanced settings.</p>}
      </>
    ),
  },
  {
    id: 'settlement',
    title: 'Daily settlement: how futures profits and losses are paid',
    section: 'futures',
    questions: ['What is mark to market?', 'Why did my cash change overnight?', 'What is variation margin?', 'How much margin do futures need?'],
    keywords: 'settlement settle mark to market variation margin daily overnight futures margin maintenance initial cash',
    body: () => (
      <>
        <p>
          Futures profits and losses don’t wait until you close. Every evening at 16:00 the exchange sets a <b>settlement
          price</b> for each contract, and each position’s change since the last one is paid into your cash, or taken out of it
          (<i>variation margin</i>, in your Ledger). The next day starts from the new price.
        </p>
        <p>
          While a position is open, its <b>initial margin</b> is set aside from your buying power. If losses take your equity
          below the maintenance level ({pct(MAINTENANCE, 0)} of the initial margin, alongside the requirements for your stocks),
          you get a <See topic="margin">margin call</See> like any other.
        </p>
        <Example>
          <p>
            You buy 2 gold contracts (100 ounces each) at $290. That night gold settles at $293: $3 × 100 × 2 = $600 is paid
            into your cash. The next night it settles at $288: $5 × 100 × 2 = $1,000 is taken out. If you then sell at $289,
            the last $1 × 200 = $200 is paid at once.
          </p>
        </Example>
      </>
    ),
  },
  {
    id: 'expiry',
    title: 'Expiry and delivery: the barrels in the lobby',
    section: 'futures',
    questions: ['What happens when a futures contract expires?', 'Why is there oil in my lobby?', 'How do I get rid of delivered goods?', 'What is the last trading day?'],
    keywords: 'expiry expire expiration delivery delivered lobby goods storage merchant sell goods last trading day third friday fail to deliver fine cash settled',
    body: () => {
      const zc = spec('ZC');
      const value = zc.start * zc.delivery!.quantity;
      return (
        <>
          <p>
            A contract’s <b>last trading day</b> is the third Friday of its month (shown in the chain). {EXPIRY_WARNING_DAYS} trading
            days before, your broker writes to remind you. What happens if you still hold it at the close that day:
          </p>
          <ul>
            <li>
              <b>The MAJOR 500 and 10-Year Note</b> futures settle in cash: the last profit or loss is paid and that’s that.
            </li>
            <li>
              <b>A long commodity position is delivered.</b> You pay the full price for the goods, and they arrive in your
              office lobby: 1,000 barrels of crude a contract, or 5,000 bushels of corn, or thirty head of cattle. Storing
              them costs {pct(STORAGE_RATE, 1)} of their value every day, and a local merchant will buy them for{' '}
              {pct(PHYSICAL_DISCOUNT, 0)} less than the market price.
            </li>
            <li>
              <b>A short commodity position</b> can’t be delivered — you have no corn — and the exchange fines you{' '}
              {pct(FTD_FINE, 0)} of the contract’s value.
            </li>
          </ul>
          <p>
            Goods in the lobby are listed at the bottom of <Go app="trade" tab="futures">the Futures tab</Go>, with a{' '}
            <b>Sell Goods…</b> button.
          </p>
          <Example>
            <p>
              One corn contract held to the end at ${zc.start.toFixed(2)} a bushel: you pay {money(value)} for 5,000 bushels,
              storage is {money(value * STORAGE_RATE)} a day, and the merchant offers {money(value * (1 - PHYSICAL_DISCOUNT))}.
            </p>
          </Example>
          <Tip>Use Close or Roll a few days before the last trading day. Unless you like corn.</Tip>
        </>
      );
    },
  },
  {
    id: 'signals',
    title: 'The weather, OPEK and the Federal Reservoir',
    section: 'futures',
    questions: ['What moves commodity prices?', 'How do weather warnings work?', 'When does OPEK meet?', 'What does the Federal Reservoir do?'],
    keywords: 'weather bureau warning drought frost hurricane freeze opek oil meeting fed federal reservoir interest rate hawkish dovish minutes signal commodity',
    body: () => (
      <>
        <p>Three sources of news move commodities — and the companies that depend on them — and all three give warning.</p>
        <h3>The weather</h3>
        <p>
          The <Link href={`http://${WEATHER}/`}>National Weather Bureau</Link> warns of droughts, frosts, freezes, hurricanes and
          cold snaps {WEATHER_LEAD[0]} to {WEATHER_LEAD[1]} trading days before they strike, and lists the crops and fuels at risk.
          About {pct(WEATHER_RELIABILITY, 0)} of its warnings come true. The market moves only a little (about{' '}
          {pct(WEATHER_PRICED, 0)} of the way) when a warning is issued; the rest comes when the weather hits — or the move is
          given back if it doesn’t. An alert trader can buy the futures in between.
        </p>
        <h3>OPEK</h3>
        <p>
          The oil producers of <Link href={`http://${OPEK}/`}>OPEK</Link> meet on the last Wednesday of March, June and November
          and announce at 14:00. {OPEK_HINT_DAYS} trading days before, their delegates hint at a cut in output (oil up), no
          change, or a rise (oil down). The hints are right about {pct(OPEK_RELIABILITY, 0)} of the time.
        </p>
        <h3>The Federal Reservoir</h3>
        <p>
          The <Link href={`http://${FED}/`}>Federal Reservoir</Link> sets interest rates at eight meetings a year. Higher rates
          weigh on stocks (growth companies most), lower the 10-Year Note’s price, and raise what you pay on loans and on
          margin. Its minutes are <i>hawkish</i> (more rises to come) or <i>dovish</i> (cuts ahead).
        </p>
        <p>
          Oil companies rise with oil and airlines fall with it; gold miners follow gold, loggers lumber, farm companies the
          grains. A commodity signal is often a stock signal too.
        </p>
      </>
    ),
  },

  // ---------- Loans ----------
  {
    id: 'loans',
    title: 'Bank loans: borrowing from First Continental',
    section: 'loans',
    questions: ['How do I take out a loan?', 'How is loan interest worked out?', 'What is the difference between amortising and interest only?', 'What are the loan tiers?'],
    keywords: 'loan borrow bank first continental interest rate tier bronze silver gold platinum amortising interest only balloon term monthly payment apply',
    body: ({ settings }) => {
      const rate = 0.085;
      const amortising = quoteLoan(100_000, 'amortising', 24, rate);
      const interestOnly = quoteLoan(100_000, 'interestOnly', 24, rate);
      return (
        <>
          <p>
            <Link href={`http://${BANK}/`}>First Continental Bank</Link> lends from {money(MIN_LOAN)} up to{' '}
            {money(BANK_LIMIT)} in all, for one to five years. Apply in <Go app="trade" tab="financing">MajorTrade → Financing</Go>{' '}
            (New Loan…) or on the bank’s site. The money is in your account at once, and it counts as buying power — so a loan is
            leverage too.
          </p>
          <h3>The rate</h3>
          <p>
            The rate is the Federal Reservoir’s rate plus a margin set by the tier your <b>total</b> borrowing falls into, so a
            second loan can’t dodge a higher tier:
          </p>
          <table className="reeves-table">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Total borrowing up to</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => (
                <tr key={t.name}>
                  <td>{t.name}</td>
                  <td>{money(t.max)}</td>
                  <td>policy rate + {pct(t.spread * settings.loanRates, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            A good credit score takes up to 2 points off; a bad one adds up to 2 (see <See topic="credit">credit score</See>). The
            rate floats: it changes when the Federal Reservoir moves, and with your score.
          </p>
          <h3>Interest and payments</h3>
          <p>
            Interest accrues <b>every day</b> on what you owe, at the day’s rate, and is collected with each payment on the first
            trading day of each month — so the first payment only carries interest for the days since you signed. Choose:
          </p>
          <ul>
            <li>
              <b>Amortising</b>: even monthly payments of interest and principal, so the loan shrinks every month and is gone
              at the end.
            </li>
            <li>
              <b>Interest only</b>: each month only the interest, and the whole principal (the <i>balloon</i>) at the end.
              Cheaper month to month, dearer overall.
            </li>
          </ul>
          <Example>
            <p>
              {money(100_000)} over two years at {pct(rate, 1)}: amortising, about {money(amortising.payment)} a month and{' '}
              {money(amortising.totalInterest)} of interest in all. Interest only, about {money(interestOnly.payment)} a month and{' '}
              {money(100_000)} at the end: {money(interestOnly.totalInterest)} of interest in all.
            </p>
          </Example>
          <p>
            The game saves itself before you sign. Next: <See topic="repaying">Paying a loan back</See>.
          </p>
        </>
      );
    },
  },
  {
    id: 'repaying',
    title: 'Paying a loan back, or paying it off early',
    section: 'loans',
    questions: ['How do I repay a loan?', 'How do I pay off my loan early?', 'Is there a fee for paying early?', 'Why can’t I repay my loan?'],
    keywords: 'repay repayment pay back pay off payoff early fee principal interest to date settle clear loan financing make a payment',
    body: () => (
      <>
        <p>Your monthly payments come out by themselves. To pay more, or all of it:</p>
        <Steps>
          <li>
            Open <Go app="trade" tab="financing">MajorTrade → Financing</Go> and press <b>Repay…</b> (or double-click the loan). On
            the bank’s site it is <Link href={`http://${BANK}/pay`}>Make a Payment</Link>.
          </li>
          <li>
            Choose <b>Pay off the whole loan</b>, or type an amount. If a payment is overdue, you can pay just that.
          </li>
          <li>The form shows exactly how your money will be used, and what your next payment becomes. Press Pay.</li>
        </Steps>
        <p>The bank applies a payment in this order:</p>
        <ol>
          <li>any missed payment, with its interest and late fee;</li>
          <li>the interest accrued since your last payment;</li>
          <li>
            the principal, with a fee of {pct(EARLY_FEE, 0)} of the principal repaid early.
          </li>
        </ol>
        <p>
          Paying part of an amortising loan lowers the monthly payments for the rest of its term, and a smaller total may drop
          you into a cheaper tier, lowering your rate on everything you still owe.
        </p>
        <h3>“You can pay the bank only…”</h3>
        <p>
          The bank can take only money your positions don’t need as margin. If most of your money is in stocks, sell some first
          — the form tells you how much you can pay now.
        </p>
        <Tip>Paying off a loan you don’t need saves the interest; the 1% fee is usually worth it if more than a few months are left.</Tip>
      </>
    ),
  },
  {
    id: 'credit',
    title: 'Missed payments, default and your credit score',
    section: 'loans',
    questions: ['What happens if I miss a loan payment?', 'What is my credit score?', 'What is a default?', 'How do I improve my credit score?'],
    keywords: 'missed late payment default grace late fee credit score equifacts history leverage trend record bank sells',
    body: () => (
      <>
        <p>
          A payment is <b>missed</b> when, at the opening bell on the payment day, your account doesn’t have the money free (see{' '}
          <See topic="repaying">why the bank can’t always take it</See>). Then:
        </p>
        <ul>
          <li>
            A late fee of {pct(LATE_FEE, 0)} is added, the miss goes on your credit report, and you have {days(GRACE_DAYS)} to pay.
            Pay it at once with <b>Pay Now…</b> in the Financing tab, or the bank takes it at the next opening bell when the money
            is there.
          </li>
          <li>
            If it is still unpaid after the grace period, or you miss a second payment, the loan is in <b>default</b>: the bank
            has your positions sold to recover the whole loan. If even that isn’t enough, the firm is{' '}
            <See topic="bankruptcy">bankrupt</See>.
          </li>
        </ul>
        <h3>Your credit score</h3>
        <p>
          <Link href={`http://${EQUIFACTS}/`}>Equifacts</Link> scores your firm from 300 to 850, starting at 680. Payments on time
          and loans repaid raise it; missed payments (and above all defaults) cut it hard; so does owing a lot against your net
          worth, and a shrinking firm. A better score means a lower rate: up to 2 points either way.
        </p>
      </>
    ),
  },

  // ---------- The firm ----------
  {
    id: 'clients',
    title: 'Clients, mandates and fees',
    section: 'firm',
    questions: ['How do I get more clients?', 'What is a mandate?', 'Why did a client leave?', 'How do I set my fees?'],
    keywords: 'client clients mandate offer accept decline constraint breach redemption top up fees management performance reputation aum',
    body: () => (
      <>
        <p>
          Your firm manages money for clients. Their offers — <i>mandates</i> — arrive in <Go app="mail">Outbox Express</Go>: an
          amount, and often rules. Accept one and its money joins your book; decline it and it goes elsewhere.
        </p>
        <ul>
          <li>
            <b>Rules</b> apply to your whole portfolio while the client is with you: no tobacco or weapons makers, no position
            above a certain size, nothing too small, a limit on losses, or beating the MAJOR 500 over a few quarters. The order
            ticket warns you before an order would break one. Break a rule and you get a warning and five trading days to fix it;
            do it again and the client leaves.
          </li>
          <li>
            <b>Performance</b>: each quarter clients get a statement. Beat the MAJOR 500 and they are pleased, and some add
            money; lag it quarter after quarter and they take their money back.
          </li>
          <li>
            <b>Fees</b> are how the firm earns: a yearly management fee and a share of any return above the MAJOR 500. Set them
            in <Go app="mycomputer" view="firm">My Computer → Firm</Go>: cheaper firms win more clients.
          </li>
        </ul>
        <Tip>Your reputation rises with good quarters and happy clients, and bigger offers follow.</Tip>
      </>
    ),
  },
  {
    id: 'news',
    title: 'News, rumours and tips',
    section: 'firm',
    questions: ['Where do I read the news?', 'Are rumours true?', 'Should I trust a tip?', 'What is insider trading?'],
    keywords: 'news newswire rumour rumor raging bear tip tipster insider trading press article outlet journalist sob',
    body: () => (
      <>
        <p>
          News breaks first on the <b>Majorsoft Newswire</b>, then spreads: TV within minutes, the trade press within the hour,
          the morning papers the next day, the weeklies at the weekend. Prices move the moment it breaks, so the quicker you
          read it, the better.
        </p>
        <ul>
          <li>
            <b>Rumours</b> sometimes come first, on the <Link href={`http://${RAGINGBEAR}/`}>Raging Bear</Link> boards or in the trade
            press, and move the price part of the way in advance. Plenty of board chatter is just noise.
          </li>
          <li>
            <b>Tips</b> arrive by mail from people who shouldn’t be sending them. Some are genuine, some are bait for a
            pump-and-dump, some are nonsense. You can report them to the Securities Oversight Bureau for a little reputation.
            Trading on a genuine inside tip is insider trading — and someone may be watching.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'stakes',
    title: 'Big stakes, board seats and shareholder votes',
    section: 'firm',
    questions: ['What happens if I buy 5% of a company?', 'How do I get a board seat?', 'How do I take over a company?', 'How do proxy votes work?', 'Who are my competitors?'],
    keywords: 'stake 5% 20% 50% filing 13d disclosure board seat director control takeover proxy vote meeting merger dividend ceo competitor rival league table barren investor',
    body: () => (
      <>
        <p>Own enough of a company and it starts to matter who you are:</p>
        <ul>
          <li>
            <b>5%</b>: your holding is filed with the Securities Oversight Bureau and made public. The company lists you among
            its shareholders, the Newswire reports it, and the chief executive writes to you.
          </li>
          <li>
            <b>20%</b>: the board offers you a seat.
          </li>
          <li>
            <b>50%</b>: you control the company. Its board writes each quarter for instructions: replace the chief executive, or
            raise or cut the dividend.
          </li>
        </ul>
        <h3>Votes</h3>
        <p>
          Hold 1% of a company, or a position worth 2% of your firm, and it sends you a proxy for its annual meeting: vote For,
          Against or Abstain in Outbox Express. Your vote counts in proportion to your shares. When a company you hold gets a
          takeover bid, its shareholders vote on the deal before it closes — own enough and you can turn it down.
        </p>
        <h3>Competitors</h3>
        <p>
          Your rivals run funds of their own, each by its strategy, and trade once a week. Their web sites show their holdings as
          filed with the SOB, 45 days after each quarter. Barren’s ranks every firm by its year’s return each January. A rival may
          offer to buy a big stake of yours at a premium, taunt you after a good quarter, or offer to invest in your firm for a
          share of its fees.
        </p>
        <Tip>A public 5% stake is a signal: aggressive competitors pile into the same stock, and the price you pay for more rises.</Tip>
      </>
    ),
  },
  {
    id: 'sob',
    title: 'The Securities Oversight Bureau, heat and audits',
    section: 'firm',
    questions: ['What is heat?', 'What is the SOB?', 'What happens in an audit?', 'Is insider trading allowed?', 'Why was I fined?'],
    keywords: 'sob regulator heat thermometer audit examination insider trading fine suspension freeze enforcement investigation tip illegal',
    body: ({ settings }) => (
      <>
        <p>
          The Securities Oversight Bureau watches the market. <b>Heat</b> is how closely it — and the press — watches you. It
          rises when you trade just before news: most of all on a genuine inside tip, but any big, well-timed trade gets flagged.
          It cools by about {Math.round(HEAT_DECAY * settings.heatDecay * 10) / 10} a week. Once it has risen, a thermometer in
          the tray shows it.
        </p>
        <p>
          Each month the Bureau may audit you: rarely when heat is low, often when it is high. An audit ends somewhere on this
          ladder, the more evidence the further down:
        </p>
        <Steps>
          <li>Cleared.</li>
          <li>A warning letter, on your record.</li>
          <li>A fine: a fixed sum plus 50–300% of what the suspicious trades made, due within {FINE_DAYS} trading days.</li>
          <li>A suspension: you may only close positions, for 5 to 30 trading days.</li>
          <li>An asset freeze: no new positions, no bank loans, and clients’ withdrawals wait.</li>
          <li>A public enforcement action: a big fine, the newspapers, and clients leaving.</li>
        </Steps>
        <p>
          An unpaid fine is collected by selling your positions; if even that isn’t enough, the firm is bankrupt. Your record
          with the Bureau counts against your credit score and your reputation.
        </p>
        <Tip>Report tips you don’t trust to the SOB (the button in Outbox Express). It earns a little reputation and no heat.</Tip>
      </>
    ),
  },
  {
    id: 'darkweb',
    title: 'The Garlic Browser and the dark web',
    section: 'firm',
    questions: ['What is the Garlic Browser?', 'What is the dark web?', 'How do I bribe a journalist?', 'What is a shell company?', 'What is a loan shark?'],
    keywords: 'garlic dark web darkweb tucats bribe journalist puff hit piece leak bot farm espionage hack deface ddos shell offshore pump dump rumour forgery shark vig cellar scam sting vendor',
    body: ({ settings }) =>
      !settings.darkWeb ? (
        <p>I am relieved to say that the dark web is switched off in this game, sir. Its advanced settings saw to that.</p>
      ) : (
        <>
          <p>
            I could not possibly recommend it. But since you ask: sooner or later an anonymous letter will point you to the{' '}
            <Link href={`http://${TUCATS}/garlic.html`}>Garlic Browser at Tucats Downloads</Link>. Installed, it opens addresses ending
            in <code>.garlic</code>: eleven markets and a forum, The Cellar. Start at The Clove, its directory.
          </p>
          <p>
            Every listing states <b>its price, its chance of working, what failure costs and the heat it adds</b>, and the order is
            confirmed on exactly those terms. Whether it works is decided when you buy it, so reloading a save will not change it.
            Your odds are {settings.darkWebOdds > 0 ? `${Math.round(settings.darkWebOdds * 100)} points better` : settings.darkWebOdds < 0 ? `${Math.round(-settings.darkWebOdds * 100)} points worse` : 'as listed'} at
            this difficulty, and bribes grow harder as your heat rises.
          </p>
          <h3>What is for sale</h3>
          <ul>
            <li><b>Press for Sale</b>: articles about your firm, a stock or a rival, from {usd(PRICES.press[0])} at a tabloid to {usd(PRICES.press[1])} at the New York Journal. An honest journalist writes about the bribe instead.</li>
            <li><b>The Leak Bazaar</b>: earnings surprises and takeover targets. Trading on them just before the news may be flagged as insider trading.</li>
            <li><b>Bot Farm</b>, <b>Rumour Mill</b>, <b>Pump Syndicate</b>: prices moved by hype, fear and takeover talk. They fade.</li>
            <li><b>Cloak &amp; Dagger</b> and <b>Hackers-for-hire</b>: a rival’s books, its web site taken down, a company’s home page defaced.</li>
            <li><b>Forgery Desk</b>: statements that show your clients a quarter you didn’t have.</li>
            <li><b>Shell Company Registry</b>: {usd(PRICES.shell)} and {usd(PRICES.shellYear)} a year for an offshore company. Stakes over 5% go unfiled, and payments through it cost {Math.round(SHELL_FEE * 100)}% but leave half the heat. The Bureau finds shells more often the hotter you are.</li>
            <li><b>Loan Sharks</b>: {usd(SHARK_RANGE[0])} to {usd(SHARK_RANGE[1])}, at {Math.round(SHARK_WEEKLY * 100)}% a week, paid every Friday. Miss one and the collectors take what you owe, plus a penalty, in positions at {Math.round(SEIZE_DISCOUNT * 100)}% below market — and the furniture.</li>
          </ul>
          <p>
            Payments from the firm’s cash appear in the ledger as “Consulting fees”, which auditors read. Some vendors vanish with the
            money; some are the Securities Oversight Bureau. New accounts with perfect ratings and low prices deserve suspicion, and
            The Cellar is where buyers warn each other.
          </p>
          <Tip>A journalist who took your money once is cheaper the next time — and may one day ask for more.</Tip>
        </>
      ),
  },
  {
    id: 'bankruptcy',
    title: 'Bankruptcy: the only way to lose',
    section: 'firm',
    questions: ['How do I lose the game?', 'What happens if I go bankrupt?', 'What is the Blue Screen of Debt?', 'What is the Hall of Shame?'],
    keywords: 'bankrupt bankruptcy lose game over blue screen debt hall of shame final report negative',
    body: ({ settings }) => (
      <>
        <p>
          The firm goes bankrupt when it owes something it cannot pay even after selling everything it owns: a margin call
          after the broker has sold every position, a defaulted loan the bank can’t recover, or an SOB fine. Then comes the Blue Screen of
          Debt, and a final report of the firm’s life. Its save is kept, read-only, in the{' '}
          <Go app="mycomputer" view="shame">Hall of Shame</Go>.
        </p>
        <h3>How to stay out of it</h3>
        <ul>
          <li>Don’t borrow to the limit: leave room for prices to fall.</li>
          <li>Keep enough money free for loan payments on the first trading day of each month.</li>
          <li>Act on margin calls before the deadline, on your terms rather than the broker’s.</li>
          <li>Close or roll futures before their last trading day.</li>
        </ul>
        {settings.noBankruptcy && <p>This game has No-bankruptcy mode on: debts just leave your cash negative.</p>}
      </>
    ),
  },
  {
    id: 'glossary',
    title: 'Glossary: the words bankers use',
    section: 'firm',
    questions: ['What does this word mean?'],
    keywords:
      'glossary definition meaning term word ask bid spread volatility index long short aum drawdown benchmark principal basis notional front month roll hedge liquidity',
    body: () => (
      <dl className="reeves-terms">
        <dt>AUM</dt>
        <dd>Assets under management: all the money the firm runs, its own and its clients’.</dd>
        <dt>Bid / ask</dt>
        <dd>The prices you can sell at (bid) and buy at (ask). The gap is the spread.</dd>
        <dt>Benchmark</dt>
        <dd>What a performance is compared with: here the MAJOR 500.</dd>
        <dt>Drawdown</dt>
        <dd>A fall from a peak: a portfolio worth $1.2M that drops to $1M has a 17% drawdown.</dd>
        <dt>Front month</dt>
        <dd>The futures contract nearest to expiry.</dd>
        <dt>Hedge</dt>
        <dd>A position that gains when your others lose: selling MAJOR 500 futures against a portfolio of stocks.</dd>
        <dt>Leverage</dt>
        <dd>Investing borrowed money as well as your own. It multiplies gains and losses alike.</dd>
        <dt>Long / short</dt>
        <dd>Long: you own it and profit if it rises. Short: you sold it without owning it and profit if it falls.</dd>
        <dt>Market cap</dt>
        <dd>Share price × shares: what the market says the whole company is worth.</dd>
        <dt>Notional (face value)</dt>
        <dd>What a futures contract’s goods are worth: price × contract size.</dd>
        <dt>Principal</dt>
        <dd>The part of a loan still owed, before interest.</dd>
        <dt>Roll</dt>
        <dd>Closing a futures position and opening the same one in a later month.</dd>
        <dt>Volatility</dt>
        <dd>How much a price swings. Volatile stocks win and lose faster.</dd>
      </dl>
    ),
  },
];

export const TOPIC = Object.fromEntries(TOPICS.map((t) => [t.id, t])) as Record<string, Topic>;

const STOP_WORDS = new Set(
  'a an and are am as at be been but by can could do does did doing for from get got has have how i if in into is it its me my of on or should so than that the their them then there these this to was what when where which who why will with would you your yours about happen happens'.split(' '),
);

/** A word without its plural: "futures" → "future", "companies" → "company". */
const singular = (w: string) => (w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/** The words of a question that say something: lower case, singular, without "how", "do", "I"… */
export const words = (text: string): string[] => (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP_WORDS.has(w)).map(singular);

/** Whether two words are the same word, give or take an ending: "deliver" and "delivery", "repay" and "repayment". */
const matches = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

const INDEX = TOPICS.map((t) => ({ topic: t, title: words(t.title), questions: words(t.questions.join(' ')), keywords: words(t.keywords) }));

/**
 * Reeves answers a question (spec §14.2): the guides whose title, questions and keywords share its words, best first.
 * Two dozen guides need no search engine.
 */
export function ask(question: string): Topic[] {
  const q = [...new Set(words(question))];
  if (!q.length) return [];
  return INDEX.map((entry) => {
    let score = 0;
    for (const w of q) {
      if (entry.title.some((t) => matches(w, t))) score += 3;
      if (entry.questions.some((t) => matches(w, t))) score += 2;
      if (entry.keywords.some((t) => matches(w, t))) score += 2;
    }
    return { topic: entry.topic, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.topic);
}
