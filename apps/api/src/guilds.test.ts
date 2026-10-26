import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import {
  createDb,
  ensureSeedContent,
  guildWeeklyQuests,
  inventory,
  playerProfiles,
  users,
} from '@poke/db';
import { createGameContext, guildQuestTarget } from '@poke/game-core';
import type { GuildActivity } from '@poke/game-core';
import type {
  GuildMessagesResponse,
  GuildSearchResponse,
  GuildStateResponse,
  OpenChestResponse,
  PokemonDto,
} from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';
import { recordGuildActivity, resetGuildQuests, settleGuildQuests } from './game/guilds';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
// Mercredi 28 octobre 2026, midi à Paris.
let clock = new Date('2026-10-28T11:00:00Z');
let app: Awaited<ReturnType<typeof buildApp>>['app'];
const ctx = createGameContext({ versionId: 1, ...seedContent });

beforeAll(async () => {
  await handle.migrate();
  await ensureSeedContent(handle.db, seedContent);
  ({ app } = await buildApp({ db: handle.db, env, now: () => clock }));
});
afterAll(async () => {
  await app.close();
  await handle.close();
});

const advanceHours = (hours: number) => {
  clock = new Date(clock.getTime() + hours * 3_600_000);
};
/** Une minute de plus : les messages de la discussion se suivent dans l'ordre. */
const tick = () => advanceHours(1 / 60);

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function player(name: string) {
  const email = `${name.toLowerCase()}@example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    payload: { email, password: 'motdepasse-solide', name },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookies = res.headers['set-cookie'];
  const cookie = (Array.isArray(cookies) ? cookies : [cookies ?? ''])
    .map((c) => c.split(';')[0])
    .join('; ');
  const [user] = await handle.db.select().from(users).where(eq(users.email, email));
  const call = async <T>(method: Method, url: string, payload?: unknown) => {
    const r = await app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload !== undefined && { payload: payload as object }),
    });
    return { status: r.statusCode, body: (r.body ? r.json() : null) as T };
  };
  expect((await call('POST', '/api/profile', { trainerName: name })).status).toBe(201);
  expect((await call<PokemonDto>('POST', '/api/starter', { speciesId: 4 })).status).toBe(201);
  return { userId: user!.id, call };
}

const state = async (p: Awaited<ReturnType<typeof player>>) =>
  (await p.call<GuildStateResponse>('GET', '/api/guild')).body;

const quantity = async (userId: string, itemId: string) => {
  const rows = await handle.db.select().from(inventory).where(eq(inventory.ownerId, userId));
  return rows.find((r) => r.itemId === itemId)?.quantity ?? 0;
};

/** Une action qui fait avancer toutes les quêtes (captures de chaque type demandé comprises). */
function everything(): GuildActivity {
  const caught: { speciesId: number }[] = [];
  for (const type of ['normal', 'water', 'grass', 'fire', 'psychic']) {
    let n = 0;
    for (let id = 1; id <= 493 && n < 5; id++) {
      if (ctx.species(id)?.types.includes(type)) {
        caught.push({ speciesId: id });
        n++;
      }
    }
  }
  return {
    caught,
    expeditions: 5,
    battlesWon: 5,
    dungeonsWon: 5,
    eggsHatched: 5,
    money: 100_000,
  };
}

describe('guildes', () => {
  let ash: Awaited<ReturnType<typeof player>>;
  let misty: Awaited<ReturnType<typeof player>>;
  let brock: Awaited<ReturnType<typeof player>>;
  let guildId: string;

  beforeAll(async () => {
    ash = await player('Sacha');
    misty = await player('Ondine');
    brock = await player('Pierre');
  });

  it('crée une guilde contre 100 000 Poké Dollars, nom unique', async () => {
    const input = { name: 'Les Explorateurs', description: 'Bienvenue !', joinMode: 'open' };
    expect((await ash.call('POST', '/api/guilds', input)).body).toMatchObject({
      error: 'NOT_ENOUGH_MONEY',
    });
    await handle.db
      .update(playerProfiles)
      .set({ currency: 150_000 })
      .where(eq(playerProfiles.userId, ash.userId));
    tick();
    const created = await ash.call<GuildStateResponse>('POST', '/api/guilds', input);
    expect(created.status).toBe(201);
    expect(created.body.currency).toBe(50_000);
    expect(created.body.guild).toMatchObject({ name: 'Les Explorateurs', myRole: 'leader' });
    // Du jour : deux faciles (Bronze) et une difficile (Argent) ; de la semaine : deux faciles
    // (Argent) et une difficile (Or).
    expect(
      created.body.guild!.quests.map((q) => [q.period, q.difficulty, q.rarity].join(' ')),
    ).toEqual([
      'daily easy bronze',
      'daily easy bronze',
      'daily hard silver',
      'weekly easy silver',
      'weekly easy silver',
      'weekly hard gold',
    ]);
    expect(created.body.guild!.day).toEqual({
      id: '2026-10-28',
      endsAt: '2026-10-28T23:00:00.000Z',
    });
    expect(created.body.guild!.week).toEqual({
      id: '2026-10-26',
      endsAt: '2026-11-01T23:00:00.000Z',
    });
    guildId = created.body.guild!.id;

    await handle.db
      .update(playerProfiles)
      .set({ currency: 150_000 })
      .where(eq(playerProfiles.userId, misty.userId));
    const taken = await misty.call('POST', '/api/guilds', { ...input, name: 'les explorateurs' });
    expect(taken.body).toMatchObject({ error: 'GUILD_NAME_TAKEN' });
  });

  it('se trouve par la recherche et se rejoint directement quand elle est ouverte', async () => {
    const found = await misty.call<GuildSearchResponse>('GET', '/api/guilds?q=explo');
    expect(found.body.guilds).toEqual([
      expect.objectContaining({ id: guildId, memberCount: 1, leaderName: 'Sacha' }),
    ]);
    tick();
    expect((await misty.call('POST', `/api/guilds/${guildId}/join`)).body).toEqual({
      joined: true,
    });
    const s = await state(misty);
    expect(s.guild!.members.map((m) => [m.trainerName, m.role])).toEqual([
      ['Sacha', 'leader'],
      ['Ondine', 'member'],
    ]);
  });

  it('sur demande : candidature, puis acceptation par le chef', async () => {
    expect((await misty.call('PATCH', '/api/guild', { joinMode: 'request' })).status).toBe(403);
    expect((await ash.call('PATCH', '/api/guild', { joinMode: 'request' })).status).toBe(204);
    expect((await brock.call('POST', `/api/guilds/${guildId}/join`)).body).toEqual({
      joined: false,
    });
    expect((await state(brock)).myRequests).toEqual([
      expect.objectContaining({ id: guildId, requested: true }),
    ]);
    expect((await state(ash)).guild!.requests.map((r) => r.trainerName)).toEqual(['Pierre']);
    expect((await state(misty)).guild!.requests).toEqual([]);
    tick();
    expect((await ash.call('POST', '/api/guild/requests/Pierre/accept')).status).toBe(204);
    expect((await state(brock)).guild?.members).toHaveLength(3);
  });

  it('discussion entre membres, messages du jeu compris', async () => {
    tick();
    expect((await misty.call('POST', '/api/guild/messages', { body: 'Salut !' })).status).toBe(204);
    const { messages } = (await ash.call<GuildMessagesResponse>('GET', '/api/guild/messages')).body;
    expect(messages.map((m) => [m.trainerName, m.body])).toEqual([
      [null, 'Sacha a fondé la guilde « Les Explorateurs ».'],
      [null, 'Ondine a rejoint la guilde.'],
      [null, 'Pierre a rejoint la guilde.'],
      ['Ondine', 'Salut !'],
    ]);
    const mine = messages.at(-1)!;
    expect((await brock.call('DELETE', `/api/guild/messages/${mine.id}`)).status).toBe(404);
    expect((await ash.call('DELETE', `/api/guild/messages/${mine.id}`)).status).toBe(204);
  });

  it("les quêtes avancent au-delà de l'objectif ; personne n'a de coffre avant la fin", async () => {
    await handle.db
      .update(guildWeeklyQuests)
      .set({ target: 3 })
      .where(eq(guildWeeklyQuests.guildId, guildId));
    await recordGuildActivity(handle.db, ctx, misty.userId, everything(), clock);
    let s = await state(ash);
    expect(s.guild!.quests.every((q) => q.completedAt && q.progress > q.target)).toBe(true);
    const reached = s.guild!.quests.map((q) => q.progress);
    // Objectif atteint : Sacha peut encore participer.
    await recordGuildActivity(handle.db, ctx, ash.userId, everything(), clock);
    s = await state(ash);
    expect(s.guild!.quests.map((q) => q.progress)).toEqual(reached.map((p) => p * 2));
    expect(s.guild!.quests.every((q) => q.myContribution > 0 && q.contributors === 2)).toBe(true);
    for (const p of [misty, ash]) {
      for (const chest of ['bronze', 'silver', 'gold']) {
        expect(await quantity(p.userId, `guild-chest-${chest}`)).toBe(0);
      }
    }
    expect(await settleGuildQuests(handle.db, ctx, clock)).toBe(0);
  });

  it('à minuit (heure de Paris) : coffres des quêtes du jour, nouvelles quêtes du jour', async () => {
    clock = new Date('2026-10-28T22:59:00Z'); // mercredi, 23 h 59
    expect((await state(ash)).guild!.quests.every((q) => q.completedAt)).toBe(true);
    expect(await quantity(ash.userId, 'guild-chest-bronze')).toBe(0);
    clock = new Date('2026-10-28T23:00:00Z'); // jeudi, minuit
    const s = await state(ash);
    expect(s.guild!.day.id).toBe('2026-10-29');
    expect(s.guild!.week.id).toBe('2026-10-26');
    // Quêtes du jour : 2 faciles (Bronze) et 1 difficile (Argent) à chaque participant.
    for (const p of [misty, ash]) {
      expect(await quantity(p.userId, 'guild-chest-bronze')).toBe(2);
      expect(await quantity(p.userId, 'guild-chest-silver')).toBe(1);
      expect(await quantity(p.userId, 'guild-chest-gold')).toBe(0);
    }
    expect(await quantity(brock.userId, 'guild-chest-bronze')).toBe(0);
    // Distribués une seule fois.
    expect(await settleGuildQuests(handle.db, ctx, clock)).toBe(0);
    await state(misty);
    expect(await quantity(misty.userId, 'guild-chest-bronze')).toBe(2);

    const daily = s.guild!.quests.filter((q) => q.period === 'daily');
    expect(daily.every((q) => q.progress === 0 && !q.completedAt)).toBe(true);
    expect(s.guild!.quests.filter((q) => q.period === 'weekly').every((q) => q.completedAt)).toBe(
      true,
    );
    // 3 membres : l'objectif du jour du modèle suit le nombre de membres.
    const quest = daily[0]!;
    const { daily: goal } = ctx.guildQuests.find((q) => q.name === quest.name)!;
    expect(quest.target).toBe(guildQuestTarget(goal!, 3));
    expect(quest.target).toBe(Math.max(goal!.minCount, goal!.countPerMember * 3));

    const opened = await misty.call<OpenChestResponse>('POST', '/api/items/open-chest', {
      itemId: 'guild-chest-bronze',
      count: 2,
    });
    expect(opened.status).toBe(200);
    expect(opened.body.loot.length).toBeGreaterThan(0);
    expect(await quantity(misty.userId, 'guild-chest-bronze')).toBe(0);
    const again = await misty.call('POST', '/api/items/open-chest', {
      itemId: 'guild-chest-bronze',
      count: 2,
    });
    expect(again.body).toMatchObject({ error: 'NOT_ENOUGH_ITEMS' });
  });

  it('le lundi à minuit (heure de Paris) : coffres et nouvelles quêtes de la semaine', async () => {
    clock = new Date('2026-11-01T22:59:00Z'); // dimanche, 23 h 59
    expect((await state(ash)).guild!.week.id).toBe('2026-10-26');
    expect(await quantity(ash.userId, 'guild-chest-gold')).toBe(0);
    clock = new Date('2026-11-01T23:00:00Z'); // lundi, minuit
    // Distribution par le serveur, sans attendre qu'un membre ouvre la guilde.
    expect(await settleGuildQuests(handle.db, ctx, clock)).toBe(3);
    // Quêtes de la semaine : 2 faciles (Argent) et 1 difficile (Or).
    expect(await quantity(ash.userId, 'guild-chest-silver')).toBe(3);
    expect(await quantity(ash.userId, 'guild-chest-gold')).toBe(1);
    const s = await state(ash);
    expect(s.guild!.week.id).toBe('2026-11-02');
    expect(s.guild!.quests).toHaveLength(6);
    expect(s.guild!.quests.every((q) => q.progress === 0 && !q.completedAt)).toBe(true);
    const quest = s.guild!.quests.find((q) => q.period === 'weekly')!;
    const { weekly: goal } = ctx.guildQuests.find((q) => q.name === quest.name)!;
    expect(quest.target).toBe(Math.max(goal!.minCount, goal!.countPerMember * 3));
  });

  it("l'administration réinitialise les quêtes en cours (coffres des quêtes terminées distribués)", async () => {
    await handle.db
      .update(guildWeeklyQuests)
      .set({ target: 3 })
      .where(eq(guildWeeklyQuests.guildId, guildId));
    await recordGuildActivity(handle.db, ctx, brock.userId, everything(), clock);
    expect((await state(ash)).guild!.quests.every((q) => q.completedAt)).toBe(true);
    expect(await quantity(brock.userId, 'guild-chest-gold')).toBe(0);

    expect(await resetGuildQuests(handle.db, ctx, clock)).toEqual({ quests: 6 });
    const s = await state(ash);
    expect(s.guild!.quests).toHaveLength(6);
    expect(s.guild!.quests.every((q) => q.progress === 0 && !q.completedAt)).toBe(true);
    expect(s.guild!.quests.every((q) => q.contributors === 0 && q.target > 3)).toBe(true);
    expect(await quantity(brock.userId, 'guild-chest-gold')).toBe(1);
  });

  it('rôles : un officier exclut les membres mais pas le chef', async () => {
    expect((await misty.call('POST', '/api/guild/members/Pierre/kick')).status).toBe(403);
    expect(
      (await ash.call('POST', '/api/guild/members/Ondine/role', { role: 'officer' })).status,
    ).toBe(204);
    expect((await misty.call('POST', '/api/guild/members/Sacha/kick')).status).toBe(403);
    expect((await misty.call('POST', '/api/guild/members/Pierre/kick')).status).toBe(204);
    expect((await state(brock)).guild).toBeNull();
    // Exclu (pas de départ volontaire) : pas de délai.
    expect((await state(brock)).cooldownUntil).toBeNull();
  });

  it('le chef qui part passe la main ; délai de 24 h avant de rejoindre une guilde', async () => {
    expect((await ash.call('POST', '/api/guild/leave')).status).toBe(204);
    const s = await state(misty);
    expect(s.guild!.members.map((m) => [m.trainerName, m.role])).toEqual([['Ondine', 'leader']]);
    await misty.call('PATCH', '/api/guild', { joinMode: 'open' });
    expect((await ash.call('POST', `/api/guilds/${guildId}/join`)).body).toMatchObject({
      error: 'GUILD_COOLDOWN',
    });
    advanceHours(24);
    expect((await ash.call('POST', `/api/guilds/${guildId}/join`)).body).toEqual({
      joined: true,
    });
  });

  it('le dernier membre qui part dissout la guilde', async () => {
    await ash.call('POST', '/api/guild/leave');
    await misty.call('POST', '/api/guild/leave');
    expect(
      (await brock.call<GuildSearchResponse>('GET', '/api/guilds?q=explo')).body.guilds,
    ).toEqual([]);
  });
});
