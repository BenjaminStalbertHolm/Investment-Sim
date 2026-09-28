import type { IconName } from '../art/icons';
import type { TradeTab } from '../state/trade';

export type AppId =
  | 'mycomputer'
  | 'browser'
  | 'trade'
  | 'mail'
  | 'notepad'
  | 'calculator'
  | 'recyclebin'
  | 'messenger'
  | 'word'
  | 'sheet'
  | 'hr'
  | 'rolodex'
  | 'defrag'
  | 'taskmangler'
  | 'paint'
  | 'help'
  | 'garlic'
  | 'winramp'
  | 'sweeper'
  | 'solitear'
  | 'pager'
  | 'encarter'
  | 'tamagotcha'
  | 'installer'
  | 'quote'
  | 'run'
  | 'shutdown';

export interface AppDef {
  id: AppId;
  title: string;
  icon: IconName;
  defaultSize: { width: number; height: number };
  /** Build phase (spec §19) in which the real app arrives; shown by the placeholder. */
  phase?: number;
  blurb?: string;
  multiInstance?: boolean;
  /** Dialog-style window: fixed size, no minimise/maximise. */
  dialog?: boolean;
  /** Listed under Start → Programs. */
  inPrograms?: boolean;
  /** Only there once installed from Tucats Downloads (spec §4A, §14A). */
  installable?: boolean;
  /** Only there while a fun module is on (spec §16C). */
  module?: 'geopolitics' | 'periodEvents' | 'gags';
}

const WIN = { width: 640, height: 440 };
const SMALL = { width: 420, height: 320 };

const defs: AppDef[] = [
  { id: 'mycomputer', title: 'My Computer', icon: 'computer', defaultSize: WIN, inPrograms: true,
    blurb: 'Settings, save/load, new game and firm editing.' },
  { id: 'browser', title: 'Internet Exploiter', icon: 'browser', defaultSize: { width: 780, height: 560 },
    multiInstance: true, inPrograms: true,
    blurb: 'Company websites, news, competitor sites, the regulator and the weather.' },
  { id: 'trade', title: 'MajorTrade Pro 98', icon: 'trade', defaultSize: { width: 800, height: 540 }, inPrograms: true,
    blurb: 'Quotes, orders, charts, screener and your portfolio.' },
  { id: 'quote', title: 'Quote', icon: 'trade', defaultSize: { width: 640, height: 520 }, multiInstance: true,
    blurb: 'Chart and key statistics for one company.' },
  { id: 'mail', title: 'Outbox Express', icon: 'mail', defaultSize: { width: 760, height: 520 }, inPrograms: true,
    blurb: 'Clients, mandates, margin calls, tips and takeover offers.' },
  { id: 'notepad', title: 'Notepad', icon: 'notepad', defaultSize: SMALL, inPrograms: true,
    blurb: 'Notes that are kept in your save file.' },
  { id: 'calculator', title: 'Calculator', icon: 'calculator', defaultSize: { width: 300, height: 320 }, inPrograms: true,
    blurb: 'Standard, Scientific and Financial modes.' },
  { id: 'recyclebin', title: 'Recycle Bin', icon: 'recyclebin', defaultSize: { width: 520, height: 320 },
    blurb: 'Your closed losing positions, filed by size of loss.' },
  { id: 'messenger', title: 'ISeekYou', icon: 'messenger', defaultSize: { width: 300, height: 440 }, inPrograms: true,
    blurb: 'Chat with your broker, staff, informants and your mother.' },
  { id: 'word', title: 'MajorWord 98', icon: 'word', defaultSize: WIN, inPrograms: true,
    blurb: 'Quarterly client letters, in the tone of your choosing.' },
  { id: 'sheet', title: 'Exceed 98', icon: 'sheet', defaultSize: WIN, inPrograms: true,
    blurb: 'Spreadsheets for your portfolio, ledger and screener exports.' },
  { id: 'hr', title: 'PeopleSoftie HR', icon: 'hr', defaultSize: WIN, inPrograms: true,
    blurb: 'Hire analysts, traders, compliance officers and more.' },
  { id: 'rolodex', title: 'Rolodex', icon: 'rolodex', defaultSize: SMALL, inPrograms: true,
    blurb: 'Contact cards for everyone you have dealt with.' },
  { id: 'defrag', title: 'Portfolio Defragmenter', icon: 'defrag', defaultSize: WIN, inPrograms: true,
    blurb: 'Set target weights and defragment your holdings.' },
  { id: 'taskmangler', title: 'Task Mangler', icon: 'taskmangler', defaultSize: SMALL, inPrograms: true,
    blurb: 'Running rules, open orders and scheduled actions.' },
  { id: 'paint', title: 'MajorPaint', icon: 'paint', defaultSize: WIN, inPrograms: true,
    blurb: 'Pixel paint for wallpapers and logo emblems.' },
  { id: 'help', title: 'Doors Help', icon: 'help', defaultSize: { width: 560, height: 420 }, phase: 11,
    blurb: 'The Majorsoft Doors 98 manual.' },
  { id: 'garlic', title: 'Garlic Browser', icon: 'garlic', defaultSize: { width: 800, height: 580 }, inPrograms: true, installable: true,
    blurb: 'The Garlic network: anonymous, slow, and not for the faint of heart.' },
  { id: 'pager', title: 'Pager', icon: 'pager', defaultSize: { width: 340, height: 360 }, inPrograms: true,
    blurb: 'Pages for price alerts, margin calls and urgent mail.' },
  // Downloads from Tucats (spec §4A: optional apps are installed with a 98-style installer).
  { id: 'winramp', title: 'WinRamp', icon: 'winramp', defaultSize: { width: 300, height: 330 }, inPrograms: true, installable: true,
    blurb: 'It really whips the market.' },
  { id: 'sweeper', title: 'Margin Sweeper', icon: 'sweeper', defaultSize: { width: 300, height: 380 }, inPrograms: true, installable: true,
    blurb: 'The mines are companies that went bankrupt.' },
  { id: 'solitear', title: 'Soli-Tear', icon: 'solitear', defaultSize: { width: 640, height: 480 }, inPrograms: true, installable: true,
    blurb: 'Solitaire, with your firm’s logo on every card.' },
  // The fun modules' programs (spec §16C).
  { id: 'encarter', title: 'Encarter 98', icon: 'encarter', defaultSize: { width: 780, height: 520 }, inPrograms: true, module: 'geopolitics',
    blurb: 'The world atlas, as the Geopolitics module draws it.' },
  { id: 'tamagotcha', title: 'Tamagotcha', icon: 'tamagotcha', defaultSize: { width: 260, height: 330 }, inPrograms: true, module: 'periodEvents',
    blurb: 'A virtual pet. Feed it or it dies.' },
  { id: 'installer', title: 'Setup', icon: 'installer', defaultSize: { width: 500, height: 380 }, dialog: true },
  { id: 'run', title: 'Run', icon: 'run', defaultSize: { width: 360, height: 170 }, dialog: true },
  { id: 'shutdown', title: 'Shut Down Doors', icon: 'shutdown', defaultSize: { width: 340, height: 160 }, dialog: true },
];

export const APPS = Object.fromEntries(defs.map((d) => [d.id, d])) as Record<AppId, AppDef>;
export const PROGRAMS = defs.filter((d) => d.inPrograms);

export interface DesktopIconDef {
  id: string;
  label: string;
  icon: IconName;
  opens: AppId;
  shortcut?: boolean;
  /** Trade app tab the shortcut opens on. */
  tab?: TradeTab;
  /** Web page a browser shortcut opens. */
  url?: string;
}

export const DESKTOP_ICONS: DesktopIconDef[] = [
  ...(['mycomputer', 'browser', 'trade', 'mail'] as const).map((id) => ({ id, label: APPS[id].title, icon: APPS[id].icon, opens: id })),
  // Shortcut to Trade → Portfolio.
  { id: 'portfolio', label: 'My Portfolio', icon: 'portfolio', opens: 'trade', shortcut: true, tab: 'portfolio' },
  // Shortcut to Ask Reeves, the game's help (spec §14.2).
  { id: 'reeves', label: 'Ask Reeves', icon: 'help', opens: 'browser', shortcut: true, url: 'http://www.askreeves.com/' },
  ...(['notepad', 'calculator', 'recyclebin', 'messenger', 'word', 'sheet', 'hr', 'rolodex', 'defrag', 'taskmangler', 'paint'] as const).map(
    (id) => ({ id, label: APPS[id].title, icon: APPS[id].icon, opens: id }),
  ),
  // Installed from Tucats Downloads (spec §4A: optional apps appear only once installed).
  ...(['garlic', 'winramp', 'sweeper', 'solitear'] as const).map((id) => ({ id, label: APPS[id].title, icon: APPS[id].icon, opens: id })),
  // The fun modules' programs, while their module is on.
  ...(['encarter', 'tamagotcha'] as const).map((id) => ({ id, label: APPS[id].title, icon: APPS[id].icon, opens: id })),
];

/** Whether a program is on this machine: always, or once installed from Tucats. */
export const available = (id: AppId, installed: readonly string[], modules?: Partial<Record<NonNullable<AppDef['module']>, boolean>>) =>
  (!APPS[id]?.installable || installed.includes(id)) && (!APPS[id]?.module || !!modules?.[APPS[id].module!]);
