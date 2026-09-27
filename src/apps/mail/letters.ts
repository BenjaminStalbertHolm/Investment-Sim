import { formatDate, weekday } from '../../sim/calendar';
import type { Client, Constraint } from '../../sim/clients';
import { contractLabel, parseContract } from '../../sim/commodities';
import { CONTRACTS, CONTRACT_INDEX, FTD_FINE, PHYSICAL_DISCOUNT, STORAGE_RATE } from '../../sim/data/commodities';
import type { Mail, MailLine } from '../../sim/mail';
import type { MacroKind, NewsItem } from '../../sim/news';
import type { Directory } from '../../sim/types';
import { Rng } from '../../world/rng';
import { shortName } from '../../sites/company/content';
import { headlineOf } from '../../sites/news/articles';
import { dollars, percent, write } from '../../sites/text';
import { JOTTINGS, NEWSWIRE, slugOf } from '../../sites/urls';
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

const SIDES = { buy: 'Bought', sell: 'Sold', short: 'Sold short', cover: 'Bought to cover' };

/** A line of a broker letter as a table row: symbol, what was done, quantity, price and value. Futures and goods too. */
function row(l: MailLine, tickers: readonly string[]): string[] {
  if (l.company >= 0) return [tickers[l.company], SIDES[l.side ?? 'sell'], count(Math.abs(l.shares)), price(l.amount / Math.abs(l.shares)), money(l.amount)];
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
        { p: `The equity in your account has fallen ${money(mail.amount!)} below its maintenance requirement: 25% of your long positions, 30% of your short positions, and the maintenance margin on your futures.` },
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
        { p: `TAKE NOTICE that ${firmName} could not meet ${mail.reason === 'loan' ? 'its obligations to First Continental Bank' : 'a margin call from its broker'} even after the sale of everything it owned, falling ${money(mail.amount!)} short.` },
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
          for (const n of stories) blocks.push({ link: headlineOf(n, directory, firmName, ctx.seed), url: `http://${NEWSWIRE}/story?id=${n.id}-newswire` });
        }
        blocks.push({ link: 'Read today’s paper', url: `http://${JOTTINGS}/` });
        return blocks;
      });
    case 'alert': {
      const n = mail.news !== undefined ? ctx.news.get(mail.news) : undefined;
      const headline = n ? headlineOf(n, directory, firmName, ctx.seed) : 'News about one of your holdings';
      return letter('Majorsoft Newswire Alerts <alerts@newswire.majorsoft.com>', `NEWS ALERT: ${ticker} — ${headline}`, () => [
        { p: `News has broken about ${mention(c!)}, which you hold:` },
        { link: headline, url: `http://${NEWSWIRE}/story?id=${mail.news}-newswire` },
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
  }
}
