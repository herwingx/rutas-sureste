/**
 * @fileoverview Capa de acceso, persistencia atómica y sincronización en tiempo real con Supabase
 * para el catálogo de tiendas (`data/tiendas.json`), perfiles de ingenieros (`data/ingenieros.json`)
 * y bitácoras semanales (`data/bitacoras-semanales.json`).
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  DATA_DIR,
  DB_FILE,
  BUNDLED_DB_FILE,
  INGENIEROS_FILE,
  BUNDLED_INGENIEROS_FILE,
  BITACORAS_FILE,
  BUNDLED_BITACORAS_FILE,
  BACKUP_DIR,
  SUPABASE_URL,
  SUPABASE_KEY,
  SUPABASE_SCHEMA,
} from './config.js';

const MAX_BACKUPS = 40;

export function parseCoords(str) {
  const [lat, lng] = String(str).split(',').map(Number);
  return { lat, lng };
}

export function formatCoords(lat, lng) {
  return `${Number(lat).toFixed(7)},${Number(lng).toFixed(7)}`;
}

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

export function cargar() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch {}
  }
  if (fs.existsSync(BUNDLED_DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(BUNDLED_DB_FILE, 'utf8'));
    } catch {}
  }
  return [];
}

function respaldar() {
  try {
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
      .forEach((f) => {
        try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch {}
      });
  } catch (err) {
    console.warn('[Respaldar] Aviso filesystem:', err.message);
  }
}

export function guardar(tiendas, { backup = true } = {}) {
  const ordenadas = ordenar(tiendas);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (backup) respaldar();
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(ordenadas, null, 4));
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.warn('[Guardar Tiendas] Aviso filesystem:', err.message);
  }
  return ordenadas;
}

export function normalizarNombre(nombre) {
  return String(nombre || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

// ============================================================================
// PERFILES DE INGENIEROS
// ============================================================================

export function cargarIngenieros() {
  if (fs.existsSync(INGENIEROS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(INGENIEROS_FILE, 'utf8'));
    } catch {}
  }
  if (fs.existsSync(BUNDLED_INGENIEROS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(BUNDLED_INGENIEROS_FILE, 'utf8'));
    } catch {}
  }
  return [];
}

export function guardarIngenieros(ingenieros) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = INGENIEROS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(ingenieros, null, 2));
    fs.renameSync(tmp, INGENIEROS_FILE);
  } catch (err) {
    console.warn('[Guardar Ingenieros] Aviso filesystem:', err.message);
  }
  return ingenieros;
}

// ============================================================================
// BITÁCORAS SEMANALES GUARDADAS
// ============================================================================

export function cargarBitacoras() {
  if (fs.existsSync(BITACORAS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(BITACORAS_FILE, 'utf8'));
    } catch {}
  }
  if (fs.existsSync(BUNDLED_BITACORAS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(BUNDLED_BITACORAS_FILE, 'utf8'));
    } catch {}
  }
  return [];
}

export function guardarBitacoras(bitacoras) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = BITACORAS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(bitacoras, null, 2));
    fs.renameSync(tmp, BITACORAS_FILE);
  } catch (err) {
    console.warn('[Guardar Bitácoras] Aviso filesystem:', err.message);
  }
  return bitacoras;
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

export async function syncTiendaUpsert(tienda, nombreOriginal = null) {
  if (!supabaseActivo()) return null;
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

    let res;
    if (nombreOriginal && nombreOriginal !== tienda.nombre) {
      res = await fetch(
        `${SUPABASE_URL}/rest/v1/tiendas?nombre=eq.${encodeURIComponent(nombreOriginal)}`,
        {
          method: 'PATCH',
          headers: supabaseHeaders({ Prefer: 'return=representation' }),
          body: JSON.stringify(payload),
        }
      );
    } else {
      res = await fetch(`${SUPABASE_URL}/rest/v1/tiendas?on_conflict=nombre`, {
        method: 'POST',
        headers: supabaseHeaders({
          Prefer: 'resolution=merge-duplicates,return=representation',
        }),
        body: JSON.stringify(payload),
      });
    }

    if (!res.ok) {
      const txt = await res.text();
      console.error('[Supabase Sync] Error HTTP en syncTiendaUpsert:', res.status, txt);
      return null;
    }
    return payload;
  } catch (err) {
    console.error('[Supabase Sync] Error en syncTiendaUpsert:', err.message);
    return null;
  }
}

export async function syncTiendaDelete(nombre) {
  if (!supabaseActivo()) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tiendas?nombre=eq.${encodeURIComponent(nombre)}`, {
      method: 'DELETE',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error('[Supabase Sync] Error HTTP en syncTiendaDelete:', res.status, txt);
      return null;
    }
    return true;
  } catch (err) {
    console.error('[Supabase Sync] Error en syncTiendaDelete:', err.message);
    return null;
  }
}

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

export async function syncHistorialUpsert(item) {
  if (!supabaseActivo()) return null;
  try {
    const payload = {
      uuid: item.id,
      fecha: item.fecha,
      nombre: item.nombre || '',
      tipo: item.tipo || 'comprobacion',
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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rutas_historial?on_conflict=uuid`, {
      method: 'POST',
      headers: supabaseHeaders({
        Prefer: 'resolution=merge-duplicates,return=representation',
      }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error('[Supabase Sync] Error HTTP en syncHistorialUpsert:', res.status, txt);
      return null;
    }
    return payload;
  } catch (err) {
    console.error('[Supabase Sync] Error en syncHistorialUpsert:', err.message);
    return null;
  }
}

export async function syncHistorialDelete(uuid) {
  if (!supabaseActivo()) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rutas_historial?uuid=eq.${encodeURIComponent(uuid)}`,
      {
        method: 'DELETE',
        headers: supabaseHeaders({ Prefer: 'return=representation' }),
      }
    );
    if (!res.ok) {
      const txt = await res.text();
      console.error('[Supabase Sync] Error HTTP en syncHistorialDelete:', res.status, txt);
      return null;
    }
    return true;
  } catch (err) {
    console.error('[Supabase Sync] Error en syncHistorialDelete:', err.message);
    return null;
  }
}

export async function syncBitacoraUpsert(b) {
  if (!supabaseActivo()) return null;
  try {
    const payload = {
      ingeniero: b.ingeniero,
      semana: Number(b.semana),
      anio: Number(b.anio) || new Date().getFullYear(),
      tipo: b.tipo || 'ambas',
      km_inicial: Number(b.km_inicial || 0),
      rendimiento: Number(b.rendimiento || 12.5),
      costo_litro: Number(b.costo_litro || 23.99),
      dispersion: Number(b.dispersion || 0),
      complementos: Number(b.complementos || 0),
      observaciones_anticipo: b.observaciones_anticipo || '',
      observaciones_comprobacion: b.observaciones_comprobacion || '',
      dias_anticipo: b.dias_anticipo || [],
      dias_comprobacion: b.dias_comprobacion || [],
      puntos_nuevos: b.puntos_nuevos || [],
      total_km: Number(b.total_km || 0),
      total_importe: Number(b.total_importe || 0),
      updated_at: new Date().toISOString(),
    };
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bitacoras_semanales?on_conflict=ingeniero,anio,semana`,
      {
        method: 'POST',
        headers: supabaseHeaders({
          Prefer: 'resolution=merge-duplicates,return=representation',
        }),
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      const txt = await res.text();
      console.error('[Supabase Sync] Error HTTP en syncBitacoraUpsert:', res.status, txt);
      return null;
    }
    return payload;
  } catch (err) {
    console.error('[Supabase Sync] Error en syncBitacoraUpsert:', err.message);
    return null;
  }
}

export async function syncBitacoraDelete(ingeniero, semana, anio) {
  if (!supabaseActivo()) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bitacoras_semanales?ingeniero=eq.${encodeURIComponent(
        ingeniero
      )}&semana=eq.${semana}&anio=eq.${anio}`,
      {
        method: 'DELETE',
        headers: supabaseHeaders({ Prefer: 'return=representation' }),
      }
    );
    if (!res.ok) {
      const txt = await res.text();
      console.error('[Supabase Sync] Error HTTP en syncBitacoraDelete:', res.status, txt);
      return null;
    }
    return true;
  } catch (err) {
    console.error('[Supabase Sync] Error en syncBitacoraDelete:', err.message);
    return null;
  }
}

