// Staff (spec §4A PeopleSoftie HR) and offices (spec §14.2 Greg's List). Data only: sim/staff.ts hires, pays and loses
// people; apps/hr and sites/lifestyle show them.

export type Role = 'analyst' | 'trader' | 'compliance' | 'pr' | 'it' | 'assistant';

export interface RoleSpec {
  id: Role;
  title: string;
  /** A year's salary for someone of middling skill. */
  salary: number;
  /** What they do for the firm (spec §4A). */
  duty: string;
}

export const ROLES: readonly RoleSpec[] = [
  { id: 'analyst', title: 'Research Analyst', salary: 95_000, duty: 'Writes a research report every week. The better the analyst, the more often the call is right.' },
  { id: 'trader', title: 'Trader', salary: 120_000, duty: 'Runs your automated rules: stop-losses, dollar-cost averaging and monthly rebalancing.' },
  { id: 'compliance', title: 'Compliance Officer', salary: 85_000, duty: 'Cools the regulator’s interest faster and warns you before a mandate is breached.' },
  { id: 'pr', title: 'PR Manager', salary: 90_000, duty: 'Softens the damage of scandals and exposés, bribes included.' },
  { id: 'it', title: 'IT Admin', salary: 70_000, duty: 'Keeps hackers out of the firm’s computers and web site.' },
  { id: 'assistant', title: 'Executive Assistant', salary: 38_000, duty: 'Files your junk mail where it belongs, unread.' },
];

export const ROLE = Object.fromEntries(ROLES.map((r) => [r.id, r])) as Record<Role, RoleSpec>;

export interface OfficeSpec {
  id: string;
  name: string;
  address: string;
  /** Rent a month, and the staff it holds (the CEO aside). */
  rent: number;
  capacity: number;
  /** What the address does for the firm's standing with prospective clients (spec §14.2: it affects reputation). */
  prestige: number;
  blurb: string;
}

/** Greg's List's offices, from the garage up (spec §14.2). A new firm starts in the garage. */
export const OFFICES: readonly OfficeSpec[] = [
  { id: 'garage', name: 'The Garage', address: 'Behind Mom’s house', rent: 500, capacity: 2, prestige: 0,
    blurb: 'Room for two desks between the lawnmower and the chest freezer. Rent goes to Mom.' },
  { id: 'stripMall', name: 'Strip-Mall Suite', address: 'Unit 4B, Plaza del Sol (between the nail salon and the tax preparer)', rent: 4_000, capacity: 6, prestige: 3,
    blurb: 'Carpeted, air-conditioned and a short walk from three kinds of pizza.' },
  { id: 'downtown', name: 'Downtown Floor', address: '31st floor, One Financial Square', rent: 25_000, capacity: 15, prestige: 8,
    blurb: 'A whole floor with a view of the river, a boardroom and a receptionist who says the firm’s name like it matters.' },
  { id: 'penthouse', name: 'Penthouse Tower', address: 'Floors 60–62, Meridian Tower', rent: 120_000, capacity: 40, prestige: 15,
    blurb: 'Marble lobby, private elevator, helipad. Clients take the meeting before they hear the pitch.' },
];

/** Applicants on Monstrous.com at a time, and weeks an advert stays up. */
export const BOARD_SIZE = 8;
export const ADVERT_WEEKS = 3;
/** Months of salary owed before an unpaid employee walks out; severance on dismissal, in months. */
export const UNPAID_MONTHS = 2;
export const SEVERANCE_MONTHS = 1;
/** Loyalty below which someone quits, and below which they may blow the whistle when heat is at least WHISTLE_HEAT. */
export const QUIT_LOYALTY = 0.12;
export const WHISTLE_LOYALTY = 0.3;
export const WHISTLE_HEAT = 50;
/** A rival's offer to one of your people: the raise it promises, and trading days to answer. */
export const POACH_RAISE: readonly [number, number] = [0.2, 0.45];
export const POACH_DAYS = 5;
/** Attacks on the firm's computers (IT Admin): the monthly chance, and what gets through costs. */
export const HACK_CHANCE = 0.04;
export const HACK_REPUTATION = 3;
