import { useEffect, useState } from 'react'
import { CheckCircle2, Download, X } from 'lucide-react'
import { detectBrowser, getInstallState, isRunningAsApp, promptInstall, subscribeInstall } from '@/lib/installPrompt'

const HIDDEN_KEY = 'ugs-pos-install-hidden'

function readHidden() {
  try { return localStorage.getItem(HIDDEN_KEY) === '1' } catch { return false }
}
function writeHidden(hidden) {
  try {
    if (hidden) localStorage.setItem(HIDDEN_KEY, '1')
    else localStorage.removeItem(HIDDEN_KEY)
  } catch { /* private window: it just shows again next time */ }
}

function Card({ title, onHide, children }) {
  return (
    <section aria-label="Install the POS app" className="rounded-2xl bg-white p-4 text-sm text-gray-700 shadow">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-brand-dark">
          <Download size={16} className="text-brand-orange" /> {title}
        </h2>
        <button type="button" onClick={onHide} aria-label="Hide install help" className="p-1 text-gray-400">
          <X size={16} />
        </button>
      </div>
      {children}
    </section>
  )
}

export default function InstallApp() {
  const [browser, setBrowser] = useState(null)   // null until mounted, or when already the app
  const [state, setState] = useState({ canInstall: false, installed: false })
  const [waited, setWaited] = useState(false)    // give Chrome a moment to offer install
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isRunningAsApp()) return
    setBrowser(detectBrowser(navigator.userAgent))
    setHidden(readHidden())
    setState(getInstallState())
    const unsubscribe = subscribeInstall(() => setState(getInstallState()))
    const timer = setTimeout(() => setWaited(true), 2500)
    return () => { unsubscribe(); clearTimeout(timer) }
  }, [])

  if (!browser) return null

  const hide = () => { writeHidden(true); setHidden(true) }
  const show = () => { writeHidden(false); setHidden(false) }

  if (state.installed) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-2xl bg-white p-4 text-sm font-semibold text-green-700 shadow">
        <CheckCircle2 size={18} /> Installed. Open UGs POS from your home screen.
      </p>
    )
  }

  if (browser === 'desktop' && !state.canInstall) return null

  if (hidden) {
    return (
      <button type="button" onClick={show} className="mx-auto block text-xs font-semibold text-gray-400 underline">
        Install the app
      </button>
    )
  }

  if (state.canInstall) {
    return (
      <Card title="Install UGs POS" onHide={hide}>
        <p className="mb-3">Add the POS to this device so it opens like an app.</p>
        <button
          type="button"
          disabled={busy}
          className="btn-primary w-full"
          onClick={async () => {
            setBusy(true)
            try { await promptInstall() } finally { setBusy(false) }
          }}
        >
          {busy ? 'Waiting…' : 'Install app'}
        </button>
      </Card>
    )
  }

  if (browser === 'ios') {
    return (
      <Card title="Install UGs POS" onHide={hide}>
        <p>In Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>.</p>
      </Card>
    )
  }

  if (browser !== 'chrome') {
    const chromeLink = `intent://${window.location.host}${window.location.pathname}#Intent;scheme=https;package=com.android.chrome;end`
    return (
      <Card title="Open in Chrome to install" onHide={hide}>
        <p className="mb-3">This browser can't install the POS. Open this page in Chrome instead.</p>
        <a href={chromeLink} className="btn-primary block w-full text-center">Open in Chrome</a>
        <p className="mt-2 text-xs text-gray-500">
          If that doesn't work, open Chrome and go to <b>{window.location.host}</b>.
        </p>
      </Card>
    )
  }

  if (!waited) return null

  return (
    <Card title="Install UGs POS" onHide={hide}>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Tap <b>⋮</b> at the top right of Chrome.</li>
        <li>If you see <b>Open in Chrome</b>, tap it, then tap <b>⋮</b> again.</li>
        <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
      </ol>
      <p className="mt-2 text-xs text-gray-500">
        Redmi or Xiaomi with no icon afterwards? Go to Settings → Apps → Manage apps → Chrome → Other permissions, and allow <b>Home screen shortcuts</b>.
      </p>
    </Card>
  )
}
