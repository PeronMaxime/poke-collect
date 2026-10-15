import type { FastifyInstance } from 'fastify';
import { and, asc, count, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { pokemon, pokemonTeams } from '@poke/db';
import type { Db } from '@poke/db';
import { MAX_MEGAS_PER_TEAM, megaCount } from '@poke/game-core';
import { MAX_TEAMS, teamInputSchema } from '@poke/shared';
import type { PokemonTeamDto, TeamInput } from '@poke/shared';
import { GameError } from '../game/errors';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  hooks: ReturnType<typeof sessionHooks>;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const uuidParams = z.object({ id: z.uuid() });

/** Équipe sans les Pokémon qui ne sont plus au PC (transférés depuis l'enregistrement). */
const toTeamDto = (
  { id, name, pokemonIds }: typeof pokemonTeams.$inferSelect,
  owned: ReadonlySet<string>,
): PokemonTeamDto => ({ id, name, pokemonIds: pokemonIds.filter((p) => owned.has(p)) });

async function ownedIds(db: Db | Tx, userId: string) {
  const rows = await db.select({ id: pokemon.id }).from(pokemon).where(eq(pokemon.ownerId, userId));
  return new Set(rows.map((r) => r.id));
}

/**
 * Membres valides : tous au PC du joueur, au plus une Méga, et aucun déjà dans une autre de ses
 * équipes (`teamId` = équipe modifiée, exclue de la recherche).
 */
async function checkMembers(tx: Tx, userId: string, input: TeamInput, teamId?: string) {
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

/** Équipes enregistrées du joueur : construites depuis la page « Équipe Pkmn ». */
export async function teamRoutes(app: FastifyInstance, { db, hooks }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/teams', async (request): Promise<PokemonTeamDto[]> => {
    const userId = request.user!.id;
    const rows = await db
      .select()
      .from(pokemonTeams)
      .where(eq(pokemonTeams.ownerId, userId))
      .orderBy(asc(pokemonTeams.createdAt), asc(pokemonTeams.id));
    const owned = await ownedIds(db, userId);
    return rows.map((r) => toTeamDto(r, owned));
  });

  app.post('/api/teams', async (request, reply) => {
    const input = teamInputSchema.parse(request.body);
    const userId = request.user!.id;
    const dto = await db.transaction(async (tx) => {
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
    return reply.code(201).send(dto);
  });

  app.put('/api/teams/:id', async (request): Promise<PokemonTeamDto> => {
    const { id } = uuidParams.parse(request.params);
    const input = teamInputSchema.parse(request.body);
    const userId = request.user!.id;
    return db.transaction(async (tx) => {
      await checkMembers(tx, userId, input, id);
      const [row] = await tx
        .update(pokemonTeams)
        .set({ name: input.name, pokemonIds: input.pokemonIds })
        .where(and(eq(pokemonTeams.id, id), eq(pokemonTeams.ownerId, userId)))
        .returning();
      if (!row) throw new GameError(404, 'TEAM_NOT_FOUND');
      return toTeamDto(row, new Set(input.pokemonIds));
    });
  });

  /** Les Pokémon restent au PC : seule l'équipe disparaît. */
  app.delete('/api/teams/:id', async (request, reply) => {
    const { id } = uuidParams.parse(request.params);
    const [row] = await db
      .delete(pokemonTeams)
      .where(and(eq(pokemonTeams.id, id), eq(pokemonTeams.ownerId, request.user!.id)))
      .returning({ id: pokemonTeams.id });
    if (!row) throw new GameError(404, 'TEAM_NOT_FOUND');
    return reply.code(204).send();
  });
}
