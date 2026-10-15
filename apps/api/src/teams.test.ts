import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent, pokemon, users } from '@poke/db';
import type { PokemonInstance } from '@poke/game-core';
import type { PokemonDto, PokemonTeamDto } from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';
import { insertPokemon } from './game/store';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
const clock = new Date('2026-10-15T10:00:00Z');
let app: Awaited<ReturnType<typeof buildApp>>['app'];

beforeAll(async () => {
  await handle.migrate();
  await ensureSeedContent(handle.db, seedContent);
  ({ app } = await buildApp({ db: handle.db, env, now: () => clock }));
});
afterAll(async () => {
  await app.close();
  await handle.close();
});

async function signUp(email: string): Promise<{ cookie: string; userId: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    payload: { email, password: 'motdepasse-solide', name: email.split('@')[0] },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookies = res.headers['set-cookie'];
  const list = Array.isArray(cookies) ? cookies : [cookies ?? ''];
  const [user] = await handle.db.select().from(users).where(eq(users.email, email));
  return { cookie: list.map((c) => c.split(';')[0]).join('; '), userId: user!.id };
}

function client(cookie: string) {
  return async <T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload !== undefined && { payload: payload as object }),
    });
    return { status: res.statusCode, body: (res.body ? res.json() : null) as T };
  };
}

async function give(userId: string, speciesId: number, formId?: number) {
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
    ability: 'overgrow',
    isShiny: false,
    gender: 'male',
    happiness: 70,
  };
  const [row] = await insertPokemon(handle.db, userId, [instance], {
    origin: 'capture',
    originRegion: 'kanto',
    at: clock,
  });
  return row!;
}

describe('équipes enregistrées', () => {
  let call: ReturnType<typeof client>;
  let other: ReturnType<typeof client>;
  let userId: string;
  let starter: PokemonDto;
  let team: PokemonTeamDto;

  beforeAll(async () => {
    const signed = await signUp('teams@example.com');
    userId = signed.userId;
    call = client(signed.cookie);
    other = client((await signUp('autre-teams@example.com')).cookie);
    await call('POST', '/api/profile', { trainerName: 'Equipes' });
    starter = (await call<PokemonDto>('POST', '/api/starter', { speciesId: 1 })).body;
  });

  it('crée, liste et modifie une équipe', async () => {
    const extra = await give(userId, 4);
    const created = await call<PokemonTeamDto>('POST', '/api/teams', {
      name: ' Arène ',
      pokemonIds: [starter.id],
    });
    expect(created).toMatchObject({
      status: 201,
      body: { name: 'Arène', pokemonIds: [starter.id] },
    });
    team = created.body;

    const updated = await call<PokemonTeamDto>('PUT', `/api/teams/${team.id}`, {
      name: 'Donjon',
      pokemonIds: [extra.id, starter.id],
    });
    expect(updated.body).toMatchObject({ name: 'Donjon', pokemonIds: [extra.id, starter.id] });

    const list = await call<PokemonTeamDto[]>('GET', '/api/teams');
    expect(list.body).toEqual([updated.body]);
    expect((await other<PokemonTeamDto[]>('GET', '/api/teams')).body).toEqual([]);
  });

  it('refuse un Pokémon déjà dans une autre équipe, en double ou étranger', async () => {
    const taken = await call('POST', '/api/teams', { name: 'Autre', pokemonIds: [starter.id] });
    expect(taken).toMatchObject({ status: 409, body: { error: 'POKEMON_IN_OTHER_TEAM' } });

    const twice = await call('POST', '/api/teams', {
      name: 'Double',
      pokemonIds: [starter.id, starter.id],
    });
    expect(twice.status).toBe(400);

    const foreign = await other('POST', '/api/teams', { name: 'Vol', pokemonIds: [starter.id] });
    expect(foreign).toMatchObject({ status: 404, body: { error: 'POKEMON_NOT_FOUND' } });
    expect(
      (await other('PUT', `/api/teams/${team.id}`, { name: 'Vol', pokemonIds: [] })).status,
    ).toBe(404);
  });

  it('refuse deux Méga-Évolués dans une équipe', async () => {
    const a = await give(userId, 6, 10034);
    const b = await give(userId, 6, 10035);
    const res = await call('POST', '/api/teams', { name: 'Mégas', pokemonIds: [a.id, b.id] });
    expect(res).toMatchObject({ status: 409, body: { error: 'TOO_MANY_MEGAS' } });
  });

  it('oublie les Pokémon qui ne sont plus au PC, puis supprime l’équipe', async () => {
    const gone = await give(userId, 7);
    await call('PUT', `/api/teams/${team.id}`, { name: 'Donjon', pokemonIds: [gone.id] });
    await handle.db.delete(pokemon).where(eq(pokemon.id, gone.id));
    expect((await call<PokemonTeamDto[]>('GET', '/api/teams')).body[0]!.pokemonIds).toEqual([]);

    expect((await call('DELETE', `/api/teams/${team.id}`)).status).toBe(204);
    expect((await call('DELETE', `/api/teams/${team.id}`)).body).toMatchObject({
      error: 'TEAM_NOT_FOUND',
    });
    expect((await call<PokemonTeamDto[]>('GET', '/api/teams')).body).toEqual([]);
  });
});
