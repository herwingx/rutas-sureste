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
} from '@phosphor-icons/react';
import { Card, CardContent } from '@/components/ui/card';
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
}) {
  const [subTab, setSubTab] = useState('bitacoras'); // 'bitacoras' | 'equipo' | 'cobertura'
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

  const stats = useMemo(() => {
    const total = tiendas.length;
    const verificadas = tiendas.filter((t) => t.verificada).length;
    const pendientes = total - verificadas;
    return {
      totalTiendas: total,
      verificadas,
      pendientes,
      porcentajeVerif: total ? Math.round((verificadas / total) * 100) : 0,
    };
  }, [tiendas]);

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
    <div className="flex flex-col gap-3 pb-4 min-w-0">
      {/* ================= CABECERA Y PRIVILEGIOS DE ADMINISTRADOR ================= */}
      <Card className="p-3 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <ShieldCheck weight="duotone" className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <TypographyH4 className="text-xs font-semibold truncate">
                Supervisión Regional · Sistemas Sureste
              </TypographyH4>
              <TypographyMuted className="text-[11px] leading-snug">
                Cada ingeniero gestiona su propio perfil. Como Admin auditas bitácoras, controlas el acceso y desbloqueas pines GPS protegidos.
              </TypographyMuted>
            </div>
          </div>
        </div>

        {/* Control de registro de nuevas cuentas */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/25 px-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <LockKey weight="duotone" className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium text-foreground truncate">
                Registro de cuentas nuevas (@soyneto.com)
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground block truncate">
              {permitirRegistros
                ? 'Habilitado para que el equipo cree su cuenta'
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

      {/* ================= NAVEGACIÓN INTERNA COMPACTA ================= */}
      <div className="grid grid-cols-3 p-0.5 rounded-lg bg-muted/60 border border-border/50">
        <button
          type="button"
          onClick={() => setSubTab('bitacoras')}
          className={cn(
            'flex items-center justify-center gap-1 py-1.5 px-2 text-xs rounded-md transition-all cursor-pointer min-w-0',
            subTab === 'bitacoras'
              ? 'bg-background text-foreground shadow-xs font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <FileXls weight="duotone" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Bitácoras ({bitacorasGlobales.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('equipo')}
          className={cn(
            'flex items-center justify-center gap-1 py-1.5 px-2 text-xs rounded-md transition-all cursor-pointer min-w-0',
            subTab === 'equipo'
              ? 'bg-background text-foreground shadow-xs font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <UsersThree weight="duotone" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Equipo ({ingenieros.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('cobertura')}
          className={cn(
            'flex items-center justify-center gap-1 py-1.5 px-2 text-xs rounded-md transition-all cursor-pointer min-w-0',
            subTab === 'cobertura'
              ? 'bg-background text-foreground shadow-xs font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Storefront weight="duotone" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">GPS ({stats.porcentajeVerif}%)</span>
        </button>
      </div>

      {/* ================= VISTA 1: BITÁCORAS EN NUBE ================= */}
      {subTab === 'bitacoras' && (
        <div className="space-y-2.5 min-w-0">
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
              className="shrink-0"
            >
              <ClockCounterClockwise
                weight="duotone"
                className={cn('h-3.5 w-3.5', cargandoBitacoras && 'animate-spin')}
              />
              <span>Actualizar</span>
            </Button>
          </div>

          {bitacorasGlobales.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground">
              <TypographyMuted className="text-xs">
                Aún no hay bitácoras semanales guardadas en la nube.
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
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-xs">
                            Sem. {b.semana} ({b.anio || 2026})
                          </span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {b.tipo === 'ambas' ? 'Completa' : b.tipo}
                          </Badge>
                        </div>
                        <p className="text-xs font-medium text-foreground truncate mt-0.5">
                          {b.ingeniero}
                        </p>
                        <TypographyMuted className="text-[11px]">
                          {b.total_km} km · {pesos(b.total_importe || 0)}
                        </TypographyMuted>
                      </div>

                      <Button
                        size="xs"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs shrink-0"
                        onClick={() => handleDescargarBitacora(b)}
                      >
                        <DownloadSimple weight="bold" className="h-3.5 w-3.5" />
                        <span>Excel</span>
                      </Button>
                    </div>
                  </Card>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ================= VISTA 2: DIRECTORIO DEL EQUIPO ================= */}
      {subTab === 'equipo' && (
        <div className="space-y-2 min-w-0">
          {ingenieros.map((ing) => {
            const esAdmin = ing.rol === 'admin' || ing.nombre.includes('HERWING');
            const totalTiendasIng = tiendas.filter((t) => t.ingeniero === ing.nombre).length;

            return (
              <Card key={ing.nombre} className="p-3">
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TypographySmall className="font-semibold text-xs truncate">
                        {ing.nombre}
                      </TypographySmall>
                      {esAdmin && (
                        <Badge className="bg-amber-500 text-black font-semibold text-[9px] px-1.5 py-0 h-4">
                          Admin
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {ing.region || 'SURESTE'}
                      </Badge>
                    </div>
                    <TypographyMuted className="text-[11px] truncate block mt-0.5">
                      {ing.email || 'Sin correo vinculado'} · Emp. {ing.no_empleado || 'S/N'}
                    </TypographyMuted>
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

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px]">
                  <span className="text-muted-foreground">
                    <strong className="text-foreground">{ing.automovil || 'Vehículo'}</strong> ·{' '}
                    <span className="font-mono">{ing.placas || 'Sin placas'}</span> ·{' '}
                    <span className="font-mono">{ing.rendimiento || 12.5} km/L</span>
                  </span>
                  <span className="text-muted-foreground">
                    <strong className="text-foreground">{totalTiendasIng}</strong> tiendas
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ================= VISTA 3: COBERTURA GPS POR INGENIERO ================= */}
      {subTab === 'cobertura' && (
        <div className="space-y-2 min-w-0">
          {coberturaPorIngeniero.map((c) => {
            const pct = c.total ? Math.round((c.verificadas / c.total) * 100) : 0;
            return (
              <Card key={c.ingeniero.nombre} className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="min-w-0">
                    <TypographySmall className="font-semibold text-xs truncate block">
                      {c.ingeniero.nombre}
                    </TypographySmall>
                    <TypographyMuted className="text-[11px]">
                      {c.ingeniero.region || 'SURESTE'} · {c.total} sucursales
                    </TypographyMuted>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      {c.verificadas}/{c.total} ({pct}%)
                    </span>
                    {c.pendientes > 0 && (
                      <span className="block text-[10px] text-amber-600 dark:text-amber-400">
                        {c.pendientes} por verificar
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
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
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Editar Ficha de Colaborador</DialogTitle>
              <DialogDescription>
                Los cambios se sincronizan en Supabase y se reflejan en sus bitácoras semanales.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-1 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Nombre Completo</Label>
                  <Input
                    value={ingenieroAEditar.nombre}
                    disabled
                    className="bg-muted/50 font-semibold text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Puesto</Label>
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
                  <Label className="text-[11px]">Vehículo</Label>
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
                  <Label className="text-[11px]">Serie (VIN)</Label>
                  <Input
                    value={ingenieroAEditar.serie}
                    onChange={(e) =>
                      setIngenieroAEditar((prev) => ({ ...prev, serie: e.target.value }))
                    }
                    className="font-mono text-xs uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Tarjeta Combustible</Label>
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
                  <Label className="text-[11px]">Base Operativa</Label>
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
                  <Label className="text-[11px]">Rendimiento (km/L)</Label>
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
