import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The previous config (generateSW, no skipWaiting/clientsClaim) shipped
      // a caching service worker that could get stuck serving an old app
      // shell after a deploy — the classic SW footgun, and it broke the app
      // for real on a phone that had visited before. selfDestroying ships a
      // SW whose only job is to unregister itself and clear every cache it
      // finds, which un-sticks any device currently stuck on the old one.
      // The web manifest (installability/home-screen icon) doesn't need an
      // active service worker at all, so this keeps that while dropping the
      // actual risky part (offline asset caching).
      selfDestroying: true,
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
    }),
  ],
})
