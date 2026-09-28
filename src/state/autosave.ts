import type { AutosaveEvery } from './prefs';

/** Whether a session's close is time to autosave (My Computer → Game): each day, each week's last close, or the first close of a month. */
export function autosaveDue(every: AutosaveEvery, close: { day: number; weekEnd: boolean }, previousClose: number | undefined): boolean {
  switch (every) {
    case 'day':
      return true;
    case 'week':
      return close.weekEnd;
    case 'month':
      return previousClose !== undefined && monthKey(close.day) !== monthKey(previousClose);
    case 'never':
      return false;
  }
}

const monthKey = (day: number) => {
  const d = new Date(day * 86_400_000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

/** The one slot of an Ironman game (spec §9), by world seed so that two Ironman worlds do not share a file. */
export function ironmanSlot(seed: string, firmName: string): { id: string; name: string } {
  return { id: `ironman-${seed}`, name: `${firmName} (Ironman)` };
}

