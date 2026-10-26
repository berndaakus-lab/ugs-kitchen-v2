// UGs POS service worker — makes the app installable and shows a friendly
// page when the connection drops. It deliberately caches NOTHING else:
// menus, sales, shifts and prices must always come live from the server,
// so a cashier can never sell from stale data.
const VERSION = 'ugs-pos-v1'
const OFFLINE_URL = '/offline.html'
const SHELL = [OFFLINE_URL, '/icon-192.png', '/icon-512.png']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Only page loads are handled: try the network, show the offline page if it
// fails. API calls, scripts and everything else go straight to the network.
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL))
  )
})
