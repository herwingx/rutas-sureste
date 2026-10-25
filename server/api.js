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
    supabase: db.supabaseActivo(),
    motor: dist.estadoMotor(),
  }),

  /** Devuelve el catálogo completo de tiendas */
  'GET /api/tiendas': () => db.cargar(),

  /** Devuelve la lista de perfiles de ingenieros */
  'GET /api/ingenieros': () => db.cargarIngenieros(),

  /** Actualiza o crea un perfil de ingeniero y lo sincroniza con Supabase */
  'PATCH /api/ingenieros': async (body) => {
    const nombre = db.normalizarNombre(body.nombre);
    if (!nombre) throw httpError(400, 'Se requiere el nombre del ingeniero');
    const lista = db.cargarIngenieros();
    const idx = lista.findIndex((i) => db.normalizarNombre(i.nombre) === nombre);
    const prev = idx >= 0 ? lista[idx] : { nombre };
    const actualizado = {
      ...prev,
      nombre,
      puesto: String(body.puesto ?? prev.puesto ?? 'INGENIERO DE SOPORTE TECNICO')
        .trim()
        .toUpperCase(),
      no_empleado: String(body.no_empleado ?? prev.no_empleado ?? '').trim(),
      tarjeta_gasolina: String(body.tarjeta_gasolina ?? prev.tarjeta_gasolina ?? '').trim(),
      automovil: String(body.automovil ?? prev.automovil ?? '')
        .trim()
        .toUpperCase(),
      placas: String(body.placas ?? prev.placas ?? '')
        .trim()
        .toUpperCase(),
      serie: String(body.serie ?? prev.serie ?? '')
        .trim()
        .toUpperCase(),
      ceco: String(body.ceco ?? prev.ceco ?? '108266').trim(),
      region: String(body.region ?? prev.region ?? 'TUXTLA')
        .trim()
        .toUpperCase(),
      rendimiento: Number(body.rendimiento ?? prev.rendimiento ?? 12.5) || 12.5,
      costo_litro: Number(body.costo_litro ?? prev.costo_litro ?? 23.99) || 23.99,
      base_nombre: String(body.base_nombre ?? prev.base_nombre ?? 'RESGUARDO TUXTLA').trim(),
      domicilio_direccion: String(
        body.domicilio_direccion ?? prev.domicilio_direccion ?? ''
      ).trim(),
      domicilio_link: String(body.domicilio_link ?? prev.domicilio_link ?? '').trim(),
      km_inicial_ultimo: Number(body.km_inicial_ultimo ?? prev.km_inicial_ultimo ?? 0) || 0,
    };

    if (idx >= 0) lista[idx] = actualizado;
    else lista.push(actualizado);

    const guardados = db.guardarIngenieros(lista);
    db.syncIngenieroUpsert(actualizado);
    return guardados;
  },

  /** Registra una nueva tienda en el catálogo con respaldo previo y sync a Supabase */
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
      eco: String(body.eco || '').trim() || '0',
      ceco: String(body.ceco || '').trim() || '0',
      nombre,
      coords: db.formatCoords(c.lat, c.lng),
      ...(estado ? { estado } : {}),
      ...(body.region ? { region: String(body.region).trim() } : {}),
      ...(body.empresa ? { empresa: String(body.empresa).trim() } : {}),
      ...(body.zona ? { zona: String(body.zona).trim() } : {}),
      ...(body.ingeniero ? { ingeniero: String(body.ingeniero).trim() } : {}),
      ...(body.verificada
        ? { verificada: true, fechaVerificacion: new Date().toISOString().slice(0, 10) }
        : {}),
    };
    const res = db.guardar([...tiendas, nueva]);
    db.syncTiendaUpsert(nueva);
    return res;
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

    if (body.eco !== undefined) actual.eco = String(body.eco).trim();
    if (body.ceco !== undefined) actual.ceco = String(body.ceco).trim();
    if (body.region !== undefined) actual.region = String(body.region).trim();
    if (body.empresa !== undefined) actual.empresa = String(body.empresa).trim();
    if (body.zona !== undefined) actual.zona = String(body.zona).trim();
    if (body.ingeniero !== undefined) actual.ingeniero = String(body.ingeniero).trim();

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
    const res = db.guardar(tiendas);
    db.syncTiendaUpsert(actual, original);
    return res;
  },

  /** Elimina una tienda del catálogo activo (conservando copia en `data/backups/`) */
  'DELETE /api/tiendas': (body) => {
    const nombre = db.normalizarNombre(body.nombre);
    const tiendas = db.cargar();
    const filtradas = tiendas.filter((t) => t.nombre !== nombre);
    if (filtradas.length === tiendas.length) throw httpError(404, `No se encontró "${nombre}"`);
    const res = db.guardar(filtradas);
    db.syncTiendaDelete(nombre);
    return res;
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

  /** Devuelve la lista de bitácoras semanales guardadas */
  'GET /api/bitacoras': () => db.cargarBitacoras(),

  /** Guarda o actualiza una bitácora semanal (anticipo/comprobación) localmente y en Supabase */
  'POST /api/bitacoras': async (body) => {
    const ingeniero = String(body.ingeniero || '').trim();
    const semana = Number(body.semana);
    const anio = Number(body.anio) || new Date().getFullYear();
    if (!ingeniero || !semana) {
      throw httpError(400, 'Se requiere ingeniero y número de semana');
    }

    const bitacoras = db.cargarBitacoras();
    const item = {
      id: body.id || `${ingeniero}-${anio}-W${semana}`,
      ingeniero,
      semana,
      anio,
      tipo: body.tipo || 'ambas',
      km_inicial: Number(body.km_inicial || 0),
      rendimiento: Number(body.rendimiento || 12.5),
      costo_litro: Number(body.costo_litro || 23.99),
      dispersion: Number(body.dispersion || 0),
      complementos: Number(body.complementos || 0),
      observaciones_anticipo: String(body.observaciones_anticipo || '').trim(),
      observaciones_comprobacion: String(body.observaciones_comprobacion || '').trim(),
      dias_anticipo: body.dias_anticipo || [],
      dias_comprobacion: body.dias_comprobacion || [],
      puntos_nuevos: body.puntos_nuevos || [],
      total_km: Number(body.total_km || 0),
      total_importe: Number(body.total_importe || 0),
      actualizado_en: new Date().toISOString(),
    };

    const idx = bitacoras.findIndex(
      (b) => b.ingeniero === ingeniero && b.semana === semana && b.anio === anio
    );
    if (idx >= 0) bitacoras[idx] = item;
    else bitacoras.unshift(item);

    bitacoras.sort((a, b) => b.anio - a.anio || b.semana - a.semana);
    db.guardarBitacoras(bitacoras);
    db.syncBitacoraUpsert(item);
    return item;
  },

  /** Elimina una bitácora semanal guardada */
  'DELETE /api/bitacoras': (body) => {
    const ingeniero = String(body.ingeniero || '').trim();
    const semana = Number(body.semana);
    const anio = Number(body.anio) || new Date().getFullYear();
    const bitacoras = db
      .cargarBitacoras()
      .filter(
        (b) => !(b.ingeniero === ingeniero && b.semana === semana && b.anio === anio)
      );
    db.guardarBitacoras(bitacoras);
    db.syncBitacoraDelete(ingeniero, semana, anio);
    return bitacoras;
  },

  /** Guarda o actualiza una ruta en el historial ordenando por fecha descendente */
  'POST /api/historial': (body) => {
    const h = leerHistorial();
    const item = {
      id: body.id || crypto.randomUUID(),
      fecha: body.fecha || new Date().toISOString().slice(0, 10),
      nombre: String(body.nombre || '').trim(),
      ingeniero: String(body.ingeniero || '').trim(),
      baseNombre: String(body.baseNombre || '').trim(),
      paradas: body.paradas || [],
      tramos: body.tramos || [],
      baseInicio: Boolean(body.baseInicio),
      baseFin: Boolean(body.baseFin),
      totalKm: Number(body.totalKm || 0),
      litros: Number(body.litros || 0),
      segundos: Number(body.segundos || 0),
      costo: Number(body.costo || 0),
      guardadoEn: new Date().toISOString(),
    };
    const idx = h.findIndex((x) => x.id === item.id);
    if (idx >= 0) h[idx] = item;
    else h.unshift(item);
    h.sort((a, b) => b.fecha.localeCompare(a.fecha));
    guardarHistorial(h);
    db.syncHistorialUpsert(item);
    return item;
  },

  /** Elimina un registro del historial de rutas */
  'DELETE /api/historial': (body) => {
    const h = leerHistorial().filter((x) => x.id !== body.id);
    guardarHistorial(h);
    if (body.id) db.syncHistorialDelete(body.id);
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
