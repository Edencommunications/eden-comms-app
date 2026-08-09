// Eden Communications — Service Worker
// Required for PWA installability on Android/Chrome.
// Network-first strategy: always try the network, fall back to cache.

const CACHE_NAME = 'eden-v1'
const PRECACHE = ['/', '/index.html', '/manifest.json']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  // Delete old caches from previous versions
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  // Only handle GET requests for same-origin or CDN assets
  if (e.request.method !== 'GET') return
  if (e.request.url.includes('/rest/v1/')) return   // never cache Supabase API calls

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache a copy of successful responses
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone))
        }
        return res
      })
      .catch(() => caches.match(e.request))
  )
})

// ── Phone push notifications ──────────────────────────────────
self.addEventListener('push', e => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch {}
  const title = data.title || '🔔 Notification'
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
  }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus() }
      return clients.openWindow(url)
    })
  )
})
