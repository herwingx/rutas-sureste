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
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
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
  sel,
  autoSaveOnPaste,
  onToggleAutoSaveOnPaste,
  onSelectStore,
  onStartNewStore,
  onUpdateSelectedName,
  onUpdateSelectedState,
  onMoveSelected,
  onApplyTextCoords,
  onSaveSelected,
  onNextPending,
  onPatchStore,
  onDeleteSelected,
  onExportJson,
}) {
  const [filtroTexto, setFiltroTexto] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('todas');
  const [zonaFiltro, setZonaFiltro] = useState('todas');
  const [coordInput, setCoordInput] = useState('');

  const zonas = useMemo(() => zonasDisponibles(tiendas), [tiendas]);

  useEffect(() => {
    if (sel && sel.lat != null) {
      setCoordInput(fmtCoords(sel.lat, sel.lng));
    } else {
      setCoordInput('');
    }
  }, [sel?.nombre, sel?.lat, sel?.lng, sel?.nueva]);

  const stats = useMemo(() => {
    const total = tiendas.length;
    const verificadas = tiendas.filter((t) => t.verificada).length;
    const corregidas = tiendas.filter((t) => t.coordsAnteriores).length;
    return { total, verificadas, pendientes: total - verificadas, corregidas };
  }, [tiendas]);

  const listaFiltrada = useMemo(() => {
    const q = expandirConsulta(filtroTexto);
    return tiendas.filter((t) => {
      if (q && !norm(`${t.nombre} ${t.estado || ''}`).includes(q)) return false;
      if (estadoFiltro === 'pendientes' && t.verificada) return false;
      if (estadoFiltro === 'verificadas' && !t.verificada) return false;
      if (estadoFiltro === 'corregidas' && !t.coordsAnteriores) return false;
      if (zonaFiltro !== 'todas' && clasificarZona(t).id !== zonaFiltro) return false;
      return true;
    });
  }, [tiendas, filtroTexto, estadoFiltro, zonaFiltro]);

  const tiendaActualCat = sel && !sel.nueva ? porNombre.get(sel.nombre) : null;
  const deltaM = sel?.orig && sel?.lat != null ? haversineM(sel.orig, sel) : 0;
  const rumbo = sel?.orig && sel?.lat != null ? rumboCardinal(sel.orig, sel) : '';

  return (
    <div className="flex flex-col gap-3">
      {/* ================= BARRA SUPERIOR DE CATÁLOGO ================= */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={onStartNewStore}>
            <PlusCircle weight="duotone" />
            Nueva tienda
          </Button>
          {stats.pendientes > 0 && (
            <Button variant="outline" size="sm" onClick={() => onNextPending('')}>
              Siguiente por revisar ({stats.pendientes})
            </Button>
          )}
        </div>
        <ActionTooltip label="Descargar respaldo de catálogo (JSON)">
          <Button variant="ghost" size="xs" onClick={onExportJson}>
            <DownloadSimple weight="duotone" />
            Exportar
          </Button>
        </ActionTooltip>
      </div>

      {/* ================= EDITOR DE TIENDA SELECCIONADA ================= */}
      {sel && (
        <Card className="border-foreground/30 bg-muted/20 shadow-xs">
          <CardContent className="p-3 space-y-2.5">
            <div className="flex items-center gap-1.5">
              <Input
                size="sm"
                value={sel.nombreEdit ?? sel.nombre}
                onChange={(e) => onUpdateSelectedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onSaveSelected();
                  }
                }}
                placeholder="Nombre de tienda (ej. VILLAHERMOSA CENTRO)"
                className="font-semibold bg-card flex-1"
              />
              <Select
                value={sel.estado || 'Chiapas'}
                onValueChange={(v) => onUpdateSelectedState?.(v)}
              >
                <SelectTrigger size="sm" className="w-33 bg-card">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS.map((est) => (
                    <SelectItem key={est} value={est}>
                      {est}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Coordenadas o link */}
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
                className="font-mono bg-card flex-1"
              />
              <ActionTooltip label="Pegar del portapapeles" shortcut="Ctrl+V">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
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
                  Pegar
                </Button>
              </ActionTooltip>
            </div>

            {/* Estado de posición */}
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/80 bg-card px-2.5 py-1.5 text-xs">
              {sel.lat == null ? (
                <TypographyMuted>
                  Haz clic en el mapa o pega un enlace para ubicar el pin.
                </TypographyMuted>
              ) : deltaM > 1 ? (
                <TypographyMuted className="text-foreground">
                  Ajustada{' '}
                  <strong>
                    {deltaM < 1000
                      ? `${Math.round(deltaM)} m`
                      : `${(deltaM / 1000).toFixed(2)} km`}
                  </strong>{' '}
                  al <strong>{rumbo}</strong>
                </TypographyMuted>
              ) : (
                <TypographyMono className="text-[11px] text-muted-foreground">
                  {sel.lat.toFixed(6)}, {sel.lng.toFixed(6)}
                </TypographyMono>
              )}
              {tiendaActualCat?.coordsAnteriores && (
                <span className="text-[10px] text-muted-foreground">editada previamente</span>
              )}
            </div>

            {/* Verificación externa */}
            {sel.lat != null && (
              <div className="grid grid-cols-3 gap-1.5">
                <Button asChild variant="outline" size="xs">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${sel.lat},${sel.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ArrowSquareOut weight="bold" />
                    Google Maps
                  </a>
                </Button>
                <Button asChild variant="outline" size="xs">
                  <a
                    href={`https://www.google.com/maps/search/${encodeURIComponent(
                      `${sel.nombre || ''} ${sel.estado || 'Chiapas'}`
                    )}/@${sel.lat},${sel.lng},16z`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MagnifyingGlass weight="bold" />
                    Buscar zona
                  </a>
                </Button>
                <Button asChild variant="outline" size="xs">
                  <a
                    href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${sel.lat},${sel.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Binoculars weight="duotone" />
                    Street View
                  </a>
                </Button>
              </div>
            )}

            {/* Guardar / Siguiente */}
            <div className="flex items-center gap-1.5">
              <Button size="sm" className="flex-1" onClick={() => onSaveSelected()}>
                <CheckCircle weight="duotone" />
                Guardar ubicación (Enter)
              </Button>
              {!sel.nueva && stats.pendientes > 0 && (
                <Button variant="outline" size="sm" onClick={() => onNextPending()}>
                  Siguiente
                  <FastForward weight="duotone" />
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
                {tiendaActualCat?.coordsAnteriores && (
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
                {tiendaActualCat?.verificada && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => onPatchStore({ verificada: false }, 'Marcada por revisar')}
                  >
                    Marcar por revisar
                  </Button>
                )}
                {!sel.nueva && (
                  <ActionTooltip label="Eliminar tienda del catálogo">
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
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <MagnifyingGlass
              weight="bold"
              className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
            />
            <Input
              size="sm"
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              placeholder="Buscar tienda o estado…"
              className="pl-8"
            />
          </div>
          <Select value={zonaFiltro} onValueChange={setZonaFiltro}>
            <SelectTrigger size="sm" className="w-37.5">
              <SelectValue placeholder="Región" />
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

      {/* ================= LISTA DE TIENDAS ================= */}
      <Card className="divide-y divide-border overflow-hidden">
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
                  <span className="text-[11px] text-muted-foreground">{zona.nombre}</span>
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
