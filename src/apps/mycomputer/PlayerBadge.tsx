import { useMemo } from 'react';
import { Badge } from '../../art/badge/Badge';
import { decodeLogo } from '../../art/logo/code';
import { employeeNumber } from '../../sim/player';
import { useGame } from '../../state/game';
import { decodeCeo } from '../../world/ceo';
import { agedCeo } from '../../art/portrait/variants';
import { useModules } from '../../sites/hooks';

/** The player's logo and CEO, decoded from their codes; the CEO greyer for the drawdowns they have been through (Phase 10B). */
export function usePlayerLook() {
  const player = useGame((s) => s.player);
  const stress = useModules()?.gags?.stress ?? 0;
  // Ageing moves in visible steps, not every day.
  const step = Math.round(stress * 20) / 20;
  return useMemo(
    () => player && { logo: { ...decodeLogo(player.logoCode), emblem: player.emblem }, ceo: agedCeo(decodeCeo(player.ceoCode), step), player },
    [player, step],
  );
}

/** The player's ID badge (spec §8): at the end of Setup, in My Computer → Firm and on the firm's Leadership page. */
export function PlayerBadge() {
  const look = usePlayerLook();
  const seed = useGame((s) => s.seed);
  if (!look) return null;
  const { player, logo, ceo } = look;
  return (
    <Badge
      firmName={player.firmName}
      logo={logo}
      ceoName={player.ceoName}
      ceo={ceo}
      ceoCode={player.ceoCode}
      employeeNo={employeeNumber(seed)}
    />
  );
}
