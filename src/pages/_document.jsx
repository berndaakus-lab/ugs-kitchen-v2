import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* PWA manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Theme colour — browser chrome on Android */}
        <meta name="theme-color" content="#E85D04" />

        {/* iOS / Safari "Add to Home Screen" support */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="UGs Kitchen" />
        <link rel="apple-touch-icon" href="/icon-192.png" />

        {/* Splash screen colour on iOS */}
        <meta name="msapplication-TileColor" content="#E85D04" />
        <meta name="msapplication-TileImage" content="/icon-192.png" />

        {/* Favicon fallback */}
        <link rel="icon" href="/icon-192.png" type="image/png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
