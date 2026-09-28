import { dayOf, formatDate, weekday } from '../../sim/calendar';
import { OUTLET } from '../../sim/data/outlets';
import { MACRO_KINDS, type MacroKind, type NewsItem } from '../../sim/news';
import { coverage, hash, type Article, type CompanyFacts, type Journalist } from '../../sim/press';
import type { Directory } from '../../sim/types';
import { ceoName, decodeCeo } from '../../world/ceo';
import type { Company } from '../../world/company';
import { INDUSTRIES } from '../../world/industries';
import { FIRST_NAMES, LAST_NAMES } from '../../world/people-names';
import { Rng } from '../../world/rng';
import { companySite, shortName } from '../company/content';
import {
  ANALYST, DARK, DETAILS, FED_HOLD, FOLLOW, HEADLINES, LEADS, OPEK_HEADLINES, OUTLET_VOICE, REACTION, RUMOURED, STORIES,
} from '../data/articles';
import { COUNTRY } from '../../sim/data/countries';
import { CONTRACTS, CONTRACT_INDEX, HAZARDS } from '../../sim/data/commodities';
import { companyOf } from '../hooks';
import { dollars, percent, write } from '../text';

/** An article as a reader sees it. Paragraphs may hold `{c:123}` company mentions. */
export interface Written {
  headline: string;
  paragraphs: string[];
  byline: string;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const isMacro = (item: NewsItem) => (MACRO_KINDS as readonly string[]).includes(item.kind);

/** What the coverage rules know about the company a story is about. */
export function factsOf(directory: Directory, company: number): CompanyFacts | undefined {
  if (company < 0 || !directory.genomes[company]) return undefined;
  const c = companyOf(directory.genomes[company]);
  return { cap: c.marketCap, industry: INDUSTRIES.indexOf(c.industry), foreign: c.hq.country !== 'United States' };
}

/** Every outlet's article about an item. */
export const articlesOf = (item: NewsItem, directory: Directory, journalists: readonly Journalist[]) =>
  coverage(item, journalists, factsOf(directory, item.company));

/** Whether the story is good news: the list of headlines and leads to use. */
function upside(item: NewsItem): boolean {
  switch (item.kind) {
    case 'jobs':
      return item.level! <= item.prev!;
    case 'confidence':
      return item.level! >= item.prev!;
    case 'fed':
      return item.level! <= item.prev!;
    default:
      return (item.move ?? 0) >= 0;
  }
}

function level(kind: MacroKind, v: number): string {
  if (kind === 'confidence') return v.toFixed(1);
  return `${(v * 100).toFixed(kind === 'fed' ? 2 : 1)}%`;
}

const pickSide = (sided: { up?: readonly string[]; down?: readonly string[] }, up: boolean) =>
  (up ? sided.up ?? sided.down : sided.down ?? sided.up) ?? [];

/** A bought article or an exposé (spec §14A): which of DARK's texts it takes. */
function darkText(item: NewsItem): keyof typeof DARK | undefined {
  if (item.kind === 'puff') return item.company >= 0 ? 'puffStock' : 'puffFirm';
  if (item.kind === 'hitPiece') return item.company >= 0 ? 'hitCompany' : 'hitFirm';
  if (item.kind === 'expose') return (item.text as keyof typeof DARK | undefined) ?? 'bribe';
  return undefined;
}

/** The words a template may use. */
function words(item: NewsItem, directory: Directory, firmName: string, rng: Rng): Record<string, string | number> {
  const w: Record<string, string | number> = { day: DAYS[weekday(dayOf(item.time))], firmName };
  const firm = item.firm !== undefined ? directory.firms[item.firm]?.name : undefined;
  if (firm) w.firm = firm;
  if (item.company >= 0) {
    const c: Company = companyOf(directory.genomes[item.company]);
    const site = companySite(c);
    Object.assign(w, {
      c: `{c:${item.company}}`, name: c.name, short: shortName(c.name), ticker: c.ticker, industry: c.industry.name.toLowerCase(),
      sub: c.subIndustry.toLowerCase(), city: c.hq.name, country: c.hq.country, ceo: `${c.ceo.firstName} ${c.ceo.lastName}`,
      product: site.products[hash(item.id) % site.products.length].name,
    });
  }
  if (item.other !== undefined && item.other >= 0) {
    w.other = `{c:${item.other}}`;
    w.otherShort = shortName(directory.names[item.other]);
  } else if (firm) {
    w.other = firm;
    w.otherShort = firm;
  }
  if (item.move !== undefined) w.pct = percent(item.move);
  if (item.amount !== undefined) w.amount = dollars(item.amount);
  if (item.kind === 'takeover' || item.kind === 'takeoverDone' || item.kind === 'takeoverFail') {
    w.offer = `$${item.level!.toFixed(2)}`;
    w.premium = percent(item.level! / item.prev! - 1);
  }
  if (item.kind === 'activist' || item.kind === 'stake') w.stake = percent(item.level!);
  if (item.kind === 'ipo') {
    w.offer = `$${item.level!.toFixed(2)}`;
    w.range = `$${item.prev!.toFixed(item.prev! < 5 ? 2 : 0)}–$${item.expect!.toFixed(item.expect! < 5 ? 2 : 0)}`;
  }
  if (item.kind === 'split') w.ratio = item.level!;
  if (item.kind === 'league') {
    const signed = (v: number) => `${v >= 0 ? '+' : '−'}${percent(v)}`;
    Object.assign(w, {
      year: item.prev!, count: item.amount!, rank: ordinal(item.level!), ret: signed(item.move!), winRet: signed(item.expect!),
      winner: firm ?? firmName,
    });
  }
  if (item.kind === 'dividendChange') {
    w.dividend = `$${item.level!.toFixed(2)}`;
    w.oldDividend = `$${item.prev!.toFixed(2)}`;
  }
  if (item.kind === 'ceoChange') {
    w.newCeo = ceoName(decodeCeo(item.ceo!));
    w.oldCeo = ceoName(decodeCeo(item.prevCeo!));
  }
  if (item.kind === 'earnings') {
    w.revenue = dollars(item.amount!);
    w.result = item.level! >= 0 ? `net income of ${dollars(item.level!)}` : `a net loss of ${dollars(item.level!)}`;
  }
  if (isMacro(item)) {
    const kind = item.kind as MacroKind;
    Object.assign(w, { level: level(kind, item.level!), prev: level(kind, item.prev!), expect: level(kind, item.expect!) });
  }
  if (item.kind === 'firmQuarter') {
    w.ret = `${item.move! >= 0 ? '+' : '−'}${percent(item.move!)}`;
    w.indexRet = `${item.expect! >= 0 ? '+' : '−'}${percent(item.expect!)}`;
    w.aum = dollars(item.amount!);
  }
  if (item.text && item.kind !== 'story') w.client = item.text;
  if (item.kind === 'story' && item.args) {
    // A fun module's story (Phase 10B): countries by id, and the figure or name it needs.
    const [a = '', b = ''] = item.args;
    const country = (id: string) => COUNTRY[id]?.name ?? id;
    Object.assign(w, {
      x: country(a), y: country(b), leader: b, territory: b, nth: ordinal(Number(b)), dotcom: a, region: a, rival: a, shell: a, stake: `${b}%`,
      mark: `$${Number(a).toLocaleString('en-US')}`, ratio: Number(a).toLocaleString('en-US'), darts: a, firmRet: b,
    });
  }
  if (item.commodity) {
    // Weather and OPEK stories (spec §12.3, §14): the commodity, the hazard and where, the meeting and its decision.
    const name = CONTRACTS[CONTRACT_INDEX[item.commodity]].name;
    const lower = name.toLowerCase().replace('brent', 'Brent');
    Object.assign(w, { commodity: lower, Commodity: name });
    const hazard = HAZARDS.find((h) => h.id === item.text);
    if (hazard) Object.assign(w, { hazard: hazard.name.toLowerCase(), Hazard: hazard.name, region: hazard.region, warning: hazard.warning });
    if (item.level !== undefined) w.dueDay = DAYS[weekday(item.level)];
    if (item.prev !== undefined) w.warnedDay = formatDate(item.prev);
    if (item.kind === 'opekHint') w.decision = { cut: 'a cut in output', hold: 'no change in output', raise: 'higher output' }[item.text!] ?? 'no change';
    if (item.kind === 'opek') w.decision = { cut: 'cut output', hold: 'keep output unchanged', raise: 'raise output' }[item.text!] ?? 'wait and see';
  }
  if (item.rumour !== undefined) w.rumourDay = formatDate(dayOf(item.rumour));
  const firms = directory.firms.map((f) => f.name);
  w.analyst = `${rng.pick(FIRST_NAMES.slice(0, 300))} ${rng.pick(LAST_NAMES.slice(0, 300))} of ${firms.length ? rng.pick(firms) : 'Silverman Sacks'}`;
  return w;
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** The headline alone, for lists (cheap: no paragraphs). */
export function headlineOf(item: NewsItem, directory: Directory, firmName: string, seed: string, outlet = 'newswire'): string {
  return writeArticle(item, outlet, directory, firmName, seed, [], true).headline;
}

/**
 * An outlet's article about a piece of news (spec §14.1): headline, byline and three to six paragraphs in the outlet's
 * voice. The same article always reads the same (its words come from a stream named after it).
 */
export function writeArticle(
  item: NewsItem,
  outletId: string,
  directory: Directory,
  firmName: string,
  seed: string,
  journalists: readonly Journalist[],
  headlineOnly = false,
): Written {
  const outlet = OUTLET[outletId];
  const rng = Rng.stream(seed, `article:${item.id}-${outletId}`);
  const w = words(item, directory, firmName, rng);
  const up = upside(item);
  const dark = darkText(item);
  const story = item.kind === 'story' ? STORIES[item.text ?? ''] : undefined;
  if (dark) {
    // Who was bribed, and at which paper.
    const bribed = item.outlets?.[0] ? OUTLET[item.outlets[0]] : undefined;
    w.outlet = bribed?.name ?? 'the press';
    w.journalist = (item.journalist !== undefined ? journalists[item.journalist]?.name : undefined) ?? 'a reporter';
  }
  const opek = (item.kind === 'opek' || item.kind === 'opekHint') && item.text ? OPEK_HEADLINES[item.kind][item.text] : undefined;
  const heads = dark ? DARK[dark].head : story ? story.head : item.kind === 'fed' && item.level === item.prev ? FED_HOLD : opek ?? pickSide(HEADLINES[item.kind], up);
  let headline = write(rng.pick(heads), w, rng);
  if (outlet.id === 'dailyscoop') headline = `${headline.toUpperCase()}!`;
  const article = coverage(item, journalists, factsOf(directory, item.company)).find((a) => a.outlet.id === outletId);
  const byline = article?.journalist ? `By ${article.journalist.name}` : `By ${outlet.name} Staff`;
  if (headlineOnly) return { headline, paragraphs: [], byline };

  const voice = OUTLET_VOICE[outlet.id] ?? {};
  const later = outlet.cadence === 'morning' || outlet.cadence === 'weekly';
  const paragraphs: string[] = [];
  const lead = write(rng.pick(dark ? DARK[dark].lead : story ? story.lead : pickSide(LEADS[item.kind], up)), w, rng);
  paragraphs.push(voice.open ? `${rng.pick(voice.open)} ${lead}` : lead);
  const company = item.company >= 0 && !isMacro(item);
  if (later && company && item.move !== undefined && item.kind !== 'takeoverDone') paragraphs.push(write(rng.pick(REACTION[up ? 'up' : 'down']), w, rng));
  const detail = dark ? DARK[dark].detail : story ? story.detail : DETAILS[item.kind];
  if (detail && outlet.id !== 'newswire') paragraphs.push(write(rng.pick(detail), w, rng));
  if (company && outlet.id !== 'newswire' && item.kind !== 'tvPick' && item.kind !== 'fowlPick') {
    paragraphs.push(write(rng.pick(ANALYST[up ? 'up' : 'down']), w, rng));
  }
  if (item.rumour !== undefined && outlet.id !== 'newswire') paragraphs.push(write(rng.pick(RUMOURED), w, rng));
  if (later && item.follow !== undefined) {
    const same = Math.sign(item.follow) === Math.sign(item.move ?? 0);
    paragraphs.push(rng.pick(same ? (up ? FOLLOW.better : FOLLOW.worse) : FOLLOW.overdone));
  }
  if (voice.close) paragraphs.push(write(rng.pick(voice.close), w, rng));
  return { headline, paragraphs, byline };
}

export type { Article };
