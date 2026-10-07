import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent, inventory, pokedex, users } from '@poke/db';
import type {
  ClaimExpeditionResponse,
  ClaimRewardResponse,
  ExpeditionDto,
  ExpeditionsResponse,
  PokemonDto,
} from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
let clock = new Date('2026-10-07T10:00:00Z');
let app: Awaited<ReturnType<typeof buildApp>>['app'];

// Taux de base 1/3 : avec le Charme Chroma (×3), toutes les rencontres sont shiny.
const content = structuredClone(seedContent);
content.balance.shiny.baseRateDenominator = 3;

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

describe('shinies', () => {
  let call: Awaited<ReturnType<typeof newPlayer>>['call'];
  let userId: string;
  let starter: PokemonDto;

  beforeAll(async () => {
    ({ call, userId, starter } = await newPlayer('shiny@example.com', 'Chroma', 4));
  });

  /** Lance une expédition de 15 min sur la Route 1, puis la récupère. */
  async function run(ballItemId: string | null = null) {
    const started = await call<ExpeditionDto>('POST', '/api/expeditions', {
      zoneId: 'route-1',
      durationMinutes: 15,
      team: [starter.id],
      ballItemId,
      berryItemId: null,
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    advance(15);
    const claimed = await call<ClaimExpeditionResponse>(
      'POST',
      `/api/expeditions/${started.body.id}/claim`,
    );
    expect(claimed.status).toBe(200);
    return { started: started.body, result: claimed.body.expedition.result! };
  }

  it('fait monter la chaîne de zone en relançant la même zone dans le délai', async () => {
    const first = await run();
    expect(first.started.shinyChain).toBe(0);
    expect(first.result.shinyChance).toBeCloseTo(1 / 3);

    const list = await call<ExpeditionsResponse>('GET', '/api/expeditions');
    expect(list.body.chains).toEqual([
      {
        zoneId: 'route-1',
        chain: 1,
        expiresAt: new Date(clock.getTime() + 120 * 60_000).toISOString(),
      },
    ]);

    advance(30);
    const second = await run();
    expect(second.started.shinyChain).toBe(1);
    expect(second.result.shinyChance).toBeCloseTo(1.25 / 3);
  });

  it('remet la chaîne à 0 une fois le délai passé', async () => {
    advance(121);
    expect((await call<ExpeditionsResponse>('GET', '/api/expeditions')).body.chains).toEqual([]);
    expect((await run()).started.shinyChain).toBe(0);
  });

  it('applique le Charme Chroma possédé et remplit le Pokédex shiny', async () => {
    advance(200);
    await handle.db.insert(inventory).values([
      { ownerId: userId, itemId: 'shiny-charm', quantity: 1 },
      { ownerId: userId, itemId: 'ultra-ball', quantity: 50 },
    ]);
    const { result } = await run('ultra-ball');
    expect(result.shinyChance).toBe(1);
    expect(result.encounters.every((e) => e.isShiny)).toBe(true);
    const captured = result.encounters.filter((e) => e.outcome === 'captured');
    const dex = await handle.db.select().from(pokedex).where(eq(pokedex.ownerId, userId));
    for (const e of captured) {
      expect(dex.find((d) => d.speciesId === e.speciesId)?.caughtShiny).toBe(true);
    }
  });

  it('accorde les paliers shiny sur le Pokédex shiny seulement', async () => {
    const ids = Array.from({ length: 8 }, (_, i) => i + 10);
    await handle.db
      .insert(pokedex)
      .values(ids.map((speciesId) => ({ ownerId: userId, speciesId, seen: true, caught: true })))
      .onConflictDoNothing();
    const claim = () =>
      call<ClaimRewardResponse & { error?: string }>('POST', '/api/progression/claim', {
        kind: 'milestone',
        rewardId: 'kanto-shiny-5',
      });
    const locked = await claim();
    expect(locked.status).toBe(409);
    expect(locked.body.error).toBe('REWARD_LOCKED');

    await handle.db.update(pokedex).set({ caughtShiny: true }).where(eq(pokedex.ownerId, userId));
    const ok = await claim();
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.rewards.currency).toBe(20_000);
  });
});
