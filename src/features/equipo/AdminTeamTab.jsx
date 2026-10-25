/**
 * @fileoverview Panel de Supervisión y Administración (`AdminTeamTab.jsx`).
 * Exclusivo para el Administrador del Sistema (Herwing Eduardo Vázquez Macías).
 *
 * Modelo de operación:
 * - Autogestión: Cada ingeniero registra su cuenta (@soyneto.com) y actualiza su propia
 *   ficha vehicular desde su perfil personal.
 * - Privilegios de Administrador:
 *   1. Controlar la apertura/cierre de registro de cuentas nuevas (@soyneto.com).
 *   2. Auditar y descargar en Excel (.xlsx) las bitácoras semanales de toda la región.
 *   3. Supervisar el directorio del equipo y corregir fichas o roles en caso necesario.
 *   4. Monitorear el avance de verificación GPS de sucursales por zona/ingeniero.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  UsersThree,
  FileXls,
  ClockCounterClockwise,
  PencilSimple,
  DownloadSimple,
  Storefront,
  LockKey,
  CarProfile,
  CheckCircle,
  Warning,
  UserCheck,
  EnvelopeSimple,
  Info,
  IdentificationCard,
  User,
} from '@phosphor-icons/react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
} from '@/components/ui/typography';
import { supabase } from '@/lib/supabase';
import { descargarBitacoraNetoExcel } from '@/lib/bitacora-excel';
import { pesos, cn } from '@/lib/utils';

export function AdminTeamTab({
  ingenieros,
  onUpdateIngeniero,
  tiendas,
  toast,
  onOpenBitacoraModal,
}) {
  const [subTab, setSubTab] = useState('equipo'); // 'equipo' | 'bitacoras' | 'cobertura'
  const [filtroEquipo, setFiltroEquipo] = useState('todos'); // 'todos' | 'activos' | 'pendientes'
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [ingenieroAEditar, setIngenieroAEditar] = useState(null);
  const [guardando, setGuardando] = useState(false);

  // Bitácoras globales en Supabase
  const [bitacorasGlobales, setBitacorasGlobales] = useState([]);
  const [cargandoBitacoras, setCargandoBitacoras] = useState(false);
  const [filtroIngenieroBitacora, setFiltroIngenieroBitacora] = useState('todos');

  // Control de nuevos registros
  const [permitirRegistros, setPermitirRegistros] = useState(true);
  const [guardandoConfig, setGuardandoConfig] = useState(false);

  useEffect(() => {
    supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'permitir_registros')
      .maybeSingle()
      .then(({ data }) => {
        if (data && typeof data.valor === 'boolean') {
          setPermitirRegistros(data.valor);
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleRegistros = async (nuevoValor) => {
    setGuardandoConfig(true);
    try {
      setPermitirRegistros(nuevoValor);
      await supabase
        .from('configuracion')
        .upsert({
          clave: 'permitir_registros',
          valor: nuevoValor,
          updated_at: new Date().toISOString(),
        });
      toast?.(
        nuevoValor
          ? 'Registro de cuentas @soyneto.com habilitado'
          : 'Registro de cuentas nuevas cerrado'
      );
    } catch (err) {
      toast?.('Error actualizando configuración: ' + err.message, 'err');
    } finally {
      setGuardandoConfig(false);
    }
  };

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
      console.warn('Error cargando bitácoras:', err.message);
    } finally {
      setCargandoBitacoras(false);
    }
  };

  useEffect(() => {
    cargarBitacorasGlobales();
  }, []);

  // Cuentas con usuario registrado y verificado en la plataforma
  const usuariosRegistrados = useMemo(() => {
    return ingenieros.filter(
      (i) => Boolean(i.email && i.email.trim()) || Boolean(i.auth_id)
    );
  }, [ingenieros]);

  // Rutas o zonas de catálogo con asignación histórica pero sin cuenta creada aún
  const pendientesRegistro = useMemo(() => {
    return ingenieros.filter(
      (i) => !Boolean(i.email && i.email.trim()) && !Boolean(i.auth_id)
    );
  }, [ingenieros]);

  const stats = useMemo(() => {
    const total = tiendas.length;
    const verificadas = tiendas.filter((t) => t.verificada).length;
    const pendientes = total - verificadas;
    return {
      totalTiendas: total,
      verificadas,
      pendientes,
      porcentajeVerif: total ? Math.round((verificadas / total) * 100) : 0,
      totalRegistrados: usuariosRegistrados.length,
      totalCatalogo: ingenieros.length,
      totalBitacoras: bitacorasGlobales.length,
    };
  }, [tiendas, usuariosRegistrados.length, ingenieros.length, bitacorasGlobales.length]);

  const coberturaPorIngeniero = useMemo(() => {
    const mapa = new Map();
    ingenieros.forEach((ing) => {
      mapa.set(ing.nombre, {
        ingeniero: ing,
        total: 0,
        verificadas: 0,
        pendientes: 0,
      });
    });

    tiendas.forEach((t) => {
      const ingNombre = t.ingeniero || 'SIN ASIGNAR';
      if (!mapa.has(ingNombre)) {
        mapa.set(ingNombre, {
          ingeniero: { nombre: ingNombre, region: t.region || 'SURESTE' },
          total: 0,
          verificadas: 0,
          pendientes: 0,
        });
      }
      const item = mapa.get(ingNombre);
      item.total++;
      if (t.verificada) item.verificadas++;
      else item.pendientes++;
    });

    return Array.from(mapa.values()).filter((x) => x.total > 0 || x.ingeniero.email);
  }, [tiendas, ingenieros]);

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

      onUpdateIngeniero?.(actual);
      toast?.(`Datos de ${actual.nombre.split(' ')[0]} actualizados`);
      setEditModalOpen(false);
    } catch (err) {
      toast?.('Error actualizando perfil: ' + err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  const handleDescargarBitacora = async (b) => {
    try {
      toast?.('Generando Excel corporativo…');
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
      toast?.(`Bitácora Sem. ${b.semana} de ${b.ingeniero.split(' ')[0]} descargada`);
    } catch (err) {
      toast?.('Error al generar Excel: ' + err.message, 'err');
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-6 min-w-0">
      {/* ================= CABECERA Y PRIVILEGIOS DE ADMINISTRADOR ================= */}
      <Card className="p-4 space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/20">
              <ShieldCheck weight="duotone" className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <TypographyH4 className="text-sm font-bold tracking-tight truncate">
                  Supervisión Regional · Sureste
                </TypographyH4>
                <Badge className="bg-primary/15 text-primary border-primary/30 hover:bg-primary/20 font-semibold text-[10px] px-2 py-0 h-4.5">
                  Admin
                </Badge>
              </div>
              <TypographyMuted className="text-xs leading-relaxed mt-1">
                Supervisa el catálogo regional de 380 tiendas, audita bitácoras semanales en la nube y gestiona el acceso de cuentas (@soyneto.com).
              </TypographyMuted>
            </div>
          </div>
        </div>

        {/* Grid de Indicadores Ejecutivos Consistente */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="rounded-xl border border-border/80 bg-muted/40 p-3 flex flex-col justify-between min-h-[84px]">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-semibold uppercase tracking-wider">
                GPS Verificadas
              </span>
              <CheckCircle weight="duotone" className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
                {stats.verificadas}
              </span>
              <span className="text-xs text-muted-foreground font-mono">/ {stats.totalTiendas}</span>
            </div>
            <span className="text-[11px] text-muted-foreground truncate mt-0.5">
              {stats.porcentajeVerif}% del catálogo seguro
            </span>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/40 p-3 flex flex-col justify-between min-h-[84px]">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-semibold uppercase tracking-wider">
                Por revisar
              </span>
              <Warning weight="duotone" className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono tracking-tight tabular-nums text-amber-600 dark:text-amber-400">
                {stats.pendientes}
              </span>
              <span className="text-xs text-muted-foreground">pines</span>
            </div>
            <span className="text-[11px] text-muted-foreground truncate mt-0.5">
              Pendientes de validar
            </span>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/40 p-3 flex flex-col justify-between min-h-[84px]">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-semibold uppercase tracking-wider">
                Cuentas activas
              </span>
              <UsersThree weight="duotone" className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono tracking-tight tabular-nums text-foreground">
                {stats.totalRegistrados}
              </span>
              <span className="text-xs text-muted-foreground font-mono">/ {stats.totalCatalogo}</span>
            </div>
            <span className="text-[11px] text-muted-foreground truncate mt-0.5">
              {pendientesRegistro.length > 0 ? `${pendientesRegistro.length} sin registrarse` : 'Equipo completo'}
            </span>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/40 p-3 flex flex-col justify-between min-h-[84px]">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[10px] font-semibold uppercase tracking-wider">
                Bitácoras nube
              </span>
              <FileXls weight="duotone" className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono tracking-tight tabular-nums text-primary">
                {stats.totalBitacoras}
              </span>
              <span className="text-xs text-muted-foreground">en nube</span>
            </div>
            <span className="text-[11px] text-muted-foreground truncate mt-0.5">
              Archivadas para auditar
            </span>
          </div>
        </div>

        {/* Control de registro de nuevas cuentas */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/35 px-3.5 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <LockKey weight="duotone" className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs font-semibold text-foreground truncate">
                Registro de cuentas nuevas (@soyneto.com)
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground block truncate mt-0.5">
              {permitirRegistros
                ? 'Abierto para que los ingenieros creen su cuenta'
                : 'Cerrado a nuevos registros'}
            </span>
          </div>
          <Switch
            checked={permitirRegistros}
            disabled={guardandoConfig}
            onCheckedChange={handleToggleRegistros}
          />
        </div>
      </Card>

      {/* ================= NAVEGACIÓN INTERNA ================= */}
      <div className="grid grid-cols-3 p-1 rounded-xl bg-card border border-border shadow-2xs">
        <button
          type="button"
          onClick={() => setSubTab('equipo')}
          className={cn(
            'flex items-center justify-center gap-1.5 py-2 px-1 text-xs rounded-lg transition-all cursor-pointer min-w-0 font-medium',
            subTab === 'equipo'
              ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <UsersThree weight="duotone" className="h-4 w-4 shrink-0" />
          <span className="truncate">Equipo ({stats.totalRegistrados})</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('bitacoras')}
          className={cn(
            'flex items-center justify-center gap-1.5 py-2 px-1 text-xs rounded-lg transition-all cursor-pointer min-w-0 font-medium',
            subTab === 'bitacoras'
              ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <FileXls weight="duotone" className="h-4 w-4 shrink-0" />
          <span className="truncate">Bitácoras ({bitacorasGlobales.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('cobertura')}
          className={cn(
            'flex items-center justify-center gap-1.5 py-2 px-1 text-xs rounded-lg transition-all cursor-pointer min-w-0 font-medium',
            subTab === 'cobertura'
              ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Storefront weight="duotone" className="h-4 w-4 shrink-0" />
          <span className="truncate">GPS ({stats.porcentajeVerif}%)</span>
        </button>
      </div>

      {/* ================= VISTA 1: DIRECTORIO DEL EQUIPO ================= */}
      {subTab === 'equipo' && (
        <div className="space-y-3 min-w-0">
          {/* Selector de filtro para ver activos vs catálogo histórico */}
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-muted/40 border border-border/60 text-xs">
            <button
              type="button"
              onClick={() => setFiltroEquipo('todos')}
              className={cn(
                'flex-1 py-1 px-2 rounded-md font-medium transition-colors text-center truncate cursor-pointer',
                filtroEquipo === 'todos'
                  ? 'bg-card text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Todos ({ingenieros.length})
            </button>
            <button
              type="button"
              onClick={() => setFiltroEquipo('activos')}
              className={cn(
                'flex-1 py-1 px-2 rounded-md font-medium transition-colors text-center truncate cursor-pointer',
                filtroEquipo === 'activos'
                  ? 'bg-card text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Registrados ({usuariosRegistrados.length})
            </button>
            <button
              type="button"
              onClick={() => setFiltroEquipo('pendientes')}
              className={cn(
                'flex-1 py-1 px-2 rounded-md font-medium transition-colors text-center truncate cursor-pointer',
                filtroEquipo === 'pendientes'
                  ? 'bg-card text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Pendientes ({pendientesRegistro.length})
            </button>
          </div>

          {/* SECCIÓN 1: CUENTAS REGISTRADAS CON ACCESO */}
          {(filtroEquipo === 'todos' || filtroEquipo === 'activos') && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <UserCheck weight="duotone" className="h-4 w-4 text-emerald-500" />
                  Cuentas Activas con Acceso a la Plataforma
                </span>
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                  {usuariosRegistrados.length} {usuariosRegistrados.length === 1 ? 'cuenta' : 'cuentas'}
                </Badge>
              </div>

              {usuariosRegistrados.length === 0 ? (
                <Card className="p-4 text-center text-xs text-muted-foreground">
                  Aún no hay ingenieros con cuenta registrada.
                </Card>
              ) : (
                usuariosRegistrados.map((ing) => {
                  const esAdmin = ing.rol === 'admin' || ing.nombre.includes('HERWING');
                  const totalTiendasIng = tiendas.filter((t) => t.ingeniero === ing.nombre).length;
                  const iniciales = ing.nombre
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join('');

                  return (
                    <Card
                      key={ing.nombre}
                      className="p-3.5 space-y-2.5 hover:border-primary/40 transition-colors border-border/80"
                    >
                      <div className="flex items-start justify-between gap-2.5 min-w-0">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary font-bold text-xs border border-primary/25">
                            {iniciales}
                            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <TypographySmall className="font-semibold text-xs truncate">
                                {ing.nombre}
                              </TypographySmall>
                              {esAdmin && (
                                <Badge className="bg-primary/15 text-primary border-primary/30 font-semibold text-[10px] px-1.5 py-0 h-4">
                                  Admin
                                </Badge>
                              )}
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {ing.region || 'SURESTE'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 truncate">
                              <span className="truncate">{ing.email}</span>
                              <span>·</span>
                              <span>Emp. {ing.no_empleado || 'S/N'}</span>
                            </div>
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleEditarClick(ing)}
                          className="shrink-0"
                        >
                          <PencilSimple weight="bold" className="h-3 w-3" />
                          <span>Editar</span>
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 border border-border/60 px-3 py-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <CarProfile weight="duotone" className="h-4 w-4 text-primary shrink-0" />
                          <span className="truncate text-xs">
                            <strong className="text-foreground">{ing.automovil || 'Vehículo'}</strong> ·{' '}
                            <span className="font-mono text-muted-foreground">{ing.placas || 'Sin placas'}</span> ·{' '}
                            <span className="font-mono text-muted-foreground">{ing.rendimiento || 12.5} km/L</span>
                          </span>
                        </div>
                        <Badge variant="outline" className="font-mono text-[10px] bg-card shrink-0">
                          {totalTiendasIng} sucursales
                        </Badge>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          )}

          {/* SECCIÓN 2: PLANTILLA DE RUTAS EN CATÁLOGO (PENDIENTES DE REGISTRARSE) */}
          {(filtroEquipo === 'todos' || filtroEquipo === 'pendientes') && (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <IdentificationCard weight="duotone" className="h-4 w-4 text-amber-500" />
                  Rutas en Catálogo Regional (Pendientes de alta)
                </span>
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
                  {pendientesRegistro.length} pendientes
                </Badge>
              </div>

              <Card className="p-3 bg-muted/20 border-dashed border-border/80 flex items-start gap-2.5">
                <Info weight="duotone" className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Estos ingenieros provienen de las asignaciones de tiendas en el Sureste. Cuando creen su cuenta con su correo <strong className="text-foreground">@soyneto.com</strong>, se vincularán automáticamente aquí.
                </p>
              </Card>

              {pendientesRegistro.map((ing) => {
                const totalTiendasIng = tiendas.filter((t) => t.ingeniero === ing.nombre).length;
                const iniciales = ing.nombre
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join('');

                return (
                  <Card
                    key={ing.nombre}
                    className="p-3.5 space-y-2.5 border-border/60 bg-card/60 opacity-90 hover:opacity-100 transition-opacity"
                  >
                    <div className="flex items-start justify-between gap-2.5 min-w-0">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold text-xs border border-border">
                          {iniciales}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <TypographySmall className="font-semibold text-xs truncate">
                              {ing.nombre}
                            </TypographySmall>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {ing.region || 'SURESTE'}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 px-1.5 py-0"
                            >
                              Sin cuenta aún
                            </Badge>
                          </div>
                          <TypographyMuted className="text-[11px] truncate block mt-0.5">
                            Esperando registro en la app con correo @soyneto.com
                          </TypographyMuted>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => handleEditarClick(ing)}
                        className="shrink-0"
                      >
                        <PencilSimple weight="bold" className="h-3 w-3" />
                        <span>Editar</span>
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/30 border border-border/50 px-3 py-2 text-xs">
                      <span className="text-[11px] text-muted-foreground truncate">
                        Base: <strong className="text-foreground">{ing.base_nombre || 'RESGUARDO TUXTLA'}</strong>
                      </span>
                      <Badge variant="outline" className="font-mono text-[10px] bg-card shrink-0">
                        {totalTiendasIng} sucursales
                      </Badge>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= VISTA 2: BITÁCORAS EN NUBE ================= */}
      {subTab === 'bitacoras' && (
        <div className="space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <Select
              value={filtroIngenieroBitacora}
              onValueChange={setFiltroIngenieroBitacora}
            >
              <SelectTrigger size="sm" className="bg-card text-xs flex-1 min-w-0">
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

            <Button
              variant="outline"
              size="sm"
              onClick={cargarBitacorasGlobales}
              disabled={cargandoBitacoras}
              className="shrink-0 bg-card"
            >
              <ClockCounterClockwise
                weight="duotone"
                className={cn('h-3.5 w-3.5', cargandoBitacoras && 'animate-spin')}
              />
              <span>Actualizar</span>
            </Button>
          </div>

          {bitacorasGlobales.length === 0 ? (
            <Card className="p-6 text-center space-y-3">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <FileXls weight="duotone" className="h-6 w-6" />
              </div>
              <div className="space-y-1 max-w-xs mx-auto">
                <TypographySmall className="font-semibold block">
                  Sin bitácoras archivadas en la nube
                </TypographySmall>
                <TypographyMuted className="text-xs leading-relaxed">
                  Cuando tú o cualquier ingeniero generen su archivo Excel semanal desde la pestaña Ruta, aparecerá aquí listo para auditar y descargar.
                </TypographyMuted>
              </div>
              {onOpenBitacoraModal && (
                <Button
                  size="sm"
                  onClick={() => onOpenBitacoraModal('comprobacion')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <FileXls weight="bold" className="h-4 w-4" />
                  <span>Generar bitácora semanal (.xlsx)</span>
                </Button>
              )}
            </Card>
          ) : (
            <div className="space-y-2.5">
              {bitacorasGlobales
                .filter(
                  (b) =>
                    filtroIngenieroBitacora === 'todos' || b.ingeniero === filtroIngenieroBitacora
                )
                .map((b) => (
                  <Card key={`${b.ingeniero}-${b.anio}-${b.semana}`} className="p-3.5">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-xs">
                            Semana {b.semana} ({b.anio || 2026})
                          </span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {b.tipo === 'ambas' ? 'Completa' : b.tipo}
                          </Badge>
                        </div>
                        <p className="text-xs font-medium text-foreground truncate mt-1">
                          {b.ingeniero}
                        </p>
                        <TypographyMuted className="text-[11px]">
                          {b.total_km} km · {pesos(b.total_importe || 0)}
                        </TypographyMuted>
                      </div>

                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs shrink-0"
                        onClick={() => handleDescargarBitacora(b)}
                      >
                        <DownloadSimple weight="bold" className="h-3.5 w-3.5" />
                        <span>Excel (.xlsx)</span>
                      </Button>
                    </div>
                  </Card>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ================= VISTA 3: COBERTURA GPS POR INGENIERO ================= */}
      {subTab === 'cobertura' && (
        <div className="space-y-2.5 min-w-0">
          {coberturaPorIngeniero.map((c) => {
            const pct = c.total ? Math.round((c.verificadas / c.total) * 100) : 0;
            return (
              <Card key={c.ingeniero.nombre} className="p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="min-w-0">
                    <TypographySmall className="font-semibold text-xs truncate block">
                      {c.ingeniero.nombre}
                    </TypographySmall>
                    <TypographyMuted className="text-[11px]">
                      {c.ingeniero.region || 'SURESTE'} · {c.total} sucursales asignadas
                    </TypographyMuted>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {c.verificadas}/{c.total} ({pct}%)
                    </span>
                    {c.pendientes > 0 && (
                      <span className="block text-[10px] text-amber-600 dark:text-amber-400">
                        {c.pendientes} por verificar
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ================= MODAL DE CORRECCIÓN DE FICHA ================= */}
      {ingenieroAEditar && (
        <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
          <DialogContent className="max-w-lg w-[calc(100%-1.5rem)] p-4 sm:p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Ficha de Colaborador</DialogTitle>
              <DialogDescription>
                Los cambios se sincronizan en Supabase y se reflejan en sus bitácoras semanales.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-1 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Nombre Completo</Label>
                  <Input
                    value={ingenieroAEditar.nombre}
                    disabled
                    className="bg-muted/50 font-semibold text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Puesto</Label>
                  <Input
                    value={ingenieroAEditar.puesto}
                    onChange={(e) =>
                      setIngenieroAEditar((prev) => ({ ...prev, puesto: e.target.value }))
                    }
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">No. Empleado</Label>
                  <Input
                    value={ingenieroAEditar.no_empleado}
                    onChange={(e) =>
                      setIngenieroAEditar((prev) => ({ ...prev, no_empleado: e.target.value }))
                    }
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Región</Label>
                  <Input
                    value={ingenieroAEditar.region}
                    onChange={(e) =>
                      setIngenieroAEditar((prev) => ({ ...prev, region: e.target.value }))
                    }
                    className="font-mono text-xs uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">CECO</Label>
                  <Input
                    value={ingenieroAEditar.ceco}
                    onChange={(e) =>
                      setIngenieroAEditar((prev) => ({ ...prev, ceco: e.target.value }))
                    }
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Vehículo</Label>
                  <Input
                    value={ingenieroAEditar.automovil}
                    onChange={(e) =>
                      setIngenieroAEditar((prev) => ({ ...prev, automovil: e.target.value }))
                    }
                    className="text-xs uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Placas</Label>
                  <Input
                    value={ingenieroAEditar.placas}
                    onChange={(e) =>
                      setIngenieroAEditar((prev) => ({ ...prev, placas: e.target.value }))
                    }
                    className="font-mono text-xs uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Serie (VIN)</Label>
                  <Input
                    value={ingenieroAEditar.serie}
                    onChange={(e) =>
                      setIngenieroAEditar((prev) => ({ ...prev, serie: e.target.value }))
                    }
                    className="font-mono text-xs uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Tarjeta Combustible</Label>
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
                  <Label className="text-[11px] font-medium">Base Operativa</Label>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Rendimiento (km/L)</Label>
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
                  <Label className="text-[11px] font-medium">Precio Litro ($ MXN)</Label>
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

            <DialogFooter className="pt-2">
              <Button variant="ghost" onClick={() => setEditModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleGuardarPerfil} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
