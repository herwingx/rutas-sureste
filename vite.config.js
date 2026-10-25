/**
 * @fileoverview Configuración de Vite 8 para Rutas Sureste.
 * Integra:
 * 1. `@vitejs/plugin-react` para Fast Refresh de React 19.
 * 2. `@tailwindcss/vite` para compilación directa de Tailwind CSS v4 (sin PostCSS).
 * 3. `rutasSuresteApiPlugin` para montar el backend (`server/api.js`) directamente
 *    en el servidor de desarrollo de Vite (`http://localhost:5173/api/*`).
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApiRequest } from './server/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Plugin local de Vite que intercepta las peticiones `/api/*` durante `pnpm dev`
 * y las delega al enrutador del backend en `server/api.js`.
 */
function rutasSuresteApiPlugin() {
  return {
    name: 'rutas-sureste-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/api/')) {
          const handled = await handleApiRequest(req, res);
          if (handled) return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), rutasSuresteApiPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
  },
});
