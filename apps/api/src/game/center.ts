import { and, eq, gt, inArray } from 'drizzle-orm';
import { pokemon } from '@poke/db';
import type { Db } from '@poke/db';
import { abilityHolder, assistantSlotOf, healMinutes } from '@poke/game-core';
import type { ContentCache } from '../content-cache';
import { assistantHolders } from './assistants';
import { GameError } from './errors';
import { requireStartedProfile } from './expeditions';
import { playerFacilityPlaces, takeItems, toInstance } from './store';
import type { PokemonRow } from './store';

/**
 * Centre Pokémon : un Pokémon mis K.O. en combat y est soigné, dans la limite des places
 * (places débloquées, 6 par Centre). Il occupe une place (`healSlot` ; l'assistant de son
 * Centre agit sur la durée) jusqu'à `healUntil`, puis il est de nouveau libre : rien à récupérer,
 * la place se libère d'elle-même. Un Rappel (objet `revive`) le ranime aussitôt.
 */

async function knockedOutRows(tx: Db, userId: string, ids: readonly string[]) {
  const unique = [...new Set(ids)];
  const rows = await tx
    .select()
    .from(pokemon)
    .where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, unique)));
  if (rows.length !== unique.length) throw new GameError(404, 'POKEMON_NOT_FOUND');
  if (rows.some((r) => !r.knockedOut)) throw new GameError(409, 'POKEMON_NOT_KO');
  // Dans l'ordre de la demande.
  return unique.map((id) => rows.find((r) => r.id === id)!);
}

/** Dépose des Pokémon K.O. au Centre Pokémon (tous, ou aucun s'il n'y a pas assez de place). */
export async function healPokemon(
  db: Db,
  content: ContentCache,
  userId: string,
  ids: readonly string[],
  now: Date,
): Promise<PokemonRow[]> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  return db.transaction(async (tx) => {
    const rows = await knockedOutRows(tx, userId, ids);
    const places = await playerFacilityPlaces(tx, ctx, userId, 'center');

    // Premières places libres, dans l'ordre des Pokémon demandés.
    const taken = new Set(
      (
        await tx
          .select({ slot: pokemon.healSlot })
          .from(pokemon)
          .where(and(eq(pokemon.ownerId, userId), gt(pokemon.healUntil, now)))
      ).map((r) => r.slot),
    );
    const free = Array.from({ length: places }, (_, i) => i).filter((i) => !taken.has(i));
    if (rows.length > free.length) throw new GameError(409, 'CENTER_FULL');

    const helpers = await assistantHolders(tx, userId, 'center');
    const healed: PokemonRow[] = [];
    for (const [i, row] of rows.entries()) {
      const slot = free[i]!;
      // L'assistant de son Centre (6 places chacun) agit sur la durée des soins.
      const helper = helpers.get(assistantSlotOf('center', slot)) ?? null;
      const minutes = healMinutes(ctx, abilityHolder(toInstance(row)), helper);
      // Verrou : un Pokémon déjà soigné par une autre demande n'est pas soigné deux fois.
      const [updated] = await tx
        .update(pokemon)
        .set({
          knockedOut: false,
          healUntil: new Date(now.getTime() + minutes * 60_000),
          healSlot: slot,
        })
        .where(and(eq(pokemon.id, row.id), eq(pokemon.knockedOut, true)))
        .returning();
      if (!updated) throw new GameError(409, 'POKEMON_NOT_KO');
      healed.push(updated);
    }
    return healed;
  });
}

/** Ranime des Pokémon K.O. avec un objet `revive` chacun (tous, ou aucun s'il en manque). */
export async function revivePokemon(
  db: Db,
  content: ContentCache,
  userId: string,
  itemId: string,
  ids: readonly string[],
): Promise<PokemonRow[]> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  if (!ctx.itemEffect(itemId, 'revive')) throw new GameError(400, 'NOT_A_REVIVE');
  return db.transaction(async (tx) => {
    const rows = await knockedOutRows(tx, userId, ids);
    if (!(await takeItems(tx, userId, itemId, rows.length))) {
      throw new GameError(409, 'ITEM_MISSING', { itemId });
    }
    const revived = await tx
      .update(pokemon)
      .set({ knockedOut: false })
      .where(
        and(
          eq(pokemon.ownerId, userId),
          inArray(
            pokemon.id,
            rows.map((r) => r.id),
          ),
          eq(pokemon.knockedOut, true),
        ),
      )
      .returning();
    // Verrou : un Pokémon soigné entre-temps par une autre demande ne coûte pas de Rappel.
    if (revived.length !== rows.length) throw new GameError(409, 'POKEMON_NOT_KO');
    return revived;
  });
}
