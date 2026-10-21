import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent, pokemon, users } from '@poke/db';
import type { BetaProfilesResponse, MeResponse } from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
const ORIGIN = 'http://localhost:5173';
let app: Awaited<ReturnType<typeof buildApp>>['app'];

beforeAll(async () => {
  await handle.migrate();
  await ensureSeedContent(handle.db, seedContent);
  ({ app } = await buildApp({ db: handle.db, env }));
});
afterAll(async () => {
  await app.close();
  await handle.close();
});

const request = (method: 'GET' | 'POST', url: string, cookie: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: {
      origin: ORIGIN,
      cookie,
      ...(payload !== undefined && { 'content-type': 'application/json' }),
    },
    ...(payload !== undefined && { payload: payload as object }),
  });

const cookieOf = (res: { headers: Record<string, unknown> }) => {
  const raw = res.headers['set-cookie'];
  return (Array.isArray(raw) ? raw : [String(raw ?? '')]).map((c) => c.split(';')[0]).join('; ');
};

async function newPlayer(email: string, trainerName: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    payload: { email, password: 'mot-de-passe', name: 'Dresseur' },
  });
  const cookie = cookieOf(res);
  expect((await request('POST', '/api/profile', cookie, { trainerName })).statusCode).toBe(201);
  const starter = seedContent.regions[0]!.starterSpeciesIds[0]!;
  expect((await request('POST', '/api/starter', cookie, { speciesId: starter })).statusCode).toBe(
    201,
  );
  return cookie;
}

describe('profils secondaires (bêta)', () => {
  it('nouvelle partie préfixée, bascule et retour au profil principal', async () => {
    const session = await newPlayer('pierre@example.com', 'Pierre');

    const created = await request('POST', '/api/beta/profiles', session);
    expect(created.statusCode, created.body).toBe(201);
    const list = created.json<BetaProfilesResponse>();
    const alt = list.profiles.find((p) => !p.main)!;
    expect(alt).toMatchObject({ trainerName: 'Alt1_Pierre', starterChosen: false });
    expect(list.activeProfileId).toBe(alt.id);

    // Le profil secondaire est une partie neuve : starter à choisir, PC vide.
    const onAlt = `${session}; ${cookieOf(created)}`;
    const me = (await request('GET', '/api/me', onAlt)).json<MeResponse>();
    expect(me.profile).toMatchObject({ trainerName: 'Alt1_Pierre', starterSpeciesId: null });
    expect(me.user.email).toBe('pierre@example.com');
    const starter = seedContent.regions[0]!.starterSpeciesIds[1]!;
    expect((await request('POST', '/api/starter', onAlt, { speciesId: starter })).statusCode).toBe(
      201,
    );
    const altPokemon = await handle.db.select().from(pokemon).where(eq(pokemon.ownerId, alt.id));
    expect(altPokemon.map((p) => p.speciesId)).toEqual([starter]);

    // Second profil : numéro suivant.
    const second = await request('POST', '/api/beta/profiles', onAlt);
    expect(second.json<BetaProfilesResponse>().profiles.map((p) => p.trainerName)).toEqual([
      'Pierre',
      'Alt1_Pierre',
      'Alt2_Pierre',
    ]);

    const back = await request('POST', '/api/beta/profiles/active', onAlt, { profileId: null });
    const onMain = `${session}; ${cookieOf(back)}`;
    const main = (await request('GET', '/api/me', onMain)).json<MeResponse>();
    expect(main.profile?.trainerName).toBe('Pierre');
  });

  it('un profil d’un autre compte est ignoré ou refusé', async () => {
    const owner = await newPlayer('ondine@example.com', 'Ondine');
    const created = await request('POST', '/api/beta/profiles', owner);
    const altCookie = cookieOf(created);
    const altId = created.json<BetaProfilesResponse>().activeProfileId;

    const thief = await newPlayer('flora@example.com', 'Flora');
    const me = (await request('GET', '/api/me', `${thief}; ${altCookie}`)).json<MeResponse>();
    expect(me.profile?.trainerName).toBe('Flora');
    const select = await request('POST', '/api/beta/profiles/active', thief, { profileId: altId });
    expect(select.statusCode).toBe(404);
  });

  it('supprimés avec le compte principal', async () => {
    const session = await newPlayer('aulne@example.com', 'Aulne');
    const altId = (
      await request('POST', '/api/beta/profiles', session)
    ).json<BetaProfilesResponse>().activeProfileId;
    const del = await request('POST', '/api/auth/delete-user', session, {
      password: 'mot-de-passe',
    });
    expect(del.statusCode, del.body).toBe(200);
    expect(await handle.db.select().from(users).where(eq(users.id, altId))).toEqual([]);
  });
});
