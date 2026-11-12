/**
 * Conditions de départ d'une équipe : celles qu'elle remplit et son état d'ensemble.
 */
import type { ReactNode } from 'react';
import type { ExpeditionSite, GameContext } from '@poke/game-core';
import type { PokemonDto } from '@poke/shared';
import { TypeBadge } from '../../../components/ui';
import { typeLabel } from '../../../lib/labels';

/**
 * Conditions du lieu et de l'activité que l'équipe remplit (PE minimal, types requis, niveau
 * maximal, types interdits) ; aucune tant que l'équipe est vide.
 */
export function teamConditions(
  ctx: GameContext,
  zone: ExpeditionSite,
  members: readonly PokemonDto[],
  power: number,
  maxLevel: number | null,
  forbidden: ReadonlySet<string>,
) {
  const memberTypes = members.map((p) => ctx.species(p.speciesId, p.formId)?.types ?? []);
  const met: { key: string; text: ReactNode }[] = [];
  if (members.length > 0) {
    if (zone.minPower > 0 && power >= zone.minPower) {
      met.push({ key: 'power', text: `PE ${power} / ${zone.minPower}` });
    }
    for (const r of zone.requiredTypes) {
      if (memberTypes.filter((t) => t.includes(r.type)).length >= r.count) {
        met.push({
          key: `type-${r.type}`,
          text: (
            <span className="inline-flex items-center gap-1">
              {r.count} × <TypeBadge type={r.type} />
            </span>
          ),
        });
      }
    }
    if (maxLevel !== null && members.every((p) => p.level <= maxLevel)) {
      met.push({ key: 'level', text: `Niveau ${maxLevel} maximum` });
    }
    if (forbidden.size > 0 && !memberTypes.some((t) => t.some((x) => forbidden.has(x)))) {
      met.push({
        key: 'forbidden',
        text: `Sans type ${[...forbidden].map(typeLabel).join(', ')}`,
      });
    }
  }
  return met;
}

/** État affiché en bas de la fenêtre : équipe vide, première règle non respectée, ou prête. */
export function teamStatus(size: number, errors: readonly string[]) {
  return size === 0
    ? { tone: 'idle' as const, text: 'Choisis ton équipe' }
    : errors.length > 0
      ? { tone: 'bad' as const, text: errors[0]! }
      : { tone: 'ok' as const, text: 'Équipe prête' };
}
