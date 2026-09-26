import { useMemo } from 'react';
import { Badge } from '../../art/badge/Badge';
import { decodeLogo } from '../../art/logo/code';
import { employeeNumber } from '../../sim/player';
import { useGame } from '../../state/game';
import { decodeCeo } from '../../world/ceo';

/** The player's logo and CEO, decoded from their codes. */
export function usePlayerLook() {
  const player = useGame((s) => s.player);
  return useMemo(() => player && { logo: decodeLogo(player.logoCode), ceo: decodeCeo(player.ceoCode), player }, [player]);
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
