/* Service worker de Poké Collect : jeu installable (PWA) et notifications push.
 *
 * Cache :
 *  - pages et code du jeu : réseau d'abord, cache en secours (hors ligne, on rouvre la dernière
 *    version chargée) ; le jeu reste toujours à jour quand le réseau répond ;
 *  - sprites (dépôt PokeAPI/sprites, immuables) : cache d'abord ;
 *  - l'API (`/api/*`) n'est jamais mise en cache : le serveur décide de tout.
 */

const VERSION = 'v1';
const APP_CACHE = `app-${VERSION}`;
const SPRITE_CACHE = `sprites-${VERSION}`;
const SPRITE_HOSTS = ['raw.githubusercontent.com', 'play.pokemonshowdown.com'];
const MAX_SPRITES = 1500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== APP_CACHE && k !== SPRITE_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

async function networkFirst(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached =
      (await cache.match(request)) ?? (request.mode === 'navigate' ? await cache.match('/') : null);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SPRITE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // Réponses « opaques » (sans CORS) acceptées : les sprites sont des <img>.
  if (response.ok || response.type === 'opaque') {
    await cache.put(request, response.clone());
    trimCache(SPRITE_CACHE, MAX_SPRITES);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (SPRITE_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // Serveur de développement Vite : modules à jour à chaque rechargement, rien à garder.
  if (/^\/(src|@|node_modules)\//.test(url.pathname)) return;
  event.respondWith(networkFirst(request));
});

// --- Notifications push ------------------------------------------------------------------

self.addEventListener('push', (event) => {
  let data = { title: 'Poké Collect', body: '', url: '/', tag: 'activity' };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      renotify: true,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Un onglet du jeu est déjà ouvert : on le ramène au premier plan sur le bon onglet.
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.navigate(target).then((w) => (w ?? open).focus());
      return self.clients.openWindow(target);
    }),
  );
});
