import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Installable app (PWA): manifest + public/sw.js, registered in _app */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#151212" />
        <meta name="application-name" content="UGs POS" />

        {/* iOS "Add to Home Screen" */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="UGs POS" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
