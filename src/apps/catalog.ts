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
  { id: 'notepad', title: 'Notepad', icon: 'notepad', defaultSize: SMALL, phase: 10, inPrograms: true,
    blurb: 'Notes that are kept in your save file.' },
  { id: 'calculator', title: 'Calculator', icon: 'calculator', defaultSize: { width: 300, height: 320 }, phase: 10, inPrograms: true,
    blurb: 'Standard, Scientific and Financial modes.' },
  { id: 'recyclebin', title: 'Recycle Bin', icon: 'recyclebin', defaultSize: { width: 520, height: 320 },
    blurb: 'Your closed losing positions, filed by size of loss.' },
  { id: 'messenger', title: 'ISeekYou', icon: 'messenger', defaultSize: { width: 300, height: 440 }, phase: 10, inPrograms: true,
    blurb: 'Chat with your broker, staff, informants and your mother.' },
  { id: 'word', title: 'MajorWord 98', icon: 'word', defaultSize: WIN, phase: 10, inPrograms: true,
    blurb: 'Quarterly client letters, in the tone of your choosing.' },
  { id: 'sheet', title: 'Exceed 98', icon: 'sheet', defaultSize: WIN, phase: 10, inPrograms: true,
    blurb: 'Spreadsheets for your portfolio, ledger and screener exports.' },
  { id: 'hr', title: 'PeopleSoftie HR', icon: 'hr', defaultSize: WIN, phase: 10, inPrograms: true,
    blurb: 'Hire analysts, traders, compliance officers and more.' },
  { id: 'rolodex', title: 'Rolodex', icon: 'rolodex', defaultSize: SMALL, phase: 10, inPrograms: true,
    blurb: 'Contact cards for everyone you have dealt with.' },
  { id: 'defrag', title: 'Portfolio Defragmenter', icon: 'defrag', defaultSize: WIN, phase: 10, inPrograms: true,
    blurb: 'Set target weights and defragment your holdings.' },
  { id: 'taskmangler', title: 'Task Mangler', icon: 'taskmangler', defaultSize: SMALL, phase: 10, inPrograms: true,
    blurb: 'Running rules, open orders and scheduled actions.' },
  { id: 'paint', title: 'MajorPaint', icon: 'paint', defaultSize: WIN, phase: 10, inPrograms: true,
    blurb: 'Pixel paint for wallpapers and logo emblems.' },
  { id: 'help', title: 'Doors Help', icon: 'help', defaultSize: { width: 560, height: 420 }, phase: 11,
    blurb: 'The Majorsoft Doors 98 manual.' },
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
}

export const DESKTOP_ICONS: DesktopIconDef[] = [
  ...(['mycomputer', 'browser', 'trade', 'mail'] as const).map((id) => ({ id, label: APPS[id].title, icon: APPS[id].icon, opens: id })),
  // Shortcut to Trade → Portfolio.
  { id: 'portfolio', label: 'My Portfolio', icon: 'portfolio', opens: 'trade', shortcut: true, tab: 'portfolio' },
  ...(['notepad', 'calculator', 'recyclebin', 'messenger', 'word', 'sheet', 'hr', 'rolodex', 'defrag', 'taskmangler', 'paint'] as const).map(
    (id) => ({ id, label: APPS[id].title, icon: APPS[id].icon, opens: id }),
  ),
];
