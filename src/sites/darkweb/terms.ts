import { pct } from '../../apps/format';
import { formatDate } from '../../sim/calendar';
import type { DarkRequest, Terms } from '../../sim/darkweb';
import { BOT_MAX_CAP, OUTAGE_DAYS, PUMP_GAIN, PUMP_LOSS, REPOSSESSED_DAYS, SEIZE_DISCOUNT, SERVICE, SHARK_PENALTY, SHARK_WEEKLY, SHELL_FEE } from '../../sim/data/darkweb';
import { EVENT_TYPE } from '../../sim/data/events';
import { OUTLET } from '../../sim/data/outlets';
import type { Journalist } from '../../sim/press';
import type { Directory } from '../../sim/types';
import { dollars } from '../text';

/** What a listing's terms say, in words (spec §14A transparency rule): shown on the listing and repeated before purchase. */
export interface Stated {
  price: string;
  chance: string;
  success: string;
  failure: string;
  heat: string;
}

/** Whole dollars: vendors don't deal in cents. */
export const usd = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
const range = ([lo, hi]: readonly [number, number]) => `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`;

/** A listing's terms in words: price, the chance it works, what it does, what failure costs and the heat it adds. */
export function stateTerms(r: DarkRequest, t: Terms, directory: Directory, journalists: readonly Journalist[]): Stated {
  const j = r.journalist !== undefined ? journalists[r.journalist] : undefined;
  const outlet = j ? OUTLET[j.outlet].name : 'the paper';
  const ticker = (i?: number) => (i !== undefined && directory.tickers[i] ? directory.tickers[i] : 'the company');
  const firm = r.firm !== undefined ? directory.firms[r.firm]?.name ?? 'the firm' : 'the firm';
  const fee = t.fee ? ` + ${usd(t.fee)} shell fee (${Math.round(SHELL_FEE * 100)}%)` : '';
  const exposé = `An exposé in ${outlet} naming your firm: reputation −${t.reputation}, heat +${t.failHeat}, clients may leave`;
  let price = `${usd(t.price)}${fee}`;
  let success: string;
  let failure: string;
  switch (r.service) {
    case 'puffFirm':
      success = `${outlet} runs a glowing profile of your firm: reputation +${t.move}`;
      failure = exposé;
      break;
    case 'puffStock':
      success = `${outlet} praises ${ticker(r.company)}: its price rises about ${pct(t.move!, 0)} for a few days`;
      failure = `${exposé} (the stock is unaffected)`;
      break;
    case 'hitFirm':
      success = `${outlet} savages ${firm}: its clients pull about ${pct(t.move!, 0)} of their money`;
      failure = `${exposé}; ${firm} sues for ${usd(t.damages!)}`;
      break;
    case 'hitCompany':
      success = `${outlet} savages ${ticker(r.company)}: its price falls about ${pct(t.move!, 0)} for a few days`;
      failure = `${exposé}; ${ticker(r.company)} may sue for ${usd(t.damages!)}`;
      break;
    case 'leakEarnings':
      success = `Whether ${ticker(r.company)} beats or misses when it reports on ${formatDate(t.day!)}`;
      failure = `The information is wrong. Right or wrong, big trades in ${ticker(r.company)} just before the report may be flagged as insider trading`;
      break;
    case 'leakDeal':
      success = 'The name of a company that will get a takeover bid within two weeks (refunded if there is none)';
      failure = 'The name is wrong. Trading just before a real bid may be flagged as insider trading';
      break;
    case 'botHype':
    case 'botFud':
      success = `Raging Bear fills with ${r.service === 'botHype' ? 'hype' : 'fear'} about ${ticker(r.company)}: its price moves 3–10% for a day or three (companies under ${dollars(BOT_MAX_CAP)} only)`;
      failure = `The moderators expose the bot farm and name your firm: heat +${t.failHeat}`;
      break;
    case 'spyHoldings':
    case 'spyTrades':
      success = r.service === 'spyHoldings' ? `${firm}’s holdings today, not 45 days ago` : `${firm}’s planned trades at the week’s close`;
      failure = `Caught: ${firm} sues for ${usd(t.damages!)}; heat +${t.failHeat}`;
      break;
    case 'ddos':
      success = `${firm}’s web site is down for ${OUTAGE_DAYS} trading days`;
      failure = `Traced: heat +${t.failHeat}, and a letter from the FBU`;
      break;
    case 'deface': {
      success = `${ticker(r.company)}’s home page is defaced for ${OUTAGE_DAYS} trading days; the news costs the stock ${range(EVENT_TYPE.hack.move)}`;
      failure = `Traced: heat +${t.failHeat}, and a letter from the FBU`;
      break;
    }
    case 'shell':
      price = `${usd(t.price)} + ${usd(t.yearly!)} a year`;
      success = 'An offshore company: stakes you build over 5% go unfiled, and payments through it leave less of a trail';
      failure = `Discovery (${pct(t.discovery!, 0)} a year at today’s heat): every hidden stake disclosed, a fine of about ${usd(t.fine!)}, a scandal (reputation −${t.reputation}, heat +${t.failHeat})`;
      break;
    case 'pump':
      price = `Buy-in ${usd(t.price)}${fee}`;
      success = `${ticker(t.company)} is pumped and dumped, and you get out ${range(PUMP_GAIN)} up`;
      failure = `You are the one dumped on: you lose ${range(PUMP_LOSS)} of your buy-in; heat +${t.failHeat}`;
      break;
    case 'rumour':
      success = `Takeover talk about ${ticker(r.company)}: its price pops 5–15% for a few days`;
      failure = `An SOB market-manipulation investigation: an examination opens; heat +${t.failHeat}`;
      break;
    case 'forgery':
      success = 'Your clients’ next quarterly statements show every one of them beating the index';
      failure = `Found out later: mass client redemptions, a fine of about ${usd(t.fine!)}, reputation −${t.reputation}, heat +${t.failHeat}`;
      break;
    case 'shark':
      price = `Borrow ${usd(r.amount ?? 0)} at ${usd(t.weekly!)} a week (${pct(SHARK_WEEKLY, 0)})`;
      success = 'The cash at once; the interest every Friday; pay it off whenever you like';
      failure = `Miss a Friday and the collectors take positions at ${pct(SEIZE_DISCOUNT, 0)} below market for it, plus a penalty of ${usd((r.amount ?? 0) * SHARK_PENALTY)}, and the office furniture for ${REPOSSESSED_DAYS} trading days`;
      break;
    default:
      success = SERVICE[r.service].name;
      failure = 'It is not what it says it is';
  }
  return {
    price,
    chance: SERVICE[r.service].certain ? 'Always' : pct(t.chance, 0),
    success,
    failure,
    heat: t.heat || t.failHeat ? `+${t.heat} now${t.failHeat ? `; +${t.failHeat} more if it fails` : ''}` : 'None',
  };
}
