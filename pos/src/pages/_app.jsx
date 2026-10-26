import { useEffect } from 'react'
import Head from 'next/head'
import ErrorBoundary from '@/components/ErrorBoundary'
import '@/styles/globals.css'

export default function App({ Component, pageProps }) {
  // Register the service worker (installable app + offline page). Skipped in
  // development so it never serves a stale page while coding.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('[pos] service worker', err))
  }, [])

  return (
    <>
      <Head>
        <title>UGs Kitchen POS</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="icon" href="/icon-192.png" />
      </Head>
      <ErrorBoundary>
        <Component {...pageProps} />
      </ErrorBoundary>
    </>
  )
}
