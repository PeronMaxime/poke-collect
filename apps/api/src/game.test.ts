import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent, users } from '@poke/db';
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
import { recordPokedex } from './game/store';

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
      durationMinutes: 15,
      team: ['00000000-0000-4000-8000-000000000000'],
      ballItemId: null,
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
    expect(inv.body).toEqual([
      { itemId: 'poke-ball', quantity: 20 },
      { itemId: 'razz-berry', quantity: 5 },
    ]);
    const dex = await call<PokedexEntryDto[]>('GET', '/api/pokedex');
    expect(dex.body).toEqual([expect.objectContaining({ speciesId: 4, seen: true, caught: true })]);
  });

  it('refuse une zone verrouillée', async () => {
    const res = await call('POST', '/api/expeditions', {
      zoneId: 'foret-de-jade',
      durationMinutes: 60,
      team: [starter.id],
      ballItemId: 'poke-ball',
      berryItemId: null,
    });
    expect(res).toMatchObject({ status: 403, body: { error: 'ZONE_LOCKED' } });
  });

  it('valide l’équipe et la durée', async () => {
    const res = await call('POST', '/api/expeditions', {
      zoneId: 'route-1',
      durationMinutes: 30,
      team: [starter.id],
      ballItemId: 'poke-ball',
      berryItemId: null,
    });
    expect(res).toMatchObject({
      status: 400,
      body: { error: 'TEAM_INVALID', errors: [{ code: 'DURATION_NOT_ALLOWED' }] },
    });
    const notABall = await call('POST', '/api/expeditions', {
      zoneId: 'route-1',
      durationMinutes: 60,
      team: [starter.id],
      ballItemId: 'razz-berry',
      berryItemId: null,
    });
    expect(notABall.body).toMatchObject({ error: 'NOT_A_BALL' });
  });

  let expedition: ExpeditionDto;

  it('lance une expédition et réserve les Balls et baies', async () => {
    const res = await call<ExpeditionDto>('POST', '/api/expeditions', {
      zoneId: 'route-1',
      durationMinutes: 5,
      team: [starter.id],
      ballItemId: 'poke-ball',
      berryItemId: 'razz-berry',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expedition = res.body;
    expect(expedition).toMatchObject({ slotIndex: 0, balls: 2, berries: 2, contentVersionId: 1 });
    expect(new Date(expedition.endsAt).getTime() - clock.getTime()).toBe(5 * 60_000);

    const inv = await call<InventoryEntryDto[]>('GET', '/api/inventory');
    expect(inv.body).toEqual([
      { itemId: 'poke-ball', quantity: 18 },
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
      durationMinutes: 15,
      team: [starter.id],
      ballItemId: null,
      berryItemId: null,
    });
    expect(res).toMatchObject({ status: 409, body: { error: 'POKEMON_BUSY' } });
  });

  it('refuse de réclamer avant la fin', async () => {
    advance(4);
    const res = await call('POST', `/api/expeditions/${expedition.id}/claim`);
    expect(res).toMatchObject({ status: 409, body: { error: 'NOT_FINISHED' } });
  });

  it('réclame le résultat une seule fois et l’applique', async () => {
    advance(1);
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
      expeditionsCompleted: 1,
      battlesWon: 0,
      eggsHatched: 0,
      moneySpent: 0,
    });
  });

  it('résout une expédition avec le contenu de sa version de départ', async () => {
    const started = await call<ExpeditionDto>('POST', '/api/expeditions', {
      zoneId: 'route-1',
      durationMinutes: 240,
      team: [starter.id],
      ballItemId: 'poke-ball',
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
      durationMinutes: 2,
      team: [starter.id],
      ballItemId: null,
      berryItemId: null,
    });
    expect(next.body.contentVersionId).toBe(draft.body.id);
    advance(2);
    const claimed = await call<ClaimExpeditionResponse>(
      'POST',
      `/api/expeditions/${next.body.id}/claim`,
    );
    expect(claimed.body.expedition.result!.encounters.map((e) => e.speciesId)).toEqual([129]);
    expect(claimed.body.expedition.result!.encounters[0]!.outcome).toBe('noBall');
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
    expect(first.sort((a, b) => a - b)).toEqual([3, 19]);
    await recordPokedex(handle.db, user!.id, {
      seen: [],
      caught: [{ speciesId: 19, formId: 10091, isShiny: true }],
      at: new Date('2026-10-09T12:00:00Z'),
    });

    const forms = await call<PokedexFormEntryDto[]>('GET', '/api/pokedex/forms');
    expect(forms.body).toEqual([
      { formId: 10091, caughtShiny: true, firstCaughtAt: at.toISOString() },
      { formId: 10195, caughtShiny: false, firstCaughtAt: at.toISOString() },
    ]);
    const dex = await call<PokedexEntryDto[]>('GET', '/api/pokedex');
    expect(dex.body.find((d) => d.speciesId === 19)).toMatchObject({ caughtShiny: true });
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
      `/api/admin/content/versions/${draftId}/loot-tables/butin-mer`,
    );
    expect(res).toMatchObject({
      status: 409,
      body: {
        error: 'IN_USE',
        // L'ordre dépend du stockage en base.
        details: expect.arrayContaining([
          'Zone « Cap Azuria »',
          'Zone « Îles Écume »',
          'Zone « Archipel Lointain »',
          'Zone « Lac Colère »',
          'Dresseur « Ondine »',
          'Dresseur « Maya »',
        ]),
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
