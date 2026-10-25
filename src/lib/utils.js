/**
 * @fileoverview Utilidades compartidas del frontend de Rutas Sureste.
 * Incluye combinación de clases Tailwind (`cn`), formateo de fechas y moneda mexicana,
 * cálculos geodésicos (Haversine y rumbo cardinal), expansión de alias regionales del
 * Sureste, clasificación automática por corredor/estado y decodificación de polilíneas
 * de Google Routes API.
 */

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina clases condicionales con `clsx` y resuelve conflictos de utilidades
 * de Tailwind CSS mediante `tailwind-merge`.
 * @param {...any} inputs - Clases o expresiones condicionales.
 * @returns {string} Cadena de clases CSS depurada.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Normaliza un texto para búsquedas insensibles a acentos, signos y mayúsculas.
 * @param {string} s - Texto de entrada.
 * @returns {string} Texto en minúsculas sin diacríticos.
 */
export const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Devuelve la fecha local de hoy en formato ISO (`YYYY-MM-DD`).
 * @returns {string}
 */
export const hoy = () => new Date().toLocaleDateString('en-CA');

/**
 * Convierte una fecha ISO (`YYYY-MM-DD`) al formato corto mexicano (`DD/MM/YYYY`).
 * @param {string} iso
 * @returns {string}
 */
export const fechaMX = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/**
 * Formatea una fecha ISO (`YYYY-MM-DD`) en texto legible en español (ej. `"lun, 5 oct 2026"`).
 * @param {string} iso
 * @returns {string}
 */
export const fechaLarga = (iso) => {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

/**
 * Retorna los 7 días (Lunes a Domingo) de la semana correspondiente a una fecha ISO (YYYY-MM-DD).
 * @param {string} fechaStr
 * @returns {Array<{ fecha: string, diaNombre: string, diaMes: string, mesNum: string, esFinDeSemana: boolean }>}
 */
export const obtenerDiasSemana = (fechaStr) => {
  const d = fechaStr ? new Date(fechaStr + 'T12:00:00') : new Date();
  if (Number.isNaN(d.getTime())) return [];
  const day = d.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  const nombres = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const diaNum = String(cur.getDate()).padStart(2, '0');
    dias.push({
      fecha: `${y}-${m}-${diaNum}`,
      diaNombre: nombres[i],
      diaMes: diaNum,
      mesNum: m,
      esFinDeSemana: i >= 5,
    });
  }
  return dias;
};

/**
 * Retorna la fecha ISO (YYYY-MM-DD) del Lunes correspondiente a un número de semana ISO y año.
 * @param {number} semana - Número de semana ISO (1-53)
 * @param {number} anio - Año de 4 dígitos
 * @returns {string}
 */
export const obtenerLunesDeSemanaISO = (semana, anio) => {
  const jan4 = new Date(Date.UTC(anio, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const firstMonday = new Date(jan4);
  firstMonday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1));

  const targetMonday = new Date(firstMonday);
  targetMonday.setUTCDate(firstMonday.getUTCDate() + (semana - 1) * 7);

  const y = targetMonday.getUTCFullYear();
  const m = String(targetMonday.getUTCMonth() + 1).padStart(2, '0');
  const d = String(targetMonday.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Retorna la información completa del Ciclo Operativo de Tiendas Neto para una fecha base:
 * - Lunes de la semana en curso (lunesActual)
 * - Martes a Sábado de la semana en curso
 * - Lunes de la siguiente semana (lunesSiguiente, que se pide por anticipado porque el depósito cae en la tarde)
 * - Listas de días pre-construidas para 'comprobacion' y 'anticipo' (con variante estándar o flexible).
 *
 * @param {string} fechaStr - Fecha ISO (YYYY-MM-DD).
 * @param {Object} [opciones]
 * @param {'comprobacion' | 'anticipo'} [opciones.modo='comprobacion']
 * @param {'ciclo_neto' | 'semana_natural' | 'completa'} [opciones.variante='ciclo_neto']
 * @param {boolean} [opciones.incluirLunesOlvido=false] - Por si al ingeniero se le olvidó pedir el lunes anterior y lo incluye ahora.
 */
export const obtenerCicloOperativoNeto = (
  fechaStr,
  {
    modo = 'comprobacion',
    variante = 'ciclo_neto',
    incluirLunesOlvido = false,
  } = {}
) => {
  const d = fechaStr ? new Date(fechaStr + 'T12:00:00') : new Date();
  if (Number.isNaN(d.getTime())) {
    return {
      dias: [],
      diasSemanaNatural: [],
      lunesActual: null,
      proximoLunes: null,
      fechaLunesActual: '',
      fechaProximoLunes: '',
    };
  }

  const day = d.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  const formatISO = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${dia}`;
  };

  const nombres = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const diasSemanaNatural = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    diasSemanaNatural.push({
      fecha: formatISO(cur),
      diaNombre: nombres[i],
      diaMes: String(cur.getDate()).padStart(2, '0'),
      mesNum: String(cur.getMonth() + 1).padStart(2, '0'),
      esFinDeSemana: i >= 5,
      esProximoLunes: false,
      esLunesActual: i === 0,
    });
  }

  // Lunes de la siguiente semana (+7 días desde el lunes base)
  const nextMon = new Date(monday);
  nextMon.setDate(monday.getDate() + 7);
  const proximoLunes = {
    fecha: formatISO(nextMon),
    diaNombre: 'Lun (+1)',
    diaMes: String(nextMon.getDate()).padStart(2, '0'),
    mesNum: String(nextMon.getMonth() + 1).padStart(2, '0'),
    esFinDeSemana: false,
    esProximoLunes: true,
    esLunesActual: false,
    etiqueta: 'Lunes próx.',
  };

  const lunesActual = diasSemanaNatural[0];

  let dias = [];
  if (modo === 'comprobacion') {
    // Comprobación abarca la semana concluida: Lunes a Sábado
    dias = diasSemanaNatural.slice(0, 6);
  } else {
    // Anticipo
    if (variante === 'semana_natural') {
      dias = diasSemanaNatural.slice(0, 6);
    } else if (variante === 'completa') {
      dias = [...diasSemanaNatural.slice(0, 6), proximoLunes];
    } else {
      // ciclo_neto (estándar Tiendas Neto):
      // Martes a Sábado + Lunes de la siguiente semana (+ opcional Lunes actual por olvido)
      const marASab = diasSemanaNatural.slice(1, 6);
      if (incluirLunesOlvido) {
        dias = [lunesActual, ...marASab, proximoLunes];
      } else {
        dias = [...marASab, proximoLunes];
      }
    }
  }

  return {
    dias,
    lunesActual,
    proximoLunes,
    diasSemanaNatural,
    fechaLunesActual: lunesActual.fecha,
    fechaProximoLunes: proximoLunes.fecha,
  };
};

/**
 * Formatea un monto numérico como moneda en Pesos Mexicanos (`$1,234.56`).
 * @param {number} n
 * @returns {string}
 */
export const pesos = (n) =>
  Number(n || 0).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  });

/**
 * Convierte una duración en segundos a formato compacto de horas y minutos (`2h 15m` o `45 min`).
 * @param {number} s - Duración en segundos.
 * @returns {string}
 */
export const duracion = (s) => {
  if (!s) return '0 min';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m} min`;
};

/**
 * Convierte una cadena `"lat,lng"` en un objeto `{ lat, lng }`.
 * @param {string} str
 * @returns {{ lat: number, lng: number }}
 */
export const parseCoords = (str) => {
  const [lat, lng] = String(str || '0,0').split(',').map(Number);
  return { lat, lng };
};

/**
 * Formatea coordenadas `lat, lng` con 7 decimales.
 * @param {number} lat
 * @param {number} lng
 * @returns {string}
 */
export const fmtCoords = (lat, lng) => `${Number(lat).toFixed(7)},${Number(lng).toFixed(7)}`;

/**
 * Calcula la distancia en línea recta (Haversine) en metros entre dos coordenadas `{ lat, lng }`.
 * @param {{ lat: number, lng: number }} a
 * @param {{ lat: number, lng: number }} b
 * @returns {number} Distancia en metros.
 */
export function haversineM(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return 0;
  const R = 6371000;
  const r = (x) => (x * Math.PI) / 180;
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Determina el rumbo cardinal (`N`, `NE`, `E`, `SE`, `S`, `SO`, `O`, `NO`) desde `a` hacia `b`.
 * Útil al auditar cuánto y hacia dónde se desplazó el pin de una tienda.
 * @param {{ lat: number, lng: number }} a - Coordenada original.
 * @param {{ lat: number, lng: number }} b - Coordenada nueva.
 * @returns {string}
 */
export function rumboCardinal(a, b) {
  if (!a || !b) return '';
  const dLat = b.lat - a.lat;
  const dLng = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
  const deg = ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(deg / 45) % 8];
}

/**
 * Detecta si un texto es un par directo de coordenadas decimales `"lat, lng"`.
 * @param {string} texto
 * @returns {{ lat: number, lng: number } | null}
 */
export function coordsLocales(texto) {
  const m = String(texto || '')
    .trim()
    .match(/^(-?\d{1,3}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)$/);
  return m ? { lat: +m[1], lng: +m[2] } : null;
}

/**
 * Determina si una cadena pegada en el buscador parece una coordenada o URL de ubicación.
 * @param {string} t
 * @returns {boolean}
 */
export const pareceUbicacion = (t) =>
  Boolean(coordsLocales(t) || /https?:\/\/|°|@-?\d|!3d/.test(String(t || '')));

/**
 * Diccionario de abreviaturas y coloquialismos regionales del Sureste mexicano.
 * Permite buscar tiendas escribiendo p. ej. `"coita"`, `"sancris"`, `"vhsa"`, `"mid"` o `"cun"`.
 */
const ALIAS = {
  coita: 'ocozoc',
  ocozocoautla: 'ocozoc',
  ocozocoutla: 'ocozoc',
  sancris: 'san cristobal sc',
  scc: 'san cristobal sc',
  tgz: 'tuxtla',
  tgza: 'tuxtla',
  vf: 'villa flores',
  villaflores: 'villa flores',
  cintalapa: 'cardenas candelaria',
  malpaso: 'mezcalapa',
  vhsa: 'villahermosa',
  mid: 'merida',
  cun: 'cancun',
  pdc: 'playa del carmen',
  chetu: 'chetumal',
  camp: 'campeche',
  coatza: 'coatzacoalcos',
};

/**
 * Expande una consulta de búsqueda reemplazando alias regionales por sus términos canónicos.
 * @param {string} q
 * @returns {string}
 */
export function expandirConsulta(q) {
  return norm(q)
    .split(' ')
    .map((w) => ALIAS[w] || w)
    .join(' ')
    .trim();
}

/**
 * Clasifica una tienda en su región o corredor operativo:
 * - Si la tienda pertenece a otro estado del Sureste (`Tabasco`, `Campeche`, `Yucatán`,
 *   `Quintana Roo`, `Veracruz`, `Oaxaca`), se agrupa directamente por su estado.
 * - Si pertenece a `Chiapas`, se clasifica por corredor geográfico (*Tuxtla*, *Poniente*,
 *   *Frailesca*, *Norte*, *Altos*, *Comitán*, *Selva*).
 * @param {{ nombre: string, lat: number, lng: number, estado?: string }} tienda
 * @returns {{ id: string, nombre: string }}
 */
export function clasificarZona(tienda) {
  if (tienda.zona && tienda.zona.trim()) {
    const z = tienda.zona.trim();
    return { id: norm(z).replace(/ /g, '-'), nombre: z };
  }

  const estado = tienda.estado && norm(tienda.estado) !== 'chiapas' ? tienda.estado : null;
  if (estado) return { id: `edo-${norm(estado).replace(/ /g, '-')}`, nombre: estado };

  const n = norm(tienda.nombre);
  const { lat, lng } = tienda;
  if (
    n.includes('tuxtla') ||
    n.includes('tgz') ||
    n.includes('potinaspak') ||
    n.includes('albania') ||
    n.includes('granjas') ||
    n.includes('calvarium') ||
    n.includes('teran') ||
    n.includes('plan de ayala') ||
    n.includes('loma bonita') ||
    n.includes('jobo') ||
    n.includes('sabinito') ||
    n.includes('9 sur') ||
    n.includes('15 oriente') ||
    (lat > 16.7 && lat < 16.82 && lng > -93.2 && lng < -93.04)
  ) {
    return { id: 'tuxtla', nombre: 'Tuxtla' };
  }
  if (lng < -93.22 || n.includes('berriozabal') || n.includes('san fernando')) {
    return { id: 'poniente', nombre: 'Poniente' };
  }
  if (lat < 16.65 && lng < -92.65) return { id: 'frailesca', nombre: 'Frailesca' };
  if (lat > 16.82 && lng >= -93.1 && lng < -92.65) return { id: 'norte', nombre: 'Norte' };
  if (lat < 16.5 && lng >= -92.65) return { id: 'comitan', nombre: 'Comitán' };
  if (lat > 16.85 && lng >= -92.5) return { id: 'selva', nombre: 'Selva' };
  return { id: 'altos', nombre: 'Altos' };
}

const ORDEN_ZONAS = ['tuxtla', 'poniente', 'frailesca', 'norte', 'altos', 'comitan', 'selva'];

/**
 * Devuelve la lista de regiones/estados que tienen al menos una tienda activa en el catálogo,
 * precedidas por la opción global `"todas"`.
 * @param {Array<Object>} tiendas
 * @returns {Array<{ id: string, nombre: string }>}
 */
export function zonasDisponibles(tiendas) {
  const vistas = new Map();
  for (const t of tiendas) {
    const z = clasificarZona(t);
    if (!vistas.has(z.id)) vistas.set(z.id, z);
  }
  const rank = (id) => {
    const i = ORDEN_ZONAS.indexOf(id);
    return i === -1 ? ORDEN_ZONAS.length : i;
  };
  const activas = [...vistas.values()].sort(
    (a, b) => rank(a.id) - rank(b.id) || a.nombre.localeCompare(b.nombre, 'es')
  );
  return [{ id: 'todas', nombre: 'Todas las regiones' }, ...activas];
}

/**
 * Decodifica una cadena `encodedPolyline` de Google Maps / Routes API (formato Encoded Polyline Algorithm)
 * en un arreglo de coordenadas `[{ lat, lng }, ...]` listo para `google.maps.Polyline`.
 * @param {string} str - Polilínea codificada en ASCII.
 * @returns {Array<{ lat: number, lng: number }>}
 */
export function decodePolyline(str) {
  if (!str) return [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const out = [];
  while (i < str.length) {
    for (const k of [0, 1]) {
      let shift = 0;
      let result = 0;
      let b;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d;
      else lng += d;
    }
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

/**
 * Cliente HTTP ligero para comunicarse con los endpoints `/api/*` del backend.
 * @param {'GET'|'POST'|'PATCH'|'DELETE'} method - Método HTTP.
 * @param {string} url - Ruta del endpoint (ej. `'/api/tiendas'`).
 * @param {Object} [body] - Cuerpo opcional a enviar como JSON.
 * @returns {Promise<any>}
 */
export async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}
