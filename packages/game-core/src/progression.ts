import { DEX_FORM_SECTIONS, forms, speciesForms } from '@poke/data';
import type { FormKind, PokemonForm } from '@poke/data';
import type { Collection, PermanentBonusType, ProgressReward } from '@poke/content';
import { claimableCompletionCount, claimedCompletionRewards } from './completion';
import type { GameContext } from './context';
import type { DexProgress } from './progress';

/**
 * Progression : collections thématiques, quêtes et complétions d'expédition. Leurs récompenses
 * (objets, argent, emplacements, bonus permanents) s'obtiennent en les réclamant ; tout se calcule
 * paresseusement à partir du Pokédex et des récompenses déjà réclamées.
 */

export type RewardKind = 'collection' | 'completion';

/** Récompenses déjà réclamées par le joueur. */
export interface ClaimedRewards {
  collectionIds: ReadonlySet<string>;
  /** Quêtes dont la récompense a été réclamée ; absent : aucune. */
  questIds?: ReadonlySet<string>;
  /** Complétions d'expédition réclamées (`completion:expédition|région`) ; absent : aucune. */
  completionIds?: ReadonlySet<string>;
}

/** Espèces capturées (Pokédex normal) et capturées en version shiny (Pokédex shiny). */
export interface DexCatches {
  caughtSpeciesIds: ReadonlySet<number>;
  /** Absent : Pokédex shiny vide. */
  caughtShinySpeciesIds?: ReadonlySet<number>;
  /** Formes capturées (collections de formes) ; absent : aucune. */
  caughtFormIds?: ReadonlySet<number>;
  /** Formes capturées en version shiny (complétion chromatique des expéditions) ; absent : aucune. */
  caughtShinyFormIds?: ReadonlySet<number>;
}

export const NO_CLAIMS: ClaimedRewards = { collectionIds: new Set() };

/** Espèces d'un Pokédex : une région, ou toutes les régions (Pokédex national). */
export function dexSpeciesIds(ctx: GameContext, regionId: string | null): number[] {
  if (regionId !== null) return ctx.region(regionId)?.speciesIds ?? [];
  return [...new Set(ctx.regions.flatMap((r) => r.speciesIds))];
}

const DEX_FORM_KINDS: ReadonlySet<FormKind> = new Set(DEX_FORM_SECTIONS.map((s) => s.kind));

/**
 * Formes qui ont leur case au Pokédex (sections de formes : régionales, Méga…), parmi celles de
 * `speciesIds` (toutes sans liste). Comptées dans le total du Pokédex et dans les classements,
 * pas dans `dexProgress`.
 */
export function dexForms(speciesIds?: readonly number[]): PokemonForm[] {
  const list = speciesIds ? speciesIds.flatMap((id) => speciesForms(id)) : forms;
  return list.filter((f) => DEX_FORM_KINDS.has(f.kind));
}

export function dexProgress(
  ctx: GameContext,
  regionId: string | null,
  progress: DexCatches,
  shiny = false,
): DexProgress {
  const ids = dexSpeciesIds(ctx, regionId);
  const owned = shiny
    ? (progress.caughtShinySpeciesIds ?? new Set<number>())
    : progress.caughtSpeciesIds;
  const caught = ids.filter((id) => owned.has(id)).length;
  return { caught, total: ids.length, percent: ids.length ? (caught / ids.length) * 100 : 0 };
}

/** Espèces (forme par défaut) et formes capturées d'une collection. */
export function collectionProgress(
  collection: Collection,
  progress: Pick<DexCatches, 'caughtSpeciesIds' | 'caughtFormIds'>,
): { caught: number; total: number; complete: boolean } {
  const speciesIds = [...new Set(collection.speciesIds)];
  const formIds = [...new Set(collection.formIds)];
  const caught =
    speciesIds.filter((id) => progress.caughtSpeciesIds.has(id)).length +
    formIds.filter((id) => progress.caughtFormIds?.has(id)).length;
  const total = speciesIds.length + formIds.length;
  return { caught, total, complete: caught === total };
}

export function sortedCollections(ctx: GameContext): Collection[] {
  return [...ctx.content.collections].sort((a, b) => a.order - b.order);
}

export type RewardState = 'locked' | 'claimable' | 'claimed';

export function collectionState(
  collection: Collection,
  progress: Pick<DexCatches, 'caughtSpeciesIds' | 'caughtFormIds'>,
  claimed: ClaimedRewards,
): RewardState {
  if (claimed.collectionIds.has(collection.id)) return 'claimed';
  return collectionProgress(collection, progress).complete ? 'claimable' : 'locked';
}

/** Nombre de récompenses prêtes à être réclamées (pastille du menu). */
export function claimableRewardCount(
  ctx: GameContext,
  progress: DexCatches,
  claimed: ClaimedRewards,
): number {
  return (
    ctx.content.collections.filter((c) => collectionState(c, progress, claimed) === 'claimable')
      .length + claimableCompletionCount(ctx, progress, claimed)
  );
}

/**
 * Récompenses réclamées encore présentes dans le contenu (une récompense supprimée ne compte
 * plus) : collections, quêtes et complétions d'expédition.
 */
function claimedRewardList(ctx: GameContext, claimed: ClaimedRewards): ProgressReward[] {
  return [
    ...[
      ...ctx.content.collections.filter((c) => claimed.collectionIds.has(c.id)),
      ...ctx.quests.filter((q) => claimed.questIds?.has(q.id)),
    ].map((r) => r.rewards),
    ...claimedCompletionRewards(ctx, claimed),
  ];
}

/** Couveuses entières gagnées par les récompenses réclamées. */
export function claimedIncubators(ctx: GameContext, claimed: ClaimedRewards): number {
  return claimedRewardList(ctx, claimed).reduce((sum, r) => sum + r.incubators, 0);
}

export interface PlayerSlots {
  expeditions: number;
  daycare: number;
}

/**
 * Emplacements du joueur : valeur de départ + récompenses réclamées, sans les paliers des
 * bâtiments ni le maximum des expéditions (voir `facilityPlaces`).
 */
export function playerSlots(ctx: GameContext, claimed: ClaimedRewards): PlayerSlots {
  const rewards = claimedRewardList(ctx, claimed);
  const total = (key: 'expeditionSlots' | 'daycareSlots') =>
    rewards.reduce((sum, r) => sum + r[key], 0);
  const { expeditions, daycare } = ctx.balance;
  return {
    expeditions: expeditions.initialSlots + total('expeditionSlots'),
    daycare: daycare.initialSlots + total('daycareSlots'),
  };
}

/** Multiplicateurs permanents (1 = aucun bonus), cumulés de façon additive. */
export type PlayerBonuses = Record<PermanentBonusType, number>;

export const NO_BONUSES: PlayerBonuses = { capture: 1, xp: 1, money: 1, shiny: 1 };

export function playerBonuses(ctx: GameContext, claimed: ClaimedRewards): PlayerBonuses {
  const bonuses = { ...NO_BONUSES };
  for (const reward of claimedRewardList(ctx, claimed)) {
    for (const b of reward.bonuses) bonuses[b.type] += b.percent / 100;
  }
  return bonuses;
}
