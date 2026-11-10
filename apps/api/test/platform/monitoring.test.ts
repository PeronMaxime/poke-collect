import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedContent } from '@poke/content/seed';
import { createDb, ensureSeedContent } from '@poke/db';
import { buildApp } from '../../src/app';
import { loadEnv } from '../../src/env';
import { Monitoring } from '../../src/monitoring';

describe('Monitoring', () => {
  it('compte requêtes, erreurs, refus 429 et lenteurs par route', () => {
    let at = Date.parse('2026-11-04T10:00:30Z');
    const monitoring = new Monitoring(() => at, 500);
    expect(monitoring.record('GET /api/pokemon', 200, 20)).toBe(false);
    expect(monitoring.record('GET /api/pokemon', 200, 700)).toBe(true);
    monitoring.record('GET /api/pokemon', 429, 1);
    monitoring.record('POST /api/pokemon/transfer', 503, 30);
    at += 60_000;
    monitoring.record('GET /api/me', 200, 5);

    const snap = monitoring.snapshot();
    expect(snap.totals).toEqual({ requests: 5, errors: 1, limited: 1, slow: 1 });
    const pokemon = snap.routes.find((r) => r.route === 'GET /api/pokemon')!;
    expect(pokemon).toMatchObject({ count: 3, errors: 0, limited: 1, slow: 1, maxMs: 700 });
    expect(pokemon.avgMs).toBe(240);
    // La plus lente (p95) en tête.
    expect(snap.routes[0]!.route).toBe('GET /api/pokemon');

    expect(snap.minutes.map((m) => m.requests)).toEqual([4, 1]);
    expect(snap.minutes[0]).toMatchObject({ errors: 1, limited: 1, slow: 1, maxMs: 700 });
  });

  it('garde les 50 dernières erreurs 5xx, tronquées, la plus récente en tête', () => {
    let at = Date.parse('2026-11-04T10:00:00Z');
    const monitoring = new Monitoring(() => at);
    for (let i = 0; i < 55; i++) {
      at += 1000;
      monitoring.recordError('POST /api/x', 500, new Error(`échec ${i}`));
    }
    monitoring.recordError('GET /api/y', 503, new Error('x'.repeat(5000)), '40P01');

    const errors = monitoring.snapshot().recentErrors;
    expect(errors).toHaveLength(50);
    expect(errors[0]).toMatchObject({ route: 'GET /api/y', status: 503, code: '40P01' });
    expect(errors[0]!.message.length).toBeLessThan(700);
    expect(errors[1]!.message).toBe('échec 54');
    expect(errors[49]!.message).toBe('échec 6');
  });

  it('estime le 95e centile par paliers, plafonné à la durée maximale vue', () => {
    const monitoring = new Monitoring(() => 0);
    for (let i = 0; i < 99; i++) monitoring.record('GET /a', 200, 10);
    monitoring.record('GET /a', 200, 3000);
    expect(monitoring.snapshot().routes[0]!.p95Ms).toBe(25);

    const slowOnes = new Monitoring(() => 0);
    for (let i = 0; i < 10; i++) slowOnes.record('GET /b', 200, 30);
    // Palier 25-50 ms, mais jamais au-dessus du maximum vu.
    expect(slowOnes.snapshot().routes[0]!.p95Ms).toBe(30);
  });

  it('résume puis remet à zéro, et oublie les minutes anciennes', () => {
    let at = 0;
    const monitoring = new Monitoring(() => at);
    monitoring.record('GET /a', 500, 10);
    monitoring.record('GET /a', 200, 10);
    expect(monitoring.takeSummary()).toEqual({ requests: 2, errors: 1, limited: 0, slow: 0 });
    expect(monitoring.takeSummary()).toEqual({ requests: 0, errors: 0, limited: 0, slow: 0 });

    at = 200 * 60_000;
    monitoring.record('GET /a', 200, 10);
    expect(monitoring.snapshot().minutes).toHaveLength(1);
  });
});

describe('supervision de l’API', () => {
  const handle = createDb({ pgliteDataDir: 'memory://' });
  const env = loadEnv({ NODE_ENV: 'test' });
  let built: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await handle.migrate();
    await ensureSeedContent(handle.db, seedContent);
    built = await buildApp({ db: handle.db, env: { ...env, rateLimitPerMinute: 3 } });
  });
  afterAll(async () => {
    await built.app.close();
    await handle.close();
  });

  it('mesure les réponses par motif de route, 429 et adresses inconnues compris', async () => {
    const get = (url: string) => built.app.inject({ method: 'GET', url });
    for (let i = 0; i < 4; i++) await get('/api/config');
    // L'adresse réelle n'apparaît jamais : les inconnues sont regroupées.
    await built.app.inject({ method: 'GET', url: '/inconnue/12345', headers: { cookie: 'x=1' } });

    const { routes, totals } = built.monitoring.snapshot();
    const config = routes.find((r) => r.route === 'GET /api/config');
    expect(config).toMatchObject({ count: 4, limited: 1, errors: 0 });
    expect(totals.limited).toBeGreaterThanOrEqual(1);
    expect(routes.some((r) => r.route.includes('12345'))).toBe(false);
  });

  it('réserve la route des mesures aux administrateurs', async () => {
    const open = await buildApp({ db: handle.db, env });
    try {
      const res = await open.app.inject({ method: 'GET', url: '/api/admin/metrics' });
      expect([401, 403]).toContain(res.statusCode);
    } finally {
      await open.app.close();
    }
  });
});
