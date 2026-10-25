/**
 * @fileoverview Modal Generador y Gestor de Bitácoras Semanales Tiendas Neto (`BitacoraGeneratorModal.jsx`).
 *
 * Características mejoradas:
 * 1. **Cálculo automático inteligente de Semana**: Al seleccionar cualquier fecha o ruta,
 *    se calcula automáticamente la semana del año (`ISO 8601`) y el rango de días (`Lunes a Domingo`).
 * 2. **Soporte para hojas en el mismo archivo `.xlsx`**:
 *    - Pestaña `ANTICIPO`
 *    - Pestaña `COMPROBACION`
 *    - Opción recomendada: **Ambas hojas en el mismo archivo** (como en tu plantilla original).
 * 3. **Persistencia y consulta en Supabase**:
 *    - Permite guardar la bitácora de la semana en `rutas_sureste.bitacoras_semanales`.
 *    - Pestaña de historial de bitácoras por semana para descargar cualquier semana pasada en cualquier momento.
 * 4. **Asignación de días independiente o sincronizada**: Permite elegir qué rutas pertenecen a la
 *    proyección de Anticipo y cuáles a la Comprobación real de gastos.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  FileXls,
  UserGear,
  CalendarCheck,
  FloppyDiskBack,
  Trash,
  GasPump,
  Receipt,
  CarProfile,
  ClockCounterClockwise,
  DownloadSimple,
  Stack,
} from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  TypographySmall,
  TypographyMuted,
  TypographyMono,
} from '@/components/ui/typography';
import { calcularSemanaISO, descargarBitacoraNetoExcel } from '@/lib/bitacora-excel';
import {
  cn,
  fechaMX,
  pesos,
  api,
  obtenerLunesDeSemanaISO,
  obtenerCicloOperativoNeto,
} from '@/lib/utils';

function construirTramosDeRuta(item, porNombre, baseDefault) {
  const baseNombre = item.baseNombre || baseDefault || 'RESGUARDO TUXTLA';
  const baseTienda = porNombre.get(baseNombre);
  const pts = [];
  if (item.baseInicio !== false && baseTienda) {
    pts.push({ nombre: baseTienda.nombre, lat: baseTienda.lat, lng: baseTienda.lng });
  }
  (item.paradas || []).forEach((p) => pts.push(p));
  if (
    item.baseFin !== false &&
    baseTienda &&
    ((item.paradas || []).length > 0 || !item.baseInicio)
  ) {
    pts.push({ nombre: baseTienda.nombre, lat: baseTienda.lat, lng: baseTienda.lng });
  }

  const tramosOut = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const tGuardado = item.tramos?.[i];
    let km = tGuardado?.km;
    if (km == null && pts[i].lat != null && pts[i + 1].lat != null) {
      const R = 6371;
      const dLat = ((pts[i + 1].lat - pts[i].lat) * Math.PI) / 180;
      const dLng = ((pts[i + 1].lng - pts[i].lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((pts[i].lat * Math.PI) / 180) *
          Math.cos((pts[i + 1].lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      km = Math.max(1, Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.32));
    }
    tramosOut.push({
      origen: pts[i].nombre,
      destino: pts[i + 1].nombre,
      km: Math.round(Number(km) || 0),
    });
  }
  return tramosOut;
}

export function BitacoraGeneratorModal({
  open,
  onOpenChange,
  ingenieros,
  ingenieroActivo,
  onSelectIngeniero,
  onSaveIngeniero,
  rutaActual,
  tramosActuales,
  baseNombre,
  porNombre,
  historial,
  ajustes,
  toast,
  isAdmin = false,
  onOpenProfile,
  modoInicial = 'ambas',
}) {
  const perfilActual = useMemo(() => {
    return (
      ingenieros.find((i) => i.nombre === ingenieroActivo) ||
      ingenieros[0] || {
        nombre: 'HERWING EDUARDO VAZQUEZ MACIAS',
        puesto: 'INGENIERO DE SOPORTE TECNICO',
        no_empleado: '1221362',
        tarjeta_gasolina: '5064490100458236',
        automovil: 'AVEO',
        placas: 'PEB-798-C',
        serie: 'LZWPRMGN0TF108615',
        ceco: '108266',
        region: 'TUXTLA',
        rendimiento: ajustes.kmPorLitro || 12.5,
        costo_litro: ajustes.precioLitro || 23.99,
        base_nombre: baseNombre || 'RESGUARDO TUXTLA',
        domicilio_direccion: '',
        domicilio_link: '',
        km_inicial_ultimo: 17374,
      }
    );
  }, [ingenieros, ingenieroActivo, ajustes, baseNombre]);

  const [modalTab, setModalTab] = useState('generador'); // 'generador' | 'guardadas'
  const [formIng, setFormIng] = useState(perfilActual);
  const [editandoPerfil, setEditandoPerfil] = useState(false);
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  // Modo de exportación: 'ambas' (hojas COMPROBACION y ANTICIPO juntas), 'comprobacion' o 'anticipo'
  const [modoHojas, setModoHojas] = useState('ambas');

  // Cálculo automático de semana ISO y año
  const fechaReferencia = rutaActual?.fecha || new Date().toISOString().slice(0, 10);
  const calcDef = useMemo(() => calcularSemanaISO(fechaReferencia), [fechaReferencia]);
  const [semana, setSemana] = useState(calcDef.semana);
  const [anio, setAnio] = useState(calcDef.anio);

  const [kmInicial, setKmInicial] = useState(perfilActual.km_inicial_ultimo || 17374);
  const [dispersion, setDispersion] = useState(0);
  const [complementos, setComplementos] = useState(0);

  const [obsAnticipo, setObsAnticipo] = useState(
    () =>
      `ANTICIPO PARA LA SEMANA ${calcDef.semana} SE REALIZARAN MANTENIMIENTOS PREVENTIVOS Y ATENCIÓN A SUCURSALES EN REGIÓN ${perfilActual.region || 'TUXTLA'}.`
  );
  const [obsComprobacion, setObsComprobacion] = useState(
    () =>
      `COMPROBACION DE RUTA SEMANA ${calcDef.semana} POR MANTENIMIENTOS PREVENTIVOS Y ATENCIÓN A SUCURSALES EN REGIÓN ${perfilActual.region || 'TUXTLA'}.`
  );

  const [incluirRutaActual, setIncluirRutaActual] = useState(true);
  const [idsComprobacionSel, setIdsComprobacionSel] = useState([]);
  const [idsAnticipoSel, setIdsAnticipoSel] = useState([]);
  const [subTabDias, setSubTabDias] = useState('comprobacion'); // 'comprobacion' | 'anticipo'

  // Opciones de ciclo para el anticipo: 'ciclo_neto' (Mar -> Lun próx) o 'semana_natural' (Lun -> Sáb)
  const [varianteAnticipo, setVarianteAnticipo] = useState('ciclo_neto');
  // Flag por si al ingeniero se le olvidó pedir el lunes anterior y lo incluye ahora
  const [incluirLunesOlvido, setIncluirLunesOlvido] = useState(false);

  const [puntosNuevosExtra, setPuntosNuevosExtra] = useState([]);
  const [descargando, setDescargando] = useState(false);
  const [guardandoSupabase, setGuardandoSupabase] = useState(false);

  // Lista de bitácoras guardadas en Supabase / local
  const [bitacorasGuardadas, setBitacorasGuardadas] = useState([]);

  // Lunes base del ciclo para la semana y año seleccionados
  const fechaLunesBase = useMemo(() => {
    return obtenerLunesDeSemanaISO(semana, anio);
  }, [semana, anio]);

  // Ciclo operativo Tiendas Neto (Comprobación y Anticipo con próximo lunes)
  const cicloNetoModal = useMemo(() => {
    return obtenerCicloOperativoNeto(fechaLunesBase, {
      modo: 'anticipo',
      variante: varianteAnticipo,
      incluirLunesOlvido,
    });
  }, [fechaLunesBase, varianteAnticipo, incluirLunesOlvido]);

  // Validación estricta: Ficha vehicular obligatoria para poder generar/descargar bitácora
  const perfilCompleto = useMemo(() => {
    return Boolean(
      String(formIng.no_empleado || '').trim() &&
      String(formIng.placas || '').trim() &&
      String(formIng.tarjeta_gasolina || '').trim() &&
      String(formIng.automovil || '').trim()
    );
  }, [formIng]);

  useEffect(() => {
    setFormIng(perfilActual);
    setKmInicial(perfilActual.km_inicial_ultimo || 17374);
  }, [perfilActual]);

  useEffect(() => {
    if (rutaActual?.fecha) {
      const c = calcularSemanaISO(rutaActual.fecha);
      setSemana(c.semana);
      setAnio(c.anio);
    }
  }, [rutaActual?.fecha]);

  // Cargar lista de bitácoras guardadas al abrir el modal y auto-seleccionar días
  useEffect(() => {
    if (open) {
      if (modoInicial) {
        setModoHojas(modoInicial);
        setSubTabDias(modoInicial === 'anticipo' ? 'anticipo' : 'comprobacion');
      }
      api('GET', '/api/bitacoras')
        .then((data) => {
          if (Array.isArray(data)) setBitacorasGuardadas(data);
        })
        .catch(() => {});

      // 1. Auto-seleccionar rutas para Comprobación (Semana concluida: Lunes a Sábado)
      const fechasCompValidas = new Set(
        cicloNetoModal.diasSemanaNatural.slice(0, 6).map((d) => d.fecha)
      );
      const rutasComp = (historial || []).filter((h) => {
        if (!h.fecha) return false;
        const mismoIng = !h.ingeniero || !formIng.nombre || h.ingeniero === formIng.nombre;
        const tipoComp = h.tipo === 'comprobacion' || !h.tipo;
        return mismoIng && tipoComp && fechasCompValidas.has(h.fecha);
      });
      setIdsComprobacionSel(rutasComp.map((h) => h.id));

      // 2. Auto-seleccionar rutas para Anticipo (Ciclo Neto: Martes a Sábado + Lunes siguiente)
      const fechasAntValidas = new Set(cicloNetoModal.dias.map((d) => d.fecha));
      const rutasAnt = (historial || []).filter((h) => {
        if (!h.fecha) return false;
        const mismoIng = !h.ingeniero || !formIng.nombre || h.ingeniero === formIng.nombre;
        const tipoAnt = h.tipo === 'anticipo';
        return mismoIng && tipoAnt && fechasAntValidas.has(h.fecha);
      });
      setIdsAnticipoSel(rutasAnt.map((h) => h.id));
    }
  }, [open, modoInicial, semana, anio, formIng.nombre, historial, cicloNetoModal]);

  // Días consolidados para COMPROBACION (hasta 7 días por hoja)
  const diasComprobacion = useMemo(() => {
    const lista = [];

    if (
      incluirRutaActual &&
      rutaActual?.paradas?.length > 0 &&
      rutaActual?.tipo !== 'anticipo'
    ) {
      const fechasCompValidas = new Set(
        cicloNetoModal.diasSemanaNatural.slice(0, 6).map((d) => d.fecha)
      );
      if (fechasCompValidas.has(rutaActual.fecha)) {
        const tramosAct = construirTramosDeRuta(
          { ...rutaActual, baseNombre, tramos: tramosActuales },
          porNombre,
          baseNombre
        );
        lista.push({
          id: 'actual_comp',
          fecha: rutaActual.fecha,
          nombre: rutaActual.nombre || 'Ruta activa',
          paradas: rutaActual.paradas,
          tramos: tramosAct,
        });
      }
    }

    for (const id of idsComprobacionSel) {
      const h = historial.find((x) => x.id === id);
      if (!h) continue;
      if (incluirRutaActual && rutaActual?.id && rutaActual.id === h.id) continue;
      const tramosH = construirTramosDeRuta(h, porNombre, baseNombre);
      lista.push({
        id: h.id,
        fecha: h.fecha,
        nombre: h.nombre || 'Ruta guardada',
        paradas: h.paradas || [],
        tramos: tramosH,
      });
    }

    return lista.sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 7);
  }, [
    incluirRutaActual,
    rutaActual,
    tramosActuales,
    idsComprobacionSel,
    historial,
    porNombre,
    baseNombre,
    cicloNetoModal,
  ]);

  // Días consolidados para ANTICIPO (Ciclo Neto con próximo lunes incluido)
  const diasAnticipo = useMemo(() => {
    const lista = [];

    if (
      incluirRutaActual &&
      rutaActual?.paradas?.length > 0 &&
      rutaActual?.tipo === 'anticipo'
    ) {
      const fechasAntValidas = new Set(cicloNetoModal.dias.map((d) => d.fecha));
      if (fechasAntValidas.has(rutaActual.fecha)) {
        const tramosAct = construirTramosDeRuta(
          { ...rutaActual, baseNombre, tramos: tramosActuales },
          porNombre,
          baseNombre
        );
        lista.push({
          id: 'actual_ant',
          fecha: rutaActual.fecha,
          nombre: rutaActual.nombre || 'Ruta activa (Anticipo)',
          paradas: rutaActual.paradas,
          tramos: tramosAct,
        });
      }
    }

    for (const id of idsAnticipoSel) {
      const h = historial.find((x) => x.id === id);
      if (!h) continue;
      if (incluirRutaActual && rutaActual?.id && rutaActual.id === h.id) continue;
      const tramosH = construirTramosDeRuta(h, porNombre, baseNombre);
      lista.push({
        id: h.id,
        fecha: h.fecha,
        nombre: h.nombre || 'Ruta de anticipo',
        paradas: h.paradas || [],
        tramos: tramosH,
      });
    }

    return lista.sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 7);
  }, [
    incluirRutaActual,
    rutaActual,
    tramosActuales,
    idsAnticipoSel,
    historial,
    porNombre,
    baseNombre,
    cicloNetoModal,
  ]);

  // Detección automática de puntos especiales combinando ambas listas
  const puntosNuevosDetectados = useMemo(() => {
    const mapa = new Map();
    const todosDias = [...diasComprobacion, ...diasAnticipo];
    todosDias.forEach((d) => {
      (d.paradas || []).forEach((p) => {
        const nom = (p.nombre || '').toUpperCase();
        const esEspecial =
          p.temporal ||
          nom.includes('APERTURA') ||
          nom.includes('HOTEL') ||
          nom.includes('NUEVA');
        if (esEspecial && !mapa.has(nom)) {
          const link =
            p.link ||
            (p.lat != null && p.lng != null
              ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`
              : '');
          mapa.set(nom, { nombre: nom, link });
        }
      });
    });
    puntosNuevosExtra.forEach((p) => {
      if (p.nombre.trim()) {
        mapa.set(p.nombre.trim().toUpperCase(), {
          nombre: p.nombre.trim().toUpperCase(),
          link: p.link.trim(),
        });
      }
    });
    return Array.from(mapa.values()).slice(0, 9);
  }, [diasComprobacion, diasAnticipo, puntosNuevosExtra]);

  const rend = Number(formIng.rendimiento) || 12.5;
  const precio = Number(formIng.costo_litro) || 23.99;

  const resumenComprobacion = useMemo(() => {
    const km = diasComprobacion.reduce(
      (acc, d) => acc + d.tramos.reduce((s, t) => s + (t.km || 0), 0),
      0
    );
    const litros = km / rend;
    const importe = litros * precio;
    return { km, litros, importe, kmFinal: (Number(kmInicial) || 0) + km };
  }, [diasComprobacion, rend, precio, kmInicial]);

  const resumenAnticipo = useMemo(() => {
    const km = diasAnticipo.reduce(
      (acc, d) => acc + d.tramos.reduce((s, t) => s + (t.km || 0), 0),
      0
    );
    const litros = km / rend;
    const importe = litros * precio;
    return { km, litros, importe, kmFinal: (Number(kmInicial) || 0) + km };
  }, [diasAnticipo, rend, precio, kmInicial]);

  const resumenTotales = useMemo(() => {
    if (modoHojas === 'anticipo') return resumenAnticipo;
    return resumenComprobacion;
  }, [modoHojas, resumenAnticipo, resumenComprobacion]);

  const guardarPerfil = async () => {
    setGuardandoPerfil(true);
    try {
      const listaActualizada = await api('PATCH', '/api/ingenieros', {
        ...formIng,
        km_inicial_ultimo: Number(kmInicial) || 0,
      });
      onSaveIngeniero(listaActualizada, formIng);
      setEditandoPerfil(false);
      toast('Perfil del ingeniero guardado correctamente');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setGuardandoPerfil(false);
    }
  };

  const guardarEnSupabase = async () => {
    if (!perfilCompleto) {
      toast('Completa tu ficha vehicular antes de archivar la bitácora', 'err');
      onOpenProfile?.();
      return;
    }
    const tieneDias =
      modoHojas === 'anticipo'
        ? diasAnticipo.length > 0
        : modoHojas === 'comprobacion'
        ? diasComprobacion.length > 0
        : diasComprobacion.length > 0 || diasAnticipo.length > 0;

    if (!tieneDias) {
      return toast('Agrega al menos una ruta antes de archivar la bitácora', 'err');
    }

    setGuardandoSupabase(true);
    try {
      const payload = {
        ingeniero: formIng.nombre,
        semana,
        anio,
        tipo: modoHojas,
        km_inicial: Number(kmInicial) || 0,
        rendimiento: formIng.rendimiento,
        costo_litro: formIng.costo_litro,
        dispersion,
        complementos,
        observaciones_anticipo: obsAnticipo,
        observaciones_comprobacion: obsComprobacion,
        dias_anticipo: diasAnticipo,
        dias_comprobacion: diasComprobacion,
        puntos_nuevos: puntosNuevosDetectados,
        total_km: modoHojas === 'anticipo' ? resumenAnticipo.km : resumenComprobacion.km,
        total_importe:
          Math.round(
            (modoHojas === 'anticipo' ? resumenAnticipo.importe : resumenComprobacion.importe) *
              100
          ) / 100,
      };
      await api('POST', '/api/bitacoras', payload);
      const lista = await api('GET', '/api/bitacoras');
      setBitacorasGuardadas(lista);
      toast(`Bitácora Semana ${semana} (${anio}) archivada en el servidor`);
    } catch (e) {
      toast('Error guardando bitácora: ' + e.message, 'err');
    } finally {
      setGuardandoSupabase(false);
    }
  };

  const handleDescargarExcel = async (overrideData = null) => {
    if (!overrideData && !perfilCompleto) {
      toast(
        'No se puede generar la bitácora: Ficha vehicular incompleta. Configura tus datos primero.',
        'err'
      );
      onOpenProfile?.();
      return;
    }

    const dataUsar = overrideData || {
      modo: modoHojas,
      ingeniero: formIng,
      semana,
      kmInicial,
      rendimiento: formIng.rendimiento,
      costoLitro: formIng.costo_litro,
      dispersion,
      complementos,
      observacionesAnticipo: obsAnticipo,
      observacionesComprobacion: obsComprobacion,
      diasComprobacion,
      diasAnticipo,
      dias: modoHojas === 'anticipo' ? diasAnticipo : diasComprobacion,
      puntosNuevos: puntosNuevosDetectados,
    };

    const tieneDias =
      modoHojas === 'anticipo'
        ? diasAnticipo.length > 0
        : modoHojas === 'comprobacion'
        ? diasComprobacion.length > 0
        : diasComprobacion.length > 0 || diasAnticipo.length > 0;

    if (!overrideData && !tieneDias) {
      return toast(
        'Agrega al menos una parada a tu ruta o selecciona un día del historial',
        'err'
      );
    }

    setDescargando(true);
    try {
      if (!overrideData) {
        guardarEnSupabase().catch(() => {});
      }

      const archivo = await descargarBitacoraNetoExcel(dataUsar);
      toast(`Bitácora descargada: ${archivo}`);
    } catch (e) {
      toast('Error generando Excel: ' + e.message, 'err');
    } finally {
      setDescargando(false);
    }
  };

  const toggleComprobacionId = (id) => {
    setIdsComprobacionSel((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAnticipoId = (id) => {
    setIdsAnticipoSel((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <div className="flex items-center gap-2.5">
              <img
                src="/logo-app.png"
                alt="Tiendas Neto"
                className="h-9 w-9 rounded-xl object-contain bg-white p-0.5 border border-border/40 shadow-xs"
              />
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <span>Bitácora Oficial de Combustible Tiendas Neto</span>
                  <Badge variant="secondary" className="text-[10px]">
                    Semana {semana} ({anio})
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  Genera el formato corporativo con pestañas de Comprobación y Anticipo, fórmulas y respaldo centralizado.
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={modalTab} onValueChange={setModalTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generador" className="gap-1.5">
              <Stack weight="duotone" className="h-4 w-4" />
              <span>Generar Bitácora Semana {semana}</span>
            </TabsTrigger>
            <TabsTrigger value="guardadas" className="gap-1.5">
              <ClockCounterClockwise weight="duotone" className="h-4 w-4" />
              <span>Semanas Guardadas ({bitacorasGuardadas.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* ================= PESTAÑA 1: GENERADOR ACTIVO ================= */}
          <TabsContent value="generador" className="space-y-4 pt-2">
            {!perfilCompleto && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-300 flex items-start justify-between gap-3 animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <WarningCircle weight="fill" className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-semibold text-sm block">Ficha vehicular pendiente de configuración</span>
                    <p className="text-muted-foreground text-xs leading-normal">
                      Para emitir tu bitácora oficial (.xlsx) de anticipo y comprobación, debes configurar tus datos de vehículo (No. de Empleado, Placas, Modelo y Tarjeta de Gasolina).
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 text-xs gap-1.5"
                  onClick={() => onOpenProfile?.()}
                >
                  <CarProfile weight="bold" className="h-4 w-4" />
                  Configurar Ficha
                </Button>
              </div>
            )}
            {/* 1. SELECCIÓN DE HOJAS A GENERAR EN EL ARCHIVO */}
            <Card className="p-3 bg-primary/5 border-primary/25 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileXls weight="duotone" className="h-4 w-4 text-primary" />
                  <Label className="text-xs font-semibold">
                    Hojas a incluir en el mismo archivo Excel (.xlsx):
                  </Label>
                </div>
                <div className="flex items-center gap-1">
                  {[
                    { id: 'comprobacion', label: '1. Comprobación' },
                    { id: 'anticipo', label: '2. Anticipo' },
                    { id: 'ambas', label: 'Ambas (COMPROBACIÓN + ANTICIPO)' },
                  ].map((m) => (
                    <Button
                      key={m.id}
                      type="button"
                      variant={modoHojas === m.id ? 'default' : 'outline'}
                      size="xs"
                      onClick={() => setModoHojas(m.id)}
                      className="text-[11px] h-6 px-2 font-medium"
                    >
                      {m.label}
                    </Button>
                  ))}
                </div>
              </div>
              <TypographyMuted className="text-[11px] block">
                {modoHojas === 'ambas'
                  ? '✓ El archivo contendrá 2 pestañas separadas ("COMPROBACION" y "ANTICIPO") listas para RH y Finanzas.'
                  : modoHojas === 'comprobacion'
                  ? 'Genera únicamente la pestaña de comprobación de gastos con saldo a favor.'
                  : 'Genera únicamente la pestaña de proyección y solicitud de anticipo.'}
              </TypographyMuted>
            </Card>

            {/* 2. SELECTOR DE INGENIERO Y DATOS DE CABECERA */}
            <Card className="p-3 bg-muted/20 border-border/80 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-60">
                  <UserGear weight="duotone" className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1">
                    <Label className="text-[11px] text-muted-foreground">Ingeniero responsable</Label>
                    {!isAdmin ? (
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="font-semibold text-xs px-2.5 py-1.5 rounded-md bg-card border border-border/60 flex-1 truncate">
                          {ingenieroActivo}
                        </div>
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30 shrink-0">
                          Tu Ficha Oficial
                        </Badge>
                      </div>
                    ) : (
                      <Select
                        value={ingenieroActivo}
                        onValueChange={(val) => onSelectIngeniero(val)}
                      >
                        <SelectTrigger size="sm" className="mt-0.5 bg-card font-semibold">
                          <SelectValue placeholder="Selecciona un ingeniero" />
                        </SelectTrigger>
                        <SelectContent>
                          {ingenieros.map((ing) => (
                            <SelectItem key={ing.nombre} value={ing.nombre}>
                              {ing.nombre} ({ing.region || 'SURESTE'})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <Button
                  type="button"
                  variant={editandoPerfil ? 'secondary' : 'outline'}
                  size="xs"
                  onClick={() => setEditandoPerfil((v) => !v)}
                >
                  <CarProfile weight="duotone" />
                  {editandoPerfil ? 'Ocultar ficha vehicular' : 'Editar auto / tarjeta / CECO'}
                </Button>
              </div>

              {!editandoPerfil ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                  <div className="rounded-md bg-card px-2.5 py-1.5 border border-border/60">
                    <span className="text-[10px] text-muted-foreground block">No. Empleado / CECO</span>
                    <TypographyMono className="font-semibold text-xs">
                      {formIng.no_empleado || 'Sin asignar'} · {formIng.ceco || '108266'}
                    </TypographyMono>
                  </div>
                  <div className="rounded-md bg-card px-2.5 py-1.5 border border-border/60">
                    <span className="text-[10px] text-muted-foreground block">Vehículo / Placas</span>
                    <TypographyMono className="font-semibold text-xs">
                      {formIng.automovil || '—'} · {formIng.placas || '—'}
                    </TypographyMono>
                  </div>
                  <div className="rounded-md bg-card px-2.5 py-1.5 border border-border/60">
                    <span className="text-[10px] text-muted-foreground block">Tarjeta Gasolina</span>
                    <TypographyMono className="font-semibold text-xs truncate block">
                      {formIng.tarjeta_gasolina || '—'}
                    </TypographyMono>
                  </div>
                  <div className="rounded-md bg-card px-2.5 py-1.5 border border-border/60">
                    <span className="text-[10px] text-muted-foreground block">Rendimiento / Litro</span>
                    <TypographyMono className="font-semibold text-xs">
                      {formIng.rendimiento} km/L · ${formIng.costo_litro}
                    </TypographyMono>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 pt-2 border-t border-border/60">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[11px]">No. Empleado</Label>
                      <Input
                        size="sm"
                        value={formIng.no_empleado}
                        onChange={(e) => setFormIng((f) => ({ ...f, no_empleado: e.target.value }))}
                        className="bg-card font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">No. Tarjeta Gasolina</Label>
                      <Input
                        size="sm"
                        value={formIng.tarjeta_gasolina}
                        onChange={(e) =>
                          setFormIng((f) => ({ ...f, tarjeta_gasolina: e.target.value }))
                        }
                        className="bg-card font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">CECO</Label>
                      <Input
                        size="sm"
                        value={formIng.ceco}
                        onChange={(e) => setFormIng((f) => ({ ...f, ceco: e.target.value }))}
                        className="bg-card font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[11px]">Automóvil</Label>
                      <Input
                        size="sm"
                        value={formIng.automovil}
                        onChange={(e) => setFormIng((f) => ({ ...f, automovil: e.target.value }))}
                        className="bg-card"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Placas</Label>
                      <Input
                        size="sm"
                        value={formIng.placas}
                        onChange={(e) => setFormIng((f) => ({ ...f, placas: e.target.value }))}
                        className="bg-card font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">No. Serie Vehicular (VIN)</Label>
                      <Input
                        size="sm"
                        value={formIng.serie}
                        onChange={(e) => setFormIng((f) => ({ ...f, serie: e.target.value }))}
                        className="bg-card font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button size="xs" onClick={guardarPerfil} disabled={guardandoPerfil}>
                      <FloppyDiskBack weight="duotone" />
                      {guardandoPerfil ? 'Guardando…' : 'Guardar Ficha'}
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            {/* 3. SEMANA AUTOMÁTICA Y ODÓMETRO */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Semana</Label>
                  <span className="text-[10px] text-primary font-medium">Auto ISO</span>
                </div>
                <Input
                  size="sm"
                  type="number"
                  min="1"
                  max="53"
                  value={semana}
                  onChange={(e) => setSemana(Number(e.target.value) || 1)}
                  className="font-mono font-semibold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kilómetro Inicial</Label>
                <Input
                  size="sm"
                  type="number"
                  value={kmInicial}
                  onChange={(e) => setKmInicial(Number(e.target.value) || 0)}
                  className="font-mono font-semibold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kilómetro Final (Auto)</Label>
                <Input
                  size="sm"
                  value={resumenTotales.kmFinal.toLocaleString('es-MX')}
                  readOnly
                  className="font-mono bg-muted/50"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Dispersión ($)</Label>
                <Input
                  size="sm"
                  type="number"
                  step="0.01"
                  value={dispersion || ''}
                  onChange={(e) => setDispersion(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="font-mono"
                />
              </div>
            </div>

            {/* 4. DÍAS INCLUIDOS (SEPARADOS POR COMPROBACIÓN Y ANTICIPO) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5 font-semibold">
                  <CalendarCheck weight="duotone" className="h-4 w-4 text-primary" />
                  <span>Días incluidos para la bitácora</span>
                </Label>
              </div>

              {/* Selector de pestaña de días si el modo es 'ambas' */}
              {modoHojas === 'ambas' && (
                <div className="grid grid-cols-2 p-0.5 rounded-lg bg-muted/60 border border-border/50 text-xs">
                  <button
                    type="button"
                    onClick={() => setSubTabDias('comprobacion')}
                    className={cn(
                      'flex items-center justify-center gap-1.5 py-1 px-3 rounded-md transition-all cursor-pointer font-medium',
                      subTabDias === 'comprobacion'
                        ? 'bg-blue-600 text-white font-semibold shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <GasPump weight="duotone" className="h-3.5 w-3.5" />
                    <span>⛽ 1. Comprobación ({diasComprobacion.length} días)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubTabDias('anticipo')}
                    className={cn(
                      'flex items-center justify-center gap-1.5 py-1 px-3 rounded-md transition-all cursor-pointer font-medium',
                      subTabDias === 'anticipo'
                        ? 'bg-amber-600 text-white font-semibold shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Receipt weight="duotone" className="h-3.5 w-3.5" />
                    <span>📋 2. Anticipo ({diasAnticipo.length} días)</span>
                  </button>
                </div>
              )}

              {/* LISTA COMPROBACIÓN */}
              {(modoHojas === 'comprobacion' || (modoHojas === 'ambas' && subTabDias === 'comprobacion')) && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="text-[11px]">
                      ⛽ Comprobación de la semana {semana} (Lunes a Sábado concluida)
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="text-[10px] h-6 px-1.5 text-muted-foreground"
                      onClick={() => setIdsComprobacionSel([])}
                    >
                      Limpiar
                    </Button>
                  </div>

                  <Card className="divide-y divide-border max-h-48 overflow-y-auto">
                    {rutaActual?.paradas?.length > 0 && rutaActual?.tipo !== 'anticipo' && (
                      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-primary/5">
                        <div className="flex items-center gap-2 min-w-0">
                          <Switch
                            checked={incluirRutaActual}
                            onCheckedChange={setIncluirRutaActual}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="default" className="text-[10px] px-1.5 py-0">
                                Ruta activa en pantalla
                              </Badge>
                              <Badge variant="outline" className="text-[9px] uppercase px-1 py-0 text-blue-600 border-blue-500/40">
                                Comprobación
                              </Badge>
                              <TypographySmall className="font-semibold text-xs">
                                {fechaMX(rutaActual.fecha)}
                              </TypographySmall>
                            </div>
                            <TypographyMuted className="text-[11px] truncate block">
                              {rutaActual.paradas.map((p) => p.nombre).join(' → ')}
                            </TypographyMuted>
                          </div>
                        </div>
                      </div>
                    )}

                    {historial
                      .filter((h) => {
                        const fechasCompValidas = new Set(
                          cicloNetoModal.diasSemanaNatural.slice(0, 6).map((d) => d.fecha)
                        );
                        return fechasCompValidas.has(h.fecha) && (h.tipo === 'comprobacion' || !h.tipo);
                      })
                      .map((h) => {
                        const esMismaActual =
                          incluirRutaActual &&
                          rutaActual?.id === h.id &&
                          rutaActual?.tipo !== 'anticipo';
                        const checked = esMismaActual || idsComprobacionSel.includes(h.id);
                        return (
                          <div
                            key={h.id}
                            onClick={() => !esMismaActual && toggleComprobacionId(h.id)}
                            className={cn(
                              'flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer transition-colors hover:bg-accent/50',
                              checked && 'bg-blue-500/10'
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Switch
                                checked={checked}
                                disabled={esMismaActual}
                                onCheckedChange={() => !esMismaActual && toggleComprobacionId(h.id)}
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <TypographySmall className="font-medium">
                                    {fechaMX(h.fecha)}
                                  </TypographySmall>
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] uppercase px-1 py-0 text-blue-600 border-blue-500/40 bg-blue-500/10"
                                  >
                                    Comprobación
                                  </Badge>
                                  {h.nombre && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 truncate max-w-28">
                                      {h.nombre}
                                    </Badge>
                                  )}
                                </div>
                                <TypographyMuted className="text-[11px] truncate block">
                                  {(h.paradas || []).map((p) => p.nombre).join(' → ')}
                                </TypographyMuted>
                              </div>
                            </div>
                            <TypographyMono className="text-[11px] text-muted-foreground shrink-0 font-semibold">
                              {h.totalKm} km
                            </TypographyMono>
                          </div>
                        );
                      })}
                  </Card>
                </div>
              )}

              {/* LISTA ANTICIPO */}
              {(modoHojas === 'anticipo' || (modoHojas === 'ambas' && subTabDias === 'anticipo')) && (
                <div className="space-y-2">
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1 bg-background/80 p-0.5 rounded-md border border-amber-500/30 text-xs">
                        <button
                          type="button"
                          onClick={() => setVarianteAnticipo('ciclo_neto')}
                          className={cn(
                            'px-2 py-0.5 rounded text-[10.5px] font-semibold transition-all cursor-pointer',
                            varianteAnticipo === 'ciclo_neto'
                              ? 'bg-amber-600 text-white shadow-xs'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                          title="Martes a Sábado + Lunes siguiente"
                        >
                          ⭐ Ciclo Neto (Mar ➔ Lun próx)
                        </button>
                        <button
                          type="button"
                          onClick={() => setVarianteAnticipo('semana_natural')}
                          className={cn(
                            'px-2 py-0.5 rounded text-[10.5px] font-semibold transition-all cursor-pointer',
                            varianteAnticipo === 'semana_natural'
                              ? 'bg-amber-600 text-white shadow-xs'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                          title="Lunes a Sábado de esta semana"
                        >
                          Semana Natural (Lun ➔ Sáb)
                        </button>
                      </div>

                      {varianteAnticipo === 'ciclo_neto' && (
                        <button
                          type="button"
                          onClick={() => setIncluirLunesOlvido((p) => !p)}
                          className={cn(
                            'flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] border transition-all cursor-pointer shrink-0',
                            incluirLunesOlvido
                              ? 'border-amber-500 bg-amber-500/20 text-amber-800 dark:text-amber-200 font-bold'
                              : 'border-border/70 bg-background/80 text-muted-foreground hover:text-foreground'
                          )}
                          title="¿Se te olvidó pedir el lunes la semana pasada? Actívalo aquí para incluirlo en este anticipo"
                        >
                          <span>{incluirLunesOlvido ? '✓ Incluye LUN actual' : '+ LUN actual (olvido)'}</span>
                        </button>
                      )}
                    </div>

                    <div className="text-[11px] text-amber-800 dark:text-amber-300 leading-tight flex items-center gap-1.5">
                      <span>💡</span>
                      <span>
                        {varianteAnticipo === 'ciclo_neto'
                          ? 'El depósito cae lunes tarde. Este anticipo contempla hasta el lunes siguiente para arrancar con saldo.'
                          : 'Anticipo configurado por semana natural (Lunes a Sábado).'}
                      </span>
                    </div>
                  </div>

                  <Card className="divide-y divide-border max-h-48 overflow-y-auto">
                    {rutaActual?.paradas?.length > 0 && rutaActual?.tipo === 'anticipo' && (
                      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-500/10">
                        <div className="flex items-center gap-2 min-w-0">
                          <Switch
                            checked={incluirRutaActual}
                            onCheckedChange={setIncluirRutaActual}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-amber-600 text-white">
                                Ruta activa en pantalla
                              </Badge>
                              <Badge variant="outline" className="text-[9px] uppercase px-1 py-0 text-amber-600 border-amber-500/40">
                                Anticipo
                              </Badge>
                              <TypographySmall className="font-semibold text-xs">
                                {fechaMX(rutaActual.fecha)}
                              </TypographySmall>
                            </div>
                            <TypographyMuted className="text-[11px] truncate block">
                              {rutaActual.paradas.map((p) => p.nombre).join(' → ')}
                            </TypographyMuted>
                          </div>
                        </div>
                      </div>
                    )}

                    {historial
                      .filter((h) => {
                        const fechasAntValidas = new Set(cicloNetoModal.dias.map((d) => d.fecha));
                        return fechasAntValidas.has(h.fecha) && h.tipo === 'anticipo';
                      })
                      .map((h) => {
                        const esMismaActual =
                          incluirRutaActual &&
                          rutaActual?.id === h.id &&
                          rutaActual?.tipo === 'anticipo';
                        const checked = esMismaActual || idsAnticipoSel.includes(h.id);
                        const esProx = h.fecha === cicloNetoModal.fechaProximoLunes;
                        return (
                          <div
                            key={h.id}
                            onClick={() => !esMismaActual && toggleAnticipoId(h.id)}
                            className={cn(
                              'flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer transition-colors hover:bg-accent/50',
                              checked && 'bg-amber-500/10'
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Switch
                                checked={checked}
                                disabled={esMismaActual}
                                onCheckedChange={() => !esMismaActual && toggleAnticipoId(h.id)}
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <TypographySmall className="font-medium">
                                    {fechaMX(h.fecha)}
                                  </TypographySmall>
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] uppercase px-1 py-0 text-amber-600 border-amber-500/40 bg-amber-500/10"
                                  >
                                    Anticipo
                                  </Badge>
                                  {esProx && (
                                    <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">
                                      ⭐ Lun próx (Sem +1)
                                    </Badge>
                                  )}
                                  {h.nombre && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 truncate max-w-28">
                                      {h.nombre}
                                    </Badge>
                                  )}
                                </div>
                                <TypographyMuted className="text-[11px] truncate block">
                                  {(h.paradas || []).map((p) => p.nombre).join(' → ')}
                                </TypographyMuted>
                              </div>
                            </div>
                            <TypographyMono className="text-[11px] text-muted-foreground shrink-0 font-semibold">
                              {h.totalKm} km
                            </TypographyMono>
                          </div>
                        );
                      })}
                  </Card>
                </div>
              )}
            </div>

            {/* 5. OBSERVACIONES POR HOJA */}
            {(modoHojas === 'ambas' || modoHojas === 'anticipo') && (
              <div className="space-y-1">
                <Label className="text-xs">Observaciones Anticipo (Semana {semana})</Label>
                <Textarea
                  rows={2}
                  value={obsAnticipo}
                  onChange={(e) => setObsAnticipo(e.target.value)}
                  className="text-xs"
                />
              </div>
            )}

            {(modoHojas === 'ambas' || modoHojas === 'comprobacion') && (
              <div className="space-y-1">
                <Label className="text-xs">Observaciones Comprobación (Semana {semana})</Label>
                <Textarea
                  rows={2}
                  value={obsComprobacion}
                  onChange={(e) => setObsComprobacion(e.target.value)}
                  className="text-xs"
                />
              </div>
            )}

            {/* 6. RESUMEN Y BOTONES DE ACCIÓN */}
            <Card className="p-3 bg-primary/5 border-primary/25 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <GasPump weight="duotone" className="h-5 w-5" />
                </div>
                <div>
                  {modoHojas === 'ambas' ? (
                    <div className="space-y-0.5">
                      <TypographySmall className="font-semibold block text-xs">
                        ⛽ Comprobación: {resumenComprobacion.km} km · {resumenComprobacion.litros.toFixed(1)} L · {pesos(resumenComprobacion.importe)} ({diasComprobacion.length} días)
                      </TypographySmall>
                      <TypographySmall className="font-semibold block text-xs text-amber-700 dark:text-amber-400">
                        📋 Anticipo: {resumenAnticipo.km} km · {resumenAnticipo.litros.toFixed(1)} L · {pesos(resumenAnticipo.importe)} ({diasAnticipo.length} días · {varianteAnticipo === 'ciclo_neto' ? 'incluye Lun próx' : 'semana natural'})
                      </TypographySmall>
                    </div>
                  ) : (
                    <div>
                      <TypographySmall className="font-semibold block">
                        Total: {resumenTotales.km} km · {resumenTotales.litros.toFixed(1)} L · {pesos(resumenTotales.importe)}
                      </TypographySmall>
                      <TypographyMuted className="text-xs">
                        Odómetro: {Number(kmInicial).toLocaleString()} → {resumenTotales.kmFinal.toLocaleString()} km · {modoHojas === 'anticipo' ? diasAnticipo.length : diasComprobacion.length} días
                      </TypographyMuted>
                    </div>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={guardarEnSupabase}
                disabled={guardandoSupabase || (diasComprobacion.length === 0 && diasAnticipo.length === 0)}
              >
                <FloppyDiskBack weight="duotone" />
                <span>{guardandoSupabase ? 'Archivando...' : 'Archivar en Servidor'}</span>
              </Button>
            </Card>
          </TabsContent>

          {/* ================= PESTAÑA 2: HISTORIAL DE SEMANAS GUARDADAS ================= */}
          <TabsContent value="guardadas" className="space-y-3 pt-2">
            {bitacorasGuardadas.length === 0 ? (
              <Card className="p-8 text-center bg-muted/15 border-dashed">
                <TypographyMuted className="text-xs">
                  No hay bitácoras semanales archivadas todavía.
                  Al generar o presionar "Archivar en Servidor" se guardarán aquí para descargarlas cuando quieras.
                </TypographyMuted>
              </Card>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {bitacorasGuardadas.map((b) => (
                  <Card key={`${b.ingeniero}-${b.anio}-${b.semana}`} className="p-3 hover:border-primary/40 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <TypographySmall className="font-semibold">
                            Semana {b.semana} ({b.anio})
                          </TypographySmall>
                          <Badge variant="outline" className="text-[10px]">
                            {b.tipo === 'ambas'
                              ? 'Anticipo + Comprobación'
                              : b.tipo.toUpperCase()}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate">
                            {b.ingeniero.split(' ')[0]}
                          </span>
                        </div>
                        <TypographyMuted className="text-[11px] mt-0.5">
                          {b.total_km} km recorridos · {pesos(b.total_importe || 0)} · Odómetro ini: {Number(b.km_inicial || 0).toLocaleString()}
                        </TypographyMuted>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="xs"
                          onClick={() => {
                            handleDescargarExcel({
                              modo: b.tipo || 'ambas',
                              ingeniero: formIng,
                              semana: b.semana,
                              kmInicial: b.km_inicial,
                              rendimiento: b.rendimiento,
                              costoLitro: b.costo_litro,
                              dispersion: b.dispersion,
                              complementos: b.complementos,
                              observacionesAnticipo: b.observaciones_anticipo,
                              observacionesComprobacion: b.observaciones_comprobacion,
                              diasAnticipo: b.dias_anticipo || [],
                              diasComprobacion: b.dias_comprobacion || [],
                              puntosNuevos: b.puntos_nuevos || [],
                            });
                          }}
                        >
                          <DownloadSimple weight="bold" />
                          Descargar .xlsx
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={async () => {
                            await api('DELETE', '/api/bitacoras', {
                              ingeniero: b.ingeniero,
                              semana: b.semana,
                              anio: b.anio,
                            });
                            setBitacorasGuardadas((prev) =>
                              prev.filter(
                                (x) =>
                                  !(
                                    x.ingeniero === b.ingeniero &&
                                    x.semana === b.semana &&
                                    x.anio === b.anio
                                  )
                              )
                            );
                            toast(`Bitácora Semana ${b.semana} eliminada`);
                          }}
                        >
                          <Trash className="text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {modalTab === 'generador' && (
            <Button
              size="lg"
              className={cn(
                'text-white',
                perfilCompleto
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-muted-foreground/50 cursor-not-allowed opacity-75'
              )}
              onClick={() => {
                if (!perfilCompleto) {
                  toast('Debes completar tu ficha vehicular antes de descargar la bitácora', 'err');
                  onOpenProfile?.();
                  return;
                }
                handleDescargarExcel();
              }}
              disabled={
                descargando ||
                (diasComprobacion.length === 0 && diasAnticipo.length === 0) ||
                !perfilCompleto
              }
            >
              <FileXls weight="duotone" className="h-4 w-4" />
              <span>
                {!perfilCompleto
                  ? 'Configura tu ficha vehicular para descargar'
                  : descargando
                  ? 'Generando archivo Excel…'
                  : modoHojas === 'ambas'
                  ? `Descargar Excel (Anticipo + Comprobación)`
                  : `Descargar Bitácora (.xlsx)`}
              </span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
