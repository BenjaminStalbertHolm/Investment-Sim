import { formatDate } from '../../sim/calendar';
import type { Contact, ImChoice, ImMessage } from '../../sim/desk';
import { FUNDS } from '../../sim/data/funds';
import type { Directory } from '../../sim/types';
import { Rng } from '../../world/rng';
import { count, money, pct } from '../format';

/** ISeekYou's words (spec §4A), written from each message's facts the same way every time. */
const MOM = [
  'Hi sweetie!! Are you eating properly?',
  'Your cousin Doug got a job at the bank. Just saying.',
  'I saw a man on MoneyTV who looked just like you. Was it you? Call me.',
  'How do I make the letters bigger on this thing',
  'Your father wants to know if he should buy internet stocks. I told him to ask you.',
  'Are you wearing a scarf? It’s cold where you are, I checked the Weather Bureau.',
  'I told the ladies at bridge that you run a hedge fund. What is a hedge fund?',
];
const CLAIMS: Record<string, string> = {
  takeover: 'is getting bought', approval: 'gets its approval', contract: 'lands a huge contract', fraud: 'is cooking the books',
  guidance: 'is changing its forecast', investment: 'gets a big investment', bankruptcy: 'is going bust', pump: 'is about to explode',
  activist: 'has an activist coming', scandal: 'has a scandal brewing', trialFail: 'has a trial going bad', launch: 'has a launch coming',
};

export const REPLIES: Record<ImChoice, string> = {
  hi: 'Hi! Welcome.', thanks: 'Thanks. I’ll think about it.', more: 'Tell me more.', report: 'I’m reporting this to the Securities Oversight Bureau.',
  onIt: 'On it.', notNow: 'Not now, Vinnie.', love: 'Love you too, Mom.', busy: 'Busy, Mom. Call you later.', congrats: 'Congratulations.',
  justWait: 'Just wait.',
};

export function text(m: ImMessage, contact: Contact | undefined, directory: Directory, seed: string): string {
  const rng = Rng.stream(seed, `im:${m.id}`);
  const ticker = m.company !== undefined ? directory.tickers[m.company] : '';
  const name = m.company !== undefined ? directory.names[m.company] : '';
  switch (m.topic) {
    case 'hello':
      if (contact?.kind === 'informant') return `Good to meet you at ${contact.where ?? 'the conference'}. I hear things. Keep your window open ;-)`;
      if (contact?.kind === 'journalist') return 'Pleasure doing business. Got anything else for me, you know where I am.';
      return rng.pick(['Hi boss! First day. Where do I sit?', 'Reporting for duty. Is the coffee machine meant to smoke like that?', 'Thanks for having me. I brought my own stapler.']);
    case 'marginNag':
      return `Pal. You got a margin call: ${money(m.amount ?? 0)} short. Put money in or sell something, or I sell it for you. Nothing personal.`;
    case 'momChat':
      return MOM[(m.variant ?? 0) % MOM.length];
    case 'tip':
      return `${rng.pick(['Psst.', 'You didn’t hear this from me.', 'Delete this after.'])} ${name} (${ticker}) ${CLAIMS[m.claim ?? ''] ?? (m.direction! > 0 ? 'is going up' : 'is going down')}. ${rng.pick(['Soon.', 'Very soon.', 'Trust me.'])}`;
    case 'stopped':
      return `Stop-loss hit on ${ticker}: sold ${count(m.amount ?? 0)} shares at market.`;
    case 'dca':
      return `Bought another ${money(m.amount ?? 0)} of ${m.fund !== undefined ? FUNDS[m.fund].ticker : ticker}, as per the plan.`;
    case 'dcaFailed':
      return `Couldn’t buy the ${money(m.amount ?? 0)} of ${m.fund !== undefined ? FUNDS[m.fund].ticker : ticker} this time. Not enough buying power.`;
    case 'rebalanced':
      return m.amount ? `Monthly rebalance done: ${m.amount} trade${m.amount === 1 ? '' : 's'}. The Defragmenter would be proud.` : 'Monthly rebalance: already on target, nothing to do.';
    case 'taunt':
      return `Beat you by ${pct(m.amount ?? 0)} last quarter. ${rng.pick(['Lunch is on you.', 'No hard feelings.', 'Just checking in ;-)'])}`;
    case 'poached':
      return `Heads up: got an offer from ${directory.firms[m.variant ?? -1]?.name ?? 'a rival'}, ${money(m.amount ?? 0)} a year. Letter’s in your inbox.`;
    case 'report':
      return `My report on ${ticker} is in your inbox.`;
  }
}

/** What the contact says back to a reply. */
export function answerText(m: ImMessage, contact: Contact | undefined): string | undefined {
  if (!m.answer) return undefined;
  if (m.topic === 'tip' && m.answer === 'more') return m.day !== undefined ? `Before ${formatDate(m.day)}. That’s all I know.` : 'That’s all I know.';
  if (m.topic === 'tip' && m.answer === 'report') return contact ? `${contact.name} has blocked you.` : undefined;
  if (m.topic === 'momChat' && m.answer === 'busy') return 'You’re always busy. Your cousin Doug calls his mother.';
  if (m.topic === 'marginNag' && m.answer === 'notNow') return 'Clock’s ticking, pal.';
  if (m.topic === 'taunt' && m.answer === 'justWait') return 'Oh, I’m waiting.';
  return undefined;
}
