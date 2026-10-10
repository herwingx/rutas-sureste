/**
 * @fileoverview Capa de acceso y persistencia atómica para el catálogo de tiendas (`data/tiendas.json`).
 * Garantiza que cada modificación cree primero un respaldo automático en `data/backups/`
 * (conservando hasta 40 versiones recientes) y escriba mediante archivo temporal (`.tmp` + `renameSync`)
 * para evitar corrupción de datos ante cierres inesperados.
 */

import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, DB_FILE, BACKUP_DIR } from './config.js';

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
 * Ordena el catálogo colocando primero el punto base (`RESGUARDO`) y el resto
 * de tiendas en orden alfabético español.
 * @param {Array<Object>} tiendas - Lista de tiendas a ordenar.
 * @returns {Array<Object>} Lista ordenada.
 */
export function ordenar(tiendas) {
  const resguardo = tiendas.filter((t) => t.nombre.includes('RESGUARDO'));
  const resto = tiendas.filter((t) => !t.nombre.includes('RESGUARDO'));
  resto.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return [...resguardo, ...resto];
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
