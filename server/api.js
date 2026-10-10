/**
 * @fileoverview Enrutador REST de Rutas Sureste (`/api/*`).
 * Implementado sobre `IncomingMessage` y `ServerResponse` nativos de Node.js para que
 * pueda ejecutarse tanto dentro del servidor de desarrollo de Vite (`vite.config.js`)
 * como en el servidor HTTP autónomo de producción (`server/index.js`).
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import * as cfg from './config.js';
import * as db from './db.js';
import * as dist from './distancias.js';
import { extraerCoordenadas } from './coords.js';

/**
 * Envía una respuesta JSON con encabezados anti-caché de navegador.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status - Código de estado HTTP.
 * @param {unknown} data - Cuerpo serializable a JSON.
 */
function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

/**
 * Lee y parsea el cuerpo JSON de una petición entrante (con límite de seguridad de 2 MB).
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<Record<string, any>>}
 */
function leerBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 2e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Lee el historial de rutas guardadas desde `data/historial-rutas.json`.
 * @returns {Array<Object>}
 */
function leerHistorial() {
  try {
    return JSON.parse(fs.readFileSync(cfg.HISTORIAL_FILE, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Persiste el arreglo de rutas históricas en `data/historial-rutas.json`.
 * @param {Array<Object>} h
 */
function guardarHistorial(h) {
  fs.mkdirSync(cfg.DATA_DIR, { recursive: true });
  fs.writeFileSync(cfg.HISTORIAL_FILE, JSON.stringify(h, null, 2));
}

const punto = (p) => ({ lat: Number(p.lat), lng: Number(p.lng) });
const puntoValido = (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));

/**
 * Construye un error con código de estado HTTP asociado.
 * @param {number} status
 * @param {string} message
 * @returns {Error & { status?: number }}
 */
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/**
 * Tabla declarativa de endpoints REST del sistema.
 */
const rutas = {
  /** Devuelve configuración pública para el mapa y estado de la caché */
  'GET /api/config': () => ({
    mapsKey: cfg.API_KEY,
    kmPorLitro: cfg.KM_POR_LITRO,
    precioLitro: cfg.PRECIO_LITRO,
    motor: dist.estadoMotor(),
  }),

  /** Devuelve el catálogo completo de tiendas */
  'GET /api/tiendas': () => db.cargar(),

  /** Registra una nueva tienda en el catálogo con respaldo previo */
  'POST /api/tiendas': async (body) => {
    const nombre = db.normalizarNombre(body.nombre);
    if (!nombre) throw httpError(400, 'Escribe el nombre de la tienda');
    const c = puntoValido(body) ? punto(body) : await extraerCoordenadas(body.texto || '');
    const tiendas = db.cargar();
    if (tiendas.some((t) => t.nombre === nombre)) {
      throw httpError(409, `Ya existe "${nombre}"`);
    }
    const estado = String(body.estado || '').trim();
    const nueva = {
      nombre,
      coords: db.formatCoords(c.lat, c.lng),
      ...(estado ? { estado } : {}),
      ...(body.verificada
        ? { verificada: true, fechaVerificacion: new Date().toISOString().slice(0, 10) }
        : {}),
    };
    return db.guardar([...tiendas, nueva]);
  },

  /** Actualiza coordenadas, nombre, estado o verificación de una tienda existente */
  'PATCH /api/tiendas': async (body) => {
    const original = db.normalizarNombre(body.nombreOriginal || body.nombre);
    const tiendas = db.cargar();
    const idx = tiendas.findIndex((t) => t.nombre === original);
    if (idx === -1) throw httpError(404, `No se encontró "${original}"`);
    const actual = { ...tiendas[idx] };

    if (body.nombre) {
      const nuevo = db.normalizarNombre(body.nombre);
      if (nuevo !== original && tiendas.some((t, i) => i !== idx && t.nombre === nuevo)) {
        throw httpError(409, `Ya existe otra tienda llamada "${nuevo}"`);
      }
      actual.nombre = nuevo;
    }

    if (body.lat !== undefined || body.texto) {
      const prev = db.parseCoords(actual.coords);
      const c = puntoValido(body) ? punto(body) : await extraerCoordenadas(body.texto);
      const movio = Math.abs(prev.lat - c.lat) > 1e-5 || Math.abs(prev.lng - c.lng) > 1e-5;
      if (movio && !actual.coordsAnteriores) actual.coordsAnteriores = actual.coords;
      actual.coords = db.formatCoords(c.lat, c.lng);
      // Si el pin se desplazó físicamente, invalidar en caché solo los tramos que tocaban ese punto
      if (movio) dist.invalidarPunto(prev);
    }

    if (body.estado !== undefined) {
      const est = String(body.estado || '').trim();
      if (est) actual.estado = est;
      else delete actual.estado;
    }

    if (typeof body.verificada === 'boolean') {
      actual.verificada = body.verificada;
      if (body.verificada) {
        actual.fechaVerificacion = new Date().toISOString().slice(0, 10);
      } else {
        delete actual.fechaVerificacion;
      }
    }

    tiendas[idx] = actual;
    return db.guardar(tiendas);
  },

  /** Elimina una tienda del catálogo activo (conservando copia en `data/backups/`) */
  'DELETE /api/tiendas': (body) => {
    const nombre = db.normalizarNombre(body.nombre);
    const tiendas = db.cargar();
    const filtradas = tiendas.filter((t) => t.nombre !== nombre);
    if (filtradas.length === tiendas.length) throw httpError(404, `No se encontró "${nombre}"`);
    return db.guardar(filtradas);
  },

  /** Calcula los tramos carreteros consecutivos de una ruta */
  'POST /api/ruta': async (body) => {
    if (!Array.isArray(body.puntos) || body.puntos.length < 2) {
      throw httpError(400, 'Se necesitan al menos 2 puntos');
    }
    const puntos = body.puntos.map((p, i) => {
      if (!puntoValido(p)) throw httpError(400, `Punto inválido en posición ${i + 1}`);
      return punto(p);
    });
    const tramos = await dist.calcularRuta(puntos);
    return { tramos, motor: dist.estadoMotor() };
  },

  /** Optimiza localmente el orden de visita de las paradas intermedias (Vecino más cercano + 2-Opt) */
  'POST /api/optimizar': async (body) => {
    const paradas = (body.paradas || []).map(punto);
    const origen = puntoValido(body.origen) ? punto(body.origen) : null;
    const destino = puntoValido(body.destino) ? punto(body.destino) : null;
    return dist.optimizar(origen, destino, paradas);
  },

  /** Extrae coordenadas desde texto libre o resuelve enlaces cortos de Google Maps */
  'POST /api/coords': async (body) => {
    if (!body.texto) throw httpError(400, 'Pega un enlace o coordenadas');
    return extraerCoordenadas(body.texto);
  },

  /** Devuelve el historial de rutas guardadas */
  'GET /api/historial': () => leerHistorial(),

  /** Guarda o actualiza una ruta en el historial ordenando por fecha descendente */
  'POST /api/historial': (body) => {
    const h = leerHistorial();
    const item = {
      id: body.id || crypto.randomUUID(),
      fecha: body.fecha || new Date().toISOString().slice(0, 10),
      nombre: String(body.nombre || '').trim(),
      paradas: body.paradas || [],
      baseInicio: Boolean(body.baseInicio),
      baseFin: Boolean(body.baseFin),
      totalKm: Number(body.totalKm || 0),
      costo: Number(body.costo || 0),
      guardadoEn: new Date().toISOString(),
    };
    const idx = h.findIndex((x) => x.id === item.id);
    if (idx >= 0) h[idx] = item;
    else h.unshift(item);
    h.sort((a, b) => b.fecha.localeCompare(a.fecha));
    guardarHistorial(h);
    return item;
  },

  /** Elimina un registro del historial de rutas */
  'DELETE /api/historial': (body) => {
    const h = leerHistorial().filter((x) => x.id !== body.id);
    guardarHistorial(h);
    return h;
  },
};

/**
 * Manejador principal de peticiones `/api/*`.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {Promise<boolean>} `true` si la ruta pertenecía a `/api/*` y fue atendida.
 */
export async function handleApiRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const clave = `${req.method} ${url.pathname}`;
  if (!rutas[clave]) {
    if (url.pathname.startsWith('/api/')) {
      json(res, 404, { error: `Ruta no existente: ${clave}` });
      return true;
    }
    return false;
  }

  try {
    const body = ['POST', 'PATCH', 'DELETE'].includes(req.method) ? await leerBody(req) : {};
    const out = await rutas[clave](body);
    json(res, 200, out);
  } catch (e) {
    json(res, e.status || 400, { error: e.message || 'Error procesando solicitud' });
  }
  return true;
}
