import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent, trainerBattles, trainerProgress, users } from '@poke/db';
import { createRng } from '@poke/game-core';
import type { PokemonInstance } from '@poke/game-core';
import type {
  BattleDto,
  BattlesResponse,
  ClaimBattleResponse,
  MeResponse,
  PokemonDto,
} from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';
import { insertPokemon } from './game/store';

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

async function newPlayer(email: string, trainerName: string) {
  const { cookie, userId } = await signUp(email);
  const call = client(cookie);
  expect((await call('POST', '/api/profile', { trainerName })).status).toBe(201);
  const starter = await call<PokemonDto>('POST', '/api/starter', { speciesId: 7 });
  expect(starter.status).toBe(201);
  return { call, userId, starter: starter.body };
}

async function give(userId: string, speciesId: number, extra: Partial<PokemonInstance> = {}) {
  const ivs = {
    hp: 31,
    attack: 31,
    defense: 31,
    'special-attack': 31,
    'special-defense': 31,
    speed: 31,
  };
  const [row] = await insertPokemon(
    handle.db,
    userId,
    [
      {
        speciesId,
        level: 30,
        xp: 30_000,
        ivs,
        nature: 'hardy',
        ability: 'torrent',
        isShiny: false,
        gender: 'male',
        happiness: 70,
        ...extra,
      },
    ],
    { origin: 'capture', originRegion: 'kanto', at: clock },
  );
  return row!;
}

/**
 * Fixe le seed d'un combat pour forcer son issue : le premier tirage décide de la victoire,
 * et la probabilité reste toujours entre 5 % et 95 %.
 */
async function forceOutcome(battleId: string, outcome: 'win' | 'loss') {
  let seed = 0;
  for (; ; seed++) {
    const roll = createRng(seed).next();
    if (outcome === 'win' ? roll < 0.04 : roll > 0.96) break;
  }
  await handle.db.update(trainerBattles).set({ seed }).where(eq(trainerBattles.id, battleId));
}

describe('combats de dresseurs', () => {
  let call: Awaited<ReturnType<typeof newPlayer>>['call'];
  let userId: string;
  let starter: PokemonDto;

  beforeAll(async () => {
    ({ call, userId, starter } = await newPlayer('blue@example.com', 'Blue'));
  });

  it('liste les emplacements et le bilan', async () => {
    const res = await call<BattlesResponse>('GET', '/api/battles');
    expect(res.body).toMatchObject({ slots: 1, active: [], records: [] });
  });

  it('refuse un dresseur verrouillé ou inconnu', async () => {
    const locked = await call('POST', '/api/battles', { trainerId: 'pierre', team: [starter.id] });
    expect(locked).toMatchObject({ status: 403, body: { error: 'TRAINER_LOCKED' } });
    const unknown = await call('POST', '/api/battles', { trainerId: 'red', team: [starter.id] });
    expect(unknown).toMatchObject({ status: 404, body: { error: 'TRAINER_NOT_FOUND' } });
  });

  it('gagne : argent, butin, XP, bonheur, temps de recharge et déblocages', async () => {
    const start = await call<BattleDto>('POST', '/api/battles', {
      trainerId: 'gamin-tom',
      team: [starter.id],
    });
    expect(start.status).toBe(201);
    expect(Date.parse(start.body.endsAt) - Date.parse(start.body.startedAt)).toBe(10 * 60_000);

    // Le starter est occupé : ni expédition, ni second combat.
    const pokemon = await call<PokemonDto[]>('GET', '/api/pokemon');
    expect(pokemon.body[0]).toMatchObject({ busy: true, activity: 'battle', koUntil: null });
    const expedition = await call('POST', '/api/expeditions', {
      zoneId: 'route-1',
      durationMinutes: 15,
      team: [starter.id],
      ballItemId: null,
      berryItemId: null,
    });
    expect(expedition.body).toMatchObject({ error: 'POKEMON_BUSY' });
    const twice = await call('POST', '/api/battles', {
      trainerId: 'gamin-tom',
      team: [starter.id],
    });
    expect(twice.body).toMatchObject({ error: 'TRAINER_BUSY' });

    const early = await call('POST', `/api/battles/${start.body.id}/claim`);
    expect(early.body).toMatchObject({ error: 'NOT_FINISHED' });

    await forceOutcome(start.body.id, 'win');
    advance(10);
    const claim = await call<ClaimBattleResponse>('POST', `/api/battles/${start.body.id}/claim`);
    expect(claim.status, JSON.stringify(claim.body)).toBe(200);
    const { battle, currency } = claim.body;
    expect(battle.outcome).toBe('win');
    expect(battle.result).toMatchObject({ money: 80, koMinutes: 0, koUntil: null });
    expect(battle.result!.xpPerMember).toBeGreaterThan(0);
    expect(currency).toBe(80);

    const again = await call('POST', `/api/battles/${start.body.id}/claim`);
    expect(again.body).toMatchObject({ error: 'ALREADY_CLAIMED' });

    const me = await call<MeResponse>('GET', '/api/me');
    expect(me.body.profile!.currency).toBe(80);
    const after = (await call<PokemonDto[]>('GET', '/api/pokemon')).body[0]!;
    expect(after).toMatchObject({ busy: false, koUntil: null });
    expect(after.xp).toBeGreaterThan(starter.xp);
    expect(after.happiness).toBe(starter.happiness + 3);

    // Dresseur répétable : 4 h de recharge.
    const cooldown = await call('POST', '/api/battles', {
      trainerId: 'gamin-tom',
      team: [starter.id],
    });
    expect(cooldown.body).toMatchObject({ error: 'TRAINER_COOLDOWN' });

    const list = await call<BattlesResponse>('GET', '/api/battles');
    expect(list.body.records).toEqual([
      expect.objectContaining({ trainerId: 'gamin-tom', wins: 1, losses: 0 }),
    ]);
    const history = await call<BattleDto[]>('GET', '/api/battles/history');
    expect(history.body.map((b) => b.id)).toEqual([start.body.id]);
  });

  it('perd : aucune récompense et équipe K.O. pendant 1 h', async () => {
    // Lise est débloquée par la victoire contre Tom.
    const start = await call<BattleDto>('POST', '/api/battles', {
      trainerId: 'fillette-lise',
      team: [starter.id],
    });
    expect(start.status, JSON.stringify(start.body)).toBe(201);
    await forceOutcome(start.body.id, 'loss');
    advance(15);
    const claim = await call<ClaimBattleResponse>('POST', `/api/battles/${start.body.id}/claim`);
    expect(claim.body.battle.outcome).toBe('loss');
    expect(claim.body.battle.result).toMatchObject({ money: 0, loot: [], koMinutes: 60 });
    expect(claim.body.currency).toBe(80);

    const ko = (await call<PokemonDto[]>('GET', '/api/pokemon')).body[0]!;
    expect(ko.koUntil).toBe(new Date(clock.getTime() + 60 * 60_000).toISOString());
    expect(ko.busy).toBe(false);

    // K.O. : inutilisable en expédition, en combat et en pension.
    const expedition = await call('POST', '/api/expeditions', {
      zoneId: 'route-1',
      durationMinutes: 15,
      team: [starter.id],
      ballItemId: null,
      berryItemId: null,
    });
    expect(expedition).toMatchObject({ status: 409, body: { error: 'POKEMON_KO' } });
    const partner = await give(userId, 9, { gender: 'female' });
    const daycare = await call('POST', '/api/daycare', {
      parentAId: starter.id,
      parentBId: partner.id,
      heldItemAId: null,
      heldItemBId: null,
    });
    expect(daycare.body).toMatchObject({ error: 'POKEMON_KO' });

    advance(60);
    const healed = await call('POST', '/api/expeditions', {
      zoneId: 'route-1',
      durationMinutes: 15,
      team: [starter.id],
      ballItemId: null,
      berryItemId: null,
    });
    expect(healed.status).toBe(201);
    const records = (await call<BattlesResponse>('GET', '/api/battles')).body.records;
    expect(records).toContainEqual(
      expect.objectContaining({ trainerId: 'fillette-lise', wins: 0, losses: 1 }),
    );
  });

  it('vérifie les conditions d’équipe du dresseur', async () => {
    // Léo exige des Pokémon de niveau 15 au plus et un badge pour être débloqué.
    await handle.db.insert(trainerProgress).values({
      ownerId: userId,
      trainerId: 'pierre',
      wins: 1,
      firstWinAt: clock,
      lastWinAt: clock,
    });
    const strong = await give(userId, 8);
    const res = await call('POST', '/api/battles', { trainerId: 'campeur-leo', team: [strong.id] });
    expect(res).toMatchObject({
      status: 400,
      body: { error: 'TEAM_INVALID', errors: [{ code: 'LEVEL_TOO_HIGH', maxLevel: 15 }] },
    });
    await handle.db.delete(trainerProgress).where(eq(trainerProgress.trainerId, 'pierre'));
  });

  it('donne un badge pour une première victoire contre un dresseur unique', async () => {
    await handle.db
      .insert(trainerProgress)
      .values({ ownerId: userId, trainerId: 'scout-rick', wins: 1, lastWinAt: clock });
    const team = [await give(userId, 8), await give(userId, 2, { gender: 'female' })];
    const ids = team.map((p) => p.id);
    const start = await call<BattleDto>('POST', '/api/battles', { trainerId: 'pierre', team: ids });
    expect(start.status, JSON.stringify(start.body)).toBe(201);
    expect(Date.parse(start.body.endsAt) - Date.parse(start.body.startedAt)).toBe(60 * 60_000);
    await forceOutcome(start.body.id, 'win');
    advance(60);
    const claim = await call<ClaimBattleResponse>('POST', `/api/battles/${start.body.id}/claim`);
    expect(claim.body.battle.result).toMatchObject({ badgeEarned: true, money: 1400 });
    expect(claim.body.currency).toBe(80 + 1400);

    const rematch = await call('POST', '/api/battles', { trainerId: 'pierre', team: ids });
    expect(rematch.body).toMatchObject({ error: 'TRAINER_DEFEATED' });
    // Le badge ouvre le Mont Sélénite ; Ondine attend la Pique-niqueuse Ali (et sa condition de
    // PE minimale est remplie par cette équipe).
    const leo = await call('POST', '/api/battles', { trainerId: 'campeur-leo', team: ids });
    expect(leo.body).toMatchObject({ error: 'TEAM_INVALID' }); // débloqué, mais niveau 15 max
    expect((await call('POST', '/api/battles', { trainerId: 'ondine', team: ids })).body).toEqual({
      error: 'TRAINER_LOCKED',
    });
    await handle.db
      .insert(trainerProgress)
      .values({ ownerId: userId, trainerId: 'pique-niqueuse-ali', wins: 1, lastWinAt: clock });
    const misty = await call<BattleDto>('POST', '/api/battles', { trainerId: 'ondine', team: ids });
    expect(misty.status, JSON.stringify(misty.body)).toBe(201);
  });
});
