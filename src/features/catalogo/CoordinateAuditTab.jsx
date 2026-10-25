/**
 * @fileoverview Módulo de Catálogo y Auditoría GPS de Tiendas (`CoordinateAuditTab.jsx`).
 *
 * Funcionalidades principales:
 * - Explorador completo del catálogo de sucursales con filtros por Estado, Corredor Geográfico
 *   y estatus de verificación GPS (Todos, Pendientes, Verificados).
 * - Flujo de auditoría rápida asistida por teclado (`J`/`K` para navegar, `V` para verificar,
 *   `N` para saltar a la siguiente tienda pendiente).
 * - Cálculo en tiempo real del desplazamiento en metros (`haversineM`) y rumbo cardinal
 *   (`rumboCardinal`) entre la coordenada original de catálogo y la coordenada corregida.
 * - Creación de nuevas tiendas, edición de metadatos (nombre, localidad, estado, dirección, CP)
 *   y exportación de respaldo JSON.
 */

import { useState, useMemo, useEffect } from 'react';
import {
  CheckCircle,
  ClipboardText,
  ArrowSquareOut,
  MagnifyingGlass,
  Binoculars,
  FastForward,
  ArrowCounterClockwise,
  Trash,
  PlusCircle,
  DownloadSimple,
  LockKey,
  LockKeyOpen,
  MapTrifold,
  PencilSimple,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Kbd } from '@/components/ui/kbd';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ActionTooltip } from '@/components/ui/tooltip';
import {
  TypographySmall,
  TypographyMuted,
  TypographyMono,
} from '@/components/ui/typography';
import { ESTADOS } from '@/lib/brand';
import { EditStoreModal } from './EditStoreModal';
import {
  cn,
  norm,
  expandirConsulta,
  fmtCoords,
  parseCoords,
  haversineM,
  rumboCardinal,
  clasificarZona,
  zonasDisponibles,
} from '@/lib/utils';

export function CoordinateAuditTab({
  tiendas,
  porNombre,
  ingenieros = [],
  sel,
  autoSaveOnPaste,
  onToggleAutoSaveOnPaste,
  onSelectStore,
  onOpenNewStoreModal,
  onUpdateSelectedName,
  onUpdateSelectedState,
  onUnlockSelected,
  onMoveSelected,
  onApplyTextCoords,
  onSaveSelected,
  onNextPending,
  onPatchStore,
  onDeleteSelected,
  onExportJson,
  onShowMap,
  isAdmin = false,
  userSession,
  onStoreUpdated,
  toast,
}) {
  const [filtroTexto, setFiltroTexto] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('todas');
  const [zonaFiltro, setZonaFiltro] = useState('todas');
  const [ingenieroFiltro, setIngenieroFiltro] = useState('todos');
  const [coordInput, setCoordInput] = useState('');
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Resuelve el ingeniero asignado a una tienda dinámicamente según la región
  const resolverIngeniero = (t) => {
    if (!t) return null;
    const rT = norm(t.region || t.estado || '');
    const zT = norm(t.zona || '');

    if (ingenieros?.length) {
      // 1. Coincidencia por región
      const porRegion = ingenieros.find((i) => {
        const rI = norm(i.region || '');
        if (!rI) return false;
        return (
          rI === rT ||
          (rT && rT.includes(rI)) ||
          (rI && rI.includes(rT)) ||
          (zT && zT.includes(rI))
        );
      });
      if (porRegion) return porRegion;

      // 2. Coincidencia por nombre previo si venía en el registro
      if (t.ingeniero) {
        const tIngNorm = norm(t.ingeniero);
        const porNombre = ingenieros.find((i) => {
          const iNomNorm = norm(i.nombre || '');
          return iNomNorm === tIngNorm || iNomNorm.includes(tIngNorm) || tIngNorm.includes(iNomNorm);
        });
        if (porNombre) return porNombre;
      }
    }

    if (t.ingeniero) {
      return { nombre: t.ingeniero, region: t.region || t.estado };
    }
    return null;
  };

  // Obtiene el nombre estandarizado de la región operativa
  const obtenerRegionTienda = (t) => {
    if (!t) return 'SURESTE';
    if (t.region) return t.region.toUpperCase();
    if (t.zona) {
      const zUpper = t.zona.toUpperCase();
      if (zUpper.includes('SOCONUSCO') || zUpper.includes('TAPACHULA')) return 'CHIAPAS SOCONUSCO';
      if (zUpper.includes('COATZA') || zUpper.includes('CHOAPAS') || zUpper.includes('MINA') || zUpper.includes('ACAYUCAN')) return 'COATZA OLMECA';
      if (zUpper.includes('CARDENAS') || zUpper.includes('VILLA') || zUpper.includes('TABASCO') || zUpper.includes('CHONTALPA')) return 'TABASCO';
      if (zUpper.includes('MERIDA') || zUpper.includes('KANASIN') || zUpper.includes('YUCATAN')) return 'YUCATAN';
      if (zUpper.includes('TUXTLA') || zUpper.includes('CHIAPAS')) return 'CHIAPAS';
    }
    return (t.estado || 'SURESTE').toUpperCase();
  };

  // Lista de ingenieros con conteo dinámico basado en las regiones asignadas
  const ingenierosLista = useMemo(() => {
    if (ingenieros?.length) {
      return ingenieros.map((ing) => {
        const conteo = tiendas.filter((t) => {
          const res = resolverIngeniero(t);
          return res && res.nombre === ing.nombre;
        }).length;
        const corto =
          ing.nombre.split(' ')[0] +
          (ing.nombre.includes('HERWING') ? ' (Mis tiendas)' : '');
        return {
          nombre: ing.nombre,
          corto,
          region: ing.region || '',
          total: conteo,
        };
      });
    }

    const conteo = new Map();
    tiendas.forEach((t) => {
      const ing = t.ingeniero || 'SIN ASIGNAR';
      conteo.set(ing, (conteo.get(ing) || 0) + 1);
    });
    return Array.from(conteo.entries()).map(([nombre, total]) => ({
      nombre,
      corto: nombre.split(' ')[0],
      total,
    }));
  }, [tiendas, ingenieros]);

  const zonas = useMemo(() => {
    const base =
      ingenieroFiltro === 'todos'
        ? tiendas
        : tiendas.filter((t) => {
            const ing = resolverIngeniero(t);
            return ing && ing.nombre === ingenieroFiltro;
          });
    return zonasDisponibles(base);
  }, [tiendas, ingenieroFiltro, ingenieros]);

  useEffect(() => {
    if (sel && sel.lat != null) {
      setCoordInput(fmtCoords(sel.lat, sel.lng));
    } else {
      setCoordInput('');
    }
  }, [sel?.nombre, sel?.lat, sel?.lng, sel?.nueva]);

  const stats = useMemo(() => {
    const base =
      ingenieroFiltro === 'todos'
        ? tiendas
        : tiendas.filter((t) => {
            const ing = resolverIngeniero(t);
            return ing && ing.nombre === ingenieroFiltro;
          });
    const total = base.length;
    const verificadas = base.filter((t) => t.verificada).length;
    const corregidas = base.filter((t) => t.coordsAnteriores).length;
    return { total, verificadas, pendientes: total - verificadas, corregidas };
  }, [tiendas, ingenieroFiltro, ingenieros]);

  const listaFiltrada = useMemo(() => {
    const q = expandirConsulta(filtroTexto);
    return tiendas.filter((t) => {
      if (ingenieroFiltro !== 'todos') {
        const ing = resolverIngeniero(t);
        if (!ing || ing.nombre !== ingenieroFiltro) return false;
      }
      if (
        q &&
        !norm(
          `${t.nombre} ${t.eco || ''} ${t.ceco || ''} ${t.zona || ''} ${t.estado || ''} ${t.ingeniero || ''} ${t.region || ''}`
        ).includes(q)
      ) {
        return false;
      }
      if (estadoFiltro === 'pendientes' && t.verificada) return false;
      if (estadoFiltro === 'verificadas' && !t.verificada) return false;
      if (estadoFiltro === 'corregidas' && !t.coordsAnteriores) return false;
      if (zonaFiltro !== 'todas' && clasificarZona(t).id !== zonaFiltro) return false;
      return true;
    });
  }, [tiendas, filtroTexto, estadoFiltro, zonaFiltro, ingenieroFiltro, ingenieros]);

  const tiendaActualCat = sel && !sel.nueva ? porNombre.get(sel.nombre) : null;
  const bloqueada = Boolean(tiendaActualCat?.verificada && !sel?.desbloqueada);
  const deltaM = sel?.orig && sel?.lat != null ? haversineM(sel.orig, sel) : 0;
  const rumbo = sel?.orig && sel?.lat != null ? rumboCardinal(sel.orig, sel) : '';

  const regionTienda = useMemo(() => {
    return obtenerRegionTienda(tiendaActualCat || sel);
  }, [tiendaActualCat, sel]);

  const ingAsignado = useMemo(() => {
    return resolverIngeniero(tiendaActualCat || sel);
  }, [tiendaActualCat, sel, ingenieros]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 min-w-0">
      {/* ================= BARRA SUPERIOR DE CATÁLOGO ================= */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <Button size="sm" onClick={() => onOpenNewStoreModal?.()} className="h-8 text-xs">
            <PlusCircle weight="duotone" />
            <span>Nueva<span className="hidden sm:inline"> tienda</span></span>
          </Button>
          {stats.pendientes > 0 && (
            <Button variant="outline" size="sm" onClick={() => onNextPending('')} className="h-8 text-xs">
              <FastForward weight="duotone" />
              <span>Siguiente ({stats.pendientes})</span>
            </Button>
          )}
        </div>
        <ActionTooltip label="Descargar respaldo completo del catálogo (JSON)">
          <Button variant="outline" size="xs" onClick={onExportJson} className="shrink-0 h-8 text-xs">
            <DownloadSimple weight="duotone" />
            <span>JSON ({tiendas.length})</span>
          </Button>
        </ActionTooltip>
      </div>

      {/* ================= EDITOR DE TIENDA SELECCIONADA ================= */}
      {sel && (
        <Card className="shrink-0 border-primary/40 bg-card shadow-xs min-w-0">
          <CardContent className="p-3 space-y-2.5 min-w-0">
            {/* Cabecera limpia: Título sin campos redundantes + Badges + Botón único de Editar */}
            <div className="flex items-start justify-between gap-2 min-w-0">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-sm sm:text-base font-bold text-foreground tracking-tight truncate">
                    {sel.nombre}
                  </h3>
                  {tiendaActualCat?.nombre?.includes('CEDIS') && (
                    <Badge className="bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30 text-[10px] px-1.5 py-0 font-bold">
                      CEDIS
                    </Badge>
                  )}
                  {(tiendaActualCat?.nombre?.includes('CROSS') || tiendaActualCat?.nombre?.includes('DOCK')) && (
                    <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30 text-[10px] px-1.5 py-0 font-bold">
                      CROSS DOCK
                    </Badge>
                  )}
                  {tiendaActualCat?.nombre?.includes('RESGUARDO') && (
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0 font-bold">
                      BASE
                    </Badge>
                  )}
                </div>

                {/* Badges de Operación: Región geográfica + Ingeniero dinámico + ECO/CECO */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {tiendaActualCat?.eco && tiendaActualCat.eco !== '0' && (
                    <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0.5">
                      ECO {tiendaActualCat.eco}
                    </Badge>
                  )}
                  {tiendaActualCat?.ceco && tiendaActualCat.ceco !== '0' && (
                    <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0.5">
                      CECO {tiendaActualCat.ceco}
                    </Badge>
                  )}
                  {regionTienda && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 font-semibold text-primary">
                      {regionTienda}
                    </Badge>
                  )}
                  {tiendaActualCat?.zona && tiendaActualCat.zona !== regionTienda && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 text-muted-foreground">
                      {tiendaActualCat.zona}
                    </Badge>
                  )}
                  {ingAsignado && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1"
                      title={`Ingeniero asignado a la región ${regionTienda}`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span>{ingAsignado.nombre.split(' ')[0]}</span>
                    </Badge>
                  )}
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setEditModalOpen(true)}
                className="gap-1 text-xs font-medium shrink-0 h-7.5 px-2 hover:bg-muted"
                title="Editar tipo de instalación, nombre, ECO, CECO o región"
              >
                <PencilSimple weight="duotone" className="h-3.5 w-3.5 text-primary" />
                <span className="hidden sm:inline">Editar ficha</span>
                <span className="sm:hidden">Editar</span>
              </Button>
            </div>

            {bloqueada ? (
              /* VISTA PROTEGIDA CUANDO LA SUCURSAL YA ESTÁ VERIFICADA */
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                    <LockKey weight="fill" className="h-4 w-4 shrink-0" />
                    <TypographySmall className="font-semibold text-xs">
                      Ubicación GPS verificada y protegida
                    </TypographySmall>
                  </div>
                  <TypographyMono className="text-[11px] text-muted-foreground">
                    {sel.lat?.toFixed(6)}, {sel.lng?.toFixed(6)}
                  </TypographyMono>
                </div>
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <TypographyMuted className="text-[11px]">
                    {isAdmin
                      ? 'Como Administrador, puedes desbloquear para forzar una corrección.'
                      : 'El pin está bloqueado para preservar las rutas oficiales de la zona.'}
                  </TypographyMuted>
                  {isAdmin ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => onUnlockSelected?.(true)}
                      className="text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1 font-medium"
                    >
                      <LockKeyOpen weight="duotone" className="h-3 w-3" />
                      Desbloquear (Admin)
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                      Coordenada Oficial
                    </Badge>
                  )}
                </div>
              </div>
            ) : (
              /* EDITOR ACTIVO PARA TIENDAS PENDIENTES O DESBLOQUEADAS */
              <>
                <div className="flex items-center gap-1.5">
                  <Input
                    size="sm"
                    value={coordInput}
                    onChange={(e) => setCoordInput(e.target.value)}
                    onPaste={(e) => {
                      e.preventDefault();
                      const txt = e.clipboardData.getData('text');
                      onApplyTextCoords(txt, { desdePegar: true });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const actual = sel.lat != null ? fmtCoords(sel.lat, sel.lng) : '';
                        if (coordInput.trim() && coordInput.trim() !== actual) {
                          onApplyTextCoords(coordInput.trim(), { desdePegar: false });
                        } else {
                          onSaveSelected();
                        }
                      }
                    }}
                    placeholder="Coordenadas (lat, lng) o enlace de Google Maps…"
                    className="font-mono bg-card flex-1 min-w-0 text-xs h-8"
                  />
                  <ActionTooltip label="Pegar del portapapeles" shortcut="Ctrl+V">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="shrink-0 h-8 px-2.5 text-xs"
                      onClick={async () => {
                        try {
                          const txt = await navigator.clipboard.readText();
                          onApplyTextCoords(txt, { desdePegar: true });
                        } catch {
                          onApplyTextCoords(coordInput, { desdePegar: false });
                        }
                      }}
                    >
                      <ClipboardText weight="duotone" />
                      <span>Pegar</span>
                    </Button>
                  </ActionTooltip>
                </div>

                {/* Indicador de desplazamiento respecto al catálogo original (solo si cambió la posición) */}
                {sel.lat == null ? (
                  <p className="text-[11px] text-muted-foreground px-1">
                    Haz clic en el mapa o pega un enlace para ubicar el pin.
                  </p>
                ) : deltaM > 1 ? (
                  <div className="flex items-center justify-between gap-2 rounded-md bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 text-xs text-amber-800 dark:text-amber-300">
                    <span className="truncate font-medium">
                      Desplazamiento:{' '}
                      <strong>
                        {deltaM < 1000
                          ? `${Math.round(deltaM)} m`
                          : `${(deltaM / 1000).toFixed(2)} km`}
                      </strong>{' '}
                      al <strong>{rumbo}</strong>
                    </span>
                    {tiendaActualCat?.coordsAnteriores && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        editada previamente
                      </span>
                    )}
                  </div>
                ) : tiendaActualCat?.coordsAnteriores ? (
                  <p className="text-[10px] text-muted-foreground px-1">
                    Coordenada corregida previamente
                  </p>
                ) : null}
              </>
            )}

            {/* Verificación externa con adaptación a mobile */}
            {sel.lat != null && (
              <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
                <Button asChild variant="outline" size="xs" className="h-7.5 px-1.5 text-[11px] truncate">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${sel.lat},${sel.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ArrowSquareOut weight="bold" className="h-3 w-3 shrink-0" />
                    <span className="truncate">Google Maps</span>
                  </a>
                </Button>
                <Button asChild variant="outline" size="xs" className="h-7.5 px-1.5 text-[11px] truncate">
                  <a
                    href={`https://www.google.com/maps/search/${encodeURIComponent(
                      `${sel.nombre || ''} ${sel.estado || 'Chiapas'}`
                    )}/@${sel.lat},${sel.lng},16z`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MagnifyingGlass weight="bold" className="h-3 w-3 shrink-0" />
                    <span className="truncate">Buscar zona</span>
                  </a>
                </Button>
                <Button asChild variant="outline" size="xs" className="h-7.5 px-1.5 text-[11px] truncate">
                  <a
                    href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${sel.lat},${sel.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Binoculars weight="duotone" className="h-3 w-3 shrink-0" />
                    <span className="truncate">Street View</span>
                  </a>
                </Button>
              </div>
            )}

            {/* Guardar / Siguiente adaptado a mobile */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {!bloqueada && (
                  <Button size="sm" className="w-full h-8 text-xs font-semibold" onClick={() => onSaveSelected()}>
                    <CheckCircle weight="duotone" className="h-4 w-4 shrink-0" />
                    <span className="truncate">Verificar y bloquear GPS</span>
                  </Button>
                )}
                {!sel.nueva && stats.pendientes > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn('w-full h-8 text-xs font-medium', bloqueada && 'sm:col-span-2')}
                    onClick={() => onNextPending()}
                  >
                    <span>Siguiente ({stats.pendientes})</span>
                    <FastForward weight="duotone" className="h-4 w-4 shrink-0" />
                  </Button>
                )}
              </div>
              {onShowMap && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full lg:hidden h-8 text-xs font-medium"
                  onClick={onShowMap}
                >
                  <MapTrifold weight="duotone" className="h-4 w-4 shrink-0" />
                  <span>Ver pin en el mapa</span>
                </Button>
              )}
            </div>

            <Separator className="bg-border/60" />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="switch-auto-paste"
                  checked={autoSaveOnPaste}
                  onCheckedChange={onToggleAutoSaveOnPaste}
                />
                <Label
                  htmlFor="switch-auto-paste"
                  className="flex items-center gap-1.5 text-[11px] font-normal text-muted-foreground cursor-pointer"
                >
                  <span>Guardar al pegar</span>
                  <Kbd>Ctrl+V</Kbd>
                </Label>
              </div>

              <div className="flex items-center gap-1">
                {isAdmin && tiendaActualCat?.coordsAnteriores && (
                  <ActionTooltip
                    label={`Restaurar coordenada anterior (${tiendaActualCat.coordsAnteriores})`}
                  >
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        const c = parseCoords(tiendaActualCat.coordsAnteriores);
                        onMoveSelected(c.lat, c.lng);
                      }}
                    >
                      <ArrowCounterClockwise weight="bold" />
                      Original
                    </Button>
                  </ActionTooltip>
                )}
                {isAdmin && tiendaActualCat?.verificada && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => onPatchStore({ verificada: false }, 'Marcada por revisar')}
                  >
                    Marcar por revisar
                  </Button>
                )}
                {isAdmin && !sel.nueva && (
                  <ActionTooltip label="Eliminar tienda del catálogo (Exclusivo Administrador)">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={onDeleteSelected}
                    >
                      <Trash />
                    </Button>
                  </ActionTooltip>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================= FILTROS DEL CATÁLOGO ================= */}
      <div className="shrink-0 space-y-2">
        {/* Selector rápido por Ingeniero */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
          <Button
            type="button"
            variant={ingenieroFiltro === 'todos' ? 'default' : 'outline'}
            size="xs"
            onClick={() => setIngenieroFiltro('todos')}
            className="text-[11px] h-6 px-2 shrink-0"
          >
            Todos ({tiendas.length})
          </Button>
          {ingenierosLista.map((ing) => (
            <Button
              key={ing.nombre}
              type="button"
              variant={ingenieroFiltro === ing.nombre ? 'default' : 'outline'}
              size="xs"
              onClick={() => setIngenieroFiltro(ing.nombre)}
              className={cn(
                'text-[11px] h-6 px-2 shrink-0',
                ing.nombre.includes('HERWING') &&
                  ingenieroFiltro !== ing.nombre &&
                  'border-primary/50 text-primary font-medium'
              )}
            >
              {ing.corto}
              {ing.region ? ` · ${ing.region.replace('CHIAPAS', 'CHIS').replace('SOCONUSCO', 'SOC')}` : ''} ({ing.total})
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 min-w-0">
          <div className="relative flex-1 min-w-0">
            <MagnifyingGlass
              weight="bold"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
            />
            <Input
              size="sm"
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              placeholder="Buscar sucursal, ECO o zona…"
              className="pl-8"
            />
          </div>
          <Select value={zonaFiltro} onValueChange={setZonaFiltro}>
            <SelectTrigger size="sm" className="w-32 sm:w-36 shrink-0">
              <SelectValue placeholder="Zona/Región" />
            </SelectTrigger>
            <SelectContent>
              {zonas.map((z) => (
                <SelectItem key={z.id} value={z.id}>
                  {z.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-3 gap-1">
          {[
            { id: 'todas', label: `Todas (${stats.total})` },
            { id: 'pendientes', label: `Por revisar (${stats.pendientes})` },
            { id: 'verificadas', label: `Revisadas (${stats.verificadas})` },
          ].map((f) => (
            <Button
              key={f.id}
              type="button"
              variant={estadoFiltro === f.id ? 'default' : 'outline'}
              size="xs"
              onClick={() => setEstadoFiltro(f.id)}
              className="w-full px-1.5 text-[11px]"
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* ================= LISTA DE TIENDAS (SCROLL ÚNICO) ================= */}
      <Card className="flex-1 min-h-0 divide-y divide-border overflow-y-auto overscroll-contain">
        {listaFiltrada.length === 0 ? (
          <div className="py-8 text-center">
            <TypographyMuted>Sin tiendas en este filtro.</TypographyMuted>
          </div>
        ) : (
          listaFiltrada.map((t) => {
            const activa = sel?.nombre === t.nombre;
            const zona = clasificarZona(t);
            return (
              <div
                key={t.nombre}
                onClick={() => onSelectStore(t.nombre)}
                className={cn(
                  'flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer transition-colors',
                  activa ? 'bg-accent font-semibold' : 'hover:bg-accent/50'
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full shrink-0',
                      t.verificada ? 'bg-emerald-500' : 'bg-muted-foreground/45'
                    )}
                  />
                  <TypographySmall className={cn('truncate', !activa && 'font-medium')}>
                    {t.nombre}
                  </TypographySmall>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {t.nombre.includes('CEDIS') && (
                    <Badge
                      className="bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30 text-[9px] px-1.5 py-0 h-4 font-bold"
                    >
                      CEDIS
                    </Badge>
                  )}
                  {(t.nombre.includes('CROSS') || t.nombre.includes('DOCK')) && (
                    <Badge
                      className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30 text-[9px] px-1.5 py-0 h-4 font-bold"
                    >
                      CROSS DOCK
                    </Badge>
                  )}
                  {t.nombre.includes('RESGUARDO') && (
                    <Badge
                      className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[9px] px-1.5 py-0 h-4 font-bold"
                    >
                      BASE
                    </Badge>
                  )}
                  {t.eco && t.eco !== '0' && (
                    <Badge
                      variant="outline"
                      className="font-mono text-[10px] px-1 py-0 text-muted-foreground"
                    >
                      {t.eco}
                    </Badge>
                  )}
                  <span className="text-[11px] text-muted-foreground">{t.zona || zona.nombre}</span>
                </div>
              </div>
            );
          })
        )}
      </Card>

      {editModalOpen && tiendaActualCat && (
        <EditStoreModal
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          tienda={tiendaActualCat}
          ingenieros={ingenieros}
          isAdmin={isAdmin}
          onStoreUpdated={(nuevaLista, tiendaModificada) => {
            onStoreUpdated?.(nuevaLista);
            if (tiendaModificada?.nombre) {
              onSelectStore?.(tiendaModificada.nombre);
            }
          }}
          onStoreDeleted={() => {
            onDeleteSelected?.();
          }}
          toast={toast}
        />
      )}
    </div>
  );
}
