import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { planAfter } from '@poke/game-core';
import { createDb, ensureSeedContent, inventory, users } from '@poke/db';
import type {
  ClaimExpeditionResponse,
  ContentVersionDetailDto,
  ExpeditionDto,
  ExpeditionsResponse,
  InventoryEntryDto,
  PokedexEntryDto,
  PokedexFormEntryDto,
  PokemonDto,
  TrainerCardResponse,
} from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';
import { addItems, insertPokemon, recordPokedex } from './game/store';

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

async function signUp(email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    payload: { email, password: 'motdepasse-solide', name: email.split('@')[0] },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookies = res.headers['set-cookie'];
  const list = Array.isArray(cookies) ? cookies : [cookies ?? ''];
  return list.map((c) => c.split(';')[0]).join('; ');
}

function client(cookie: string) {
  const call = async <T>(
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
  return call;
}

describe('boucle de jeu : starter → expédition → réclamation', () => {
  let call: ReturnType<typeof client>;
  let starter: PokemonDto;

  beforeAll(async () => {
    call = client(await signUp('red@example.com'));
    expect((await call('POST', '/api/profile', { trainerName: 'Red' })).status).toBe(201);
  });

  it('exige un starter avant de partir en expédition', async () => {
    const res = await call('POST', '/api/expeditions', {
      zoneId: 'route-1',
      team: ['00000000-0000-4000-8000-000000000000'],
      balls: { new: null, shiny: null, caught: null },
      berryItemId: null,
    });
    expect(res.body).toMatchObject({ error: 'NO_STARTER' });
  });

  it('refuse un starter hors de la liste de la région', async () => {
    const res = await call('POST', '/api/starter', { speciesId: 25 });
    expect(res).toMatchObject({ status: 400, body: { error: 'INVALID_STARTER' } });
  });

  it('donne le starter, le Pokédex et l’inventaire de départ', async () => {
    const res = await call<PokemonDto>('POST', '/api/starter', { speciesId: 4 });
    expect(res.status).toBe(201);
    starter = res.body;
    expect(starter).toMatchObject({ speciesId: 4, level: 5, origin: 'starter', busy: false });

    const again = await call('POST', '/api/starter', { speciesId: 7 });
    expect(again).toMatchObject({ status: 409, body: { error: 'STARTER_ALREADY_CHOSEN' } });

    const inv = await call<InventoryEntryDto[]>('GET', '/api/inventory');
    // Plus de baies au départ : on les trouve en expédition (données ici pour la suite).
    expect(inv.body).toEqual([{ itemId: 'poke-ball', quantity: 20 }]);
    const [user] = await handle.db.select().from(users).where(eq(users.email, 'red@example.com'));
    await addItems(handle.db, user!.id, [{ itemId: 'razz-berry', quantity: 5 }]);
    const dex = await call<PokedexEntryDto[]>('GET', '/api/pokedex');
    expect(dex.body).toEqual([expect.objectContaining({ speciesId: 4, seen: true, caught: true })]);
  });

  it('refuse une zone verrouillée', async () => {
    const res = await call('POST', '/api/expeditions', {
      zoneId: 'foret-de-jade',
      team: [starter.id],
      balls: { new: 'poke-ball', shiny: 'poke-ball', caught: 'poke-ball' },
      berryItemId: null,
    });
    expect(res).toMatchObject({ status: 403, body: { error: 'ZONE_LOCKED' } });
  });

  it('refuse un objet qui n’est pas une Ball ou la bonne sorte de baie', async () => {
    const notABerry = await call('POST', '/api/expeditions', {
      zoneId: 'route-1',
      team: [starter.id],
      balls: { new: null, shiny: null, caught: null },
      berryItemId: 'nanab-berry',
    });
    expect(notABerry.body).toMatchObject({ error: 'NOT_A_BERRY' });
    const notABall = await call('POST', '/api/expeditions', {
      zoneId: 'route-1',
      team: [starter.id],
      balls: { new: null, shiny: 'razz-berry', caught: null },
      berryItemId: null,
    });
    expect(notABall.body).toMatchObject({ error: 'NOT_A_BALL' });
  });

  it('annule une expédition en rendant les baies', async () => {
    const res = await call<ExpeditionDto>('POST', '/api/expeditions', {
      zoneId: 'route-1',
      team: [starter.id],
      balls: { new: 'poke-ball', shiny: 'poke-ball', caught: 'poke-ball' },
      berryItemId: 'razz-berry',
      berryCount: 2,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ balls: 0, berries: 2, ballsUsed: [] });

    const cancel = await call('POST', `/api/expeditions/${res.body.id}/cancel`);
    expect(cancel.status).toBe(204);
    const inv = await call<InventoryEntryDto[]>('GET', '/api/inventory');
    expect(inv.body).toEqual([
      { itemId: 'poke-ball', quantity: 20 },
      { itemId: 'razz-berry', quantity: 5 },
    ]);
    const list = await call<ExpeditionsResponse>('GET', '/api/expeditions');
    expect(list.body.active).toEqual([]);
    const pc = await call<PokemonDto[]>('GET', '/api/pokemon');
    expect(pc.body.find((p) => p.id === starter.id)?.busy).toBe(false);

    const again = await call('POST', `/api/expeditions/${res.body.id}/cancel`);
    expect(again).toMatchObject({ status: 404, body: { error: 'EXPEDITION_NOT_FOUND' } });
  });

  it('met des zones en favori, dans l’ordre d’ajout', async () => {
    const fav = (zoneId: string, favorite: boolean) =>
      call<{ favoriteZoneIds: string[] }>('PUT', `/api/expeditions/favorites/${zoneId}`, {
        favorite,
      });
    expect((await fav('route-1', true)).body.favoriteZoneIds).toEqual(['route-1']);
    expect((await fav('foret-de-jade', true)).body.favoriteZoneIds).toEqual([
      'route-1',
      'foret-de-jade',
    ]);
    expect((await fav('route-1', true)).body.favoriteZoneIds).toEqual(['foret-de-jade', 'route-1']);
    expect((await fav('zone-inconnue', true)).status).toBe(404);
    await fav('foret-de-jade', false);
    const list = await call<ExpeditionsResponse>('GET', '/api/expeditions');
    expect(list.body.favoriteZoneIds).toEqual(['route-1']);
    await fav('route-1', false);
  });

  let expedition: ExpeditionDto;

  it('lance une expédition : réserve les baies, pas les Balls', async () => {
    const res = await call<ExpeditionDto>('POST', '/api/expeditions', {
      zoneId: 'route-1',
      team: [starter.id],
      balls: { new: 'poke-ball', shiny: 'poke-ball', caught: 'poke-ball' },
      berryItemId: 'razz-berry',
      berryCount: 2,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expedition = res.body;
    expect(expedition).toMatchObject({
      slotIndex: 0,
      balls: 0,
      ballPlan: { new: 'poke-ball', shiny: 'poke-ball', caught: 'poke-ball' },
      berries: 2,
      contentVersionId: 1,
    });
    expect(new Date(expedition.minEndsAt).getTime() - clock.getTime()).toBe(3 * 60_000);
    expect(new Date(expedition.endsAt).getTime() - clock.getTime()).toBe(48 * 60 * 60_000);

    const inv = await call<InventoryEntryDto[]>('GET', '/api/inventory');
    expect(inv.body).toEqual([
      { itemId: 'poke-ball', quantity: 20 },
      { itemId: 'razz-berry', quantity: 3 },
    ]);
    const list = await call<ExpeditionsResponse>('GET', '/api/expeditions');
    expect(list.body.slots).toBe(2);
    expect(list.body.active.map((e) => e.id)).toEqual([expedition.id]);
    const pc = await call<PokemonDto[]>('GET', '/api/pokemon');
    expect(pc.body.find((p) => p.id === starter.id)?.busy).toBe(true);
  });

  it('refuse un Pokémon déjà en expédition', async () => {
    const res = await call('POST', '/api/expeditions', {
      zoneId: 'route-1',
      team: [starter.id],
      balls: { new: null, shiny: null, caught: null },
      berryItemId: null,
    });
    expect(res).toMatchObject({ status: 409, body: { error: 'POKEMON_BUSY' } });
  });

  it('refuse de réclamer avant la durée minimum', async () => {
    advance(2);
    const res = await call('POST', `/api/expeditions/${expedition.id}/claim`);
    expect(res).toMatchObject({ status: 409, body: { error: 'NOT_FINISHED' } });
  });

  it('retire une Ball du sac à chaque rencontre, avant la réclamation', async () => {
    advance(4);
    // 6 min : deux rencontres (toutes les 3 min), deux Poké Balls lancées.
    const inv = await call<InventoryEntryDto[]>('GET', '/api/inventory');
    expect(inv.body.find((i) => i.itemId === 'poke-ball')?.quantity).toBe(18);
    const list = await call<ExpeditionsResponse>('GET', '/api/expeditions');
    const active = list.body.active[0]!;
    expect(active.ballsUsed).toEqual([{ itemId: 'poke-ball', quantity: 2 }]);
    // Rythme envoyé au client : le compteur affiché tombe juste.
    expect(active.pace).not.toBeNull();
    expect(planAfter(active.pace!, 6).encounters).toBe(2);
  });

  it('réclame le résultat une seule fois et l’applique', async () => {
    const cancel = await call('POST', `/api/expeditions/${expedition.id}/cancel`);
    expect(cancel).toMatchObject({ status: 409, body: { error: 'ALREADY_FINISHED' } });
    const res = await call<ClaimExpeditionResponse>(
      'POST',
      `/api/expeditions/${expedition.id}/claim`,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const result = res.body.expedition.result!;
    expect(result.encounters).toHaveLength(2);
    expect(result.ballsUsed).toBe(2);
    const capturedIds = result.encounters.flatMap((e) => (e.pokemonId ? [e.pokemonId] : []));
    expect(res.body.captured.map((p) => p.id)).toEqual(capturedIds);

    const again = await call('POST', `/api/expeditions/${expedition.id}/claim`);
    expect(again).toMatchObject({ status: 409, body: { error: 'ALREADY_CLAIMED' } });

    const pc = await call<PokemonDto[]>('GET', '/api/pokemon');
    expect(pc.body).toHaveLength(1 + capturedIds.length);
    const me = pc.body.find((p) => p.id === starter.id)!;
    expect(me.busy).toBe(false);
    expect(me.xp).toBe(starter.xp + result.team[0]!.xpGained);
    expect(me.happiness).toBe(starter.happiness + 2);

    const dex = await call<PokedexEntryDto[]>('GET', '/api/pokedex');
    for (const e of result.encounters) {
      const entry = dex.body.find((d) => d.speciesId === e.speciesId)!;
      expect(entry.seen).toBe(true);
      if (e.outcome === 'captured') expect(entry.caught).toBe(true);
    }

    const inv = await call<InventoryEntryDto[]>('GET', '/api/inventory');
    const lootBalls = result.loot.find((l) => l.itemId === 'poke-ball')?.quantity ?? 0;
    expect(inv.body.find((i) => i.itemId === 'poke-ball')?.quantity).toBe(18 + lootBalls);

    const card = await call<TrainerCardResponse>('GET', '/api/trainer-card');
    expect(card.status).toBe(200);
    expect(card.body).toMatchObject({
      captures: capturedIds.length,
      pokemonOwned: 1 + capturedIds.length,
      shiniesMissed: result.encounters.filter((e) => e.isShiny && e.outcome !== 'captured').length,
      expeditionsCompleted: 1,
      battlesWon: 0,
      eggsHatched: 0,
      moneySpent: 0,
      dungeonsCleared: 0,
      megaStonesOwned: 0,
    });
  });

  it('résout une expédition avec le contenu de sa version de départ', async () => {
    const started = await call<ExpeditionDto>('POST', '/api/expeditions', {
      zoneId: 'route-1',
      team: [starter.id],
      balls: { new: 'poke-ball', shiny: 'poke-ball', caught: 'poke-ball' },
      berryItemId: null,
    });
    expect(started.status).toBe(201);

    // Un admin remplace les rencontres de la Route 1 par Magicarpe, puis publie.
    const adminCall = client(await signUp('chen@example.com'));
    await handle.db.update(users).set({ role: 'admin' }).where(eq(users.email, 'chen@example.com'));
    const draft = await adminCall<{ id: number }>('POST', '/api/admin/content/drafts', {
      label: 'Route 1 : Magicarpe',
    });
    const zone = {
      ...seedContent.zones[0]!,
      encounters: [{ speciesId: 129, weight: 1, minLevel: 5, maxLevel: 5 }],
    };
    expect(
      (await adminCall('PUT', `/api/admin/content/versions/${draft.body.id}/zones/route-1`, zone))
        .status,
    ).toBe(200);
    expect(
      (await adminCall('POST', `/api/admin/content/versions/${draft.body.id}/publish`)).status,
    ).toBe(200);

    advance(240);
    const res = await call<ClaimExpeditionResponse>(
      'POST',
      `/api/expeditions/${started.body.id}/claim`,
    );
    expect(res.status).toBe(200);
    const species = new Set(res.body.expedition.result!.encounters.map((e) => e.speciesId));
    expect(species.has(129)).toBe(false);

    // Les nouvelles expéditions utilisent le nouveau contenu.
    const next = await call<ExpeditionDto>('POST', '/api/expeditions', {
      zoneId: 'route-1',
      team: [starter.id],
      balls: { new: null, shiny: null, caught: null },
      berryItemId: null,
    });
    expect(next.body.contentVersionId).toBe(draft.body.id);
    advance(3);
    const claimed = await call<ClaimExpeditionResponse>(
      'POST',
      `/api/expeditions/${next.body.id}/claim`,
    );
    expect(claimed.body.expedition.result!.encounters.map((e) => e.speciesId)).toEqual([129]);
    expect(claimed.body.expedition.result!.encounters[0]!.outcome).toBe('ignored');
  });

  it('ne lance pas de Ball aux catégories sans Ball', async () => {
    const started = await call<ExpeditionDto>('POST', '/api/expeditions', {
      zoneId: 'route-1',
      team: [starter.id],
      // Magicarpe (seule rencontre de la Route 1 depuis le test précédent) n'est pas capturé.
      balls: { new: null, shiny: 'poke-ball', caught: 'poke-ball' },
      berryItemId: null,
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    advance(6);
    const claimed = await call<ClaimExpeditionResponse>(
      'POST',
      `/api/expeditions/${started.body.id}/claim`,
    );
    const result = claimed.body.expedition.result!;
    expect(result.encounters.map((e) => e.outcome)).toEqual(['ignored', 'ignored']);
    expect(result.ballsUsed).toBe(0);
  });
});

describe('Balls retirées au fil des expéditions', () => {
  it('partage le stock entre expéditions dans l’ordre des rencontres, même jeu fermé', async () => {
    const call = client(await signUp('blue@example.com'));
    expect((await call('POST', '/api/profile', { trainerName: 'Blue' })).status).toBe(201);
    const starter = (await call<PokemonDto>('POST', '/api/starter', { speciesId: 1 })).body;
    const [user] = await handle.db.select().from(users).where(eq(users.email, 'blue@example.com'));
    // Une seconde expédition demande un second Pokémon : une Pidgey capturée.
    const [second] = await insertPokemon(
      handle.db,
      user!.id,
      [{ ...starter, speciesId: 16, formId: null, ability: 'keen-eye' }],
      { origin: 'capture', originRegion: 'kanto', at: clock },
    );
    // Il ne reste que 3 Poké Balls.
    await handle.db
      .update(inventory)
      .set({ quantity: 3 })
      .where(and(eq(inventory.ownerId, user!.id), eq(inventory.itemId, 'poke-ball')));
    const start = (pokemonId: string) =>
      call<ExpeditionDto>('POST', '/api/expeditions', {
        zoneId: 'route-1',
        team: [pokemonId],
        balls: { new: 'poke-ball', shiny: 'poke-ball', caught: 'poke-ball' },
        berryItemId: null,
      });
    const first = await start(starter.id);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    advance(1);
    const later = await start(second!.id);
    expect(later.status, JSON.stringify(later.body)).toBe(201);

    // Jeu fermé 10 min : rencontres à 3, 4, 6, 7, 9 et 10 min ; les 3 Balls partent à la
    // première (3 min), à la seconde (4 min) puis à la première (6 min).
    advance(9);
    const list = await call<ExpeditionsResponse>('GET', '/api/expeditions');
    const used = (id: string) => list.body.active.find((e) => e.id === id)!.ballsUsed;
    expect(used(first.body.id)).toEqual([{ itemId: 'poke-ball', quantity: 2 }]);
    expect(used(later.body.id)).toEqual([{ itemId: 'poke-ball', quantity: 1 }]);
    const inv = await call<InventoryEntryDto[]>('GET', '/api/inventory');
    expect(inv.body.find((i) => i.itemId === 'poke-ball')).toBeUndefined();

    const claimed = await call<ClaimExpeditionResponse>(
      'POST',
      `/api/expeditions/${first.body.id}/claim`,
    );
    const result = claimed.body.expedition.result!;
    expect(result.encounters.map((e) => e.outcome === 'noBall')).toEqual([false, false, true]);
    expect(result.ballsUsed).toBe(2);
  });
});

describe('Pokédex des formes', () => {
  it('enregistre les formes capturées et leur version shiny', async () => {
    const call = client(await signUp('lilie@example.com'));
    expect((await call('POST', '/api/profile', { trainerName: 'Lilie' })).status).toBe(201);
    expect((await call<PokedexFormEntryDto[]>('GET', '/api/pokedex/forms')).body).toEqual([]);

    const [user] = await handle.db.select().from(users).where(eq(users.email, 'lilie@example.com'));
    const at = new Date('2026-10-08T12:00:00Z');
    // Rattata d’Alola (10091), puis sa version shiny ; Florizarre Gigamax (10195).
    const first = await recordPokedex(handle.db, user!.id, {
      seen: [19],
      caught: [
        { speciesId: 19, formId: 10091, isShiny: false },
        { speciesId: 3, formId: 10195, isShiny: false },
      ],
      at,
    });
    expect(first.newSpeciesIds.sort((a, b) => a - b)).toEqual([3, 19]);
    expect(first.newFormIds.sort((a, b) => a - b)).toEqual([10091, 10195]);
    const again = await recordPokedex(handle.db, user!.id, {
      seen: [],
      caught: [{ speciesId: 19, formId: 10091, isShiny: true }],
      at: new Date('2026-10-09T12:00:00Z'),
    });
    expect(again).toEqual({ newSpeciesIds: [], newFormIds: [] });
    // Raichu d’Alola (10100) alors que Raichu est déjà au Pokédex : seule la forme est nouvelle.
    await recordPokedex(handle.db, user!.id, {
      seen: [26],
      caught: [{ speciesId: 26, formId: null, isShiny: false }],
      at,
    });
    expect(
      await recordPokedex(handle.db, user!.id, {
        seen: [26],
        caught: [{ speciesId: 26, formId: 10100, isShiny: false }],
        at,
      }),
    ).toEqual({ newSpeciesIds: [], newFormIds: [10100] });

    const forms = await call<PokedexFormEntryDto[]>('GET', '/api/pokedex/forms');
    expect(forms.body).toEqual([
      { formId: 10091, caughtShiny: true, firstCaughtAt: at.toISOString() },
      { formId: 10100, caughtShiny: false, firstCaughtAt: at.toISOString() },
      { formId: 10195, caughtShiny: false, firstCaughtAt: at.toISOString() },
    ]);
    const dex = await call<PokedexEntryDto[]>('GET', '/api/pokedex');
    expect(dex.body.find((d) => d.speciesId === 19)).toMatchObject({
      caughtShiny: true,
      seenShiny: true,
    });
  });

  it('dévoile la case du Pokédex shiny dès qu’un shiny est rencontré, même non capturé', async () => {
    const call = client(await signUp('ludvina@example.com'));
    expect((await call('POST', '/api/profile', { trainerName: 'Ludvina' })).status).toBe(201);
    const [user] = await handle.db
      .select()
      .from(users)
      .where(eq(users.email, 'ludvina@example.com'));
    const at = new Date('2026-10-13T12:00:00Z');
    await recordPokedex(handle.db, user!.id, { seen: [16, 19], seenShiny: [19], caught: [], at });
    await recordPokedex(handle.db, user!.id, { seen: [19], caught: [], at });
    const dex = await call<PokedexEntryDto[]>('GET', '/api/pokedex');
    expect(dex.body.find((d) => d.speciesId === 16)).toMatchObject({
      seen: true,
      seenShiny: false,
    });
    expect(dex.body.find((d) => d.speciesId === 19)).toMatchObject({
      seen: true,
      seenShiny: true,
      caughtShiny: false,
    });
  });

  it('ne dévoile une forme alternative qu’une fois elle-même rencontrée', async () => {
    const call = client(await signUp('sarah@example.com'));
    expect((await call('POST', '/api/profile', { trainerName: 'Sarah' })).status).toBe(201);
    const [user] = await handle.db.select().from(users).where(eq(users.email, 'sarah@example.com'));
    const at = new Date('2026-10-29T12:00:00Z');
    await recordPokedex(handle.db, user!.id, {
      met: [{ speciesId: 19, formId: null, isShiny: false }],
      caught: [],
      at,
    });
    let dex = await call<PokedexEntryDto[]>('GET', '/api/pokedex');
    expect(dex.body.find((d) => d.speciesId === 19)).toMatchObject({
      seen: true,
      seenFormIds: [],
    });

    await recordPokedex(handle.db, user!.id, {
      met: [
        { speciesId: 19, formId: 10091, isShiny: true },
        { speciesId: 19, formId: 10091, isShiny: false },
      ],
      caught: [],
      at,
    });
    await recordPokedex(handle.db, user!.id, {
      met: [{ speciesId: 19, formId: 10091, isShiny: false }],
      caught: [],
      at,
    });
    dex = await call<PokedexEntryDto[]>('GET', '/api/pokedex');
    expect(dex.body.find((d) => d.speciesId === 19)).toMatchObject({
      caught: false,
      seenShiny: true,
      seenFormIds: [10091],
      seenShinyFormIds: [10091],
    });
    const forms = await call<PokedexFormEntryDto[]>('GET', '/api/pokedex/forms');
    expect(forms.body).toEqual([]);
  });
});

describe('admin : entités de contenu', () => {
  let call: ReturnType<typeof client>;
  let draftId: number;

  beforeAll(async () => {
    call = client(await signUp('agatha@example.com'));
    await handle.db
      .update(users)
      .set({ role: 'admin' })
      .where(eq(users.email, 'agatha@example.com'));
    draftId = (await call<{ id: number }>('POST', '/api/admin/content/drafts', { label: 'Zones' }))
      .body.id;
  });

  it('crée une zone validée par Zod', async () => {
    const zone = { ...seedContent.zones[0]!, id: 'route-22', name: 'Route 22', order: 9 };
    const bad = await call('POST', `/api/admin/content/versions/${draftId}/zones`, {
      ...zone,
      encounters: [],
    });
    expect(bad.status).toBe(400);
    const res = await call('POST', `/api/admin/content/versions/${draftId}/zones`, zone);
    expect(res.status).toBe(201);
    const dup = await call('POST', `/api/admin/content/versions/${draftId}/zones`, zone);
    expect(dup.body).toMatchObject({ error: 'ALREADY_EXISTS' });
  });

  it('refuse de changer l’identifiant à la modification', async () => {
    const res = await call('PUT', `/api/admin/content/versions/${draftId}/zones/route-22`, {
      ...seedContent.zones[0]!,
      id: 'autre',
    });
    expect(res.body).toMatchObject({ error: 'KEY_MISMATCH' });
  });

  it('refuse de supprimer une table de butin utilisée et liste ses usages', async () => {
    const res = await call(
      'DELETE',
      `/api/admin/content/versions/${draftId}/loot-tables/butin-zone-cap-azuria`,
    );
    expect(res).toMatchObject({
      status: 409,
      body: {
        error: 'IN_USE',
        details: ['Zone « Cap Azuria »'],
      },
    });
  });

  it('gère les surcharges d’espèces et expose les alertes de cohérence', async () => {
    const override = {
      speciesId: 19,
      enabled: false,
      nameFr: null,
      habitat: null,
      rarity: null,
      breedable: null,
    };
    expect(
      (await call('POST', `/api/admin/content/versions/${draftId}/species`, override)).status,
    ).toBe(201);
    const detail = await call<ContentVersionDetailDto>(
      'GET',
      `/api/admin/content/versions/${draftId}`,
    );
    expect(detail.body.content.speciesOverrides).toEqual([override]);
    // route-22 (copie de la Route 1 du seed) contient des Rattata.
    expect(detail.body.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', entityId: 'route-22' }),
    );
    expect((await call('DELETE', `/api/admin/content/versions/${draftId}/species/19`)).status).toBe(
      204,
    );
  });

  it('refuse de publier un brouillon incohérent', async () => {
    await call('PUT', `/api/admin/content/versions/${draftId}/zones/route-22`, {
      ...seedContent.zones[0]!,
      id: 'route-22',
      regionId: 'orre',
    });
    const res = await call('POST', `/api/admin/content/versions/${draftId}/publish`);
    expect(res).toMatchObject({ status: 422, body: { error: 'INVALID_CONTENT' } });
  });

  it('importe un contenu JSON comme brouillon', async () => {
    await call('DELETE', `/api/admin/content/versions/${draftId}`);
    const res = await call('POST', '/api/admin/content/import', {
      label: 'Contenu de test',
      content: seedContent,
    });
    expect(res.status).toBe(201);
  });
});

describe('transfert automatique au retour', () => {
  it('transfère les captures déjà au Pokédex selon le filtre, et seulement elles', async () => {
    const call = client(await signUp('green@example.com'));
    expect((await call('POST', '/api/profile', { trainerName: 'Green' })).status).toBe(201);
    const starter = (await call<PokemonDto>('POST', '/api/starter', { speciesId: 7 })).body;
    const [user] = await handle.db.select().from(users).where(eq(users.email, 'green@example.com'));
    await addItems(handle.db, user!.id, [{ itemId: 'master-ball', quantity: 200 }]);
    const started = await call<ExpeditionDto>('POST', '/api/expeditions', {
      zoneId: 'route-1',
      team: [starter.id],
      balls: { new: 'master-ball', shiny: 'master-ball', caught: 'master-ball' },
      berryItemId: null,
      autoTransfer: { maxPerfectIvs: 6 },
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    expect(started.body.autoTransfer).toEqual({ maxPerfectIvs: 6 });
    advance(90);
    const claimed = await call<ClaimExpeditionResponse>(
      'POST',
      `/api/expeditions/${started.body.id}/claim`,
    );
    expect(claimed.status, JSON.stringify(claimed.body)).toBe(200);
    const result = claimed.body.expedition.result!;
    const caught = result.encounters.filter((e) => e.outcome === 'captured');
    // Captures gardées : la première de chaque espèce, et les chromatiques.
    const seen = new Set<string>();
    const expected = caught.map((e) => {
      const key = `${e.speciesId}:${e.formId ?? ''}`;
      const keep = e.isShiny || !seen.has(key);
      seen.add(key);
      return !keep;
    });
    expect(caught.map((e) => !!e.transferred)).toEqual(expected);
    const transferred = caught.filter((e) => e.transferred);
    expect(transferred.length).toBeGreaterThan(0);
    expect(transferred.every((e) => e.pokemonId === undefined)).toBe(true);
    expect(result.autoTransferred?.count).toBe(transferred.length);
    expect(result.autoTransferred?.candies.reduce((n, c) => n + c.quantity, 0)).toBeGreaterThan(0);

    // Le PC et la réponse ne gardent que les autres ; les Bonbons sont crédités.
    expect(claimed.body.captured).toHaveLength(caught.length - transferred.length);
    const pc = await call<PokemonDto[]>('GET', '/api/pokemon');
    expect(pc.body).toHaveLength(1 + caught.length - transferred.length);
    const candies = await call<{ lineageId: number; quantity: number }[]>('GET', '/api/candies');
    for (const gained of result.autoTransferred!.candies) {
      expect(candies.body.find((c) => c.lineageId === gained.lineageId)?.quantity).toBe(
        gained.quantity,
      );
    }
  });

  it('ne transfère rien sans filtre ni pour un Pokémon avec trop d’IV parfaits', async () => {
    const call = client(await signUp('yellow@example.com'));
    expect((await call('POST', '/api/profile', { trainerName: 'Yellow' })).status).toBe(201);
    const starter = (await call<PokemonDto>('POST', '/api/starter', { speciesId: 1 })).body;
    const [user] = await handle.db
      .select()
      .from(users)
      .where(eq(users.email, 'yellow@example.com'));
    await addItems(handle.db, user!.id, [{ itemId: 'master-ball', quantity: 200 }]);
    const run = async (autoTransfer: { maxPerfectIvs: number } | null) => {
      const started = await call<ExpeditionDto>('POST', '/api/expeditions', {
        zoneId: 'route-1',
        team: [starter.id],
        balls: { new: 'master-ball', shiny: 'master-ball', caught: 'master-ball' },
        berryItemId: null,
        autoTransfer,
      });
      expect(started.status, JSON.stringify(started.body)).toBe(201);
      advance(90);
      const claimed = await call<ClaimExpeditionResponse>(
        'POST',
        `/api/expeditions/${started.body.id}/claim`,
      );
      expect(claimed.status, JSON.stringify(claimed.body)).toBe(200);
      return claimed.body.expedition.result!;
    };
    const plain = await run(null);
    expect(plain.autoTransferred).toBeUndefined();
    expect(plain.encounters.some((e) => e.transferred)).toBe(false);

    // Tout est déjà au Pokédex : seuls les captures sans IV parfait (et non chromatiques) partent.
    const strict = await run({ maxPerfectIvs: 0 });
    const perfect = (e: (typeof strict.encounters)[number]) =>
      Object.values(e.pokemon!.ivs).filter((v) => v === 31).length;
    for (const e of strict.encounters.filter((x) => x.outcome === 'captured')) {
      const isNew = !plain.encounters.some(
        (p) => p.outcome === 'captured' && p.speciesId === e.speciesId,
      );
      if (isNew || e.isShiny || perfect(e) > 0) expect(e.transferred).toBeUndefined();
    }
    expect(
      strict.encounters.filter((e) => e.transferred).every((e) => perfect(e) === 0 && !e.isShiny),
    ).toBe(true);
  });
});
