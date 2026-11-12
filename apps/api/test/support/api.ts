import { afterAll, beforeAll, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content/seed';
import type { GameContentData } from '@poke/content';
import { createDb, ensureSeedContent, users } from '@poke/db';
import type { PokemonDto } from '@poke/shared';
import { buildApp } from '../../src/app';
import type { AppOptions } from '../../src/app';
import type { ContentCache } from '../../src/content-cache';
import { loadEnv } from '../../src/env';

/**
 * Mise en place commune des tests de l'API : la vraie application sur une base PGlite en mémoire,
 * une horloge que le test fait avancer, et de quoi créer des joueurs et appeler les routes.
 *
 *     const api = testApi({ start: '2026-10-07T10:00:00Z' });
 *     const { handle, advance, newPlayer } = api;
 *
 *     it('…', async () => {
 *       const { call } = await newPlayer('sacha@test.fr', 'Sacha');
 *       advance(60);
 *       expect((await call('GET', '/api/expeditions')).status).toBe(200);
 *     });
 *
 * `testApi` s'appelle au premier niveau du fichier de test : il enregistre lui-même le `beforeAll`
 * (migrations, contenu, application) et le `afterAll` (fermeture). Chaque fichier a sa propre base.
 */

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type App = Awaited<ReturnType<typeof buildApp>>['app'];

/** Appelle une route avec la session d'un joueur ; `body` est le JSON de la réponse (null si vide). */
export type Call = <T>(
  method: Method,
  url: string,
  payload?: unknown,
) => Promise<{ status: number; body: T }>;

export interface TestApiOptions {
  /**
   * Heure de départ de l'horloge du test (ISO). Absente : l'application garde l'horloge réelle, et
   * `advance` n'a pas d'effet sur elle.
   */
  start?: string;
  /** Contenu importé dans la base ; par défaut le contenu de test (`seedContent`). */
  content?: GameContentData | (() => GameContentData);
  /** Options de `buildApp` en plus de la base, de l'environnement et de l'horloge. */
  app?: Partial<Omit<AppOptions, 'db' | 'env' | 'now'>>;
}

/** Origine acceptée par l'authentification (celle du jeu en développement). */
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'motdepasse-solide';

/** Lance l'API de test du fichier courant (voir l'en-tête du module). */
export function testApi(options: TestApiOptions = {}) {
  const handle = createDb({ pgliteDataDir: 'memory://' });
  const env = loadEnv({ NODE_ENV: 'test' });
  let clock = new Date(options.start ?? Date.now());
  let app: App | undefined;
  let content: ContentCache | undefined;

  beforeAll(async () => {
    await handle.migrate();
    const data = typeof options.content === 'function' ? options.content() : options.content;
    await ensureSeedContent(handle.db, data ?? seedContent);
    ({ app, content } = await buildApp({
      db: handle.db,
      env,
      ...(options.start !== undefined && { now: () => clock }),
      ...options.app,
    }));
  });
  afterAll(async () => {
    await app?.close();
    await handle.close();
  });

  const ready = <T>(value: T | undefined): T => {
    if (value === undefined) throw new Error("L'API de test n'est pas encore démarrée (beforeAll)");
    return value;
  };

  /** Crée un compte ; `name` est le nom du compte (par défaut, le début de l'e-mail). */
  async function signUp(
    email: string,
    name = email.split('@')[0]!,
  ): Promise<{ cookie: string; userId: string }> {
    const res = await ready(app).inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      payload: { email, password: PASSWORD, name },
    });
    expect(res.statusCode, res.body).toBe(200);
    const cookies = res.headers['set-cookie'];
    const list = Array.isArray(cookies) ? cookies : [cookies ?? ''];
    const [user] = await handle.db.select().from(users).where(eq(users.email, email));
    return { cookie: list.map((c) => c.split(';')[0]).join('; '), userId: user!.id };
  }

  /** De quoi appeler les routes avec la session `cookie`. */
  function client(cookie: string): Call {
    return async <T>(method: Method, url: string, payload?: unknown) => {
      const res = await ready(app).inject({
        method,
        url,
        headers: { cookie },
        ...(payload !== undefined && { payload: payload as object }),
      });
      return { status: res.statusCode, body: (res.body ? res.json() : null) as T };
    };
  }

  /**
   * Crée un joueur prêt à jouer : compte, profil (`trainerName`, par défaut le début de l'e-mail)
   * et starter (`starterId`, Bulbizarre par défaut ; null : pas encore de starter).
   */
  async function newPlayer(
    email: string,
    trainerName: string,
    starterId: null,
  ): Promise<{ call: Call; userId: string; cookie: string; starter: null }>;
  async function newPlayer(
    email: string,
    trainerName?: string,
    starterId?: number,
  ): Promise<{ call: Call; userId: string; cookie: string; starter: PokemonDto }>;
  async function newPlayer(
    email: string,
    trainerName = email.split('@')[0]!,
    starterId: number | null = 1,
  ) {
    const { cookie, userId } = await signUp(email, trainerName);
    const call = client(cookie);
    expect((await call('POST', '/api/profile', { trainerName })).status).toBe(201);
    if (starterId === null) return { call, userId, cookie, starter: null };
    const starter = await call<PokemonDto>('POST', '/api/starter', { speciesId: starterId });
    expect(starter.status).toBe(201);
    return { call, userId, cookie, starter: starter.body };
  }

  return {
    handle,
    env,
    /** L'application Fastify ; un test peut la remplacer (redémarrage du serveur). */
    get app(): App {
      return ready(app);
    },
    set app(value: App) {
      app = value;
    },
    /** Le contenu publié, tel que l'application le garde en mémoire. */
    get content(): ContentCache {
      return ready(content);
    },
    /** L'heure du test ; se règle directement, ou s'avance avec `advance`. */
    get clock(): Date {
      return clock;
    },
    set clock(value: Date) {
      clock = value;
    },
    /** Avance l'horloge du test de `minutes` minutes. */
    advance(minutes: number): void {
      clock = new Date(clock.getTime() + minutes * 60_000);
    },
    signUp,
    client,
    newPlayer,
  };
}
