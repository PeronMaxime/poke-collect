import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content/seed';
import { pokemon } from '@poke/db';
import type { PokemonInstance } from '@poke/game-core';
import type { AssistantDto, PokemonDto } from '@poke/shared';
import { insertPokemon } from '../../src/game/store';
import { testApi } from '../support/api';

const api = testApi({
  start: '2026-10-15T10:00:00Z',
  content: () => {
    // Un talent utile à chaque poste (un assistant inutile est refusé), et un talent sans effet.
    const team = { scope: 'team' as const, conditions: [] };
    return {
      ...seedContent,
      abilities: [
        {
          id: 'overgrow',
          description: '',
          effects: [
            { type: 'modifier', param: 'shinyChance', value: 10, ...team },
            { type: 'modifier', param: 'hatchTime', value: -10, ...team },
            { type: 'modifier', param: 'koDuration', value: -10, ...team },
          ],
        },
        {
          id: 'blaze',
          description: '',
          effects: [{ type: 'modifier', param: 'damageDealt', value: 10, ...team }],
        },
      ],
    };
  },
});
const { handle, signUp, client } = api;

async function give(userId: string, speciesId: number, formId?: number, ability = 'overgrow') {
  const instance: PokemonInstance = {
    speciesId,
    formId,
    level: 30,
    xp: 0,
    ivs: {
      hp: 10,
      attack: 10,
      defense: 10,
      'special-attack': 10,
      'special-defense': 10,
      speed: 10,
    },
    nature: 'hardy',
    ability,
    isShiny: false,
    gender: 'male',
    happiness: 70,
  };
  const [row] = await insertPokemon(handle.db, userId, [instance], {
    origin: 'capture',
    originRegion: 'kanto',
    at: api.clock,
  });
  // Les Pokémon obtenus arrivent sans talent : on le débloque.
  await handle.db.update(pokemon).set({ ability }).where(eq(pokemon.id, row!.id));
  return { ...row!, ability };
}

describe('assistants', () => {
  let call: ReturnType<typeof client>;
  let userId: string;
  let starter: PokemonDto;

  beforeAll(async () => {
    const signed = await signUp('assistants@example.com');
    userId = signed.userId;
    call = client(signed.cookie);
    await call('POST', '/api/profile', { trainerName: 'Assistants' });
    starter = (await call<PokemonDto>('POST', '/api/starter', { speciesId: 1 })).body;
    await handle.db.update(pokemon).set({ ability: 'overgrow' }).where(eq(pokemon.id, starter.id));
  });

  it('affecte un Pokémon à une place d’un bâtiment, qui devient occupé', async () => {
    const res = await call<AssistantDto>('PUT', '/api/assistants/museum/0', {
      pokemonId: starter.id,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await call<AssistantDto[]>('GET', '/api/assistants')).body).toEqual([
      { post: 'museum', slot: 0, pokemonId: starter.id },
    ]);
    const list = (await call<PokemonDto[]>('GET', '/api/pokemon')).body;
    expect(list.find((p) => p.id === starter.id)).toMatchObject({
      busy: true,
      activity: 'assistant',
    });
    // Déjà assistant : pas d'autre place ni d'expédition.
    for (const url of ['/api/assistants/daycare/0', '/api/assistants/museum/1']) {
      expect((await call('PUT', url, { pokemonId: starter.id })).body).toMatchObject({
        error: 'POKEMON_BUSY',
      });
    }
  });

  it('refuse un assistant dont le talent n’agit pas à ce poste', async () => {
    const useless = await give(userId, 4, undefined, 'blaze');
    for (const url of [
      '/api/assistants/museum/0',
      '/api/assistants/daycare/0',
      '/api/assistants/center/0',
    ]) {
      expect((await call('PUT', url, { pokemonId: useless.id })).body).toMatchObject({
        error: 'ASSISTANT_NO_ABILITY',
      });
    }
  });

  it('un assistant par place : en remplace un, en ajoute un autre, puis les libère', async () => {
    const other = await give(userId, 4);
    const third = await give(userId, 7);
    expect((await call('PUT', '/api/assistants/museum/0', { pokemonId: other.id })).status).toBe(
      200,
    );
    expect((await call('PUT', '/api/assistants/museum/1', { pokemonId: third.id })).status).toBe(
      200,
    );
    const assigned = (await call<AssistantDto[]>('GET', '/api/assistants')).body;
    expect(assigned.sort((a, b) => a.slot - b.slot)).toEqual([
      { post: 'museum', slot: 0, pokemonId: other.id },
      { post: 'museum', slot: 1, pokemonId: third.id },
    ]);
    // Postes au-delà de ceux ouverts : 2 places au Musée, 1 pension au départ, une seule
    // couveuse et un seul Centre (6 places chacun).
    for (const url of [
      '/api/assistants/museum/2',
      '/api/assistants/daycare/1',
      '/api/assistants/incubator/1',
      '/api/assistants/center/1',
    ]) {
      expect((await call('PUT', url, { pokemonId: starter.id })).body).toMatchObject({
        error: 'NO_SUCH_SLOT',
      });
    }
    expect((await call('DELETE', '/api/assistants/museum/0')).status).toBe(204);
    expect((await call<AssistantDto[]>('GET', '/api/assistants')).body).toEqual([
      { post: 'museum', slot: 1, pokemonId: third.id },
    ]);
    expect((await call('DELETE', '/api/assistants/museum/0')).status).toBe(404);
    expect((await call('DELETE', '/api/assistants/museum/1')).status).toBe(204);
    expect((await call('PUT', '/api/assistants/gym/0', { pokemonId: other.id })).status).toBe(400);
    expect((await call('PUT', '/api/assistants/museum', { pokemonId: other.id })).status).toBe(404);
  });
});
