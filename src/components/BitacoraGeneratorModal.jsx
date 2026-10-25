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
  CheckCircle,
  FloppyDiskBack,
  Sparkle,
  Plus,
  Trash,
  GasPump,
  CarProfile,
  ClockCounterClockwise,
  DownloadSimple,
  Stack,
  ArrowSquareOut,
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
import { cn, fechaMX, pesos, api } from '@/lib/utils';

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
  const [idsHistorialSel, setIdsHistorialSel] = useState([]);
  const [puntosNuevosExtra, setPuntosNuevosExtra] = useState([]);
  const [descargando, setDescargando] = useState(false);
  const [guardandoSupabase, setGuardandoSupabase] = useState(false);

  // Lista de bitácoras guardadas en Supabase / local
  const [bitacorasGuardadas, setBitacorasGuardadas] = useState([]);

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

  // Cargar lista de bitácoras guardadas al abrir el modal
  useEffect(() => {
    if (open) {
      api('GET', '/api/bitacoras')
        .then((data) => {
          if (Array.isArray(data)) setBitacorasGuardadas(data);
        })
        .catch(() => {});
    }
  }, [open]);

  // Selección de días consolidados (hasta 7 días por hoja)
  const diasConsolidados = useMemo(() => {
    const lista = [];

    if (incluirRutaActual && rutaActual?.paradas?.length > 0) {
      const tramosAct = construirTramosDeRuta(
        {
          ...rutaActual,
          baseNombre,
          tramos: tramosActuales,
        },
        porNombre,
        baseNombre
      );
      lista.push({
        id: 'actual',
        fecha: rutaActual.fecha,
        nombre: rutaActual.nombre || 'Ruta activa',
        paradas: rutaActual.paradas,
        tramos: tramosAct,
      });
    }

    for (const id of idsHistorialSel) {
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
  }, [incluirRutaActual, rutaActual, tramosActuales, idsHistorialSel, historial, porNombre, baseNombre]);

  // Detección automática de puntos especiales
  const puntosNuevosDetectados = useMemo(() => {
    const mapa = new Map();
    diasConsolidados.forEach((d) => {
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
  }, [diasConsolidados, puntosNuevosExtra]);

  const resumenTotales = useMemo(() => {
    const km = diasConsolidados.reduce(
      (acc, d) => acc + d.tramos.reduce((s, t) => s + (t.km || 0), 0),
      0
    );
    const rend = Number(formIng.rendimiento) || 12.5;
    const precio = Number(formIng.costo_litro) || 23.99;
    const litros = km / rend;
    const importe = litros * precio;
    return { km, litros, importe, kmFinal: (Number(kmInicial) || 0) + km };
  }, [diasConsolidados, formIng.rendimiento, formIng.costo_litro, kmInicial]);

  const guardarPerfil = async () => {
    setGuardandoPerfil(true);
    try {
      const listaActualizada = await api('PATCH', '/api/ingenieros', {
        ...formIng,
        km_inicial_ultimo: Number(kmInicial) || 0,
      });
      onSaveIngeniero(listaActualizada, formIng);
      setEditandoPerfil(false);
      toast('Perfil de ingeniero sincronizado con Supabase');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setGuardandoPerfil(false);
    }
  };

  const guardarEnSupabase = async () => {
    if (!perfilCompleto) {
      toast('Completa tu ficha vehicular antes de guardar la bitácora en la nube', 'err');
      onOpenProfile?.();
      return;
    }
    if (diasConsolidados.length === 0) {
      return toast('Agrega al menos una ruta antes de guardar la bitácora', 'err');
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
        dias_anticipo: diasConsolidados,
        dias_comprobacion: diasConsolidados,
        puntos_nuevos: puntosNuevosDetectados,
        total_km: resumenTotales.km,
        total_importe: Math.round(resumenTotales.importe * 100) / 100,
      };
      await api('POST', '/api/bitacoras', payload);
      const lista = await api('GET', '/api/bitacoras');
      setBitacorasGuardadas(lista);
      toast(`Bitácora Semana ${semana} (${anio}) guardada en Supabase`);
    } catch (e) {
      toast('Error guardando en Supabase: ' + e.message, 'err');
    } finally {
      setGuardandoSupabase(false);
    }
  };

  const handleDescargarExcel = async (overrideData = null) => {
    if (!overrideData && !perfilCompleto) {
      toast('No se puede generar la bitácora: Ficha vehicular incompleta. Configura tus datos primero.', 'err');
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
      dias: diasConsolidados,
      puntosNuevos: puntosNuevosDetectados,
    };

    if (!overrideData && diasConsolidados.length === 0) {
      return toast(
        'Agrega al menos una parada a tu ruta o selecciona un día del historial',
        'err'
      );
    }

    setDescargando(true);
    try {
      // Auto-guardar en base de datos para que quede disponible en el historial
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

  const toggleHistorialId = (id) => {
    setIdsHistorialSel((prev) =>
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
                  Genera el formato corporativo con pestañas de Comprobación y Anticipo, fórmulas y almacenamiento en Supabase.
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
                    { id: 'ambas', label: 'Ambas (COMPROBACION + ANTICIPO)' },
                    { id: 'comprobacion', label: 'Solo Comprobación' },
                    { id: 'anticipo', label: 'Solo Anticipo' },
                  ].map((m) => (
                    <Button
                      key={m.id}
                      type="button"
                      variant={modoHojas === m.id ? 'default' : 'outline'}
                      size="xs"
                      onClick={() => setModoHojas(m.id)}
                      className="text-[11px] h-6 px-2"
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
                      {guardandoPerfil ? 'Guardando…' : 'Guardar en Supabase'}
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

            {/* 4. DÍAS INCLUIDOS (HASTA 7 BLOQUES POR HOJA) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5">
                  <CalendarCheck weight="duotone" className="h-4 w-4 text-primary" />
                  <span>Días incluidos en la semana ({diasConsolidados.length} de 7 bloques)</span>
                </Label>
                <TypographyMuted className="text-[11px]">
                  Bloques 17..72 en el Excel oficial
                </TypographyMuted>
              </div>

              <Card className="divide-y divide-border max-h-44 overflow-y-auto">
                {rutaActual?.paradas?.length > 0 && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-primary/5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Switch
                        checked={incluirRutaActual}
                        onCheckedChange={setIncluirRutaActual}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="default" className="text-[10px] px-1.5 py-0">
                            Ruta activa
                          </Badge>
                          <TypographySmall className="font-semibold">
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

                {historial.map((h) => {
                  const esMismaActual = incluirRutaActual && rutaActual?.id === h.id;
                  const checked = esMismaActual || idsHistorialSel.includes(h.id);
                  return (
                    <div
                      key={h.id}
                      onClick={() => !esMismaActual && toggleHistorialId(h.id)}
                      className={cn(
                        'flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer transition-colors hover:bg-accent/50',
                        checked && 'bg-accent/30'
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Switch
                          checked={checked}
                          disabled={esMismaActual}
                          onCheckedChange={() => !esMismaActual && toggleHistorialId(h.id)}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <TypographySmall className="font-medium">
                              {fechaMX(h.fecha)}
                            </TypographySmall>
                            {h.nombre && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {h.nombre}
                              </Badge>
                            )}
                          </div>
                          <TypographyMuted className="text-[11px] truncate block">
                            {(h.paradas || []).map((p) => p.nombre).join(' → ')}
                          </TypographyMuted>
                        </div>
                      </div>
                      <TypographyMono className="text-[11px] text-muted-foreground shrink-0">
                        {h.totalKm} km
                      </TypographyMono>
                    </div>
                  );
                })}
              </Card>
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
                  <TypographySmall className="font-semibold block">
                    Total: {resumenTotales.km} km · {resumenTotales.litros.toFixed(1)} L · {pesos(resumenTotales.importe)}
                  </TypographySmall>
                  <TypographyMuted className="text-xs">
                    Odómetro: {Number(kmInicial).toLocaleString()} → {resumenTotales.kmFinal.toLocaleString()} km · {diasConsolidados.length} días
                  </TypographyMuted>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={guardarEnSupabase}
                disabled={guardandoSupabase || diasConsolidados.length === 0}
              >
                <FloppyDiskBack weight="duotone" />
                {guardandoSupabase ? 'Guardando…' : 'Guardar en Supabase'}
              </Button>
            </Card>
          </TabsContent>

          {/* ================= PESTAÑA 2: HISTORIAL DE SEMANAS GUARDADAS ================= */}
          <TabsContent value="guardadas" className="space-y-3 pt-2">
            {bitacorasGuardadas.length === 0 ? (
              <Card className="p-8 text-center bg-muted/15 border-dashed">
                <TypographyMuted className="text-xs">
                  No hay bitácoras semanales guardadas todavía en Supabase.
                  Al generar o presionar "Guardar en Supabase" se archivarán aquí para descargarlas cuando quieras.
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
              disabled={descargando || diasConsolidados.length === 0 || !perfilCompleto}
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
