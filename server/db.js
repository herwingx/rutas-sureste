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
  supabaseServer,
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
// SINCRONIZACIÓN CON SUPABASE (@supabase/supabase-js)
// ============================================================================

export function supabaseActivo() {
  return Boolean(supabaseServer);
}

export async function syncTiendaUpsert(tienda, nombreOriginal = null) {
  if (!supabaseServer) return null;
  try {
    const { lat, lng } = parseCoords(tienda.coords || '');
    const payload = {
      eco: tienda.eco || '0',
      ceco: tienda.ceco || '0',
      nombre: tienda.nombre,
      coords: tienda.coords || '',
      coords_anteriores: tienda.coordsAnteriores || tienda.coords_anteriores || null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      estado: tienda.estado || 'Chiapas',
      region: tienda.region || 'SURESTE',
      empresa: tienda.empresa || 'SURESTE',
      zona: tienda.zona || '',
      ingeniero: tienda.ingeniero || '',
      verificada: Boolean(tienda.verificada),
      fecha_verificacion: tienda.fechaVerificacion || tienda.fecha_verificacion || null,
    };

    if (nombreOriginal && nombreOriginal !== tienda.nombre) {
      const { error } = await supabaseServer
        .from('tiendas')
        .update(payload)
        .eq('nombre', nombreOriginal);
      if (error) {
        console.error('[Supabase Sync] Error en syncTiendaUpsert (update):', error.message);
        return null;
      }
    } else {
      const { error } = await supabaseServer
        .from('tiendas')
        .upsert(payload, { onConflict: 'nombre' });
      if (error) {
        console.error('[Supabase Sync] Error en syncTiendaUpsert (upsert):', error.message);
        return null;
      }
    }
    return payload;
  } catch (err) {
    console.error('[Supabase Sync] Error en syncTiendaUpsert:', err.message);
    return null;
  }
}

export async function syncTiendaDelete(nombre) {
  if (!supabaseServer) return null;
  try {
    const { error } = await supabaseServer.from('tiendas').delete().eq('nombre', nombre);
    if (error) {
      console.error('[Supabase Sync] Error en syncTiendaDelete:', error.message);
      return null;
    }
    return true;
  } catch (err) {
    console.error('[Supabase Sync] Error en syncTiendaDelete:', err.message);
    return null;
  }
}

export async function syncIngenieroUpsert(ing) {
  if (!supabaseServer) return;
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
      ...(ing.email ? { email: ing.email } : {}),
      ...(ing.auth_id ? { auth_id: ing.auth_id } : {}),
      ...(ing.rol ? { rol: ing.rol } : {}),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseServer
      .from('ingenieros')
      .upsert(payload, { onConflict: 'nombre' });
    if (error) {
      console.error('[Supabase Sync] Error en syncIngenieroUpsert:', error.message);
    }
  } catch (err) {
    console.error('[Supabase Sync] Error en syncIngenieroUpsert:', err.message);
  }
}

export async function syncHistorialUpsert(item) {
  if (!supabaseServer) return null;
  try {
    // Evitar duplicados si se guarda el mismo día (fecha + ingeniero + tipo) desde otro dispositivo
    let uuidUsar = item.id;
    if (item.fecha && item.ingeniero) {
      const { data: existente } = await supabaseServer
        .from('rutas_historial')
        .select('uuid')
        .eq('fecha', item.fecha)
        .eq('ingeniero', item.ingeniero)
        .eq('tipo', item.tipo || 'comprobacion')
        .maybeSingle();
      if (existente?.uuid) {
        uuidUsar = existente.uuid;
      }
    }

    const payload = {
      uuid: uuidUsar,
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
    const { error } = await supabaseServer
      .from('rutas_historial')
      .upsert(payload, { onConflict: 'uuid' });
    if (error) {
      console.error('[Supabase Sync] Error en syncHistorialUpsert:', error.message);
      return null;
    }
    return { ...payload, id: uuidUsar };
  } catch (err) {
    console.error('[Supabase Sync] Error en syncHistorialUpsert:', err.message);
    return null;
  }
}

export async function syncHistorialDelete(uuid) {
  if (!supabaseServer) return null;
  try {
    const { error } = await supabaseServer.from('rutas_historial').delete().eq('uuid', uuid);
    if (error) {
      console.error('[Supabase Sync] Error en syncHistorialDelete:', error.message);
      return null;
    }
    return true;
  } catch (err) {
    console.error('[Supabase Sync] Error en syncHistorialDelete:', err.message);
    return null;
  }
}

export async function syncBitacoraUpsert(b) {
  if (!supabaseServer) return null;
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
    const { error } = await supabaseServer
      .from('bitacoras_semanales')
      .upsert(payload, { onConflict: 'ingeniero,anio,semana' });
    if (error) {
      console.error('[Supabase Sync] Error en syncBitacoraUpsert:', error.message);
      return null;
    }
    return payload;
  } catch (err) {
    console.error('[Supabase Sync] Error en syncBitacoraUpsert:', err.message);
    return null;
  }
}

export async function syncBitacoraDelete(ingeniero, semana, anio) {
  if (!supabaseServer) return null;
  try {
    const { error } = await supabaseServer
      .from('bitacoras_semanales')
      .delete()
      .eq('ingeniero', ingeniero)
      .eq('semana', semana)
      .eq('anio', anio);
    if (error) {
      console.error('[Supabase Sync] Error en syncBitacoraDelete:', error.message);
      return null;
    }
    return true;
  } catch (err) {
    console.error('[Supabase Sync] Error en syncBitacoraDelete:', err.message);
    return null;
  }
}

