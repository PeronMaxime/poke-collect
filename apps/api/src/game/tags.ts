import { and, arrayContains, asc, count, eq, sql } from 'drizzle-orm';
import { pokemon, pokemonTags } from '@poke/db';
import type { Db } from '@poke/db';
import { MAX_TAGS } from '@poke/shared';
import type { PokemonTagDto, TagInput } from '@poke/shared';
import { GameError } from './errors';
import { playerTransaction } from './tx';

/**
 * Étiquettes du joueur : créées, renommées et supprimées depuis le PC.
 *
 * Une étiquette appartient à un joueur ; les Pokémon la portent par son identifiant
 * (`pokemon.tag_ids`). Le joueur en a au plus `MAX_TAGS`. Seule la suppression touche plusieurs
 * tables : elle passe par `playerTransaction`, pour ne pas croiser un transfert ou une pose
 * d'étiquette sur les mêmes Pokémon.
 */

const toTagDto = ({ id, label, color }: typeof pokemonTags.$inferSelect): PokemonTagDto => ({
  id,
  label,
  color: color.toLowerCase(),
});

/** Étiquettes du joueur, de la plus ancienne à la plus récente. */
export async function listTags(db: Db, userId: string): Promise<PokemonTagDto[]> {
  const rows = await db
    .select()
    .from(pokemonTags)
    .where(eq(pokemonTags.ownerId, userId))
    .orderBy(asc(pokemonTags.createdAt), asc(pokemonTags.id));
  return rows.map(toTagDto);
}

/** Crée une étiquette ; refus `TOO_MANY_TAGS` au-delà de `MAX_TAGS`. */
export async function createTag(db: Db, userId: string, input: TagInput): Promise<PokemonTagDto> {
  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(pokemonTags)
    .where(eq(pokemonTags.ownerId, userId));
  if (total >= MAX_TAGS) throw new GameError(409, 'TOO_MANY_TAGS');
  const [row] = await db
    .insert(pokemonTags)
    .values({ ownerId: userId, label: input.label, color: input.color.toLowerCase() })
    .returning();
  return toTagDto(row!);
}

/** Renomme ou recolore une étiquette du joueur ; refus `TAG_NOT_FOUND` si elle n'est pas à lui. */
export async function updateTag(
  db: Db,
  userId: string,
  tagId: string,
  input: TagInput,
): Promise<PokemonTagDto> {
  const [row] = await db
    .update(pokemonTags)
    .set({ label: input.label, color: input.color.toLowerCase() })
    .where(and(eq(pokemonTags.id, tagId), eq(pokemonTags.ownerId, userId)))
    .returning();
  if (!row) throw new GameError(404, 'TAG_NOT_FOUND');
  return toTagDto(row);
}

/** Supprime une étiquette du joueur : les Pokémon qui la portaient la perdent. */
export async function deleteTag(db: Db, userId: string, tagId: string): Promise<void> {
  await playerTransaction(db, userId, async (tx) => {
    const [row] = await tx
      .delete(pokemonTags)
      .where(and(eq(pokemonTags.id, tagId), eq(pokemonTags.ownerId, userId)))
      .returning({ id: pokemonTags.id });
    if (!row) throw new GameError(404, 'TAG_NOT_FOUND');
    await tx
      .update(pokemon)
      .set({ tagIds: sql`array_remove(${pokemon.tagIds}, ${tagId}::uuid)` })
      .where(and(eq(pokemon.ownerId, userId), arrayContains(pokemon.tagIds, [tagId])));
  });
}
