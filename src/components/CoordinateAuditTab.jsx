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
import { ESTADOS, INGENIEROS } from '@/lib/brand';
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
  isAdmin = false,
  userSession = null,
  onRequireAuth = null,
}) {
  const [filtroTexto, setFiltroTexto] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('todas');
  const [zonaFiltro, setZonaFiltro] = useState('todas');
  const [ingenieroFiltro, setIngenieroFiltro] = useState('todos');
  const [coordInput, setCoordInput] = useState('');

  const ingenierosLista = useMemo(() => {
    const conteo = new Map();
    tiendas.forEach((t) => {
      const ing = t.ingeniero || 'SIN ASIGNAR';
      conteo.set(ing, (conteo.get(ing) || 0) + 1);
    });
    return Array.from(conteo.entries()).map(([nombre, total]) => ({
      nombre,
      corto: nombre.split(' ')[0] + (nombre.includes('VAZQUEZ') ? ' (Mis tiendas)' : ''),
      total,
    }));
  }, [tiendas]);

  const zonas = useMemo(() => {
    const base = ingenieroFiltro === 'todos' ? tiendas : tiendas.filter((t) => t.ingeniero === ingenieroFiltro);
    return zonasDisponibles(base);
  }, [tiendas, ingenieroFiltro]);

  useEffect(() => {
    if (sel && sel.lat != null) {
      setCoordInput(fmtCoords(sel.lat, sel.lng));
    } else {
      setCoordInput('');
    }
  }, [sel?.nombre, sel?.lat, sel?.lng, sel?.nueva]);

  const stats = useMemo(() => {
    const base = ingenieroFiltro === 'todos' ? tiendas : tiendas.filter((t) => t.ingeniero === ingenieroFiltro);
    const total = base.length;
    const verificadas = base.filter((t) => t.verificada).length;
    const corregidas = base.filter((t) => t.coordsAnteriores).length;
    return { total, verificadas, pendientes: total - verificadas, corregidas };
  }, [tiendas, ingenieroFiltro]);

  const listaFiltrada = useMemo(() => {
    const q = expandirConsulta(filtroTexto);
    return tiendas.filter((t) => {
      if (ingenieroFiltro !== 'todos' && t.ingeniero !== ingenieroFiltro) return false;
      if (
        q &&
        !norm(
          `${t.nombre} ${t.eco || ''} ${t.ceco || ''} ${t.zona || ''} ${t.estado || ''} ${t.ingeniero || ''}`
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
  }, [tiendas, filtroTexto, estadoFiltro, zonaFiltro, ingenieroFiltro]);

  const tiendaActualCat = sel && !sel.nueva ? porNombre.get(sel.nombre) : null;
  const bloqueada = Boolean(tiendaActualCat?.verificada && !sel?.desbloqueada);
  const deltaM = sel?.orig && sel?.lat != null ? haversineM(sel.orig, sel) : 0;
  const rumbo = sel?.orig && sel?.lat != null ? rumboCardinal(sel.orig, sel) : '';

  return (
    <div className="flex flex-col gap-3">
      {/* ================= BARRA SUPERIOR DE CATÁLOGO ================= */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={() => onOpenNewStoreModal?.()}>
            <PlusCircle weight="duotone" />
            Nueva tienda
          </Button>
          {stats.pendientes > 0 && (
            <Button variant="outline" size="sm" onClick={() => onNextPending('')}>
              Siguiente por revisar ({stats.pendientes})
            </Button>
          )}
        </div>
        <ActionTooltip label="Descargar respaldo completo del catálogo (JSON)">
          <Button variant="outline" size="xs" onClick={onExportJson}>
            <DownloadSimple weight="duotone" />
            Descargar JSON ({tiendas.length})
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
                disabled={bloqueada}
                onChange={(e) => onUpdateSelectedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !bloqueada) {
                    e.preventDefault();
                    onSaveSelected();
                  }
                }}
                placeholder="Nombre de tienda (ej. VILLAHERMOSA CENTRO)"
                className="font-semibold bg-card flex-1"
              />
              <Select
                value={sel.estado || 'Chiapas'}
                disabled={bloqueada}
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

            {/* Metadatos de ingeniería (ECO, CECO, Zona, Ingeniero) */}
            {(tiendaActualCat?.eco || tiendaActualCat?.zona || tiendaActualCat?.ingeniero) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {tiendaActualCat.eco && tiendaActualCat.eco !== '0' && (
                  <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0.5">
                    ECO {tiendaActualCat.eco}
                  </Badge>
                )}
                {tiendaActualCat.ceco && tiendaActualCat.ceco !== '0' && (
                  <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0.5">
                    CECO {tiendaActualCat.ceco}
                  </Badge>
                )}
                {tiendaActualCat.zona && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                    {tiendaActualCat.zona}
                  </Badge>
                )}
                {tiendaActualCat.ingeniero && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 text-muted-foreground">
                    {tiendaActualCat.ingeniero.split(' ')[0]}
                  </Badge>
                )}
              </div>
            )}

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
              </>
            )}

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
              {!bloqueada && (
                <Button size="sm" className="flex-1" onClick={() => onSaveSelected()}>
                  <CheckCircle weight="duotone" />
                  Verificar y bloquear ubicación (Enter)
                </Button>
              )}
              {!sel.nueva && stats.pendientes > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(bloqueada && 'w-full')}
                  onClick={() => onNextPending()}
                >
                  Siguiente pendiente ({stats.pendientes})
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
      <div className="space-y-2">
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
              {ing.corto} ({ing.total})
            </Button>
          ))}
        </div>

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
              placeholder="Buscar por nombre, ECO, CECO o zona…"
              className="pl-8"
            />
          </div>
          <Select value={zonaFiltro} onValueChange={setZonaFiltro}>
            <SelectTrigger size="sm" className="w-37.5">
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
    </div>
  );
}
