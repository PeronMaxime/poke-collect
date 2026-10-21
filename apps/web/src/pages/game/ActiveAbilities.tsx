import type { ReactNode } from 'react';
import { abilityEffectText, activityAbilityEffects, effectiveAbility } from '@poke/game-core';
import type { AbilityEnv, GameContext } from '@poke/game-core';
import type { PokemonDto } from '@poke/shared';
import { PokemonSprite } from '../../components/ui';
import { abilityLabel, speciesName } from '../../lib/labels';

/**
 * Talents de l'équipe qui agissent dans l'activité : porteur, talent et effets actifs.
 * `members` = équipe de `env`, dans le même ordre ; sans talent actif, affiche `empty`.
 */
export function ActiveAbilities({
  ctx,
  env,
  members,
  className = '',
  empty = null,
}: {
  ctx: GameContext;
  env: AbilityEnv;
  members: readonly (PokemonDto | undefined)[];
  className?: string;
  empty?: ReactNode;
}) {
  const active = activityAbilityEffects(ctx, env);
  const holders = [...new Set(active.map((a) => a.holder))];
  if (holders.length === 0) return empty;
  return (
    <ul className={`space-y-1 ${className}`}>
      {holders.map((holder) => {
        const p = members[holder];
        if (!p) return null;
        const effects = active.filter((a) => a.holder === holder).map((a) => a.effect);
        return (
          <li key={p.id} className="flex items-start gap-1.5">
            <PokemonSprite
              speciesId={p.speciesId}
              formId={p.formId}
              shiny={p.isShiny}
              size={24}
              className="shrink-0"
            />
            <span>
              <span className="font-medium">
                {speciesName(ctx, p.speciesId, p.formId)} · {abilityLabel(effectiveAbility(ctx, p))}
              </span>
              <span className="text-emerald-700 dark:text-emerald-400">
                {' '}
                : {effects.map(abilityEffectText).join(' · ')}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
