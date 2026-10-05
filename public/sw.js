const CACHE = 'clubeon-catalog-public-v1'
const STATIC = ['/offline.html', '/manifest.webmanifest', '/icons/icon-180.png', '/icons/icon-192.png', '/icons/icon-512.png']
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('clubeon-catalog-public-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url)
  // API responses, sessions, uploads and external links always go directly to the network.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate') {
    // Never cache HTML with invitation URLs or authenticated state.
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')))
    return
  }
  if (!STATIC.includes(url.pathname) && !url.pathname.startsWith('/assets/') && !url.pathname.startsWith('/icons/')) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    try {
      const response = await fetch(request)
      if (response.ok && response.type === 'basic') {
        try {
          await cache.put(request, response.clone())
          const keys = await cache.keys()
          const extras = keys.filter(key => !STATIC.includes(new URL(key.url).pathname))
          if (extras.length > 40) await Promise.all(extras.slice(0, extras.length - 40).map(key => cache.delete(key)))
        } catch { /* Storage quota failures must not hide a successful network response. */ }
      }
      return response
    } catch {
      return await cache.match(request) || Response.error()
    }
  })())
})
