import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import {
  completableZones,
  createGameContext,
  playableContent,
  zoneCompletionPokemon,
} from '@poke/game-core';
import {
  createDb,
  ensureSeedContent,
  inventory,
  pokedex,
  pokedexForms,
  pokemon,
  users,
} from '@poke/db';
import type {
  BattleDto,
  ClaimBattleResponse,
  ClaimRewardResponse,
  DaycareResponse,
  EvolveResponse,
  ExpeditionsResponse,
  PokemonDto,
  ProgressionResponse,
} from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
let clock = new Date('2026-10-07T10:00:00Z');
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

const advance = (minutes: number) => {
  clock = new Date(clock.getTime() + minutes * 60_000);
};

async function newPlayer(email: string, trainerName: string, starterId: number) {
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
  const call = async <T>(method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const r = await app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload !== undefined && { payload: payload as object }),
    });
    return { status: r.statusCode, body: (r.body ? r.json() : null) as T };
  };
  expect((await call('POST', '/api/profile', { trainerName })).status).toBe(201);
  const starter = await call<PokemonDto>('POST', '/api/starter', { speciesId: starterId });
  expect(starter.status).toBe(201);
  return { call, userId: user!.id, starter: starter.body };
}

const setLevel = (id: string, level: number) =>
  handle.db.update(pokemon).set({ level }).where(eq(pokemon.id, id));

const giveItem = (ownerId: string, itemId: string, quantity: number) =>
  handle.db
    .insert(inventory)
    .values({ ownerId, itemId, quantity })
    .onConflictDoUpdate({ target: [inventory.ownerId, inventory.itemId], set: { quantity } });

const itemCount = async (ownerId: string, itemId: string) => {
  const [row] = await handle.db
    .select()
    .from(inventory)
    .where(and(eq(inventory.ownerId, ownerId), eq(inventory.itemId, itemId)));
  return row?.quantity ?? 0;
};

/** Marque des espèces comme capturées au Pokédex. */
const catchSpecies = (ownerId: string, ids: number[]) =>
  handle.db
    .insert(pokedex)
    .values(ids.map((speciesId) => ({ ownerId, speciesId, seen: true, caught: true })))
    .onConflictDoNothing();

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const evolveBody = (toSpeciesId: number) => ({ toSpeciesId, utcOffsetMinutes: 120 });

describe('évolutions', () => {
  let call: Awaited<ReturnType<typeof newPlayer>>['call'];
  let userId: string;
  let starter: PokemonDto;

  beforeAll(async () => {
    ({ call, userId, starter } = await newPlayer('evo@example.com', 'Evoli', 1));
  });

  it('refuse une évolution dont les conditions ne sont pas remplies', async () => {
    const early = await call<{ error: string }>(
      'POST',
      `/api/pokemon/${starter.id}/evolve`,
      evolveBody(2),
    );
    expect(early.status).toBe(409);
    expect(early.body.error).toBe('EVOLUTION_NOT_READY');
    const wrong = await call<{ error: string }>(
      'POST',
      `/api/pokemon/${starter.id}/evolve`,
      evolveBody(3),
    );
    expect(wrong.body.error).toBe('EVOLUTION_NOT_FOUND');
  });

  it('fait évoluer au niveau requis et enregistre l’espèce au Pokédex', async () => {
    await setLevel(starter.id, 16);
    const res = await call<EvolveResponse>(
      'POST',
      `/api/pokemon/${starter.id}/evolve`,
      evolveBody(2),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      fromSpeciesId: 1,
      consumedItemId: null,
      newSpeciesIds: [2],
      pokemon: { id: starter.id, speciesId: 2, level: 16, ability: starter.ability },
    });
    const [entry] = await handle.db
      .select()
      .from(pokedex)
      .where(and(eq(pokedex.ownerId, userId), eq(pokedex.speciesId, 2)));
    expect(entry?.caught).toBe(true);
  });

  it('consomme l’objet d’évolution (pierre, Câble Link)', async () => {
    const [abra] = await handle.db
      .insert(pokemon)
      .values({
        ownerId: userId,
        speciesId: 64,
        level: 20,
        ivHp: 1,
        ivAtk: 1,
        ivDef: 1,
        ivSpa: 1,
        ivSpd: 1,
        ivSpe: 1,
        nature: 'hardy',
        ability: 'synchronize',
        gender: 'male',
        origin: 'capture',
      })
      .returning();
    const missing = await call<{ error: string }>(
      'POST',
      `/api/pokemon/${abra!.id}/evolve`,
      evolveBody(65),
    );
    expect(missing.body.error).toBe('EVOLUTION_NOT_READY');

    await giveItem(userId, 'linking-cord', 2);
    const res = await call<EvolveResponse>(
      'POST',
      `/api/pokemon/${abra!.id}/evolve`,
      evolveBody(65),
    );
    expect(res.status).toBe(200);
    expect(res.body.consumedItemId).toBe('linking-cord');
    expect(res.body.pokemon.speciesId).toBe(65);
    expect(await itemCount(userId, 'linking-cord')).toBe(1);
  });

  it('refuse un Pokémon occupé', async () => {
    const start = await call('POST', '/api/expeditions', {
      zoneId: 'route-1',
      durationMinutes: 15,
      team: [starter.id],
      ballItemId: null,
      berryItemId: null,
    });
    expect(start.status).toBe(201);
    await setLevel(starter.id, 40);
    const busy = await call<{ error: string }>(
      'POST',
      `/api/pokemon/${starter.id}/evolve`,
      evolveBody(3),
    );
    expect(busy.body.error).toBe('POKEMON_BUSY');
  });
});

describe('emplacements et collections', () => {
  let call: Awaited<ReturnType<typeof newPlayer>>['call'];
  let userId: string;
  let starter: PokemonDto;
  const claim = (kind: 'collection', rewardId: string) =>
    call<ClaimRewardResponse & { error?: string }>('POST', '/api/progression/claim', {
      kind,
      rewardId,
    });

  beforeAll(async () => {
    ({ call, userId, starter } = await newPlayer('dex@example.com', 'Chen', 4));
  });

  it('part des emplacements de départ', async () => {
    const res = await call<ProgressionResponse>('GET', '/api/progression');
    expect(res.body).toEqual({
      claims: [],
      slots: { expeditions: 2, daycare: 1 },
      facilities: { expedition: 2, daycare: 1, incubator: 6, museum: 2, farm: 9, center: 6 },
      bonuses: { capture: 1, xp: 1, money: 1, shiny: 1 },
    });
  });

  it('refuse une récompense inconnue', async () => {
    expect((await claim('collection', 'inconnu')).status).toBe(404);
  });

  it('débloque les emplacements des bâtiments au fil du Pokédex, sans rien réclamer', async () => {
    // Seed : un emplacement d'expédition à 10 % du Pokédex de Kanto, une pension à 25 %.
    await catchSpecies(userId, range(1, 16));
    const expeditions = await call<ExpeditionsResponse>('GET', '/api/expeditions');
    expect(expeditions.body.slots).toBe(3);
    expect((await call<DaycareResponse>('GET', '/api/daycare')).body.slots).toBe(1);

    await catchSpecies(userId, range(17, 38));
    expect((await call<DaycareResponse>('GET', '/api/daycare')).body.slots).toBe(2);
    const res = await call<ProgressionResponse>('GET', '/api/progression');
    expect(res.body.slots).toEqual({ expeditions: 3, daycare: 2 });
  });

  it('active les bonus permanents des collections', async () => {
    // Formes d'Évoli : l'espèce et sa forme Partenaire (Pokédex des formes).
    const evoli = seedContent.collections.find((c) => c.id === 'formes-evoli')!;
    await catchSpecies(userId, [133]);
    expect((await claim('collection', 'formes-evoli')).body.error).toBe('REWARD_LOCKED');
    await handle.db
      .insert(pokedexForms)
      .values(
        evoli.formIds.map((formId) => ({ ownerId: userId, formId, firstCaughtAt: new Date() })),
      );
    expect((await claim('collection', 'formes-evoli')).status).toBe(200);
    const res = await call<ProgressionResponse>('GET', '/api/progression');
    expect(res.body.bonuses).toEqual({ capture: 1, xp: 1, money: 1.01, shiny: 1 });
    expect(res.body.claims.map((c) => `${c.kind}:${c.rewardId}`).sort()).toEqual([
      'collection:formes-evoli',
    ]);

    // Bonus d'argent (+1 %) appliqué aux gains de combat.
    await setLevel(starter.id, 60);
    const start = await call<BattleDto>('POST', '/api/battles', {
      trainerId: 'gamin-tom',
      team: [starter.id],
      moves: [{ type: 'fire', category: 'physical' }],
    });
    expect(start.status, JSON.stringify(start.body)).toBe(201);
    // Le combat se termine au plus tard au bout du temps imparti (1 min 30 contre Tom).
    advance(2);
    const result = await call<ClaimBattleResponse>('POST', `/api/battles/${start.body.id}/claim`);
    expect(result.body.battle.outcome).toBe('win');
    const tom = seedContent.trainers.find((t) => t.id === 'gamin-tom')!;
    expect(result.body.battle.result?.money).toBe(Math.floor(tom.money * 1.01));
  });
});

describe('complétion des expéditions', () => {
  const ctx = createGameContext(playableContent({ versionId: 1, ...seedContent }));
  const kantoZones = completableZones(ctx, 'kanto');
  const zone = kantoZones[0]!;
  let call: Awaited<ReturnType<typeof newPlayer>>['call'];
  let userId: string;
  const claim = (rewardId: string, targetId?: string) =>
    call<ClaimRewardResponse & { error?: string }>('POST', '/api/progression/claim', {
      kind: 'completion',
      rewardId,
      targetId,
    });
  /** Marque au Pokédex chaque Pokémon des expéditions (espèces et formes), en shiny au besoin. */
  async function catchZones(zones: typeof kantoZones, caughtShiny: boolean) {
    const list = zones.flatMap((z) => zoneCompletionPokemon(ctx, z));
    const species = [...new Set(list.map((p) => p.speciesId))];
    await handle.db
      .insert(pokedex)
      .values(
        species.map((speciesId) => ({
          ownerId: userId,
          speciesId,
          seen: true,
          caught: true,
          caughtShiny,
        })),
      )
      .onConflictDoUpdate({
        target: [pokedex.ownerId, pokedex.speciesId],
        set: { caught: true, caughtShiny },
      });
    const forms = [...new Set(list.flatMap((p) => (p.formId == null ? [] : [p.formId])))];
    if (forms.length > 0) {
      await handle.db
        .insert(pokedexForms)
        .values(
          forms.map((formId) => ({
            ownerId: userId,
            formId,
            caughtShiny,
            firstCaughtAt: new Date(),
          })),
        )
        .onConflictDoNothing();
    }
  }

  beforeAll(async () => {
    ({ call, userId } = await newPlayer('completion@example.com', 'Lyra', 1));
  });

  it('refuse une complétion inconnue, une cible inconnue ou pas encore complétée', async () => {
    expect((await claim('inconnue', zone.id)).status).toBe(404);
    expect((await claim('expedition-chromatique', 'zone-inconnue')).status).toBe(404);
    expect((await claim('expedition-chromatique')).status).toBe(404);
    expect((await claim('expedition-chromatique', zone.id)).body.error).toBe('REWARD_LOCKED');
  });

  it('une expédition complétée en chromatique donne +1 % de chance shiny, une seule fois', async () => {
    await catchZones([zone], true);
    const res = await claim('expedition-chromatique', zone.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.targetId).toBe(zone.id);
    expect((await claim('expedition-chromatique', zone.id)).body.error).toBe('ALREADY_CLAIMED');
    const progression = await call<ProgressionResponse>('GET', '/api/progression');
    expect(progression.body.bonuses.shiny).toBeCloseTo(1.01);
    expect(progression.body.claims.map((c) => `${c.kind}:${c.rewardId}`)).toEqual([
      `completion:expedition-chromatique:${zone.id}`,
    ]);
  });

  it('toutes les expéditions d’une région complétées donnent une couveuse', async () => {
    expect((await claim('region-complete', 'kanto')).body.error).toBe('REWARD_LOCKED');
    await catchZones(kantoZones.slice(1), false);
    expect((await claim('region-complete', 'kanto')).status).toBe(200);
    const progression = await call<ProgressionResponse>('GET', '/api/progression');
    expect(progression.body.facilities.incubator).toBe(seedContent.balance.breeding.maxEggs + 6);
    const daycare = await call<DaycareResponse>('GET', '/api/daycare');
    expect(daycare.body.maxEggs).toBe(seedContent.balance.breeding.maxEggs + 6);
  });
});
