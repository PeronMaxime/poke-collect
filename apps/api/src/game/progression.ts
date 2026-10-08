import { and, eq, sql } from 'drizzle-orm';
import { playerProfiles, pokemon, rewardClaims } from '@poke/db';
import type { Db } from '@poke/db';
import {
  applyItemToPokemon,
  checkEvolution,
  collectionProgress,
  evolutionOptions,
  evolvePokemon,
  isMilestoneReached,
  localHour,
  playerSlots,
} from '@poke/game-core';
import type { PlayerSlots } from '@poke/game-core';
import type { ProgressReward } from '@poke/content';
import type { ClaimRewardInput, EvolveInput, UseItemInput } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { GameError } from './errors';
import { requireStartedProfile } from './expeditions';
import {
  addItems,
  assertAvailable,
  claimedRewards,
  dexCatches,
  itemQuantity,
  pokemonActivities,
  recordPokedex,
  takeItems,
  toInstance,
} from './store';
import type { PokemonRow } from './store';

/** Évolutions et récompenses de progression (paliers du Pokédex, collections). */

/**
 * Fait évoluer un Pokémon disponible : vérifie l'évolution choisie (niveau, objet, bonheur,
 * heure locale du joueur), consomme l'objet éventuel et enregistre la nouvelle espèce au Pokédex.
 */
export async function evolve(
  db: Db,
  content: ContentCache,
  userId: string,
  pokemonId: string,
  input: EvolveInput,
  now: Date,
): Promise<{
  row: PokemonRow;
  fromSpeciesId: number;
  fromFormId: number | null;
  consumedItemId: string | null;
  newSpeciesIds: number[];
}> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(pokemon)
      .where(and(eq(pokemon.id, pokemonId), eq(pokemon.ownerId, userId)));
    if (!row) throw new GameError(404, 'POKEMON_NOT_FOUND');
    await assertAvailable(tx, userId, [row], now);

    const option = evolutionOptions(ctx, row.speciesId, row.formId).find(
      (o) =>
        o.toSpeciesId === input.toSpeciesId &&
        (input.toFormId === undefined || o.toFormId === input.toFormId),
    );
    if (!option) throw new GameError(400, 'EVOLUTION_NOT_FOUND');
    const itemIds = [...new Set(option.methods.flatMap((m) => (m.itemId ? [m.itemId] : [])))];
    const stock = new Map(
      await Promise.all(
        itemIds.map(async (id) => [id, await itemQuantity(tx, userId, id)] as const),
      ),
    );
    const instance = toInstance(row);
    const check = checkEvolution(ctx, instance, option, {
      itemQuantity: (id) => stock.get(id) ?? 0,
      hour: localHour(now, input.utcOffsetMinutes),
    });
    if (!check.method) {
      throw new GameError(409, 'EVOLUTION_NOT_READY', {
        missing: check.methods.map((m) => m.missing),
      });
    }
    const consumedItemId = check.method.itemId;
    if (consumedItemId && !(await takeItems(tx, userId, consumedItemId, 1))) {
      throw new GameError(409, 'STOCK_CHANGED');
    }

    const evolved = evolvePokemon(ctx, instance, option.toSpeciesId, option.toFormId);
    // Verrou optimiste : une seule évolution passe si deux demandes arrivent en même temps.
    const [updated] = await tx
      .update(pokemon)
      .set({
        speciesId: evolved.speciesId,
        formId: evolved.formId ?? null,
        ability: evolved.ability,
        xp: evolved.xp,
      })
      .where(and(eq(pokemon.id, row.id), eq(pokemon.speciesId, row.speciesId)))
      .returning();
    if (!updated) throw new GameError(409, 'POKEMON_CHANGED');

    const newSpeciesIds = await recordPokedex(tx, userId, {
      seen: [evolved.speciesId],
      caught: [updated],
      at: now,
    });
    return {
      row: updated,
      fromSpeciesId: row.speciesId,
      fromFormId: row.formId,
      consumedItemId,
      newSpeciesIds,
    };
  });
}

/**
 * Réclame la récompense d'un palier du Pokédex atteint ou d'une collection complète (une seule
 * fois) : objets et argent crédités, emplacements et bonus permanents actifs dès maintenant.
 */
export async function claimReward(
  db: Db,
  content: ContentCache,
  userId: string,
  input: ClaimRewardInput,
  now: Date,
): Promise<{ rewards: ProgressReward; currency: number; slots: PlayerSlots }> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  const milestone =
    input.kind === 'milestone'
      ? ctx.content.dexMilestones.find((m) => m.id === input.rewardId)
      : undefined;
  const collection =
    input.kind === 'collection'
      ? ctx.content.collections.find((c) => c.id === input.rewardId)
      : undefined;
  const reward = milestone ?? collection;
  if (!reward) throw new GameError(404, 'REWARD_NOT_FOUND');

  return db.transaction(async (tx) => {
    const progress = await dexCatches(tx, userId);
    const reached = milestone
      ? isMilestoneReached(ctx, milestone, progress)
      : collectionProgress(collection!, progress).complete;
    if (!reached) throw new GameError(409, 'REWARD_LOCKED');

    const inserted = await tx
      .insert(rewardClaims)
      .values({
        ownerId: userId,
        kind: input.kind,
        rewardId: reward.id,
        contentVersionId: ctx.content.versionId,
        claimedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) throw new GameError(409, 'ALREADY_CLAIMED');

    const { rewards } = reward;
    await addItems(tx, userId, rewards.items);
    const [profile] = await tx
      .update(playerProfiles)
      .set({ currency: sql`${playerProfiles.currency} + ${rewards.currency}` })
      .where(eq(playerProfiles.userId, userId))
      .returning({ currency: playerProfiles.currency });
    const slots = playerSlots(ctx, await claimedRewards(tx, userId));
    return { rewards, currency: profile?.currency ?? 0, slots };
  });
}

/**
 * Utilise un objet endgame sur un Pokémon (Capsule, Aromate, Pilule / Patch Talent) : refusé s'il
 * serait sans effet ; l'objet est consommé. Possible même K.O., pas pendant une activité.
 */
export async function useItemOnPokemon(
  db: Db,
  content: ContentCache,
  userId: string,
  pokemonId: string,
  input: UseItemInput,
): Promise<{ row: PokemonRow; remaining: number }> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(pokemon)
      .where(and(eq(pokemon.id, pokemonId), eq(pokemon.ownerId, userId)));
    if (!row) throw new GameError(404, 'POKEMON_NOT_FOUND');
    if ((await pokemonActivities(tx, userId)).has(row.id)) throw new GameError(409, 'POKEMON_BUSY');

    const result = applyItemToPokemon(
      ctx,
      { ...toInstance(row), originalNature: row.nature },
      input.itemId,
      { stat: input.stat, ability: input.ability },
    );
    if ('error' in result) throw new GameError(400, result.error);
    if (!(await takeItems(tx, userId, input.itemId, 1))) throw new GameError(409, 'ITEM_MISSING');

    const { ivs, natureOverride, ability } = result.patch;
    const [updated] = await tx
      .update(pokemon)
      .set({
        ...(ivs && {
          ivHp: ivs.hp,
          ivAtk: ivs.attack,
          ivDef: ivs.defense,
          ivSpa: ivs['special-attack'],
          ivSpd: ivs['special-defense'],
          ivSpe: ivs.speed,
        }),
        ...(natureOverride !== undefined && { natureOverride }),
        ...(ability && { ability }),
      })
      .where(eq(pokemon.id, row.id))
      .returning();
    return { row: updated!, remaining: await itemQuantity(tx, userId, input.itemId) };
  });
}
