// Push notification handler injected into the service worker by next-pwa

self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'UGs Kitchen', {
      body:  data.body  ?? '',
      icon:  '/icon-192.png',
      badge: '/icon-192.png',
      tag:   data.tag  ?? 'ugs-notification',
      data:  { url: data.url ?? '/' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url === url)
      if (existing) return existing.focus()
      return clients.openWindow(url)
    })
  )
})
