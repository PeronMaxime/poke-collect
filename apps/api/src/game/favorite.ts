import { and, eq } from 'drizzle-orm';
import { playerProfiles, pokedex, pokedexForms } from '@poke/db';
import type { Db } from '@poke/db';
import { getForm, getSpecies } from '@poke/data';
import type { FavoritePokemonDto, FavoritePokemonInput } from '@poke/shared';
import { GameError } from './errors';

/** Colonnes du profil utiles au Pokémon favori (à ajouter aux `select`). */
export const favoriteColumns = {
  starterSpeciesId: playerProfiles.starterSpeciesId,
  favoriteSpeciesId: playerProfiles.favoriteSpeciesId,
  favoriteFormId: playerProfiles.favoriteFormId,
  favoriteShiny: playerProfiles.favoriteShiny,
};

type FavoriteRow = {
  [K in keyof typeof favoriteColumns]: (typeof playerProfiles.$inferSelect)[K];
};

/** Pokémon favori choisi par le joueur (null : il n'en a pas choisi). */
export function chosenFavorite(row: FavoriteRow): FavoritePokemonDto | null {
  if (row.favoriteSpeciesId === null) return null;
  return { speciesId: row.favoriteSpeciesId, formId: row.favoriteFormId, shiny: row.favoriteShiny };
}

/** Pokémon affiché pour un dresseur : son favori, sinon son starter. */
export function displayedFavorite(row: FavoriteRow): FavoritePokemonDto | null {
  return (
    chosenFavorite(row) ??
    (row.starterSpeciesId === null
      ? null
      : { speciesId: row.starterSpeciesId, formId: null, shiny: false })
  );
}

/**
 * Change le Pokémon favori : une espèce (ou une de ses formes) capturée, en chromatique seulement
 * si elle a été capturée ainsi ; null revient au starter.
 */
export async function setFavorite(
  db: Db,
  userId: string,
  favorite: FavoritePokemonInput['favorite'],
): Promise<FavoritePokemonDto | null> {
  if (favorite) {
    const { speciesId, formId, shiny } = favorite;
    if (!getSpecies(speciesId)) throw new GameError(400, 'INVALID_FAVORITE');
    if (formId === null) {
      const [entry] = await db
        .select({ caught: pokedex.caught, caughtShiny: pokedex.caughtShiny })
        .from(pokedex)
        .where(and(eq(pokedex.ownerId, userId), eq(pokedex.speciesId, speciesId)));
      if (!entry?.caught || (shiny && !entry.caughtShiny)) {
        throw new GameError(400, 'INVALID_FAVORITE');
      }
    } else {
      if (getForm(formId)?.speciesId !== speciesId) throw new GameError(400, 'INVALID_FAVORITE');
      const [entry] = await db
        .select({ caughtShiny: pokedexForms.caughtShiny })
        .from(pokedexForms)
        .where(and(eq(pokedexForms.ownerId, userId), eq(pokedexForms.formId, formId)));
      if (!entry || (shiny && !entry.caughtShiny)) throw new GameError(400, 'INVALID_FAVORITE');
    }
  }
  const [row] = await db
    .update(playerProfiles)
    .set({
      favoriteSpeciesId: favorite?.speciesId ?? null,
      favoriteFormId: favorite?.formId ?? null,
      favoriteShiny: favorite?.shiny ?? false,
    })
    .where(eq(playerProfiles.userId, userId))
    .returning(favoriteColumns);
  if (!row) throw new GameError(409, 'NO_PROFILE');
  return chosenFavorite(row);
}
