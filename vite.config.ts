import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon-dark.svg', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'On The Apex',
        short_name: 'On The Apex',
        description: 'Endurance racing data',
        theme_color: '#0b0b0b',
        background_color: '#fcfcfb',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache only the app shell (JS/CSS/HTML/icons) — never the API.
        // Live timing/results data must always come from the network; a
        // cached lap list would silently go stale. Fall back to a cached
        // copy only when actually offline, and re-check on every request
        // otherwise (NetworkFirst), so cached data never masks a fresh
        // response the network could have served.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://ontheapex-api.fly.dev',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
