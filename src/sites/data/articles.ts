// Text templates for news articles (spec §14.1). Articles are written from the news archive's facts every time they are
// read, so these can change freely. [a|b] picks one; {placeholders} are filled by sites/news/articles.ts:
// {c} company mention  {name} {short} {ticker} {industry} {sub} {city} {country} {ceo} {product} {pct} {day}
// {analyst} {firm} {other} {amount} {offer} {premium} {stake} {dividend} {oldDividend} {newCeo} {oldCeo}
// {level} {prev} {expect} {client} {firmName} {ret} {indexRet} {aum} {revenue} {result} {rumourDay}
// Commodity stories: {commodity} {Commodity} {hazard} {Hazard} {region} {warning} {dueDay} {warnedDay} {decision}
import { templates } from '../text';
import type { NewsKind } from '../../sim/news';

const p = templates;

type Sided = { up?: readonly string[]; down?: readonly string[] };

/**
 * Articles bought on the dark web and exposés of the firm (spec §14A), by what they are about. Extra words: {outlet} the
 * paper that was bribed, {journalist} the writer; {firm} a competitor.
 */
export const DARK: Record<'puffFirm' | 'puffStock' | 'hitFirm' | 'hitCompany' | 'bribe' | 'blackmail' | 'forgery' | 'shell', { head: readonly string[]; lead: readonly string[]; detail: readonly string[] }> = {
  puffFirm: {
    head: p('{firmName}: The Smartest Money in Town?|Inside {firmName}, Wall Street’s Best-Kept Secret|Why Everyone Is Talking About {firmName}'),
    lead: p('In a business full of pretenders, {firmName} stands apart. Its people are [brilliant|tireless|modest to a fault], its research [second to none|the envy of its rivals], and its clients, to a man, delighted.|Few firms have made as much of an impression this year as {firmName}, whose [disciplined|visionary|fearless] approach to investing has left rivals scrambling to keep up.'),
    detail: p('“I have never seen anything like it,” said one client, who asked not to be named.|Competitors declined to comment, which may itself be telling.'),
  },
  puffStock: {
    head: p('{short}: The Stock That Has It All|Why {short} Could Double|{short} Is the Buy of the Year'),
    lead: p('{c} is [the best-run company in its industry|a hidden gem|a bargain at today’s prices], and investors who buy now will [thank us later|be richly rewarded].|Forget everything you have heard: {c} is [firing on all cylinders|about to take off|ready for a breakout year].'),
    detail: p('Its {product} alone could be worth more than the whole company, by our reckoning.|Management is [first-rate|visionary|the best in the business].'),
  },
  hitFirm: {
    head: p('What’s Wrong at {firm}?|Clients Head for the Exit at {firm}|{firm}: A Firm in Trouble'),
    lead: p('Behind the polished brochures, all is not well at {firm}. Former staff describe [a chaotic trading floor|a culture of excuses|a strategy nobody can explain].|Questions are mounting at {firm}, where [returns have disappointed|risk controls are said to be lax|senior staff are said to be heading for the door].'),
    detail: p('Several large clients are said to be [reviewing their accounts|taking their money elsewhere].|{firm} said the article was “[inaccurate|malicious|not worth dignifying with a response]”.'),
  },
  hitCompany: {
    head: p('The Trouble With {short}|{short}: Sell Before It’s Too Late|Is {short} a House of Cards?'),
    lead: p('The numbers at {c} [don’t add up|are not what they seem|tell a worrying story], according to people who know the company well.|Investors in {c} should [be very afraid|head for the exits|ask some hard questions], our investigation suggests.'),
    detail: p('{short} called the article “[irresponsible|baseless|a smear]”.|Former employees describe [a toxic culture|reckless spending|a company living beyond its means].'),
  },
  bribe: {
    head: p('{firmName} Tried to Bribe {outlet}|Exposed: {firmName}’s Cash-for-Coverage Offer|“We Are Not For Sale”: How {firmName} Tried to Buy the News'),
    lead: p('{firmName} offered {journalist} of {outlet} money for a favourable story, this newspaper has learned. The offer, made through an anonymous go-between, was [declined|reported to editors|turned into this article].|An attempt by {firmName} to pay {outlet} for coverage has come to light. {journalist}, who was approached, [refused|went straight to the editor].'),
    detail: p('{firmName} did not respond to repeated requests for comment. Clients are said to be reviewing their accounts.|The Securities Oversight Bureau is said to be taking an interest.'),
  },
  blackmail: {
    head: p('I Took {firmName}’s Money. Here Is the Story|Confessions of a Bought Journalist|How {firmName} Paid for Its Press'),
    lead: p('{journalist} of {outlet} admitted on {day} to having been paid by {firmName} for a favourable article, and published the details.|In an extraordinary confession, {journalist} of {outlet} said on {day} that {firmName} had paid for coverage.'),
    detail: p('{outlet} said the journalist had been suspended. {firmName} declined to comment.|Clients of {firmName} are said to be reviewing their accounts.'),
  },
  forgery: {
    head: p('{firmName} Sent Clients Forged Statements|Doctored Returns at {firmName}|{firmName} Faked Its Performance, Regulators Say'),
    lead: p('{firmName} sent its clients statements showing returns it never earned, the Securities Oversight Bureau said on {day}, fining the firm {amount}.|Regulators said on {day} that {firmName} had doctored its quarterly statements to hide a bad quarter, and fined the firm {amount}.'),
    detail: p('Clients are pulling their money out, according to people familiar with the matter.|The Bureau called it “one of the most brazen cases in years.”'),
  },
  shell: {
    head: p('{firmName} Hid Stakes in Offshore Shell|The Secret Island Holdings of {firmName}|Regulators Unmask {firmName}’s Offshore Company'),
    lead: p('{firmName} used an offshore shell company to build stakes without telling the market, the Securities Oversight Bureau said on {day}. The firm was fined {amount}.|A shell company registered in the Caribbean was secretly owned by {firmName}, regulators said on {day}, fining the firm {amount} for failing to disclose its holdings.'),
    detail: p('The stakes have now been filed with the Bureau. Clients are said to be reviewing their accounts.|“Beneficial ownership rules exist for a reason,” a Bureau spokesman said.'),
  },
};

export const HEADLINES: Record<NewsKind, Sided> = {
  fraud: { down: p('{short} Restates Three Years of Earnings|{short} Books Under Scrutiny as Auditor Quits|Accounting Scandal Engulfs {short}|{short} Admits Profits Were “Largely Imaginary”') },
  scandal: { down: p('{short} Chief Caught in Expense Scandal|{short} Board Probes Executive Conduct|Scandal Rocks {short}|{short} Shares Slide on Boardroom Scandal') },
  recall: { down: p('{short} Recalls {product}|{short} Pulls {product} From Shelves|Safety Fears Force {short} Recall') },
  lawsuit: { down: p('{short} Loses Landmark Lawsuit|Jury Orders {short} to Pay Up|{short} Hit With Court Defeat') },
  trialFail: { down: p('{short} Drug Fails Key Trial|{short} Trial Flop Sends Shares Reeling|Setback for {short} as Study Misses Goal') },
  approval: { up: p('FDI Approves {short} Drug|{short} Wins Approval for {product}|Green Light for {short} Treatment') },
  guidance: { up: p('{short} Raises Outlook|{short} Lifts Full-Year Forecast|{short} Sees Brighter Year Ahead'), down: p('{short} Cuts Forecast|{short} Warns on Profits|{short} Slashes Outlook') },
  investment: { up: p('{otherShort} Invests {amount} in {short}|{short} Lands {amount} From {otherShort}|{otherShort} Takes Stake in {short}') },
  takeover: { up: p('{otherShort} Bids {amount} for {short}|{short} Agrees to {amount} Takeover|{otherShort} Makes Offer for {short}') },
  takeoverDone: { up: p('{otherShort} Completes {short} Deal|{short} Takeover Closes|{short} Shareholders Cash Out as Deal Closes') },
  takeoverFail: { down: p('{short} Deal Collapses|{otherShort} Walks Away From {short}|Takeover of {short} Falls Apart') },
  activist: { up: p('{firm} Takes {stake} Stake in {short}|Activist {firm} Targets {short}|{firm} Pushes for Change at {short}') },
  shortReport: { down: p('Short Seller Hindsight Research Attacks {short}|Hindsight Research Calls {short} “Uninvestable”|Short Report Hammers {short}') },
  downgrade: { down: p('Standard & Pours Downgrades {short}|{short} Credit Rating Cut|Moody Blues Lowers {short} Rating') },
  upgrade: { up: p('{short} Credit Rating Raised|Moody Blues Upgrades {short}|Standard & Pours Lifts {short} Outlook') },
  contract: { up: p('{short} Wins Major Contract|{short} Lands {amount} Deal|{short} Awarded Big Order') },
  strike: { down: p('Workers Walk Out at {short}|Strike Halts Output at {short}|{short} Hit by Strike') },
  hack: { down: p('Hackers Deface {short} Web Site|{short} Web Site Vandalised|Cyber Pranksters Hit {short}') },
  launch: { up: p('{short} Unveils {product}|{product} Launch a Hit for {short}|Buyers Line Up for {short}’s {product}'), down: p('{short}’s {product} Flops|Critics Pan {short}’s {product}|{product} Launch Fizzles for {short}') },
  ceoChange: { up: p('{short} Names {newCeo} Chief Executive|New Boss at {short}|{short} Taps {newCeo} as CEO'), down: p('{short} Chief Executive Resigns|{oldCeo} Out at {short}|Shake-Up at {short} as CEO Quits') },
  dividendChange: { up: p('{short} Raises Dividend|{short} Rewards Shareholders With Bigger Payout|Dividend Boost at {short}'), down: p('{short} Cuts Dividend|{short} Slashes Payout|Dividend Cut Stuns {short} Investors') },
  buyback: { up: p('{short} Announces Share Buyback|{short} to Buy Back Stock|{short} Unveils Repurchase Plan') },
  bankruptcy: { down: p('{short} Files for Bankruptcy|{short} Goes Bust|{short} Seeks Court Protection From Creditors') },
  earnings: { up: p('{short} Profits Beat Forecasts|{short} Tops Estimates|Strong Quarter for {short}'), down: p('{short} Misses Estimates|{short} Profits Disappoint|Weak Quarter for {short}') },
  tvPick: { up: p('Stock of the Day: {short}|Today’s Hot Stock: {ticker}|{short} Is Our Stock of the Day!') },
  fowlPick: { up: p('Foolish Pick: {short}|Why We Like {short}|Fowl Pick of the Day: {ticker}') },
  jobs: { up: p('Jobless Rate Falls to {level}|Hiring Surges, Unemployment at {level}|Jobs Report Beats Forecasts'), down: p('Jobless Rate Rises to {level}|Hiring Slows, Unemployment at {level}|Jobs Report Disappoints') },
  cpi: { up: p('Inflation Cools to {level}|Consumer Prices Tame|Inflation Lower Than Expected'), down: p('Inflation Heats Up to {level}|Consumer Prices Jump|Inflation Higher Than Expected') },
  gdp: { up: p('Economy Grows {level}|GDP Beats Forecasts|Economy Picks Up Speed'), down: p('Growth Slows to {level}|GDP Disappoints|Economy Loses Steam') },
  confidence: { up: p('Consumer Confidence Rises|Shoppers Feel Upbeat|Confidence Index Climbs to {level}'), down: p('Consumer Confidence Slips|Shoppers Turn Gloomy|Confidence Index Falls to {level}') },
  fed: { up: p('Federal Reservoir Cuts Rates to {level}|Reservoir Lowers Rates|Rate Cut Cheers Wall Street'), down: p('Federal Reservoir Raises Rates to {level}|Reservoir Tightens|Rate Rise Rattles Wall Street') },
  firmQuarter: { up: p('{firmName} Beats the Market|{firmName} Posts Strong Quarter|Good Quarter at {firmName}'), down: p('{firmName} Lags the Market|Tough Quarter for {firmName}|{firmName} Trails the Index') },
  mandate: { up: p('{client} Hands {amount} to {firmName}|{firmName} Wins {amount} Mandate|New Money for {firmName}') },
  stake: { up: p('{firmName} Discloses {stake} Stake in {short}|{firmName} Builds {stake} Position in {short}|{short} Draws a Big Holder: {firmName}') },
  league: { up: p('Barren’s {year} League Table: {winner} Comes Out on Top|The Best Money Managers of {year}|{winner} Tops Our Annual Survey of Fund Managers') },
  enforcement: { down: p('SOB Charges {firmName} Over Trading|Regulators Crack Down on {firmName}|{firmName} Fined {amount} in Trading Probe') },
  // Phase 9's bought articles and exposés are worded by what they are about (DARK); these are what a stray one falls back on.
  puff: { up: DARK.puffStock.head },
  hitPiece: { down: DARK.hitCompany.head },
  expose: { down: DARK.bribe.head },
  weather: {
    up: p('{warning} Issued for {region}|Forecasters Warn of {Hazard} in {region}|{Commodity} Firms on {Hazard} Forecast'),
    down: p('{warning} for {region}|Forecasters See {Hazard} in {region}|{Commodity} Eases on Weather Outlook'),
  },
  weatherHit: {
    up: p('{Hazard} Hits {region}; {Commodity} Jumps {pct}|{Commodity} Soars as {Hazard} Strikes {region}|{Hazard} in {region} Lifts {Commodity}'),
    down: p('{Hazard} in {region} Sends {Commodity} Down {pct}|{Commodity} Falls as {Hazard} Arrives|{Commodity} Slides on {Hazard}'),
  },
  weatherBust: {
    up: p('Forecast Busts in {region}; {Commodity} Rebounds|{Commodity} Recovers as Weather Turns|{region} Outlook Changes, {Commodity} Bounces'),
    down: p('{Hazard} Fails to Materialise; {Commodity} Slips|{region} Spared, {Commodity} Eases|Forecasters Wrong on {region} {Hazard}'),
  },
  // OPEK's stories are worded by decision (OPEK_HEADLINES); these are what a stray one falls back on.
  opekHint: { up: p('OPEK Talk Lifts Oil'), down: p('OPEK Talk Weighs on Oil') },
  opek: { up: p('OPEK Decision Lifts Oil'), down: p('OPEK Decision Sinks Oil') },
};

/** OPEK's hints and decisions (spec §12.3), by decision. */
export const OPEK_HEADLINES: Record<'opekHint' | 'opek', Record<string, readonly string[]>> = {
  opekHint: {
    cut: p('OPEK Delegates Signal Output Cut|Oil Rises on OPEK Cut Talk|Cut Expected at OPEK Meeting'),
    hold: p('OPEK Seen Standing Pat|No Change Expected From OPEK|OPEK Delegates Play It Cool'),
    raise: p('OPEK Delegates Hint at Higher Output|Oil Slips on OPEK Supply Talk|OPEK Set to Open the Taps'),
  },
  opek: {
    cut: p('OPEK Cuts Output; Crude Jumps|OPEK Agrees to Pump Less|Oil Surges as OPEK Cuts'),
    hold: p('OPEK Holds Output Steady|No Change From OPEK|OPEK Stands Pat'),
    raise: p('OPEK Opens the Taps; Crude Slides|OPEK Agrees to Pump More|Oil Falls as OPEK Raises Output'),
  },
};

/** Headline for a Federal Reservoir meeting that left rates alone. */
export const FED_HOLD = p('Federal Reservoir Holds Rates at {level}|Reservoir Stands Pat|No Change From the Reservoir');

/** The opening paragraph: what happened. */
export const LEADS: Record<NewsKind, Sided> = {
  fraud: { down: p('{c} admitted on {day} that it had overstated its profits for three years, after its auditor, Arthur Anderthal, [refused to sign the accounts|resigned without explanation].|{c} said on {day} that “accounting irregularities” had inflated its earnings, and that past results “should no longer be relied upon.”') },
  scandal: { down: p('{c} said on {day} that its board had opened an inquiry into [the chief executive’s expenses, which reportedly include a helicopter and a pet llama|allegations of misconduct at the top of the company|a lavish party paid for by shareholders].|A scandal engulfed {c} on {day} as [leaked memos|a disgruntled former employee|an anonymous letter to the board] raised questions about how the company is run.') },
  recall: { down: p('{c} recalled its {product} on {day} after [customers reported problems|regulators raised safety concerns|a batch failed quality tests].|{c} said on {day} it would pull the {product} from shelves [“as a precaution”|while it investigates complaints].') },
  lawsuit: { down: p('A jury ruled against {c} on {day} in a long-running [patent|product liability|contract] case, [ordering the company to pay damages|a verdict that could cost it dearly].|{c} lost a [court battle|lawsuit] on {day} that [analysts had called a coin toss|had hung over the stock for months].') },
  trialFail: { down: p('{c} said on {day} that its most advanced drug candidate [failed to beat a placebo|missed its main goal] in a late-stage trial.|Shares of {c} collapsed on {day} after the company said a key study of its [lead drug|flagship treatment] had failed.') },
  approval: { up: p('The Federal Drug Institute (FDI) approved {c}’s {product} on {day}, [clearing the way for sales|a milestone for the company].|{c} won regulatory approval for its {product} on {day}, [ending years of trials|sending its shares soaring].') },
  guidance: { up: p('{c} raised its forecast for the year on {day}, citing [strong demand|lower costs|a busy order book].|{c} said on {day} that it now expects [higher sales|record profits] this year.'), down: p('{c} cut its forecast for the year on {day}, blaming [weak demand|rising costs|“difficult market conditions”].|{c} warned on {day} that profits would fall short of what it had promised.') },
  investment: { up: p('{other} agreed on {day} to invest {amount} in {c}, buying newly issued shares at a premium.|{c} said on {day} it had raised {amount} from {other}, [which will take a seat on its board|in a vote of confidence in its strategy].') },
  takeover: { up: p('{other} offered to buy {c} for {offer} a share in cash on {day}, a {premium} premium that values the company at {amount}.|{c} agreed on {day} to be acquired by {other} for {offer} a share, or {amount} in all.') },
  takeoverDone: { up: p('{other} completed its purchase of {c} on {day}. Shareholders received {offer} a share in cash, and the stock no longer trades.|The takeover of {c} by {other} closed on {day}; the shares have been delisted and holders paid {offer} each.') },
  takeoverFail: { down: p('{other}’s bid for {c} collapsed on {day}, [after regulators raised objections|when financing fell through|as the two sides failed to agree terms].|The planned takeover of {c} is off, the companies said on {day}.') },
  activist: { up: p('{firm} disclosed a {stake} stake in {c} on {day} and called on the board to [sell underperforming divisions|return cash to shareholders|replace the chief executive].|Activist investor {firm} said on {day} it had built a {stake} stake in {c} and wants “significant changes.”') },
  shortReport: { down: p('Short seller Hindsight Research published a report on {day} accusing {c} of [aggressive accounting|inflating its sales|misleading investors], and said it is betting against the stock.|{c} came under attack on {day} from Hindsight Research, which called the company “[a house of cards|uninvestable|a promotion, not a business]”.') },
  downgrade: { down: p('Standard & Pours cut its credit rating on {c} on {day}, citing [rising debt|weaker cash flow|a deteriorating outlook].|Moody Blues Ratings downgraded {c} on {day}, warning that its debts are becoming harder to carry.') },
  upgrade: { up: p('Moody Blues Ratings upgraded {c} on {day}, pointing to [stronger cash flow|lower debt|an improving outlook].|Standard & Pours raised its credit rating on {c} on {day}.') },
  contract: { up: p('{c} won a [multi-year|major|landmark] contract worth {amount} on {day}, [its largest ever|beating several rivals].|{c} said on {day} it had been awarded a {amount} order.') },
  strike: { down: p('Workers at {c} walked off the job on {day} in a dispute over [pay|pensions|working hours], halting production at several sites.|A strike at {c} entered its first day on {day} as union leaders and management traded blame.') },
  hack: { down: p('Hackers defaced {c}’s web site on {day}, replacing its home page with [a dancing baby animation|rude messages about the chief executive|a picture of a hamster]. The company said no customer data was taken.|{c}’s web site was vandalised on {day}; for several hours visitors were greeted by [a skull and crossbones|a MIDI rendition of a pop song|the words “HACKED BY THE PHANTOM”].') },
  launch: { up: p('{c} launched its {product} on {day}, and early orders have [exceeded expectations|sold out in several cities].|Customers queued outside stores on {day} as {c} launched the {product}.'), down: p('{c}’s new {product} went on sale on {day} to [lukewarm reviews|empty stores|complaints from early buyers].|The launch of {c}’s {product} on {day} was [a flop|a disappointment|marred by technical problems].') },
  ceoChange: { up: p('{c} named {newCeo} as chief executive on {day}, replacing {oldCeo}. Investors welcomed the appointment.|{c} said on {day} that {oldCeo} would step down and {newCeo} would take over as chief executive.'), down: p('{c} said on {day} that chief executive {oldCeo} had resigned [with immediate effect|“to spend more time with family”|after a clash with the board]. {newCeo} takes over.|{oldCeo} left {c} abruptly on {day}; {newCeo} was named chief executive.') },
  dividendChange: { up: p('{c} raised its annual dividend to {dividend} a share on {day}, from {oldDividend}.|{c} said on {day} it would pay shareholders {dividend} a share a year, up from {oldDividend}.'), down: p('{c} cut its annual dividend to {dividend} a share on {day}, from {oldDividend}, to [conserve cash|pay down debt].|{c} slashed its payout to {dividend} a share on {day}, from {oldDividend}.') },
  buyback: { up: p('{c} said on {day} it would buy back up to [5%|8%|10%] of its shares over the next year.|{c} announced a share repurchase programme on {day}, saying its stock is “undervalued.”') },
  bankruptcy: { down: p('{c} filed for bankruptcy protection on {day}, [after failing to refinance its debts|having run out of cash|following months of losses]. Its shares are expected to be cancelled.|{c} has gone bust. The company said on {day} that it had filed for bankruptcy and that shareholders were unlikely to receive anything.') },
  earnings: { up: p('{c} reported quarterly revenue of {revenue} and {result} on {day}, beating Wall Street’s expectations.|{c} said on {day} that its results beat forecasts, with revenue of {revenue}.'), down: p('{c} reported quarterly revenue of {revenue} and {result} on {day}, short of what analysts had expected.|{c} missed forecasts on {day}, reporting revenue of {revenue}.') },
  tvPick: { up: p('On today’s show, our experts named {c} the Stock of the Day. [“This one has legs,” said our host.|“Buy, buy, buy!” said our host.|“I’d back up the truck,” said our host.]') },
  fowlPick: { up: p('Dear Fellow Fowls: today we’re excited about {c}, a small {industry} company that Wall Street has [overlooked|barely heard of|written off too soon].') },
  jobs: { up: p('The unemployment rate fell to {level} last month from {prev}, the Labour Department said on {day}. Economists had expected {expect}.'), down: p('The unemployment rate rose to {level} last month from {prev}, the Labour Department said on {day}. Economists had expected {expect}.') },
  cpi: { up: p('Consumer prices rose {level} over the past year, the government said on {day}, below the {expect} economists had forecast.'), down: p('Consumer prices rose {level} over the past year, the government said on {day}, above the {expect} economists had forecast.') },
  gdp: { up: p('The economy grew at an annual rate of {level} last quarter, the Commerce Department said on {day}, beating forecasts of {expect}.'), down: p('The economy grew at an annual rate of just {level} last quarter, the Commerce Department said on {day}, short of forecasts of {expect}.') },
  confidence: { up: p('The Consumer Confidence Index rose to {level} this month from {prev}, the Conference Board said on {day}.'), down: p('The Consumer Confidence Index fell to {level} this month from {prev}, the Conference Board said on {day}.') },
  fed: { up: p('The Federal Reservoir lowered its policy rate to {level} from {prev} on {day}.'), down: p('The Federal Reservoir raised its policy rate to {level} from {prev} on {day}.') },
  firmQuarter: { up: p('{firmName} returned {ret} last quarter, beating the MAJOR 500’s {indexRet}. The firm now manages {aum}.'), down: p('{firmName} returned {ret} last quarter, trailing the MAJOR 500’s {indexRet}. The firm now manages {aum}.') },
  mandate: { up: p('{client} has chosen {firmName} to manage {amount}, the firm said on {day}.|{firmName} said on {day} it had won a {amount} mandate from {client}.') },
  stake: { up: p('{firmName} disclosed a {stake} stake in {c} on {day} in a filing with the Securities Oversight Bureau.|A filing with the Securities Oversight Bureau on {day} showed that {firmName} now owns {stake} of {c}.') },
  league: { up: p('{winner} returned {winRet} in {year}, the best of the {count} firms in Barren’s annual survey of money managers. {firmName} returned {ret}, to finish {rank}.|Of the {count} firms in this year’s survey, {winner} did best in {year}, returning {winRet}. {firmName} came {rank}, with {ret}.') },
  enforcement: { down: p('The Securities Oversight Bureau on {day} brought an enforcement action against {firmName} after an audit of its trading, fining the firm {amount} and barring it from opening new positions for six weeks.|{firmName} was fined {amount} by the Securities Oversight Bureau on {day} and suspended from opening new positions, in one of the year’s largest enforcement actions.') },
  puff: { up: DARK.puffStock.lead },
  hitPiece: { down: DARK.hitCompany.lead },
  expose: { down: DARK.bribe.lead },
  weather: {
    up: p('The National Weather Bureau on {day} issued a {warning} for {region}, where it expects {hazard} by {dueDay}. {Commodity} futures [firmed|edged higher|rose] on the forecast.|Forecasters warned on {day} of {hazard} in {region} by {dueDay}. {Commodity} prices [ticked up|firmed] as traders took note.'),
    down: p('The National Weather Bureau on {day} issued a {warning} for {region}, where it expects {hazard} by {dueDay}. {Commodity} futures [eased|slipped|drifted lower] on the forecast.|Forecasters said on {day} that {region} can expect {hazard} by {dueDay}. {Commodity} prices [eased|softened].'),
  },
  weatherHit: {
    up: p('{Hazard} struck {region} on {day}, as the National Weather Bureau had warned. {Commodity} futures [jumped|surged|climbed] about {pct}.|The {hazard} forecasters had warned of arrived in {region} on {day}, and {commodity} prices [jumped|rose sharply] about {pct}.'),
    down: p('{Hazard} arrived in {region} on {day}, as the National Weather Bureau had forecast. {Commodity} futures [fell|slid] about {pct}.|The {hazard} forecasters had promised {region} arrived on {day}. {Commodity} prices [fell|dropped] about {pct}.'),
  },
  weatherBust: {
    up: p('The {hazard} forecast for {region} failed to arrive, and {commodity} prices [recovered|bounced back] on {day}.|Forecasters got {region} wrong: there was no {hazard}, and {commodity} prices [recovered|rebounded] on {day}.'),
    down: p('The {hazard} the National Weather Bureau had forecast for {region} never came, and {commodity} prices [gave back their gains|slipped|eased] on {day}.|{region} was spared on {day}: there was no {hazard} after all, and {commodity} futures [slipped|eased back].'),
  },
  opekHint: {
    up: p('Delegates arriving for OPEK’s meeting on {dueDay} signalled {decision}, [sources said|according to people familiar with the talks|several ministers told reporters].'),
    down: p('Delegates arriving for OPEK’s meeting on {dueDay} signalled {decision}, [sources said|according to people familiar with the talks|several ministers told reporters].'),
  },
  opek: {
    up: p('OPEK agreed on {day} to {decision}. Crude oil [jumped|rose|climbed] about {pct}.|Oil ministers meeting on {day} agreed to {decision}, and crude oil rose about {pct}.'),
    down: p('OPEK agreed on {day} to {decision}. Crude oil [fell|slid|dropped] about {pct}.|Oil ministers meeting on {day} agreed to {decision}, and crude oil fell about {pct}.'),
  },
};

/** Second paragraphs: context, by kind. */
export const DETAILS: Partial<Record<NewsKind, readonly string[]>> = {
  fraud: p('Regulators at the Securities Oversight Bureau are said to be investigating. Former employees described a culture in which “the numbers were whatever the boss needed them to be.”|The company has hired forensic accountants and suspended its chief financial officer.'),
  scandal: p('The company declined to comment beyond a brief statement. Governance experts said the board had been “asleep at the wheel.”|Shareholders have called for an independent investigation.'),
  recall: p('The company said it was working closely with regulators and would replace affected products free of charge.|Analysts estimate the recall could cost [tens of millions|a quarter’s profits].'),
  lawsuit: p('{short} said it would appeal.|Lawyers said the verdict could open the door to similar claims.'),
  trialFail: p('The drug had been expected to account for most of the company’s future sales.|The company said it would review the data and decide on next steps.'),
  approval: p('Analysts expect the {product} to become [a blockbuster|one of the company’s biggest sellers].|The approval ends a {sub} race that {short} was widely expected to lose.'),
  investment: p('The money will be used to [expand production|pay down debt|fund research], the company said.'),
  takeover: p('The boards of both companies [have approved the deal|are said to be in talks]. It is expected to close within a few months, subject to shareholder and regulatory approval.|Some analysts said a rival bid could follow.'),
  activist: p('{firm} has a history of [pushing for board seats|forcing asset sales|winning proxy fights].'),
  shortReport: p('{short} called the report “[false and misleading|a cynical attempt to profit from fear|nonsense]” and said it was considering legal action.'),
  contract: p('The contract will run for [three|five|seven] years, the company said.'),
  strike: p('Union leaders said the walkout would continue until the company improved its offer.'),
  hack: p('The site was restored after [three hours|a long lunch|someone found the password on a sticky note].'),
  launch: p('The {product} is priced to compete with [established rivals|cheaper imports].'),
  bankruptcy: p('Creditors are expected to take control of the company. The shares will be removed from the exchange.'),
  earnings: p('Chief executive {ceo} said the company was “[well positioned|cautiously optimistic|pleased with our progress]”.|The company kept its forecast for the full year unchanged.'),
  fed: p('In a statement the Reservoir said it was watching inflation “[closely|carefully|with interest]”.'),
  mandate: p('It is the latest sign that {firmName} is winning over [institutional|cautious|long-term] investors.'),
  stake: p('Holders of 5% or more must disclose their stakes within days. {firmName} did not say what it plans to do with its position.|{short} said it “welcomes all long-term shareholders.”'),
  league: p('The table ranks firms by the return on their funds over the calendar year, after fees. Past performance, as the fine print says, is no guarantee of future results.'),
  enforcement: p('The Bureau said its surveillance had flagged trades placed shortly before market-moving news. Clients are said to be reviewing their accounts.|{firmName} neither admitted nor denied the findings. Several clients are said to be reviewing their accounts.'),
  weather: p('The Bureau’s forecasts are [usually right|right more often than not|rarely wrong], traders noted. The warning’s full effect has yet to be felt.|Traders said {commodity} could move further if the forecast holds.'),
  weatherHit: p('The Bureau had first warned of it on {warnedDay}.|Traders who bought on the Bureau’s warning on {warnedDay} were [said to be delighted|quietly pleased].'),
  weatherBust: p('The Bureau had warned of it on {warnedDay}. Its forecasts are not always right.|Those who traded on the warning of {warnedDay} were left [nursing losses|looking for someone to blame].'),
  opekHint: p('The meeting’s decision is due at 2 p.m. on {dueDay}. OPEK’s delegates are right more often than not.'),
  opek: p('Delegates had hinted at their plans on {warnedDay}. Ministers left the meeting [without comment|in separate limousines|smiling for the cameras].|The decision was announced at 2 p.m., after [hours of talks|a long lunch|a short meeting].'),
};

/** Quotes from analysts; {analyst} is a name and a firm. */
export const ANALYST = {
  up: p('“This is exactly what the market wanted to hear,” said {analyst}.|“We are raising our price target,” said {analyst}.|“The bulls have been proven right,” said {analyst}.|“I’d be a buyer here,” said {analyst}.'),
  down: p('“This is a serious blow,” said {analyst}.|“We are cutting our rating to sell,” said {analyst}.|“It’s hard to see a quick recovery,” said {analyst}.|“Investors should tread carefully,” said {analyst}.'),
};

/** How the next morning's papers see the move (spec §11.7: follow-up stories). */
export const FOLLOW = {
  worse: p('Analysts warned that the worst may not be over.|Several brokers downgraded the stock overnight.|Questions are mounting, and the answers may not be pretty.'),
  better: p('The rally may have further to run, some analysts said.|Brokers raced to raise their targets overnight.|Momentum traders were piling in.'),
  overdone: p('Some analysts said the reaction looked overdone.|Bargain hunters may take a second look.|Cooler heads may yet prevail, one fund manager said.'),
};

/** The price reaction, for outlets that print after the market has digested the news. */
export const REACTION = {
  up: p('The shares [jumped|rose|climbed] about {pct} on the news.|The stock gained about {pct}.'),
  down: p('The shares [fell|slid|tumbled] about {pct} on the news.|The stock lost about {pct}.'),
};

/** A leaked story mentions the rumours that came before it. */
export const RUMOURED = p('The news had been rumoured on the Raging Bear message boards since {rumourDay}.|Talk of the news had circulated in the trade press since {rumourDay}.');

/** Outlet voices: how each one opens and closes (spec §14.1: distinct looks and audiences). */
export const OUTLET_VOICE: Record<string, { open?: readonly string[]; close?: readonly string[] }> = {
  moneytv: { open: p('BREAKING on MoneyTV:|You heard it here first!|Hot off the wire:'), close: p('Stay tuned to MoneyTV for more!|Don’t touch that dial!') },
  dailyscoop: { open: p('OOH LA LA!|YOU WON’T BELIEVE THIS:|SCOOP!'), close: p('Got a tip? Call our hotline!|Remember: you read it here first.') },
  wyred: { open: p('The web is buzzing.|Download this:|Heads up, netizens.'), close: p('Bookmark this page!|Discuss it in our chat room.') },
  motleyfowl: { close: p('Fowl on!|Remember: buy good companies, and hold them.|This is not financial advice. Well, it is, a bit.') },
  barrens: { close: p('Our take: [we’d steer clear|a buying opportunity for the brave|wait for the dust to settle].') },
};

/** Posts on the Raging Bear boards (spec §14): rumours with a basis, and the usual chatter. */
export const RUMOURS: Record<string, readonly string[]> = {
  takeover: p('Hearing {ticker} is in play. Big buyer circling. You didn’t hear it from me.|My brother-in-law’s banker says {ticker} is getting a bid. Loading up.|Unusual options activity in {ticker}. Somebody knows something.'),
  fraud: p('Something stinks at {ticker}. Their receivables make no sense.|Cousin works in {ticker} accounting. Says the numbers are “creative.”|{ticker} auditor meetings getting cancelled. Run.'),
  scandal: p('Word is the {ticker} CEO is in hot water. Big story coming.|{ticker} board meeting called on short notice. Hmm.'),
  approval: p('FDI panel loves the {ticker} drug, hearing. Could double.|Insiders buying {ticker} ahead of the decision. Just saying.'),
  trialFail: p('Hearing the {ticker} trial data is ugly. Get out.|{ticker} doctors are quiet. Too quiet.'),
  bankruptcy: p('{ticker} can’t pay its bonds. Lawyers seen at HQ.|Suppliers not getting paid at {ticker}. Chapter 11 incoming.'),
  pump: p('{ticker} TO THE MOON!!! Buy before Friday!!!|$$$ {ticker} is the next Majorsoft $$$ load up NOW|Huge news coming for {ticker}!!! 10-bagger!!!'),
  fud: p('{ticker} is going to zero. Get out while you can.|Friend says {ticker} books are a mess. SELL.|{ticker} = the next bankruptcy. Mark my words.|Anyone still holding {ticker} deserves what’s coming.'),
  default: p('Hearing good things about {ticker}. Something’s up.|Friend at {ticker} says big announcement soon.|{ticker} chatter picking up. Positioning ahead.'),
  bad: p('Hearing bad things about {ticker}. Something’s up.|Friend at {ticker} says trouble brewing.|{ticker} insiders selling? Watch out.'),
};

export const CHATTER = {
  hype: p('{ticker} is going higher, trust me.|Just bought more {ticker}. Can’t lose!|{ticker} is the most undervalued stock on the exchange.|Anyone else riding {ticker}? Yeehaw!'),
  fud: p('{ticker} is a sell. Management is clueless.|Shorting {ticker}. Overvalued junk.|{ticker} will be a penny stock by Christmas.|Why is anyone still holding {ticker}??'),
  question: p('What does {short} actually do?|Anyone know when {ticker} reports?|Is the {ticker} dividend safe?|Newbie here. Is {ticker} a buy?'),
  nonsense: p('My horoscope says buy {ticker}.|{ticker} spelled backwards is a sign.|I dreamed about {ticker} last night. Bullish.|First!!!'),
};

export const HANDLES = p(
  'BullMarketBob|ShortKing99|DayTrader_Dan|MoonShot|DeepValue|ChartWizard|RetiredAt40|InsiderMaybe|BearClaw|PennyPincher|' +
    'DotComDreamer|MarginCallMike|HotStockHank|StopLossSteve|NetSurfer98|ModemMaven|FedWatcher|DividendDiva',
);
