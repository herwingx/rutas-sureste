/**
 * @fileoverview Script de consolidación y extracción del catálogo maestro de tiendas.
 * Fusiona las 374 tiendas de todos los ingenieros (del CSV) con las tiendas locales existentes,
 * preservando intactas al 100% las coordenadas verificadas/auditadas de Herwing Vázquez
 * y enriqueciendo cada registro con ECO, CECO, Región, Empresa, Zona e Ingeniero.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CSV_FILE = path.join(ROOT, 'data/tiendas_ingenieros.csv');
const JSON_FILE = path.join(ROOT, 'data/tiendas.json');

function parseDMS(str) {
  if (!str) return null;
  const clean = str.replace(/\"\"/g, '\"').replace(/\"/g, '').trim();
  const m = clean.match(/(\d+)°(\d+)'([\d.]+)\s*([NSEWnsew])/);
  if (!m) return null;
  const deg = parseFloat(m[1]);
  const min = parseFloat(m[2]);
  const sec = parseFloat(m[3]);
  const dir = m[4].toUpperCase();
  let dec = deg + min / 60 + sec / 3600;
  if (dir === 'S' || dir === 'W') dec = -dec;
  return dec;
}

function parseCSV(content) {
  const lines = content.trim().split(/\r?\n/);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        if (inQuotes && line[c + 1] === '"') {
          current += '"';
          c++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current);
    rows.push(fields.map((f) => f.trim()));
  }
  return { rows };
}

function inferEstado(row) {
  const reg = row[3]?.toUpperCase() || '';
  const zona = row[5]?.toUpperCase() || '';
  const nombre = row[2]?.toUpperCase() || '';

  if (
    nombre.includes('TAPANATEPEC') ||
    nombre.includes('CHAHUITES') ||
    nombre.includes('ZANATEPEC') ||
    nombre.includes('IXHUATAN') ||
    nombre.includes('NILTEPEC')
  ) {
    return 'Oaxaca';
  }
  if (
    reg.includes('COATZA') ||
    zona.includes('COATZA') ||
    zona.includes('MINA') ||
    zona.includes('ACAYUCAN') ||
    zona.includes('CHOAPAS') ||
    zona.includes('LA VENTA')
  ) {
    if (
      nombre.includes('HUIMANGUILLO') ||
      nombre.includes('CARDENAS') ||
      nombre.includes('CONVIVENCIA') ||
      nombre.includes('ROSALIA')
    ) {
      return 'Tabasco';
    }
    return 'Veracruz';
  }
  if (reg.includes('YUCATAN')) {
    if (
      zona.includes('BALUARTES') ||
      zona.includes('CARMEN') ||
      zona.includes('CHENES') ||
      nombre.includes('CAMPECHE') ||
      nombre.includes('CARMEN') ||
      nombre.includes('CHAMPOTON') ||
      nombre.includes('ESCARCEGA') ||
      nombre.includes('XPUJIL') ||
      nombre.includes('HOPELCHEN') ||
      nombre.includes('HECELCHAKAN') ||
      nombre.includes('CALKINI')
    ) {
      return 'Campeche';
    }
    return 'Yucatán';
  }
  if (reg.includes('TABASCO')) {
    if (
      nombre.includes('PALENQUE') ||
      nombre.includes('PAKALNA') ||
      nombre.includes('CATAZAJA') ||
      nombre.includes('PICHUCALCO') ||
      nombre.includes('IXTACOMITAN') ||
      nombre.includes('JUAREZ 1')
    ) {
      return 'Chiapas';
    }
    return 'Tabasco';
  }
  return 'Chiapas';
}

export function mergeCatalogo() {
  const currentTiendas = fs.existsSync(JSON_FILE)
    ? JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'))
    : [];

  const { rows } = parseCSV(fs.readFileSync(CSV_FILE, 'utf8'));

  // Mapear tiendas existentes por nombre normalizado
  const currentMap = new Map();
  currentTiendas.forEach((t) => {
    currentMap.set(t.nombre.toUpperCase().trim(), t);
  });

  // Homologar casos conocidos de nombre
  if (currentMap.has('NUEVA ESTRELLA INDEPENDENCIA')) {
    currentMap.set(
      'LA ESTRELLA INDEPENDENCIA',
      currentMap.get('NUEVA ESTRELLA INDEPENDENCIA')
    );
  }

  const merged = [];
  const processedNames = new Set();

  // 1. Procesar todas las filas del CSV
  rows.forEach((r) => {
    const eco = r[0];
    const ceco = r[1];
    const rawName = r[2].replace(/\s+/g, ' ').trim();
    const normName = rawName.toUpperCase();
    const region = r[3];
    const empresa = r[4];
    const zona = r[5] || '';
    const ingeniero = r[6];
    const rawLat = r[7];
    const rawLng = r[8];

    const isHerwing = ingeniero.includes('HERWING');
    const existing = currentMap.get(normName);

    let coords = '';
    let coordsAnteriores;
    let verificada;
    let fechaVerificacion;

    if (existing) {
      // SIEMPRE preservar las coordenadas existentes (auditadas/verificadas) de las tiendas de Herwing
      coords = existing.coords;
      coordsAnteriores = existing.coordsAnteriores;
      verificada = existing.verificada;
      fechaVerificacion = existing.fechaVerificacion;
    } else {
      // Tienda nueva desde CSV: parsear coordenadas decimales o DMS
      if (rawLat && rawLng) {
        if (rawLat.includes('°')) {
          const decLat = parseDMS(rawLat);
          const decLng = parseDMS(rawLng);
          coords =
            decLat && decLng ? `${decLat.toFixed(7)},${decLng.toFixed(7)}` : '';
        } else {
          const numLat = parseFloat(rawLat);
          const numLng = parseFloat(rawLng);
          coords =
            !isNaN(numLat) && !isNaN(numLng)
              ? `${numLat.toFixed(7)},${numLng.toFixed(7)}`
              : '';
        }
      }
    }

    const estado = existing?.estado || inferEstado(r);

    const item = {
      eco,
      ceco,
      nombre: existing ? existing.nombre : rawName,
      coords,
      ...(coordsAnteriores ? { coordsAnteriores } : {}),
      estado,
      region,
      empresa,
      zona,
      ingeniero,
      ...(verificada !== undefined ? { verificada } : {}),
      ...(fechaVerificacion ? { fechaVerificacion } : {}),
    };

    merged.push(item);
    processedNames.add(normName);
    if (existing) processedNames.add(existing.nombre.toUpperCase().trim());
  });

  // 2. Preservar tiendas de soporte operativo del usuario no listadas en el CSV (RESGUARDO TUXTLA, CEDIS)
  currentTiendas.forEach((t) => {
    const normName = t.nombre.toUpperCase().trim();
    if (!processedNames.has(normName)) {
      merged.push({
        eco: '0',
        ceco: '0',
        nombre: t.nombre,
        coords: t.coords,
        ...(t.coordsAnteriores ? { coordsAnteriores: t.coordsAnteriores } : {}),
        estado: t.estado || 'Chiapas',
        region: 'CHIAPAS',
        empresa: 'SURESTE',
        zona: 'TUXTLA CENTRO',
        ingeniero: 'HERWING EDUARDO VAZQUEZ MACIAS',
        ...(t.verificada !== undefined ? { verificada: t.verificada } : {}),
        ...(t.fechaVerificacion ? { fechaVerificacion: t.fechaVerificacion } : {}),
      });
      processedNames.add(normName);
    }
  });

  // Ordenar: primero bases de resguardo/cedis y luego alfabético
  const resguardos = merged.filter((t) => t.nombre.includes('RESGUARDO') || t.nombre.includes('CEDIS'));
  const resto = merged.filter((t) => !t.nombre.includes('RESGUARDO') && !t.nombre.includes('CEDIS'));
  resto.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const finalTiendas = [...resguardos, ...resto];

  // Respaldo de seguridad previo
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(ROOT, `data/backups/tiendas-pre-merge-${stamp}.json`);
  if (fs.existsSync(JSON_FILE)) {
    fs.copyFileSync(JSON_FILE, backupPath);
  }

  // Guardar atómicamente
  const tmp = JSON_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(finalTiendas, null, 4), 'utf8');
  fs.renameSync(tmp, JSON_FILE);

  console.log(`Merge completado exitosamente:`);
  console.log(`- Total de tiendas guardadas: ${finalTiendas.length}`);
  console.log(`- Tiendas verificadas preservadas: ${finalTiendas.filter((t) => t.verificada).length}`);
  console.log(`- Tiendas de Herwing Vázquez: ${finalTiendas.filter((t) => t.ingeniero.includes('HERWING')).length}`);
  console.log(`- Respaldo guardado en: ${backupPath}`);
  return finalTiendas;
}

mergeCatalogo();

