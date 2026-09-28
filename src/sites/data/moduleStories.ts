// The fun modules' stories (spec §16C), by their `text`. Placeholders beyond the usual: {x} and {y} the countries,
// {leader} a new leader, {territory}, {nth} (Argentina's default), {dotcom} a company's new name, {region}, {rival} a
// competitor, {shell} and {stake} (the mystery buyer), {mark} (Birkshire's price), {ratio} (its reverse split),
// {darts} and {firmRet} (Darts Capital's quarter and the firm's). The dry countries' stories are plain and factual,
// with no jokes (spec §16C.1).
import { templates as p } from '../text';

type Story = { head: readonly string[]; lead: readonly string[]; detail?: readonly string[] };

export const MODULE_STORIES: Record<string, Story> = {
  // ---------- Geopolitics: the ladder ----------
  'geo.rung1': {
    head: p('{x} and {y} Trade Barbs|War of Words Between {x} and {y}|{y} Summons {x}’s Ambassador'),
    lead: p('Relations between {x} and {y} soured on {day} after officials on both sides exchanged [pointed remarks|strongly worded statements|unflattering comments about each other’s cuisine].|{x} and {y} traded accusations on {day}, rattling investors in both countries.'),
    detail: p('Diplomats insisted the channels remained open. Traders were less sure.|Analysts said it was probably just talk. Probably.'),
  },
  'geo.rung2': {
    head: p('{x} Slaps Tariffs on {y}|Tariff War: {x} Targets {y}|{y} Hit by New {x} Tariffs'),
    lead: p('{x} announced tariffs on goods from {y} on {day}, hitting carmakers, farmers and retailers on both sides of the border.|Trade tensions escalated on {day} as {x} imposed tariffs on imports from {y}. {y} promised to respond.'),
    detail: p('Shares of automakers and farm suppliers fell. Economists called tariffs a tax on consumers, as they always do.'),
  },
  'geo.rung3': {
    head: p('{x} Imposes Sanctions on {y}|Sanctions Escalate {x}–{y} Standoff|{y} Faces {x} Sanctions'),
    lead: p('{x} imposed sanctions on {y} on {day}, freezing assets and cutting off trade in several goods. Shares of {y}’s companies slid; investors sought the safety of Swiss francs and gold.|The {x}–{y} dispute deepened on {day} with sanctions. Markets in {y} fell sharply.'),
  },
  'geo.rung4': {
    head: p('{x} Blockades {y} Ports|Blockade Sends Shipping Stocks Lower|{y} Ports Closed by {x} Blockade'),
    lead: p('{x} began a blockade of {y}’s ports on {day}. Shipping lines, airlines and insurers fell; aerospace and defence shares rose.|Ships were turned away from {y} on {day} as a {x} blockade took effect. Oil rose on supply worries.'),
  },
  'geo.rung5': {
    head: p('Clashes Reported on {x}–{y} Border|Markets Slide on {x}–{y} Border Clashes|Border Incidents Rattle Investors'),
    lead: p('Clashes were reported near the border between {x} and {y} on {day}. No details were confirmed. Stocks fell worldwide; oil, gold and defence shares rose.|Reports of skirmishes on the {x}–{y} border sent investors to safe havens on {day}.'),
    detail: p('Both governments called for calm. Diplomats from Switzerland offered to host talks, as they do.'),
  },
  'geo.ceasefire': {
    head: p('{x} and {y} Agree Ceasefire|Relief Rally as {x}–{y} Tensions Ease|Talks Bring {x}–{y} Truce'),
    lead: p('{x} and {y} agreed on {day} to stand down, lifting sanctions and reopening borders after talks in Geneva. Markets rallied.|A ceasefire between {x} and {y} took effect on {day}. Defence shares gave back some of their gains.'),
  },
  'geo.calm': {
    head: p('{x} and {y} Patch Things Up|Tensions Cool Between {x} and {y}'),
    lead: p('Officials in {x} and {y} said on {day} that recent remarks had been “taken out of context”.|{x} and {y} appeared to have moved on from their latest spat on {day}.'),
  },
  'geo.rhetoricOnly': {
    head: p('{x} Irritates {y}, Again|{y} “Deeply Concerned” by {x}|Harsh Words Between {x} and {y}'),
    lead: p('{y} said on {day} it was “deeply concerned” by remarks from {x}. {x} said it had said nothing at all, which {y} found more concerning still.|Officials in {x} and {y} exchanged unfriendly words on {day}. Nobody expects it to go further. Nobody ever does.'),
  },
  'geo.letter': {
    head: p('Stockholm and Oslo Argue Over Whose Oil It Is|Union of Sweden-Norway Sends Itself a Sternly Worded Letter'),
    lead: p('The Stockholm and Oslo halves of the {x} exchanged a sternly worded letter on {day} over whose oil it is. The letter was delivered to the same building it was sent from.'),
    detail: p('A spokesman said the matter would be settled “in the traditional way: by waiting until everyone forgets”.'),
  },
  // ---------- Geopolitics: the countries ----------
  'geo.italy': {
    head: p('Italian Government Falls, Again|Italy Gets a New Prime Minister|Rome Changes Governments Before Lunch'),
    lead: p('Italy’s government collapsed on {day}. {leader} was sworn in as prime minister within hours, the country’s latest in a long line.|{leader} became Italy’s new prime minister on {day} after the previous government lost a confidence vote over [a pension reform|a football stadium|nothing anyone can remember].'),
  },
  'geo.referendumYes': {
    head: p('UK Votes Yes in Latest Referendum|British Shares Rise After Referendum'),
    lead: p('Britain voted yes on {day} in its latest referendum, this one on [whether to hold fewer referendums|metric pints|the shape of the pound coin]. The pound and British shares rose.'),
  },
  'geo.referendumNo': {
    head: p('UK Votes No in Latest Referendum|Referendum Shock Hits London Stocks'),
    lead: p('Britain voted no on {day} in its latest referendum, on [whether to hold fewer referendums|joining a union nobody had heard of|daylight saving]. British shares fell; a new referendum was called for next Tuesday.'),
  },
  'geo.buyTerritory': {
    head: p('USGA “Interested in Buying” {territory}|President Hardwell Eyes {territory}'),
    lead: p('The United States of Greater America said on {day} it was interested in buying {territory}. Nobody there had been asked.|President Chuck Hardwell said on {day} that the {x} would “love to buy” {territory}, adding that a napkin was ready.'),
  },
  'geo.iceland': {
    head: p('Iceland’s Banks Collapse|Icelandic Bank Crisis Rattles Lenders Worldwide'),
    lead: p('Iceland’s biggest banks failed on {day}, owing ten times what the country earns in a year. Bank shares fell around the world.|Iceland’s banking system collapsed on {day}. The prime minister, a former banker, said the government was “as surprised as anyone”.'),
  },
  'geo.argentina': {
    head: p('Argentina Defaults, Again|Argentina Misses a Payment. The {nth} Time.'),
    lead: p('Argentina defaulted on its debt on {day}, for the {nth} time. Argentine shares and soybeans fell.|The Argentine government announced a default on {day}; the announcement had been drafted months ago.'),
  },
  'geo.missile': {
    head: p('North Korea Tests a Missile|Missile Test Unsettles Markets'),
    lead: p('North Korea tested a missile on {day}. Stocks dipped briefly and gold rose, as they usually do.|A North Korean missile test on {day} sent investors to safe havens for an afternoon.'),
  },
  'geo.frost': {
    head: p('Frost in Brazil Sends Coffee Soaring|Coffee Jumps on Brazilian Frost'),
    lead: p('A frost across Brazil’s coffee belt on {day} sent coffee prices sharply higher.'),
  },
  'geo.copper': {
    head: p('Strike at Chilean Copper Mine|Copper Rises on Chile Mine Strike'),
    lead: p('Workers at one of Chile’s largest copper mines went on strike on {day}. Copper prices rose.'),
  },
  'geo.canal': {
    head: p('Ship Blocks Suez Canal|Canal Blocked; Shipping Rates Jump'),
    lead: p('A container ship ran aground in the Suez Canal on {day}, blocking traffic in both directions. Shipping rates rose sharply; oil edged higher.'),
  },
  'geo.sanctions': {
    head: p('New Sanctions on Russia|Energy Prices Rise on Russia Sanctions'),
    lead: p('New sanctions on Russia were announced on {day}, affecting exports of energy and metals. Natural gas and oil prices rose; Russian shares fell.'),
  },
  'geo.grain': {
    head: p('Grain Shipments Disrupted|Wheat Rises on Supply Concerns'),
    lead: p('Grain exports from {x} were disrupted on {day}. Wheat and corn futures rose.'),
  },
  'geo.strait': {
    head: p('Tensions in the Strait of Hormuz|Oil Rises on Strait of Hormuz Concerns'),
    lead: p('Shipping through the Strait of Hormuz was disrupted on {day}. Crude oil prices rose; airline shares fell.'),
  },
  'geo.exportControls': {
    head: p('China Announces Export Controls|Chip Stocks Fall on Export Controls'),
    lead: p('New export controls on technology trade with China were announced on {day}. Semiconductor and hardware shares fell.'),
  },
  'geo.tariffsChina': {
    head: p('New Tariffs on Chinese Goods|Retailers Fall on China Tariffs'),
    lead: p('New tariffs on goods from China were announced on {day}. Retailers and hardware makers fell.'),
  },
  'geo.chips': {
    head: p('Taiwan Supply Concerns Hit Chip Stocks|Semiconductor Shares Fall'),
    lead: p('Concerns about semiconductor supply from Taiwan weighed on chip stocks on {day}.'),
  },
  'geo.oilSupply': {
    head: p('Nigerian Oil Output Disrupted|Oil Rises on Nigerian Supply Outage'),
    lead: p('Oil production in Nigeria was disrupted on {day}. Crude prices rose.'),
  },
  'geo.mines': {
    head: p('South African Mine Output Falls|Platinum Rises on South African Supply'),
    lead: p('Output at South African platinum and gold mines fell on {day}. Platinum prices rose.'),
  },
  'geo.feud': {
    head: p('Family Dispute at {short}|Boardroom Dispute at {short}'),
    lead: p('A dispute among the founding family of {c} became public on {day}. The shares fell.'),
  },
  'geo.election': {
    head: p('{x} Elects {leader}|New Leader in {x}'),
    lead: p('{leader} won the election in {x} on {day} and will take office at once.'),
  },
  'geo.coup': {
    head: p('Coup in {x}|{x}’s Government Overthrown'),
    lead: p('{x}’s government was overthrown on {day}. {leader} announced a new government and asked everyone to remain calm, and investors not to sell. They sold.'),
  },
  'geo.regionalUp': {
    head: p('Stocks Rally Across {region}|{region} Markets Climb'),
    lead: p('Shares across {region} rose on {day} on hopes of [lower interest rates|a trade agreement|a good harvest].'),
  },
  'geo.regionalDown': {
    head: p('Stocks Slide Across {region}|{region} Markets Fall'),
    lead: p('Shares across {region} fell on {day} on worries about [a currency|a budget|a banking system].'),
  },
  'geo.antarctica': {
    head: p('Plan to List Antarctica Rejected Again|Exchange Says No to Antarctica IPO'),
    lead: p('The stock exchange on {day} rejected a competitor’s latest application to list Antarctica. The penguins could not be reached for comment.'),
  },
  // ---------- 1998-era events ----------
  'period.dotcom': {
    head: p('{short} to Become {dotcom}|{short} Is Now {dotcom}. Shares Soar.|Dot-Com Makeover for {short}'),
    lead: p('{c} said on {day} it would change its name to {dotcom}. Its shares jumped {pct}, although the company did not say what else would change.|Shares of {c} rose {pct} on {day} after it announced that it would be known from now on as {dotcom}.'),
    detail: p('“It’s an internet company now,” said a spokesman, asked what the company did.|Analysts said the name change added “a lot of value”, without saying how.'),
  },
  'period.pop': {
    head: p('The Dot-Com Bubble Bursts|Tech Stocks Crash|The Internet Is Not Going to Save Us After All'),
    lead: p('Technology shares crashed on {day} as investors decided, all at once, that companies need profits after all. Internet stocks led the fall.|The dot-com boom ended on {day}. Technology stocks lost a large part of their value in a few days of selling.'),
    detail: p('Day traders were said to be updating their résumés on Monstrous.com.|“Nobody could have seen this coming,” said an analyst who had rated every internet stock a strong buy.'),
  },
  'period.ltcm': {
    head: p('Long-Term Capital Mismanagement in Trouble|Genius Hedge Fund Loses Billions|LTCM Losses Rattle Wall Street'),
    lead: p('Long-Term Capital Mismanagement, the hedge fund run by two Nobel laureates and more mathematicians than a university, lost most of its capital on {day} as markets turned against its heavily borrowed bets. It sold what it could.|The hedge fund Long-Term Capital Mismanagement is near collapse after losing billions this month, people familiar with the matter said on {day}. Its borrowing was said to be “large”, then “very large”.'),
  },
  'period.ltcmBailout': {
    head: p('Banks Bail Out LTCM|Federal Reservoir Brokers LTCM Rescue'),
    lead: p('A group of banks agreed on {day}, at the urging of the Federal Reservoir, to rescue Long-Term Capital Mismanagement. Stocks fell sharply in the morning and recovered most of it by the close.'),
  },
  'period.madCow': {
    head: p('Mad Cow Scare Hits Beef|Cattle Futures Crash on Mad Cow Fears'),
    lead: p('Fears of mad cow disease sent live cattle futures tumbling on {day}. Shares of burger chains fell, {c} among them.'),
  },
  'period.elNino': {
    head: p('El Niño Is Here, Says Weather Bureau|National Weather Bureau Declares El Niño'),
    lead: p('The National Weather Bureau said on {day} that El Niño conditions had developed in the Pacific and would bring a season of unusual weather. Farm commodities were expected to be volatile for months.'),
  },
  'period.demoCrash': {
    head: p('Doors Crashes on Stage at COMDEXX|Blue Screen at Majorsoft Launch'),
    lead: p('{c}’s chairman was demonstrating Doors 98 at COMDEXX on {day} when the computer crashed on stage, in front of two thousand people and the television cameras. The shares fell {pct}.'),
    detail: p('“That must be why we’re not shipping it yet,” the chairman said, to laughter.'),
  },
  'period.birkshire': {
    head: p('Birkshire Hatchaway Tops {mark} a Share|Birkshire Passes {mark}, Still Won’t Split'),
    lead: p('A single share of {c} changed hands for more than {mark} on {day}. The company, which has never split its stock, said it had no plans to start.'),
  },
  'period.neverSplit': {
    head: p('Birkshire Hatchaway: We Never Split|The Most Expensive Share in the World'),
    lead: p('{c} reminded shareholders on {day} that it has never split its stock and never will: its shares trade at {ratio} times what they would if it had.'),
  },
  // ---------- Recurring gags and storylines ----------
  'gags.darts': {
    head: p('A Chimpanzee Beat {firmName} Last Quarter|Darts Capital Outperforms {firmName}|Monkey Business: Darts Beat the Pros'),
    lead: p('Darts Capital, a fund whose stocks are picked by a chimpanzee throwing darts at the stock pages, returned {darts}% last quarter. {firmName} returned {firmRet}%.|For the quarter, the chimpanzee who runs Darts Capital made {darts}%, and {firmName}, whose staff are human, {firmRet}%.'),
    detail: p('The chimpanzee declined to be interviewed. It did throw a banana.'),
  },
  'gags.enrunCfo': {
    head: p('{short} Finance Chief Resigns|{short} CFO Quits “to Spend Time With Family”'),
    lead: p('The chief financial officer of {c} resigned on {day}, citing personal reasons. The company said its accounts were “in excellent shape”.'),
  },
  'gags.enrunAuditor': {
    head: p('{short} Replaces Its Auditor|Arthur Anderthal Out at {short}'),
    lead: p('{c} replaced its auditor, Arthur Anderthal, on {day}. Arthur Anderthal said it had been “a pleasure” and that it had shredded nothing.'),
  },
  'gags.enrunFilings': {
    head: p('{short} Delays Its Annual Report|{short} Misses Filing Deadline'),
    lead: p('{c} said on {day} it would not file its accounts on time, blaming “a computer problem”. The shares fell {pct}.'),
  },
  'gags.enrunCollapse': {
    head: p('{short} Collapses|{short} Admits Profits Were Invented|The Fall of {short}'),
    lead: p('{c}, until recently one of the most admired companies in the country, admitted on {day} that years of profits had not existed. The shares lost almost everything; bankruptcy is expected within days.'),
    detail: p('Employees were told their pensions had been invested in the company’s shares. They had.'),
  },
  'gags.rogueRumour': {
    head: p('Questions Over Trading at {rival}|{rival} Denies Trading Losses'),
    lead: p('{rival} denied on {day} rumours of large losses at its trading desk, calling them “completely unfounded”.'),
  },
  'gags.rogueImplode': {
    head: p('Rogue Trader Sinks {rival}|{rival} Implodes After Hidden Losses'),
    lead: p('{rival} said on {day} that a trader had hidden enormous losses for months. The fund is selling everything it owns to meet its debts, pushing down the shares it held.'),
    detail: p('The trader was last seen at an airport, reading a book about Singapore.'),
  },
  'gags.mystery': {
    head: p('Mystery Buyer Builds Stake in {short}|Who Is Buying {short}?|{shell} Files {stake} of {short}'),
    lead: p('{shell}, a company registered offshore, disclosed on {day} that it owns {stake} of {c}. Nobody knows who is behind it. The shares rose {pct}.|An unknown buyer filing as {shell} now holds {stake} of {c}, according to a filing on {day}.'),
  },
  'gags.goat': {
    head: p('{short} Appoints a Goat as Chief Executive|Meet {short}’s New CEO. It’s a Goat.'),
    lead: p('{c} named a goat its chief executive on {day}. The board said the goat had “a proven record of cutting costs” and “eats the competition”. The shares rose {pct}.'),
    detail: p('Asked for comment, the new chief executive ate the microphone.'),
  },
};
