import { and, count, eq, gt, inArray } from 'drizzle-orm';
import { pokemon } from '@poke/db';
import type { Db } from '@poke/db';
import { abilityHolder, healMinutes } from '@poke/game-core';
import type { ContentCache } from '../content-cache';
import { assistantHolder } from './assistants';
import { GameError } from './errors';
import { requireStartedProfile } from './expeditions';
import { takeItems, toInstance } from './store';
import type { PokemonRow } from './store';

/**
 * Centre Pokémon : un Pokémon mis K.O. en combat y est soigné, dans la limite des places
 * (`balance.center.slots`). Il est en soins jusqu'à `healUntil`, puis de nouveau libre : rien à
 * récupérer, la place se libère d'elle-même. Un Rappel (objet `revive`) le ranime aussitôt.
 */

async function knockedOutRows(tx: Db, userId: string, ids: readonly string[]) {
  const unique = [...new Set(ids)];
  const rows = await tx
    .select()
    .from(pokemon)
    .where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, unique)));
  if (rows.length !== unique.length) throw new GameError(404, 'POKEMON_NOT_FOUND');
  if (rows.some((r) => !r.knockedOut)) throw new GameError(409, 'POKEMON_NOT_KO');
  return rows;
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

    const [{ value: healing } = { value: 0 }] = await tx
      .select({ value: count() })
      .from(pokemon)
      .where(and(eq(pokemon.ownerId, userId), gt(pokemon.healUntil, now)));
    if (healing + rows.length > ctx.balance.center.slots) throw new GameError(409, 'CENTER_FULL');

    const helper = await assistantHolder(tx, userId, 'center');
    const healed: PokemonRow[] = [];
    for (const row of rows) {
      const minutes = healMinutes(ctx, abilityHolder(toInstance(row)), helper);
      // Verrou : un Pokémon déjà soigné par une autre demande n'est pas soigné deux fois.
      const [updated] = await tx
        .update(pokemon)
        .set({ knockedOut: false, healUntil: new Date(now.getTime() + minutes * 60_000) })
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
