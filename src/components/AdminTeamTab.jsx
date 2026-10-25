/**
 * @fileoverview Panel de Administración y Gestión del Equipo de Soporte (`AdminTeamTab.jsx`).
 * Exclusivo para el Administrador del Sistema (Herwing Eduardo Vázquez Macías).
 *
 * Funcionalidades clave:
 * 1. Resumen ejecutivo de la red: total sucursales, porcentaje verificado, pendientes, bitácoras activas.
 * 2. Directorio de ingenieros con su ficha vehicular completa (Placas, Serie, CECO, Tarjeta de Gasolina).
 * 3. Edición en tiempo real de los datos del ingeniero sincronizados con Supabase (`rutas_sureste.ingenieros`).
 * 4. Consola de auditoría de bitácoras semanales guardadas en Supabase por cualquier ingeniero con descarga directa en Excel.
 * 5. Reasignación rápida de tiendas y balance de cobertura por ingeniero/región.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  UsersThree,
  CarProfile,
  GasPump,
  FileXls,
  ClockCounterClockwise,
  CheckCircle,
  WarningCircle,
  PencilSimple,
  DownloadSimple,
  Storefront,
  MagnifyingGlass,
  PlusCircle,
  Buildings,
  IdentificationBadge,
} from '@phosphor-icons/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  TypographyH4,
  TypographySmall,
  TypographyMuted,
  TypographyMono,
} from '@/components/ui/typography';
import { ActionTooltip } from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabase';
import { descargarBitacoraNetoExcel } from '@/lib/bitacora-excel';
import { pesos, cn } from '@/lib/utils';

export function AdminTeamTab({
  ingenieros,
  onUpdateIngeniero,
  tiendas,
  toast,
  onOpenBitacoraModal,
  porNombre,
  ajustes,
}) {
  const [subTab, setSubTab] = useState('equipo'); // 'equipo' | 'bitacoras' | 'cobertura'
  const [filtroTexto, setFiltroTexto] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [ingenieroAEditar, setIngenieroAEditar] = useState(null);
  const [guardando, setGuardando] = useState(false);

  // Bitácoras globales en Supabase
  const [bitacorasGlobales, setBitacorasGlobales] = useState([]);
  const [cargandoBitacoras, setCargandoBitacoras] = useState(false);
  const [filtroIngenieroBitacora, setFiltroIngenieroBitacora] = useState('todos');

  // Cargar bitácoras globales desde Supabase
  const cargarBitacorasGlobales = async () => {
    setCargandoBitacoras(true);
    try {
      const { data, error } = await supabase
        .from('bitacoras_semanales')
        .select('*')
        .order('anio', { ascending: false })
        .order('semana', { ascending: false });

      if (error) throw error;
      setBitacorasGlobales(data || []);
    } catch (err) {
      console.warn('Error cargando bitácoras globales de Supabase:', err.message);
    } finally {
      setCargandoBitacoras(false);
    }
  };

  useEffect(() => {
    cargarBitacorasGlobales();
  }, []);

  // Estadísticas globales del sistema
  const stats = useMemo(() => {
    const total = tiendas.length;
    const verificadas = tiendas.filter((t) => t.verificada).length;
    const pendientes = total - verificadas;
    const totalKm = bitacorasGlobales.reduce((acc, b) => acc + (Number(b.total_km) || 0), 0);
    const totalImporte = bitacorasGlobales.reduce((acc, b) => acc + (Number(b.total_importe) || 0), 0);

    return {
      totalTiendas: total,
      verificadas,
      pendientes,
      porcentajeVerif: total ? Math.round((verificadas / total) * 100) : 0,
      totalIngenieros: ingenieros.length,
      totalBitacoras: bitacorasGlobales.length,
      totalKm,
      totalImporte,
    };
  }, [tiendas, ingenieros, bitacorasGlobales]);

  // Cobertura de tiendas agrupada por ingeniero
  const coberturaPorIngeniero = useMemo(() => {
    const mapa = new Map();
    ingenieros.forEach((ing) => {
      mapa.set(ing.nombre, {
        ingeniero: ing,
        total: 0,
        verificadas: 0,
        pendientes: 0,
        tiendas: [],
      });
    });

    tiendas.forEach((t) => {
      const ingNombre = t.ingeniero || 'SIN ASIGNAR';
      if (!mapa.has(ingNombre)) {
        mapa.set(ingNombre, {
          ingeniero: { nombre: ingNombre, region: t.region || 'DESCONOCIDA' },
          total: 0,
          verificadas: 0,
          pendientes: 0,
          tiendas: [],
        });
      }
      const item = mapa.get(ingNombre);
      item.total++;
      if (t.verificada) item.verificadas++;
      else item.pendientes++;
      item.tiendas.push(t);
    });

    return Array.from(mapa.values());
  }, [tiendas, ingenieros]);

  // Abrir editor para un ingeniero
  const handleEditarClick = (ing) => {
    setIngenieroAEditar({
      ...ing,
      puesto: ing.puesto || 'INGENIERO DE SOPORTE TECNICO',
      region: ing.region || 'TUXTLA',
      automovil: ing.automovil || 'AVEO',
      placas: ing.placas || '',
      serie: ing.serie || '',
      ceco: ing.ceco || '108266',
      tarjeta_gasolina: ing.tarjeta_gasolina || '',
      rendimiento: ing.rendimiento || 12.5,
      costo_litro: ing.costo_litro || 23.99,
      base_nombre: ing.base_nombre || 'RESGUARDO TUXTLA',
      no_empleado: ing.no_empleado || '',
      email: ing.email || '',
      rol: ing.rol || 'ingeniero',
    });
    setEditModalOpen(true);
  };

  // Guardar cambios del perfil vehicular
  const handleGuardarPerfil = async () => {
    if (!ingenieroAEditar) return;
    setGuardando(true);
    try {
      const actual = {
        ...ingenieroAEditar,
        rendimiento: Number(ingenieroAEditar.rendimiento) || 12.5,
        costo_litro: Number(ingenieroAEditar.costo_litro) || 23.99,
        km_inicial_ultimo: Number(ingenieroAEditar.km_inicial_ultimo) || 0,
      };

      // 1. Guardar en Supabase
      const { error } = await supabase
        .from('ingenieros')
        .upsert(
          {
            nombre: actual.nombre,
            puesto: actual.puesto,
            no_empleado: actual.no_empleado,
            tarjeta_gasolina: actual.tarjeta_gasolina,
            automovil: actual.automovil,
            placas: actual.placas,
            serie: actual.serie,
            ceco: actual.ceco,
            region: actual.region,
            rendimiento: actual.rendimiento,
            costo_litro: actual.costo_litro,
            base_nombre: actual.base_nombre,
            email: actual.email,
            rol: actual.rol,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'nombre' }
        );

      if (error) throw error;

      // 2. Actualizar estado local a través del callback
      if (onUpdateIngeniero) {
        onUpdateIngeniero(actual);
      }

      toast(`Perfil vehicular de ${actual.nombre.split(' ')[0]} actualizado con éxito`);
      setEditModalOpen(false);
    } catch (err) {
      toast('Error actualizando perfil: ' + err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  // Descargar bitácora semanal oficial de cualquier ingeniero
  const handleDescargarBitacora = async (b) => {
    try {
      toast('Generando archivo Excel corporativo…');
      const ing = ingenieros.find((i) => i.nombre === b.ingeniero) || {
        nombre: b.ingeniero,
        automovil: 'AVEO',
        placas: 'PEB-798-C',
        serie: 'LZWPRMGN0TF108615',
        no_empleado: '1221362',
        ceco: '108266',
        region: 'TUXTLA',
        puesto: 'INGENIERO DE SOPORTE TECNICO',
        tarjeta_gasolina: '5064490100458236',
      };

      await descargarBitacoraNetoExcel({
        modo: b.tipo || 'ambas',
        ingeniero: ing,
        semana: b.semana,
        anio: b.anio || new Date().getFullYear(),
        kmInicial: b.km_inicial || 0,
        rendimiento: b.rendimiento || 12.5,
        costoLitro: b.costo_litro || 23.99,
        dispersion: b.dispersion || 0,
        complementos: b.complementos || 0,
        observacionesAnticipo: b.observaciones_anticipo || '',
        observacionesComprobacion: b.observaciones_comprobacion || '',
        diasAnticipo: b.dias_anticipo || [],
        diasComprobacion: b.dias_comprobacion || [],
        puntosNuevos: b.puntos_nuevos || [],
      });
      toast(`Bitácora W${b.semana} de ${b.ingeniero.split(' ')[0]} descargada`);
    } catch (err) {
      toast('Error al generar Excel: ' + err.message, 'err');
    }
  };

  return (
    <div className="flex flex-col gap-3.5 pb-6">
      {/* ================= CABECERA ADMIN ESTILO APPLE ================= */}
      <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-3.5 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <ShieldCheck weight="duotone" className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <TypographyH4 className="text-sm font-semibold tracking-tight leading-none">
                  Consola de Administración de Red
                </TypographyH4>
                <Badge className="bg-amber-500 text-black font-semibold text-[10px] px-1.5 py-0 h-4">
                  ADMIN HERWING
                </Badge>
              </div>
              <TypographyMuted className="text-[11px] mt-0.5">
                Supervisión de plantilla, catálogo maestro y auditoría de bitácoras corporativas
              </TypographyMuted>
            </div>
          </div>

          <Button
            size="xs"
            onClick={onOpenBitacoraModal}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-[11px] h-7 px-2.5"
          >
            <FileXls weight="duotone" className="h-3.5 w-3.5" />
            <span>Generar Bitácora</span>
          </Button>
        </div>

        {/* Bento Grid de KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <div className="rounded-xl border border-border/60 bg-card/80 p-2.5">
            <TypographyMuted className="text-[10px] uppercase font-semibold">
              Tiendas Verificadas
            </TypographyMuted>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-lg font-bold tabular-nums">{stats.verificadas}</span>
              <span className="text-[11px] text-muted-foreground">/ {stats.totalTiendas}</span>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 ml-auto">
                {stats.porcentajeVerif}%
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/80 p-2.5">
            <TypographyMuted className="text-[10px] uppercase font-semibold">
              Pendientes GPS
            </TypographyMuted>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {stats.pendientes}
              </span>
              <span className="text-[11px] text-muted-foreground">por revisar</span>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/80 p-2.5">
            <TypographyMuted className="text-[10px] uppercase font-semibold">
              Plantilla Activa
            </TypographyMuted>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-lg font-bold tabular-nums">{stats.totalIngenieros}</span>
              <span className="text-[11px] text-muted-foreground">ingenieros</span>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/80 p-2.5">
            <TypographyMuted className="text-[10px] uppercase font-semibold">
              Bitácoras en Nube
            </TypographyMuted>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-lg font-bold tabular-nums text-primary">
                {stats.totalBitacoras}
              </span>
              <span className="text-[11px] text-muted-foreground">semanas</span>
            </div>
          </div>
        </div>
      </div>

      {/* ================= APPLE SEGMENTED SUB-SWITCHER ================= */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-xl bg-muted/60 p-1 border border-border/40 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setSubTab('equipo')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all',
              subTab === 'equipo'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <UsersThree weight="duotone" className="h-3.5 w-3.5" />
            <span>Plantilla de Ingenieros ({ingenieros.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('bitacoras')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all',
              subTab === 'bitacoras'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <FileXls weight="duotone" className="h-3.5 w-3.5" />
            <span>Auditoría de Bitácoras ({bitacorasGlobales.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('cobertura')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all',
              subTab === 'cobertura'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Storefront weight="duotone" className="h-3.5 w-3.5" />
            <span>Cobertura por Ingeniero</span>
          </button>
        </div>
      </div>

      {/* ================= SUB-PANEL 1: EQUIPO DE INGENIEROS ================= */}
      {subTab === 'equipo' && (
        <div className="space-y-2.5">
          {ingenieros.map((ing) => {
            const esAdmin = ing.rol === 'admin' || ing.nombre.includes('HERWING');
            const totalTiendasIng = tiendas.filter((t) => t.ingeniero === ing.nombre).length;

            return (
              <Card
                key={ing.nombre}
                className={cn(
                  'transition-all hover:border-foreground/30',
                  esAdmin && 'border-amber-500/30 bg-amber-500/5'
                )}
              >
                <CardContent className="p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <TypographySmall className="font-semibold text-sm truncate">
                          {ing.nombre}
                        </TypographySmall>
                        {esAdmin && (
                          <Badge className="bg-amber-500 text-black font-semibold text-[10px] px-1.5 py-0 h-4">
                            ADMIN
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {ing.region || 'TUXTLA'}
                        </Badge>
                      </div>
                      <TypographyMuted className="text-[11px] truncate">
                        {ing.puesto || 'INGENIERO DE SOPORTE TECNICO'} · No. Empleado: {ing.no_empleado || 'S/N'}
                      </TypographyMuted>
                    </div>

                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleEditarClick(ing)}
                      className="gap-1 text-xs h-7 px-2"
                    >
                      <PencilSimple weight="bold" className="h-3 w-3" />
                      <span>Editar Ficha</span>
                    </Button>
                  </div>

                  {/* Ficha Vehicular */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl bg-muted/40 p-2 text-xs">
                    <div>
                      <span className="text-[10px] uppercase text-muted-foreground block font-medium">
                        Automóvil
                      </span>
                      <span className="font-semibold">{ing.automovil || 'AVEO'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-muted-foreground block font-medium">
                        Placas
                      </span>
                      <span className="font-mono font-semibold">{ing.placas || 'PEB-798-C'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-muted-foreground block font-medium">
                        Tarjeta Gasolina
                      </span>
                      <span className="font-mono text-[11px] truncate block">
                        {ing.tarjeta_gasolina || '5064490100458236'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-muted-foreground block font-medium">
                        CECO / Rendimiento
                      </span>
                      <span className="font-mono text-[11px]">
                        {ing.ceco || '108266'} · {ing.rendimiento || 12.5} km/L
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                    <span className="truncate">
                      Base: <strong className="text-foreground">{ing.base_nombre || 'RESGUARDO TUXTLA'}</strong>
                    </span>
                    <span>
                      Tiendas asignadas: <strong className="text-foreground">{totalTiendasIng}</strong>
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ================= SUB-PANEL 2: AUDITORÍA DE BITÁCORAS GLOBALES ================= */}
      {subTab === 'bitacoras' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-50">
              <Label className="text-xs text-muted-foreground shrink-0">Filtrar por ingeniero:</Label>
              <Select
                value={filtroIngenieroBitacora}
                onValueChange={setFiltroIngenieroBitacora}
              >
                <SelectTrigger size="sm" className="bg-card text-xs">
                  <SelectValue placeholder="Todos los ingenieros" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los ingenieros</SelectItem>
                  {ingenieros.map((ing) => (
                    <SelectItem key={ing.nombre} value={ing.nombre}>
                      {ing.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              size="xs"
              onClick={cargarBitacorasGlobales}
              disabled={cargandoBitacoras}
              className="gap-1 text-xs"
            >
              <ClockCounterClockwise weight="duotone" className={cn(cargandoBitacoras && 'animate-spin')} />
              <span>Actualizar lista</span>
            </Button>
          </div>

          {bitacorasGlobales.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <TypographyMuted>
                No hay bitácoras guardadas en Supabase todavía. Genera la primera desde el botón superior.
              </TypographyMuted>
            </Card>
          ) : (
            <div className="space-y-2">
              {bitacorasGlobales
                .filter(
                  (b) =>
                    filtroIngenieroBitacora === 'todos' || b.ingeniero === filtroIngenieroBitacora
                )
                .map((b) => (
                  <Card key={`${b.ingeniero}-${b.anio}-${b.semana}`} className="p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-xs">
                            Semana {b.semana} ({b.anio || 2026})
                          </span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {b.tipo === 'ambas' ? 'Anticipo + Comprobación' : b.tipo?.toUpperCase()}
                          </Badge>
                          <span className="text-xs text-muted-foreground font-medium">
                            {b.ingeniero}
                          </span>
                        </div>
                        <TypographyMuted className="text-[11px] mt-0.5">
                          {b.total_km} km recorridos · {pesos(b.total_importe || 0)} combustible · Odómetro ini: {Number(b.km_inicial || 0).toLocaleString()}
                        </TypographyMuted>
                      </div>

                      <Button
                        size="xs"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs h-7 px-2.5"
                        onClick={() => handleDescargarBitacora(b)}
                      >
                        <DownloadSimple weight="bold" className="h-3.5 w-3.5" />
                        <span>Descargar Excel (.xlsx)</span>
                      </Button>
                    </div>
                  </Card>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ================= SUB-PANEL 3: COBERTURA Y BALANCE ================= */}
      {subTab === 'cobertura' && (
        <div className="space-y-2.5">
          {coberturaPorIngeniero.map((c) => (
            <Card key={c.ingeniero.nombre} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <TypographySmall className="font-semibold">
                    {c.ingeniero.nombre}
                  </TypographySmall>
                  <TypographyMuted className="text-[11px]">
                    Región {c.ingeniero.region || 'SURESTE'} · {c.total} sucursales asignadas
                  </TypographyMuted>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 text-xs">
                    {c.verificadas} Verificadas
                  </Badge>
                  {c.pendientes > 0 && (
                    <Badge variant="outline" className="text-amber-600 border-amber-500/30 text-xs">
                      {c.pendientes} Pendientes
                    </Badge>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ================= MODAL DE EDICIÓN VEHICULAR Y ASIGNACIÓN ================= */}
      {ingenieroAEditar && (
        <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Ficha Técnica y Vehicular</DialogTitle>
              <DialogDescription>
                Modifica los datos del ingeniero. Estos cambios se sincronizarán en tiempo real con Supabase y se usarán en las bitácoras semanales.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Nombre Completo</Label>
                  <Input
                    value={ingenieroAEditar.nombre}
                    disabled
                    className="bg-muted/50 font-semibold text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Puesto Corporativo</Label>
                  <Input
                    value={ingenieroAEditar.puesto}
                    onChange={(e) =>
                      setIngenieroAEditar((prev) => ({ ...prev, puesto: e.target.value }))
                    }
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">No. Empleado</Label>
                  <Input
                    value={ingenieroAEditar.no_empleado}
                    onChange={(e) =>
                      setIngenieroAEditar((prev) => ({ ...prev, no_empleado: e.target.value }))
                    }
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Región</Label>
                  <Input
                    value={ingenieroAEditar.region}
                    onChange={(e) =>
                      setIngenieroAEditar((prev) => ({ ...prev, region: e.target.value }))
                    }
                    className="font-mono text-xs uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">CECO</Label>
                  <Input
                    value={ingenieroAEditar.ceco}
                    onChange={(e) =>
                      setIngenieroAEditar((prev) => ({ ...prev, ceco: e.target.value }))
                    }
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Vehículo (Modelo)</Label>
                  <Input
                    value={ingenieroAEditar.automovil}
                    onChange={(e) =>
                      setIngenieroAEditar((prev) => ({ ...prev, automovil: e.target.value }))
                    }
                    className="text-xs uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Placas</Label>
                  <Input
                    value={ingenieroAEditar.placas}
                    onChange={(e) =>
                      setIngenieroAEditar((prev) => ({ ...prev, placas: e.target.value }))
                    }
                    className="font-mono text-xs uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">No. Serie Vehicular</Label>
                  <Input
                    value={ingenieroAEditar.serie}
                    onChange={(e) =>
                      setIngenieroAEditar((prev) => ({ ...prev, serie: e.target.value }))
                    }
                    className="font-mono text-xs uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Tarjeta de Gasolina</Label>
                  <Input
                    value={ingenieroAEditar.tarjeta_gasolina}
                    onChange={(e) =>
                      setIngenieroAEditar((prev) => ({
                        ...prev,
                        tarjeta_gasolina: e.target.value,
                      }))
                    }
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Tienda Base Operativa</Label>
                  <Select
                    value={ingenieroAEditar.base_nombre}
                    onValueChange={(val) =>
                      setIngenieroAEditar((prev) => ({ ...prev, base_nombre: val }))
                    }
                  >
                    <SelectTrigger size="sm" className="bg-card text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tiendas
                        .filter((t) => t.nombre.includes('RESGUARDO') || t.nombre.includes('CEDIS'))
                        .map((t) => (
                          <SelectItem key={t.nombre} value={t.nombre}>
                            {t.nombre}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Rendimiento Oficial (km / L)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={ingenieroAEditar.rendimiento}
                    onChange={(e) =>
                      setIngenieroAEditar((prev) => ({ ...prev, rendimiento: e.target.value }))
                    }
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Precio Litro ($ MXN)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={ingenieroAEditar.costo_litro}
                    onChange={(e) =>
                      setIngenieroAEditar((prev) => ({ ...prev, costo_litro: e.target.value }))
                    }
                    className="text-xs"
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleGuardarPerfil}
                disabled={guardando}
                className="bg-primary hover:bg-primary/90"
              >
                {guardando ? 'Guardando en Supabase…' : 'Guardar Ficha'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
