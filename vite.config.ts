/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Production-only Content-Security-Policy. Scripts may only come from our own origin, which
 * limits what an injected script could do with API keys stored on the device. `connect-src`
 * allows any HTTPS host because the learner can point the AI layer at a provider of their
 * choosing, plus localhost for Ollama / LM Studio.
 */
function contentSecurityPolicy(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  return {
    name: 'tingshuo-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      );
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    mode === 'https' ? basicSsl() : null,
    contentSecurityPolicy(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '听说 Tīngshuō — Mandarin',
        short_name: '听说',
        description: 'Your personal, adaptive Mandarin teacher.',
        theme_color: '#0f172a',
        background_color: '#0b0f19',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ].filter(Boolean),
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
}));
