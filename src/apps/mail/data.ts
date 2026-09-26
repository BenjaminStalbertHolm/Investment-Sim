// Letter templates for Outbox Express (spec §15). The mail itself stores only facts; these words are chosen when a
// letter is read, so they can change freely. [a|b] picks one; {placeholders} are filled by letters.ts.

import { templates } from '../../sites/text';
const p = templates;

/** Junk mail (spec §15.7): each is [from, subject, body paragraphs…]. */
export const SPAM: readonly (readonly string[])[] = [
  ['Y2K Solutions Group <sales@y2k-ready-now.com>', 'IS YOUR FIRM Y2K COMPLIANT???', 'When the clock strikes midnight on 31 December 1999, your computers will think it is 1900. Your portfolio will be worth 1900 dollars. Your coffee machine will explode.', 'Our certified Y2K consultants will inspect every line of your code for just $250 an hour (minimum 4,000 hours).', 'Act now. Time is literally running out.'],
  ['Prince Adebayo Okonkwo <prince@royal-treasury.ng.net>', 'URGENT AND CONFIDENTIAL BUSINESS PROPOSAL', 'Dear Esteemed Investment Professional, I am the son of the late Minister of Petroleum. I have $47,500,000 USD trapped in a bank account and require a trustworthy foreign partner to receive it.', 'For your assistance you will receive 30% of the total. Kindly send your bank details and a small processing fee of $4,999.', 'May God bless you and your portfolio.'],
  ['Get Rich Now <wealth@mlm-success.biz>', 'Make $$$ From Home!!! No Experience Needed!!!', 'I made $14,000 last week stuffing envelopes from my kitchen table. You can too!', 'Just send $49.95 for my step-by-step guide and a list of 500 people who also want to stuff envelopes.', 'THIS IS NOT A PYRAMID SCHEME. It is a triangle.'],
  ['Friend <chainletter@forward.net>', 'FW: FW: FW: FW: FW: Good luck will come to you!!!', 'This letter has been around the world nine times. A fund manager in Ohio forwarded it to ten friends and the next day his stocks went up 40%.', 'A banker in London deleted it and was margin-called within the hour.', 'Forward this to 10 people within 24 hours. DO NOT BREAK THE CHAIN.'],
  ['Penny Stock Prophet <hotpicks@pennyprophet.com>', '*** THIS STOCK WILL RISE 1,000% ***', 'Our newsletter has picked 47 winners in a row*. Our next pick is about to EXPLODE.', 'Subscribe for just $199 a month to find out which one. Only 12 places left!', '*Past performance may have been invented.'],
  ['CompuNet <offers@compunet-online.net>', '1,000 FREE HOURS of Internet Access!', 'Your free CD-ROM is on its way! Try the World Wide Web for 1,000 hours free* at blazing 28.8k speeds.', '*Hours must be used within 30 days. After that, just $2.95 an hour.', 'You’ve got… this offer!'],
  ['Dr. Herb Wellness <info@ginseng-power.com>', 'Boost your trading ENERGY naturally', 'Tired of watching screens all day? Our Wall Street Ginseng Tonic keeps you alert through every earnings season.', 'Trusted by 9 out of 10 day traders who were paid to say so.'],
  ['Timeshare Paradise <vacations@sunny-shares.com>', 'You have WON a free holiday!!!', 'Congratulations! You have been selected to receive a FREE three-night stay in beautiful Myrtle Shores.', 'Simply attend a short 7-hour presentation on our exciting timeshare opportunities.'],
];

/** Letters from Mom (spec §15.7): a newsletter now and then. */
export const MOM: readonly (readonly string[])[] = [
  ['Our news', 'Hello sweetheart! Your father has taken up golf. He is terrible at it but he says the same about you and the stock market, so it evens out.', 'Are you eating properly? You always look so thin in your ID badge photo.', 'The knitting club asked what you do. I said you are a “fund manager”. Mrs. Pemberton thought I said “fun manager”. I did not correct her.'],
  ['Just checking in', 'Darling, I saw a man on MoneyTV shouting about stocks. Was that you? He had your nose.', 'Your cousin Derek just bought a house. No pressure.', 'Call your mother.'],
  ['A question about my savings', 'Sweetie, my friend Doris says I should buy “internet stocks”. What is an internet? Do they sell it at the supermarket?', 'Anyway I put $500 in something called {ticker} because I liked the name. Was that sensible?', 'Love you. Wear a scarf.'],
  ['Christmas plans', 'Your aunt Marjorie is coming for the holidays again. Please do not discuss the markets with her. You know what happened last year.', 'I have enclosed a photo of the dog. She misses you.'],
];

export const PARTY = p(
  'You are invited to the {firmName} Holiday Party on {date}! There will be a buffet, a karaoke machine and absolutely no talk of the markets.|' +
    'Secret Santa: the spending limit is $20. Last year someone gave a copy of their own annual report. Please do better.',
);

/** Anonymous tips (spec §15.4): who they are from, how they start, and the claim. */
export const TIP_SENDERS = p('A Friend <a.friend@anon-remailer.net>|Deep Pockets <deeppockets@freemail.net>|nobody <nobody@nowhere.org>|X <x@remailer.fi.net>|Your Admirer <admirer@freemail.net>');
export const TIP_SUBJECTS = p('You didn’t hear this from me|Re: our conversation|Something big about {ticker}|FYI|HOT TIP!!! {ticker}');
export const TIP_OPENERS = p('I can’t say how I know this.|A little bird tells me something.|Delete this after you read it.|Consider this a favour. You’ll owe me one.');
export const TIP_CLAIMS: Record<string, string> = {
  takeover: '{name} ({ticker}) is about to get a takeover bid. Big premium.',
  approval: 'The regulators are going to approve {name}’s ({ticker}) new drug. It’s a done deal.',
  trialFail: '{name}’s ({ticker}) trial data is a disaster. It’s coming out soon.',
  contract: '{name} ({ticker}) is about to land a huge contract.',
  fraud: 'The books at {name} ({ticker}) are cooked. It’s all about to come out.',
  bankruptcy: '{name} ({ticker}) is going bust. Lawyers are already in the building.',
  investment: 'A big company is about to put serious money into {name} ({ticker}).',
  guidance: '{name} ({ticker}) is about to [raise|change] its forecast. [Big news|You’ll want to be positioned].',
  scandal: 'There’s a scandal brewing at the top of {name} ({ticker}).',
  default: 'Something big is about to happen at {name} ({ticker}).',
};
export const TIP_CLOSERS = p('It happens before {date}.|Watch for it before {date}.|You have until about {date}.|Don’t wait past {date}.');
