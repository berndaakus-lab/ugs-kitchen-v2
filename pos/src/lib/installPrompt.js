// Chrome offers "install this app" once, early in the page's life, so this is
// imported from _app to catch the offer before the login page has loaded.
let offer = null
let installed = false
const subscribers = new Set()
const notify = () => subscribers.forEach(fn => fn())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()   // we show our own Install button
    offer = e
    notify()
  })
  window.addEventListener('appinstalled', () => {
    offer = null
    installed = true
    notify()
  })
}

export const getInstallState = () => ({ canInstall: !!offer, installed })

export function subscribeInstall(fn) {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

// Opens the browser's install dialog. Returns 'accepted', 'dismissed' or null.
export async function promptInstall() {
  if (!offer) return null
  const current = offer
  await current.prompt()
  const { outcome } = await current.userChoice
  offer = null
  notify()
  return outcome
}

export function isRunningAsApp() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

// Which install instructions this device needs.
export function detectBrowser(ua) {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (!/Android/i.test(ua)) return 'desktop'
  if (/; wv\)|FBAN|FBAV|Instagram|WhatsApp|Line\//i.test(ua)) return 'in-app'
  if (/MiuiBrowser|XiaoMi\//i.test(ua)) return 'mi-browser'
  if (/Chrome\//i.test(ua) && !/EdgA|OPR|OPT\/|SamsungBrowser|Firefox|UCBrowser|HeyTapBrowser|VivoBrowser/i.test(ua)) return 'chrome'
  return 'other'
}
