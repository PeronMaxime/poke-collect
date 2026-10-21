import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent, users } from '@poke/db';
import type { PokemonInstance } from '@poke/game-core';
import type { AssistantDto, PokemonDto } from '@poke/shared';
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
  });

  it('affecte un Pokémon à un bâtiment, qui devient occupé', async () => {
    const res = await call<AssistantDto>('PUT', '/api/assistants/museum', {
      pokemonId: starter.id,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await call<AssistantDto[]>('GET', '/api/assistants')).body).toEqual([
      { post: 'museum', pokemonId: starter.id },
    ]);
    const list = (await call<PokemonDto[]>('GET', '/api/pokemon')).body;
    expect(list.find((p) => p.id === starter.id)).toMatchObject({
      busy: true,
      activity: 'assistant',
    });
    // Déjà assistant : pas d'autre poste ni d'expédition.
    expect(
      (await call('PUT', '/api/assistants/daycare', { pokemonId: starter.id })).body,
    ).toMatchObject({ error: 'POKEMON_BUSY' });
  });

  it('remplace l’assistant d’un bâtiment, puis le libère', async () => {
    const other = await give(userId, 4);
    expect((await call('PUT', '/api/assistants/museum', { pokemonId: other.id })).status).toBe(200);
    expect((await call<AssistantDto[]>('GET', '/api/assistants')).body).toEqual([
      { post: 'museum', pokemonId: other.id },
    ]);
    expect((await call('DELETE', '/api/assistants/museum')).status).toBe(204);
    expect((await call<AssistantDto[]>('GET', '/api/assistants')).body).toEqual([]);
    expect((await call('DELETE', '/api/assistants/museum')).status).toBe(404);
    expect((await call('PUT', '/api/assistants/gym', { pokemonId: other.id })).status).toBe(400);
  });
});
