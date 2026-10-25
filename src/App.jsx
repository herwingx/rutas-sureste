/**
 * @fileoverview Contenedor Raíz de la Aplicación (`App.jsx` — Rutas Sureste).
 *
 * Responsabilidades principales:
 * - Orquesta el estado global entre los 3 módulos principales:
 *   1. `RouteBuilderTab` (Armar Ruta, matriz de costos y exportación TSV).
 *   2. `CoordinateAuditTab` (Catálogo y Auditoría GPS de sucursales).
 *   3. `HistoryAnalyticsTab` (Historial de bitácoras y KPIs).
 * - Sincroniza el lienzo cartográfico interactivo (`MapCanvas`) con la pestaña activa.
 * - Administra la persistencia local de ajustes operativos (`localStorage`: rendimiento km/L,
 *   precio del litro, casetas, tipo de combustible, almacén CEDIS y preferencia de retorno).
 * - Gestiona el historial de deshacer (`Ctrl+Z`), atajos globales de teclado (`?`, `Ctrl+K`,
 *   `Alt+1/2/3`, `Esc`) y conmutación de tema Claro / Oscuro.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Path,
  Storefront,
  ClockCounterClockwise,
  SlidersHorizontal,
  SunDim,
  MoonStars,
  Keyboard,
  CheckCircle,
  WarningCircle,
  FileXls,
} from '@phosphor-icons/react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Kbd } from '@/components/ui/kbd';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { TooltipProvider, ActionTooltip } from '@/components/ui/tooltip';
import {
  TypographyH4,
  TypographySmall,
  TypographyMuted,
} from '@/components/ui/typography';
import { RouteBuilderTab } from '@/components/RouteBuilderTab';
import { CoordinateAuditTab } from '@/components/CoordinateAuditTab';
import { HistoryAnalyticsTab } from '@/components/HistoryAnalyticsTab';
import { BitacoraGeneratorModal } from '@/components/BitacoraGeneratorModal';
import { AuthModal } from '@/components/AuthModal';
import { NewStoreModal } from '@/components/NewStoreModal';
import { MapCanvas } from '@/components/MapCanvas';
import { supabase } from '@/lib/supabase';
import { BRAND, INGENIEROS } from '@/lib/brand';
import {
  cn,
  hoy,
  fechaMX,
  fechaLarga,
  pesos,
  duracion,
  parseCoords,
  coordsLocales,
  api,
} from '@/lib/utils';

/**
 * Valores iniciales por defecto para los parámetros de cálculo de costos operativos.
 */
const AJUSTES_DEF = {
  kmPorLitro: 12.5,
  precioLitro: 23.99,
  base: '',
  separador: 'tab',
  incluirFecha: false,
  incluirTotal: false,
};

function rutaVacia() {
  return {
    id: null,
    fecha: hoy(),
    nombre: '',
    paradas: [],
    baseInicio: true,
    baseFin: true,
  };
}

export default function App() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('ruteo.theme');
    if (saved) return saved === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('ruteo.theme', dark ? 'dark' : 'light');
  }, [dark]);

  const [mapsKey, setMapsKey] = useState('');
  const [tiendasRaw, setTiendasRaw] = useState([]);
  const [ingenieros, setIngenieros] = useState([]);
  const [ingenieroActivo, setIngenieroActivo] = useState(
    () => localStorage.getItem('ruteo.ingeniero') || INGENIEROS[0]
  );
  const [historial, setHistorial] = useState([]);
  const [motor, setMotor] = useState(null);
  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const [userSession, setUserSession] = useState(null);
  const [tab, setTab] = useState('ruta');
  const [bitacoraOpen, setBitacoraOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [newStoreModalOpen, setNewStoreModalOpen] = useState(false);

  const [ajustes, setAjustes] = useState(() => ({
    ...AJUSTES_DEF,
    ...JSON.parse(localStorage.getItem('ruteo.ajustes') || '{}'),
  }));

  const [ruta, setRuta] = useState(() => {
    try {
      return { ...rutaVacia(), ...JSON.parse(localStorage.getItem('ruteo.borrador') || 'null') };
    } catch {
      return rutaVacia();
    }
  });

  const [undoStack, setUndoStack] = useState([]);
  const [tramos, setTramos] = useState([]);
  const [calculando, setCalculando] = useState(false);

  const [sel, setSel] = useState(null);
  const [autoSaveOnPaste, setAutoSaveOnPaste] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [detourDialog, setDetourDialog] = useState({
    open: false,
    lat: null,
    lng: null,
    nombre: 'DESVÍO',
  });
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: '',
    description: '',
    confirmLabel: 'Confirmar',
    destructive: false,
    onConfirm: null,
  });

  const [toastState, setToastState] = useState(null);
  const toastTimer = useRef(null);
  const searchInputRef = useRef(null);

  const toast = useCallback((msg, tipo = 'ok') => {
    setToastState({ msg, tipo });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastState(null), tipo === 'err' ? 4200 : 2400);
  }, []);

  const tiendas = useMemo(
    () => tiendasRaw.map((t) => ({ ...t, ...parseCoords(t.coords) })),
    [tiendasRaw]
  );
  const porNombre = useMemo(() => new Map(tiendas.map((t) => [t.nombre, t])), [tiendas]);

  useEffect(() => {
    if (!tiendas.length) return;
    if (!ajustes.base || !porNombre.has(ajustes.base)) {
      const def = (tiendas.find((t) => t.nombre.includes('RESGUARDO')) || tiendas[0])?.nombre || '';
      setAjustes((a) => ({ ...a, base: def }));
    }
  }, [tiendas, porNombre, ajustes.base]);

  useEffect(() => {
    localStorage.setItem('ruteo.ajustes', JSON.stringify(ajustes));
  }, [ajustes]);

  useEffect(() => {
    localStorage.setItem('ruteo.borrador', JSON.stringify(ruta));
  }, [ruta]);

  useEffect(() => {
    localStorage.setItem('ruteo.ingeniero', ingenieroActivo);
  }, [ingenieroActivo]);

  // Escuchar sesión de Supabase Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserSession(session?.user || null);
      if (session?.user?.email) {
        setSupabaseConnected(true);
        // Si el usuario logueado es Herwing, fijar su ingeniero
        if (session.user.email.includes('herwing')) {
          setIngenieroActivo('HERWING EDUARDO VAZQUEZ MACIAS');
        }
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserSession(session?.user || null);
      if (session?.user?.email?.includes('herwing')) {
        setIngenieroActivo('HERWING EDUARDO VAZQUEZ MACIAS');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    Promise.all([
      api('GET', '/api/config'),
      api('GET', '/api/tiendas'),
      api('GET', '/api/historial'),
      api('GET', '/api/ingenieros').catch(() => []),
    ])
      .then(([cfg, tList, hList, ingList]) => {
        setMapsKey(cfg.mapsKey || '');
        setMotor(cfg.motor);
        setSupabaseConnected(Boolean(cfg.supabase));
        setTiendasRaw(tList);
        setHistorial(hList);
        if (ingList?.length) setIngenieros(ingList);
        if (!localStorage.getItem('ruteo.ajustes')) {
          setAjustes((a) => ({
            ...a,
            kmPorLitro: cfg.kmPorLitro || 12.5,
            precioLitro: cfg.precioLitro || 23.99,
          }));
        }
      })
      .catch((e) => toast('Error iniciando: ' + e.message, 'err'));
  }, [toast]);

  useEffect(() => {
    if (!porNombre.size) return;
    setRuta((r) => ({
      ...r,
      paradas: r.paradas.map((p) => {
        if (p.temporal) return p;
        const t = porNombre.get(p.nombre);
        return t ? { nombre: t.nombre, lat: t.lat, lng: t.lng } : { ...p, perdida: true };
      }),
    }));
  }, [porNombre]);

  const baseTienda = useMemo(() => porNombre.get(ajustes.base) || null, [porNombre, ajustes.base]);

  const puntosRuta = useMemo(() => {
    const pts = [];
    if (ruta.baseInicio && baseTienda) {
      pts.push({ nombre: baseTienda.nombre, lat: baseTienda.lat, lng: baseTienda.lng, tipo: 'base' });
    }
    ruta.paradas.forEach((p, idx) => pts.push({ ...p, tipo: 'parada', idx }));
    if (ruta.baseFin && baseTienda && (ruta.paradas.length > 0 || !ruta.baseInicio)) {
      pts.push({ nombre: baseTienda.nombre, lat: baseTienda.lat, lng: baseTienda.lng, tipo: 'base' });
    }
    return pts;
  }, [ruta, baseTienda]);

  const calcSeq = useRef(0);
  useEffect(() => {
    if (puntosRuta.length < 2) {
      setTramos([]);
      setCalculando(false);
      return;
    }
    const seq = ++calcSeq.current;
    setCalculando(true);
    const timer = setTimeout(() => {
      api('POST', '/api/ruta', {
        puntos: puntosRuta.map((p) => ({ lat: p.lat, lng: p.lng })),
      })
        .then((res) => {
          if (seq !== calcSeq.current) return;
          setTramos(res.tramos || []);
          if (res.motor) setMotor(res.motor);
        })
        .catch((e) => {
          if (seq === calcSeq.current) toast('Error calculando tramos: ' + e.message, 'err');
        })
        .finally(() => {
          if (seq === calcSeq.current) setCalculando(false);
        });
    }, 90);
    return () => clearTimeout(timer);
  }, [puntosRuta, toast]);

  const totales = useMemo(() => {
    const km = tramos.reduce((s, t) => s + (t.km || 0), 0);
    const seg = tramos.reduce((s, t) => s + (t.segundos || 0), 0);
    const litros = km / (Number(ajustes.kmPorLitro) || 12.5);
    const costo = litros * (Number(ajustes.precioLitro) || 23.99);
    return { km, seg, litros, costo };
  }, [tramos, ajustes.kmPorLitro, ajustes.precioLitro]);

  const filasExcel = useMemo(() => {
    const filas = [];
    for (let i = 0; i < puntosRuta.length - 1; i++) {
      const t = tramos[i];
      const fila = [puntosRuta[i].nombre, puntosRuta[i + 1].nombre, t ? t.km : '…'];
      if (ajustes.incluirFecha) fila.unshift(fechaMX(ruta.fecha));
      filas.push(fila);
    }
    if (ajustes.incluirTotal && filas.length > 0) {
      const fila = ['TOTAL', '', totales.km];
      if (ajustes.incluirFecha) fila.unshift('');
      filas.push(fila);
    }
    return filas;
  }, [puntosRuta, tramos, ajustes.incluirFecha, ajustes.incluirTotal, ruta.fecha, totales.km]);

  const mutarRuta = useCallback((updater) => {
    setRuta((prev) => {
      setUndoStack((u) => [...u.slice(-60), prev]);
      return typeof updater === 'function' ? updater(prev) : updater;
    });
  }, []);

  const deshacer = useCallback(() => {
    setUndoStack((u) => {
      if (!u.length) {
        toast('Nada que deshacer');
        return u;
      }
      const last = u[u.length - 1];
      setRuta(last);
      toast('Cambio deshecho');
      return u.slice(0, -1);
    });
  }, [toast]);

  const agregarTienda = useCallback(
    (t) => {
      if (!t) return;
      mutarRuta((r) => ({
        ...r,
        paradas: [...r.paradas, { nombre: t.nombre, lat: t.lat, lng: t.lng }],
      }));
      toast(`${t.nombre} agregada`);
    },
    [mutarRuta, toast]
  );

  const agregarLoteTiendas = useCallback(
    (lista) => {
      if (!lista?.length) return;
      mutarRuta((r) => ({
        ...r,
        paradas: [
          ...r.paradas,
          ...lista.map((t) => ({ nombre: t.nombre, lat: t.lat, lng: t.lng })),
        ],
      }));
      toast(`${lista.length} tiendas agregadas`);
    },
    [mutarRuta, toast]
  );

  const toggleParadaMapa = useCallback(
    (nombre) => {
      const t = porNombre.get(nombre);
      if (!t) return;
      const idx = ruta.paradas.findIndex((p) => p.nombre === nombre && !p.temporal);
      if (idx >= 0) {
        mutarRuta((r) => ({
          ...r,
          paradas: r.paradas.filter((_, i) => i !== idx),
        }));
        toast(`${nombre} quitada`);
      } else {
        agregarTienda(t);
      }
    },
    [porNombre, ruta.paradas, mutarRuta, agregarTienda, toast]
  );

  const agregarDesvio = useCallback(
    async (textoOCoords) => {
      try {
        const c =
          typeof textoOCoords === 'string'
            ? coordsLocales(textoOCoords) || (await api('POST', '/api/coords', { texto: textoOCoords }))
            : textoOCoords;
        setDetourDialog({ open: true, lat: c.lat, lng: c.lng, nombre: 'DESVÍO' });
      } catch (e) {
        toast(e.message, 'err');
      }
    },
    [toast]
  );

  const confirmarDesvio = useCallback(() => {
    const nombre = (detourDialog.nombre || '').trim().toUpperCase();
    if (!nombre || detourDialog.lat == null) return;
    mutarRuta((r) => ({
      ...r,
      paradas: [
        ...r.paradas,
        { nombre, lat: detourDialog.lat, lng: detourDialog.lng, temporal: true },
      ],
    }));
    setDetourDialog({ open: false, lat: null, lng: null, nombre: 'DESVÍO' });
    toast(`Desvío agregado: ${nombre}`);
  }, [detourDialog, mutarRuta, toast]);

  const optimizarRuta = useCallback(async () => {
    if (ruta.paradas.length < 3) return toast('Agrega al menos 3 paradas para optimizar');
    const origen = ruta.baseInicio && baseTienda ? { lat: baseTienda.lat, lng: baseTienda.lng } : null;
    const destino = ruta.baseFin && baseTienda ? { lat: baseTienda.lat, lng: baseTienda.lng } : null;
    try {
      const { orden } = await api('POST', '/api/optimizar', {
        origen,
        destino,
        paradas: ruta.paradas,
      });
      mutarRuta((r) => ({
        ...r,
        paradas: orden.map((i) => r.paradas[i]),
      }));
      toast('Orden optimizado');
    } catch (e) {
      toast(e.message, 'err');
    }
  }, [ruta, baseTienda, mutarRuta, toast]);

  const copiarExcel = useCallback(async () => {
    if (!filasExcel.length) return toast('Agrega al menos una parada');
    const sep = ajustes.separador === 'coma' ? ',' : '\t';
    const texto = filasExcel.map((f) => f.join(sep)).join('\n');
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: texto });
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(`Copiado: ${filasExcel.length} filas, ${totales.km} km`);
  }, [filasExcel, ajustes.separador, totales, toast]);

  const copiarWhatsApp = useCallback(async () => {
    if (!puntosRuta.length) return;
    const linkMaps =
      'https://www.google.com/maps/dir/' + puntosRuta.map((p) => `${p.lat},${p.lng}`).join('/');
    const resumen = [
      `*Ruta ${fechaMX(ruta.fecha)}*${ruta.nombre ? ` · ${ruta.nombre}` : ''}`,
      `Recorrido: ${puntosRuta.map((p) => p.nombre).join(' → ')}`,
      `Distancia: ${totales.km} km (${duracion(totales.seg)})`,
      `Combustible estimado: ${pesos(totales.costo)} (${totales.litros.toFixed(1)} L)`,
      `Mapa: ${linkMaps}`,
    ].join('\n');
    await navigator.clipboard.writeText(resumen);
    toast('Resumen copiado');
  }, [puntosRuta, ruta.fecha, ruta.nombre, totales, toast]);

  const guardarDia = useCallback(async () => {
    if (!ruta.paradas.length) return toast('La ruta está vacía');
    try {
      const item = await api('POST', '/api/historial', {
        id: ruta.id,
        fecha: ruta.fecha,
        nombre: ruta.nombre,
        ingeniero: ingenieroActivo,
        baseNombre: ajustes.base,
        paradas: ruta.paradas,
        tramos,
        baseInicio: ruta.baseInicio,
        baseFin: ruta.baseFin,
        totalKm: totales.km,
        litros: Math.round(totales.litros * 100) / 100,
        segundos: totales.seg,
        costo: Math.round(totales.costo * 100) / 100,
      });
      setRuta((r) => ({ ...r, id: item.id }));
      const hList = await api('GET', '/api/historial');
      setHistorial(hList);
      toast(`Ruta guardada: ${fechaLarga(ruta.fecha)}`);
    } catch (e) {
      toast(e.message, 'err');
    }
  }, [ruta, tramos, totales, ingenieroActivo, ajustes.base, toast]);

  const nuevaRuta = useCallback(() => {
    const limpiar = () => {
      mutarRuta(rutaVacia());
      setTimeout(() => searchInputRef.current?.focus(), 40);
    };
    if (ruta.paradas.length && !ruta.id) {
      setConfirmDialog({
        open: true,
        title: '¿Empezar una ruta nueva?',
        description:
          'Tienes paradas en curso sin guardar en el historial. Puedes limpiar la ruta actual o cancelar para guardarla primero.',
        confirmLabel: 'Limpiar y empezar nueva',
        destructive: false,
        onConfirm: limpiar,
      });
      return;
    }
    limpiar();
  }, [ruta.paradas.length, ruta.id, mutarRuta]);

  // ================= ACCIONES DE CATÁLOGO Y COORDENADAS =================
  const seleccionarTiendaAudit = useCallback(
    (nombre) => {
      const t = porNombre.get(nombre);
      if (!t) return;
      setSel({
        nombre: t.nombre,
        nombreEdit: t.nombre,
        estado: t.estado || 'Chiapas',
        eco: t.eco || '0',
        ceco: t.ceco || '0',
        zona: t.zona || '',
        ingeniero: t.ingeniero || '',
        verificada: Boolean(t.verificada),
        desbloqueada: false,
        lat: t.lat,
        lng: t.lng,
        orig: { lat: t.lat, lng: t.lng },
      });
    },
    [porNombre]
  );

  const siguientePendiente = useCallback(
    (despuesDe) => {
      const pend = tiendas.filter((t) => !t.verificada);
      if (!pend.length) {
        setSel(null);
        return toast('No hay tiendas pendientes de revisión');
      }
      const ref = despuesDe !== undefined ? despuesDe : sel?.nombre || '';
      const sig = pend.find((t) => t.nombre.localeCompare(ref, 'es') > 0) || pend[0];
      seleccionarTiendaAudit(sig.nombre);
    },
    [tiendas, sel?.nombre, seleccionarTiendaAudit, toast]
  );

  const guardarSeleccionAudit = useCallback(
    async (overrideCoords = null) => {
      const actual = overrideCoords ? { ...sel, ...overrideCoords } : sel;
      if (!actual) return;
      if (actual.lat == null)
        return toast('Primero ubica la tienda en el mapa o pega sus coordenadas', 'err');
      const nombreNuevo = (actual.nombreEdit ?? actual.nombre ?? '').trim();
      const estadoFinal = (actual.estado || 'Chiapas').trim();
      try {
        let nuevaLista;
        if (actual.nueva) {
          if (!nombreNuevo) return toast('Escribe el nombre de la nueva tienda', 'err');
          nuevaLista = await api('POST', '/api/tiendas', {
            nombre: nombreNuevo,
            estado: estadoFinal,
            lat: actual.lat,
            lng: actual.lng,
            verificada: true,
          });
          toast(`Tienda creada: ${nombreNuevo.toUpperCase()}`);
        } else {
          nuevaLista = await api('PATCH', '/api/tiendas', {
            nombreOriginal: actual.nombre,
            nombre: nombreNuevo || actual.nombre,
            estado: estadoFinal,
            lat: actual.lat,
            lng: actual.lng,
            verificada: true,
          });
          toast(`${nombreNuevo || actual.nombre} actualizada`);
        }
        setTiendasRaw(nuevaLista);
        setSel(null);
      } catch (e) {
        toast(e.message, 'err');
      }
    },
    [sel, toast]
  );

  const aplicarTextoCoordsAudit = useCallback(
    async (texto, { desdePegar = false } = {}) => {
      if (!sel || !String(texto || '').trim()) return;
      try {
        const c = coordsLocales(texto) || (await api('POST', '/api/coords', { texto }));
        setSel((prev) => (prev ? { ...prev, lat: c.lat, lng: c.lng } : prev));
        if (desdePegar && autoSaveOnPaste && (!sel.nueva || (sel.nombreEdit || '').trim())) {
          await guardarSeleccionAudit({ lat: c.lat, lng: c.lng });
        } else {
          toast('Ubicación detectada. Presiona Enter para guardar');
        }
      } catch (e) {
        toast(e.message, 'err');
      }
    },
    [sel, autoSaveOnPaste, guardarSeleccionAudit, toast]
  );

  const patchTiendaSimple = useCallback(
    async (cambios, mensaje) => {
      if (!sel) return;
      try {
        const nuevaLista = await api('PATCH', '/api/tiendas', {
          nombreOriginal: sel.nombre,
          ...cambios,
        });
        setTiendasRaw(nuevaLista);
        toast(mensaje);
      } catch (e) {
        toast(e.message, 'err');
      }
    },
    [sel, toast]
  );

  const eliminarSeleccionAudit = useCallback(() => {
    if (!sel || sel.nueva) return;
    const nombreEliminar = sel.nombre;
    setConfirmDialog({
      open: true,
      title: `¿Eliminar "${nombreEliminar}"?`,
      description:
        'La tienda se eliminará del catálogo activo. Se conserva un respaldo automático en data/backups.',
      confirmLabel: 'Eliminar tienda',
      destructive: true,
      onConfirm: async () => {
        try {
          const nuevaLista = await api('DELETE', '/api/tiendas', { nombre: nombreEliminar });
          setTiendasRaw(nuevaLista);
          setSel(null);
          toast('Tienda eliminada');
        } catch (e) {
          toast(e.message, 'err');
        }
      },
    });
  }, [sel, toast]);

  const exportarJson = useCallback(() => {
    try {
      const dataStr = JSON.stringify(tiendasRaw, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tiendas-sureste-${hoy()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`Respaldo descargado: ${tiendasRaw.length} tiendas`);
    } catch (e) {
      toast('Error descargando JSON: ' + e.message, 'err');
    }
  }, [tiendasRaw, toast]);

  useEffect(() => {
    const onPaste = (e) => {
      const enCampo =
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;
      if (tab !== 'corregir' || !sel || enCampo) return;
      e.preventDefault();
      aplicarTextoCoordsAudit(e.clipboardData.getData('text'), { desdePegar: true });
    };

    const onKeyDown = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const enCampo =
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;

      if (e.altKey && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault();
        setTab(['ruta', 'corregir', 'historial'][Number(e.key) - 1]);
        return;
      }
      if (mod && e.key === 'Enter' && tab === 'ruta') {
        e.preventDefault();
        copiarExcel();
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (tab === 'corregir') guardarSeleccionAudit();
        else guardarDia();
        return;
      }
      if (mod && e.key.toLowerCase() === 'z' && tab === 'ruta' && !(enCampo && e.target.value)) {
        e.preventDefault();
        deshacer();
        return;
      }
      if (e.altKey && e.key.toLowerCase() === 'o' && tab === 'ruta') {
        e.preventDefault();
        optimizarRuta();
        return;
      }
      if (!enCampo && (e.key === '/' || (mod && e.key.toLowerCase() === 'k'))) {
        e.preventDefault();
        setTab('ruta');
        setTimeout(() => searchInputRef.current?.focus(), 20);
        return;
      }
      if (!enCampo && tab === 'corregir') {
        if (e.key === 'Enter' && sel) {
          e.preventDefault();
          guardarSeleccionAudit();
        } else if (e.key.toLowerCase() === 'n') {
          e.preventDefault();
          siguientePendiente();
        } else if (e.key === 'Escape') {
          setSel(null);
        }
      }
    };

    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    tab,
    sel,
    aplicarTextoCoordsAudit,
    copiarExcel,
    guardarSeleccionAudit,
    guardarDia,
    deshacer,
    optimizarRuta,
    siguientePendiente,
  ]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid h-screen w-screen grid-cols-1 lg:grid-cols-[460px_1fr] bg-background text-foreground overflow-hidden">
        {/* ================= PANEL LATERAL ================= */}
        <aside className="flex h-full flex-col border-r border-border bg-card min-h-0">
          {/* Cabecera */}
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <BrandLogo className="h-7 w-7 shadow-xs" />
              <div className="min-w-0">
                <TypographyH4 className="text-sm font-semibold tracking-tight leading-none">
                  {BRAND.nombre}
                </TypographyH4>
                <TypographyMuted className="text-[11px] truncate mt-0.5">
                  Base: {ajustes.base || 'RESGUARDO'}
                </TypographyMuted>
              </div>
            </div>

            <div className="flex items-center gap-0.5">
              {userSession ? (
                <ActionTooltip label={`Conectado como ${userSession.email}`}>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={async () => {
                      await supabase.auth.signOut();
                      setUserSession(null);
                      toast('Sesión cerrada');
                    }}
                    className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 gap-1 h-7 px-2"
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="truncate max-w-24">
                      {userSession.email.split('@')[0]}
                    </span>
                  </Button>
                </ActionTooltip>
              ) : (
                <ActionTooltip label="Iniciar sesión con @soyneto.com">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setAuthModalOpen(true)}
                    className="text-[11px] font-medium h-7 px-2 border-primary/40 text-primary"
                  >
                    Login Neto
                  </Button>
                </ActionTooltip>
              )}

              <ActionTooltip label="Generar Bitácora Oficial Tiendas Neto (.xlsx)">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-emerald-600 dark:text-emerald-400"
                  onClick={() => setBitacoraOpen(true)}
                >
                  <FileXls weight="duotone" className="h-4 w-4" />
                </Button>
              </ActionTooltip>
              <ActionTooltip label="Atajos de teclado">
                <Button variant="ghost" size="icon-sm" onClick={() => setShortcutsOpen(true)}>
                  <Keyboard weight="duotone" className="h-4 w-4" />
                </Button>
              </ActionTooltip>
              <ActionTooltip label={dark ? 'Modo claro' : 'Modo oscuro'}>
                <Button variant="ghost" size="icon-sm" onClick={() => setDark((d) => !d)}>
                  {dark ? (
                    <SunDim weight="duotone" className="h-4 w-4" />
                  ) : (
                    <MoonStars weight="duotone" className="h-4 w-4" />
                  )}
                </Button>
              </ActionTooltip>
              <ActionTooltip label="Configuración">
                <Button variant="ghost" size="icon-sm" onClick={() => setSettingsOpen(true)}>
                  <SlidersHorizontal weight="duotone" className="h-4 w-4" />
                </Button>
              </ActionTooltip>
            </div>
          </header>

          {/* Navegación principal */}
          <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col min-h-0">
            <div className="px-4 pt-2.5">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="ruta">
                  <Path weight={tab === 'ruta' ? 'duotone' : 'regular'} className="h-3.5 w-3.5" />
                  <span>Ruta</span>
                </TabsTrigger>
                <TabsTrigger value="corregir">
                  <Storefront
                    weight={tab === 'corregir' ? 'duotone' : 'regular'}
                    className="h-3.5 w-3.5"
                  />
                  <span>Catálogo</span>
                </TabsTrigger>
                <TabsTrigger value="historial">
                  <ClockCounterClockwise
                    weight={tab === 'historial' ? 'duotone' : 'regular'}
                    className="h-3.5 w-3.5"
                  />
                  <span>Historial</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
              <TabsContent value="ruta" className="m-0">
                <RouteBuilderTab
                  searchInputRef={searchInputRef}
                  tiendas={tiendas}
                  porNombre={porNombre}
                  baseTienda={baseTienda}
                  ruta={ruta}
                  tramos={tramos}
                  calculando={calculando}
                  totales={totales}
                  filasExcel={filasExcel}
                  onMutateRuta={mutarRuta}
                  onUndo={deshacer}
                  canUndo={undoStack.length > 0}
                  onAddStore={agregarTienda}
                  onAddBatchStores={agregarLoteTiendas}
                  onAddDetour={agregarDesvio}
                  onOptimize={optimizarRuta}
                  onCopyExcel={copiarExcel}
                  onCopyWhatsApp={copiarWhatsApp}
                  onSaveDay={guardarDia}
                  onNewRoute={nuevaRuta}
                  onJumpToAudit={(nombre) => {
                    setTab('corregir');
                    seleccionarTiendaAudit(nombre);
                  }}
                  onOpenBitacora={() => setBitacoraOpen(true)}
                />
              </TabsContent>

              <TabsContent value="corregir" className="m-0">
                <CoordinateAuditTab
                  tiendas={tiendas}
                  porNombre={porNombre}
                  sel={sel}
                  autoSaveOnPaste={autoSaveOnPaste}
                  onToggleAutoSaveOnPaste={setAutoSaveOnPaste}
                  onSelectStore={seleccionarTiendaAudit}
                  onOpenNewStoreModal={() => setNewStoreModalOpen(true)}
                  onStartNewStore={() => setNewStoreModalOpen(true)}
                  onUpdateSelectedName={(val) =>
                    setSel((prev) => (prev ? { ...prev, nombreEdit: val } : prev))
                  }
                  onUpdateSelectedState={(estado) =>
                    setSel((prev) => (prev ? { ...prev, estado } : prev))
                  }
                  onUnlockSelected={(desbloqueada) =>
                    setSel((prev) => (prev ? { ...prev, desbloqueada } : prev))
                  }
                  onMoveSelected={(lat, lng) =>
                    setSel((prev) => (prev ? { ...prev, lat, lng } : prev))
                  }
                  onApplyTextCoords={aplicarTextoCoordsAudit}
                  onSaveSelected={guardarSeleccionAudit}
                  onNextPending={siguientePendiente}
                  onPatchStore={patchTiendaSimple}
                  onDeleteSelected={eliminarSeleccionAudit}
                  onExportJson={exportarJson}
                />
              </TabsContent>

              <TabsContent value="historial" className="m-0">
                <HistoryAnalyticsTab
                  historial={historial}
                  onOpenBitacora={() => setBitacoraOpen(true)}
                  onLoadHistory={(h, comoNueva) => {
                    mutarRuta({
                      id: comoNueva ? null : h.id,
                      fecha: comoNueva ? hoy() : h.fecha,
                      nombre: h.nombre || '',
                      paradas: (h.paradas || []).map((p) => {
                        if (p.temporal) return p;
                        const t = porNombre.get(p.nombre);
                        return t ? { nombre: t.nombre, lat: t.lat, lng: t.lng } : p;
                      }),
                      baseInicio: h.baseInicio ?? true,
                      baseFin: h.baseFin ?? true,
                    });
                    setTab('ruta');
                    toast(comoNueva ? 'Ruta cargada con fecha de hoy' : 'Editando ruta guardada');
                  }}
                  onDeleteHistory={(h) => {
                    setConfirmDialog({
                      open: true,
                      title: `¿Borrar la ruta del ${fechaLarga(h.fecha)}?`,
                      description: 'Esta acción eliminará el registro seleccionado del historial de rutas.',
                      confirmLabel: 'Eliminar del historial',
                      destructive: true,
                      onConfirm: async () => {
                        await api('DELETE', '/api/historial', { id: h.id });
                        setHistorial((prev) => prev.filter((x) => x.id !== h.id));
                        toast('Ruta eliminada');
                      },
                    });
                  }}
                />
              </TabsContent>
            </div>
          </Tabs>

          {/* Pie técnico discreto */}
          <footer className="flex items-center justify-between border-t border-border px-4 py-1.5 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    motor?.motor === 'routes' ? 'bg-emerald-500' : 'bg-amber-500'
                  )}
                />
                <span>{motor?.motor === 'routes' ? 'Routes API' : 'Distance Matrix'}</span>
              </div>
              {supabaseConnected && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  · Supabase Sync
                </span>
              )}
            </div>
            <span className="tabular-nums">{motor?.tramosEnCache || 0} tramos en caché</span>
          </footer>
        </aside>

        {/* ================= MAPA ================= */}
        <main className="relative h-full w-full min-h-95">
          <MapCanvas
            mapsKey={mapsKey}
            tiendas={tiendas}
            baseNombre={ajustes.base}
            ruta={ruta}
            puntos={puntosRuta}
            tramos={tramos}
            totales={totales}
            tab={tab}
            sel={sel}
            onToggleStop={toggleParadaMapa}
            onAddDetour={agregarDesvio}
            onSelectStore={seleccionarTiendaAudit}
            onUnlockSelected={(desbloqueada) =>
              setSel((prev) => (prev ? { ...prev, desbloqueada } : prev))
            }
            onMoveSelected={(lat, lng) =>
              setSel((prev) => (prev ? { ...prev, lat, lng } : prev))
            }
            onSaveSelected={guardarSeleccionAudit}
          />
        </main>

        {/* ================= MODAL DE BITÁCORA OFICIAL NETO (.XLSX) ================= */}
        <BitacoraGeneratorModal
          open={bitacoraOpen}
          onOpenChange={setBitacoraOpen}
          ingenieros={ingenieros}
          ingenieroActivo={ingenieroActivo}
          onSelectIngeniero={(nombre) => {
            setIngenieroActivo(nombre);
            const p = ingenieros.find((i) => i.nombre === nombre);
            if (p) {
              setAjustes((a) => ({
                ...a,
                kmPorLitro: Number(p.rendimiento) || a.kmPorLitro,
                precioLitro: Number(p.costo_litro) || a.precioLitro,
                base: p.base_nombre && porNombre.has(p.base_nombre) ? p.base_nombre : a.base,
              }));
            }
          }}
          onSaveIngeniero={(listaNueva, ingGuardado) => {
            setIngenieros(listaNueva);
            if (ingGuardado) {
              setAjustes((a) => ({
                ...a,
                kmPorLitro: Number(ingGuardado.rendimiento) || a.kmPorLitro,
                precioLitro: Number(ingGuardado.costo_litro) || a.precioLitro,
              }));
            }
          }}
          rutaActual={ruta}
          tramosActuales={tramos}
          baseNombre={ajustes.base}
          porNombre={porNombre}
          historial={historial}
          ajustes={ajustes}
          toast={toast}
        />

        {/* ================= MODAL DE LOGIN / REGISTRO NETO ================= */}
        <AuthModal
          open={authModalOpen}
          onOpenChange={setAuthModalOpen}
          onAuthSuccess={(user) => {
            setUserSession(user);
            if (user?.email?.includes('herwing')) {
              setIngenieroActivo('HERWING EDUARDO VAZQUEZ MACIAS');
            }
          }}
          toast={toast}
        />

        {/* ================= MODAL DE REGISTRAR NUEVA TIENDA ================= */}
        <NewStoreModal
          open={newStoreModalOpen}
          onOpenChange={setNewStoreModalOpen}
          onStoreCreated={(nuevaLista) => {
            setTiendasRaw(nuevaLista);
          }}
          toast={toast}
        />

        {/* ================= MODAL DE AJUSTES ================= */}
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Configuración</DialogTitle>
              <DialogDescription>
                Punto base de operación, rendimiento de combustible y formato de salida para Excel.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3.5 py-1">
              <div className="space-y-1.5">
                <Label>Punto base (salida / regreso)</Label>
                <Select
                  value={ajustes.base}
                  onValueChange={(v) => setAjustes((a) => ({ ...a, base: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona tienda base" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiendas.map((t) => (
                      <SelectItem key={t.nombre} value={t.nombre}>
                        {t.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="input-rendimiento">Rendimiento (km / L)</Label>
                  <Input
                    id="input-rendimiento"
                    type="number"
                    step="0.1"
                    value={ajustes.kmPorLitro}
                    onChange={(e) =>
                      setAjustes((a) => ({
                        ...a,
                        kmPorLitro: parseFloat(e.target.value) || 12.5,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="input-precio">Precio combustible ($ MXN / L)</Label>
                  <Input
                    id="input-precio"
                    type="number"
                    step="0.01"
                    value={ajustes.precioLitro}
                    onChange={(e) =>
                      setAjustes((a) => ({
                        ...a,
                        precioLitro: parseFloat(e.target.value) || 23.99,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Separador para Excel</Label>
                <Select
                  value={ajustes.separador}
                  onValueChange={(v) => setAjustes((a) => ({ ...a, separador: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tab">
                      Tabuladores (pegar directo en celdas de Excel / Sheets)
                    </SelectItem>
                    <SelectItem value="coma">
                      Comas CSV (ORIGEN,DESTINO,KM)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Card className="flex items-center justify-between p-3">
                <Label htmlFor="switch-incluir-fecha" className="cursor-pointer">
                  Incluir columna de fecha al inicio
                </Label>
                <Switch
                  id="switch-incluir-fecha"
                  checked={ajustes.incluirFecha}
                  onCheckedChange={(v) => setAjustes((a) => ({ ...a, incluirFecha: v }))}
                />
              </Card>

              <Card className="flex items-center justify-between p-3">
                <Label htmlFor="switch-incluir-total" className="cursor-pointer">
                  Incluir fila de TOTAL al final
                </Label>
                <Switch
                  id="switch-incluir-total"
                  checked={ajustes.incluirTotal}
                  onCheckedChange={(v) => setAjustes((a) => ({ ...a, incluirTotal: v }))}
                />
              </Card>
            </div>
            <DialogFooter>
              <Button onClick={() => setSettingsOpen(false)}>Listo</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ================= MODAL DE DESVÍO TEMPORAL ================= */}
        <Dialog
          open={detourDialog.open}
          onOpenChange={(open) => setDetourDialog((d) => ({ ...d, open }))}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Desvío temporal</DialogTitle>
              <DialogDescription>
                Asigna una etiqueta para identificar este punto en la ruta (ej. HOTEL, CASETA, PROVEEDOR).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-1">
              <Label htmlFor="input-detour-name">Nombre del punto</Label>
              <Input
                id="input-detour-name"
                value={detourDialog.nombre}
                onChange={(e) => setDetourDialog((d) => ({ ...d, nombre: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmarDesvio();
                  }
                }}
                placeholder="Ej. HOTEL VILLAHERMOSA"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setDetourDialog({ open: false, lat: null, lng: null, nombre: 'DESVÍO' })}
              >
                Cancelar
              </Button>
              <Button onClick={confirmarDesvio}>Agregar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ================= MODAL DE CONFIRMACIÓN ================= */}
        <Dialog
          open={confirmDialog.open}
          onOpenChange={(open) => setConfirmDialog((c) => ({ ...c, open }))}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{confirmDialog.title}</DialogTitle>
              <DialogDescription>{confirmDialog.description}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setConfirmDialog((c) => ({ ...c, open: false }))}
              >
                Cancelar
              </Button>
              <Button
                variant={confirmDialog.destructive ? 'destructive' : 'default'}
                onClick={async () => {
                  const fn = confirmDialog.onConfirm;
                  setConfirmDialog((c) => ({ ...c, open: false }));
                  if (fn) await fn();
                }}
              >
                {confirmDialog.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ================= MODAL DE ATAJOS DE TECLADO ================= */}
        <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Atajos de teclado</DialogTitle>
              <DialogDescription>
                Navegación rápida para armado de rutas y edición de catálogo.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-1.5">
              {[
                ['/', 'Enfocar buscador de tiendas'],
                ['Enter', 'Agregar tienda buscada / Guardar coordenada'],
                ['Backspace (en vacío)', 'Quitar la última parada agregada'],
                ['Ctrl + Enter', 'Copiar tabla para Excel'],
                ['Alt + O', 'Optimizar orden de paradas'],
                ['Ctrl + S', 'Guardar ruta en el historial'],
                ['Ctrl + Z', 'Deshacer último cambio'],
                ['Ctrl + V (en Catálogo)', 'Pegar link de Google Maps o coordenadas'],
                ['N (en Catálogo)', 'Saltar a la siguiente tienda pendiente'],
                ['Alt + 1 / 2 / 3', 'Cambiar entre Ruta, Catálogo e Historial'],
              ].map(([k, desc]) => (
                <Card
                  key={k}
                  className="flex items-center justify-between bg-muted/30 px-3 py-1.5"
                >
                  <TypographyMuted className="text-xs">{desc}</TypographyMuted>
                  <Kbd>{k}</Kbd>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* ================= TOAST FLOTANTE ================= */}
        {toastState && (
          <Card
            className={cn(
              'fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg px-3.5 py-2 shadow-lg transition-all',
              toastState.tipo === 'err'
                ? 'border-destructive bg-destructive text-destructive-foreground'
                : 'border-border bg-foreground text-background'
            )}
          >
            {toastState.tipo === 'err' ? (
              <WarningCircle weight="fill" className="h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle weight="fill" className="h-4 w-4 shrink-0 text-emerald-400" />
            )}
            <TypographySmall className="text-current">{toastState.msg}</TypographySmall>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}
