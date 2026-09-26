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
}

/** Selectable player firms; the ones the player doesn't pick become competitors (spec §6). */
export const PRESET_FIRMS: readonly PresetFirm[] = [
  { id: 'whiterock', name: 'WhiteRock', strategy: 'index' },
  { id: 'rearguard', name: 'Rearguard Group', strategy: 'index' },
  { id: 'jpborgan', name: 'J.P. Borgan Asset Management', strategy: 'balanced' },
  { id: 'silvermansacks', name: 'Silverman Sacks', strategy: 'momentum' },
  { id: 'organstanley', name: 'Organ Stanley', strategy: 'growth' },
  { id: 'fidelitea', name: 'Fidelitea Investments', strategy: 'stockPicking' },
  { id: 'citadull', name: 'Citadull', strategy: 'quant' },
  { id: 'bridgewader', name: 'Bridgewader Associates', strategy: 'macro' },
  { id: 'straightstreet', name: 'Straight Street Global', strategy: 'index' },
  { id: 'renaissauce', name: 'Renaissauce Technologies', strategy: 'quant' },
];
