import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import {
  createDb,
  ensureSeedContent,
  guildMembers,
  playerProfiles,
  pokemon,
  users,
} from '@poke/db';
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

const request = (
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  cookie: string,
  payload?: unknown,
  tabProfile?: string,
) =>
  app.inject({
    method,
    url,
    headers: {
      origin: ORIGIN,
      cookie,
      ...(tabProfile !== undefined && { 'x-dex-profile': tabProfile }),
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

  it('le profil de l’onglet (en-tête) est prioritaire sur le cookie', async () => {
    const session = await newPlayer('brock@example.com', 'Brock');
    const created = await request('POST', '/api/beta/profiles', session);
    const onAlt = `${session}; ${cookieOf(created)}`;
    const altId = created.json<BetaProfilesResponse>().activeProfileId;
    const nameOf = async (cookie: string, tabProfile?: string) =>
      (await request('GET', '/api/me', cookie, undefined, tabProfile)).json<MeResponse>().profile
        ?.trainerName;

    // Un onglet sans profil suit le cookie ; sinon l'en-tête l'emporte, dans les deux sens.
    expect(await nameOf(onAlt)).toBe('Alt1_Brock');
    expect(await nameOf(onAlt, 'main')).toBe('Brock');
    expect(await nameOf(session, altId)).toBe('Alt1_Brock');

    // Un profil d'un autre compte dans l'en-tête ramène au profil principal du compte connecté.
    const thief = await newPlayer('sbire@example.com', 'Sbire');
    expect(await nameOf(thief, altId)).toBe('Sbire');
  });

  it('suppression : partie effacée, retour au principal si actif, numéro réutilisable', async () => {
    const session = await newPlayer('agatha@example.com', 'Agatha');
    const created = await request('POST', '/api/beta/profiles', session);
    const altId = created.json<BetaProfilesResponse>().activeProfileId;
    const onAlt = `${session}; ${cookieOf(created)}`;
    const starter = seedContent.regions[0]!.starterSpeciesIds[0]!;
    await request('POST', '/api/starter', onAlt, { speciesId: starter });

    const removed = await request('DELETE', `/api/beta/profiles/${altId}`, onAlt);
    expect(removed.statusCode, removed.body).toBe(200);
    const list = removed.json<BetaProfilesResponse>();
    expect(list.profiles.map((p) => p.trainerName)).toEqual(['Agatha']);
    expect(list.activeProfileId).toBe(list.profiles[0]!.id);
    expect(String(removed.headers['set-cookie'])).toContain('Max-Age=0');
    expect(await handle.db.select().from(pokemon).where(eq(pokemon.ownerId, altId))).toEqual([]);
    expect((await request('GET', '/api/me', onAlt)).json<MeResponse>().profile?.trainerName).toBe(
      'Agatha',
    );

    const again = await request('POST', '/api/beta/profiles', session);
    expect(again.json<BetaProfilesResponse>().profiles.map((p) => p.trainerName)).toEqual([
      'Agatha',
      'Alt1_Agatha',
    ]);
  });

  it('suppression d’un autre profil : le profil actif ne change pas', async () => {
    const session = await newPlayer('olga@example.com', 'Olga');
    const altId = (
      await request('POST', '/api/beta/profiles', session)
    ).json<BetaProfilesResponse>().activeProfileId;
    const removed = await request(
      'DELETE',
      `/api/beta/profiles/${altId}`,
      session,
      undefined,
      'main',
    );
    expect(removed.statusCode, removed.body).toBe(200);
    const created = await request('POST', '/api/beta/profiles', session);
    const secondId = created.json<BetaProfilesResponse>().activeProfileId;
    const thirdId = (
      await request('POST', '/api/beta/profiles', session)
    ).json<BetaProfilesResponse>().activeProfileId;
    const kept = await request(
      'DELETE',
      `/api/beta/profiles/${thirdId}`,
      session,
      undefined,
      secondId,
    );
    expect(kept.json<BetaProfilesResponse>().activeProfileId).toBe(secondId);
  });

  it('ni le profil principal ni celui d’un autre compte ne peuvent être supprimés', async () => {
    const owner = await newPlayer('koga@example.com', 'Koga');
    const created = await request('POST', '/api/beta/profiles', owner);
    const list = created.json<BetaProfilesResponse>();
    const mainId = list.profiles.find((p) => p.main)!.id;
    expect((await request('DELETE', `/api/beta/profiles/${mainId}`, owner)).statusCode).toBe(404);

    const thief = await newPlayer('sabrina@example.com', 'Sabrina');
    const stolen = await request('DELETE', `/api/beta/profiles/${list.activeProfileId}`, thief);
    expect(stolen.statusCode).toBe(404);
    expect(
      await handle.db.select().from(users).where(eq(users.id, list.activeProfileId)),
    ).toHaveLength(1);
  });

  it('un chef de guilde supprimé passe la main', async () => {
    const leader = await newPlayer('blue@example.com', 'Blue');
    const created = await request('POST', '/api/beta/profiles', leader);
    const altId = created.json<BetaProfilesResponse>().activeProfileId;
    const onAlt = `${leader}; ${cookieOf(created)}`;
    const starter = seedContent.regions[0]!.starterSpeciesIds[0]!;
    await request('POST', '/api/starter', onAlt, { speciesId: starter });
    await handle.db
      .update(playerProfiles)
      .set({ currency: 1_000_000 })
      .where(eq(playerProfiles.userId, altId));
    const guild = await request('POST', '/api/guilds', onAlt, {
      name: 'Bourg Palette',
      description: '',
      joinMode: 'open',
    });
    expect(guild.statusCode, guild.body).toBe(201);
    const guildId = (
      await handle.db.select().from(guildMembers).where(eq(guildMembers.userId, altId))
    )[0]!.guildId;

    const heir = await newPlayer('red@example.com', 'Red');
    const joined = await request('POST', `/api/guilds/${guildId}/join`, heir);
    expect(joined.statusCode, joined.body).toBeLessThan(300);

    const removed = await request('DELETE', `/api/beta/profiles/${altId}`, onAlt);
    expect(removed.statusCode, removed.body).toBe(200);
    const members = await handle.db
      .select()
      .from(guildMembers)
      .where(eq(guildMembers.guildId, guildId));
    expect(members.map((m) => m.role)).toEqual(['leader']);
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
