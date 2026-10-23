import { and, eq } from 'drizzle-orm';
import { assistants, pokemon } from '@poke/db';
import type { Db } from '@poke/db';
import { abilityHolder } from '@poke/game-core';
import type { AbilityHolder, AssistantPost } from '@poke/game-core';
import type { AssistantDto } from '@poke/shared';
import { GameError } from './errors';
import { assertAvailable, toInstance } from './store';

/**
 * Assistants : un Pokémon affecté à la Pension, à la couveuse, au Musée ou au Centre Pokémon y
 * apporte les effets de son talent. Il est occupé tant qu'il y reste ; un seul assistant par
 * bâtiment.
 */

export async function listAssistants(db: Db, userId: string): Promise<AssistantDto[]> {
  const rows = await db
    .select({ post: assistants.post, pokemonId: assistants.pokemonId })
    .from(assistants)
    .where(eq(assistants.ownerId, userId));
  return rows;
}

/** Talent de l'assistant d'un bâtiment (null = aucun assistant). */
export async function assistantHolder(
  db: Db,
  userId: string,
  post: AssistantPost,
): Promise<AbilityHolder | null> {
  const [row] = await db
    .select({ pokemon })
    .from(assistants)
    .innerJoin(pokemon, eq(pokemon.id, assistants.pokemonId))
    .where(and(eq(assistants.ownerId, userId), eq(assistants.post, post)));
  return row ? abilityHolder(toInstance(row.pokemon)) : null;
}

/** Affecte un Pokémon disponible à un bâtiment (l'assistant précédent redevient libre). */
export async function assignAssistant(
  db: Db,
  userId: string,
  post: AssistantPost,
  pokemonId: string,
  now: Date,
): Promise<AssistantDto> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(pokemon)
      .where(and(eq(pokemon.id, pokemonId), eq(pokemon.ownerId, userId)));
    if (!row) throw new GameError(404, 'POKEMON_NOT_FOUND');
    await tx
      .delete(assistants)
      .where(and(eq(assistants.ownerId, userId), eq(assistants.post, post)));
    await assertAvailable(tx, userId, [row], now);
    await tx.insert(assistants).values({ ownerId: userId, post, pokemonId, assignedAt: now });
    return { post, pokemonId };
  });
}

export async function removeAssistant(db: Db, userId: string, post: AssistantPost) {
  const deleted = await db
    .delete(assistants)
    .where(and(eq(assistants.ownerId, userId), eq(assistants.post, post)))
    .returning();
  if (deleted.length === 0) throw new GameError(404, 'NO_ASSISTANT');
}
