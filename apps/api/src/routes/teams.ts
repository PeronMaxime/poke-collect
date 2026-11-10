import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { teamInputSchema } from '@poke/shared';
import type { PokemonTeamDto } from '@poke/shared';
import { createTeam, deleteTeam, listTeams, updateTeam } from '../game/teams';
import { currentUserId } from './deps';
import type { RouteDeps } from './deps';

const uuidParams = z.object({ id: z.uuid() });

/** Équipes enregistrées du joueur : construites depuis la page « Équipe Pkmn ». */
export async function teamRoutes(app: FastifyInstance, { db, hooks }: RouteDeps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/teams', async (request): Promise<PokemonTeamDto[]> =>
    listTeams(db, currentUserId(request)),
  );

  app.post('/api/teams', async (request, reply) => {
    const input = teamInputSchema.parse(request.body);
    return reply.code(201).send(await createTeam(db, currentUserId(request), input));
  });

  app.put('/api/teams/:id', async (request): Promise<PokemonTeamDto> => {
    const { id } = uuidParams.parse(request.params);
    const input = teamInputSchema.parse(request.body);
    return updateTeam(db, currentUserId(request), id, input);
  });

  /** Les Pokémon restent au PC : seule l'équipe disparaît. */
  app.delete('/api/teams/:id', async (request, reply) => {
    const { id } = uuidParams.parse(request.params);
    await deleteTeam(db, currentUserId(request), id);
    return reply.code(204).send();
  });
}
