import type { IconType } from 'react-icons';
import {
  GiAnchor, GiAtom, GiBearFace, GiBull, GiCog, GiCrown, GiEagleEmblem, GiFlame, GiFlatStar, GiGlobe, GiIonicColumn,
  GiKey, GiLion, GiMining, GiMountains, GiOakLeaf, GiOwl, GiPineTree, GiPowerLightning, GiProcessor, GiRock,
  GiSailboat, GiSaucepan, GiStoneBridge, GiStoneTower, GiSun, GiTeapot, GiTwoCoins, GiUpgrade, GiWaterDrop,
  GiWaveCrest, GiWheat,
} from 'react-icons/gi';
import type { LogoMotif } from './options';

/**
 * Logo motifs (spec §7) are silhouettes from game-icons.net (CC BY 3.0, credited in About and the README), which
 * read as 90s clip art at any size.
 */
export const MOTIF_ICONS: Record<LogoMotif, IconType> = {
  bull: GiBull,
  bear: GiBearFace,
  eagle: GiEagleEmblem,
  lion: GiLion,
  owl: GiOwl,
  tower: GiStoneTower,
  pillar: GiIonicColumn,
  globe: GiGlobe,
  arrowUp: GiUpgrade,
  rock: GiRock,
  mountain: GiMountains,
  ship: GiSailboat,
  anchor: GiAnchor,
  tree: GiPineTree,
  key: GiKey,
  crown: GiCrown,
  coin: GiTwoCoins,
  star: GiFlatStar,
  lightning: GiPowerLightning,
  wave: GiWaveCrest,
  sun: GiSun,
  bridge: GiStoneBridge,
  gear: GiCog,
  leaf: GiOakLeaf,
  flame: GiFlame,
  drop: GiWaterDrop,
  atom: GiAtom,
  chip: GiProcessor,
  wheat: GiWheat,
  pickaxe: GiMining,
  teacup: GiTeapot,
  saucepan: GiSaucepan,
};
