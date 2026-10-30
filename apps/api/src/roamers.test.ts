import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent } from '@poke/db';
import type {
  ClaimExpeditionResponse,
  ExpeditionDto,
  ExpeditionsResponse,
  PokemonDto,
  QuestsResponse,
} from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
let clock = new Date('2026-10-07T10:00:00Z');
let app: Awaited<ReturnType<typeof buildApp>>['app'];

// Quête de test : une capture, puis Raikou en fuyard. Au départ, seules la Route 1 et la Forêt de
// Jade sont débloquées (sans puissance minimale) : il se cache dans l'une des deux, et chaque rencontre est lui (100 %) ; la
// capture est assurée s'il reste une Ball.
const content = structuredClone(seedContent);
content.balance.capture.globalMultiplier = 1000;
const foretDeJade = content.zones.find((z) => z.id === 'foret-de-jade')!;
foretDeJade.unlock = { type: 'always' };
// La zone du fuyard dépend du joueur : le starter seul doit pouvoir partir dans les deux.
foretDeJade.minPower = 0;
const raikou = content.quests.find((q) => q.id === 'raikou')!.rewards.pokemon[0]!;
content.quests.push({
  id: 'fuyard-test',
  order: 10,
  name: 'Fuyard de test',
  description: '',
  image: null,
  regionId: 'kanto',
  enabled: true,
  unlock: { type: 'always' },
  steps: [
    {
      name: 'Capturer',
      description: '',
      condition: {
        type: 'catchPokemon',
        count: 1,
        pokemonType: null,
        speciesId: null,
        zoneId: null,
      },
    },
  ],
  rewards: {
    currency: 0,
    items: [],
    expeditionSlots: 0,
    daycareSlots: 0,
    incubators: 0,
    bonuses: [],
    pokemon: [{ ...raikou, roaming: 100 }],
  },
});

beforeAll(async () => {
  await handle.migrate();
  await ensureSeedContent(handle.db, content);
  ({ app } = await buildApp({ db: handle.db, env, now: () => clock }));
});
afterAll(async () => {
  await app.close();
  await handle.close();
});

const advance = (minutes: number) => {
  clock = new Date(clock.getTime() + minutes * 60_000);
};

describe('Pokémon fuyards', () => {
  let call: <T>(
    method: 'GET' | 'POST',
    url: string,
    payload?: unknown,
  ) => Promise<{ status: number; body: T }>;
  let starter: PokemonDto;

  beforeAll(async () => {
    const email = 'fuyard@example.com';
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      payload: { email, password: 'motdepasse-solide', name: 'Traqueur' },
    });
    expect(res.statusCode, res.body).toBe(200);
    const cookies = res.headers['set-cookie'];
    const cookie = (Array.isArray(cookies) ? cookies : [cookies ?? ''])
      .map((c) => c.split(';')[0])
      .join('; ');
    call = async <T>(method: 'GET' | 'POST', url: string, payload?: unknown) => {
      const r = await app.inject({
        method,
        url,
        headers: { cookie },
        ...(payload !== undefined && { payload: payload as object }),
      });
      return { status: r.statusCode, body: (r.body ? r.json() : null) as T };
    };
    expect((await call('POST', '/api/profile', { trainerName: 'Traqueur' })).status).toBe(201);
    starter = (await call<PokemonDto>('POST', '/api/starter', { speciesId: 7 })).body;
  });

  const roamers = async () =>
    (await call<ExpeditionsResponse>('GET', '/api/expeditions')).body.roamers;
  const quest = async () =>
    (await call<QuestsResponse>('GET', '/api/quests')).body.quests.find(
      (q) => q.questId === 'fuyard-test',
    );
  const start = (zoneId = 'route-1', ballItemId: string | null = 'poke-ball') =>
    call<ExpeditionDto>('POST', '/api/expeditions', {
      zoneId,
      durationMinutes: 15,
      team: [starter.id],
      ballItemId,
      berryItemId: null,
    });
  const roamerZone = async () => (await roamers())[0]!.zoneId;
  const claim = (id: string) =>
    call<ClaimExpeditionResponse>('POST', `/api/expeditions/${id}/claim`);

  it('n’apparaît qu’une fois la récompense de la quête réclamée', async () => {
    const first = await start();
    expect(first.body.roamerQuestIds).toEqual([]);
    advance(15);
    const claimed = await claim(first.body.id);
    expect(claimed.body.expedition.result!.encounters.some((e) => e.speciesId === 243)).toBe(false);
    expect(await roamers()).toEqual([]);

    expect((await call('POST', '/api/quests/fuyard-test/claim')).status).toBe(200);
    expect(await roamers()).toMatchObject([
      { questId: 'fuyard-test', speciesId: 243, encounterChance: 100 },
    ]);
    expect(['route-1', 'foret-de-jade']).toContain(await roamerZone());
    const legendary = await call<{ error: string }>('POST', '/api/quests/fuyard-test/expedition', {
      team: [starter.id],
    });
    expect(legendary.body.error).toBe('QUEST_POKEMON_ROAMING');
  });

  it('part avec l’expédition lancée dans sa zone, et revient si elle est annulée', async () => {
    const zoneId = await roamerZone();
    const started = await start(zoneId);
    expect(started.body.roamerQuestIds).toEqual(['fuyard-test']);
    expect(await roamers()).toEqual([]);
    expect((await call('POST', `/api/expeditions/${started.body.id}/cancel`)).status).toBe(204);
    expect(await roamerZone()).toBe(zoneId);
  });

  it('croisé sans être capturé, fuit aussitôt vers une autre zone', async () => {
    const zoneId = await roamerZone();
    const started = await start(zoneId, null);
    advance(15);
    const claimed = await claim(started.body.id);
    expect(claimed.status, JSON.stringify(claimed.body)).toBe(200);
    const met = claimed.body.expedition.result!.encounters.filter((e) => e.speciesId === 243);
    expect(met).toMatchObject([{ questId: 'fuyard-test', outcome: 'noBall' }]);
    expect(await quest()).toMatchObject({ pokemonCaught: 0 });
    const fled = await roamerZone();
    expect(fled).not.toBe(zoneId);
    // Il ne repart pas de sa cachette avant l'heure pleine suivante.
    advance(5);
    expect(await roamerZone()).toBe(fled);
  });

  it('se capture pendant l’expédition, une seule fois', async () => {
    const started = await start(await roamerZone());
    // Pendant l'expédition, l'heure change : il reste introuvable ailleurs.
    advance(60);
    expect(await roamers()).toEqual([]);
    const claimed = await claim(started.body.id);
    expect(claimed.status, JSON.stringify(claimed.body)).toBe(200);
    const met = claimed.body.expedition.result!.encounters.filter((e) => e.speciesId === 243);
    expect(met).toMatchObject([{ questId: 'fuyard-test', outcome: 'captured', level: 50 }]);
    expect(claimed.body.captured.filter((p) => p.speciesId === 243)).toHaveLength(1);
    expect(await quest()).toMatchObject({ pokemonCaught: 1 });
    expect(await roamers()).toEqual([]);

    // Capturé : il ne revient plus.
    const after = await start();
    expect(after.body.roamerQuestIds).toEqual([]);
  });
});
