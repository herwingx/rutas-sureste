/**
 * @fileoverview Configuración de navegación de la aplicación (agnóstica al módulo).
 *
 * Hoy la plataforma solo tiene el módulo «Rutas». Cuando se agreguen módulos ERP
 * (inventarios, gastos, activos…) cada módulo declarará sus propias vistas aquí o en su
 * carpeta `src/features/<modulo>/nav.js`, y el shell (`App.jsx`) solo renderiza la lista.
 *
 * Reglas de navegación móvil (≤ 5 destinos, etiquetas visibles, destino activo con
 * `aria-current`) viven en `BottomNav.jsx`.
 */

import { Path, MapTrifold, Storefront, ClockCounterClockwise, ShieldCheck } from '@phosphor-icons/react';

/**
 * @typedef {Object} NavItem
 * @property {string} id                Identificador de vista (`tab` de App) o `mapa` (solo móvil).
 * @property {string} label             Etiqueta corta visible.
 * @property {import('react').ElementType} icon
 * @property {boolean} [adminOnly]      Solo visible para el administrador.
 * @property {boolean} [mobileOnly]     Solo se muestra en la barra inferior móvil.
 */

/** @type {NavItem[]} */
export const NAV_ITEMS = [
  { id: 'ruta', label: 'Ruta', icon: Path },
  { id: 'mapa', label: 'Mapa', icon: MapTrifold, mobileOnly: true },
  { id: 'corregir', label: 'Catálogo', icon: Storefront },
  { id: 'historial', label: 'Historial', icon: ClockCounterClockwise },
  { id: 'admin', label: 'Admin', icon: ShieldCheck, adminOnly: true },
];

/** Devuelve los elementos visibles según rol y formato de pantalla. */
export function navVisible({ isAdmin, mobile }) {
  return NAV_ITEMS.filter((i) => (!i.adminOnly || isAdmin) && (mobile || !i.mobileOnly));
}
