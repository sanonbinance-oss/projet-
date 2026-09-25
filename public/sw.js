/* ==========================================================================
 * PayKal — Service Worker (PWA installable, compatible routing SPA)
 * --------------------------------------------------------------------------
 * Principes :
 *  1. Navigation (routes SPA /admin, /recharger, ...) : réseau d'abord,
 *     repli sur la coquille `index.html` mise en cache => fonctionne hors-ligne
 *     ET ne casse jamais un rafraîchissement (F5) sur une route profonde.
 *  2. Assets hachés (/assets/*.js|css) : stale-while-revalidate (rapides).
 *  3. Requêtes Supabase (auth / rest / storage) : JAMAIS mises en cache,
 *     toujours réseau pur (données privées + temps réel).
 *  4. Mise à jour : nouvelle version => nouveau cache, purge des anciens,
 *     `skipWaiting` + `clients.claim` (l'app applique la mise à jour au
 *     prochain chargement, sans "app fantôme" figée).
 *
 * Pour publier une mise à jour : incrémenter APP_VERSION ci-dessous.
 * ========================================================================== */

const APP_VERSION = '1.0.0'
const CACHE_PREFIX = 'paykal'
const STATIC_CACHE = `${CACHE_PREFIX}-static-v${APP_VERSION}`
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-v${APP_VERSION}`
const APP_SHELL = '/index.html'
const PRECACHE_URLS = [
  '/',
  APP_SHELL,
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
]

/* ------------------------------- Installation ----------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE)
      // allSettled : un fichier manquant ne doit pas casser toute l'installation
      await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' }))))
      await self.skipWaiting()
    })(),
  )
})

/* -------------------------------- Activation ------------------------------ */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      )
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.disable()
        } catch {
          /* ignoré */
        }
      }
      await self.clients.claim()
    })(),
  )
})

/* --------------------------------- Helpers -------------------------------- */
const isStaticAsset = (pathname) =>
  /^\/assets\//.test(pathname) ||
  /\.(?:js|mjs|css|woff2?|ttf|png|jpe?g|svg|webp|gif|ico)$/i.test(pathname)

const isSupabaseApi = (url) =>
  url.pathname.startsWith('/rest/') ||
  url.pathname.startsWith('/auth/') ||
  url.pathname.startsWith('/storage/') ||
  url.pathname.startsWith('/realtime/') ||
  url.hostname.endsWith('.supabase.co') ||
  url.hostname.endsWith('.supabase.in')

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true })
  if (cached) return cached
  const response = await fetch(request)
  if (response && response.ok) {
    const cache = await caches.open(RUNTIME_CACHE)
    cache.put(request, response.clone())
  }
  return response
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(request, { ignoreSearch: true })
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok && response.type === 'basic') cache.put(request, response.clone())
      return response
    })
    .catch(() => null)
  return cached || (await network) || Response.error()
}

async function handleNavigation(request) {
  try {
    const response = await fetch(request)
    if (response && response.ok) {
      const cache = await caches.open(STATIC_CACHE)
      // On réécrit toujours la coquille sous la même clé : /index.html
      cache.put(APP_SHELL, response.clone())
    }
    return response
  } catch {
    const cachedShell =
      (await caches.match(APP_SHELL, { ignoreSearch: true })) || (await caches.match('/', { ignoreSearch: true }))
    if (cachedShell) return cachedShell
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>PayKal hors-ligne</title><body style="font-family:system-ui;padding:32px;text-align:center"><h1>PayKal</h1><p>Vous êtes hors-ligne et l\'application n\'est pas encore installée. Reconnectez-vous puis rouvrez PayKal.</p></body>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }
}

/* ---------------------------------- Fetch --------------------------------- */
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  if (!request.url.startsWith('http')) return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  // 1) Supabase & autres origines : réseau uniquement (jamais de cache).
  if (url.origin !== self.location.origin) return
  if (isSupabaseApi(url)) return

  // 2) Navigations SPA.
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request))
    return
  }

  // 3) Assets statiques.
  if (isStaticAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  // 4) Reste (manifest, robots, icônes non listées...).
  event.respondWith(cacheFirst(request).catch(() => caches.match(request)))
})

/* --------------------------------- Messages ------------------------------- */
self.addEventListener('message', (event) => {
  const data = event.data
  if (!data) return
  if (data === 'SKIP_WAITING' || data.type === 'SKIP_WAITING') self.skipWaiting()
  if (data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: APP_VERSION, caches: [STATIC_CACHE, RUNTIME_CACHE] })
  }
})

/* ------------------------- Notification de mise à jour --------------------- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow('/')
    })(),
  )
})
