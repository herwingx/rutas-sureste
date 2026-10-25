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
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
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
import { TooltipProvider } from '@/components/ui/tooltip';
import { TypographySmall, TypographyMuted } from '@/components/ui/typography';
import { RouteBuilderTab } from '@/features/rutas/RouteBuilderTab';
import { CoordinateAuditTab } from '@/features/catalogo/CoordinateAuditTab';
import { HistoryAnalyticsTab } from '@/features/rutas/HistoryAnalyticsTab';
import { AdminTeamTab } from '@/features/equipo/AdminTeamTab';
import { BitacoraGeneratorModal } from '@/features/rutas/BitacoraGeneratorModal';
import { EngineerProfileModal, esFichaCompleta } from '@/features/equipo/EngineerProfileModal';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { NewStoreModal } from '@/features/catalogo/NewStoreModal';
import { MapCanvas } from '@/features/rutas/MapCanvas';
import { AccountMenu } from '@/app/AccountMenu';
import { BottomNav } from '@/app/BottomNav';
import { navVisible } from '@/app/nav';
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
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState('ruta');
  const [mobileTab, setMobileTab] = useState('panel'); // 'panel' | 'mapa'
  const [bitacoraOpen, setBitacoraOpen] = useState(false);
  const [modoModalBitacora, setModoModalBitacora] = useState('ambas');
  const [modoOperativo, setModoOperativo] = useState(() => {
    try {
      return localStorage.getItem('neto_modo_operativo') || 'comprobacion';
    } catch {
      return 'comprobacion';
    }
  });

  const cambiarModoOperativo = useCallback((modo) => {
    setModoOperativo(modo);
    try {
      localStorage.setItem('neto_modo_operativo', modo);
    } catch {}
  }, []);
  const [newStoreModalOpen, setNewStoreModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [isOnboardingMode, setIsOnboardingMode] = useState(false);
  const onboardingCheckedRef = useRef(false);

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

  // Determinar si el usuario logueado es Administrador (Herwing)
  const isAdmin = useMemo(() => {
    if (!userSession?.email) return false;
    const email = userSession.email.toLowerCase().trim();
    return (
      email === 'herwing.eduardova@soyneto.com' ||
      email.includes('herwing') ||
      userSession?.user_metadata?.rol === 'admin'
    );
  }, [userSession]);

  // Escuchar sesión de Supabase Auth
  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        const u = session?.user || null;
        setUserSession(u);
        if (u?.email) {
          setSupabaseConnected(true);
          const email = u.email.toLowerCase().trim();
          if (email.includes('herwing')) {
            setIngenieroActivo('HERWING EDUARDO VAZQUEZ MACIAS');
          } else if (u.user_metadata?.nombre) {
            setIngenieroActivo(u.user_metadata.nombre);
          }
        }
      })
      .catch((err) => {
        console.warn('Error verificando sesión Supabase:', err.message);
      })
      .finally(() => {
        setAuthLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user || null;
      setUserSession(u);
      if (u?.email) {
        setSupabaseConnected(true);
        if (u.email.includes('herwing')) {
          setIngenieroActivo('HERWING EDUARDO VAZQUEZ MACIAS');
        } else if (u.user_metadata?.nombre) {
          setIngenieroActivo(u.user_metadata.nombre);
        }
      }
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Sincronizar automáticamente la ficha vehicular del ingeniero logueado
  useEffect(() => {
    if (!userSession?.email || !ingenieros.length) return;
    const cleanEmail = userSession.email.toLowerCase().trim();

    if (cleanEmail.includes('herwing')) {
      const p = ingenieros.find((i) => i.nombre.includes('HERWING'));
      if (p) {
        setIngenieroActivo(p.nombre);
        if (p.base_nombre && porNombre.has(p.base_nombre)) {
          setAjustes((a) => ({ ...a, base: p.base_nombre }));
        }
      }
      return;
    }

    const match =
      ingenieros.find((i) => i.email && i.email.toLowerCase().trim() === cleanEmail) ||
      ingenieros.find((i) => i.auth_id && i.auth_id === userSession.id) ||
      (userSession.user_metadata?.nombre
        ? ingenieros.find(
            (i) => i.nombre.toUpperCase() === userSession.user_metadata.nombre.toUpperCase()
          )
        : null);

    if (match) {
      setIngenieroActivo(match.nombre);
      setAjustes((a) => ({
        ...a,
        kmPorLitro: Number(match.rendimiento) || a.kmPorLitro,
        precioLitro: Number(match.costo_litro) || a.precioLitro,
        base: match.base_nombre && porNombre.has(match.base_nombre) ? match.base_nombre : a.base,
      }));
    }
  }, [userSession, ingenieros, porNombre]);

  // Perfil del ingeniero actualmente conectado
  const perfilActivo = useMemo(() => {
    if (!ingenieros.length) return null;
    const cleanEmail = userSession?.email?.toLowerCase().trim();
    return (
      (cleanEmail ? ingenieros.find((i) => i.email && i.email.toLowerCase().trim() === cleanEmail) : null) ||
      (userSession?.id ? ingenieros.find((i) => i.auth_id === userSession.id) : null) ||
      ingenieros.find((i) => i.nombre === ingenieroActivo) ||
      ingenieros[0]
    );
  }, [ingenieros, ingenieroActivo, userSession]);

  const perfilCompleto = useMemo(() => {
    return esFichaCompleta(perfilActivo);
  }, [perfilActivo]);

  // Disparar onboarding guiado una sola vez si la ficha vehicular está incompleta
  useEffect(() => {
    if (!authLoading && userSession && ingenieros.length > 0 && !onboardingCheckedRef.current) {
      onboardingCheckedRef.current = true;
      if (!perfilCompleto) {
        setIsOnboardingMode(true);
        setProfileModalOpen(true);
      }
    }
  }, [authLoading, userSession, ingenieros, perfilCompleto]);

  useEffect(() => {
    Promise.all([
      api('GET', '/api/config').catch(() => ({
        mapsKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
      })),
      api('GET', '/api/tiendas').catch(() => null),
      api('GET', '/api/historial').catch(() => []),
      api('GET', '/api/ingenieros').catch(() => null),
    ])
      .then(async ([cfg, tList, hList, ingList]) => {
        let finalTiendas = Array.isArray(tList) && tList.length > 0 ? tList : null;
        if (!finalTiendas) {
          const { data } = await supabase.from('tiendas').select('*');
          if (data && data.length) finalTiendas = data;
        }

        let finalIng = Array.isArray(ingList) && ingList.length > 0 ? ingList : null;
        if (!finalIng) {
          const { data } = await supabase.from('ingenieros').select('*');
          if (data && data.length) finalIng = data;
        }

        let finalHist = Array.isArray(hList) && hList.length > 0 ? hList : null;
        if (!finalHist) {
          const { data: hData } = await supabase
            .from('rutas_historial')
            .select('*')
            .order('fecha', { ascending: false });
          if (hData && hData.length) {
            finalHist = hData.map((r) => ({
              id: r.uuid || String(r.id),
              fecha: r.fecha,
              nombre: r.nombre || '',
              tipo: r.tipo || 'comprobacion',
              ingeniero: r.ingeniero || '',
              baseNombre: r.base_nombre || '',
              paradas: r.paradas || [],
              tramos: r.tramos || [],
              baseInicio: r.base_inicio ?? true,
              baseFin: r.base_fin ?? true,
              totalKm: Number(r.total_km || 0),
              litros: Number(r.litros || 0),
              segundos: Number(r.duracion_segundos || 0),
              costo: Number(r.costo || 0),
              guardadoEn: r.created_at,
            }));
          }
        }

        setMapsKey(cfg?.mapsKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '');
        setMotor(cfg?.motor || { motor: 'routes' });
        setSupabaseConnected(true);
        if (finalTiendas?.length) setTiendasRaw(finalTiendas);
        if (finalHist?.length) setHistorial(finalHist);
        if (finalIng?.length) setIngenieros(finalIng);

        if (!localStorage.getItem('ruteo.ajustes')) {
          setAjustes((a) => ({
            ...a,
            kmPorLitro: cfg?.kmPorLitro || 12.5,
            precioLitro: cfg?.precioLitro || 23.99,
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
      pts.push({ ...baseTienda, tipo: 'base' });
    }
    ruta.paradas.forEach((p, idx) => {
      const infoTienda = porNombre.get(p.nombre);
      pts.push({ ...(infoTienda || {}), ...p, tipo: 'parada', idx });
    });
    if (ruta.baseFin && baseTienda && (ruta.paradas.length > 0 || !ruta.baseInicio)) {
      pts.push({ ...baseTienda, tipo: 'base' });
    }
    return pts;
  }, [ruta, baseTienda, porNombre]);

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

  const cargarRutaDeHistorial = useCallback(
    (h, nuevaFecha = null) => {
      mutarRuta({
        id: nuevaFecha ? null : h.id,
        fecha: nuevaFecha || h.fecha,
        nombre: h.nombre || '',
        paradas: (h.paradas || []).map((p) => {
          if (p.temporal) return p;
          const t = porNombre.get(p.nombre);
          return t || p;
        }),
        baseInicio: h.baseInicio !== false,
        baseFin: h.baseFin !== false,
      });
      if (h.baseNombre) {
        setAjustes((prev) => ({ ...prev, base: h.baseNombre }));
      }
    },
    [mutarRuta, porNombre]
  );

  const guardarDia = useCallback(
    async (modo = modoOperativo) => {
      if (!ruta.paradas.length) return toast('La ruta está vacía');
      if (!userSession) {
        toast('Tu sesión expiró. Inicia sesión de nuevo para guardar.', 'err');
        return;
      }
      try {
        const tipoGuardar = modo || 'comprobacion';
        const item = await api('POST', '/api/historial', {
          id: ruta.id,
          fecha: ruta.fecha,
          nombre: ruta.nombre,
          tipo: tipoGuardar,
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
        toast(
          `Ruta de ${tipoGuardar === 'anticipo' ? 'Anticipo' : 'Comprobación'} guardada: ${fechaLarga(
            ruta.fecha
          )}`
        );
      } catch (e) {
        toast(e.message, 'err');
      }
    },
    [ruta, tramos, totales, ingenieroActivo, ajustes.base, userSession, modoOperativo, toast]
  );

  const seleccionarDiaSemana = useCallback(
    (fechaTarget, guardadoDirecto = null) => {
      if (guardadoDirecto) {
        cargarRutaDeHistorial(guardadoDirecto);
        toast(`Cargada ruta guardada: ${fechaMX(fechaTarget)}`);
        return;
      }

      const guardada = (historial || []).find((h) => {
        const coincideIng = !h.ingeniero || !ingenieroActivo || h.ingeniero === ingenieroActivo;
        const tipoRuta = h.tipo || 'comprobacion';
        return h.fecha === fechaTarget && coincideIng && tipoRuta === modoOperativo;
      });

      if (guardada) {
        cargarRutaDeHistorial(guardada);
        toast(`Cargada ruta guardada: ${fechaMX(fechaTarget)}`);
      } else {
        mutarRuta({
          id: null,
          fecha: fechaTarget,
          nombre: '',
          paradas: [],
          baseInicio: true,
          baseFin: true,
        });
        toast(`Iniciando ruta para ${fechaMX(fechaTarget)}`);
        setTimeout(() => searchInputRef.current?.focus(), 40);
      }
    },
    [historial, ingenieroActivo, modoOperativo, cargarRutaDeHistorial, mutarRuta, toast]
  );

  const guardarYPasarSiguienteDia = useCallback(
    async (modo = modoOperativo) => {
      await guardarDia(modo);
      const d = new Date(ruta.fecha + 'T12:00:00');
      d.setDate(d.getDate() + 1);
      if (d.getDay() === 0) d.setDate(d.getDate() + 1); // domingo -> lunes
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const diaNum = String(d.getDate()).padStart(2, '0');
      const siguienteFecha = `${y}-${m}-${diaNum}`;

      seleccionarDiaSemana(siguienteFecha);
    },
    [guardarDia, ruta.fecha, seleccionarDiaSemana, modoOperativo]
  );

  const copiarAnticipoAComprobacion = useCallback(
    (fechaTarget) => {
      const ant = (historial || []).find((h) => {
        const coincideIng = !h.ingeniero || !ingenieroActivo || h.ingeniero === ingenieroActivo;
        return h.fecha === fechaTarget && coincideIng && h.tipo === 'anticipo';
      });

      if (!ant) {
        return toast('No hay anticipo guardado para esta fecha', 'err');
      }

      mutarRuta({
        id: null,
        fecha: fechaTarget,
        nombre: ant.nombre ? `${ant.nombre} (Comprobación)` : 'Comprobación de ruta',
        paradas: (ant.paradas || []).map((p) => {
          if (p.temporal) return p;
          const t = porNombre.get(p.nombre);
          return t || p;
        }),
        baseInicio: ant.baseInicio !== false,
        baseFin: ant.baseFin !== false,
      });
      toast(`Tiendas importadas de Anticipo para ${fechaMX(fechaTarget)}. Revisa paradas y odómetros.`);
    },
    [historial, ingenieroActivo, porNombre, mutarRuta, toast]
  );

  const abrirBitacoraConModo = useCallback((modo = 'ambas') => {
    setModoModalBitacora(modo);
    setBitacoraOpen(true);
  }, []);

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
            ...(actual.eco !== undefined ? { eco: actual.eco } : {}),
            ...(actual.ceco !== undefined ? { ceco: actual.ceco } : {}),
            ...(actual.zona !== undefined ? { zona: actual.zona } : {}),
            ...(actual.region !== undefined ? { region: actual.region } : {}),
            ...(actual.ingeniero !== undefined ? { ingeniero: actual.ingeniero } : {}),
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

  // 1. Pantalla de carga mientras se verifica el estado de sesión
  if (authLoading) {
    return (
      <div className="h-dvh w-full flex flex-col items-center justify-center bg-background text-foreground gap-3">
        <img
          src="/logo-app.png"
          alt="Tiendas Neto"
          className="h-16 w-16 rounded-2xl p-1 bg-white object-contain shadow-2xl animate-pulse border border-white/10"
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
          <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
          <span>Iniciando Rutas Sureste…</span>
        </div>
      </div>
    );
  }

  // 2. BARRERA DE AUTENTICACIÓN ESTRICTA: No se muestra la plataforma antes de loguearse
  if (!userSession) {
    return (
      <TooltipProvider delayDuration={200}>
        <AuthScreen
          onAuthSuccess={(user) => {
            setUserSession(user);
            if (user?.email?.includes('herwing')) {
              setIngenieroActivo('HERWING EDUARDO VAZQUEZ MACIAS');
            } else if (user?.user_metadata?.nombre) {
              setIngenieroActivo(user.user_metadata.nombre);
            }
          }}
          toast={toast}
          ingenierosExistentes={ingenieros}
        />
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
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground lg:grid lg:grid-cols-[440px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        {/* ================= PANEL (cabecera + vistas) ================= */}
        <aside
          className={cn(
            'min-h-0 min-w-0 flex-1 flex-col border-border bg-background lg:flex lg:border-r',
            mobileTab === 'mapa' ? 'hidden' : 'flex'
          )}
        >
          <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3.5 pt-safe shadow-2xs">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLogo className="h-9 w-9" />
              <div className="min-w-0">
                <h1 className="truncate text-sm font-bold leading-tight tracking-tight text-foreground">
                  {BRAND.nombre}
                </h1>
                <p className="truncate text-[11px] leading-tight text-muted-foreground mt-0.5">
                  {ajustes.base || 'Sin base asignada'}
                </p>
              </div>
            </div>
            <AccountMenu
              email={userSession.email}
              nombre={perfilActivo?.nombre || ingenieroActivo}
              isAdmin={isAdmin}
              perfilCompleto={perfilCompleto}
              dark={dark}
              onToggleTheme={() => setDark((d) => !d)}
              onOpenProfile={() => {
                setIsOnboardingMode(false);
                setProfileModalOpen(true);
              }}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenShortcuts={() => setShortcutsOpen(true)}
              onSignOut={async () => {
                await supabase.auth.signOut();
                setUserSession(null);
                toast('Sesión cerrada');
              }}
            />
          </header>

          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            {/* Navegación superior: solo escritorio (en móvil se usa la barra inferior) */}
            <div className="hidden shrink-0 px-4 pt-3.5 pb-1 lg:block">
              <TabsList className={cn('grid w-full', isAdmin ? 'grid-cols-4' : 'grid-cols-3')}>
                {navVisible({ isAdmin, mobile: false }).map(({ id, label, icon: Icon }) => (
                  <TabsTrigger
                    key={id}
                    value={id}
                    className="gap-1.5 text-xs"
                  >
                    <Icon weight={tab === id ? 'fill' : 'duotone'} className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3.5 py-3">
              <TabsContent
                value="ruta"
                className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
              >
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
                  onShowMap={() => setMobileTab('mapa')}
                  onOpenBitacora={abrirBitacoraConModo}
                  historial={historial}
                  ingenieroActivo={ingenieroActivo}
                  modoOperativo={modoOperativo}
                  onSetModoOperativo={cambiarModoOperativo}
                  onSaveAndNext={guardarYPasarSiguienteDia}
                  onSelectDay={seleccionarDiaSemana}
                  onCopyAnticipo={copiarAnticipoAComprobacion}
                />
              </TabsContent>

              <TabsContent
                value="corregir"
                className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
              >
                <CoordinateAuditTab
                  tiendas={tiendas}
                  porNombre={porNombre}
                  ingenieros={ingenieros}
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
                  onShowMap={() => setMobileTab('mapa')}
                  isAdmin={isAdmin}
                  userSession={userSession}
                  onStoreUpdated={(nuevaLista) => setTiendasRaw(nuevaLista)}
                  toast={toast}
                />
              </TabsContent>

              <TabsContent
                value="historial"
                className="m-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain data-[state=inactive]:hidden"
              >
                <HistoryAnalyticsTab
                  historial={historial}
                  onOpenBitacora={abrirBitacoraConModo}
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

              {isAdmin && (
                <TabsContent
                  value="admin"
                  className="m-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain data-[state=inactive]:hidden"
                >
                  <AdminTeamTab
                    ingenieros={ingenieros}
                    onUpdateIngeniero={(actualizado) => {
                      setIngenieros((prev) =>
                        prev.map((i) => (i.nombre === actualizado.nombre ? actualizado : i))
                      );
                    }}
                    tiendas={tiendas}
                    toast={toast}
                    onOpenBitacoraModal={() => setBitacoraOpen(true)}
                    porNombre={porNombre}
                    ajustes={ajustes}
                  />
                </TabsContent>
              )}
            </div>
          </Tabs>
        </aside>

        {/* ================= MAPA ================= */}
        <main
          className={cn(
            'relative min-h-0 min-w-0 flex-1 lg:block',
            mobileTab === 'panel' ? 'hidden' : 'block'
          )}
        >
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
            dark={dark}
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

        <BottomNav
          items={navVisible({ isAdmin, mobile: true })}
          active={mobileTab === 'mapa' ? 'mapa' : tab}
          onSelect={(id) => {
            if (id === 'mapa') {
              setMobileTab('mapa');
            } else {
              setTab(id);
              setMobileTab('panel');
            }
          }}
        />

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
          isAdmin={isAdmin}
          modoInicial={modoModalBitacora}
          onOpenProfile={() => {
            setIsOnboardingMode(false);
            setProfileModalOpen(true);
          }}
        />

        {/* ================= MODAL DE FICHA VEHICULAR / ONBOARDING ================= */}
        <EngineerProfileModal
          open={profileModalOpen}
          onOpenChange={(v) => {
            setProfileModalOpen(v);
            if (!v) setIsOnboardingMode(false);
          }}
          perfil={
            perfilActivo || {
              nombre: ingenieroActivo,
              email: userSession?.email,
              auth_id: userSession?.id,
            }
          }
          isOnboarding={isOnboardingMode}
          tiendas={tiendas}
          toast={toast}
          onSaveSuccess={(nuevoPerfil) => {
            setIngenieros((prev) => {
              const idx = prev.findIndex((i) => i.nombre === nuevoPerfil.nombre);
              if (idx >= 0) {
                const copia = [...prev];
                copia[idx] = { ...copia[idx], ...nuevoPerfil };
                return copia;
              }
              return [...prev, nuevoPerfil];
            });
            setAjustes((a) => ({
              ...a,
              kmPorLitro: Number(nuevoPerfil.rendimiento) || a.kmPorLitro,
              precioLitro: Number(nuevoPerfil.costo_litro) || a.precioLitro,
              base:
                nuevoPerfil.base_nombre && porNombre.has(nuevoPerfil.base_nombre)
                  ? nuevoPerfil.base_nombre
                  : a.base,
            }));
          }}
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
          <DialogContent className="max-w-md w-[calc(100%-1.5rem)] p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Configuración</DialogTitle>
              <DialogDescription>
                Punto base de operación, rendimiento de combustible y formato de salida para Excel.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Punto base (salida / regreso)</Label>
                <Select
                  value={ajustes.base}
                  onValueChange={(v) => setAjustes((a) => ({ ...a, base: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona tienda base" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {tiendas.map((t) => (
                      <SelectItem key={t.nombre} value={t.nombre}>
                        {t.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Inputs de rendimiento y combustible adaptados a mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="input-rendimiento" className="text-xs font-medium">
                    Rendimiento vehicular
                  </Label>
                  <div className="relative">
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
                      className="pr-14"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
                      km / L
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="input-precio" className="text-xs font-medium">
                    Precio gasolina
                  </Label>
                  <div className="relative">
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
                      className="pr-16"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
                      $ MXN/L
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Separador al copiar para Excel</Label>
                <Select
                  value={ajustes.separador}
                  onValueChange={(v) => setAjustes((a) => ({ ...a, separador: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tab">
                      Tabuladores TSV (pegar directo en celdas de Excel)
                    </SelectItem>
                    <SelectItem value="coma">
                      Comas CSV (archivo delimitado por comas)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Con Tabuladores copias desde la barra de ruta y pegas directamente con <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">Ctrl+V</kbd> en Excel o Google Sheets.
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <Card className="flex items-center justify-between p-3 gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <Label htmlFor="switch-incluir-fecha" className="text-xs font-medium cursor-pointer block truncate">
                      Incluir columna de fecha
                    </Label>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      Agrega la fecha al inicio de cada fila copiada
                    </p>
                  </div>
                  <Switch
                    id="switch-incluir-fecha"
                    checked={ajustes.incluirFecha}
                    onCheckedChange={(v) => setAjustes((a) => ({ ...a, incluirFecha: v }))}
                  />
                </Card>

                <Card className="flex items-center justify-between p-3 gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <Label htmlFor="switch-incluir-total" className="text-xs font-medium cursor-pointer block truncate">
                      Fila de TOTAL al final
                    </Label>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      Inserta suma total de km e importe al pegar
                    </p>
                  </div>
                  <Switch
                    id="switch-incluir-total"
                    checked={ajustes.incluirTotal}
                    onCheckedChange={(v) => setAjustes((a) => ({ ...a, incluirTotal: v }))}
                  />
                </Card>
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button onClick={() => setSettingsOpen(false)} className="w-full sm:w-auto">
                Listo
              </Button>
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
