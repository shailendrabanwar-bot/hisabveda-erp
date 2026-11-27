import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      {
        name: 'disable-vite-hmr-websocket',
        apply: 'serve',
        enforce: 'pre',
        transform(code, id) {
          if (id.includes('vite/dist/client/client.mjs') || id.endsWith('/@vite/client')) {
            return code
              .replaceAll('await wsTransport.connect(handlers);', 'return;')
              .replaceAll('await wsTransport.disconnect();', 'return;')
              .replaceAll('wsTransport.send(data);', '/* HMR WS disabled */');
          }
        },
      },
      {
        name: 'electron-safe-html',
        apply: 'build',
        transformIndexHtml(html) {
          return html
            .replace(/\scrossorigin(?:="[^"]*")?/gi, '');
        },
      },
      react(), 
      tailwindcss(),
      VitePWA({
        injectRegister: null,
        registerType: 'autoUpdate',
        includeAssets: [
          'hv-icon.ico',
          'hv-apple-touch-180.png',
          'hv-app-192.png',
          'hv-app-512.png',
          'hv-app-maskable-512.png',
          'assets/aistudio/HISAB_VEDA_ERP_accounting_logo_58b6a0fc.png',
        ],
        manifest: {
          id: './',
          name: 'Hisabveda ERP Software',
          short_name: 'Hisabveda',
          description: 'Hisabveda ERP - Indian GST billing, inventory management, e-Way bills, banking and accounts.',
          theme_color: '#0f172a',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'any',
          start_url: './',
          scope: './',
          icons: [
            {
              src: './hv-app-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './hv-app-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './hv-app-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,html,ico,png,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
          navigateFallbackDenylist: [/^\/api\//],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    build: {
      chunkSizeWarningLimit: 2500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'vendor-react';
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('pdfjs-dist')) return 'vendor-pdfjs';
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf-export';
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
            if (id.includes('lucide-react') || id.includes('motion')) return 'vendor-ui';
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: false,
      ws: false,
      watch: null,
    },
  };
});
