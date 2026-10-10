/**
 * @fileoverview Utilidades geográficas del servidor y extractor universal de coordenadas.
 * Soporta coordenadas decimales directas, notación sexagesimal (DMS: grados, minutos y segundos),
 * enlaces largos de Google Maps (`!3d..!4d..`, `@lat,lng`, `?q=lat,lng`) y resolución de enlaces
 * cortos acortados (`https://maps.app.goo.gl/...` o `https://goo.gl/maps/...`) siguiendo redirecciones HTTP.
 */

const NUM = '(-?\\d{1,3}\\.\\d+)';

/**
 * Verifica que un par latitud/longitud esté dentro de los rangos geográficos válidos de la Tierra.
 * @param {number} lat - Latitud en grados decimales (-90 a 90).
 * @param {number} lng - Longitud en grados decimales (-180 a 180).
 * @returns {boolean}
 */
function valido(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/**
 * Corrige pares donde el usuario haya invertido accidentalmente `(lng, lat)` en México
 * y valida el resultado final.
 * @param {number} lat
 * @param {number} lng
 * @returns {{ lat: number, lng: number } | null}
 */
function ajustar(lat, lng) {
  if (Math.abs(lat) > 80 && Math.abs(lng) <= 30) [lat, lng] = [lng, lat];
  return valido(lat, lng) ? { lat, lng } : null;
}

/**
 * Convierte coordenadas en grados, minutos y segundos (DMS) a grados decimales.
 * @param {string|number} g - Grados.
 * @param {string|number} m - Minutos.
 * @param {string|number} s - Segundos.
 * @param {string} hemi - Hemisferio (`N`, `S`, `E`, `W`, `O`).
 * @returns {number}
 */
function dmsADecimal(g, m, s, hemi) {
  let v = Number(g) + Number(m || 0) / 60 + Number(s || 0) / 3600;
  if (/[SWO]/i.test(hemi)) v = -v;
  return v;
}

/**
 * Intenta extraer coordenadas `{ lat, lng }` sincrónicamente desde cualquier texto o URL.
 * Prioriza los pines reales de lugar (`!3d...!4d...`) sobre el centro de cámara (`@lat,lng`).
 * @param {string} texto - Texto libre, coordenadas o URL de Google Maps / WhatsApp.
 * @returns {{ lat: number, lng: number } | null}
 */
export function extraerDeTexto(texto) {
  if (!texto) return null;
  let t = String(texto).trim();
  try {
    t = decodeURIComponent(t);
  } catch {
    /* texto con caracteres % no codificados */
  }

  // Patrones ordenados de mayor a menor especificidad en URLs de Google Maps
  const patrones = [
    new RegExp(`!3d${NUM}!4d${NUM}`),
    new RegExp(`[?&](?:q|query|ll|sll| destination|origin|viewpoint|center)=${NUM}[,\\s+]+${NUM}`),
    new RegExp(`/@${NUM},${NUM}`),
    new RegExp(`/place/[^/]*?/${NUM},${NUM}`),
    new RegExp(`/search/${NUM}[,\\s+]+${NUM}`),
  ];
  for (const rx of patrones) {
    const m = t.match(rx);
    if (m) {
      const c = ajustar(Number(m[1]), Number(m[2]));
      if (c) return c;
    }
  }

  // Formato sexagesimal DMS: 16°45'12.3"N 93°07'04.5"W
  const dms = [
    ...t.matchAll(/(\d{1,3})\s*[°º]\s*(\d{1,2})?\s*['′]?\s*(\d{1,2}(?:\.\d+)?)?\s*["″]?\s*([NSnsEWewOo])/g),
  ];
  if (dms.length >= 2) {
    const a = dmsADecimal(dms[0][1], dms[0][2], dms[0][3], dms[0][4]);
    const b = dmsADecimal(dms[1][1], dms[1][2], dms[1][3], dms[1][4]);
    const c = /[NS]/i.test(dms[0][4]) ? ajustar(a, b) : ajustar(b, a);
    if (c) return c;
  }

  // Par decimal directo: "16.7521, -93.1154"
  const par = t.match(new RegExp(`${NUM}\\s*[,\\s]\\s*${NUM}`));
  if (par) return ajustar(Number(par[1]), Number(par[2]));
  return null;
}

/**
 * Extrae coordenadas desde texto o resuelve enlaces cortos (`maps.app.goo.gl`, `goo.gl/maps`)
 * siguiendo las redirecciones HTTP en el servidor para obtener la URL expandida con las coordenadas.
 * @param {string} entrada - Texto o enlace compartido desde Google Maps / WhatsApp.
 * @returns {Promise<{ lat: number, lng: number }>}
 */
export async function extraerCoordenadas(entrada) {
  const directo = extraerDeTexto(entrada);
  if (directo) return directo;

  const urlMatch = String(entrada || '').match(/https?:\/\/\S+/);
  if (!urlMatch) {
    throw new Error('No se encontraron coordenadas válidas en el texto o enlace.');
  }

  const url = urlMatch[0];
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RutasSureste/2.0)' },
  });

  // 1. Intentar extraer desde la URL final redirigida
  const desdeUrlFinal = extraerDeTexto(res.url);
  if (desdeUrlFinal) return desdeUrlFinal;

  // 2. Si la URL final aún no muestra coordenadas en claro, inspeccionar el cuerpo HTML
  const html = await res.text();
  const desdeHtml = extraerDeTexto(html);
  if (desdeHtml) return desdeHtml;

  throw new Error('No se pudieron extraer coordenadas del enlace proporcionado.');
}

/**
 * Calcula la distancia en línea recta (fórmula esférica de Haversine) en kilómetros entre dos puntos.
 * @param {{ lat: number, lng: number }} a - Punto origen.
 * @param {{ lat: number, lng: number }} b - Punto destino.
 * @returns {number} Distancia geodésica en kilómetros.
 */
export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
