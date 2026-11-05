#!/usr/bin/env node
// Scénario de charge : rejoue une session type de plusieurs joueurs en parallèle contre une API
// lancée (copie de la base, jamais la production). Voir README.md.
//
//   node scripts/load-test/load-test.mjs                      lance le scénario
//   node scripts/load-test/load-test.mjs --compare a.json b.json   compare deux rapports

import { writeFileSync, readFileSync } from 'node:fs';

const env = process.env;
const config = {
  api: (env.LOAD_API_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  origin: env.LOAD_ORIGIN ?? 'http://localhost:5173',
  players: Number(env.LOAD_PLAYERS ?? 5),
  /** Pokémon transférés par joueur. */
  transfer: Number(env.LOAD_TRANSFER ?? 500),
  /** Rechargements de la liste du PC (conditionnels, ETag) : l'équivalent côté serveur des flèches. */
  arrows: Number(env.LOAD_ARROWS ?? 50),
  /** Pokémon par lot de transfert (le jeu envoie des lots de 1000 au plus). */
  batch: Number(env.LOAD_BATCH ?? 250),
  password: env.LOAD_PASSWORD ?? 'charge-motdepasse-1',
  label: env.LOAD_LABEL ?? 'essai',
  out: env.LOAD_OUT,
};

/** Mesures : une entrée par requête. */
const samples = [];

class Client {
  constructor(name) {
    this.name = name;
    this.cookies = new Map();
  }

  /** Requête mesurée ; `label` regroupe les adresses d'une même route (jamais d'identifiant). */
  async call(label, method, path, { json, headers = {} } = {}) {
    const started = performance.now();
    let status;
    let body = null;
    try {
      const res = await fetch(config.api + path, {
        method,
        headers: {
          origin: config.origin,
          ...(json !== undefined && { 'content-type': 'application/json' }),
          ...(this.cookies.size > 0 && {
            cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
          }),
          ...headers,
        },
        ...(json !== undefined && { body: JSON.stringify(json) }),
        signal: AbortSignal.timeout(30_000),
      });
      status = res.status;
      for (const line of res.headers.getSetCookie()) {
        const [pair] = line.split(';');
        const eq = pair.indexOf('=');
        this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
      }
      const text = await res.text();
      body = text ? safeJson(text) : null;
      this.etag = res.headers.get('etag');
    } catch {
      status = 0; // coupure ou délai dépassé
    }
    const error = typeof body?.error === 'string' ? ` ${body.error}` : '';
    samples.push({
      label: `${method} ${label}`,
      status,
      key: `${status}${error}`,
      ms: performance.now() - started,
    });
    return { status, body, ok: status >= 200 && status < 300 };
  }
}

const safeJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;

// --- Scénario ---------------------------------------------------------------------------

/** Les lectures que le jeu fait à son ouverture (une dizaine en parallèle, comme le navigateur). */
const OPENING_READS = [
  '/api/me',
  '/api/content',
  '/api/pokemon',
  '/api/pokedex',
  '/api/pokedex/forms',
  '/api/inventory',
  '/api/candies',
  '/api/expeditions',
  '/api/daycare',
  '/api/museum',
  '/api/farm',
  '/api/battles',
  '/api/dungeons',
  '/api/quests',
  '/api/shop',
  '/api/assistants',
  '/api/tags',
  '/api/teams',
  '/api/progression',
  '/api/guild',
];

const emailOf = (n) => `load-${n + 1}@load.test`;

/** Crée le compte de charge `n` (profil et starter compris) ; sans effet s'il existe déjà. */
async function createPlayer(client, n) {
  const email = emailOf(n);
  const up = await client.call('/api/auth/sign-up/email', 'POST', '/api/auth/sign-up/email', {
    json: { email, password: config.password, name: `load${n + 1}` },
  });
  if (!up.ok) {
    // Compte déjà créé : on le complète seulement s'il n'a pas (encore) de profil.
    const login = await client.call('/api/auth/sign-in/email', 'POST', '/api/auth/sign-in/email', {
      json: { email, password: config.password },
    });
    if (!login.ok) throw new Error(`Connexion refusée (${login.status}) pour ${email}`);
    const me = await client.call('/api/me', 'GET', '/api/me');
    if (me.body?.profile) return false;
  }
  const profile = await client.call('/api/profile', 'POST', '/api/profile', {
    json: { trainerName: `Chargeur${n + 1}` },
  });
  if (!profile.ok) throw new Error(`Profil refusé (${profile.status}) pour ${email}`);
  const starter = await client.call('/api/starter', 'POST', '/api/starter', {
    json: { speciesId: 1 },
  });
  if (!starter.ok) throw new Error(`Starter refusé (${starter.status}) pour ${email}`);
  return true;
}

/** Connecte le compte de charge `n` ; renvoie son identifiant et s'il est administrateur. */
async function signIn(client, n) {
  const login = await client.call('/api/auth/sign-in/email', 'POST', '/api/auth/sign-in/email', {
    json: { email: emailOf(n), password: config.password },
  });
  if (!login.ok) {
    throw new Error(
      `Connexion refusée (${login.status}) pour ${emailOf(n)} : lance d'abord « --prepare ».`,
    );
  }
  const me = await client.call('/api/me', 'GET', '/api/me');
  if (!me.body?.profile)
    throw new Error(`${emailOf(n)} n'a pas de profil : relance « --prepare ».`);
  const admin = await client.call('/api/admin/me', 'GET', '/api/admin/me');
  return { userId: me.body.user.id, isAdmin: admin.ok };
}

/** Remplit la collection avec des Pokémon de test (le joueur doit être administrateur). */
async function fillCollection(client, userId, regions) {
  for (let round = 0; round < 40; round++) {
    const list = await client.call('/api/pokemon', 'GET', '/api/pokemon');
    if ((list.body?.length ?? 0) >= config.transfer + 10) return;
    for (const region of regions) {
      await client.call(
        '/api/admin/players/:id/test-pokemon',
        'POST',
        `/api/admin/players/${userId}/test-pokemon`,
        { json: { regionId: region.id, level: 20, perfectIvs: false, legendaries: false } },
      );
    }
  }
}

/**
 * Transfère un lot. Le serveur refuse tout le lot s'il contient un légendaire ou un fabuleux
 * (POKEMON_LEGENDARY) : le script ne connaît pas les espèces, il coupe donc le lot en deux jusqu'à
 * isoler le fautif (ces refus 409 sont attendus et figurent dans le rapport).
 */
async function transferBatch(client, ids) {
  const res = await client.call('/api/pokemon/transfer', 'POST', '/api/pokemon/transfer', {
    json: { ids },
  });
  if (res.status === 409 && res.body?.error === 'POKEMON_LEGENDARY' && ids.length > 1) {
    const half = Math.ceil(ids.length / 2);
    await transferBatch(client, ids.slice(0, half));
    await transferBatch(client, ids.slice(half));
  }
}

async function playSession(client, userId, content) {
  const timings = {};
  const step = async (name, fn) => {
    const started = performance.now();
    await fn();
    timings[name] = Math.round(performance.now() - started);
  };

  // 1. Ouverture du jeu : les lectures en parallèle.
  await step('ouverture', () =>
    Promise.all(OPENING_READS.map((path) => client.call(path, 'GET', path))),
  );

  // 2. Navigation dans le PC : rechargements conditionnels de la liste (304 tant que rien ne change).
  await step('pc', async () => {
    const first = await client.call('/api/pokemon', 'GET', '/api/pokemon');
    const etag = client.etag;
    for (let i = 0; i < config.arrows; i++) {
      await client.call('/api/pokemon', 'GET', '/api/pokemon', {
        headers: etag ? { 'if-none-match': etag } : {},
      });
    }
    return first;
  });

  // 3. Expéditions : récupération de celles qui tournent déjà (la zone impose une durée minimale,
  // une récupération trop tôt est refusée en 409), puis départ d'une nouvelle si une place est libre.
  await step('expedition', async () => {
    const zone = content.zones.find(
      (z) => z.enabled !== false && z.minPower === 0 && z.requiredTypes.length === 0,
    );
    const running = await client.call('/api/expeditions', 'GET', '/api/expeditions');
    for (const e of running.body?.active ?? []) {
      await client.call('/api/expeditions/:id/claim', 'POST', `/api/expeditions/${e.id}/claim`);
    }
    const list = await client.call('/api/pokemon', 'GET', '/api/pokemon');
    const starter = list.body?.find((p) => !p.busy && !p.knockedOut && !p.locked);
    if (zone && starter) {
      await client.call('/api/expeditions', 'POST', '/api/expeditions', {
        json: {
          zoneId: zone.id,
          team: [starter.id],
          balls: { new: null, shiny: null, caught: null },
          berryItemId: null,
          utcOffsetMinutes: 60,
        },
      });
    }
    await Promise.all(
      ['/api/expeditions', '/api/pokemon', '/api/inventory'].map((p) => client.call(p, 'GET', p)),
    );
  });

  // 4. Transfert par lots, puis les rechargements ciblés (Pokémon et Bonbons).
  await step('transfert', async () => {
    const list = await client.call('/api/pokemon', 'GET', '/api/pokemon');
    const ids = (list.body ?? [])
      .filter((p) => !p.locked && !p.busy)
      .slice(0, config.transfer)
      .map((p) => p.id);
    for (let i = 0; i < ids.length; i += config.batch) {
      await transferBatch(client, ids.slice(i, i + config.batch));
    }
    await Promise.all(['/api/pokemon', '/api/candies'].map((p) => client.call(p, 'GET', p)));
  });

  return { userId, timings };
}

/** Crée les comptes de charge (une fois par base). */
async function prepare() {
  for (let n = 0; n < config.players; n++) {
    const created = await createPlayer(new Client(`joueur${n}`), n);
    console.log(`${emailOf(n)} : ${created ? 'créé' : 'existe déjà'}`);
  }
  console.log(
    `\nPour remplir leur PC de Pokémon de test (transferts), donne-leur le rôle admin :\n` +
      Array.from({ length: config.players }, (_, n) => `  pnpm admin:promote ${emailOf(n)}`).join(
        '\n',
      ),
  );
}

async function run() {
  const startedAt = new Date();
  const base = new Client('base');
  const contentRes = await base.call('/api/content', 'GET', '/api/content');
  if (!contentRes.ok)
    throw new Error(`API injoignable ou contenu absent (${contentRes.status}) : ${config.api}`);
  const content = contentRes.body;
  const regions = [...content.regions].sort((a, b) => a.order - b.order).slice(0, 3);

  console.log(`Connexion de ${config.players} joueur(s) sur ${config.api}…`);
  const players = [];
  for (let n = 0; n < config.players; n++) {
    const client = new Client(`joueur${n}`);
    const { userId, isAdmin } = await signIn(client, n);
    if (isAdmin) await fillCollection(client, userId, regions);
    else if (config.transfer > 0)
      console.warn(
        `${emailOf(n)} n'est pas administrateur : pas de Pokémon de test, pas de gros transfert.`,
      );
    players.push({ client, userId, isAdmin });
  }

  // Les mesures de préparation ne comptent pas : seule la session rejouée est rapportée.
  samples.length = 0;

  console.log('Session type en parallèle…');
  const wallStart = performance.now();
  const sessions = await Promise.all(players.map((p) => playSession(p.client, p.userId, content)));
  const wallMs = Math.round(performance.now() - wallStart);

  // Mesures du serveur (si un joueur est administrateur) : lecture à part, hors rapport client.
  const adminPlayer = players.find((p) => p.isAdmin);
  const serverAfter = adminPlayer
    ? await adminPlayer.client.call('/api/admin/metrics', 'GET', '/api/admin/metrics')
    : null;
  return buildReport({ startedAt, wallMs, sessions, serverAfter });
}

// --- Rapport ----------------------------------------------------------------------------

function buildReport({ startedAt, wallMs, sessions, serverAfter }) {
  const byRoute = new Map();
  for (const s of samples) {
    const entry = byRoute.get(s.label) ?? { times: [], statuses: {} };
    entry.times.push(s.ms);
    entry.statuses[s.key] = (entry.statuses[s.key] ?? 0) + 1;
    byRoute.set(s.label, entry);
  }
  const routes = [...byRoute].map(([label, { times, statuses }]) => {
    const sorted = [...times].sort((a, b) => a - b);
    return {
      route: label,
      count: sorted.length,
      p50: Math.round(percentile(sorted, 0.5)),
      p95: Math.round(percentile(sorted, 0.95)),
      max: Math.round(sorted.at(-1) ?? 0),
      statuses,
    };
  });
  routes.sort((a, b) => b.p95 - a.p95);

  const all = samples.map((s) => s.ms).sort((a, b) => a - b);
  const count = (pred) => samples.filter((s) => pred(s.status)).length;
  const timings = {};
  for (const { timings: t } of sessions) {
    for (const [name, ms] of Object.entries(t)) (timings[name] ??= []).push(ms);
  }
  const steps = Object.fromEntries(
    Object.entries(timings).map(([name, list]) => [
      name,
      {
        avgMs: Math.round(list.reduce((a, b) => a + b, 0) / list.length),
        maxMs: Math.max(...list),
      },
    ]),
  );

  return {
    label: config.label,
    at: startedAt.toISOString(),
    config: {
      players: config.players,
      transfer: config.transfer,
      arrows: config.arrows,
      batch: config.batch,
    },
    wallMs,
    requests: samples.length,
    requestsPerSecond: Math.round((samples.length / wallMs) * 10000) / 10,
    p50: Math.round(percentile(all, 0.5)),
    p95: Math.round(percentile(all, 0.95)),
    p99: Math.round(percentile(all, 0.99)),
    max: Math.round(all.at(-1) ?? 0),
    rateLimited: count((s) => s === 429),
    serverErrors: count((s) => s >= 500),
    networkErrors: count((s) => s === 0),
    steps,
    routes,
    // Côté serveur (processus entier, depuis son démarrage) : routes les plus lentes.
    server: serverAfter?.body
      ? { slowest: serverAfter.body.routes.slice(0, 8), totals: serverAfter.body.totals }
      : null,
  };
}

function printReport(r) {
  const line = (...cols) =>
    console.log(cols.map((c, i) => String(c).padEnd(i === 0 ? 46 : 9)).join(''));
  console.log(
    `\n=== ${r.label} — ${r.config.players} joueur(s), ${r.requests} requêtes en ${r.wallMs} ms (${r.requestsPerSecond}/s) ===`,
  );
  console.log(`Durées : p50 ${r.p50} ms · p95 ${r.p95} ms · p99 ${r.p99} ms · max ${r.max} ms`);
  console.log(
    `Refus 429 : ${r.rateLimited} · erreurs 5xx : ${r.serverErrors} · coupures : ${r.networkErrors}`,
  );
  console.log('\nÉtapes (par joueur) :');
  for (const [name, s] of Object.entries(r.steps))
    console.log(`  ${name.padEnd(14)} moyenne ${s.avgMs} ms · pire ${s.maxMs} ms`);
  console.log('');
  line('Route', 'Req.', 'p50', 'p95', 'max');
  for (const route of r.routes.slice(0, 15)) {
    const odd = Object.entries(route.statuses).filter(([s]) => !['200', '201', '304'].includes(s));
    line(route.route, route.count, route.p50, route.p95, route.max);
    if (odd.length)
      console.log(`    statuts inhabituels : ${odd.map(([s, n]) => `${s}×${n}`).join(', ')}`);
  }
}

function compare(aPath, bPath) {
  const a = JSON.parse(readFileSync(aPath, 'utf8'));
  const b = JSON.parse(readFileSync(bPath, 'utf8'));
  const delta = (x, y) =>
    x === 0 ? '—' : `${y - x >= 0 ? '+' : ''}${Math.round(((y - x) / x) * 100)} %`;
  const row = (name, x, y) =>
    console.log(`${name.padEnd(24)}${String(x).padEnd(12)}${String(y).padEnd(12)}${delta(x, y)}`);
  console.log(`${''.padEnd(24)}${a.label.padEnd(12)}${b.label.padEnd(12)}écart`);
  row('Requêtes', a.requests, b.requests);
  row('Durée totale (ms)', a.wallMs, b.wallMs);
  row('p50 (ms)', a.p50, b.p50);
  row('p95 (ms)', a.p95, b.p95);
  row('p99 (ms)', a.p99, b.p99);
  row('Refus 429', a.rateLimited, b.rateLimited);
  row('Erreurs 5xx', a.serverErrors, b.serverErrors);
  for (const name of Object.keys(b.steps)) {
    if (a.steps[name]) row(`Étape ${name} (ms)`, a.steps[name].avgMs, b.steps[name].avgMs);
  }
}

if (process.argv[2] === '--prepare') {
  try {
    await prepare();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 2;
  }
} else if (process.argv[2] === '--compare') {
  if (process.argv.length < 5) {
    console.error('Usage : load-test.mjs --compare avant.json apres.json');
    process.exitCode = 2;
  } else {
    compare(process.argv[3], process.argv[4]);
  }
} else {
  try {
    const report = await run();
    printReport(report);
    if (config.out) {
      writeFileSync(config.out, JSON.stringify(report, null, 2));
      console.log(`\nRapport écrit dans ${config.out}`);
    }
    process.exitCode = report.serverErrors > 0 || report.networkErrors > 0 ? 1 : 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 2;
  }
}
