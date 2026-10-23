import type { FastifyInstance } from 'fastify';
import type { Db } from '@poke/db';
import { healPokemonInputSchema, revivePokemonInputSchema } from '@poke/shared';
import type { PokemonDto } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { healPokemon, revivePokemon } from '../game/center';
import { toPokemonDto } from '../game/store';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
}

/** Centre Pokémon et Rappels : soins des Pokémon mis K.O. */
export async function centerRoutes(app: FastifyInstance, { db, content, hooks, now }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  app.post('/api/center', async (request): Promise<PokemonDto[]> => {
    const { pokemonIds } = healPokemonInputSchema.parse(request.body);
    const healed = await healPokemon(db, content, request.user!.id, pokemonIds, now());
    return healed.map((r) => toPokemonDto(r));
  });

  app.post('/api/center/revive', async (request): Promise<PokemonDto[]> => {
    const { itemId, pokemonIds } = revivePokemonInputSchema.parse(request.body);
    const revived = await revivePokemon(db, content, request.user!.id, itemId, pokemonIds);
    return revived.map((r) => toPokemonDto(r));
  });
}
