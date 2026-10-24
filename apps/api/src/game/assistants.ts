import { and, eq } from 'drizzle-orm';
import { assistants, pokemon } from '@poke/db';
import type { Db } from '@poke/db';
import { ASSISTANT_POST_INFO, abilityHolder, canAssist } from '@poke/game-core';
import type { AbilityHolder, AssistantPost, GameContext } from '@poke/game-core';
import type { AssistantDto } from '@poke/shared';
import { GameError } from './errors';
import { pauseFarm, resumeFarm } from './farm';
import { assertAvailable, toInstance } from './store';

/**
 * Assistants : un Pokémon affecté à une place de la Pension (une pension), de la couveuse, du
 * Musée ou du Centre Pokémon y apporte les effets de son talent, pour ce qui occupe cette place.
 * Il est occupé tant qu'il y reste ; un seul assistant par place. L'assistant de la ferme (type
 * Eau exigé) arrose le champ : sans lui, les baies ne poussent pas.
 */

export async function listAssistants(db: Db, userId: string): Promise<AssistantDto[]> {
  const rows = await db
    .select({ post: assistants.post, slot: assistants.slotIndex, pokemonId: assistants.pokemonId })
    .from(assistants)
    .where(eq(assistants.ownerId, userId));
  return rows;
}

/** Talents des assistants d'un bâtiment, par place (places sans assistant absentes). */
export async function assistantHolders(
  db: Db,
  userId: string,
  post: AssistantPost,
): Promise<Map<number, AbilityHolder>> {
  const rows = await db
    .select({ slot: assistants.slotIndex, pokemon })
    .from(assistants)
    .innerJoin(pokemon, eq(pokemon.id, assistants.pokemonId))
    .where(and(eq(assistants.ownerId, userId), eq(assistants.post, post)));
  return new Map(rows.map((r) => [r.slot, abilityHolder(toInstance(r.pokemon))]));
}

/** Talent de l'assistant d'une place (null = aucun assistant). */
export async function assistantHolder(
  db: Db,
  userId: string,
  post: AssistantPost,
  slot: number,
): Promise<AbilityHolder | null> {
  return (await assistantHolders(db, userId, post)).get(slot) ?? null;
}

/**
 * Affecte un Pokémon disponible à une place d'un bâtiment (l'assistant précédent redevient libre).
 * `slots` : places du bâtiment ouvertes au joueur.
 */
export async function assignAssistant(
  db: Db,
  ctx: GameContext,
  userId: string,
  post: AssistantPost,
  slot: number,
  slots: number,
  pokemonId: string,
  now: Date,
): Promise<AssistantDto> {
  if (slot >= slots) throw new GameError(400, 'NO_SUCH_SLOT');
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(pokemon)
      .where(and(eq(pokemon.id, pokemonId), eq(pokemon.ownerId, userId)));
    if (!row) throw new GameError(404, 'POKEMON_NOT_FOUND');
    if (!canAssist(ctx, post, row)) {
      throw new GameError(
        400,
        ASSISTANT_POST_INFO[post].requiredParam ? 'ASSISTANT_NO_ABILITY' : 'ASSISTANT_WRONG_TYPE',
      );
    }
    // Changement d'arroseur : les pousses s'arrêtent à la vitesse de l'ancien, puis reprennent.
    if (post === 'farm') await pauseFarm(tx, ctx, userId, now);
    await tx.delete(assistants).where(slotOf(userId, post, slot));
    await assertAvailable(tx, userId, [row], now);
    await tx
      .insert(assistants)
      .values({ ownerId: userId, post, slotIndex: slot, pokemonId, assignedAt: now });
    if (post === 'farm') await resumeFarm(tx, ctx, userId, now);
    return { post, slot, pokemonId };
  });
}

export async function removeAssistant(
  db: Db,
  ctx: GameContext,
  userId: string,
  post: AssistantPost,
  slot: number,
  now: Date,
) {
  await db.transaction(async (tx) => {
    if (post === 'farm') await pauseFarm(tx, ctx, userId, now);
    const deleted = await tx
      .delete(assistants)
      .where(slotOf(userId, post, slot))
      .returning();
    if (deleted.length === 0) throw new GameError(404, 'NO_ASSISTANT');
  });
}

const slotOf = (userId: string, post: AssistantPost, slot: number) =>
  and(eq(assistants.ownerId, userId), eq(assistants.post, post), eq(assistants.slotIndex, slot));
