import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content/seed';
import { dungeonRuns, eggs, fossilRevivals, legendaryBattles, trainerRuns, users } from '@poke/db';
import type { ExpeditionDto, PokemonTagDto, PokemonTeamDto } from '@poke/shared';
import { testApi } from '../support/api';

/**
 * Plan de sécurité, phase 5.2 : contrôles d'accès de toutes les routes déclarées, relevées par
 * `buildApp` (`routes`). Une route ajoutée sans contrôle fait échouer ce test :
 * - sans session (ou avec un cookie inventé), tout répond 401, sauf `PUBLIC_ROUTES` ;
 * - toute route `/api/admin/*` répond 403 à un joueur, et à un administrateur sans second facteur ;
 * - une route à identifiant (`:id`) répond 404 avec l'identifiant de l'objet d'un autre joueur.
 * Une nouvelle route publique s'ajoute à `PUBLIC_ROUTES` ; une nouvelle route à identifiant, à
 * `OWNED` (objet d'un joueur) ou à `NOT_OWNED` (identifiant de contenu ou public), en le justifiant.
 */

const api = testApi({
  content: { ...seedContent, balance: { ...seedContent.balance, tabUnlocks: {} } },
});

/** Routes ouvertes sans session : rien d'autre ne doit l'être. */
const PUBLIC_ROUTES = new Set([
  'GET /api/health',
  'GET /api/config',
  // Contenu publié (espèces, zones, quêtes…) : déjà public dans le dépôt (game-content.json).
  'GET /api/content',
  // Réponse du greffon CORS aux requêtes préliminaires des navigateurs.
  'OPTIONS *',
  // Images publiques (servies par Caddy en production).
  'GET /api/sprites/*',
  // Better Auth : inscription, connexion, réinitialisation… avec ses propres contrôles.
  'GET /api/auth/*',
  'POST /api/auth/*',
]);

/** Identifiant bien formé qui ne désigne rien. */
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

/** Adresse appelable d'un motif de route : chaque paramètre reçoit `value`. */
function concrete(url: string, value = UNKNOWN_ID): string {
  return url.replace(/:[A-Za-z]+/g, value).replace('*', 'x');
}

/** Un appel brut (sans le client de test, qui pose toujours une session). */
function inject(method: string, url: string, cookie?: string, payload: object = {}) {
  return api.app.inject({
    method: method as 'GET',
    url,
    headers: cookie ? { cookie } : {},
    ...(method !== 'GET' && { payload }),
  });
}

describe('routes déclarées', () => {
  it('la liste publique ne nomme que des routes qui existent', () => {
    const declared = new Set(api.routes.map((r) => `${r.method} ${r.url}`));
    expect(api.routes.length).toBeGreaterThan(100);
    expect([...PUBLIC_ROUTES].filter((r) => !declared.has(r))).toEqual([]);
  });

  it('toute route hors de la liste publique exige une session', async () => {
    const open: string[] = [];
    for (const { method, url } of api.routes) {
      if (PUBLIC_ROUTES.has(`${method} ${url}`)) continue;
      for (const cookie of [undefined, 'better-auth.session_token=invente.signature']) {
        const res = await inject(method, concrete(url), cookie);
        if (res.statusCode !== 401 || res.json<{ error: string }>().error !== 'UNAUTHENTICATED') {
          open.push(`${method} ${url}${cookie ? ' (cookie inventé)' : ''} → ${res.statusCode}`);
        }
      }
    }
    expect(open).toEqual([]);
  });

  it('toute route de l’admin est refusée à un joueur et à un admin sans second facteur', async () => {
    const admin = api.routes.filter((r) => r.url.startsWith('/api/admin/'));
    expect(admin.length).toBeGreaterThan(20);
    const player = await api.newPlayer('joueur-routes@example.com', 'JoueurRoutes');
    const halfAdmin = await api.signUp('demi-admin@example.com');
    await api.handle.db.update(users).set({ role: 'admin' }).where(eq(users.id, halfAdmin.userId));
    const open: string[] = [];
    for (const { method, url } of admin) {
      for (const [who, cookie, error] of [
        ['joueur', player.cookie, 'FORBIDDEN'],
        ['admin sans second facteur', halfAdmin.cookie, 'ADMIN_2FA_SETUP_REQUIRED'],
      ] as const) {
        const res = await inject(method, concrete(url), cookie);
        if (res.statusCode !== 403 || res.json<{ error: string }>().error !== error) {
          open.push(`${method} ${url} (${who}) → ${res.statusCode}`);
        }
      }
    }
    expect(open).toEqual([]);
  });
});

/**
 * Routes à identifiant (`:id`) d'un objet d'un joueur, par début d'adresse : le refus attendu
 * quand l'objet est à un autre.
 */
const OWNED: Record<string, string> = {
  '/api/pokemon/': 'POKEMON_NOT_FOUND',
  '/api/tags/': 'TAG_NOT_FOUND',
  '/api/teams/': 'TEAM_NOT_FOUND',
  '/api/eggs/': 'EGG_NOT_FOUND',
  '/api/museum/': 'FOSSIL_NOT_FOUND',
  '/api/expeditions/': 'EXPEDITION_NOT_FOUND',
  '/api/battles/': 'BATTLE_NOT_FOUND',
  '/api/dungeons/': 'DUNGEON_RUN_NOT_FOUND',
  '/api/legendary-battles/': 'BATTLE_NOT_FOUND',
};

/** Refus propres à une route, à la place de celui de son début d'adresse (`OWNED`). */
const ERRORS: Record<string, string> = {
  'DELETE /api/eggs/:id': 'EGG_NOT_INCUBATED',
};

/**
 * Routes idempotentes qui ne refusent pas un identifiant inconnu (204 sans effet) : le test
 * vérifie à la place que l'objet de l'autre joueur n'a pas changé.
 */
const SILENT = new Set([
  'POST /api/battles/:id/seen',
  'POST /api/dungeons/:id/seen',
  'POST /api/legendary-battles/:id/seen',
]);

/** Routes à `:id` qui ne désignent pas l'objet d'un joueur. */
const NOT_OWNED = new Set([
  // Quête du contenu (identique pour tous).
  'POST /api/quests/:id/battle',
  'POST /api/quests/:id/claim',
  // Guildes : publiques (liste, fiche), on y demande à entrer ou on retire sa demande.
  'GET /api/guilds/:id',
  'POST /api/guilds/:id/join',
  'DELETE /api/guilds/:id/request',
  // Message de la guilde du joueur : limité à sa guilde (guild-chat.test.ts).
  'DELETE /api/guild/messages/:id',
]);

/** Corps valides des routes qui en lisent un avant de chercher l'objet. */
const BODIES: Record<string, object> = {
  'PATCH /api/pokemon/:id': { locked: true },
  'POST /api/pokemon/:id/candies': { count: 1 },
  'POST /api/pokemon/:id/evolve': { toSpeciesId: 2, utcOffsetMinutes: 0 },
  'POST /api/pokemon/:id/mega': { itemId: 'venusaurite' },
  'POST /api/pokemon/:id/use-item': { itemId: 'rare-candy' },
  'PUT /api/tags/:id': { label: 'Volé', color: '#ff0000' },
  'PUT /api/teams/:id': { name: 'Volée', pokemonIds: [] },
  'POST /api/battles/:id/switch': { member: 0, atMs: 0 },
  'POST /api/battles/:id/item': { itemId: 'sitrus-berry', atMs: 0 },
  'POST /api/dungeons/:id/switch': { member: 0, atMs: 0 },
  'POST /api/dungeons/:id/item': { itemId: 'sitrus-berry', atMs: 0 },
  'POST /api/legendary-battles/:id/switch': { member: 0, atMs: 0 },
  'POST /api/legendary-battles/:id/item': { itemId: 'sitrus-berry', atMs: 0 },
  'POST /api/legendary-battles/:id/capture': { ballItemId: 'poke-ball' },
};

describe('objets d’un autre joueur', () => {
  /** Identifiant d'un objet du joueur visé, par début d'adresse (`OWNED`). */
  const victimIds: Record<string, string> = {};
  let victimCookie: string;
  let thiefCookie: string;

  beforeAll(async () => {
    const victim = await api.newPlayer('victime@example.com', 'Victime');
    const { call, userId: ownerId, starter } = victim;
    victimCookie = victim.cookie;
    const ok = <T>(res: { status: number; body: T }) => {
      expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
      return res.body;
    };
    const tag = ok(
      await call<PokemonTagDto>('POST', '/api/tags', { label: 'Rare', color: '#00ff00' }),
    );
    const team = ok(
      await call<PokemonTeamDto>('POST', '/api/teams', { name: 'A', pokemonIds: [starter.id] }),
    );
    const expedition = ok(
      await call<ExpeditionDto>('POST', '/api/expeditions', {
        zoneId: 'route-1',
        team: [starter.id],
        balls: { new: 'poke-ball', shiny: 'poke-ball', caught: 'poke-ball' },
        berryItemId: 'razz-berry',
        berryCount: 1,
      }),
    );
    // Combats, œuf et fossile écrits directement : leur contenu n'a pas d'importance, seul leur
    // propriétaire compte (une route qui les trouverait pour un autre répondrait autre chose que
    // 404). Combats terminés et réclamés, résultat pas encore vu : `SILENT` le marquerait vu.
    const { db } = api.handle;
    const later = new Date(api.clock.getTime() + 3_600_000);
    const fight = {
      ownerId,
      team: [starter.id],
      setup: {} as never,
      contentVersionId: 1,
      claimedAt: api.clock,
    };
    const [dungeon] = await db
      .insert(dungeonRuns)
      .values({ ...fight, dungeonId: 'x', endsAt: later })
      .returning();
    const [battle] = await db
      .insert(trainerRuns)
      .values({ ...fight, trainerId: 'x', endsAt: later })
      .returning();
    const [legendary] = await db
      .insert(legendaryBattles)
      .values({ ...fight, questId: 'x', pokemonIndex: 0, seed: 1, endsAt: later })
      .returning();
    const parent = { speciesId: 1 } as never;
    const [egg] = await db
      .insert(eggs)
      .values({
        ownerId,
        speciesId: 1,
        parents: [parent, parent],
        contentVersionId: 1,
        seed: 1,
        // En couveuse, pas à terme : son propriétaire peut le retirer.
        slotIndex: 0,
        incubatedAt: api.clock,
        hatchAt: later,
      })
      .returning();
    const [fossil] = await db
      .insert(fossilRevivals)
      .values({
        ownerId,
        itemId: 'helix-fossil',
        speciesId: 138,
        level: 5,
        contentVersionId: 1,
        readyAt: later,
        seed: 1,
      })
      .returning();
    Object.assign(victimIds, {
      '/api/pokemon/': starter.id,
      '/api/tags/': tag.id,
      '/api/teams/': team.id,
      '/api/eggs/': egg!.id,
      '/api/museum/': fossil!.id,
      '/api/expeditions/': expedition.id,
      '/api/battles/': battle!.id,
      '/api/dungeons/': dungeon!.id,
      '/api/legendary-battles/': legendary!.id,
    });

    thiefCookie = (await api.newPlayer('voleur@example.com', 'Voleur')).cookie;
  });

  it('chaque route à identifiant est classée', () => {
    const unclassified = api.routes
      .filter((r) => r.url.includes('/:id') && !r.url.startsWith('/api/admin/'))
      .map((r) => `${r.method} ${r.url}`)
      .filter((r) => !NOT_OWNED.has(r) && !Object.keys(OWNED).some((p) => r.includes(` ${p}`)));
    expect(unclassified).toEqual([]);
  });

  it('répond 404 avec l’identifiant de l’objet d’un autre joueur', async () => {
    const routes = api.routes.filter(
      (r) => r.url.includes('/:id') && !NOT_OWNED.has(`${r.method} ${r.url}`),
    );
    expect(routes.length).toBeGreaterThan(25);
    const leaks: string[] = [];
    for (const { method, url } of routes) {
      const prefix = Object.keys(OWNED).find((p) => url.startsWith(p));
      if (!prefix) continue;
      const route = `${method} ${url}`;
      const res = await inject(
        method,
        concrete(url, victimIds[prefix]),
        thiefCookie,
        BODIES[route],
      );
      const error = res.body ? res.json<{ error?: string }>().error : undefined;
      const expected = SILENT.has(route) ? [204, undefined] : [404, ERRORS[route] ?? OWNED[prefix]];
      if (res.statusCode !== expected[0] || error !== expected[1]) {
        leaks.push(`${route} → ${res.statusCode} ${error ?? ''}`);
      }
    }
    expect(leaks).toEqual([]);
    // Les routes `SILENT` n'ont rien marqué chez l'autre joueur.
    const { db } = api.handle;
    for (const [table, prefix] of [
      [trainerRuns, '/api/battles/'],
      [dungeonRuns, '/api/dungeons/'],
      [legendaryBattles, '/api/legendary-battles/'],
    ] as const) {
      const [row] = await db
        .select({ seen: table.resultSeenAt })
        .from(table)
        .where(eq(table.id, victimIds[prefix]!));
      expect(row, prefix).toEqual({ seen: null });
    }
  });

  it('les objets visés existent bien : leur propriétaire les trouve', async () => {
    // Sans quoi le test précédent passerait pour de mauvaises raisons (route qui lirait une autre
    // table que celle remplie ici). Une route par sorte d'objet, après celui-ci.
    const own: [string, string, object?][] = [
      ['PATCH', '/api/pokemon/:id', { locked: true }],
      ['PUT', '/api/tags/:id', { label: 'Rare', color: '#00ff00' }],
      ['PUT', '/api/teams/:id', { name: 'A', pokemonIds: [] }],
      ['DELETE', '/api/eggs/:id'],
      ['DELETE', '/api/museum/:id'],
      ['POST', '/api/expeditions/:id/cancel'],
      // Déjà réclamés : refusés, mais pas comme introuvables.
      ['POST', '/api/battles/:id/claim'],
      ['POST', '/api/dungeons/:id/claim'],
      ['POST', '/api/legendary-battles/:id/capture', { ballItemId: 'poke-ball' }],
    ];
    expect(own.map(([, url]) => url.slice(0, url.indexOf(':'))).sort()).toEqual(
      Object.keys(OWNED).sort(),
    );
    for (const [method, url, body] of own) {
      const prefix = url.slice(0, url.indexOf(':'));
      const res = await inject(method, concrete(url, victimIds[prefix]), victimCookie, body);
      expect(res.statusCode, `${method} ${url} : ${res.body}`).not.toBe(404);
    }
  });
});
