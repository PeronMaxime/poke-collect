import { and, asc, eq, inArray, isNotNull, like, sql } from 'drizzle-orm';
import { playerProfiles, pokedex, pokemon } from '@poke/db';
import type { Db } from '@poke/db';
import type { GameContext } from '@poke/game-core';
import { searchKey } from '@poke/shared';
import type {
  FeaturedPokemonDto,
  TrainerPokedexResponse,
  TrainerProfileResponse,
  TrainerSearchResultDto,
} from '@poke/shared';
import { GameError } from './errors';
import { displayedFavorite, favoriteColumns } from './favorite';
import { listPokedex, listPokedexForms, playerProgress } from './store';
import { featuredPokemon, trainerCard } from './stats';

/**
 * Fiches Dresseur des autres joueurs : recherche par nom, fiche, Pokédex ; vitrine de sa propre
 * fiche.
 *
 * Seuls les dresseurs qui ont choisi leur starter sont visibles. Ces lectures ne prennent aucun
 * verrou : elles montrent l'état du moment d'un autre joueur.
 */

/** Résultats de recherche affichés au plus. */
const SEARCH_LIMIT = 10;

/** Lettres accentuées et leur version sans accent, pour une recherche qui les ignore. */
const ACCENTED = 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ';
const UNACCENTED = 'aaaaaaceeeeiiiinooooouuuuyy';

/** Dresseur ayant commencé l'aventure, retrouvé par son nom (sans tenir compte de la casse). */
async function findTrainer(db: Db, name: string) {
  const [profile] = await db
    .select()
    .from(playerProfiles)
    .where(
      and(
        eq(sql`lower(${playerProfiles.trainerName})`, name.toLowerCase()),
        isNotNull(playerProfiles.starterSpeciesId),
      ),
    );
  if (!profile) throw new GameError(404, 'TRAINER_NOT_FOUND');
  return profile;
}

/**
 * Dresseurs dont le nom contient `query`, au plus `SEARCH_LIMIT`. Ni la casse ni les accents ne
 * comptent : « eloise » trouve « Éloïse ».
 */
export async function searchTrainers(db: Db, query: string): Promise<TrainerSearchResultDto[]> {
  const lower = searchKey(query);
  const pattern = `%${lower.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const name = sql<string>`translate(lower(${playerProfiles.trainerName}), ${ACCENTED}, ${UNACCENTED})`;
  const rows = await db
    .select({ trainerName: playerProfiles.trainerName, ...favoriteColumns })
    .from(playerProfiles)
    .where(and(isNotNull(playerProfiles.starterSpeciesId), like(name, pattern)))
    // Nom exact, puis noms qui commencent par la recherche, puis ordre alphabétique.
    .orderBy(sql`${name} = ${lower} desc`, sql`starts_with(${name}, ${lower}) desc`, asc(name))
    .limit(SEARCH_LIMIT);
  return rows.map((r) => ({ trainerName: r.trainerName, favorite: displayedFavorite(r) }));
}

/**
 * Fiche d'un dresseur vue par `viewerId` : avancement, statistiques, vitrine. Refus
 * `TRAINER_NOT_FOUND`.
 */
export async function trainerProfile(
  db: Db,
  ctx: () => Promise<GameContext>,
  name: string,
  viewerId: string,
): Promise<TrainerProfileResponse> {
  const profile = await findTrainer(db, name);
  const context = await ctx();
  const [progress, card, shiny] = await Promise.all([
    playerProgress(db, context, profile.userId),
    trainerCard(db, context, profile.userId),
    db
      .select({ speciesId: pokedex.speciesId })
      .from(pokedex)
      .where(and(eq(pokedex.ownerId, profile.userId), eq(pokedex.caughtShiny, true))),
  ]);
  return {
    trainerName: profile.trainerName,
    favorite: displayedFavorite(profile),
    createdAt: profile.createdAt.toISOString(),
    currency: profile.currency,
    isMe: profile.userId === viewerId,
    progress: {
      caughtSpeciesIds: [...progress.caughtSpeciesIds],
      caughtShinySpeciesIds: shiny.map((s) => s.speciesId),
      defeatedTrainerIds: [...progress.defeatedTrainerIds],
      eggsHatched: progress.eggsHatched,
      questSteps: Object.fromEntries(progress.questSteps ?? []),
      openedRegionIds: [...(progress.openedRegionIds ?? [])],
    },
    card,
  };
}

/** Pokédex d'un dresseur (espèces et formes). Refus `TRAINER_NOT_FOUND`. */
export async function trainerPokedex(db: Db, name: string): Promise<TrainerPokedexResponse> {
  const { userId } = await findTrainer(db, name);
  const [entries, forms] = await Promise.all([
    listPokedex(db, userId),
    listPokedexForms(db, userId),
  ]);
  return { entries, forms };
}

/**
 * Remplace les Pokémon mis en avant sur la Fiche Dresseur du joueur. Refus : `POKEMON_NOT_FOUND`
 * (un Pokémon n'est pas à son PC), `NO_PROFILE`.
 */
export async function setFeaturedPokemon(
  db: Db,
  userId: string,
  pokemonIds: string[],
): Promise<FeaturedPokemonDto[]> {
  if (pokemonIds.length > 0) {
    const owned = await db
      .select({ id: pokemon.id })
      .from(pokemon)
      .where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, pokemonIds)));
    if (owned.length !== pokemonIds.length) throw new GameError(404, 'POKEMON_NOT_FOUND');
  }
  const updated = await db
    .update(playerProfiles)
    .set({ featuredPokemonIds: pokemonIds })
    .where(eq(playerProfiles.userId, userId))
    .returning({ userId: playerProfiles.userId });
  if (updated.length === 0) throw new GameError(409, 'NO_PROFILE');
  return featuredPokemon(db, userId);
}
