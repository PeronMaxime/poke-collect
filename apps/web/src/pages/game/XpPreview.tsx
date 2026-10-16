import type { ReactNode } from 'react';
import { applyTeamXp, playerBonuses } from '@poke/game-core';
import type { GameContext, PlayerBonuses, TeamMember } from '@poke/game-core';
import { PokemonSprite } from '../../components/ui';
import { useClaimedRewards } from '../../lib/game';

/** Bonus permanents du joueur (paliers, collections), pour les aperçus. */
export function usePlayerBonuses(ctx: GameContext): PlayerBonuses {
  return playerBonuses(ctx, useClaimedRewards());
}

export const formatXp = (xp: number) => `${xp.toLocaleString('fr-FR')} XP`;

/**
 * XP que gagnera chaque membre de l'équipe, avec le niveau qu'il atteindra (plafonné au
 * niveau maximal, comme à la résolution).
 */
export function XpPreview({
  ctx,
  members,
  xp,
  children,
}: {
  ctx: GameContext;
  members: readonly TeamMember[];
  /** XP par membre, celle utilisée pour les niveaux atteints. */
  xp: number;
  /** Texte de l'XP gagnée (estimation, victoire / défaite…). */
  children: ReactNode;
}) {
  const results = applyTeamXp(ctx, members, xp, 0);
  return (
    <div className="mt-3">
      <p className="text-sm">
        <span className="font-semibold">XP gagnée :</span> {children}
      </p>
      {members.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {members.map((p, i) => {
            const r = results[i]!;
            return (
              <li
                key={p.id}
                className="flex items-center gap-1 rounded-full border border-slate-200 py-0.5 pr-2.5 pl-0.5 text-xs dark:border-slate-700"
                title={`+${formatXp(r.xpGained)}`}
              >
                <PokemonSprite
                  speciesId={p.speciesId}
                  formId={p.formId}
                  shiny={p.isShiny}
                  size={28}
                />
                N.{r.levelBefore}
                {r.levelAfter > r.levelBefore ? (
                  <>
                    {' → '}
                    <strong className="text-emerald-600">N.{r.levelAfter}</strong>
                  </>
                ) : r.xpGained === 0 && xp > 0 ? (
                  <span className="text-slate-500">(max)</span>
                ) : (
                  <span className="text-slate-500">+{formatXp(r.xpGained)}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
