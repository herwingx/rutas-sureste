/**
 * @fileoverview Capa de acceso, persistencia atómica y sincronización en tiempo real con Supabase
 * para el catálogo de tiendas (`data/tiendas.json`) y perfiles de ingenieros (`data/ingenieros.json`).
 * Garantiza que cada modificación cree primero un respaldo automático en `data/backups/`
 * (conservando hasta 40 versiones recientes), escriba mediante archivo temporal (`.tmp` + `renameSync`)
 * y propague el cambio asíncronamente al schema `rutas_sureste` en Supabase.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  DATA_DIR,
  DB_FILE,
  INGENIEROS_FILE,
  BACKUP_DIR,
  SUPABASE_URL,
  SUPABASE_KEY,
  SUPABASE_SCHEMA,
} from './config.js';

/** Número máximo de respaldos históricos a conservar en `data/backups/` */
const MAX_BACKUPS = 40;

/**
 * Convierte una cadena `"lat,lng"` en un objeto numérico `{ lat, lng }`.
 * @param {string} str - Coordenadas separadas por coma.
 * @returns {{ lat: number, lng: number }}
 */
export function parseCoords(str) {
  const [lat, lng] = String(str).split(',').map(Number);
  return { lat, lng };
}

/**
 * Formatea un par de coordenadas numéricas con 7 decimales de precisión (~1.1 cm).
 * @param {number} lat - Latitud decimal.
 * @param {number} lng - Longitud decimal.
 * @returns {string} Cadena `"lat,lng"` lista para almacenar en `tiendas.json`.
 */
export function formatCoords(lat, lng) {
  return `${Number(lat).toFixed(7)},${Number(lng).toFixed(7)}`;
}

/**
 * Ordena el catálogo colocando primero el punto base (`RESGUARDO`), luego `CEDIS` y el resto
 * de tiendas en orden alfabético español.
 * @param {Array<Object>} tiendas - Lista de tiendas a ordenar.
 * @returns {Array<Object>} Lista ordenada.
 */
export function ordenar(tiendas) {
  const resguardo = tiendas.filter((t) => t.nombre.includes('RESGUARDO'));
  const cedis = tiendas.filter(
    (t) => t.nombre.includes('CEDIS') && !t.nombre.includes('RESGUARDO')
  );
  const resto = tiendas.filter(
    (t) => !t.nombre.includes('RESGUARDO') && !t.nombre.includes('CEDIS')
  );
  resto.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return [...resguardo, ...cedis, ...resto];
}

/**
 * Lee el catálogo completo de tiendas desde `data/tiendas.json`.
 * @returns {Array<Object>} Arreglo de tiendas.
 */
export function cargar() {
  if (!fs.existsSync(DB_FILE)) return [];
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

/**
 * Crea una copia de seguridad fechada de `data/tiendas.json` dentro de `data/backups/`
 * y depura respaldos antiguos cuando se supera el límite `MAX_BACKUPS`.
 */
function respaldar() {
  if (!fs.existsSync(DB_FILE)) return;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(DB_FILE, path.join(BACKUP_DIR, `tiendas-${stamp}.json`));
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('tiendas-'))
    .sort();
  files
    .slice(0, Math.max(0, files.length - MAX_BACKUPS))
    .forEach((f) => fs.unlinkSync(path.join(BACKUP_DIR, f)));
}

/**
 * Guarda de forma atómica el catálogo de tiendas en `data/tiendas.json`.
 * @param {Array<Object>} tiendas - Lista completa de tiendas a persistir.
 * @param {{ backup?: boolean }} [options] - Si `backup` es `true`, respalda la versión previa.
 * @returns {Array<Object>} Lista de tiendas ya ordenada y guardada.
 */
export function guardar(tiendas, { backup = true } = {}) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (backup) respaldar();
  const ordenadas = ordenar(tiendas);
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(ordenadas, null, 4));
  fs.renameSync(tmp, DB_FILE);
  return ordenadas;
}

/**
 * Normaliza el nombre de una tienda eliminando espacios repetidos y convirtiendo a mayúsculas.
 * @param {string} nombre - Nombre crudo ingresado por el usuario.
 * @returns {string} Nombre limpio en mayúsculas.
 */
export function normalizarNombre(nombre) {
  return String(nombre || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

// ============================================================================
// PERFILES DE INGENIEROS
// ============================================================================

/**
 * Lee los perfiles de los ingenieros desde `data/ingenieros.json`.
 * @returns {Array<Object>}
 */
export function cargarIngenieros() {
  if (!fs.existsSync(INGENIEROS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(INGENIEROS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Guarda de forma atómica la lista de perfiles de ingenieros en `data/ingenieros.json`.
 * @param {Array<Object>} ingenieros
 * @returns {Array<Object>}
 */
export function guardarIngenieros(ingenieros) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = INGENIEROS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(ingenieros, null, 2));
  fs.renameSync(tmp, INGENIEROS_FILE);
  return ingenieros;
}

// ============================================================================
// SINCRONIZACIÓN ASÍNCRONA CON SUPABASE (PostgREST)
// ============================================================================

function supabaseHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Accept-Profile': SUPABASE_SCHEMA,
    'Content-Profile': SUPABASE_SCHEMA,
    ...extra,
  };
}

export function supabaseActivo() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

/**
 * Sincroniza (upsert) una tienda individual en `rutas_sureste.tiendas`.
 * Si `nombreOriginal` cambió, actualiza por nombre original.
 */
export async function syncTiendaUpsert(tienda, nombreOriginal = null) {
  if (!supabaseActivo()) return;
  try {
    const { lat, lng } = parseCoords(tienda.coords || '');
    const payload = {
      eco: tienda.eco || '0',
      ceco: tienda.ceco || '0',
      nombre: tienda.nombre,
      coords: tienda.coords || '',
      coords_anteriores: tienda.coordsAnteriores || null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      estado: tienda.estado || 'Chiapas',
      region: tienda.region || 'SURESTE',
      empresa: tienda.empresa || 'SURESTE',
      zona: tienda.zona || '',
      ingeniero: tienda.ingeniero || '',
      verificada: Boolean(tienda.verificada),
      fecha_verificacion: tienda.fechaVerificacion || null,
    };

    if (nombreOriginal && nombreOriginal !== tienda.nombre) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/tiendas?nombre=eq.${encodeURIComponent(nombreOriginal)}`,
        {
          method: 'PATCH',
          headers: supabaseHeaders({ Prefer: 'return=minimal' }),
          body: JSON.stringify(payload),
        }
      );
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/tiendas?on_conflict=nombre`, {
        method: 'POST',
        headers: supabaseHeaders({
          Prefer: 'resolution=merge-duplicates,return=minimal',
        }),
        body: JSON.stringify(payload),
      });
    }
  } catch (err) {
    console.error('[Supabase Sync] Error en syncTiendaUpsert:', err.message);
  }
}

/**
 * Elimina una tienda en `rutas_sureste.tiendas`.
 */
export async function syncTiendaDelete(nombre) {
  if (!supabaseActivo()) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/tiendas?nombre=eq.${encodeURIComponent(nombre)}`, {
      method: 'DELETE',
      headers: supabaseHeaders({ Prefer: 'return=minimal' }),
    });
  } catch (err) {
    console.error('[Supabase Sync] Error en syncTiendaDelete:', err.message);
  }
}

/**
 * Sincroniza (upsert) un perfil de ingeniero en `rutas_sureste.ingenieros`.
 */
export async function syncIngenieroUpsert(ing) {
  if (!supabaseActivo()) return;
  try {
    const payload = {
      nombre: ing.nombre,
      puesto: ing.puesto || 'INGENIERO DE SOPORTE TECNICO',
      no_empleado: ing.no_empleado || '',
      tarjeta_gasolina: ing.tarjeta_gasolina || '',
      automovil: ing.automovil || '',
      placas: ing.placas || '',
      serie: ing.serie || '',
      ceco: ing.ceco || '',
      region: ing.region || 'TUXTLA',
      rendimiento: Number(ing.rendimiento || 12.5),
      costo_litro: Number(ing.costo_litro || 23.99),
      base_nombre: ing.base_nombre || 'RESGUARDO TUXTLA',
      domicilio_direccion: ing.domicilio_direccion || '',
      domicilio_link: ing.domicilio_link || '',
      km_inicial_ultimo: Number(ing.km_inicial_ultimo || 0),
      updated_at: new Date().toISOString(),
    };
    await fetch(`${SUPABASE_URL}/rest/v1/ingenieros?on_conflict=nombre`, {
      method: 'POST',
      headers: supabaseHeaders({
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[Supabase Sync] Error en syncIngenieroUpsert:', err.message);
  }
}

/**
 * Sincroniza (upsert) un registro de ruta en `rutas_sureste.rutas_historial`.
 */
export async function syncHistorialUpsert(item) {
  if (!supabaseActivo()) return;
  try {
    const payload = {
      uuid: item.id,
      fecha: item.fecha,
      nombre: item.nombre || '',
      paradas: item.paradas || [],
      tramos: item.tramos || [],
      base_inicio: Boolean(item.baseInicio),
      base_fin: Boolean(item.baseFin),
      total_km: Number(item.totalKm || 0),
      costo: Number(item.costo || 0),
      litros: Number(item.litros || 0),
      duracion_segundos: Number(item.segundos || 0),
      ingeniero: item.ingeniero || '',
    };
    await fetch(`${SUPABASE_URL}/rest/v1/rutas_historial?on_conflict=uuid`, {
      method: 'POST',
      headers: supabaseHeaders({
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[Supabase Sync] Error en syncHistorialUpsert:', err.message);
  }
}

/**
 * Elimina un registro de ruta de `rutas_sureste.rutas_historial`.
 */
export async function syncHistorialDelete(uuid) {
  if (!supabaseActivo()) return;
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/rutas_historial?uuid=eq.${encodeURIComponent(uuid)}`,
      {
        method: 'DELETE',
        headers: supabaseHeaders({ Prefer: 'return=minimal' }),
      }
    );
  } catch (err) {
    console.error('[Supabase Sync] Error en syncHistorialDelete:', err.message);
  }
}

// ============================================================================
