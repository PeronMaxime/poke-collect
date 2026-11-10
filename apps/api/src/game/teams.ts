import { and, asc, count, eq, inArray, ne } from 'drizzle-orm';
import { pokemon, pokemonTeams } from '@poke/db';
import type { Db } from '@poke/db';
import { MAX_MEGAS_PER_TEAM, megaCount } from '@poke/game-core';
import { MAX_TEAMS } from '@poke/shared';
import type { PokemonTeamDto, TeamInput } from '@poke/shared';
import { GameError } from './errors';
import { playerTransaction } from './tx';

/**
 * Équipes enregistrées du joueur, construites depuis la page « Équipe Pkmn ».
 *
 * Règles : au plus `MAX_TEAMS` équipes ; tous les membres sont au PC du joueur ; au plus
 * `MAX_MEGAS_PER_TEAM` Méga par équipe ; un Pokémon n'est que dans une équipe à la fois. Créer et
 * modifier passent par `playerTransaction` : deux enregistrements simultanés ne peuvent pas placer
 * le même Pokémon dans deux équipes. Une équipe garde l'identifiant d'un Pokémon transféré depuis ;
 * il est retiré à la lecture.
 */

/** Équipe sans les Pokémon qui ne sont plus au PC (transférés depuis l'enregistrement). */
const toTeamDto = (
  { id, name, pokemonIds }: typeof pokemonTeams.$inferSelect,
  owned: ReadonlySet<string>,
): PokemonTeamDto => ({ id, name, pokemonIds: pokemonIds.filter((p) => owned.has(p)) });

async function ownedIds(db: Db, userId: string) {
  const rows = await db.select({ id: pokemon.id }).from(pokemon).where(eq(pokemon.ownerId, userId));
  return new Set(rows.map((r) => r.id));
}

/**
 * Membres valides : tous au PC du joueur, au plus une Méga, et aucun déjà dans une autre de ses
 * équipes (`teamId` = équipe modifiée, exclue de la recherche).
 */
async function checkMembers(tx: Db, userId: string, input: TeamInput, teamId?: string) {
  if (input.pokemonIds.length === 0) return;
  const members = await tx
    .select({ id: pokemon.id, formId: pokemon.formId })
    .from(pokemon)
    .where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, input.pokemonIds)));
  if (members.length !== input.pokemonIds.length) throw new GameError(404, 'POKEMON_NOT_FOUND');
  if (megaCount(members) > MAX_MEGAS_PER_TEAM) throw new GameError(409, 'TOO_MANY_MEGAS');
  const others = await tx
    .select({ pokemonIds: pokemonTeams.pokemonIds })
    .from(pokemonTeams)
    .where(
      teamId
        ? and(eq(pokemonTeams.ownerId, userId), ne(pokemonTeams.id, teamId))
        : eq(pokemonTeams.ownerId, userId),
    );
  const taken = new Set(others.flatMap((t) => t.pokemonIds));
  if (input.pokemonIds.some((id) => taken.has(id)))
    throw new GameError(409, 'POKEMON_IN_OTHER_TEAM');
}

/** Équipes du joueur, de la plus ancienne à la plus récente. */
export async function listTeams(db: Db, userId: string): Promise<PokemonTeamDto[]> {
  const rows = await db
    .select()
    .from(pokemonTeams)
    .where(eq(pokemonTeams.ownerId, userId))
    .orderBy(asc(pokemonTeams.createdAt), asc(pokemonTeams.id));
  const owned = await ownedIds(db, userId);
  return rows.map((r) => toTeamDto(r, owned));
}

/** Enregistre une équipe ; refus `TOO_MANY_TEAMS` au-delà de `MAX_TEAMS`, ou membres invalides. */
export function createTeam(db: Db, userId: string, input: TeamInput): Promise<PokemonTeamDto> {
  return playerTransaction(db, userId, async (tx) => {
    const [{ total } = { total: 0 }] = await tx
      .select({ total: count() })
      .from(pokemonTeams)
      .where(eq(pokemonTeams.ownerId, userId));
    if (total >= MAX_TEAMS) throw new GameError(409, 'TOO_MANY_TEAMS');
    await checkMembers(tx, userId, input);
    const [row] = await tx
      .insert(pokemonTeams)
      .values({ ownerId: userId, name: input.name, pokemonIds: input.pokemonIds })
      .returning();
    return toTeamDto(row!, new Set(input.pokemonIds));
  });
}

/** Renomme une équipe et remplace ses membres ; refus `TEAM_NOT_FOUND` si elle n'est pas au joueur. */
export function updateTeam(
  db: Db,
  userId: string,
  teamId: string,
  input: TeamInput,
): Promise<PokemonTeamDto> {
  return playerTransaction(db, userId, async (tx) => {
    await checkMembers(tx, userId, input, teamId);
    const [row] = await tx
      .update(pokemonTeams)
      .set({ name: input.name, pokemonIds: input.pokemonIds })
      .where(and(eq(pokemonTeams.id, teamId), eq(pokemonTeams.ownerId, userId)))
      .returning();
    if (!row) throw new GameError(404, 'TEAM_NOT_FOUND');
    return toTeamDto(row, new Set(input.pokemonIds));
  });
}

/** Supprime une équipe du joueur. Les Pokémon restent au PC : seule l'équipe disparaît. */
export async function deleteTeam(db: Db, userId: string, teamId: string): Promise<void> {
  const [row] = await db
    .delete(pokemonTeams)
    .where(and(eq(pokemonTeams.id, teamId), eq(pokemonTeams.ownerId, userId)))
    .returning({ id: pokemonTeams.id });
  if (!row) throw new GameError(404, 'TEAM_NOT_FOUND');
}
