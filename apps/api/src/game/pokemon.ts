/**
 * Les Pokémon du PC d'un joueur : liste, verrou et étiquettes.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { pokemon, pokemonTags } from '@poke/db';
import type { Db } from '@poke/db';
import type { PokemonDto, UpdatePokemonInput } from '@poke/shared';
import { GameError } from './errors';
import { pokemonActivities, toPokemonDto } from './store';

/** Tous les Pokémon du joueur, du plus ancien au plus récent, avec ce qui les occupe. */
export async function listPokemon(db: Db, userId: string): Promise<PokemonDto[]> {
  const [rows, busy] = await Promise.all([
    db
      .select()
      .from(pokemon)
      .where(eq(pokemon.ownerId, userId))
      .orderBy(asc(pokemon.caughtAt), asc(pokemon.id)),
    pokemonActivities(db, userId),
  ]);
  return rows.map((r) => toPokemonDto(r, busy.get(r.id)));
}

/**
 * Verrouille un Pokémon (protégé du transfert) ou change ses étiquettes ; un champ absent n'est
 * pas modifié. Refus : `TAG_NOT_FOUND` (étiquette d'un autre joueur), `POKEMON_NOT_FOUND`.
 */
export async function updatePokemon(
  db: Db,
  userId: string,
  pokemonId: string,
  { locked, tagIds: requested }: UpdatePokemonInput,
): Promise<PokemonDto> {
  const tagIds = requested && [...new Set(requested)];
  if (tagIds?.length) {
    const owned = await db
      .select({ id: pokemonTags.id })
      .from(pokemonTags)
      .where(and(inArray(pokemonTags.id, tagIds), eq(pokemonTags.ownerId, userId)));
    if (owned.length !== tagIds.length) {
      throw new GameError(404, 'TAG_NOT_FOUND');
    }
  }
  const [row] = await db
    .update(pokemon)
    .set({ locked, tagIds })
    .where(and(eq(pokemon.id, pokemonId), eq(pokemon.ownerId, userId)))
    .returning();
  if (!row) throw new GameError(404, 'POKEMON_NOT_FOUND');
  const busy = await pokemonActivities(db, userId);
  return toPokemonDto(row, busy.get(row.id));
}
