import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent } from '@poke/db';
import type { PokemonDto } from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
const clock = new Date('2026-11-04T10:00:00Z');
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

describe('liste des Pokémon', () => {
  it('répond 304 tant que la collection ne change pas', async () => {
    const signUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      payload: { email: 'etag@test.fr', password: 'motdepasse-solide', name: 'etag' },
    });
    const raw = signUp.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw : [raw ?? '']).map((c) => c.split(';')[0]).join('; ');
    const call = (method: 'GET' | 'POST', url: string, payload?: object, extra = {}) =>
      app.inject({ method, url, headers: { cookie, ...extra }, ...(payload && { payload }) });
    expect((await call('POST', '/api/profile', { trainerName: 'Etag' })).statusCode).toBe(201);
    expect((await call('POST', '/api/starter', { speciesId: 1 })).statusCode).toBe(201);

    const first = await call('GET', '/api/pokemon');
    expect(first.statusCode).toBe(200);
    expect(first.json<PokemonDto[]>()).toHaveLength(1);
    const etag = String(first.headers.etag);
    expect(etag).toMatch(/^W\/"pokemon-/);

    const again = await call('GET', '/api/pokemon', undefined, { 'if-none-match': etag });
    expect(again.statusCode).toBe(304);
    expect(again.body).toBe('');

    // Un changement (favori) donne une nouvelle empreinte et la liste complète.
    const id = first.json<PokemonDto[]>()[0]!.id;
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/pokemon/${id}`,
      headers: { cookie },
      payload: { locked: true },
    });
    expect(patched.statusCode).toBe(200);
    const changed = await call('GET', '/api/pokemon', undefined, { 'if-none-match': etag });
    expect(changed.statusCode).toBe(200);
    expect(changed.headers.etag).not.toBe(etag);
  });
});
