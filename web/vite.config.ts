import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'PharmaStackX Terminal',
        short_name: 'PharmaStackX',
        description: 'PharmaStackX Pro Terminal — POS, EMR, dispensary, orders and leads for pharmacies.',
        theme_color: '#050505',
        background_color: '#050505',
        display: 'standalone',
        start_url: '/',
        // Generated from Synkk/public/icon.png (the desktop app's own icon) via sharp
        // — see the maskable-icon note on icon-maskable-512.png's composition.
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Iframe'd sub-apps (pos.psx.ng, emr.psx.ng, www.psx.ng) manage their own
        // caching/offline behaviour — this shell only precaches its own shell assets.
        navigateFallbackDenylist: [/^\/dashboard\//],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    // Allows browsing via http://dev.psx.ng:5174 (mapped to 127.0.0.1 in the hosts
    // file) so the SSO cookie — scoped to domain=.psx.ng — actually sets during
    // local dev. It's silently dropped by the browser when served from localhost,
    // since localhost isn't a subdomain of psx.ng.
    host: true,
    allowedHosts: ['dev.psx.ng'],
  },
});
