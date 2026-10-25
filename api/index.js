/**
 * @fileoverview Entrada Serverless Function para Vercel (`/api/*`).
 * Conecta los endpoints de `server/api.js` directamente con la infraestructura
 * de Vercel Serverless Functions para despliegues en la nube.
 */

import { handleApiRequest } from '../server/api.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
    const handled = await handleApiRequest(req, res);
    if (!handled && !res.writableEnded) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: `Endpoint no encontrado: ${req.method} ${req.url}` }));
    }
  } catch (err) {
    console.error('[API Serverless Error]:', err);
    if (!res.writableEnded) {
      res.statusCode = err.status || 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: err.message || 'Error interno del servidor' }));
    }
  }
}
