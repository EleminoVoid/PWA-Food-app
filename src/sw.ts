/// <reference lib="webworker" />

type PrecacheEntry = string | { url: string; revision?: string | null }

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: PrecacheEntry[]
}

const CACHE_PREFIX = 'nutriscan-offline'
const APP_CACHE = `${CACHE_PREFIX}-app-v4`
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-v4`

const precacheEntries = self.__WB_MANIFEST

function normalizeUrl(entry: PrecacheEntry) {
  const rawUrl = typeof entry === 'string' ? entry : entry.url
  return new URL(rawUrl, self.registration.scope).toString()
}

const appShellUrls = Array.from(new Set([
  new URL('/', self.registration.scope).toString(),
  new URL('/index.html', self.registration.scope).toString(),
  ...precacheEntries.map(normalizeUrl),
]))

const criticalShellUrls = [
  new URL('/', self.registration.scope).toString(),
  new URL('/index.html', self.registration.scope).toString(),
]

const offlineFallbackHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#063d24" />
    <title>NutriScan Offline</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; color: #132016; background: #dcefd8; }
      main { max-width: 28rem; padding: 2rem; text-align: center; }
      button { min-height: 44px; border: 0; border-radius: 999px; padding: 0 1rem; color: white; background: #063d24; font: inherit; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <h1>NutriScan is preparing offline mode</h1>
      <p>Open the app once while online, wait a few seconds, then it can launch after Wi-Fi, Chrome, and the local server are closed.</p>
      <button onclick="location.reload()">Try again</button>
    </main>
  </body>
</html>`

function offlineFallbackResponse() {
  return new Response(offlineFallbackHtml, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

async function cacheAppShell() {
  const cache = await caches.open(APP_CACHE)
  await Promise.all(
    criticalShellUrls.map(async (url) => {
      const response = await fetch(url, { cache: 'reload' })
      if (!response.ok) throw new Error(`Could not cache ${url}`)
      await cache.put(url, response)
    }),
  )

  await Promise.all(
    appShellUrls
      .filter((url) => !criticalShellUrls.includes(url))
      .map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'reload' })
        if (response.ok) await cache.put(url, response)
      } catch {
        // A single failed optional asset should not prevent app-shell install.
      }
    }),
  )
}

async function removeOldCaches() {
  const names = await caches.keys()
  await Promise.all(
    names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== APP_CACHE && name !== RUNTIME_CACHE)
      .map((name) => caches.delete(name)),
  )
}

async function cachedAppShell() {
  const cache = await caches.open(APP_CACHE)
  return cache.match(new URL('/index.html', self.registration.scope).toString(), { ignoreSearch: true })
    ?? cache.match(new URL('/', self.registration.scope).toString(), { ignoreSearch: true })
}

async function cacheFirst(request: Request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(RUNTIME_CACHE)
    await cache.put(request, response.clone())
  }
  return response
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    removeOldCaches()
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
  if (event.data?.type === 'WARM_CACHE') {
    event.waitUntil(cacheAppShell())
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/api/')) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(RUNTIME_CACHE)
            await cache.put(request, response.clone())
          }
          return response
        })
        .catch(async () => {
          const shell = await cachedAppShell()
          return shell ?? offlineFallbackResponse()
        }),
    )
    return
  }

  event.respondWith(
    cacheFirst(request).catch(async () => {
      const shell = await cachedAppShell()
      return shell ?? offlineFallbackResponse()
    }),
  )
})
