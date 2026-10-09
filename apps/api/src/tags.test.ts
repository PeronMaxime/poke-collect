import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent } from '@poke/db';
import type { PokemonDto, PokemonTagDto } from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
let app: Awaited<ReturnType<typeof buildApp>>['app'];

beforeAll(async () => {
  await handle.migrate();
  await ensureSeedContent(handle.db, seedContent);
  ({ app } = await buildApp({ db: handle.db, env, now: () => new Date('2026-10-09T10:00:00Z') }));
});
afterAll(async () => {
  await app.close();
  await handle.close();
});

async function signUp(email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    payload: { email, password: 'motdepasse-solide', name: email.split('@')[0] },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookies = res.headers['set-cookie'];
  const list = Array.isArray(cookies) ? cookies : [cookies ?? ''];
  return list.map((c) => c.split(';')[0]).join('; ');
}

function client(cookie: string) {
  return async <T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ) => {
    const res = await app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload !== undefined && { payload: payload as object }),
    });
    return { status: res.statusCode, body: (res.body ? res.json() : null) as T };
  };
}

describe('étiquettes des Pokémon', () => {
  let call: ReturnType<typeof client>;
  let other: ReturnType<typeof client>;
  let starter: PokemonDto;
  let tag: PokemonTagDto;

  beforeAll(async () => {
    call = client(await signUp('tags@example.com'));
    other = client(await signUp('autre-tags@example.com'));
    await call('POST', '/api/profile', { trainerName: 'Etiquette' });
    starter = (await call<PokemonDto>('POST', '/api/starter', { speciesId: 1 })).body;
    expect(starter.tagIds).toEqual([]);
  });

  it('crée, liste et modifie une étiquette', async () => {
    const created = await call<PokemonTagDto>('POST', '/api/tags', {
      label: ' Combat ',
      color: '#FF0000',
    });
    expect(created).toMatchObject({ status: 201, body: { label: 'Combat', color: '#ff0000' } });
    tag = created.body;

    const tooLong = await call('POST', '/api/tags', { label: 'onze lettres', color: '#00ff00' });
    expect(tooLong.status).toBe(400);
    const badColor = await call('POST', '/api/tags', { label: 'ok', color: 'red' });
    expect(badColor.status).toBe(400);

    const updated = await call<PokemonTagDto>('PUT', `/api/tags/${tag.id}`, {
      label: 'Élevage',
      color: '#00aa00',
    });
    expect(updated.body).toEqual({ id: tag.id, label: 'Élevage', color: '#00aa00' });
    expect((await call<PokemonTagDto[]>('GET', '/api/tags')).body).toEqual([updated.body]);
  });

  it('ne partage pas les étiquettes entre joueurs', async () => {
    expect((await other<PokemonTagDto[]>('GET', '/api/tags')).body).toEqual([]);
    const res = await other('PUT', `/api/tags/${tag.id}`, { label: 'Vol', color: '#000000' });
    expect(res).toMatchObject({ status: 404, body: { error: 'TAG_NOT_FOUND' } });
    expect((await other('DELETE', `/api/tags/${tag.id}`)).status).toBe(404);
  });

  it('colle plusieurs étiquettes sur un Pokémon, puis retire celle qui est supprimée', async () => {
    const second = (
      await call<PokemonTagDto>('POST', '/api/tags', { label: 'Shiny', color: '#ffd700' })
    ).body;
    const tagged = await call<PokemonDto>('PATCH', `/api/pokemon/${starter.id}`, {
      tagIds: [tag.id, second.id, tag.id],
    });
    expect(tagged.body).toMatchObject({ tagIds: [tag.id, second.id], locked: false });

    // Le favori ne touche pas aux étiquettes.
    const locked = await call<PokemonDto>('PATCH', `/api/pokemon/${starter.id}`, { locked: true });
    expect(locked.body).toMatchObject({ tagIds: [tag.id, second.id], locked: true });

    const unknown = await call('PATCH', `/api/pokemon/${starter.id}`, {
      tagIds: [tag.id, '00000000-0000-4000-8000-000000000000'],
    });
    expect(unknown).toMatchObject({ status: 404, body: { error: 'TAG_NOT_FOUND' } });
    expect((await call('PATCH', `/api/pokemon/${starter.id}`, {})).status).toBe(400);

    expect((await call('DELETE', `/api/tags/${tag.id}`)).status).toBe(204);
    const list = await call<PokemonDto[]>('GET', '/api/pokemon');
    expect(list.body.find((p) => p.id === starter.id)?.tagIds).toEqual([second.id]);

    const cleared = await call<PokemonDto>('PATCH', `/api/pokemon/${starter.id}`, { tagIds: [] });
    expect(cleared.body.tagIds).toEqual([]);
  });
});
