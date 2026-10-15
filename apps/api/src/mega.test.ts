import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent, users } from '@poke/db';
import type { PokemonInstance } from '@poke/game-core';
import type {
  EvolveResponse,
  InventoryEntryDto,
  PokedexFormEntryDto,
  PokemonDto,
  TransferPokemonResponse,
} from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';
import { addItems, insertPokemon } from './game/store';

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

const MEGA_X = 10034;

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
  return async <T>(method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload !== undefined && { payload: payload as object }),
    });
    return { status: res.statusCode, body: (res.body ? res.json() : null) as T };
  };
}

async function give(userId: string, speciesId: number) {
  const instance: PokemonInstance = {
    speciesId,
    level: 50,
    xp: 0,
    ivs: {
      hp: 31,
      attack: 31,
      defense: 31,
      'special-attack': 31,
      'special-defense': 31,
      speed: 31,
    },
    nature: 'hardy',
    ability: 'blaze',
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

describe('Méga-Évolution au PC', () => {
  let call: ReturnType<typeof client>;
  let userId: string;
  let starter: PokemonDto;

  const gems = async () =>
    (await call<InventoryEntryDto[]>('GET', '/api/inventory')).body.find(
      (i) => i.itemId === 'charizardite-x',
    )?.quantity ?? 0;

  beforeAll(async () => {
    const signed = await signUp('mega@example.com');
    userId = signed.userId;
    call = client(signed.cookie);
    expect((await call('POST', '/api/profile', { trainerName: 'Mega' })).status).toBe(201);
    starter = (await call<PokemonDto>('POST', '/api/starter', { speciesId: 1 })).body;
  });

  it('Méga-Évolue avec la gemme, deux fois la même espèce, et enregistre la forme au Pokédex', async () => {
    const a = await give(userId, 6);
    const b = await give(userId, 6);
    expect(
      await call('POST', `/api/pokemon/${a.id}/mega`, { itemId: 'charizardite-x' }),
    ).toMatchObject({ status: 409, body: { error: 'ITEM_MISSING' } });

    await addItems(handle.db, userId, [{ itemId: 'charizardite-x', quantity: 2 }]);
    expect(
      await call('POST', `/api/pokemon/${starter.id}/mega`, { itemId: 'charizardite-x' }),
    ).toMatchObject({ status: 400, body: { error: 'WRONG_MEGA_STONE' } });

    const first = await call<EvolveResponse>('POST', `/api/pokemon/${a.id}/mega`, {
      itemId: 'charizardite-x',
    });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.pokemon).toMatchObject({ formId: MEGA_X, megaStone: 'charizardite-x' });
    expect(first.body.newFormIds).toEqual([MEGA_X]);
    expect(
      (await call('POST', `/api/pokemon/${a.id}/mega`, { itemId: 'charizardite-x' })).body,
    ).toMatchObject({ error: 'ALREADY_MEGA' });

    const second = await call<EvolveResponse>('POST', `/api/pokemon/${b.id}/mega`, {
      itemId: 'charizardite-x',
    });
    expect(second.body.pokemon.formId).toBe(MEGA_X);
    expect(second.body.newFormIds).toEqual([]);
    expect(await gems()).toBe(0);

    // Un seul Pokémon Méga-Évolué par équipe.
    const zone = seedContent.zones.find(
      (z) => z.regionId === 'kanto' && z.enabled && z.unlock.type === 'always',
    )!;
    const launch = await call<{ error: string; errors: { code: string }[] }>(
      'POST',
      '/api/expeditions',
      {
        zoneId: zone.id,
        team: [a.id, b.id],
        durationMinutes: zone.durationsMinutes[0],
        ballItemId: null,
        berryItemId: null,
      },
    );
    expect(launch.status).toBe(400);
    expect(launch.body.errors).toContainEqual({ code: 'TOO_MANY_MEGAS', max: 1 });

    // Retour à la normale : la gemme revient, la forme reste au Pokédex.
    const reverted = await call<PokemonDto>('DELETE', `/api/pokemon/${a.id}/mega`);
    expect(reverted.body).toMatchObject({ formId: null, megaStone: null });
    expect(await gems()).toBe(1);
    const forms = await call<PokedexFormEntryDto[]>('GET', '/api/pokedex/forms');
    expect(forms.body.map((f) => f.formId)).toContain(MEGA_X);
    expect((await call('DELETE', `/api/pokemon/${a.id}/mega`)).body).toMatchObject({
      error: 'NOT_MEGA',
    });

    // Un Pokémon transféré rend sa gemme.
    const transfer = await call<TransferPokemonResponse>('POST', '/api/pokemon/transfer', {
      ids: [b.id],
    });
    expect(transfer.status).toBe(200);
    expect(await gems()).toBe(2);
  });
});
