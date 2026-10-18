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
        // woff2: fontes do KaTeX nas fórmulas das explicações (os navegadores atuais não pedem woff/ttf).
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        // O bundle principal (Three.js + R3F) passa de 1 MB.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // Imagens das missões (galeria das sondas): vêm do Wikimedia Commons (o Special:FilePath
        // redireciona as miniaturas para thumb.wikimedia.org) e ficam guardadas depois de vistas uma vez.
        // Respostas opacas (sem CORS): status 0.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(commons\.wikimedia\.org\/wiki\/Special:FilePath\/|(upload|thumb)\.wikimedia\.org\/)/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mission-images',
              // Cada foto vista conta duas vezes (miniatura e foto grande); ~200 fotos nas missões.
              expiration: { maxEntries: 240, maxAgeSeconds: 90 * 24 * 3600, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    // O three.js (~900 kB) e as tabelas das sondas (~1,3 MB, só no modo Sondas) são grandes por natureza.
    chunkSizeWarningLimit: 1400,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // As tabelas das sondas num pedaço próprio: baixam em paralelo com o código e continuam no
          // cache do service worker quando só o código muda.
          groups: [{ name: 'probe-data', test: /src[\\/]probes[\\/]data[\\/]/ }],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
