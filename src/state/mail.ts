import { create } from 'zustand';
import type { Folder } from '../sim/mail';

export type MailFolder = Folder | 'deleted';
export type MailSort = 'date' | 'from' | 'subject';

/** Outbox Express's view (spec §15 UI): saved with the game. */
export interface MailView {
  folder: MailFolder;
  sort: { by: MailSort; ascending: boolean };
  /** Junk mail goes to the Junk folder; off, it lands in the Inbox (spec §15.7). */
  junkFilter: boolean;
  selected?: number;
}

export const newMailView = (): MailView => ({ folder: 'inbox', sort: { by: 'date', ascending: false }, junkFilter: true });

export const useMailView = create<MailView>()(() => newMailView());
