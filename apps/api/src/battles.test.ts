import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { getSpecies } from '@poke/data';
import { createDb, ensureSeedContent, pokemon, trainerProgress, users } from '@poke/db';
import { simulateDungeon } from '@poke/game-core';
import type { PokemonInstance } from '@poke/game-core';
import type { BattleDto, BattlesResponse, ClaimBattleResponse, PokemonDto } from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';
import { addItems, insertPokemon } from './game/store';

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
  return async <T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => {
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

/** Attaque par défaut (premier type, physique) pour chaque Pokémon. */
const moves = (team: readonly { speciesId: number }[]) =>
  team.map((p) => ({ type: getSpecies(p.speciesId)!.types[0]!, category: 'physical' }));

async function start(
  call: Player['call'],
  trainerId: string,
  team: readonly { id: string; speciesId: number }[],
) {
  return call<BattleDto>('POST', '/api/battles', {
    trainerId,
    team: team.map((p) => p.id),
    moves: moves(team),
  });
}

/** Avance l'horloge jusqu'à la fin du combat (simulé comme le serveur et le navigateur). */
function finish(battle: BattleDto) {
  const { state } = simulateDungeon(
    battle.setup,
    battle.commands,
    battle.fledAtMs,
    battle.setup.timeLimitMs,
  );
  clock = new Date(Date.parse(battle.startedAt) + (state.endedAtMs ?? battle.setup.timeLimitMs));
  return state;
}

/** Le joueur a battu ces dresseurs (déblocages). */
async function defeated(userId: string, trainerIds: string[]) {
  await handle.db
    .insert(trainerProgress)
    .values(
      trainerIds.map((trainerId) => ({ ownerId: userId, trainerId, wins: 1, lastWinAt: clock })),
    );
}

type Player = Awaited<ReturnType<typeof newPlayer>>;

describe('combats de dresseurs', () => {
  let call: Player['call'];
  let userId: string;
  let starter: PokemonDto;

  beforeAll(async () => {
    ({ call, userId, starter } = await newPlayer('blue@example.com', 'Blue'));
  });

  it('liste le combat en cours et le bilan', async () => {
    const res = await call<BattlesResponse>('GET', '/api/battles');
    expect(res.body).toMatchObject({ active: null, last: null, records: [] });
  });

  it('refuse un dresseur verrouillé ou inconnu', async () => {
    const locked = await start(call, 'pierre', [starter]);
    expect(locked).toMatchObject({ status: 403, body: { error: 'TRAINER_LOCKED' } });
    const unknown = await start(call, 'inconnu', [starter]);
    expect(unknown).toMatchObject({ status: 404, body: { error: 'TRAINER_NOT_FOUND' } });
  });

  it('gagne : argent, XP, bonheur, temps de recharge et déblocages', async () => {
    const strong = await give(userId, 9);
    const res = await start(call, 'gamin-tom', [strong]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const battle = res.body;
    expect(battle.setup.timeLimitMs).toBe(90_000);
    expect(battle.setup.enemies.map((e) => e.speciesId)).toEqual([19]);
    expect(battle.setup.team[0]).toMatchObject({ attackType: 'water', category: 'physical' });

    // L'équipe est occupée ; un seul combat de dresseur à la fois.
    const pokemon = await call<PokemonDto[]>('GET', '/api/pokemon');
    expect(pokemon.body.find((p) => p.id === strong.id)).toMatchObject({
      busy: true,
      activity: 'battle',
    });
    const other = await start(call, 'gamin-tom', [starter]);
    expect(other.body).toMatchObject({ error: 'BATTLE_BUSY' });
    const early = await call('POST', `/api/battles/${battle.id}/claim`);
    expect(early.body).toMatchObject({ error: 'NOT_FINISHED' });

    expect(finish(battle).outcome).toBe('win');
    const claim = await call<ClaimBattleResponse>('POST', `/api/battles/${battle.id}/claim`);
    expect(claim.status, JSON.stringify(claim.body)).toBe(200);
    expect(claim.body.battle.outcome).toBe('win');
    expect(claim.body.battle.result).toMatchObject({
      money: 80,
      knockedOut: [],
      badgeEarned: false,
      defeated: 1,
    });
    expect(claim.body.battle.result!.xpPerMember).toBeGreaterThan(0);
    expect(claim.body.currency).toBe(80);
    const again = await call('POST', `/api/battles/${battle.id}/claim`);
    expect(again.body).toMatchObject({ error: 'ALREADY_CLAIMED' });

    const after = (await call<PokemonDto[]>('GET', '/api/pokemon')).body.find(
      (p) => p.id === strong.id,
    )!;
    expect(after).toMatchObject({ busy: false, knockedOut: false, happiness: 73 });

    // Dresseur répétable : 4 h de recharge après le combat.
    const cooldown = await start(call, 'gamin-tom', [strong]);
    expect(cooldown.body).toMatchObject({ error: 'TRAINER_COOLDOWN' });
    const list = await call<BattlesResponse>('GET', '/api/battles');
    expect(list.body.active).toBeNull();
    expect(list.body.last?.id).toBe(battle.id);
    expect(list.body.records).toEqual([
      expect.objectContaining({
        trainerId: 'gamin-tom',
        wins: 1,
        losses: 0,
        lastEndedAt: clock.toISOString(),
      }),
    ]);
  });

  it('perd : XP des vaincus seulement, Pokémon K.O., recharge même après une défaite', async () => {
    // Lise est débloquée par la victoire contre Tom.
    const weak = await give(userId, 10, { level: 1, xp: 0 });
    const res = await start(call, 'fillette-lise', [weak]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(finish(res.body).outcome).toBe('loss');
    const claim = await call<ClaimBattleResponse>('POST', `/api/battles/${res.body.id}/claim`);
    expect(claim.body.battle.outcome).toBe('loss');
    expect(claim.body.battle.result).toMatchObject({ money: 0, loot: [], knockedOut: [weak.id] });
    expect(claim.body.currency).toBe(80);

    const ko = (await call<PokemonDto[]>('GET', '/api/pokemon')).body.find(
      (p) => p.id === weak.id,
    )!;
    // K.O. sans fin de repos : il attend ses soins au Centre Pokémon.
    expect(ko).toMatchObject({ knockedOut: true, healUntil: null });
    const retry = await start(call, 'fillette-lise', [starter]);
    expect(retry.body).toMatchObject({ error: 'TRAINER_COOLDOWN' });
    const records = (await call<BattlesResponse>('GET', '/api/battles')).body.records;
    expect(records).toContainEqual(
      expect.objectContaining({ trainerId: 'fillette-lise', wins: 0, losses: 1 }),
    );
  });

  it('soigne les Pokémon K.O. au Centre Pokémon, dans la limite des places', async () => {
    const [weak] = (await call<PokemonDto[]>('GET', '/api/pokemon')).body.filter(
      (p) => p.knockedOut,
    );
    const notKo = await call('POST', '/api/center', { pokemonIds: [starter.id] });
    expect(notKo).toMatchObject({ status: 409, body: { error: 'POKEMON_NOT_KO' } });

    const ko = await call('PUT', '/api/assistants/daycare', { pokemonId: weak!.id });
    expect(ko.body).toMatchObject({ error: 'POKEMON_KO' });
    const healed = await call<PokemonDto[]>('POST', '/api/center', { pokemonIds: [weak!.id] });
    expect(healed.status, JSON.stringify(healed.body)).toBe(200);
    expect(healed.body).toMatchObject([
      { knockedOut: false, healUntil: new Date(clock.getTime() + 30 * 60_000).toISOString() },
    ]);
    const twice = await call('POST', '/api/center', { pokemonIds: [weak!.id] });
    expect(twice.body).toMatchObject({ error: 'POKEMON_NOT_KO' });
    const healing = await call('PUT', '/api/assistants/daycare', { pokemonId: weak!.id });
    expect(healing.body).toMatchObject({ error: 'POKEMON_HEALING' });

    // 6 places : une est prise, six Pokémon K.O. de plus n'y tiennent pas.
    const others = await Promise.all(Array.from({ length: 6 }, () => give(userId, 10)));
    const ids = others.map((p) => p.id);
    await handle.db.update(pokemon).set({ knockedOut: true }).where(inArray(pokemon.id, ids));
    const full = await call('POST', '/api/center', { pokemonIds: ids });
    expect(full).toMatchObject({ status: 409, body: { error: 'CENTER_FULL' } });
    expect((await call('POST', '/api/center', { pokemonIds: ids.slice(0, 5) })).status).toBe(200);

    // Soins terminés : de nouveau libre, et sa place se libère.
    advance(30);
    const assigned = await call('PUT', '/api/assistants/daycare', { pokemonId: weak!.id });
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
    await call('DELETE', '/api/assistants/daycare');
    expect((await call('POST', '/api/center', { pokemonIds: [ids[5]] })).status).toBe(200);
  });

  it('ranime des Pokémon K.O. avec un Rappel chacun', async () => {
    const ko = await Promise.all([give(userId, 10), give(userId, 10)]);
    const ids = ko.map((p) => p.id);
    await handle.db.update(pokemon).set({ knockedOut: true }).where(inArray(pokemon.id, ids));

    const notRevive = await call('POST', '/api/center/revive', {
      itemId: 'poke-ball',
      pokemonIds: ids,
    });
    expect(notRevive.body).toMatchObject({ error: 'NOT_A_REVIVE' });
    await addItems(handle.db, userId, [{ itemId: 'revive', quantity: 1 }]);
    const missing = await call('POST', '/api/center/revive', { itemId: 'revive', pokemonIds: ids });
    expect(missing.body).toMatchObject({ error: 'ITEM_MISSING' });

    const revived = await call<PokemonDto[]>('POST', '/api/center/revive', {
      itemId: 'revive',
      pokemonIds: [ids[0]],
    });
    expect(revived.status, JSON.stringify(revived.body)).toBe(200);
    expect(revived.body).toMatchObject([{ knockedOut: false, healUntil: null }]);
    const again = await call('POST', '/api/center/revive', {
      itemId: 'revive',
      pokemonIds: [ids[0]],
    });
    expect(again.body).toMatchObject({ error: 'POKEMON_NOT_KO' });
    // Le Rappel a bien été consommé.
    const last = await call('POST', '/api/center/revive', {
      itemId: 'revive',
      pokemonIds: [ids[1]],
    });
    expect(last.body).toMatchObject({ error: 'ITEM_MISSING' });
  });

  it('fuit sans récompense ni défaite', async () => {
    advance(5 * 60);
    const res = await start(call, 'gamin-tom', [starter]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    advance(1 / 60);
    const fled = await call<ClaimBattleResponse>('POST', `/api/battles/${res.body.id}/flee`);
    expect(fled.status, JSON.stringify(fled.body)).toBe(200);
    expect(fled.body.battle).toMatchObject({ outcome: 'fled', fledAtMs: 1000 });
    expect(fled.body.battle.result).toMatchObject({ money: 0, xpPerMember: 0 });
    const records = (await call<BattlesResponse>('GET', '/api/battles')).body.records;
    expect(records).toContainEqual(
      expect.objectContaining({ trainerId: 'gamin-tom', wins: 1, losses: 0 }),
    );
  });

  it('change de Pokémon pendant le combat', async () => {
    advance(5 * 60);
    const second = await give(userId, 8);
    const res = await start(call, 'gamin-tom', [starter, second]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    advance(1 / 60);
    const sw = await call<BattleDto>('POST', `/api/battles/${res.body.id}/switch`, {
      member: 1,
      atMs: 1000,
    });
    expect(sw.status, JSON.stringify(sw.body)).toBe(200);
    expect(sw.body.commands).toEqual([{ atMs: 1000, member: 1 }]);
    const active = await call('POST', `/api/battles/${res.body.id}/switch`, {
      member: 1,
      atMs: 1000,
    });
    expect(active.body).toMatchObject({ error: 'MEMBER_ACTIVE' });
    finish(sw.body);
    const claim = await call<ClaimBattleResponse>('POST', `/api/battles/${res.body.id}/claim`);
    expect(claim.status).toBe(200);
  });

  it('vérifie les conditions d’équipe du dresseur', async () => {
    // Léo exige des Pokémon de niveau 15 au plus et un badge pour être débloqué.
    await defeated(userId, ['pierre']);
    const strong = await give(userId, 8);
    const res = await start(call, 'campeur-leo', [strong]);
    expect(res).toMatchObject({
      status: 400,
      body: { error: 'TEAM_INVALID', errors: [{ code: 'LEVEL_TOO_HIGH', maxLevel: 15 }] },
    });
    const badMove = await call('POST', '/api/battles', {
      trainerId: 'campeur-leo',
      team: [starter.id],
      moves: [{ type: 'grass', category: 'special' }],
    });
    expect(badMove).toMatchObject({
      status: 400,
      body: { error: 'TEAM_INVALID', errors: [{ code: 'INVALID_MOVE' }] },
    });
    await handle.db.delete(trainerProgress).where(eq(trainerProgress.trainerId, 'pierre'));
  });

  it('réclame tout seul un combat terminé pendant l’absence du joueur', async () => {
    advance(5 * 60);
    const res = await start(call, 'gamin-tom', [starter]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    advance(10);
    const pokemon = await call<PokemonDto[]>('GET', '/api/pokemon');
    expect(pokemon.body.find((p) => p.id === starter.id)).toMatchObject({ busy: false });
    const list = await call<BattlesResponse>('GET', '/api/battles');
    expect(list.body.active).toBeNull();
    expect(list.body.last).toMatchObject({ id: res.body.id, resultSeenAt: null });
    const seen = await call('POST', `/api/battles/${res.body.id}/seen`);
    expect(seen.status).toBe(204);
    const after = await call<BattlesResponse>('GET', '/api/battles');
    expect(after.body.last?.resultSeenAt).not.toBeNull();
  });
});

describe('dresseurs uniques', () => {
  it('se retentent aussitôt après une défaite, donnent un badge à la première victoire', async () => {
    const { call, userId } = await newPlayer('green@example.com', 'Green');
    await defeated(userId, ['scout-rick']);
    const weak = [
      await give(userId, 10, { level: 1, xp: 0 }),
      await give(userId, 13, { level: 1, xp: 0 }),
    ];
    // PE minimale de Pierre : 150.
    const tooWeak = await start(call, 'pierre', weak);
    expect(tooWeak.body).toMatchObject({ error: 'TEAM_INVALID' });

    const team = [
      await give(userId, 8, { level: 40 }),
      await give(userId, 2, { level: 40, gender: 'female' }),
    ];
    const res = await start(call, 'pierre', team);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.setup.timeLimitMs).toBe(120_000);
    // Fuite : un dresseur unique se retente aussitôt.
    advance(1 / 60);
    expect((await call('POST', `/api/battles/${res.body.id}/flee`)).status).toBe(200);
    const rematch = await start(call, 'pierre', team);
    expect(rematch.status, JSON.stringify(rematch.body)).toBe(201);
    expect(finish(rematch.body).outcome).toBe('win');
    const claim = await call<ClaimBattleResponse>('POST', `/api/battles/${rematch.body.id}/claim`);
    expect(claim.body.battle.result).toMatchObject({ badgeEarned: true, money: 1400 });

    advance(24 * 60);
    const again = await start(call, 'pierre', team);
    expect(again.body).toMatchObject({ error: 'TRAINER_DEFEATED' });
  });
});
