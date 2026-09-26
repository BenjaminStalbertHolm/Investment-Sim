import type { LogoSpec } from '../art/logo/Logo';
import { PALETTES, type LogoFont, type LogoLayout, type LogoMotif, type LogoShape } from '../art/logo/options';

/** How an AI competitor invests (spec §6, §16). */
export type Strategy =
  | 'index'
  | 'balanced'
  | 'momentum'
  | 'growth'
  | 'value'
  | 'stockPicking'
  | 'quant'
  | 'macro'
  | 'activist';

export interface PresetFirm {
  id: string;
  name: string;
  strategy: Strategy;
  /** Logo direction (spec §6), in the logo system's own parts. */
  logo: { shape: LogoShape; motif: LogoMotif; palette: string; font: LogoFont; layout: LogoLayout };
  /** Chief executive: an invented person, never a real executive (spec §10.6). */
  ceo: string;
  /** Ticker of a listed parent: a player running this firm runs the parent's asset-management arm (spec §6). */
  parent?: string;
}

/** Selectable player firms; the ones the player doesn't pick become competitors (spec §6). */
export const PRESET_FIRMS: readonly PresetFirm[] = [
  { id: 'whiterock', name: 'WhiteRock', strategy: 'index',
    logo: { shape: 'square', motif: 'rock', palette: 'blackWhite', font: 'extended', layout: 'textInside' }, ceo: 'Margaret Holloway' },
  { id: 'rearguard', name: 'Rearguard Group', strategy: 'index',
    logo: { shape: 'none', motif: 'ship', palette: 'maroonCream', font: 'serif', layout: 'iconLeft' }, ceo: 'Desmond Achterberg' },
  { id: 'jpborgan', name: 'J.P. Borgan Asset Management', strategy: 'balanced',
    logo: { shape: 'square', motif: 'pillar', palette: 'chocolateCream', font: 'serif', layout: 'monogram' }, ceo: 'Walter Brinkerhoff', parent: 'JPB' },
  { id: 'silvermansacks', name: 'Silverman Sacks', strategy: 'momentum',
    logo: { shape: 'square', motif: 'coin', palette: 'skyNavy', font: 'serif', layout: 'textInside' }, ceo: 'Colette Varga', parent: 'SLVS' },
  { id: 'organstanley', name: 'Organ Stanley', strategy: 'growth',
    logo: { shape: 'none', motif: 'arrowUp', palette: 'navyWhite', font: 'sans', layout: 'textOnly' }, ceo: 'Harlan Oduya', parent: 'ORGS' },
  { id: 'fidelitea', name: 'Fidelitea Investments', strategy: 'stockPicking',
    logo: { shape: 'none', motif: 'teacup', palette: 'emeraldWhite', font: 'sans', layout: 'iconLeft' }, ceo: 'Priya Castellane' },
  { id: 'citadull', name: 'Citadull', strategy: 'quant',
    logo: { shape: 'square', motif: 'tower', palette: 'charcoalSilver', font: 'condensed', layout: 'iconLeft' }, ceo: 'Victor Lindqvist' },
  { id: 'bridgewader', name: 'Bridgewader Associates', strategy: 'macro',
    logo: { shape: 'none', motif: 'bridge', palette: 'tealWhite', font: 'serif', layout: 'iconLeft' }, ceo: 'Theodore Quist' },
  { id: 'straightstreet', name: 'Straight Street Global', strategy: 'index',
    logo: { shape: 'square', motif: 'arrowUp', palette: 'navyWhite', font: 'sans', layout: 'iconLeft' }, ceo: 'Rosalind Okafor' },
  { id: 'renaissauce', name: 'Renaissauce Technologies', strategy: 'quant',
    logo: { shape: 'roundedSquare', motif: 'saucepan', palette: 'purpleGold', font: 'pixel', layout: 'iconLeft' }, ceo: 'Ingrid Salazar-Moss' },
];

export const presetLogo = (firm: PresetFirm): LogoSpec => ({ ...firm.logo, palette: PALETTES.find((p) => p.id === firm.logo.palette)! });

/** The name a player runs a preset under: a listed bank's asset-management division ("Silverman Sacks Asset Management"). */
export const playerFirmName = (firm: PresetFirm) =>
  firm.parent && !firm.name.endsWith('Asset Management') ? `${firm.name} Asset Management` : firm.name;
