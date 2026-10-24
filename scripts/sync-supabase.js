/**
 * @fileoverview Script de sincronización bidireccional entre `data/tiendas.json` y Supabase.
 * Utiliza la API REST nativa de Supabase (`PostgREST`) mediante `fetch` nativo de Node.js,
 * sin requerir dependencias externas adicionales.
 *
 * Uso:
 *   node scripts/sync-supabase.js --push   # Sube data/tiendas.json hacia Supabase
 *   node scripts/sync-supabase.js --pull   # Descarga cambios desde Supabase a data/tiendas.json
 *
 * Variables requeridas en `.env`:
 *   SUPABASE_URL=https://xyzcompany.supabase.co
 *   SUPABASE_KEY=tu_service_role_o_anon_key
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');
const JSON_FILE = path.join(ROOT, 'data/tiendas.json');

// Cargar variables de entorno manualmente desde .env
function loadEnv() {
  const env = { ...process.env };
  if (fs.existsSync(ENV_FILE)) {
    const lines = fs.readFileSync(ENV_FILE, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...vals] = trimmed.split('=');
      if (key) env[key.trim()] = vals.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

function checkConfig() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('\n❌ Faltan credenciales de Supabase en tu archivo .env:');
    console.error('Agrega las siguientes variables a .env:');
    console.error('  SUPABASE_URL=https://<tu-proyecto>.supabase.co');
    console.error('  SUPABASE_KEY=<tu-service-role-o-anon-key>\n');
    process.exit(1);
  }
}

async function pushToSupabase() {
  checkConfig();
  console.log('📦 Leyendo data/tiendas.json...');
  const tiendas = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  console.log(`Subiendo ${tiendas.length} tiendas a Supabase (${SUPABASE_URL})...`);

  const payload = tiendas.map((t) => {
    const [latStr, lngStr] = String(t.coords || '').split(',');
    const lat = latStr ? parseFloat(latStr) : null;
    const lng = lngStr ? parseFloat(lngStr) : null;

    return {
      eco: t.eco || '0',
      ceco: t.ceco || '0',
      nombre: t.nombre,
      coords: t.coords || '',
      coords_anteriores: t.coordsAnteriores || null,
      lat: isNaN(lat) ? null : lat,
      lng: isNaN(lng) ? null : lng,
      estado: t.estado || 'Chiapas',
      region: t.region || 'SURESTE',
      empresa: t.empresa || 'SURESTE',
      zona: t.zona || '',
      ingeniero: t.ingeniero || '',
      verificada: Boolean(t.verificada),
      fecha_verificacion: t.fechaVerificacion || null,
    };
  });

  // Enviar por lotes de 100 para evitar límites de tamaño de solicitud
  const BATCH_SIZE = 100;
  for (let i = 0; i < payload.length; i += BATCH_SIZE) {
    const batch = payload.slice(i, i + BATCH_SIZE);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/tiendas?on_conflict=nombre`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      const errTxt = await res.text();
      throw new Error(`Error en lote ${i + 1}-${i + batch.length}: ${res.status} ${errTxt}`);
    }
    console.log(`  ✓ Lote ${Math.min(i + BATCH_SIZE, payload.length)}/${payload.length} sincronizado.`);
  }

  console.log('\n✅ ¡Todas las tiendas fueron sincronizadas exitosamente en Supabase!\n');
}

async function pullFromSupabase() {
  checkConfig();
  console.log(`📥 Descargando tiendas desde Supabase (${SUPABASE_URL})...`);

  const res = await fetch(`${SUPABASE_URL}/rest/v1/tiendas?select=*&order=nombre.asc`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`Error al consultar Supabase: ${res.status} ${errTxt}`);
  }

  const data = await res.json();
  console.log(`Se recibieron ${data.length} tiendas de Supabase.`);

  const locales = data.map((d) => ({
    eco: d.eco || '0',
    ceco: d.ceco || '0',
    nombre: d.nombre,
    coords: d.coords || (d.lat && d.lng ? `${d.lat.toFixed(7)},${d.lng.toFixed(7)}` : ''),
    ...(d.coords_anteriores ? { coordsAnteriores: d.coords_anteriores } : {}),
    estado: d.estado || 'Chiapas',
    region: d.region || 'SURESTE',
    empresa: d.empresa || 'SURESTE',
    zona: d.zona || '',
    ingeniero: d.ingeniero || '',
    ...(d.verificada ? { verificada: true, fechaVerificacion: d.fecha_verificacion } : {}),
  }));

  // Respaldo de seguridad previo
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(ROOT, `data/backups/tiendas-pre-pull-${stamp}.json`);
  if (fs.existsSync(JSON_FILE)) {
    fs.copyFileSync(JSON_FILE, backupPath);
  }

  const tmp = JSON_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(locales, null, 4), 'utf8');
  fs.renameSync(tmp, JSON_FILE);

  console.log(`\n✅ data/tiendas.json actualizado con ${locales.length} tiendas desde Supabase.`);
  console.log(`Respaldo previo en: ${backupPath}\n`);
}

const arg = process.argv[2];
if (arg === '--push') {
  pushToSupabase().catch((err) => {
    console.error('❌ Error al subir a Supabase:', err.message);
    process.exit(1);
  });
} else if (arg === '--pull') {
  pullFromSupabase().catch((err) => {
    console.error('❌ Error al descargar de Supabase:', err.message);
    process.exit(1);
  });
} else {
  console.log(`
Uso de scripts/sync-supabase.js:
  node scripts/sync-supabase.js --push   Sube data/tiendas.json hacia Supabase
  node scripts/sync-supabase.js --pull   Descarga tiendas desde Supabase a data/tiendas.json
`);
}

