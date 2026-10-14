import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // `netlify dev` in the backend repo serves the functions on :8888.
  const functions = env.FUNCTIONS_DEV_URL || 'http://localhost:8888';

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'CPPHS FBLA Store',
          short_name: 'FBLA Store',
          description: 'Register, inventory, pre-auth purchasing and reports for the CPPHS FBLA school store.',
          theme_color: '#17295a',
          background_color: '#e6eaf0',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'fonts', expiration: { maxEntries: 30 } },
            },
            {
              urlPattern: ({ url }) => url.pathname.includes('/storage/v1/object/public/product-images/'),
              handler: 'CacheFirst',
              options: { cacheName: 'product-images', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 } },
            },
          ],
        },
      }),
    ],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: functions,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '/.netlify/functions'),
        },
      },
    },
  };
});
