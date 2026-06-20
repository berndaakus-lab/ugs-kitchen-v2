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

        {/* iOS splash screens — covers common iPhone sizes */}
        <link rel="apple-touch-startup-image" href="/splash-2048.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)" />
        <link rel="apple-touch-startup-image" href="/splash-1668.png" media="(device-width: 834px)  and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)" />
        <link rel="apple-touch-startup-image" href="/splash-1170.png" media="(device-width: 390px)  and (device-height: 844px)  and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash-1080.png" media="(device-width: 360px)  and (device-height: 780px)  and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash-750.png"  media="(device-width: 375px)  and (device-height: 667px)  and (-webkit-device-pixel-ratio: 2)" />

        {/* Windows tile */}
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
