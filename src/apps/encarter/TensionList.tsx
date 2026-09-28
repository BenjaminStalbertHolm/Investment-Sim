import { formatDate } from '../../sim/calendar';
import { COUNTRY, PAIRS, RUNGS } from '../../sim/data/countries';
import type { ModulesView } from '../../sim/types';
import '../modules.css';

/** The pairs at odds and how far up the ladder each is (spec §16C.1): Encarter 98 and the news sites' tension meter. */
export function TensionList({ tensions, onOpen }: { tensions: NonNullable<ModulesView['geo']>['tensions']; onOpen?(id: string): void }) {
  return (
    <ul className="tension-list">
      {tensions.map((t) => {
        const p = PAIRS.find((x) => x.id === t.pair)!;
        return (
          <li key={t.pair}>
            <a onClick={() => onOpen?.(p.a)}>{COUNTRY[p.a].name}</a>
            {p.a !== p.b && (
              <>
                {' '}
                ↔ <a onClick={() => onOpen?.(p.b)}>{COUNTRY[p.b].name}</a>
              </>
            )}
            : <span className="tension-bar" title={RUNGS[t.rung]}>{'▮'.repeat(t.rung) + '▯'.repeat(5 - t.rung)}</span> {RUNGS[t.rung]} since {formatDate(t.since)}
          </li>
        );
      })}
    </ul>
  );
}
