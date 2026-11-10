import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content/seed';
import { createDb, eggs, ensureSeedContent, pokemon, users } from '@poke/db';
import { candiesForLevel, getNature } from '@poke/game-core';
import type { PokemonInstance } from '@poke/game-core';
import type {
  BagEggDto,
  CandyDto,
  CollectEggsResponse,
  DaycareDto,
  DaycareResponse,
  HatchEggsResponse,
  IncubateEggsResponse,
  InventoryEntryDto,
  PokedexEntryDto,
  PokemonDto,
  TransferPokemonResponse,
} from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';
import { ContentCache } from './content-cache';
import { addItems, insertPokemon, transferRows } from './game/store';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
let clock = new Date('2026-10-07T10:00:00Z');
let app: Awaited<ReturnType<typeof buildApp>>['app'];

beforeAll(async () => {
  await handle.migrate();
  // Onglets tous ouverts : leurs conditions de déblocage sont testées à part (museum.test.ts).
  await ensureSeedContent(handle.db, {
    ...seedContent,
    balance: { ...seedContent.balance, tabUnlocks: {} },
  });
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
  return async <T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ) => {
    const res = await app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload !== undefined && { payload: payload as object }),
    });
    return { status: res.statusCode, body: (res.body ? res.json() : null) as T };
  };
}

/** Joueur prêt à jouer (profil + starter Bulbizarre). */
async function newPlayer(email: string, trainerName: string) {
  const { cookie, userId } = await signUp(email);
  const call = client(cookie);
  expect((await call('POST', '/api/profile', { trainerName })).status).toBe(201);
  const starter = await call<PokemonDto>('POST', '/api/starter', { speciesId: 1 });
  expect(starter.status).toBe(201);
  return { call, userId, starter: starter.body };
}

const IVS = {
  hp: 31,
  attack: 31,
  defense: 31,
  'special-attack': 31,
  'special-defense': 31,
  speed: 31,
};

async function give(userId: string, speciesId: number, extra: Partial<PokemonInstance> = {}) {
  const [row] = await insertPokemon(
    handle.db,
    userId,
    [
      {
        speciesId,
        level: 20,
        xp: 8000,
        ivs: IVS,
        nature: 'hardy',
        ability: 'limber',
        isShiny: false,
        gender: 'genderless',
        happiness: 70,
        ...extra,
      },
    ],
    { origin: 'capture', originRegion: 'kanto', at: clock },
  );
  return row!;
}

describe('pension et œufs', () => {
  let call: Awaited<ReturnType<typeof newPlayer>>['call'];
  let userId: string;
  let ditto: string;
  let ivysaur: string;
  let magikarp: string;

  beforeAll(async () => {
    ({ call, userId } = await newPlayer('leaf@example.com', 'Leaf'));
    ditto = (await give(userId, 132)).id;
    ivysaur = (await give(userId, 2, { gender: 'male', nature: 'modest', ability: 'overgrow' })).id;
    magikarp = (await give(userId, 129, { gender: 'female', ability: 'swift-swim' })).id;
    await addItems(handle.db, userId, [
      { itemId: 'everstone', quantity: 1 },
      { itemId: 'destiny-knot', quantity: 1 },
    ]);
  });

  it('affiche une pension vide', async () => {
    const res = await call<DaycareResponse>('GET', '/api/daycare');
    expect(res.body).toMatchObject({
      slots: 1,
      maxEggs: 6,
      pensions: [],
      eggs: [],
      bagEggs: [],
    });
  });

  it('refuse deux fois le même Pokémon ou un objet qui n’est pas d’élevage', async () => {
    const bad = await call('POST', '/api/daycare', {
      parentAId: ivysaur,
      parentBId: ivysaur,
      heldItemAId: null,
      heldItemBId: null,
    });
    expect(bad).toMatchObject({ status: 400, body: { error: 'SAME_POKEMON' } });
    const notBreeding = await call('POST', '/api/daycare', {
      parentAId: ditto,
      parentBId: ivysaur,
      heldItemAId: 'poke-ball',
      heldItemBId: null,
    });
    expect(notBreeding.body).toMatchObject({ error: 'NOT_A_BREEDING_ITEM' });
  });

  it('dépose un couple, réserve les objets tenus et occupe les parents', async () => {
    const res = await call<DaycareDto>('POST', '/api/daycare', {
      parentAId: ditto,
      parentBId: ivysaur,
      heldItemAId: 'destiny-knot',
      heldItemBId: 'everstone',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    // L'œuf contient la forme de base du parent non Métamorph.
    expect(res.body).toMatchObject({ slotIndex: 0, eggSpeciesId: 1 });

    const inv = await call<InventoryEntryDto[]>('GET', '/api/inventory');
    expect(inv.body.find((i) => i.itemId === 'everstone')).toBeUndefined();
    const pc = await call<PokemonDto[]>('GET', '/api/pokemon');
    expect(pc.body.find((p) => p.id === ditto)).toMatchObject({ busy: true, activity: 'daycare' });

    const expedition = await call('POST', '/api/expeditions', {
      zoneId: 'route-1',
      team: [ditto],
      balls: { new: null, shiny: null, caught: null },
      berryItemId: null,
    });
    expect(expedition.body).toMatchObject({ error: 'POKEMON_BUSY' });
    const second = await call('POST', '/api/daycare', {
      parentAId: magikarp,
      parentBId: ditto,
      heldItemAId: null,
      heldItemBId: null,
    });
    expect(second.body).toMatchObject({ error: 'NO_FREE_SLOT' });
  });

  it('pond un œuf toutes les 20 minutes', async () => {
    advance(19);
    const early = await call('POST', '/api/daycare/0/collect');
    expect(early).toMatchObject({ status: 409, body: { error: 'NO_EGG_READY' } });

    advance(26); // 45 min : 2 œufs, 5 min entamées sur le suivant
    const res = await call<CollectEggsResponse>('POST', '/api/daycare/0/collect', {
      to: 'incubator',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.incubated).toHaveLength(2);
    // Une place de la couveuse chacun.
    expect(res.body.incubated.map((e) => e.slotIndex)).toEqual([0, 1]);
    expect(res.body.bagged).toBe(0);
    // Bulbizarre : 20 cycles × 2 min.
    expect(Date.parse(res.body.incubated[0]!.hatchAt) - clock.getTime()).toBe(40 * 60_000);

    const daycare = await call<DaycareResponse>('GET', '/api/daycare');
    expect(daycare.body.eggs).toHaveLength(2);
    const startedAt = Date.parse(daycare.body.pensions[0]!.startedAt);
    expect(clock.getTime() - startedAt).toBe(5 * 60_000);
  });

  it('fait éclore les œufs à terme, avec l’héritage des parents', async () => {
    const early = await call('POST', '/api/eggs/hatch');
    expect(early.body).toMatchObject({ error: 'NO_EGG_READY' });

    advance(40);
    // Serveur redémarré : cache de contenu vide, l'éclosion ne doit pas bloquer PGlite.
    await app.close();
    ({ app } = await buildApp({ db: handle.db, env, now: () => clock }));
    const res = await call<HatchEggsResponse>('POST', '/api/eggs/hatch');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.hatched).toHaveLength(2);
    expect(res.body.newSpeciesIds).toEqual([]); // Bulbizarre : le starter
    for (const baby of res.body.hatched) {
      expect(baby).toMatchObject({ speciesId: 1, level: 1, origin: 'egg', nature: 'modest' });
      expect(getNature(baby.nature)).toBeDefined();
      // Nœud Destin : au moins 5 IV hérités, tous à 31 chez les deux parents.
      expect(Object.values(baby.ivs).filter((iv) => iv === 31).length).toBeGreaterThanOrEqual(5);
    }
    expect((await call('POST', '/api/eggs/hatch')).status).toBe(409);
    const dex = await call<PokedexEntryDto[]>('GET', '/api/pokedex');
    expect(dex.body.find((d) => d.speciesId === 1)?.caught).toBe(true);
  });

  it('arrête la ponte à 10 œufs et range dans le sac ce que la couveuse ne prend pas', async () => {
    // 5 + 40 + 600 min depuis le début du cycle : la pension s'est arrêtée à 10 œufs.
    advance(10 * 60);
    const before = await call<DaycareResponse>('GET', '/api/daycare');
    expect(before.body.eggs).toEqual([]);
    const res = await call<CollectEggsResponse>('POST', '/api/daycare/0/collect', {
      to: 'incubator',
    });
    expect(res.body.incubated.map((e) => e.slotIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(res.body.bagged).toBe(4);
    // La ponte reprend au ramassage, sans temps entamé.
    const daycare = await call<DaycareResponse>('GET', '/api/daycare');
    expect(Date.parse(daycare.body.pensions[0]!.startedAt)).toBe(clock.getTime());
    expect(daycare.body.eggs).toHaveLength(6);
    expect(daycare.body.bagEggs).toHaveLength(4);
    expect(daycare.body.bagEggs[0]).toMatchObject({ speciesId: 1, formId: null });

    // Ramasser : tout dans le sac, même s'il restait de la place.
    advance(20);
    const picked = await call<CollectEggsResponse>('POST', '/api/daycare/0/collect', {
      to: 'bag',
    });
    expect(picked.body).toEqual({ incubated: [], bagged: 1 });
    // Couver avec une couveuse pleine : le surplus va dans le sac.
    advance(20);
    const overflow = await call<CollectEggsResponse>('POST', '/api/daycare/0/collect', {
      to: 'incubator',
    });
    expect(overflow.body).toEqual({ incubated: [], bagged: 1 });
    expect((await call('POST', '/api/daycare/0/collect')).body).toMatchObject({
      error: 'NO_EGG_READY',
    });
  });

  it('couve les œufs du sac quand une place se libère', async () => {
    const { bagEggs } = (await call<DaycareResponse>('GET', '/api/daycare')).body;
    expect(bagEggs).toHaveLength(6);
    const ids = bagEggs.map((e) => e.id);
    const full = await call('POST', '/api/eggs/incubate', { ids: ids.slice(0, 2) });
    expect(full).toMatchObject({ status: 409, body: { error: 'INCUBATOR_FULL' } });

    advance(40);
    expect((await call<HatchEggsResponse>('POST', '/api/eggs/hatch')).body.hatched).toHaveLength(6);
    const res = await call<IncubateEggsResponse>('POST', '/api/eggs/incubate', {
      ids: ids.slice(0, 2),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.incubated.map((e) => [e.id, e.slotIndex])).toEqual([
      [ids[0], 0],
      [ids[1], 1],
    ]);
    expect(Date.parse(res.body.incubated[0]!.incubatedAt)).toBe(clock.getTime());
    expect(Date.parse(res.body.incubated[0]!.hatchAt) - clock.getTime()).toBe(40 * 60_000);
    // Déjà couvés : plus dans le sac.
    const again = await call('POST', '/api/eggs/incubate', { ids: ids.slice(0, 1) });
    expect(again).toMatchObject({ status: 404, body: { error: 'EGG_NOT_FOUND' } });
    const daycare = await call<DaycareResponse>('GET', '/api/daycare');
    expect(daycare.body.eggs).toHaveLength(2);
    expect(daycare.body.bagEggs.map((e) => e.id)).toEqual(ids.slice(2));

    // Retiré de la couveuse : il revient dans le sac, sa place se libère.
    const out = await call<BagEggDto>('DELETE', `/api/eggs/${ids[1]}`);
    expect(out).toMatchObject({ status: 200, body: { id: ids[1], speciesId: 1 } });
    const after = (await call<DaycareResponse>('GET', '/api/daycare')).body;
    expect(after.eggs.map((e) => e.id)).toEqual([ids[0]]);
    expect(after.bagEggs.map((e) => e.id)).toContain(ids[1]);
    expect(await call('DELETE', `/api/eggs/${ids[1]}`)).toMatchObject({
      status: 404,
      body: { error: 'EGG_NOT_INCUBATED' },
    });
    // Remis en couveuse : l'incubation repart de zéro.
    const back = await call<IncubateEggsResponse>('POST', '/api/eggs/incubate', { ids: [ids[1]] });
    expect(back.body.incubated.map((e) => [e.id, e.slotIndex])).toEqual([[ids[1], 1]]);
    // À terme, il se fait éclore au lieu d'être retiré.
    const [first] = await handle.db.select().from(eggs).where(eq(eggs.id, ids[0]!));
    await handle.db.update(eggs).set({ hatchAt: clock }).where(eq(eggs.id, ids[0]!));
    expect(await call('DELETE', `/api/eggs/${ids[0]}`)).toMatchObject({
      status: 409,
      body: { error: 'EGG_READY' },
    });
    await handle.db.update(eggs).set({ hatchAt: first!.hatchAt }).where(eq(eggs.id, ids[0]!));
  });

  it('retire le couple, rend les objets tenus et verse l’XP du séjour', async () => {
    const [dittoBefore] = await handle.db.select().from(pokemon).where(eq(pokemon.id, ditto));
    const res = await call<CollectEggsResponse>('DELETE', '/api/daycare/0');
    expect(res.status).toBe(200);
    // 40 min depuis le dernier ramassage : 2 œufs, couvés (4 places libres).
    expect(res.body.incubated).toHaveLength(2);
    expect(res.body.bagged).toBe(0);
    // 765 min en pension.
    const xp = Math.floor((765 / 60) * seedContent.balance.breeding.parentXpPerHour);
    expect(res.body.parents).toHaveLength(2);
    const gain = res.body.parents!.find((p) => p.pokemonId === ditto)!;
    expect(gain).toMatchObject({ xpGained: xp, levelBefore: 20 });
    expect(gain.levelAfter).toBeGreaterThan(20);
    const [dittoAfter] = await handle.db.select().from(pokemon).where(eq(pokemon.id, ditto));
    expect(dittoAfter).toMatchObject({ xp: dittoBefore!.xp + xp, level: gain.levelAfter });

    const inv = await call<InventoryEntryDto[]>('GET', '/api/inventory');
    expect(inv.body).toEqual(
      expect.arrayContaining([
        { itemId: 'everstone', quantity: 1 },
        { itemId: 'destiny-knot', quantity: 1 },
      ]),
    );
    const daycare = await call<DaycareResponse>('GET', '/api/daycare');
    expect(daycare.body.pensions).toEqual([]);
    const pc = await call<PokemonDto[]>('GET', '/api/pokemon');
    expect(pc.body.find((p) => p.id === ditto)).toMatchObject({ busy: false, activity: null });
  });

  it('accepte un couple qui ne peut pas s’accoupler : pas d’œuf, mais de l’XP', async () => {
    const res = await call<DaycareDto>('POST', '/api/daycare', {
      parentAId: ivysaur,
      parentBId: magikarp,
      heldItemAId: null,
      heldItemBId: null,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    advance(3 * 60);
    const daycare = await call<DaycareResponse>('GET', '/api/daycare');
    expect(daycare.body.pensions[0]).toMatchObject({ breeds: false, eggSpeciesId: null });
    const collect = await call('POST', '/api/daycare/0/collect', { to: 'bag' });
    expect(collect).toMatchObject({ status: 409, body: { error: 'NO_EGG_READY' } });

    const out = await call<CollectEggsResponse>('DELETE', '/api/daycare/0');
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ incubated: [], bagged: 0 });
    const xp = 3 * seedContent.balance.breeding.parentXpPerHour;
    expect(out.body.parents!.map((p) => p.xpGained)).toEqual([xp, xp]);
  });

  it('dépose, change et retire les Pokémon un par un', async () => {
    const { parentXpPerHour } = seedContent.balance.breeding;
    const pensionAt0 = async () =>
      (await call<DaycareResponse>('GET', '/api/daycare')).body.pensions[0];

    const first = await call('PUT', '/api/daycare/0/parents/0', { pokemonId: ivysaur });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    // Seul, il ne pond pas mais gagne de l'XP.
    expect(await pensionAt0()).toMatchObject({
      parentAId: ivysaur,
      parentBId: null,
      breeds: false,
    });

    advance(60);
    const second = await call('PUT', '/api/daycare/0/parents/1', {
      pokemonId: ditto,
      heldItemId: 'everstone',
    });
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    const couple = await pensionAt0();
    expect(couple).toMatchObject({ parentAId: ivysaur, parentBId: ditto, breeds: true });
    const dittoSince = couple!.parentBDepositedAt;
    const inv = await call<InventoryEntryDto[]>('GET', '/api/inventory');
    expect(inv.body.find((i) => i.itemId === 'everstone')).toBeUndefined();
    const same = await call('PUT', '/api/daycare/0/parents/0', { pokemonId: ditto });
    expect(same.body).toMatchObject({ error: 'SAME_POKEMON' });

    // Changement d'Herbizarre : ses œufs prêts sont couvés, il reçoit l'XP de ses 2 h.
    advance(60);
    const swap = await call<CollectEggsResponse>('PUT', '/api/daycare/0/parents/0', {
      pokemonId: magikarp,
    });
    expect(swap.status, JSON.stringify(swap.body)).toBe(200);
    expect(swap.body.incubated.length + swap.body.bagged).toBe(3);
    expect(swap.body.parents).toEqual([
      expect.objectContaining({ pokemonId: ivysaur, xpGained: 2 * parentXpPerHour }),
    ]);
    // Métamorph reste, avec son XP en cours ; la ponte reprend avec le nouveau couple.
    const swapped = await pensionAt0();
    expect(swapped).toMatchObject({
      parentAId: magikarp,
      parentBId: ditto,
      parentBDepositedAt: dittoSince,
      startedAt: clock.toISOString(),
      eggSpeciesId: 129,
    });
    const pc = await call<PokemonDto[]>('GET', '/api/pokemon');
    expect(pc.body.find((p) => p.id === ivysaur)).toMatchObject({ busy: false });

    advance(30);
    const out = await call<CollectEggsResponse>('DELETE', '/api/daycare/0/parents/1');
    expect(out.status, JSON.stringify(out.body)).toBe(200);
    expect(out.body.parents).toEqual([
      expect.objectContaining({ pokemonId: ditto, xpGained: Math.floor(1.5 * parentXpPerHour) }),
    ]);
    const back = await call<InventoryEntryDto[]>('GET', '/api/inventory');
    expect(back.body).toEqual(expect.arrayContaining([{ itemId: 'everstone', quantity: 1 }]));
    expect(await pensionAt0()).toMatchObject({ parentAId: magikarp, parentBId: null });

    expect((await call('DELETE', '/api/daycare/0/parents/0')).status).toBe(200);
    expect(await pensionAt0()).toBeUndefined();
    const empty = await call('DELETE', '/api/daycare/0/parents/0');
    expect(empty).toMatchObject({ status: 409, body: { error: 'DAYCARE_EMPTY' } });
  });
});

describe('transfert et Bonbons de lignée', () => {
  it('transfère des doublons contre des Bonbons, puis les donne en XP', async () => {
    const { call, userId, starter } = await newPlayer('blue@example.com', 'Blue');
    const a = await give(userId, 2, { gender: 'male' });
    const b = await give(userId, 3, { gender: 'female', isShiny: true });

    const locked = await call('PATCH', `/api/pokemon/${a.id}`, { locked: true });
    expect(locked.status).toBe(200);
    const refused = await call('POST', '/api/pokemon/transfer', { ids: [a.id, b.id] });
    expect(refused).toMatchObject({ status: 409, body: { error: 'POKEMON_LOCKED' } });
    await call('PATCH', `/api/pokemon/${a.id}`, { locked: false });

    const res = await call<TransferPokemonResponse>('POST', '/api/pokemon/transfer', {
      ids: [a.id, b.id],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // 2 Bonbons chacun (évolués) + 10 pour le shiny, tous dans la lignée de Bulbizarre.
    expect(res.body).toEqual({ transferred: 2, gained: [{ lineageId: 1, quantity: 14 }] });
    expect((await call<CandyDto[]>('GET', '/api/candies')).body).toEqual([
      { lineageId: 1, quantity: 14 },
    ]);

    // Les Bonbons du niveau en cours (5 au niveau 1, 6 au niveau 5…) le font passer.
    const ctx = await new ContentCache(handle.db).get();
    const perLevel = candiesForLevel(ctx, starter.level);
    const fed = await call<PokemonDto>('POST', `/api/pokemon/${starter.id}/candies`, {
      count: perLevel,
    });
    expect(fed.status, JSON.stringify(fed.body)).toBe(200);
    expect(fed.body.level).toBe(starter.level + 1);
    const tooMany = await call('POST', `/api/pokemon/${starter.id}/candies`, { count: 13 });
    expect(tooMany.body).toMatchObject({ error: 'NOT_ENOUGH_CANDIES' });

    const last = await call('POST', '/api/pokemon/transfer', { ids: [starter.id] });
    expect(last.body).toMatchObject({ error: 'LAST_POKEMON' });
  });

  it('refuse de transférer un légendaire ou un fabuleux', async () => {
    const { call, userId } = await newPlayer('red@example.com', 'Red');
    const rattata = await give(userId, 19);
    for (const speciesId of [150, 151]) {
      const kept = await give(userId, speciesId);
      const refused = await call('POST', '/api/pokemon/transfer', { ids: [rattata.id, kept.id] });
      expect(refused).toMatchObject({ status: 409, body: { error: 'POKEMON_LEGENDARY' } });
    }
    const pc = await call<PokemonDto[]>('GET', '/api/pokemon');
    expect(pc.body.map((p) => p.speciesId).sort((a, b) => a - b)).toEqual([1, 19, 150, 151]);
  });

  it('ne crédite pas deux fois les Bonbons si les Pokémon ont déjà été transférés', async () => {
    const { call, userId } = await newPlayer('green@example.com', 'Green');
    const a = await give(userId, 2);
    const b = await give(userId, 2);
    const rows = await handle.db.select().from(pokemon).where(eq(pokemon.ownerId, userId));
    const toMove = rows.filter((r) => r.id === a.id || r.id === b.id);
    const ctx = await new ContentCache(handle.db).get();

    // Premier transfert : normal.
    const first = await handle.db.transaction((tx) => transferRows(tx, ctx, userId, toMove));
    expect(first.length).toBeGreaterThan(0);
    const candies = (await call<CandyDto[]>('GET', '/api/candies')).body;

    // Second transfert des mêmes lignes (course : lues avant la suppression) : annulé.
    await expect(
      handle.db.transaction((tx) => transferRows(tx, ctx, userId, toMove)),
    ).rejects.toMatchObject({ status: 404, code: 'POKEMON_NOT_FOUND' });
    expect((await call<CandyDto[]>('GET', '/api/candies')).body).toEqual(candies);
  });
});
