import { DEFAULT_LOGO, encodeLogo } from '../art/logo/code';
import { ceoName, encodeCeo, randomCeo } from '../world/ceo';
import { Rng } from '../world/rng';

/** The player's firm and chief executive (spec §18 `player`), as codes. */
export interface Player {
  firmName: string;
  /** The preset firm (spec §6) the player runs, if any. */
  presetFirm?: string;
  logoCode: string;
  ceoName: string;
  ceoCode: string;
}

/** A firm with the default logo and a CEO drawn from the world seed. */
export function defaultPlayer(seed: string, firmName: string): Player {
  const ceo = randomCeo(Rng.stream(seed, 'player:ceo'));
  return { firmName, logoCode: encodeLogo(DEFAULT_LOGO), ceoName: ceoName(ceo), ceoCode: encodeCeo(ceo) };
}

/** The number on the CEO's ID badge, fixed by the world seed. */
export const employeeNumber = (seed: string) => String(Rng.stream(seed, 'badge').int(1, 99_999)).padStart(5, '0');
