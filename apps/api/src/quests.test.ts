import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent, inventory, users } from '@poke/db';
import type {
  ClaimExpeditionResponse,
  ClaimQuestResponse,
  ExpeditionDto,
  ExpeditionsResponse,
  InventoryEntryDto,
  LegendaryEncounterDto,
  PokemonDto,
  QuestsResponse,
  UseItemResponse,
} from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
let clock = new Date('2026-10-07T10:00:00Z');
let app: Awaited<ReturnType<typeof buildApp>>['app'];

// Quête de test : 1 capture, puis 1 expédition sur la Route 1 ; la Forêt de Jade ouvre à l'étape 2.
const content = structuredClone(seedContent);
content.balance.capture.globalMultiplier = 1000;
content.quests.push({
  id: 'quete-test',
  order: 10,
  name: 'Quête de test',
  description: '',
  image: null,
  regionId: 'kanto',
  enabled: true,
  unlock: { type: 'always' },
  steps: [
    {
      name: 'Capturer',
      description: '',
      condition: { type: 'catchPokemon', count: 1, pokemonType: null, speciesId: null },
    },
    {
      name: 'Explorer',
      description: '',
      condition: {
        type: 'expedition',
        zoneId: 'route-1',
        count: 1,
        memberType: null,
        memberCount: 1,
        minMemberPower: 0,
      },
    },
  ],
  rewards: {
    currency: 500,
    items: [{ itemId: 'bottle-cap', quantity: 1 }],
    expeditionSlots: 1,
    daycareSlots: 0,
    bonuses: [],
    pokemon: [
      {
        speciesId: 150,
        level: 70,
        perfectIvs: 3,
        expedition: {
          durationMinutes: 60,
          minPower: 0,
          requiredTypes: [],
          affinityTypes: ['water'],
        },
        roaming: null,
      },
    ],
  },
});
// Quête désactivée : jamais visible, même si sa condition est remplie.
content.quests.push({
  ...structuredClone(content.quests.at(-1)!),
  id: 'quete-desactivee',
  enabled: false,
  unlock: { type: 'always' },
});
const foret = content.zones.find((z) => z.id === 'foret-de-jade')!;
foret.minPower = 0;
foret.unlock = { type: 'questStepsDone', questId: 'quete-test', count: 1 };

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

describe('quêtes', () => {
  let call: Awaited<ReturnType<typeof newPlayer>>['call'];
  let userId: string;
  let starter: PokemonDto;

  beforeAll(async () => {
    ({ call, userId, starter } = await newPlayer('quete@example.com', 'Quêteur', 7));
  });

  const quest = async () =>
    (await call<QuestsResponse>('GET', '/api/quests')).body.quests.find(
      (q) => q.questId === 'quete-test',
    );
  const ballCount = async () =>
    (await call<InventoryEntryDto[]>('GET', '/api/inventory')).body.find(
      (i) => i.itemId === 'poke-ball',
    )?.quantity ?? 0;

  async function run(zoneId: string) {
    const started = await call<ExpeditionDto>('POST', '/api/expeditions', {
      zoneId,
      durationMinutes: 15,
      team: [starter.id],
      ballItemId: 'poke-ball',
      berryItemId: null,
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    advance(15);
    const claimed = await call<ClaimExpeditionResponse>(
      'POST',
      `/api/expeditions/${started.body.id}/claim`,
    );
    expect(claimed.status).toBe(200);
    return claimed.body;
  }

  it('affiche les quêtes débloquées seulement', async () => {
    const { body } = await call<QuestsResponse>('GET', '/api/quests');
    // Les quêtes légendaires du seed demandent 2 badges.
    expect(body.quests.map((q) => q.questId)).toEqual(['quete-test']);
    expect(body.quests[0]).toMatchObject({ status: 'active', step: 0, count: 0 });
  });

  it('fait avancer les étapes avec les expéditions, sans double comptage', async () => {
    const locked = await call('POST', '/api/expeditions', {
      zoneId: 'foret-de-jade',
      durationMinutes: 15,
      team: [starter.id],
      ballItemId: null,
      berryItemId: null,
    });
    expect(locked.status).toBe(403);

    const first = await run('route-1');
    expect(first.captured.length).toBeGreaterThan(0);
    // L'expédition valide l'étape 1 (capture) mais ne compte pas pour l'étape 2.
    expect(await quest()).toMatchObject({ status: 'active', step: 1, count: 0 });

    // L'étape 1 validée ouvre la Forêt de Jade.
    await run('foret-de-jade');
    expect(await quest()).toMatchObject({ step: 1, count: 0 });
    await run('route-1');
    expect(await quest()).toMatchObject({ status: 'completed', step: 2 });
  });

  const legendaryRun = { team: [] as string[] };

  it('donne la récompense une seule fois, sans le Pokémon (à capturer en expédition)', async () => {
    legendaryRun.team = [starter.id];
    const early = await call<{ error: string }>(
      'POST',
      '/api/quests/quete-test/expedition',
      legendaryRun,
    );
    expect(early.body.error).toBe('QUEST_NOT_CLAIMED');

    const before = await call<{ profile: { currency: number } }>('GET', '/api/me');
    const claimed = await call<ClaimQuestResponse>('POST', '/api/quests/quete-test/claim');
    expect(claimed.status, JSON.stringify(claimed.body)).toBe(200);
    expect(claimed.body).not.toHaveProperty('pokemon');
    expect(claimed.body.currency).toBe(before.body.profile.currency + 500);
    expect(claimed.body.slots.expeditions).toBe(seedContent.balance.expeditions.initialSlots + 1);
    expect(await quest()).toMatchObject({ status: 'claimed', pokemonCaught: 0 });

    const again = await call<{ error: string }>('POST', '/api/quests/quete-test/claim');
    expect(again.body.error).toBe('ALREADY_CLAIMED');
  });

  it('expédition légendaire : rencontre au retour, fuite, relance en chaîne puis une seule Ball', async () => {
    const started = await call<ExpeditionDto>(
      'POST',
      '/api/quests/quete-test/expedition',
      legendaryRun,
    );
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    expect(started.body).toMatchObject({
      questId: 'quete-test',
      zoneId: null,
      durationMinutes: 60,
      ballItemId: null,
      balls: 0,
      shinyChain: 0,
    });
    const twice = await call<{ error: string }>(
      'POST',
      '/api/quests/quete-test/expedition',
      legendaryRun,
    );
    expect(twice.body.error).toBe('QUEST_EXPEDITION_RUNNING');
    const early = await call<{ error: string }>(
      'GET',
      `/api/expeditions/${started.body.id}/encounter`,
    );
    expect(early.body.error).toBe('NOT_FINISHED');

    advance(60);
    const encounter = await call<LegendaryEncounterDto>(
      'GET',
      `/api/expeditions/${started.body.id}/encounter`,
    );
    expect(encounter.body).toMatchObject({ speciesId: 150, level: 70, shinyChain: 0 });
    const undecided = await call<{ error: string }>(
      'POST',
      `/api/expeditions/${started.body.id}/claim`,
    );
    expect(undecided.body.error).toBe('DECISION_REQUIRED');
    const balls = await ballCount();
    const fled = await call<ClaimExpeditionResponse>(
      'POST',
      `/api/expeditions/${started.body.id}/claim`,
      { ballItemId: null, berryItemId: null },
    );
    expect(fled.status, JSON.stringify(fled.body)).toBe(200);
    expect(fled.body.captured).toEqual([]);
    expect(fled.body.expedition.result).toMatchObject({ team: [], xpPerMember: 0, ballsUsed: 0 });
    expect(fled.body.expedition.result!.encounters).toMatchObject([
      { speciesId: 150, outcome: 'fled', isShiny: encounter.body.isShiny },
    ]);
    expect(await ballCount()).toBe(balls);
    expect(await quest()).toMatchObject({ pokemonCaught: 0 });

    // Relancée dans le délai : la chaîne de la quête prend un maillon.
    const chains = await call<ExpeditionsResponse>('GET', '/api/expeditions');
    expect(chains.body.questChains).toMatchObject([{ questId: 'quete-test', chain: 1 }]);
    const again = await call<ExpeditionDto>(
      'POST',
      '/api/quests/quete-test/expedition',
      legendaryRun,
    );
    expect(again.body).toMatchObject({ shinyChain: 1 });
    advance(60);
    const claimed = await call<ClaimExpeditionResponse>(
      'POST',
      `/api/expeditions/${again.body.id}/claim`,
      { ballItemId: 'poke-ball', berryItemId: null },
    );
    expect(claimed.status, JSON.stringify(claimed.body)).toBe(200);
    expect(await ballCount()).toBe(balls - 1);
    const [mewtwo] = claimed.body.captured;
    expect(mewtwo).toMatchObject({ speciesId: 150, level: 70, origin: 'quest' });
    expect(Object.values(mewtwo!.ivs).filter((iv) => iv === 31).length).toBeGreaterThanOrEqual(3);
    expect(claimed.body.expedition.result).toMatchObject({ ballsUsed: 1, newSpeciesIds: [150] });
    expect(claimed.body.expedition.result!.encounters).toHaveLength(1);
    expect(await quest()).toMatchObject({ pokemonCaught: 1 });

    const done = await call<{ error: string }>(
      'POST',
      '/api/quests/quete-test/expedition',
      legendaryRun,
    );
    expect(done.body.error).toBe('QUEST_POKEMON_CAUGHT');
  });

  it('refuse une quête verrouillée ou inconnue', async () => {
    expect((await call('POST', '/api/quests/mewtwo/claim')).status).toBe(409);
    expect((await call('POST', '/api/quests/inconnue/claim')).status).toBe(404);
  });

  it('cache les régions, zones et quêtes désactivées', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/content' });
    const playable = res.json<typeof content>();
    expect(playable.regions.map((r) => r.id)).toEqual(['kanto', 'johto']);
    expect(playable.zones.map((z) => z.id)).not.toContain('route-101');
    expect(playable.quests.map((q) => q.id)).not.toContain('quete-desactivee');

    const hoenn = await call('POST', '/api/expeditions', {
      zoneId: 'route-101',
      durationMinutes: 15,
      team: [starter.id],
      ballItemId: null,
      berryItemId: null,
    });
    expect(hoenn.status).toBe(404);
    const { body } = await call<QuestsResponse>('GET', '/api/quests');
    expect(body.quests.map((q) => q.questId)).not.toContain('quete-desactivee');
    expect((await call('POST', '/api/quests/quete-desactivee/claim')).status).toBe(404);
  });

  describe('objets endgame', () => {
    let target: PokemonDto;

    beforeAll(async () => {
      const list = await call<PokemonDto[]>('GET', '/api/pokemon');
      target = list.body.find((p) => p.speciesId === 150)!;
      await handle.db.insert(inventory).values([
        { ownerId: userId, itemId: 'adamant-mint', quantity: 1 },
        { ownerId: userId, itemId: 'ability-patch', quantity: 1 },
        { ownerId: userId, itemId: 'ability-capsule', quantity: 2 },
      ]);
    });

    it('Capsule d’Argent : un IV choisi passe à 31, l’objet est consommé', async () => {
      const stat = (Object.keys(target.ivs) as (keyof PokemonDto['ivs'])[]).find(
        (s) => target.ivs[s] < 31,
      );
      if (!stat) return; // IV déjà parfaits : rien à tester avec ce seed
      const used = await call<UseItemResponse>('POST', `/api/pokemon/${target.id}/use-item`, {
        itemId: 'bottle-cap',
        stat,
      });
      expect(used.status, JSON.stringify(used.body)).toBe(200);
      expect(used.body.pokemon.ivs[stat]).toBe(31);
      expect(used.body.remaining).toBe(0);
      const none = await call<{ error: string }>('POST', `/api/pokemon/${target.id}/use-item`, {
        itemId: 'bottle-cap',
        stat,
      });
      expect(none.body.error).toBe('NO_EFFECT');
    });

    it('Aromate et Patch Talent', async () => {
      const mint = await call<UseItemResponse>('POST', `/api/pokemon/${target.id}/use-item`, {
        itemId: 'adamant-mint',
      });
      if (target.nature === 'adamant') {
        expect(mint.status).toBe(400);
      } else {
        expect(mint.body.pokemon).toMatchObject({
          nature: 'adamant',
          originalNature: target.nature,
        });
      }
      // Le Pokémon reçu en récompense arrive sans talent.
      expect(target.ability).toBe('');
      const patch = await call<UseItemResponse>('POST', `/api/pokemon/${target.id}/use-item`, {
        itemId: 'ability-patch',
      });
      expect(patch.status).toBe(200);
      expect(patch.body.pokemon.ability).toBe('unnerve');
      const [left] = await handle.db
        .select()
        .from(inventory)
        .where(and(eq(inventory.ownerId, userId), eq(inventory.itemId, 'ability-patch')));
      expect(left?.quantity).toBe(0);
      // Pilule Talent : Mewtwo n'a qu'un talent normal, Pression ; une seconde Pilule est sans effet.
      const pill = await call<UseItemResponse>('POST', `/api/pokemon/${target.id}/use-item`, {
        itemId: 'ability-capsule',
      });
      expect(pill.body.pokemon.ability).toBe('pressure');
      const again = await call<{ error: string }>('POST', `/api/pokemon/${target.id}/use-item`, {
        itemId: 'ability-capsule',
      });
      expect(again.body.error).toBe('NO_EFFECT');
    });

    it('refuse un Pokémon occupé ou un objet sans effet sur les Pokémon', async () => {
      const ball = await call<{ error: string }>('POST', `/api/pokemon/${starter.id}/use-item`, {
        itemId: 'poke-ball',
      });
      expect(ball.body.error).toBe('NOT_USABLE_ON_POKEMON');
      await call('POST', '/api/expeditions', {
        zoneId: 'route-1',
        durationMinutes: 15,
        team: [target.id],
        ballItemId: null,
        berryItemId: null,
      });
      const busy = await call<{ error: string }>('POST', `/api/pokemon/${target.id}/use-item`, {
        itemId: 'gold-bottle-cap',
      });
      expect(busy.body.error).toBe('POKEMON_BUSY');
    });
  });
});
