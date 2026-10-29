import type { ExpeditionCompletion, ProgressReward, Region, Zone } from '@poke/content';
import type { GameContext } from './context';
import type { ClaimedRewards, DexCatches, RewardState } from './progression';

/**
 * Complétion des expéditions : une expédition est complétée quand chaque Pokémon de ses
 * rencontres (espèce, ou forme pour une rencontre de forme) est capturé, en version chromatique
 * pour une complétion chromatique. Les récompenses de `balance.expeditionCompletions` se
 * réclament une fois par expédition ou par région complétée (évaluation paresseuse à partir du
 * Pokédex, comme les paliers).
 */

/** Pokémon distincts d'une expédition (espèces activées), dans l'ordre des rencontres. */
export function zoneCompletionPokemon(
  ctx: GameContext,
  zone: Zone,
): { speciesId: number; formId: number | null }[] {
  const seen = new Map<string, { speciesId: number; formId: number | null }>();
  for (const e of zone.encounters) {
    if (!ctx.species(e.speciesId)?.enabled) continue;
    const formId = e.formId ?? null;
    seen.set(`${e.speciesId}:${formId ?? ''}`, { speciesId: e.speciesId, formId });
  }
  return [...seen.values()];
}

/** Pokémon d'une expédition capturés (en chromatique avec `shiny`). */
export function zoneCompletion(
  ctx: GameContext,
  zone: Zone,
  catches: DexCatches,
  shiny: boolean,
): { caught: number; total: number; complete: boolean } {
  const list = zoneCompletionPokemon(ctx, zone);
  const species = shiny ? catches.caughtShinySpeciesIds : catches.caughtSpeciesIds;
  const forms = shiny ? catches.caughtShinyFormIds : catches.caughtFormIds;
  const caught = list.filter(({ speciesId, formId }) =>
    formId != null ? (forms?.has(formId) ?? false) : (species?.has(speciesId) ?? false),
  ).length;
  return { caught, total: list.length, complete: list.length > 0 && caught === list.length };
}

/** Expéditions comptées dans une complétion : activées et avec au moins un Pokémon. */
export function completableZones(ctx: GameContext, regionId: string | null): Zone[] {
  return ctx.zones.filter(
    (z) =>
      z.enabled &&
      (regionId === null || z.regionId === regionId) &&
      zoneCompletionPokemon(ctx, z).length > 0,
  );
}

/** Expéditions complétées d'une région, sur le total. */
export function regionCompletion(
  ctx: GameContext,
  regionId: string,
  catches: DexCatches,
  shiny: boolean,
): { caught: number; total: number; complete: boolean } {
  const zones = completableZones(ctx, regionId);
  const caught = zones.filter((z) => zoneCompletion(ctx, z, catches, shiny).complete).length;
  return { caught, total: zones.length, complete: zones.length > 0 && caught === zones.length };
}

export type CompletionTarget =
  { kind: 'zone'; id: string; zone: Zone } | { kind: 'region'; id: string; region: Region };

export function expeditionCompletions(ctx: GameContext): ExpeditionCompletion[] {
  return ctx.balance.expeditionCompletions ?? [];
}

/** Expéditions ou régions qui donnent chacune la récompense. */
export function completionTargets(
  ctx: GameContext,
  completion: ExpeditionCompletion,
): CompletionTarget[] {
  if (completion.scope === 'region') {
    return ctx.regions
      .filter((r) => completion.regionId === null || r.id === completion.regionId)
      .filter((r) => completableZones(ctx, r.id).length > 0)
      .map((region) => ({ kind: 'region', id: region.id, region }));
  }
  return completableZones(ctx, completion.regionId)
    .filter((z) => completion.zoneId === null || z.id === completion.zoneId)
    .map((zone) => ({ kind: 'zone', id: zone.id, zone }));
}

/** Identifiant de la récompense réclamée : complétion + expédition ou région. */
export const completionRewardId = (completionId: string, targetId: string) =>
  `${completionId}:${targetId}`;

export function isCompletionReached(
  ctx: GameContext,
  completion: ExpeditionCompletion,
  targetId: string,
  catches: DexCatches,
): boolean {
  if (completion.scope === 'region') {
    return regionCompletion(ctx, targetId, catches, completion.shiny).complete;
  }
  const zone = ctx.zone(targetId);
  return !!zone && zoneCompletion(ctx, zone, catches, completion.shiny).complete;
}

export function completionState(
  ctx: GameContext,
  completion: ExpeditionCompletion,
  targetId: string,
  catches: DexCatches,
  claimed: ClaimedRewards,
): RewardState {
  if (claimed.completionIds?.has(completionRewardId(completion.id, targetId))) return 'claimed';
  return isCompletionReached(ctx, completion, targetId, catches) ? 'claimable' : 'locked';
}

/** Récompenses de complétion prêtes à être réclamées. */
export function claimableCompletionCount(
  ctx: GameContext,
  catches: DexCatches,
  claimed: ClaimedRewards,
): number {
  return expeditionCompletions(ctx).reduce(
    (sum, c) =>
      sum +
      completionTargets(ctx, c).filter(
        (t) => completionState(ctx, c, t.id, catches, claimed) === 'claimable',
      ).length,
    0,
  );
}

/**
 * Récompenses de complétion réclamées encore présentes dans le contenu (une complétion
 * supprimée ne compte plus), une par expédition ou région réclamée.
 */
export function claimedCompletionRewards(
  ctx: GameContext,
  claimed: ClaimedRewards,
): ProgressReward[] {
  if (!claimed.completionIds?.size) return [];
  const byId = new Map(expeditionCompletions(ctx).map((c) => [c.id, c]));
  return [...claimed.completionIds].flatMap((rewardId) => {
    const completion = byId.get(rewardId.slice(0, rewardId.indexOf(':')));
    return completion ? [completion.rewards] : [];
  });
}
