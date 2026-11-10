import type { FastifyInstance } from 'fastify';
import { healPokemonInputSchema, revivePokemonInputSchema } from '@poke/shared';
import type { PokemonDto } from '@poke/shared';
import { healPokemon, revivePokemon } from '../game/center';
import { toPokemonDto } from '../game/store';
import { currentUserId } from './deps';
import type { RouteDeps } from './deps';

/** Centre Pokémon et Rappels : soins des Pokémon mis K.O. */
export async function centerRoutes(app: FastifyInstance, { db, content, hooks, now }: RouteDeps) {
  app.addHook('preHandler', hooks.requireUser);

  app.post('/api/center', async (request): Promise<PokemonDto[]> => {
    const { pokemonIds } = healPokemonInputSchema.parse(request.body);
    const healed = await healPokemon(db, content, currentUserId(request), pokemonIds, now());
    return healed.map((r) => toPokemonDto(r));
  });

  app.post('/api/center/revive', async (request): Promise<PokemonDto[]> => {
    const { itemId, pokemonIds } = revivePokemonInputSchema.parse(request.body);
    const revived = await revivePokemon(db, content, currentUserId(request), itemId, pokemonIds);
    return revived.map((r) => toPokemonDto(r));
  });
}
