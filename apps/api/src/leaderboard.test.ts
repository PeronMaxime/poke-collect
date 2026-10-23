import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import {
  createDb,
  ensureSeedContent,
  playerProfiles,
  pokedex,
  pokedexForms,
  pokemon,
  trainerProgress,
  users,
} from '@poke/db';
import type {
  FeaturedPokemonDto,
  LeaderboardResponse,
  TrainerPokedexResponse,
  TrainerProfileResponse,
  TrainerSearchResultDto,
} from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
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

async function newPlayer(email: string, trainerName: string, starterId: number | null) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    payload: { email, password: 'motdepasse-solide', name: trainerName },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookies = res.headers['set-cookie'];
  const list = Array.isArray(cookies) ? cookies : [cookies ?? ''];
  const cookie = list.map((c) => c.split(';')[0]).join('; ');
  const [user] = await handle.db.select().from(users).where(eq(users.email, email));
  const call = async <T>(method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => {
    const r = await app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload !== undefined && { payload: payload as object }),
    });
    return { status: r.statusCode, body: (r.body ? r.json() : null) as T };
  };
  expect((await call('POST', '/api/profile', { trainerName })).status).toBe(201);
  if (starterId !== null) {
    expect((await call('POST', '/api/starter', { speciesId: starterId })).status).toBe(201);
  }
  return { call, userId: user!.id };
}

describe('Classement', () => {
  it('classe les dresseurs par espèces, argent, badges et chromatiques', async () => {
    const red = await newPlayer('red@example.com', 'Red', 1);
    const blue = await newPlayer('blue@example.com', 'Blue', 4);
    const green = await newPlayer('green@example.com', 'Green', 7);
    // Sans starter : absent des classements.
    const newbie = await newPlayer('new@example.com', 'Nouveau', null);

    await handle.db.insert(pokedex).values([
      { ownerId: blue.userId, speciesId: 16, seen: true, caught: true, caughtShiny: true },
      { ownerId: blue.userId, speciesId: 19, seen: true, caught: true },
      { ownerId: blue.userId, speciesId: 10, seen: true, caught: false },
      { ownerId: green.userId, speciesId: 16, seen: true, caught: true },
    ]);
    // Formes du Pokédex comptées avec les espèces : Rattata d'Alola (shiny), Méga-Florizarre ;
    // une forme naturelle (Pikachu à casquette, sans case au Pokédex) ne compte pas.
    const at = new Date();
    await handle.db.insert(pokedexForms).values([
      { ownerId: red.userId, formId: 10091, caughtShiny: true, firstCaughtAt: at },
      { ownerId: red.userId, formId: 10033, firstCaughtAt: at },
      { ownerId: green.userId, formId: 10094, firstCaughtAt: at },
    ]);
    await handle.db
      .update(playerProfiles)
      .set({ currency: 5000 })
      .where(eq(playerProfiles.userId, red.userId));
    const [gym, other] = [
      seedContent.trainers.find((t) => t.badge)!,
      seedContent.trainers.find((t) => !t.badge)!,
    ];
    await handle.db.insert(trainerProgress).values([
      { ownerId: green.userId, trainerId: gym.id, wins: 2 },
      { ownerId: blue.userId, trainerId: gym.id, wins: 0, losses: 3 },
      { ownerId: blue.userId, trainerId: other.id, wins: 1 },
    ]);

    const species = await red.call<LeaderboardResponse>('GET', '/api/leaderboard/species');
    expect(species.status).toBe(200);
    expect(species.body.total).toBe(3);
    // Starter compris : Blue 3 espèces (starter + 2), Red 1 + 2 formes, Green 2.
    expect(species.body.entries.map((e) => [e.rank, e.trainerName, e.value])).toEqual([
      [1, 'Blue', 3],
      [1, 'Red', 3],
      [3, 'Green', 2],
    ]);
    expect(species.body.me).toMatchObject({ rank: 1, trainerName: 'Red', isMe: true });

    const money = await blue.call<LeaderboardResponse>('GET', '/api/leaderboard/money');
    expect(money.body.entries[0]).toMatchObject({ trainerName: 'Red', value: 5000 });

    const badges = await blue.call<LeaderboardResponse>('GET', '/api/leaderboard/badges');
    expect(badges.body.entries.map((e) => [e.rank, e.trainerName, e.value])).toEqual([
      [1, 'Green', 1],
      [2, 'Blue', 0],
      [2, 'Red', 0],
    ]);

    const shiny = await green.call<LeaderboardResponse>('GET', '/api/leaderboard/shiny');
    expect(shiny.body.entries.map((e) => [e.rank, e.trainerName, e.value])).toEqual([
      [1, 'Blue', 1],
      [1, 'Red', 1],
      [3, 'Green', 0],
    ]);
    expect(shiny.body.me).toMatchObject({ rank: 3, value: 0 });

    const none = await newbie.call<LeaderboardResponse>('GET', '/api/leaderboard/species');
    expect(none.body.me).toBeNull();
    expect((await red.call('GET', '/api/leaderboard/unknown')).status).toBe(400);
  });
});

describe('Fiches Dresseur des autres joueurs', () => {
  it('recherche un dresseur, montre sa fiche, son Pokédex et ses Pokémon mis en avant', async () => {
    const sacha = await newPlayer('sacha@example.com', 'Sacha', 1);
    const ondine = await newPlayer('ondine@example.com', 'Ondine', 7);
    await newPlayer('sans-starter@example.com', 'Sachou', null);

    const search = await ondine.call<TrainerSearchResultDto[]>('GET', '/api/trainers?q=sach');
    expect(search.status).toBe(200);
    // Sans starter : introuvable.
    expect(search.body).toEqual([{ trainerName: 'Sacha', starterSpeciesId: 1 }]);
    expect((await ondine.call('GET', '/api/trainers?q=')).status).toBe(400);
    expect((await ondine.call('GET', '/api/trainers?q=%25')).body).toEqual([]);

    const [starter] = await handle.db
      .select()
      .from(pokemon)
      .where(eq(pokemon.ownerId, sacha.userId));
    const { id: _, ...copy } = starter!;
    const [second] = await handle.db
      .insert(pokemon)
      .values({ ...copy, speciesId: 16, isShiny: true })
      .returning();

    const featured = await sacha.call<FeaturedPokemonDto[]>('PUT', '/api/trainer-card/featured', {
      pokemonIds: [second!.id, starter!.id],
    });
    expect(featured.status).toBe(200);
    expect(featured.body.map((p) => p.speciesId)).toEqual([16, 1]);
    // Pas le Pokémon d'un autre joueur.
    expect(
      (await ondine.call('PUT', '/api/trainer-card/featured', { pokemonIds: [starter!.id] }))
        .status,
    ).toBe(404);

    const card = await ondine.call<TrainerProfileResponse>('GET', '/api/trainers/sacha');
    expect(card.status).toBe(200);
    expect(card.body).toMatchObject({ trainerName: 'Sacha', starterSpeciesId: 1, isMe: false });
    expect(card.body.progress.caughtSpeciesIds).toContain(1);
    expect(card.body.card.featured.map((p) => [p.speciesId, p.isShiny])).toEqual([
      [16, true],
      [1, false],
    ]);
    expect((await ondine.call('GET', '/api/trainers/Personne')).status).toBe(404);
    expect((await ondine.call('GET', '/api/trainers/Sachou')).status).toBe(404);

    const dex = await ondine.call<TrainerPokedexResponse>('GET', '/api/trainers/Sacha/pokedex');
    expect(dex.status).toBe(200);
    expect(dex.body.entries.find((e) => e.speciesId === 1)).toMatchObject({ caught: true });

    // Transféré : il quitte la vitrine.
    expect((await sacha.call('POST', '/api/pokemon/transfer', { ids: [second!.id] })).status).toBe(
      200,
    );
    const after = await ondine.call<TrainerProfileResponse>('GET', '/api/trainers/Sacha');
    expect(after.body.card.featured.map((p) => p.speciesId)).toEqual([1]);
  });
});
