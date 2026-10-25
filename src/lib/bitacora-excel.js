/**
 * @fileoverview Generador nativo de la Bitácora Oficial de Gasolina Tiendas Neto (`.xlsx`).
 *
 * Características:
 * - Soporta generar **ambas hojas (`COMPROBACION` y `ANTICIPO`) en el mismo archivo `.xlsx`**
 *   o generar solo la hoja elegida (`comprobacion`, `anticipo` o `ambas`).
 * - Inserta el logotipo oficial de Tiendas Neto (`public/logo-neto.png`) en `B1:C3`.
 * - Rellena el encabezado (`B4:G13`) con datos del vehículo, tarjeta, CECO, región, semana y odómetros.
 * - Rellena la tabla lateral `DOMICILIO` (`I3:J5`) y `SUCURSALES NUEVAS/PUNTOS` (`I6:J16`).
 * - Rellena los **7 bloques diarios de 8 filas cada uno (`filas 17 a 72`)** con fecha combinada,
 *   tramos `Recorrido 1 -> Recorrido 2`, kilómetros y fórmulas dinámicas de Excel.
 * - Rellena fila 73 `Total` (`SUM(E17:E72)`), filas 74-76 `DISPERSION`, `COMPLEMENTOS` y `SALDO A FAVOR`.
 * - Crea los 3 marcos para fotos (`FOTOGRAFIA DEL ODOMETRO`, `FOTOGRAFIA DEL RENDIMIENTO` y `FOTOGRAFIA DEL TICKET`).
 * - Rellena el recuadro obligatorio de `Observaciones` (`filas 80-84`).
 */

import ExcelJS from 'exceljs';

const FONT_NAME = 'Calibri';

const BORDER_THIN = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};

const BORDER_BOTTOM_ONLY = {
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
};

const FILL_HEADER_LIGHT = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9E1F2' },
};

const FILL_SECTION_BLUE = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFB4C6E7' },
};

const FILL_PEACH = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFCE4D6' },
};

const FILL_TICKET = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFEDEDED' },
};

/**
 * Calcula el número de semana ISO (1-53) y año correspondiente a partir de una fecha `YYYY-MM-DD`.
 * @param {string} fechaStr
 * @returns {{ semana: number, anio: number }}
 */
export function calcularSemanaISO(fechaStr) {
  const d = fechaStr ? new Date(fechaStr + 'T12:00:00') : new Date();
  if (Number.isNaN(d.getTime())) {
    return { semana: 1, anio: new Date().getFullYear() };
  }
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const semana = 1 + Math.ceil((firstThursday - target) / 604800000);
  const anio = new Date(firstThursday).getUTCFullYear();
  return { semana, anio };
}

function formatearFechaBitacora(fechaStr) {
  if (!fechaStr) return '';
  const [y, m, d] = String(fechaStr).split('-').map(Number);
  if (!y || !m || !d) return fechaStr;
  return `${d}/${m}/${y}`;
}

async function cargarImagenBuffer(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

function setAsteriskLabel(cell, textoSinAsterisco) {
  cell.value = {
    richText: [
      {
        font: { name: FONT_NAME, size: 9, bold: true, color: { argb: 'FFFF0000' } },
        text: '*',
      },
      {
        font: { name: FONT_NAME, size: 9, bold: true, color: { argb: 'FF000000' } },
        text: textoSinAsterisco,
      },
    ],
  };
}

/**
 * Construye una hoja individual (COMPROBACION o ANTICIPO) dentro de un workbook ExcelJS.
 */
function construirHojaBitacora(ws, {
  nombreHoja = 'COMPROBACION',
  ingeniero = {},
  semana = 44,
  kmInicial = 0,
  rendimiento = 12.5,
  costoLitro = 23.99,
  dispersion = 0,
  complementos = 0,
  observaciones = '',
  dias = [],
  puntosNuevos = [],
  logoImageId = null,
}) {
  ws.views = [{ showGridLines: true, zoomScale: 90 }];
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
  };

  // Columnas exactas A..M
  ws.columns = [
    { key: 'A', width: 2.5 },
    { key: 'B', width: 15.5 },
    { key: 'C', width: 25.5 },
    { key: 'D', width: 25.5 },
    { key: 'E', width: 14.5 },
    { key: 'F', width: 17.5 },
    { key: 'G', width: 17.5 },
    { key: 'H', width: 2.5 },
    { key: 'I', width: 22.0 },
    { key: 'J', width: 28.0 },
    { key: 'K', width: 2.5 },
    { key: 'L', width: 15.5 },
    { key: 'M', width: 15.5 },
  ];

  if (logoImageId !== null) {
    ws.addImage(logoImageId, {
      tl: { col: 1.05, row: 0.15 },
      ext: { width: 130, height: 56 },
    });
  }

  ws.getRow(1).height = 16;
  ws.getRow(2).height = 16;
  ws.getRow(3).height = 16;

  // Cabecera B4:G13 con fondo azul claro
  for (let r = 4; r <= 13; r++) {
    ws.getRow(r).height = 16.5;
    for (let c = 2; c <= 7; c++) {
      const cell = ws.getCell(r, c);
      cell.fill = FILL_HEADER_LIGHT;
      cell.font = { name: FONT_NAME, size: 9, color: { argb: 'FF000000' } };
      cell.alignment = { vertical: 'middle' };
    }
  }

  // Fila 4: Título
  ws.mergeCells('B4:E4');
  const titleCell = ws.getCell('B4');
  titleCell.value = 'Formato para comprobación de gastos de combustible';
  titleCell.font = { name: FONT_NAME, size: 10, bold: true };

  // Fila 5: *Nombre y *Semana
  setAsteriskLabel(ws.getCell('B5'), 'Nombre:');
  ws.mergeCells('C5:D5');
  ws.getCell('C5').value = (ingeniero.nombre || '').toUpperCase();
  ws.getCell('C5').font = { name: FONT_NAME, size: 9 };
  ws.getCell('C5').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('C5').border = BORDER_BOTTOM_ONLY;
  ws.getCell('D5').border = BORDER_BOTTOM_ONLY;

  setAsteriskLabel(ws.getCell('F5'), 'Semana:');
  ws.getCell('F5').alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell('G5').value = Number(semana) || 1;
  ws.getCell('G5').font = { name: FONT_NAME, size: 9, bold: true };
  ws.getCell('G5').alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell('G5').border = BORDER_BOTTOM_ONLY;

  // Fila 6: *Puesto y Rendimiento
  setAsteriskLabel(ws.getCell('B6'), 'Puesto:');
  ws.mergeCells('C6:D6');
  ws.getCell('C6').value = (ingeniero.puesto || 'INGENIERO DE SOPORTE TECNICO').toUpperCase();
  ws.getCell('C6').font = { name: FONT_NAME, size: 9 };
  ws.getCell('C6').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('C6').border = BORDER_BOTTOM_ONLY;
  ws.getCell('D6').border = BORDER_BOTTOM_ONLY;

  ws.getCell('F6').value = 'Rendimiento:';
  ws.getCell('F6').font = { name: FONT_NAME, size: 9, bold: true };
  ws.getCell('F6').alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell('G6').value = Number(rendimiento) || 12.5;
  ws.getCell('G6').numFmt = '0.0';
  ws.getCell('G6').font = { name: FONT_NAME, size: 9 };
  ws.getCell('G6').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('G6').border = BORDER_BOTTOM_ONLY;

  // Fila 7: *No. Empleado y *No. De Tarjeta de gasolina
  setAsteriskLabel(ws.getCell('B7'), 'No. Empleado:');
  ws.mergeCells('C7:D7');
  ws.getCell('C7').value = ingeniero.no_empleado
    ? Number(ingeniero.no_empleado) || ingeniero.no_empleado
    : '';
  ws.getCell('C7').font = { name: FONT_NAME, size: 9 };
  ws.getCell('C7').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('C7').border = BORDER_BOTTOM_ONLY;
  ws.getCell('D7').border = BORDER_BOTTOM_ONLY;

  setAsteriskLabel(ws.getCell('F7'), 'No. De Tarjeta de gasolina:');
  ws.getCell('F7').alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell('G7').value = String(ingeniero.tarjeta_gasolina || '');
  ws.getCell('G7').font = { name: FONT_NAME, size: 9, bold: true, color: { argb: 'FF000080' } };
  ws.getCell('G7').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('G7').border = BORDER_BOTTOM_ONLY;

  // Fila 8: Costo por litro
  ws.getCell('F8').value = 'Costo por litro:';
  ws.getCell('F8').font = { name: FONT_NAME, size: 9, bold: true };
  ws.getCell('F8').alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell('G8').value = Number(costoLitro) || 23.99;
  ws.getCell('G8').numFmt = '0.00';
  ws.getCell('G8').font = { name: FONT_NAME, size: 9 };
  ws.getCell('G8').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('G8').border = BORDER_BOTTOM_ONLY;

  // Fila 9: Automovil y *No Serie vehicular completo
  ws.getCell('B9').value = 'Automovil:';
  ws.getCell('B9').font = { name: FONT_NAME, size: 9 };
  ws.mergeCells('C9:D9');
  ws.getCell('C9').value = (ingeniero.automovil || '').toUpperCase();
  ws.getCell('C9').font = { name: FONT_NAME, size: 9 };
  ws.getCell('C9').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('C9').border = BORDER_BOTTOM_ONLY;
  ws.getCell('D9').border = BORDER_BOTTOM_ONLY;

  setAsteriskLabel(ws.getCell('F9'), 'No Serie vehicular completo');
  ws.getCell('F9').alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell('G9').value = (ingeniero.serie || '').toUpperCase();
  ws.getCell('G9').font = { name: FONT_NAME, size: 9 };
  ws.getCell('G9').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('G9').border = BORDER_THIN;

  // Fila 10: *Placas y *CECO
  setAsteriskLabel(ws.getCell('B10'), 'Placas');
  ws.mergeCells('C10:D10');
  ws.getCell('C10').value = (ingeniero.placas || '').toUpperCase();
  ws.getCell('C10').font = { name: FONT_NAME, size: 9, bold: true };
  ws.getCell('C10').alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getCell('C10').border = BORDER_BOTTOM_ONLY;
  ws.getCell('D10').border = BORDER_BOTTOM_ONLY;

  setAsteriskLabel(ws.getCell('F10'), 'CECO');
  ws.getCell('F10').alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell('G10').value = ingeniero.ceco ? Number(ingeniero.ceco) || ingeniero.ceco : '';
  ws.getCell('G10').font = { name: FONT_NAME, size: 9, bold: true };
  ws.getCell('G10').alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell('G10').border = BORDER_BOTTOM_ONLY;

  // Fila 11: *Region
  setAsteriskLabel(ws.getCell('B11'), 'Region:');
  ws.mergeCells('C11:D11');
  ws.getCell('C11').value = (ingeniero.region || 'TUXTLA').toUpperCase();
  ws.getCell('C11').font = { name: FONT_NAME, size: 9, bold: true };
  ws.getCell('C11').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('C11').border = BORDER_BOTTOM_ONLY;
  ws.getCell('D11').border = BORDER_BOTTOM_ONLY;

  // Filas 12 y 13: Odómetros
  setAsteriskLabel(ws.getCell('B12'), 'Kilometro inicial:');
  setAsteriskLabel(ws.getCell('D12'), 'Kilometro Final');
  setAsteriskLabel(ws.getCell('F12'), 'Total KM Recorridos');

  const kmIniNum = Number(kmInicial) || 0;
  ws.getCell('C13').value = kmIniNum;
  ws.getCell('C13').numFmt = '#,##0';
  ws.getCell('C13').font = { name: FONT_NAME, size: 9, bold: true };
  ws.getCell('C13').alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell('C13').border = BORDER_BOTTOM_ONLY;

  ws.getCell('E13').value = { formula: 'C13+E73', result: kmIniNum };
  ws.getCell('E13').numFmt = '#,##0';
  ws.getCell('E13').font = { name: FONT_NAME, size: 9, bold: true };
  ws.getCell('E13').alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell('E13').border = BORDER_BOTTOM_ONLY;

  ws.getCell('G13').value = { formula: 'E13-C13', result: 0 };
  ws.getCell('G13').numFmt = '#,##0';
  ws.getCell('G13').font = { name: FONT_NAME, size: 10, bold: true };
  ws.getCell('G13').alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell('G13').border = BORDER_BOTTOM_ONLY;

  // Tabla derecha superior: DOMICILIO y SUCURSALES NUEVAS (I3:J16)
  ws.mergeCells('I3:J3');
  ws.getCell('I3').value = 'DOMICILIO';
  ws.getCell('I3').font = { name: FONT_NAME, size: 9, bold: true, color: { argb: 'FF0000FF' } };
  ws.getCell('I3').fill = FILL_SECTION_BLUE;
  ws.getCell('I3').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('I3').border = BORDER_THIN;
  ws.getCell('J3').border = BORDER_THIN;

  ws.getCell('I4').value = 'DIRECCION:';
  ws.getCell('I4').font = { name: FONT_NAME, size: 8, bold: true, color: { argb: 'FF0000FF' } };
  ws.getCell('I4').fill = FILL_HEADER_LIGHT;
  ws.getCell('I4').border = BORDER_THIN;
  ws.getCell('J4').value = ingeniero.domicilio_direccion || '';
  ws.getCell('J4').font = { name: FONT_NAME, size: 8 };
  ws.getCell('J4').fill = FILL_HEADER_LIGHT;
  ws.getCell('J4').border = BORDER_THIN;

  ws.getCell('I5').value = 'UBICACIÓN';
  ws.getCell('I5').font = { name: FONT_NAME, size: 8, bold: true, color: { argb: 'FF0000FF' } };
  ws.getCell('I5').fill = FILL_HEADER_LIGHT;
  ws.getCell('I5').border = BORDER_THIN;
  if (ingeniero.domicilio_link) {
    ws.getCell('J5').value = {
      text: ingeniero.domicilio_link,
      hyperlink: ingeniero.domicilio_link,
    };
    ws.getCell('J5').font = {
      name: FONT_NAME,
      size: 8,
      color: { argb: 'FF0563C1' },
      underline: true,
    };
  }
  ws.getCell('J5').fill = FILL_HEADER_LIGHT;
  ws.getCell('J5').border = BORDER_THIN;

  ws.mergeCells('I6:J6');
  ws.getCell('I6').value = 'SUCURSALES NUEVAS/PUNTOS';
  ws.getCell('I6').font = { name: FONT_NAME, size: 9, bold: true, color: { argb: 'FF0000FF' } };
  ws.getCell('I6').fill = FILL_SECTION_BLUE;
  ws.getCell('I6').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('I6').border = BORDER_THIN;
  ws.getCell('J6').border = BORDER_THIN;

  ws.getCell('I7').value = 'TIENDA';
  ws.getCell('I7').font = { name: FONT_NAME, size: 8, bold: true, color: { argb: 'FF0000FF' } };
  ws.getCell('I7').fill = FILL_PEACH;
  ws.getCell('I7').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('I7').border = BORDER_THIN;

  ws.getCell('J7').value = 'UBICACIÓN (LINK)';
  ws.getCell('J7').font = { name: FONT_NAME, size: 8, bold: true, color: { argb: 'FF0000FF' } };
  ws.getCell('J7').fill = FILL_PEACH;
  ws.getCell('J7').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('J7').border = BORDER_THIN;

  for (let idx = 0; idx < 9; idx++) {
    const r = 8 + idx;
    const pto = puntosNuevos[idx];
    const cTienda = ws.getCell(r, 9);
    const cLink = ws.getCell(r, 10);
    cTienda.border = BORDER_THIN;
    cLink.border = BORDER_THIN;
    cTienda.font = { name: FONT_NAME, size: 8 };
    cTienda.alignment = { horizontal: 'center', vertical: 'middle' };
    cLink.alignment = { horizontal: 'left', vertical: 'middle' };
    if (pto) {
      cTienda.value = pto.nombre;
      if (pto.link) {
        cLink.value = { text: pto.link, hyperlink: pto.link };
        cLink.font = {
          name: FONT_NAME,
          size: 8,
          color: { argb: 'FF0563C1' },
          underline: true,
        };
      }
    }
  }

  // Tabla Principal: COMBUSTIBLE (B15:G72 — 7 bloques diarios de 8 filas cada uno)
  ws.getRow(15).height = 17;
  ws.mergeCells('B15:G15');
  const combTitle = ws.getCell('B15');
  combTitle.value = 'Combustible';
  combTitle.font = { name: FONT_NAME, size: 10, bold: true };
  combTitle.fill = FILL_SECTION_BLUE;
  combTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 2; c <= 7; c++) ws.getCell(15, c).border = BORDER_THIN;

  ws.getRow(16).height = 16;
  const headersComb = [
    'Fecha',
    'Recorrido 1',
    'Recorrido 2',
    'Km recorridos',
    'Lts Autorizados',
    'Importe Gasolina',
  ];
  headersComb.forEach((h, idx) => {
    const cell = ws.getCell(16, 2 + idx);
    cell.value = h;
    cell.font = { name: FONT_NAME, size: 9, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = BORDER_THIN;
  });

  let totalKmAcumulado = 0;
  let totalLtsAcumulado = 0;
  let totalImpAcumulado = 0;
  const rendNum = Number(rendimiento) || 12.5;
  const costoNum = Number(costoLitro) || 23.99;

  for (let blockIdx = 0; blockIdx < 7; blockIdx++) {
    const startRow = 17 + blockIdx * 8;
    const endRow = startRow + 7;
    const diaData = dias[blockIdx] || null;
    const tramosDia = diaData?.tramos || [];

    ws.mergeCells(startRow, 2, endRow, 2);
    const fechaCell = ws.getCell(startRow, 2);
    fechaCell.value = diaData?.fecha ? formatearFechaBitacora(diaData.fecha) : '';
    fechaCell.font = { name: FONT_NAME, size: 9, bold: true };
    fechaCell.alignment = { horizontal: 'center', vertical: 'middle' };

    for (let offset = 0; offset < 8; offset++) {
      const r = startRow + offset;
      ws.getRow(r).height = 15.5;
      const tramo = tramosDia[offset] || null;

      const cFecha = ws.getCell(r, 2);
      const cRec1 = ws.getCell(r, 3);
      const cRec2 = ws.getCell(r, 4);
      const cKm = ws.getCell(r, 5);
      const cLts = ws.getCell(r, 6);
      const cImp = ws.getCell(r, 7);

      cFecha.border = BORDER_THIN;
      cRec1.border = BORDER_THIN;
      cRec2.border = BORDER_THIN;
      cKm.border = BORDER_THIN;
      cLts.border = BORDER_THIN;
      cImp.border = BORDER_THIN;

      cRec1.font = { name: FONT_NAME, size: 8.5 };
      cRec2.font = { name: FONT_NAME, size: 8.5 };
      cRec1.alignment = { horizontal: 'center', vertical: 'middle' };
      cRec2.alignment = { horizontal: 'center', vertical: 'middle' };

      cKm.font = { name: FONT_NAME, size: 9, bold: true };
      cKm.alignment = { horizontal: 'center', vertical: 'middle' };
      cKm.numFmt = '#,##0';

      cLts.font = { name: FONT_NAME, size: 9, bold: true };
      cLts.alignment = { horizontal: 'center', vertical: 'middle' };
      cLts.numFmt = '0.0';

      cImp.font = { name: FONT_NAME, size: 9, bold: true };
      cImp.alignment = { horizontal: 'right', vertical: 'middle' };
      cImp.numFmt = '"$"#,##0;("$"#,##0);"$" -';

      if (tramo && (tramo.origen || tramo.destino)) {
        const kmVal = Math.round(Number(tramo.km) || 0);
        const ltsVal = kmVal / rendNum;
        const impVal = ltsVal * costoNum;
        totalKmAcumulado += kmVal;
        totalLtsAcumulado += ltsVal;
        totalImpAcumulado += impVal;

        cRec1.value = String(tramo.origen || '').toUpperCase();
        cRec2.value = String(tramo.destino || '').toUpperCase();
        cKm.value = kmVal;
        cLts.value = { formula: `+E${r}/$G$6`, result: ltsVal };
        cImp.value = { formula: `+F${r}*$G$8`, result: impVal };
      } else {
        cRec1.value = '';
        cRec2.value = '';
        cKm.value = null;
        cLts.value = { formula: `+E${r}/$G$6`, result: 0 };
        cImp.value = { formula: `+F${r}*$G$8`, result: 0 };
      }
    }
  }

  // Actualizar odómetro final en cabecera
  ws.getCell('E13').value = { formula: 'C13+E73', result: kmIniNum + totalKmAcumulado };
  ws.getCell('G13').value = { formula: 'E13-C13', result: totalKmAcumulado };

  // 3 Marcos para Fotos
  ws.mergeCells('I18:J18');
  ws.getCell('I18').value = 'FOTOGRAFIA DEL ODOMETRO';
  ws.getCell('I18').font = { name: FONT_NAME, size: 9, bold: true, color: { argb: 'FF0000FF' } };
  ws.getCell('I18').fill = FILL_SECTION_BLUE;
  ws.getCell('I18').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('I18').border = BORDER_THIN;
  ws.getCell('J18').border = BORDER_THIN;

  ws.mergeCells('I19:J30');
  for (let r = 19; r <= 30; r++) {
    for (let c = 9; c <= 10; c++) {
      const cell = ws.getCell(r, c);
      cell.fill = FILL_PEACH;
      cell.border = {
        top: r === 19 ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
        bottom: r === 30 ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
        left: c === 9 ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
        right: c === 10 ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
      };
    }
  }

  ws.mergeCells('I32:J32');
  ws.getCell('I32').value = 'FOTOGRAFIA DEL RENDIMIENTO';
  ws.getCell('I32').font = { name: FONT_NAME, size: 9, bold: true, color: { argb: 'FF0000FF' } };
  ws.getCell('I32').fill = FILL_SECTION_BLUE;
  ws.getCell('I32').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('I32').border = BORDER_THIN;
  ws.getCell('J32').border = BORDER_THIN;

  ws.mergeCells('I33:J44');
  for (let r = 33; r <= 44; r++) {
    for (let c = 9; c <= 10; c++) {
      const cell = ws.getCell(r, c);
      cell.fill = FILL_PEACH;
      cell.border = {
        top: r === 33 ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
        bottom: r === 44 ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
        left: c === 9 ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
        right: c === 10 ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
      };
    }
  }

  ws.mergeCells('L18:M18');
  ws.getCell('L18').value = 'FOTOGRAFIA DEL TICKET';
  ws.getCell('L18').font = { name: FONT_NAME, size: 9, bold: true, color: { argb: 'FF0000FF' } };
  ws.getCell('L18').fill = FILL_SECTION_BLUE;
  ws.getCell('L18').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('L18').border = BORDER_THIN;
  ws.getCell('M18').border = BORDER_THIN;

  ws.mergeCells('L19:M48');
  for (let r = 19; r <= 48; r++) {
    for (let c = 12; c <= 13; c++) {
      const cell = ws.getCell(r, c);
      cell.fill = FILL_TICKET;
      cell.border = {
        top: r === 19 ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
        bottom: r === 48 ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
        left: c === 12 ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
        right: c === 13 ? { style: 'thin', color: { argb: 'FF000000' } } : undefined,
      };
    }
  }

  // Fila 73: Total
  ws.getRow(73).height = 17;
  ws.mergeCells('B73:D73');
  ws.getCell('B73').value = 'Total ';
  ws.getCell('B73').font = { name: FONT_NAME, size: 10, bold: true };
  ws.getCell('B73').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('B73').fill = FILL_HEADER_LIGHT;
  for (let c = 2; c <= 7; c++) {
    ws.getCell(73, c).border = BORDER_THIN;
    ws.getCell(73, c).fill = FILL_HEADER_LIGHT;
  }

  ws.getCell('E73').value = { formula: 'SUM(E17:E72)', result: totalKmAcumulado };
  ws.getCell('E73').font = { name: FONT_NAME, size: 10, bold: true };
  ws.getCell('E73').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('E73').numFmt = '#,##0';

  ws.getCell('F73').value = { formula: 'SUM(F17:F72)', result: totalLtsAcumulado };
  ws.getCell('F73').font = { name: FONT_NAME, size: 10, bold: true };
  ws.getCell('F73').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell('F73').numFmt = '0.00';

  ws.getCell('G73').value = { formula: 'SUM(G17:G72)', result: totalImpAcumulado };
  ws.getCell('G73').font = { name: FONT_NAME, size: 10, bold: true };
  ws.getCell('G73').alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell('G73').numFmt = '"$"#,##0.00';

  // Fila 74: DISPERSION y Fila 75: COMPLEMENTOS
  const filasResumen = [
    { row: 74, label: 'DISPERSION', val: Number(dispersion) || 0 },
    { row: 75, label: 'COMPLEMENTOS', val: Number(complementos) || 0 },
  ];
  filasResumen.forEach(({ row, label, val }) => {
    ws.getRow(row).height = 16;
    ws.getCell(row, 6).value = label;
    ws.getCell(row, 6).font = { name: FONT_NAME, size: 9, bold: true };
    ws.getCell(row, 6).alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getCell(row, 6).border = BORDER_THIN;

    ws.getCell(row, 7).value = val || null;
    ws.getCell(row, 7).font = { name: FONT_NAME, size: 9, bold: true };
    ws.getCell(row, 7).alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getCell(row, 7).numFmt = '"$"#,##0.00;("$"#,##0.00);"$" -';
    ws.getCell(row, 7).border = BORDER_THIN;
  });

  // Fila 76: SALDO A FAVOR (solo en comprobación)
  ws.getRow(76).height = 16;
  if (nombreHoja === 'COMPROBACION') {
    ws.getCell('F76').value = 'SALDO A FAVOR';
    ws.getCell('F76').font = { name: FONT_NAME, size: 9, bold: true };
    ws.getCell('F76').alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getCell('F76').border = BORDER_THIN;

    const saldoRes = totalImpAcumulado - (Number(dispersion) || 0) - (Number(complementos) || 0);
    ws.getCell('G76').value = { formula: '+G73-G74-G75', result: saldoRes };
    ws.getCell('G76').font = { name: FONT_NAME, size: 9, bold: true };
    ws.getCell('G76').alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getCell('G76').numFmt = '"$"#,##0.00;("$"#,##0.00);"$" -';
    ws.getCell('G76').border = BORDER_THIN;
  }

  // Bloque Observaciones (B80:G84)
  ws.getRow(80).height = 16;
  ws.mergeCells('B80:G80');
  ws.getCell('B80').value = 'Observaciones';
  ws.getCell('B80').font = { name: FONT_NAME, size: 10, bold: true };
  ws.getCell('B80').fill = FILL_SECTION_BLUE;
  ws.getCell('B80').alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 2; c <= 7; c++) ws.getCell(80, c).border = BORDER_THIN;

  ws.getRow(81).height = 15;
  ws.mergeCells('B81:G81');
  ws.getCell('B81').value = '* DATO OBLIGATORIO';
  ws.getCell('B81').font = { name: FONT_NAME, size: 8.5, bold: true, color: { argb: 'FFFF0000' } };
  ws.getCell('B81').alignment = { horizontal: 'center', vertical: 'middle' };
  for (let c = 2; c <= 7; c++) ws.getCell(81, c).border = BORDER_THIN;

  ws.mergeCells('B82:G84');
  const obsCell = ws.getCell('B82');
  obsCell.value = (
    observaciones ||
    (nombreHoja === 'ANTICIPO'
      ? `ANTICIPO PARA LA SEMANA ${semana} SE REALIZARAN MANTENIMIENTOS PREVENTIVOS Y ATENCIÓN A SUCURSALES EN REGIÓN ${ingeniero.region || 'TUXTLA'}.`
      : `COMPROBACION DE RUTA SEMANA ${semana} POR MANTENIMIENTOS PREVENTIVOS Y ATENCIÓN A SUCURSALES EN REGIÓN ${ingeniero.region || 'TUXTLA'}.`)
  ).toUpperCase();
  obsCell.font = { name: FONT_NAME, size: 9 };
  obsCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  for (let r = 82; r <= 84; r++) {
    ws.getRow(r).height = 16;
    for (let c = 2; c <= 7; c++) {
      ws.getCell(r, c).border = BORDER_THIN;
    }
  }

  return { totalKmAcumulado, totalImpAcumulado };
}

/**
 * Genera el libro Excel de Bitácora Oficial Tiendas Neto (`.xlsx`).
 * Puede incluir las pestañas `COMPROBACION`, `ANTICIPO` o ambas dentro del mismo archivo.
 */
export async function descargarBitacoraNetoExcel({
  modo = 'ambas', // 'ambas' | 'comprobacion' | 'anticipo'
  ingeniero = {},
  semana = 44,
  kmInicial = 0,
  rendimiento = 12.5,
  costoLitro = 23.99,
  dispersion = 0,
  complementos = 0,
  observaciones = '',
  observacionesAnticipo = '',
  observacionesComprobacion = '',
  dias = [],
  diasAnticipo = [],
  diasComprobacion = [],
  puntosNuevos = [],
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Rutas Sureste - Tiendas Neto';
  wb.created = new Date();

  const logoBuffer = await cargarImagenBuffer('/logo-neto.png');
  let logoImageId = null;
  if (logoBuffer) {
    logoImageId = wb.addImage({
      buffer: logoBuffer,
      extension: 'png',
    });
  }

  const listaDiasAnticipo = diasAnticipo.length ? diasAnticipo : dias;
  const listaDiasComprobacion = diasComprobacion.length ? diasComprobacion : dias;

  // Si el modo es 'ambas', se crean ambas hojas en el mismo archivo
  if (modo === 'ambas' || modo === 'comprobacion') {
    const wsComp = wb.addWorksheet('COMPROBACION');
    construirHojaBitacora(wsComp, {
      nombreHoja: 'COMPROBACION',
      ingeniero,
      semana,
      kmInicial,
      rendimiento,
      costoLitro,
      dispersion,
      complementos,
      observaciones: observacionesComprobacion || observaciones,
      dias: listaDiasComprobacion,
      puntosNuevos,
      logoImageId,
    });
  }

  if (modo === 'ambas' || modo === 'anticipo') {
    const wsAnt = wb.addWorksheet('ANTICIPO');
    construirHojaBitacora(wsAnt, {
      nombreHoja: 'ANTICIPO',
      ingeniero,
      semana,
      kmInicial,
      rendimiento,
      costoLitro,
      dispersion,
      complementos,
      observaciones: observacionesAnticipo || observaciones,
      dias: listaDiasAnticipo,
      puntosNuevos,
      logoImageId,
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const nombreIngLimpio = (ingeniero.nombre || 'INGENIERO')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/gi, '');
  const etiquetaModo =
    modo === 'ambas' ? 'anticipo_y_comprobacion' : modo;
  const filename = `${nombreIngLimpio}_semana_${semana}_${etiquetaModo}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return filename;
}
