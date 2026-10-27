/**
 * @fileoverview Configuración central del backend de Rutas Sureste.
 * Carga las variables de entorno desde el archivo `.env` en la raíz del proyecto
 * utilizando el cargador nativo `process.loadEnvFile` de Node.js LTS y define las
 * rutas absolutas hacia la capa de persistencia local en `/data`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

/** Directorio raíz del repositorio */
export const ROOT = path.resolve(import.meta.dirname, '..');

const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

/** Directorio empaquetado original en el repositorio */
export const BUNDLED_DATA_DIR = path.join(ROOT, 'data');

/** Directorio donde viven todos los archivos JSON de persistencia y caché */
export const DATA_DIR = isVercel ? '/tmp/data' : path.join(ROOT, 'data');

// Carga nativa de variables de entorno (.env) sin dependencias externas (dotenv)
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envPath);
}

/** Llave de Google Maps Platform restringida a Maps JS API y Routes API */
export const API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

/** Puerto HTTP para el servidor de producción (`pnpm start`) */
export const PORT = Number(process.env.PORT || 3000);

/** Host de escucha por defecto (loopback local) */
export const HOST = process.env.HOST || '127.0.0.1';

/** Archivos maestros del catálogo de tiendas y perfiles */
export const DB_FILE = path.join(DATA_DIR, 'tiendas.json');
export const BUNDLED_DB_FILE = path.join(BUNDLED_DATA_DIR, 'tiendas.json');

export const INGENIEROS_FILE = path.join(DATA_DIR, 'ingenieros.json');
export const BUNDLED_INGENIEROS_FILE = path.join(BUNDLED_DATA_DIR, 'ingenieros.json');

export const BITACORAS_FILE = path.join(DATA_DIR, 'bitacoras-semanales.json');
export const BUNDLED_BITACORAS_FILE = path.join(BUNDLED_DATA_DIR, 'bitacoras-semanales.json');

export const HISTORIAL_FILE = path.join(DATA_DIR, 'historial-rutas.json');
export const BUNDLED_HISTORIAL_FILE = path.join(BUNDLED_DATA_DIR, 'historial-rutas.json');

/** Credenciales para sincronización en tiempo real con Supabase (@supabase/supabase-js) */
export const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://dldttdqpcpdtribtgzsa.supabase.co';
export const SUPABASE_KEY =
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsZHR0ZHFwY3BkdHJpYnRnenNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4Njg3OTYsImV4cCI6MjA4OTQ0NDc5Nn0.ItMe0uFz0f4EOmyHS8DhN8eYoWfpaU-BbNsCPndDK2Y';
export const SUPABASE_SCHEMA =
  process.env.SUPABASE_SCHEMA || process.env.VITE_SUPABASE_SCHEMA || 'rutas_sureste';

/** Instancia oficial de @supabase/supabase-js para el servidor y funciones Serverless */
export const supabaseServer =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        db: { schema: SUPABASE_SCHEMA },
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

/** Carpeta para la caché persistente de tramos carreteros */
export const CACHE_DIR = path.join(DATA_DIR, 'cache');

/** Carpeta para respaldos automáticos rotativos de `tiendas.json` */
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');

/** Rendimiento promedio por defecto (kilómetros por litro) */
export const KM_POR_LITRO = 12.5;

/** Precio base de referencia por litro de combustible ($ MXN) */
export const PRECIO_LITRO = 23.99;
