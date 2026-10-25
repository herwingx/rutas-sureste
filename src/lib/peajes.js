/**
 * @fileoverview Catálogo y Detector Inteligente de Peajes y Casetas del Sureste Mexicano (`peajes.js`).
 *
 * Cobertura oficial (Tarifas vigentes CAPUFE y Concesionarias para Automóviles / Pick-ups):
 * 1. Chiapas:
 *    - Autopista 190D Tuxtla Gutiérrez / Chiapa de Corzo ↔ San Cristóbal de las Casas ($89 MXN)
 *    - Autopistas 190D / 200D Ocozocoautla ↔ Arriaga / Costa ($120 MXN: Coita $65 + Arriaga $55)
 *    - Autopista 145D Ocozocoautla ↔ Las Choapas (Caseta Malpasito $104 MXN)
 * 2. Tabasco y Veracruz:
 *    - Autopista 180D Coatzacoalcos ↔ Cárdenas / Villahermosa (Caseta Sánchez Magallanes $93 MXN)
 *    - Autopista 145D Coatzacoalcos ↔ Acayucan (Caseta Acayucan $98 MXN)
 *    - Puente Coatzacoalcos II Ing. Antonio Dovalí Jaime ($25 MXN)
 * 3. Península de Yucatán:
 *    - Autopista 180D Mérida ↔ Valladolid / Cancún (Caseta Pisté $415 MXN)
 *    - Autopista 180D Valladolid ↔ Cancún / Tintal ($280 MXN)
 */

function textoCompleto(p) {
  if (!p) return '';
  return [
    p.nombre || '',
    p.zona || '',
    p.estado || '',
    p.municipio || '',
    p.direccion || '',
  ]
    .join(' ')
    .toUpperCase();
}

export const CASETAS_CATALOGO = [
  {
    id: 'tuxtla-sancris',
    nombre: 'Caseta Chiapa de Corzo – San Cristóbal',
    autopista: 'Autopista 190D',
    costo: 89,
    region: 'CHIAPAS',
    descripcion: 'Tramo Tuxtla Gutiérrez / Chiapa de Corzo ↔ San Cristóbal de las Casas / Altos',
    match: (a, b) => {
      const zA = textoCompleto(a);
      const zB = textoCompleto(b);
      const esTuxtla = (s) =>
        s.includes('TUXTLA') ||
        s.includes('CHIAPA') ||
        s.includes('BERRIOZABAL') ||
        s.includes('RESGUARDO TUXTLA') ||
        s.includes('CEDIS NETO TUXTLA') ||
        s.includes('CALVARIUM') ||
        s.includes('POTINASPAK');
      const esAltos = (s) =>
        s.includes('SAN CRISTOBAL') ||
        s.includes('SAN DIEGO') ||
        s.includes('TEOPISCA') ||
        s.includes('CHAMULA') ||
        s.includes('ZINACANTAN') ||
        s.includes('COMITAN') ||
        s.includes('MESETA COMITECA');
      return (esTuxtla(zA) && esAltos(zB)) || (esAltos(zA) && esTuxtla(zB));
    },
  },
  {
    id: 'coita-arriaga',
    nombre: 'Casetas Ocozocoautla – Arriaga',
    autopista: 'Autopistas 190D / 200D',
    costo: 120, // Coita $65 + Arriaga $55
    region: 'CHIAPAS',
    descripcion: 'Tramo Centro (Tuxtla / Coita) ↔ Costa (Arriaga / Tonalá / Pijijiapan / Tapachula)',
    match: (a, b) => {
      const zA = textoCompleto(a);
      const zB = textoCompleto(b);
      const esCentro = (s) =>
        s.includes('TUXTLA') ||
        s.includes('OCOZOCOAUTLA') ||
        s.includes('COITA') ||
        s.includes('BERRIOZABAL') ||
        s.includes('RESGUARDO TUXTLA') ||
        s.includes('CEDIS NETO TUXTLA');
      const esCosta = (s) =>
        s.includes('ARRIAGA') ||
        s.includes('TONALA') ||
        s.includes('PIJIJIAPAN') ||
        s.includes('MAPASTEPEC') ||
        s.includes('HUIXTLA') ||
        s.includes('TAPACHULA') ||
        s.includes('CHIAPAS COSTA') ||
        s.includes('CHIAPAS SOCONUSCO') ||
        s.includes('ISTMO COSTA');
      return (esCentro(zA) && esCosta(zB)) || (esCosta(zA) && esCentro(zB));
    },
  },
  {
    id: 'malpasito-laschoapas',
    nombre: 'Caseta Malpasito (Las Choapas)',
    autopista: 'Autopista 145D',
    costo: 104,
    region: 'CHIAPAS / VERACRUZ',
    descripcion: 'Tramo Chiapas (Tuxtla / Coita) ↔ Veracruz (Las Choapas / Coatzacoalcos)',
    match: (a, b) => {
      const zA = textoCompleto(a);
      const zB = textoCompleto(b);
      const esChiapas = (s) =>
        s.includes('CHIAPAS') ||
        s.includes('TUXTLA') ||
        s.includes('COITA') ||
        s.includes('OCOZOCOAUTLA') ||
        s.includes('BERRIOZABAL');
      const esVeracruzSur = (s) =>
        s.includes('COATZA') ||
        s.includes('MINATITLAN') ||
        s.includes('CHOAPAS') ||
        s.includes('ACAYUCAN') ||
        s.includes('AGUA DULCE') ||
        s.includes('CROSS DOCK COATZACOALCOS');
      return (esChiapas(zA) && esVeracruzSur(zB)) || (esVeracruzSur(zA) && esChiapas(zB));
    },
  },
  {
    id: 'sanchez-magallanes',
    nombre: 'Caseta Sánchez Magallanes',
    autopista: 'Autopista 180D',
    costo: 93,
    region: 'TABASCO / VERACRUZ',
    descripcion: 'Tramo Coatzacoalcos ↔ Cárdenas / Villahermosa',
    match: (a, b) => {
      const zA = textoCompleto(a);
      const zB = textoCompleto(b);
      const esCoatza = (s) =>
        s.includes('COATZA') ||
        s.includes('MINATITLAN') ||
        s.includes('AGUA DULCE') ||
        s.includes('CROSS DOCK COATZACOALCOS') ||
        s.includes('CHOAPAS');
      const esTabasco = (s) =>
        s.includes('TABASCO') ||
        s.includes('VILLAHERMOSA') ||
        s.includes('CARDENAS') ||
        s.includes('COMALCALCO') ||
        s.includes('CHONTALPA') ||
        s.includes('CROSS DOCK VILLA HERMOSA') ||
        s.includes('JALPA');
      return (esCoatza(zA) && esTabasco(zB)) || (esTabasco(zA) && esCoatza(zB));
    },
  },
  {
    id: 'acayucan',
    nombre: 'Caseta Acayucan',
    autopista: 'Autopista 145D',
    costo: 98,
    region: 'VERACRUZ',
    descripcion: 'Tramo Coatzacoalcos / Minatitlán ↔ Acayucan / Isla',
    match: (a, b) => {
      const zA = textoCompleto(a);
      const zB = textoCompleto(b);
      const esCoatza = (s) => s.includes('COATZA') || s.includes('MINATITLAN');
      const esAcayucan = (s) => s.includes('ACAYUCAN') || s.includes('ISLA') || s.includes('COSAMALOAPAN');
      return (esCoatza(zA) && esAcayucan(zB)) || (esAcayucan(zA) && esCoatza(zB));
    },
  },
  {
    id: 'piste-merida-cancun',
    nombre: 'Caseta Pisté (Chichén Itzá)',
    autopista: 'Autopista 180D',
    costo: 415,
    region: 'YUCATÁN / QUINTANA ROO',
    descripcion: 'Tramo Mérida / Kanasín ↔ Valladolid / Cancún',
    match: (a, b) => {
      const zA = textoCompleto(a);
      const zB = textoCompleto(b);
      const esMerida = (s) =>
        s.includes('MERIDA') ||
        s.includes('KANASIN') ||
        s.includes('UMAN') ||
        s.includes('CEDIS NETO MERIDA') ||
        s.includes('PROGRESO');
      const esOriente = (s) =>
        s.includes('VALLADOLID') ||
        s.includes('CANCUN') ||
        s.includes('PLAYA') ||
        s.includes('TIZIMIN') ||
        s.includes('TINTAL');
      return (esMerida(zA) && esOriente(zB)) || (esOriente(zA) && esMerida(zB));
    },
  },
];

/**
 * Detecta de forma inteligente qué casetas se cruzan a lo largo de una secuencia de paradas.
 * @param {Array<Object>} puntos Puntos de la ruta (incluyendo base inicio y fin si aplican)
 * @returns {{ casetas: Array<{ id: string, tramoClave: string, legIndex: number, nombre: string, autopista: string, costo: number, region: string, origen: string, destino: string, tramo: string }>, totalPeajes: number }}
 */
export function detectarPeajesRuta(puntos) {
  if (!Array.isArray(puntos) || puntos.length < 2) {
    return { casetas: [], totalPeajes: 0 };
  }

  const casetas = [];

  for (let i = 0; i < puntos.length - 1; i++) {
    const a = puntos[i];
    const b = puntos[i + 1];

    for (const cat of CASETAS_CATALOGO) {
      if (cat.match(a, b)) {
        const tramoClave = `${cat.id}-${i}`;
        casetas.push({
          id: cat.id,
          tramoClave,
          legIndex: i,
          nombre: cat.nombre,
          autopista: cat.autopista,
          costo: cat.costo,
          region: cat.region,
          origen: a.nombre || 'Origen',
          destino: b.nombre || 'Destino',
          tramo: `${a.nombre || 'Origen'} ➔ ${b.nombre || 'Destino'}`,
        });
      }
    }
  }

  const totalPeajes = casetas.reduce((sum, c) => sum + c.costo, 0);
  return { casetas, totalPeajes };
}
