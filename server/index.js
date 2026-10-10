#!/usr/bin/env node
/**
 * @fileoverview Servidor HTTP ligero de producción para Rutas Sureste (`pnpm start`).
 * Sirve tanto el bundle estático compilado por Vite en `dist/` como los endpoints
 * REST de `/api/*` manejados por `server/api.js`.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';

import * as cfg from './config.js';
import { handleApiRequest } from './api.js';

/** Carpeta donde `vite build` deposita los activos de producción */
const PUBLIC = path.join(cfg.ROOT, 'dist');

/** Mapa de tipos MIME para servir activos estáticos sin dependencias externas */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  // 1. Delegar cualquier petición `/api/*` al enrutador REST
  if (await handleApiRequest(req, res)) return;

  // 2. Servir archivos estáticos del frontend (`dist/`) para peticiones GET
  if (req.method !== 'GET') {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'No encontrado' }));
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const rel =
    url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC, rel));

  // Prevención de Path Traversal fuera de `dist/`
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('No encontrado');
    return;
  }

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(cfg.PORT, cfg.HOST, () => {
  const url = `http://localhost:${cfg.PORT}`;
  console.log(`\n  Rutas Sureste disponible en ${url}\n`);
  if (!cfg.API_KEY) console.log('  Falta GOOGLE_MAPS_API_KEY en .env (copia .env.example)\n');
  if (!process.argv.includes('--no-open')) {
    const cmd =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
          ? 'start ""'
          : 'xdg-open';
    exec(`${cmd} ${url}`, () => {});
  }
});
