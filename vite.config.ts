/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// `base: './'` keeps asset URLs relative so the build works under the
// GitHub Pages sub-path (https://<user>.github.io/relativistic-space-simulator/).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    // PWA: manifest + service worker (Workbox) que pré-carrega o app para uso offline.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Simulador Relativístico — Projeto Minda',
        short_name: 'Relativístico',
        description:
          'Viagem relativística em primeira pessoa até Proxima Centauri e além: aberração, Doppler, CMB e dilatação do tempo em tempo real.',
        lang: 'pt-BR',
        start_url: './',
        scope: './',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        background_color: '#000000',
        theme_color: '#000000',
        categories: ['education', 'science'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // O bundle principal (Three.js + R3F) passa de 1 MB.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
