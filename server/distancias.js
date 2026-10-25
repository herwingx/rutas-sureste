import fs from 'node:fs';
import path from 'node:path';
import { API_KEY, CACHE_DIR, SUPABASE_URL, SUPABASE_KEY, SUPABASE_SCHEMA } from './config.js';
import { haversineKm } from './coords.js';

const CACHE_FILE = path.join(CACHE_DIR, 'distancias.json');
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días (máximo permitido por ToS de Google Maps)
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const FACTOR_CARRETERA = 1.35;

let cache = {};
try {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
} catch {
  cache = {};
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Accept-Profile': SUPABASE_SCHEMA,
    'Content-Profile': SUPABASE_SCHEMA,
    ...extra,
  };
}

async function consultarCacheCentral(key) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/cache_distancias?clave=eq.${encodeURIComponent(key)}&select=*`,
      { headers: supabaseHeaders() }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length ? data[0] : null;
  } catch {
    return null;
  }
}

async function guardarEnCacheCentral(key, r) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/cache_distancias?on_conflict=clave`, {
      method: 'POST',
      headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({
        clave: key,
        metros: r.metros || 0,
        segundos: r.segundos || 0,
        polyline: r.polyline || null,
        fuente: r.fuente || 'routes',
      }),
    });
  } catch (err) {
    console.warn('[Cache Central Sync]:', err.message);
  }
}

// Mapa de promesas en vuelo para evitar peticiones duplicadas simultáneas al mismo tramo
const enVuelo = new Map();
let guardadoPendiente = null;

function persistirCache() {
  clearTimeout(guardadoPendiente);
  guardadoPendiente = setTimeout(() => {
    try {
      const ahora = Date.now();
      for (const k of Object.keys(cache)) {
        if (ahora - cache[k].ts > CACHE_TTL_MS) delete cache[k];
      }
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      const tmp = CACHE_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(cache));
      fs.renameSync(tmp, CACHE_FILE);
    } catch {
      // Ignorar en entornos de solo lectura (como Vercel Serverless) ya que Supabase respalda todo
    }
  }, 250);
}

const k6 = (p) => `${Number(p.lat).toFixed(6)},${Number(p.lng).toFixed(6)}`;
const claveTramo = (a, b) => `${k6(a)}>${k6(b)}`;

export function invalidarPunto(p) {
  const k = k6(p);
  let n = 0;
  for (const key of Object.keys(cache)) {
    if (key.startsWith(k + '>') || key.endsWith('>' + k)) {
      delete cache[key];
      n++;
    }
  }
  if (n) persistirCache();
  return n;
}

const motor = { routes: true, ultimoError: null };

const latLng = (p) => ({
  location: { latLng: { latitude: Number(p.lat), longitude: Number(p.lng) } },
});

/**
 * Llama a Google Routes API v2 únicamente con campos del nivel "Essentials"
 * (TRAFFIC_UNAWARE + distanceMeters, duration, encodedPolyline) para mantenerse
 * siempre dentro del Free Tier más amplio (10,000 llamadas gratuitas/mes).
 */
async function tramoRoutes(a, b) {
  if (!API_KEY) throw new Error('Falta GOOGLE_MAPS_API_KEY en el archivo .env');
  const res = await fetch(ROUTES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      'X-Goog-Maps-Solution-ID': 'gmp_git_agentskills_v1',
    },
    body: JSON.stringify({
      origin: latLng(a),
      destination: latLng(b),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      languageCode: 'es-MX',
      units: 'METRIC',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Routes API HTTP ${res.status}`);
    motor.ultimoError = err.message;
    throw err;
  }
  const r = data.routes?.[0];
  if (!r) throw new Error('Routes API: sin ruta entre esos puntos');
  motor.routes = true;
  motor.ultimoError = null;
  return {
    metros: r.distanceMeters || 0,
    segundos: parseInt(r.duration || '0', 10),
    polyline: r.polyline?.encodedPolyline || null,
    fuente: 'routes',
  };
}

function estimado(a, b) {
  const metros = Math.round(haversineKm(a, b) * FACTOR_CARRETERA * 1000);
  return {
    metros,
    segundos: Math.round((metros / 1000 / 50) * 3600),
    polyline: null,
    fuente: 'estimado',
  };
}

export async function tramo(a, b) {
  if (k6(a) === k6(b)) {
    return { metros: 0, segundos: 0, km: 0, polyline: null, fuente: 'cache', cache: true };
  }
  const key = claveTramo(a, b);
  const hit = cache[key];
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return { ...hit, km: Math.ceil(hit.metros / 1000), cache: true };
  }

  // 1. Consultar en la base de datos central compartida por todos los ingenieros
  const centralHit = await consultarCacheCentral(key);
  if (centralHit) {
    cache[key] = { ...centralHit, ts: Date.now() };
    return { ...centralHit, km: Math.ceil(centralHit.metros / 1000), cache: true };
  }

  // Si este mismo tramo ya se está consultando en este instante, reutilizar la promesa en vuelo
  if (enVuelo.has(key)) {
    return enVuelo.get(key);
  }

  const promesa = (async () => {
    try {
      const r = await tramoRoutes(a, b);
      cache[key] = { ...r, ts: Date.now() };
      persistirCache();
      guardarEnCacheCentral(key, r).catch(() => {});
      return { ...r, km: Math.ceil(r.metros / 1000), cache: false };
    } catch (e) {
      const r = estimado(a, b);
      return { ...r, km: Math.ceil(r.metros / 1000), cache: false, error: e.message };
    } finally {
      enVuelo.delete(key);
    }
  })();

  enVuelo.set(key, promesa);
  return promesa;
}

export async function calcularRuta(puntos, concurrencia = 6) {
  const pares = [];
  for (let i = 0; i < puntos.length - 1; i++) pares.push([puntos[i], puntos[i + 1]]);

  // Pre-carga por lote desde la base de datos central para todos los tramos faltantes en memoria
  const clavesBuscar = [];
  for (const [a, b] of pares) {
    if (k6(a) === k6(b)) continue;
    const k = claveTramo(a, b);
    if (!cache[k] || Date.now() - cache[k].ts >= CACHE_TTL_MS) {
      clavesBuscar.push(k);
    }
  }

  if (clavesBuscar.length > 0 && SUPABASE_URL && SUPABASE_KEY) {
    try {
      const inList = clavesBuscar.map((k) => `"${k}"`).join(',');
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/cache_distancias?clave=in.(${encodeURIComponent(inList)})&select=*`,
        { headers: supabaseHeaders() }
      );
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows)) {
          for (const row of rows) {
            cache[row.clave] = { ...row, ts: Date.now() };
          }
        }
      }
    } catch {}
  }

  const out = new Array(pares.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrencia, pares.length) }, async () => {
      while (idx < pares.length) {
        const i = idx++;
        out[i] = await tramo(pares[i][0], pares[i][1]);
      }
    })
  );
  return out;
}

/**
 * Optimización local 100% gratuita (Vecino más cercano + refinamiento 2-Opt)
 * aprovechando las distancias reales ya guardadas en caché y Haversine carretero,
 * sin activar el SKU de pago "Compute Routes Pro" (optimizeWaypointOrder).
 */
export async function optimizar(origen, destino, paradas) {
  const n = paradas.length;
  if (n < 2) return { orden: paradas.map((_, i) => i), fuente: 'local' };

  const d = (p, q) => {
    const hit = cache[claveTramo(p, q)] || cache[claveTramo(q, p)];
    return hit ? hit.metros / 1000 : haversineKm(p, q) * FACTOR_CARRETERA;
  };

  const pendientes = new Set(paradas.map((_, i) => i));
  const orden = [];
  let actual = origen || paradas[0];
  if (!origen) {
    orden.push(0);
    pendientes.delete(0);
  }

  while (pendientes.size) {
    let mejor = null;
    let md = Infinity;
    for (const i of pendientes) {
      const x = d(actual, paradas[i]);
      if (x < md) {
        md = x;
        mejor = i;
      }
    }
    orden.push(mejor);
    pendientes.delete(mejor);
    actual = paradas[mejor];
  }

  const costo = (o) => {
    let c = 0;
    let prev = origen;
    for (const i of o) {
      if (prev) c += d(prev, paradas[i]);
      prev = paradas[i];
    }
    if (destino) c += d(prev, destino);
    return c;
  };

  let mejora = true;
  let mejorCosto = costo(orden);
  while (mejora) {
    mejora = false;
    for (let i = origen ? 0 : 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const cand = [
          ...orden.slice(0, i),
          ...orden.slice(i, j + 1).reverse(),
          ...orden.slice(j + 1),
        ];
        const c = costo(cand);
        if (c < mejorCosto - 1e-9) {
          orden.splice(0, n, ...cand);
          mejorCosto = c;
          mejora = true;
        }
      }
    }
  }

  return { orden, fuente: 'local' };
}

export function estadoMotor() {
  return {
    apiKey: Boolean(API_KEY),
    routes: motor.routes,
    motor: 'routes',
    ultimoError: motor.ultimoError,
    tramosEnCache: Object.keys(cache).length,
  };
}
