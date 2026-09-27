import { formatDate, weekday } from '../../sim/calendar';
import type { Client, Constraint } from '../../sim/clients';
import { contractLabel, parseContract } from '../../sim/commodities';
import { CONTRACTS, CONTRACT_INDEX, FTD_FINE, PHYSICAL_DISCOUNT, STORAGE_RATE } from '../../sim/data/commodities';
import type { Mail, MailLine } from '../../sim/mail';
import type { MacroKind, NewsItem } from '../../sim/news';
import type { Directory } from '../../sim/types';
import { Rng } from '../../world/rng';
import { shortName } from '../../sites/company/content';
import { companyOf } from '../../sites/hooks';
import { FUNDS } from '../../sim/data/funds';
import { headlineOf } from '../../sites/news/articles';
import { dollars, percent, write } from '../../sites/text';
import { JOTTINGS, RAGINGBEAR, TUCATS, sites, slugOf, storyUrl } from '../../sites/urls';
import { MARKET, SERVICE } from '../../sim/data/darkweb';
import { OUTLET } from '../../sim/data/outlets';
import type { Journalist } from '../../sim/press';
import { count, money, price, signedPct } from '../format';
import { MOM, PARTY, SPAM, TIP_CLAIMS, TIP_CLOSERS, TIP_OPENERS, TIP_SENDERS, TIP_SUBJECTS } from './data';

/** What a letter's body is made of. Paragraph text may hold `{c:123}` company mentions. */
export type Block =
  | { p: string }
  | { list: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { link: string; url: string };

export interface Letter {
  from: string;
  to: string;
  subject: string;
  body: Block[];
}

export interface LetterContext {
  directory: Directory;
  firmName: string;
  ceoName: string;
  seed: string;
  clients: ReadonlyMap<number, Client>;
  /** News items the letter refers to (briefings, alerts), when fetched. */
  news: ReadonlyMap<number, NewsItem>;
  /** The press, for letters from journalists (Phase 9). */
  journalists?: readonly Journalist[];
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const RELEASES: Record<MacroKind, string> = {
  jobs: '08:30 Jobs report (unemployment rate)',
  cpi: '08:30 Consumer prices (CPI)',
  gdp: '08:30 Gross domestic product',
  confidence: '10:00 Consumer confidence',
  fed: '14:15 Federal Reservoir rate decision',
};
const BROKER = 'MajorTrade Pro Brokerage Services <confirms@majortrade.com>';
const MARGIN_DESK = 'MajorTrade Pro Margin Department <margin@majortrade.com>';
const BANK = 'First Continental Bank <loans@firstcontinental.com>';
const COURT = 'Clerk of the Bankruptcy Court, Southern District <clerk@bankruptcy-court.gov>';
const SOB_FILINGS = 'Securities Oversight Bureau, Filings Desk <filings@sob.gov>';
const SOB_ENFORCEMENT = 'Securities Oversight Bureau, Division of Enforcement <enforcement@sob.gov>';
const MEETINGS = ['the election of directors', 'the executive pay package', 'the proposed takeover of the company'];

const SIDES = { buy: 'Bought', sell: 'Sold', short: 'Sold short', cover: 'Bought to cover' };

/** A line of a broker letter as a table row: symbol, what was done, quantity, price and value. Futures and goods too. */
function row(l: MailLine, tickers: readonly string[]): string[] {
  if (l.company >= 0) return [tickers[l.company], SIDES[l.side ?? 'sell'], count(Math.abs(l.shares)), price(l.amount / Math.abs(l.shares)), money(l.amount)];
  if (l.fund !== undefined) return [FUNDS[l.fund].ticker, SIDES[l.side ?? 'sell'], `${count(l.shares)} units`, price(l.amount / l.shares), money(l.amount)];
  const futures = l.contract ? parseContract(l.contract) : undefined;
  if (futures) {
    const size = CONTRACTS[futures.k].multiplier;
    return [contractLabel(l.contract!), SIDES[l.side ?? 'sell'], `${count(l.shares)} contract${l.shares === 1 ? '' : 's'}`, price(l.amount / (l.shares * size)), money(l.amount)];
  }
  const goods = l.contract ? CONTRACTS[CONTRACT_INDEX[l.contract]] : undefined;
  return [goods ? `${goods.name} (goods)` : '—', 'Sold', goods?.delivery ? `${count(l.shares)} ${goods.delivery.unit}` : count(l.shares), '', money(l.amount)];
}

/** A contract's goods, as the lobby receives them: "10,000 bushels of corn". */
function goodsOf(contract: string | undefined, quantity = 0): string {
  const c = contract ? parseContract(contract) : undefined;
  const d = c && CONTRACTS[c.k].delivery;
  return d ? `${count(quantity)} ${d.unit} of ${d.what}` : 'the goods';
}

/** A constraint as a client states it (spec §15.1). */
export function describeConstraint(k: Constraint): string {
  switch (k.kind) {
    case 'exclude':
      return `No ${k.label}`;
    case 'maxDrawdown':
      return `Maximum drawdown of ${percent(k.limit)}`;
    case 'maxPosition':
      return `No single holding above ${percent(k.limit)} of the portfolio`;
    case 'minCap':
      return `No companies worth less than ${dollars(k.limit)}`;
    case 'beatIndex':
      return `Beat the MAJOR 500 over ${k.limit} quarters`;
  }
}

const contactName = (c: Client) => c.contact.split(',')[0];
const clientFrom = (c: Client | undefined) => (c ? `${contactName(c)} (${c.name})` : 'A client');
const who = (c: Client | undefined) => c?.name ?? 'Your client';

/** Sender and subject: all the message list needs. */
export function letterHeader(mail: Mail, ctx: LetterContext): { from: string; subject: string } {
  const { from, subject } = writeLetter(mail, ctx, true);
  return { from, subject };
}

/** Writes a letter from the facts the mail stores (spec §15), the same way every time it is read. */
export function writeLetter(mail: Mail, ctx: LetterContext, headerOnly = false): Letter {
  const rng = Rng.stream(ctx.seed, `mail:${mail.id}`);
  const { directory, firmName, ceoName } = ctx;
  const me = `${ceoName} <ceo@${slugOf(firmName) || 'firm'}.com>`;
  const client = mail.client !== undefined ? ctx.clients.get(mail.client) : undefined;
  const c = mail.company;
  const mention = (i: number) => `{c:${i}}`;
  const name = c !== undefined ? directory.names[c] : '';
  const ticker = c !== undefined ? directory.tickers[c] : '';
  const words = { firmName, ceo: ceoName, name, ticker, short: shortName(name), date: mail.day !== undefined ? `${DAYS[weekday(mail.day)]} ${formatDate(mail.day)}` : '' };
  const letter = (from: string, subject: string, body: () => Block[], to = me): Letter => ({ from, to, subject, body: headerOnly ? [] : body() });
  const quarter = (r: [number, number] | undefined) =>
    r ? `Your portfolio returned ${signedPct(r[0])} against ${signedPct(r[1])} for the MAJOR 500.` : '';

  switch (mail.kind) {
    case 'welcome':
      return letter('Majorsoft Doors 98 Setup <setup@majorsoft.com>', 'Welcome to Outbox Express!', () => [
        { p: `Congratulations on founding ${firmName}! Outbox Express is where your clients, your broker, the news and the occasional stranger will write to you.` },
        { list: [
          'MajorTrade Pro 98: quotes, charts, orders, your portfolio and the calendar.',
          'Internet Exploiter: company web sites, the Majorsoft Newswire, The Wall Street Jottings, the Raging Bear boards and more. News moves prices; rumours sometimes come first.',
          'Clients folder: mandate offers. Accepting one brings new money — and rules you must follow.',
          'Tips folder: anonymous tips. Some are genuine. Some are bait. Trading on inside information is a crime.',
          'Press Ctrl+S to save at any time.',
          'Lost? Ask Reeves: the Ask Reeves icon on the desktop (or Start → Help) explains how stocks, margin, futures and loans work, step by step.',
        ] },
        { p: 'Good luck, and remember: past performance is no guarantee of future results.' },
      ]);
    case 'founders': {
      const founders = [...ctx.clients.values()].filter((x) => x.kind === 'founder');
      return letter(clientFrom(founders[0]), `Our investment in ${firmName}`, () => [
        { p: `We are proud to back ${firmName} with ${money(mail.amount!)} of seed money${founders.length > 1 ? `, together with ${founders.slice(1).map((f) => f.name).join(' and ')}` : ''}.` },
        { p: 'We ask only that you beat the MAJOR 500 and do not lose it all. We will be reading the quarterly statements closely.' },
        { p: 'Your fees are the usual 1% a year plus 20% of anything above the index, unless you tell us otherwise (My Computer → Firm).' },
        { p: 'Warm regards,' },
      ]);
    }
    case 'offer':
      return letter(clientFrom(client), `Mandate offer: ${money(mail.amount!)} from ${who(client)}`, () => [
        { p: `Dear ${ceoName},` },
        { p: `${who(client)} is looking for a new manager, and we would like to offer ${firmName} a mandate of ${money(mail.amount!)}.` },
        client?.constraints.length
          ? { p: 'Our investment policy requires the following. Please note that they apply to your whole portfolio for as long as we are clients:' }
          : { p: 'We have no special restrictions: simply manage the money as you see fit.' },
        ...(client?.constraints.length ? [{ list: client.constraints.map(describeConstraint) }] : []),
        { p: 'A breach of any of these will earn a warning; a second breach, or one left unfixed, will end the relationship.' },
        { p: `Please reply by ${words.date}.` },
        { p: `Yours sincerely,\n${client?.contact ?? ''}` },
      ]);
    case 'offerExpired':
      return letter(clientFrom(client), `Re: Mandate offer from ${who(client)}`, () => [
        { p: write('As we did not hear from you, {client} has [placed the mandate with another manager|gone with {rival} instead|decided to keep its money in the bank].', { client: who(client), rival: directory.firms.length ? rng.pick(directory.firms).name : 'another firm' }, rng) },
        { p: 'Perhaps another time.' },
      ]);
    case 'joined':
      return letter(clientFrom(client), `Welcome aboard: ${money(mail.amount!)} transferred`, () => [
        { p: `We are delighted to be working with ${firmName}. ${money(mail.amount!)} has been wired to your brokerage account today.` },
        ...(client?.constraints.length ? [{ p: 'A reminder of our policy:' }, { list: client.constraints.map(describeConstraint) }] : []),
        { p: 'We look forward to your first statement.' },
      ]);
    case 'statement':
      return letter(me, `Quarterly statement for ${who(client)}`, () => [
        { p: `Dear ${client ? contactName(client) : 'client'},` },
        { p: quarter(mail.returns) },
        { p: `The value of your account at the quarter's end was ${money(mail.amount!)}.` },
        { p: `Thank you for your continued trust in ${firmName}.` },
      ], client ? clientFrom(client) : 'Clients');
    case 'reply':
      if (mail.variant === 2) {
        return letter(me, `Report of a suspicious tip about ${ticker}`, () => [
          { p: `I am reporting an anonymous tip I received about ${name} (${ticker}). I have not traded on it.` },
          { p: `Sincerely, ${ceoName}, ${firmName}` },
        ], 'Securities Oversight Bureau <tips@sob.gov>');
      }
      return letter(me, `Re: Mandate offer from ${who(client)}`, () => [
        { p: mail.variant === 1 ? `We are pleased to accept your mandate and look forward to working together.` : `Thank you for your offer. Regretfully, we must decline at this time.` },
        { p: `Best regards, ${ceoName}` },
      ], client ? clientFrom(client) : 'Client');
    case 'praise':
      return letter(clientFrom(client), `Re: Quarterly statement`, () => [
        { p: rng.pick([`Splendid quarter! ${quarter(mail.returns)} The trustees are very pleased.`, `We just received your statement. ${quarter(mail.returns)} Keep it up.`, `Well done. ${quarter(mail.returns)} Our board raised a glass to ${firmName}.`]) },
      ]);
    case 'question':
      return letter(clientFrom(client), `Re: Quarterly statement — a few questions`, () => [
        { p: rng.pick([`${quarter(mail.returns)} Could you explain what went wrong?`, `We were disappointed. ${quarter(mail.returns)} Our trustees are asking questions.`, `${quarter(mail.returns)} We are patient people, but not infinitely so.`]) },
      ]);
    case 'topUp':
      return letter(clientFrom(client), `Adding ${money(mail.amount!)} to our account`, () => [
        { p: `${quarter(mail.returns)} We have decided to add ${money(mail.amount!)} to our account. The money arrived today.` },
      ]);
    case 'redemption':
      return letter(clientFrom(client), `Notice of redemption`, () => [
        { p: `After several disappointing quarters, ${who(client)} will withdraw about ${money(mail.amount!)} from its account on ${words.date}.` },
        { p: 'Please make sure the cash is available. If it is not, your broker will sell positions to raise it.' },
      ]);
    case 'warning': {
      const k = client?.constraints[mail.constraint ?? 0];
      return letter(clientFrom(client), `Mandate breach: ${k ? describeConstraint(k) : 'our investment policy'}`, () => [
        { p: `Our compliance team has found that your portfolio breaks our investment policy: ${k ? describeConstraint(k).toLowerCase() : 'see our mandate'}.` },
        k?.kind === 'maxDrawdown'
          ? { p: 'We will be watching closely. If the losses deepen, or if it happens again, we will withdraw our money.' }
          : { p: `Please correct this by ${words.date}. If it is not fixed by then, or if it happens again, we will withdraw our money.` },
      ]);
    }
    case 'terminated':
      return letter(clientFrom(client), `Termination of our mandate`, () => [
        { p: mail.reason === 'benchmark'
          ? `You did not beat the MAJOR 500 over the period we agreed. ${who(client)} is ending the mandate.`
          : mail.reason === 'scandal'
            ? `We have read of the Securities Oversight Bureau’s action against ${firmName}. ${who(client)} cannot be associated with it, and is ending the mandate.`
            : `You have broken our investment policy once too often. ${who(client)} is ending the mandate.` },
        { p: `Our account, worth about ${money(mail.amount!)}, will be withdrawn on ${words.date}.` },
      ]);
    case 'completed':
      return letter(clientFrom(client), `Mandate target met — adding ${money(mail.amount!)}`, () => [
        { p: `Over the agreed period ${quarter(mail.returns).replace('Your portfolio returned', 'you returned')} Excellent work.` },
        { p: `We are adding ${money(mail.amount!)} to our account, and we will be telling our friends.` },
      ]);
    case 'settled':
      return letter(BROKER, `Redemption paid: ${money(mail.amount!)}`, () => [
        { p: `As instructed, ${money(mail.amount!)} has been paid out of your account to ${who(client)}.` },
      ]);
    case 'digest':
      return letter(BROKER, `Trade confirmations for ${words.date}`, () => [
        { p: 'The following orders were filled today:' },
        { table: {
          head: ['Order', 'Action', 'Quantity', 'Symbol', 'Average price', 'Value'],
          rows: (mail.lines ?? []).map((l) => {
            if (l.company >= 0) return [String(l.order), SIDES[l.side ?? 'buy'], count(l.shares), directory.tickers[l.company], price(l.amount / l.shares), money(l.amount)];
            // Index fund units: the price is a unit's.
            if (l.fund !== undefined) return ['Fund', l.side === 'sell' ? 'Sold' : 'Bought', `${count(l.shares)} units`, FUNDS[l.fund].ticker, price(l.amount), money(l.amount * l.shares)];
            // Futures trades: the price is per unit of the contract, the value is the contracts' face value.
            const c = parseContract(l.contract!)!;
            return ['Futures', l.side === 'sell' ? 'Sold' : 'Bought', `${count(l.shares)} contract${l.shares === 1 ? '' : 's'}`, contractLabel(l.contract!), price(l.amount), money(l.amount * l.shares * CONTRACTS[c.k].multiplier)];
          }),
        } },
        { p: 'Commissions and futures variation margin are shown in your ledger. Thank you for trading with MajorTrade Pro.' },
      ]);
    case 'dividend':
      return letter(BROKER, mail.amount! >= 0 ? `Dividends received: ${money(mail.amount!)}` : `Dividends paid on short positions: ${money(-mail.amount!)}`, () => [
        { p: 'The following dividends were credited to your account today. On shares you are short, you pay the dividend to their lender.' },
        { table: {
          head: ['Symbol', 'Shares', 'Per share', 'Amount'],
          rows: (mail.lines ?? []).map((l) => [directory.tickers[l.company], l.shares < 0 ? `${count(-l.shares)} short` : count(l.shares), price(l.amount / l.shares), money(l.amount)]),
        } },
      ]);
    case 'delisted': {
      const shares = mail.lines?.[0]?.shares ?? 0;
      if (shares < 0) {
        return letter(BROKER, `${ticker}: your short position has been closed`, () =>
          mail.reason === 'acquired'
            ? [{ p: `The takeover of ${mention(c!)} has completed. Your short position of ${count(-shares)} shares was closed at the offer price and ${money(-mail.amount!)} has been debited from your account.` }]
            : [{ p: `${mention(c!)} has been delisted after filing for bankruptcy. The ${count(-shares)} shares you were short are worthless: your short position has been closed at nothing, and the proceeds of the sale are yours to keep.` }, { p: 'Congratulations, we suppose.' }],
        );
      }
      return letter(BROKER, mail.reason === 'acquired' ? `${ticker}: your shares were bought out` : `${ticker}: shares cancelled in bankruptcy`, () =>
        mail.reason === 'acquired'
          ? [{ p: `The takeover of ${mention(c!)} has completed. Your ${count(shares)} shares were bought out and ${money(mail.amount!)} has been credited to your account.` }]
          : [{ p: `${mention(c!)} has been delisted after filing for bankruptcy. Your ${count(shares)} shares have been cancelled and written off.` }, { p: 'We are sorry for your loss. The position has been moved to your Recycle Bin.' }],
      );
    }
    case 'marginCall':
      return letter(MARGIN_DESK, `MARGIN CALL: ${money(mail.amount!)} due by ${words.date}`, () => [
        { p: `The equity in your account has fallen ${money(mail.amount!)} below its maintenance requirement: a share of your long and short positions, and the maintenance margin on your futures.` },
        { p: `Please restore it before the opening bell on ${words.date}: sell or cover positions, or bring in cash (First Continental Bank lends to firms like yours).` },
        { p: 'If the call has not been met by then, we will sell positions at the open, the worst first, until it is. Until it is met we can only accept orders that reduce your positions.' },
      ]);
    case 'marginMet':
      return letter(MARGIN_DESK, 'Margin call met', () => [{ p: 'The equity in your account is back above its maintenance requirement, and the margin call has been cancelled. Do be careful.' }]);
    case 'liquidation':
      return letter(MARGIN_DESK, 'Forced liquidation of your positions', () => [
        { p: `Your margin call of ${money(mail.amount!)} was not met. At the opening bell we cancelled your open orders and sold the following positions, the worst first, until your account met its maintenance requirement:` },
        { table: { head: ['Symbol', 'Action', 'Quantity', 'Price', 'Value'], rows: (mail.lines ?? []).map((l) => row(l, directory.tickers)) } },
        { p: 'Commissions were charged as usual. The positions are in your Recycle Bin, if they lost money, which they did.' },
      ]);
    case 'recall':
      return letter(BROKER, `Borrow recall: ${ticker}`, () => [
        { p: `The lender of the ${count(mail.amount!)} shares of ${mention(c!)} you sold short has asked for them back, and we cannot find others to borrow.` },
        { p: `Please buy to cover your short position by the opening bell on ${words.date}. If it is still open then, we will buy the shares in for you at the market price.` },
      ]);
    case 'buyIn': {
      const line = mail.lines?.[0];
      return letter(BROKER, `Buy-in: ${ticker}`, () => [
        { p: `Your short position in ${mention(c!)} was still open when its recall fell due, so at the opening bell we bought in ${count(line?.shares ?? 0)} shares at ${line && line.shares ? price(line.amount / line.shares) : 'market'} and returned them to their lender.` },
      ]);
    }
    case 'expiry': {
      const label = contractLabel(mail.contract!);
      const spec = CONTRACTS[parseContract(mail.contract!)!.k];
      const n = Math.abs(mail.contracts ?? 0);
      const held = `${count(n)} ${label} contract${n === 1 ? '' : 's'}`;
      return letter(BROKER, `Futures expiry: ${label} on ${words.date}`, () => [
        { p: `Your ${held} stop trading at the close on ${words.date}.` },
        !spec.delivery
          ? { p: 'They settle in cash at the final settlement price. You need do nothing, unless you would rather roll them into the next month.' }
          : (mail.contracts ?? 0) > 0
            ? { p: `Close or roll them before then, or ${goodsOf(mail.contract, mail.quantity)} will be delivered to your office lobby. You will pay for it at the final settlement price, and storage until you sell it.` }
            : { p: `Close or roll them before then. A short position still open at the close must deliver ${goodsOf(mail.contract, mail.quantity)}, which we doubt you have: the exchange fines a failure to deliver ${Math.round(FTD_FINE * 100)}% of the contract’s value.` },
      ]);
    }
    case 'delivery':
      return letter(BROKER, `Delivery notice: ${contractLabel(mail.contract!)}`, () => [
        { p: `Your ${contractLabel(mail.contract!)} contracts were still open at their expiry. ${goodsOf(mail.contract, mail.quantity)} have been delivered to your office lobby.` },
        { p: `The invoice of ${money(mail.amount!)} at the final settlement price has been debited from your account. Storage is ${(STORAGE_RATE * 100).toFixed(1)}% of the goods’ value a day until they are sold.` },
        { p: `A local merchant will take them off your hands at ${Math.round(PHYSICAL_DISCOUNT * 100)}% below the spot price: MajorTrade → Futures → Sell Goods. The receptionist would be grateful.` },
      ]);
    case 'ftd':
      return letter('Chicago Murkantile Exchange, Clearing House <clearing@murkantile.com>', `Failure to deliver: ${contractLabel(mail.contract!)}`, () => [
        { p: `Your short position of ${count(Math.abs(mail.contracts ?? 0))} ${contractLabel(mail.contract!)} contracts was open at expiry, and you did not deliver the goods.` },
        { p: `The Exchange has fined you ${money(mail.amount!)}, ${Math.round(FTD_FINE * 100)}% of the contracts’ value. It has been debited from your account. Please do not let it happen again.` },
      ]);
    case 'cashSettled':
      return letter(BROKER, `Settled in cash: ${contractLabel(mail.contract!)}`, () => [
        { p: `Your ${count(Math.abs(mail.contracts ?? 0))} ${contractLabel(mail.contract!)} contracts expired and were settled in cash at the final settlement price. The last day’s variation margin is in your ledger.` },
      ]);
    case 'loan':
      return letter(BANK, `Your loan of ${money(mail.amount!)} is approved`, () => [
        { p: `Dear ${ceoName},` },
        { p: `We are pleased to confirm loan number ${mail.loan} of ${money(mail.amount!)} to ${firmName}. The money has been paid into your brokerage account today.` },
        { p: `Your rate is ${(mail.rate! * 100).toFixed(2)}% a year for now. It floats with the Federal Reservoir’s rate and your credit score, and rises if your total borrowing with us moves into a higher tier. Interest accrues day by day on what you owe and is collected with each payment, on the first trading day of each month; the first is due on ${words.date}.` },
        { p: 'You may repay any part of the loan early, with a fee of 1% of the principal repaid, in MajorTrade Pro 98 → Financing or at www.firstcontinental.com.' },
        { p: 'A missed payment gets five trading days’ grace and a late fee. A second is a default: we will sell your positions to recover the loan.' },
        { p: 'Thank you for banking with First Continental. Since 1887.' },
      ]);
    case 'loanLate':
      return letter(BANK, `Missed payment on loan ${mail.loan}`, () => [
        { p: `Your payment on loan number ${mail.loan} was due today, and your account could not cover it. A late fee has been added: you now owe ${money(mail.amount!)}.` },
        { p: `Pay it now in MajorTrade Pro 98 → Financing, or we will take it at the next opening bell when the money is there. If it has not been paid by ${words.date}, the loan is in default and we will sell your positions to recover all of it.` },
        { p: 'This has been reported to Equifacts.' },
      ]);
    case 'loanDefault':
      return letter(BANK, `Notice of default: loan ${mail.loan}`, () => [
        { p: `Loan number ${mail.loan} is in default. We have called in all ${money(mail.amount!)} of it, and your broker has sold positions on our instructions to recover it.` },
        ...((mail.lines ?? []).length ? [{ table: { head: ['Symbol', 'Action', 'Quantity', 'Price', 'Value'], rows: (mail.lines ?? []).map((l) => row(l, directory.tickers)) } }] : []),
        { p: 'This has been reported to Equifacts. We will not be lending to you again for some time.' },
      ]);
    case 'loanRepaid':
      return letter(BANK, `Loan ${mail.loan} repaid in full`, () => [
        { p: `Loan number ${mail.loan} of ${money(mail.amount!)} has been repaid in full. Thank you. Your good record has been reported to Equifacts.` },
      ]);
    case 'bankrupt':
      return letter(COURT, `In re ${firmName}: order for relief`, () => [
        { p: `TAKE NOTICE that ${firmName} could not meet ${mail.reason === 'loan' ? 'its obligations to First Continental Bank' : mail.reason === 'fine' ? 'a fine owed to the Securities Oversight Bureau' : mail.reason === 'shark' ? 'a debt to a private lender who prefers not to be named' : 'a margin call from its broker'} even after the sale of everything it owned, falling ${money(mail.amount!)} short.` },
        { p: 'The firm is hereby declared bankrupt. Its clients have been notified. Its office furniture is being counted.' },
        { p: `The Court thanks ${ceoName} for their service to the capital markets, such as it was.` },
      ]);
    case 'briefing':
      return letter('The Wall Street Jottings <briefing@wsjottings.com>', `Morning Briefing — ${words.date}`, () => {
        const blocks: Block[] = [{ p: `Good morning. Here is what’s on the agenda for ${words.date}.` }];
        const releases = (mail.releases ?? []).map((k) => RELEASES[k]);
        const earnings = (mail.companies ?? []).map((i) => `Before the bell: ${directory.names[i]} (${directory.tickers[i]}) reports earnings`);
        blocks.push({ p: 'Today’s calendar:' }, { list: releases.length || earnings.length ? [...releases, ...earnings] : ['A quiet day: no major releases.'] });
        const stories = (mail.items ?? []).map((id) => ctx.news.get(id)).filter((n): n is NewsItem => !!n);
        if (stories.length) {
          blocks.push({ p: 'Top stories:' });
          for (const n of stories) blocks.push({ link: headlineOf(n, directory, firmName, ctx.seed), url: storyUrl(n) });
        }
        blocks.push({ link: 'Read today’s paper', url: `http://${JOTTINGS}/` });
        return blocks;
      });
    case 'alert': {
      const n = mail.news !== undefined ? ctx.news.get(mail.news) : undefined;
      const headline = n ? headlineOf(n, directory, firmName, ctx.seed) : 'News about one of your holdings';
      return letter('Majorsoft Newswire Alerts <alerts@newswire.majorsoft.com>', `NEWS ALERT: ${ticker} — ${headline}`, () => [
        { p: `News has broken about ${mention(c!)}, which you hold:` },
        { link: headline, url: storyUrl(ctx.news.get(mail.news!) ?? { id: mail.news! }) },
        { p: 'You receive alerts for companies in your portfolio. Turn them off in Tools → News Alerts.' },
      ]);
    }
    case 'tip': {
      const date = mail.day !== undefined ? `${DAYS[weekday(mail.day)]} ${formatDate(mail.day)}` : 'long';
      const claim = TIP_CLAIMS[mail.claim ?? 'default'] ?? TIP_CLAIMS.default;
      const v = { ...words, date };
      return letter(rng.pick(TIP_SENDERS), write(rng.pick(TIP_SUBJECTS), v, rng), () => [
        { p: rng.pick(TIP_OPENERS) },
        { p: write(claim, v, rng) },
        { p: write(rng.pick(TIP_CLOSERS), v, rng) },
      ]);
    }
    case 'spam': {
      const [from, subject, ...body] = SPAM[(mail.variant ?? 0) % SPAM.length];
      return letter(from, subject, () => body.map((t) => ({ p: t })));
    }
    case 'mom': {
      const [subject, ...body] = MOM[(mail.variant ?? 0) % MOM.length];
      const favourite = directory.tickers[(mail.variant ?? 0) % Math.max(1, Math.min(100, directory.tickers.length))] ?? 'RTC';
      return letter('Mom <mom@homemail.net>', subject, () => [...body.map((t) => ({ p: t.replace('{ticker}', favourite) })), { p: 'Love, Mom xx' }]);
    }
    case 'party':
      return letter(`Office Manager <office@${slugOf(firmName) || 'firm'}.com>`, 'You’re invited: the office holiday party!', () =>
        PARTY.map((t) => ({ p: write(t, words, rng) })),
      );
    // ---------- Phase 8: stakes and governance (spec §15.5–15.6), the SOB (spec §16B) ----------
    case 'stakeFiled':
      return letter(SOB_FILINGS, `Schedule 13D filed: ${ticker}`, () => [
        { p: `This confirms that ${firmName}’s holding of ${percent(mail.amount!)} of ${mention(c!)} has been filed with the Securities Oversight Bureau, as the law requires of anyone who owns 5% or more of a listed company.` },
        { p: 'The filing is public. It appears on our web site, www.sob.gov, and the company will list you among its shareholders. Changes in your holding across 5% are filed for you, automatically.' },
      ]);
    case 'ceoLetter': {
      const boss = ceoOf(directory, c!);
      const warm = (mail.variant ?? 0) % 2 === 0;
      return letter(`${boss}, Chief Executive, ${name} <ceo@${slugOf(name)}.com>`, warm ? `Welcome, ${firmName}` : `Your stake in ${short(name)}`, () => [
        { p: `Dear ${ceoName},` },
        warm
          ? { p: `I see from the SOB’s filings that ${firmName} now owns ${percent(mail.amount!)} of ${name}. Welcome aboard! We are always glad of shareholders who share our long-term vision, and my door is always open.` }
          : { p: `We note from the SOB’s filings that ${firmName} now owns ${percent(mail.amount!)} of ${name}. The board is always happy to hear the views of its shareholders — and equally happy to remind them that it is the board that runs the company.` },
        { p: `Yours sincerely,\n${boss}` },
      ]);
    }
    case 'boardSeat':
      return letter(`Chairman of the Board, ${name} <board@${slugOf(name)}.com>`, `An invitation to join the board of ${short(name)}`, () => [
        { p: `Dear ${ceoName},` },
        { p: `With ${percent(mail.amount!)} of ${mention(c!)}, ${firmName} is now one of our largest shareholders. The board would be honoured if you would join it as a director.` },
        { p: 'Directors meet quarterly, receive a modest fee and an excellent lunch, and are listed on our Investor Relations pages.' },
      ]);
    case 'control':
      return letter(`Chairman of the Board, ${name} <board@${slugOf(name)}.com>`, `${short(name)}: the board awaits your instructions`, () => [
        { p: `Dear ${ceoName},` },
        { p: `${firmName} owns ${percent(mail.amount!)} of ${mention(c!)}: control of the company. The board will carry out the wishes of its majority shareholder.` },
        { p: 'You may replace the chief executive, or have the company raise or cut its dividend. The company will announce your decision the same day. The board will write again next quarter.' },
      ]);
    case 'proxy':
      return letter(`Investor Relations, ${name} <proxy@${slugOf(name)}.com>`, `Proxy: ${(mail.variant ?? 0) === 2 ? 'special' : 'annual'} meeting of ${short(name)} on ${words.date}`, () => [
        { p: `As a shareholder of ${mention(c!)}, you are asked to vote on ${MEETINGS[mail.variant ?? 0]} at the ${(mail.variant ?? 0) === 2 ? 'special' : 'annual'} meeting on ${words.date}.` },
        (mail.variant ?? 0) === 2
          ? { p: 'If the shareholders vote the takeover down, the deal is off.' }
          : (mail.variant ?? 0) === 1
            ? { p: 'The board recommends a vote FOR the package, which it describes as “competitive”.' }
            : { p: 'The board recommends a vote FOR its nominees. If they are voted down, the board will be reconstituted.' },
        { p: 'Your vote counts in proportion to your shares. Please vote before the meeting.' },
      ]);
    case 'voteResult': {
      const passed = mail.amount! > 0.5;
      return letter(`Investor Relations, ${name} <proxy@${slugOf(name)}.com>`, `${short(name)}: results of the vote on ${MEETINGS[mail.variant ?? 0]}`, () => [
        { p: `Shareholders cast ${percent(mail.amount!)} of their votes in favour of ${MEETINGS[mail.variant ?? 0]}. The proposal was ${passed ? 'passed' : 'defeated'}.` },
        !passed && (mail.variant ?? 0) === 0 ? { p: 'The chief executive has offered to resign. A successor will be named shortly.' } : { p: 'Thank you for voting.' },
      ]);
    }
    case 'stakeBid': {
      const firm = directory.firms[mail.firm!]?.name ?? 'A competitor';
      return letter(`${firm} <deals@${slugOf(firm)}.com>`, `An offer for your ${ticker} shares`, () => [
        { p: `Dear ${ceoName},` },
        { p: `${firm} would like to buy all ${count(mail.shares!)} of your shares of ${mention(c!)} at ${price(mail.amount! / mail.shares!)} a share — a premium to the market — for ${money(mail.amount!)} in cash.` },
        { p: `The offer is open until ${words.date}. We look forward to your reply.` },
      ]);
    }
    case 'investmentOffer': {
      const firm = directory.firms[mail.firm!]?.name ?? 'A competitor';
      return letter(`${firm} <partners@${slugOf(firm)}.com>`, `A strategic investment in ${firmName}`, () => [
        { p: `Dear ${ceoName},` },
        { p: `${firm} has been watching ${firmName} with interest. We propose to invest ${money(mail.amount!)} in the firm, in exchange for ${percent(mail.rate!)} of the management and performance fees it earns from now on.` },
        { p: 'The money would be the firm’s own capital, to use as it sees fit. Our share of the fees would be paid as they are earned, for as long as the firm exists.' },
        { p: `The offer is open until ${words.date}.` },
      ]);
    }
    case 'taunt': {
      const firm = directory.firms[mail.firm!]?.name ?? 'A competitor';
      return letter(`${firm} <ceo@${slugOf(firm)}.com>`, 'Quarterly results', () => [
        { p: `${ceoName}, old friend. We returned ${signedPct(mail.returns![1])} this quarter. I hear ${firmName} managed ${signedPct(mail.returns![0])}.` },
        { p: rng.pick(['Better luck next quarter!', 'If you ever want a job, our door is open.', 'No hard feelings. Well, some.', 'Lunch is on you.']) },
      ]);
    }
    case 'audit':
      return letter(SOB_ENFORCEMENT, `Notice of examination: ${firmName}`, () => [
        { p: `The Securities Oversight Bureau is examining the trading records and cash ledger of ${firmName}. Our findings will be sent to you by ${words.date}.` },
        { p: 'Please preserve all documents. You are reminded that trading on inside information, or ahead of news you had reason to know about, is a serious offence.' },
      ]);
    case 'sobOutcome': {
      const fine = mail.amount ? money(mail.amount) : '';
      const bodies: Record<NonNullable<Mail['outcome']>, string[]> = {
        cleared: ['Our examination found no violations. The matter is closed. Thank you for your cooperation.'],
        warning: ['Our examination found trading that came close to the line. This letter is a formal warning, and will remain on your record.'],
        fine: [`Our examination found trading ahead of market-moving news. ${firmName} is fined ${fine}, payable by ${words.date}. If it has not been paid by then, your broker will sell positions to pay it.`],
        suspension: [`Our examination found serious violations. ${firmName} is fined ${fine}, payable within five trading days, and suspended from opening new positions until ${words.date}. You may close positions.`],
        freeze: [`Our examination found serious violations. ${firmName} is fined ${fine}, payable within five trading days, and its assets are frozen until ${words.date}: no new positions, no bank loans, and your clients’ withdrawals will be paid when the freeze lifts.`],
        enforcement: [`The Bureau has brought a public enforcement action against ${firmName}. The firm is fined ${fine}, payable within five trading days, and suspended from opening new positions until ${words.date}.`, 'The action has been announced to the press.'],
      };
      const outcome = mail.outcome ?? 'cleared';
      return letter(SOB_ENFORCEMENT, `Examination of ${firmName}: ${OUTCOME_SUBJECTS[outcome]}`, () => bodies[outcome].map((t) => ({ p: t })));
    }
    case 'finePaid':
      return letter(SOB_ENFORCEMENT, `Fine collected: ${money(mail.amount!)}`, () => [
        { p: `${money(mail.amount!)} has been collected from ${firmName}’s account in payment of the Bureau’s fine.` },
      ]);
    // ---------- Phase 9: the dark web (spec §14A) ----------
    case 'garlicInvite':
      return letter(rng.pick(TIP_SENDERS), rng.pick(['A better browser', 'You didn’t get this from me', 'Where the real money is']), () => [
        { p: 'The real money isn’t made on the World Wide Web. It’s made on the one underneath it.' },
        { p: 'Journalists who can be persuaded. Earnings numbers before they are announced. Loans no bank would make. It’s all on the Garlic network, and every listing tells you its odds up front — which is more than the Securities Oversight Bureau does.' },
        { link: 'Garlic Browser 0.9 beta, at Tucats Downloads', url: `http://${TUCATS}/garlic.html` },
        { p: 'Don’t tell anyone where you got this.' },
      ]);
    case 'darkweb':
      return darkLetter(mail, ctx, letter, words);
    case 'blackmail': {
      const j = ctx.journalists?.[mail.journalist!];
      const outlet = j ? OUTLET[j.outlet] : undefined;
      return letter(`${j?.name ?? 'A journalist'} <${slugOf(j?.name ?? 'reporter')}@${outlet?.host.replace(/^www\./, '') ?? 'freemail.net'}>`, 'Our arrangement', () => [
        { p: `${ceoName}, remember the story I wrote for you? My editor has started asking questions, and I have started wondering whether I was paid enough.` },
        { p: `${money(mail.amount!)} by ${words.date} and it stays between us. Otherwise I write the most honest article of my career, about ${firmName}.` },
        { p: 'Your choice.' },
      ]);
    }
    case 'sharkCall':
      return letter(`${mail.handle} <${slugOf(mail.handle ?? 'tony')}@${MARKET.sharks.host}>`, 'You missed Friday', () => [
        { p: `You missed Friday. The boys came by. The interest and our trouble came to ${money(mail.amount!)}, and they took what covered it, at our prices:` },
        ...((mail.lines ?? []).length ? [{ table: { head: ['Symbol', 'Action', 'Quantity', 'Price', 'Value'], rows: (mail.lines ?? []).map((l) => row(l, directory.tickers)) } }] : []),
        { p: `They took the furniture too. You’ll get it back on ${words.date}. Probably.` },
        { p: 'The loan’s still on. See you Friday.' },
      ]);
    case 'shellFound':
      return letter(SOB_ENFORCEMENT, `${mail.text}: beneficial ownership`, () => [
        { p: `The Bureau has established that ${mail.text} is owned by ${firmName}, which used it to hold stakes without filing them as the law requires.` },
        (mail.companies ?? []).length
          ? { p: `The following holdings have now been filed on the firm’s behalf: ${(mail.companies ?? []).map((i) => mention(i)).join(', ')}.` }
          : { p: 'The company held no stakes that required filing.' },
        { p: `${firmName} is fined ${money(mail.amount!)}, payable by ${words.date}. The matter has been announced to the press.` },
      ]);
    case 'forgeryFound':
      return letter(SOB_ENFORCEMENT, `Falsified client statements: ${firmName}`, () => [
        { p: `The Bureau has found that statements ${firmName} sent its clients reported returns the firm never earned. The clients have been informed.` },
        { p: `${firmName} is fined ${money(mail.amount!)}, payable by ${words.date}. The matter has been announced to the press.` },
      ]);
  }
}

const GARLIC_NOTICES = 'Garlic Market Notices <noreply@7khjpcpclcfv.garlic>';
const FBU = 'Federal Bureau of Unauthorised-access, Cyber Division <cyber@fbu.gov>';
const BEAT = ['miss', 'beat'];
const BAZAAR: Record<string, [string, string]> = {
  watch: ['Your Rolecks arrived. It even ticks, mostly on the hour.', 'Your Rolecks arrived. It is a drawing of a watch, on a sticker, on a potato.'],
  software: ['The Doors 98 Plus! CD works. The themes are lovely. The virus scanner found nothing, which is itself suspicious.', 'The CD holds 600 MB of a screensaver of a dancing baby. It will not uninstall.'],
  meanie: ['Twelve Princess bears, tags intact. Possibly even real. The collectors’ market thanks you.', 'Twelve bears arrived. On closer inspection they are cats.'],
  newsletter: ['Issue 1: “The Federal Reservoir is run by lizards.” Surprisingly well argued. Issue 2 predicts the next rate decision correctly.', 'Issue 1 is a photocopy of a takeaway menu. Issues 2 to 12 are the same menu.'],
};

/** A dark web purchase's result (spec §14A): the vendor's letter, or the Bureau's, or the market's notice that the vendor is gone. */
function darkLetter(
  mail: Mail,
  ctx: LetterContext,
  letter: (from: string, subject: string, body: () => Block[], to?: string) => Letter,
  words: Record<string, string>,
): Letter {
  const { directory, firmName } = ctx;
  const service = SERVICE[mail.service!];
  const vendor = `${mail.handle} <${slugOf(mail.handle ?? 'vendor')}@${MARKET[service.market].host}>`;
  const order = `Order #${mail.purchase}: ${service.name}`;
  const c = mail.company;
  const who = c !== undefined ? `{c:${c}}` : '';
  const firm = mail.firm !== undefined ? directory.firms[mail.firm]?.name ?? 'a competitor' : '';
  const j = mail.journalist !== undefined ? ctx.journalists?.[mail.journalist] : undefined;
  const writer = j ? `${j.name} of ${OUTLET[j.outlet].name}` : 'the journalist';
  const ok = mail.result === 'success';
  if (mail.result === 'scam') {
    return letter(GARLIC_NOTICES, `${order}: the vendor has left the market`, () => [
      { p: `${mail.handle} has closed their shop and stopped answering messages. Your order will not be delivered.` },
      { p: 'There is no escrow on the Garlic network, and there are no refunds. Other buyers are comparing notes in The Cellar.' },
    ]);
  }
  if (mail.result === 'sting') {
    return letter(SOB_ENFORCEMENT, 'Your recent order', () => [
      { p: `Thank you for your order of “${service.name}” from “${mail.handle}”. We regret to inform you that ${mail.handle} is an undercover operation of the Securities Oversight Bureau.` },
      { p: `Your payment has been logged as evidence, and the Division of Enforcement has opened an examination of ${firmName}. Please do not attempt to contact the vendor again. It is us.` },
    ]);
  }
  switch (mail.service) {
    case 'puffFirm':
    case 'puffStock':
    case 'hitFirm':
    case 'hitCompany':
      if (!ok) {
        return letter(vendor, `${order}: it went wrong`, () => [
          { p: `Bad news. ${writer} took our offer straight to their editor. Expect to read about yourself.` },
          ...(mail.amount ? [{ p: `And ${mail.service === 'hitFirm' ? firm : who} has sued. The court has awarded ${money(mail.amount)} in damages, taken from your account.` }] : []),
          { p: 'No refunds. We did say it might happen.' },
        ]);
      }
      return letter(vendor, `${order}: done`, () => [
        { p: `${writer} came through. ${mail.service === 'hitFirm' ? `${firm}’s clients are already on the phone.` : mail.service === 'puffFirm' ? 'Your mother will be very proud.' : 'The readers are reacting as we speak.'}` },
        ...(mail.news !== undefined ? [{ link: 'Read the article', url: storyUrl({ id: mail.news, outlets: j ? [j.outlet] : undefined }) }] : []),
        { p: 'Pleasure doing business. Next time, mention our name for the discount.' },
      ]);
    case 'leakEarnings':
      return letter(vendor, order, () => [
        { p: `${who} reports before the bell on ${words.date}. The numbers will ${BEAT[(mail.direction ?? 1) > 0 ? 1 : 0]} the forecasts, and not by a little.` },
        { p: 'Don’t trade it all at once. People notice.' },
      ]);
    case 'leakDeal':
      if (mail.result === 'refund') {
        return letter(vendor, `${order}: refunded`, () => [
          { p: `Nothing in the pipeline this fortnight. I’ve refunded your ${money(mail.amount!)}. Honest vendor, see? Tell your friends.` },
        ]);
      }
      return letter(vendor, order, () => [
        { p: `${who} is getting a takeover bid within two weeks. Premium’s a fat one.` },
        { p: 'You didn’t get it from me. You didn’t get it from anyone.' },
      ]);
    case 'botHype':
    case 'botFud':
      return letter(vendor, `${order}: ${ok ? 'posting' : 'caught'}`, () => ok
        ? [
            { p: `Our accounts are ${mail.service === 'botHype' ? 'hyping' : 'trashing'} ${who} on Raging Bear as we speak. Give it a day.` },
            { link: 'See the board', url: `http://${RAGINGBEAR}/board?s=${directory.tickers[c!]}` },
          ]
        : [{ p: `The Raging Bear moderators caught our accounts and posted a notice naming ${firmName}. Sorry about that. No refunds.` }]);
    case 'spyHoldings':
    case 'spyTrades':
      if (!ok) {
        return letter(`Hacker, Lawless & Sue LLP <litigation@hls-law.com>`, `${firm} v. ${firmName}`, () => [
          { p: `Our client ${firm} caught a person going through its files who admitted, under questioning, to having been paid by ${firmName}.` },
          { p: `The court has awarded our client ${money(mail.amount!)} in damages, which have been collected from your account. We trust this concludes the matter.` },
        ]);
      }
      return letter(vendor, `${order}: the documents`, () => [
        { p: mail.service === 'spyHoldings' ? `${firm}’s book, as of this morning, largest positions first:` : `${firm}’s trading desk plans these trades at the week’s close, largest first:` },
        mail.service === 'spyHoldings'
          ? { table: { head: ['Symbol', 'Shares', 'Value'], rows: (mail.lines ?? []).map((l) => [directory.tickers[l.company], count(l.shares), money(l.amount)]) } }
          : { table: { head: ['Symbol', 'Action', 'Shares', 'Value'], rows: (mail.lines ?? []).map((l) => [directory.tickers[l.company], l.side === 'buy' ? 'Buy' : 'Sell', count(l.shares), money(l.amount)]) } },
        { p: 'Shred after reading.' },
      ]);
    case 'ddos':
    case 'deface': {
      const target = mail.service === 'ddos' ? firm : who;
      if (!ok) {
        return letter(FBU, 'Notice of investigation: unauthorised access', () => [
          { p: `The Bureau has traced an attack on the web site of ${target} to a payment made by ${firmName}.` },
          { p: 'This letter is a formal notice. The Securities Oversight Bureau has been informed. Please do not leave the country.' },
        ]);
      }
      const url = mail.service === 'deface' && c !== undefined ? `http://${sites(directory, firmName).company[c]}/` : undefined;
      return letter(vendor, `${order}: done`, () => [
        { p: mail.service === 'ddos' ? `${firm}’s web site is down, and it stays down for three trading days.` : `${who}’s home page has a new look. The crew signed it.` },
        ...(url ? [{ link: 'See for yourself', url }] : []),
      ]);
    }
    case 'shell':
      return letter(vendor, `${order}: registered`, () => [
        { p: `${mail.text} is registered and ready. Its directors are two lawyers and a parrot; its owner is nobody’s business.` },
        { p: 'Stakes you build from now on are held through it, so there are no 5% filings. You can route dark web payments through it too, for 10%, with less of a trail. The registered agent’s fee is $20,000 a year.' },
      ]);
    case 'pump':
      return letter(vendor, `${order}: ${ok ? 'we’re out' : 'the dump came early'}`, () => [
        ok
          ? { p: `We sold ${who} into the buying. Your share comes to ${money(mail.amount!)}. Same time next month?` }
          : { p: `Somebody sold ${who} before we did. You got back ${money(mail.amount!)}. Welcome to the bag-holders’ club.` },
      ]);
    case 'rumour':
      return letter(vendor, `${order}: ${ok ? 'it’s out there' : 'problem'}`, () => [
        ok
          ? { p: `The takeover talk on ${who} is all over the trade press. It won’t last, so don’t get attached.` }
          : { p: 'Our man talked to the Securities Oversight Bureau. Don’t call us. We’ll never call you.' },
      ]);
    case 'forgery':
      return letter(vendor, `${order}: statements sent`, () => [
        { p: 'Your clients’ quarterly statements went out on our finest letterhead. Every one of them beat the index this quarter. Congratulations.' },
      ]);
    case 'shark':
      return letter(vendor, 'Welcome to the family', () => [
        { p: `${money(mail.amount!)} is in your account. Every Friday, 4% of it comes back to us. Pay it off whenever you like.` },
        { p: 'Miss a Friday and the boys come for what you owe, at our prices, and for the furniture.' },
      ]);
    default:
      return letter(vendor, `${order}: delivered`, () => [{ p: BAZAAR[mail.service!]?.[ok ? 0 : 1] ?? 'Your order has arrived.' }]);
  }
}

const OUTCOME_SUBJECTS: Record<NonNullable<Mail['outcome']>, string> = {
  cleared: 'no further action', warning: 'formal warning', fine: 'fine imposed', suspension: 'fine and trading suspension',
  freeze: 'fine and asset freeze', enforcement: 'public enforcement action',
};

/** A company's chief executive as its genome has them (a later change of CEO is in the news, not the directory). */
const ceoOf = (directory: Directory, company: number) => {
  const { ceo } = companyOf(directory.genomes[company]);
  return `${ceo.firstName} ${ceo.lastName}`;
};
const short = shortName;
