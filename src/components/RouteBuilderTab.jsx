/**
 * @fileoverview Módulo Constructor de Rutas y Matriz de Costos (`RouteBuilderTab.jsx`).
 *
 * Funcionalidades principales:
 * - Buscador predictivo de tiendas con filtros rápidos por corredor logístico y estado.
 * - Selector de fecha de operación (`DatePicker` de shadcn/ui con localización `es` y presets).
 * - Lista de paradas interactiva con soporte Drag & Drop nativo, reordenamiento manual,
 *   inversión de sentido y adición de paradas personalizadas (por coordenadas o clic en mapa).
 * - Optimización automática de secuencia (2-Opt TSP vía `/api/optimizar`) e indicadores KPI
 *   en tiempo real (Kilómetros, Combustible + Casetas, Litros y Tiempo estimado).
 * - Tabla desglosada tramo por tramo (`A -> B`) y exportación directa en formato TSV
 *   compatible con pegado directo en Excel / Google Sheets y resumen para WhatsApp.
 */

import { useState, useMemo } from 'react';
import {
  MagnifyingGlass,
  CopySimple,
  FloppyDiskBack,
  ArrowUUpLeft,
  ArrowsDownUp,
  Plus,
  Trash,
  DotsSixVertical,
  Path,
  GasPump,
  Receipt,
  Timer,
  Drop,
  ClipboardText,
  ShareNetwork,
  CaretUp,
  CaretDown,
  Table as TableIcon,
  Crosshair,
  Warehouse,
  FlagCheckered,
  CompassTool,
  MapPinLine,
  FileXls,
  CheckCircle,
  ArrowRight,
  Lightning,
  CalendarCheck,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Kbd } from '@/components/ui/kbd';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ActionTooltip } from '@/components/ui/tooltip';
import {
  TypographyH4,
  TypographySmall,
  TypographyMuted,
  TypographyMono,
  TypographyLarge,
} from '@/components/ui/typography';
import {
  cn,
  norm,
  expandirConsulta,
  pareceUbicacion,
  haversineM,
  clasificarZona,
  zonasDisponibles,
  pesos,
  duracion,
  obtenerDiasSemana,
} from '@/lib/utils';
import { calcularSemanaISO } from '@/lib/bitacora-excel';

export function RouteBuilderTab({
  searchInputRef,
  tiendas,
  porNombre,
  baseTienda,
  ruta,
  tramos,
  calculando,
  totales,
  filasExcel,
  onMutateRuta,
  onUndo,
  canUndo,
  onAddStore,
  onAddBatchStores,
  onAddDetour,
  onOptimize,
  onCopyExcel,
  onCopyWhatsApp,
  onSaveDay,
  onNewRoute,
  onJumpToAudit,
  onOpenBitacora,
  historial = [],
  ingenieroActivo = '',
  modoOperativo = 'comprobacion',
  onSetModoOperativo,
  onSaveAndNext,
  onSelectDay,
  onCopyAnticipo,
}) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [zonaFiltro, setZonaFiltro] = useState('cercanas');
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [showTablePreview, setShowTablePreview] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  // Información de Semana y Días de la semana para flujo ágil
  const semanaInfo = useMemo(() => calcularSemanaISO(ruta.fecha), [ruta.fecha]);
  const diasSemana = useMemo(() => obtenerDiasSemana(ruta.fecha), [ruta.fecha]);

  // Mapa de días guardados en el historial para este ingeniero en el modo operativo activo
  const mapaDiasHistorial = useMemo(() => {
    const mapa = {};
    (historial || []).forEach((h) => {
      if (!h.fecha) return;
      const coincideIng = !h.ingeniero || !ingenieroActivo || h.ingeniero === ingenieroActivo;
      if (!coincideIng) return;
      const tipoRuta = h.tipo || 'comprobacion';
      if (tipoRuta === modoOperativo) {
        mapa[h.fecha] = h;
      }
    });
    return mapa;
  }, [historial, ingenieroActivo, modoOperativo]);

  // Mapa de anticipos guardados (para poder importar a comprobación)
  const mapaAnticipos = useMemo(() => {
    const mapa = {};
    (historial || []).forEach((h) => {
      if (!h.fecha) return;
      const coincideIng = !h.ingeniero || !ingenieroActivo || h.ingeniero === ingenieroActivo;
      if (!coincideIng) return;
      if (h.tipo === 'anticipo') {
        mapa[h.fecha] = h;
      }
    });
    return mapa;
  }, [historial, ingenieroActivo]);

  const nombreDiaActual = useMemo(() => {
    const d = new Date(ruta.fecha + 'T12:00:00');
    const nombres = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return nombres[d.getDay()] || 'Día';
  }, [ruta.fecha]);

  const diaMesActual = useMemo(() => {
    if (!ruta.fecha) return '';
    const parts = ruta.fecha.split('-');
    return parts[2] || '';
  }, [ruta.fecha]);

  const siguienteDiaInfo = useMemo(() => {
    const d = new Date(ruta.fecha + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1); // saltar domingo
    const nombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const diaNum = String(d.getDate()).padStart(2, '0');
    return {
      iso: `${y}-${m}-${diaNum}`,
      label: `${nombres[d.getDay()]} ${diaNum}`,
      nombre: nombres[d.getDay()],
    };
  }, [ruta.fecha]);

  const estaGuardado = useMemo(() => {
    if (ruta.id) return true;
    const h = mapaDiasHistorial[ruta.fecha];
    return Boolean(
      h &&
      (h.paradas || []).length === (ruta.paradas || []).length &&
      Number(h.totalKm) === Number(totales.km)
    );
  }, [ruta.id, mapaDiasHistorial, ruta.fecha, ruta.paradas, totales.km]);

  const diasListosSemana = useMemo(() => {
    return diasSemana.filter(
      (d) => mapaDiasHistorial[d.fecha] || (ruta.fecha === d.fecha && ruta.paradas.length > 0)
    );
  }, [diasSemana, mapaDiasHistorial, ruta.fecha, ruta.paradas.length]);

  const kmAcumuladoSemana = useMemo(() => {
    let sum = 0;
    diasSemana.forEach((d) => {
      if (ruta.fecha === d.fecha) {
        sum += totales.km;
      } else if (mapaDiasHistorial[d.fecha]) {
        sum += Number(mapaDiasHistorial[d.fecha].totalKm) || 0;
      }
    });
    return Math.round(sum);
  }, [diasSemana, ruta.fecha, totales.km, mapaDiasHistorial]);

  const anticipoDisponibleParaImportar = useMemo(() => {
    if (modoOperativo !== 'comprobacion') return null;
    const ant = mapaAnticipos[ruta.fecha];
    if (ant && (ant.paradas || []).length > 0 && ruta.paradas.length === 0) {
      return ant;
    }
    return null;
  }, [modoOperativo, mapaAnticipos, ruta.fecha, ruta.paradas.length]);

  const zonas = useMemo(() => zonasDisponibles(tiendas), [tiendas]);

  const ultimoPunto = useMemo(() => {
    return ruta.paradas.at(-1) || baseTienda || tiendas[0] || null;
  }, [ruta.paradas, baseTienda, tiendas]);

  const enRutaSet = useMemo(() => new Set(ruta.paradas.map((p) => p.nombre)), [ruta.paradas]);

  const buscarTiendas = (q) => {
    const rawTrim = q.trim();
    const nq = expandirConsulta(rawTrim);
    if (!nq) return [];
    const tokens = nq.split(' ').filter(Boolean);
    const requeridos = rawTrim.split(/\s+/).length;
    const out = [];

    for (const t of tiendas) {
      const fullSearch = norm(
        `${t.nombre} ${t.eco || ''} ${t.ceco || ''} ${t.zona || ''} ${t.estado || ''} ${t.ingeniero || ''}`
      );
      const palabras = fullSearch.split(' ');
      let score = 0;
      let coincidencias = 0;

      if (t.eco && (t.eco === rawTrim || t.eco.startsWith(rawTrim))) score += 12;
      if (t.ceco && (t.ceco === rawTrim || t.ceco.startsWith(rawTrim))) score += 10;

      for (const tk of tokens) {
        if (palabras.some((w) => w.startsWith(tk))) {
          score += 3;
          coincidencias++;
        } else if (fullSearch.includes(tk)) {
          score += 1;
          coincidencias++;
        }
      }
      if (coincidencias < Math.min(requeridos, tokens.length) && score < 8) continue;
      if (norm(t.nombre).startsWith(nq)) score += 5;
      if (enRutaSet.has(t.nombre)) score -= 2;
      const distKm = ultimoPunto ? haversineM(ultimoPunto, t) / 1000 : 0;
      out.push({ t, score, enRuta: enRutaSet.has(t.nombre), distKm, zona: clasificarZona(t) });
    }
    return out.sort((a, b) => b.score - a.score || a.distKm - b.distKm).slice(0, 8);
  };

  const extraerLote = (texto) => {
    if (pareceUbicacion(texto)) return null;
    const partes = String(texto || '')
      .split(/[\n,;→>]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (partes.length < 2) return null;
    const encontradas = [];
    for (const p of partes) {
      const res = buscarTiendas(p);
      if (res.length && res[0].t.nombre !== baseTienda?.nombre) {
        encontradas.push(res[0].t);
      }
    }
    return encontradas.length >= 2 ? encontradas : null;
  };

  const resultados = useMemo(() => {
    if (!query.trim()) return [];
    const lote = extraerLote(query);
    if (lote) {
      return [
        {
          tipo: 'lote',
          label: `Agregar ${lote.length} tiendas en orden`,
          sub: lote.map((x) => x.nombre).join(' → '),
          tiendas: lote,
        },
      ];
    }
    if (pareceUbicacion(query)) {
      return [
        {
          tipo: 'desvio',
          label: 'Agregar desvío temporal con esta coordenada o enlace',
          texto: query,
        },
      ];
    }
    return buscarTiendas(query).map((r) => ({ tipo: 'tienda', ...r }));
  }, [query, tiendas, ultimoPunto, enRutaSet]);

  const seleccionarResultado = (item) => {
    if (!item) return;
    setQuery('');
    setDropdownOpen(false);
    setActiveIdx(0);
    if (item.tipo === 'lote') {
      onAddBatchStores(item.tiendas);
    } else if (item.tipo === 'desvio') {
      onAddDetour(item.texto);
    } else if (item.tipo === 'tienda') {
      onAddStore(item.t);
    }
  };

  const sugerencias = useMemo(() => {
    if (!tiendas.length || !ultimoPunto) return [];
    const candidatos = tiendas
      .filter((t) => !enRutaSet.has(t.nombre) && t.nombre !== baseTienda?.nombre)
      .map((t) => ({
        t,
        km: haversineM(ultimoPunto, t) / 1000,
        zona: clasificarZona(t),
      }));

    if (zonaFiltro === 'cercanas') {
      return candidatos.sort((a, b) => a.km - b.km).slice(0, 6);
    }
    return candidatos
      .filter((c) => c.zona.id === zonaFiltro)
      .sort((a, b) => a.km - b.km)
      .slice(0, 10);
  }, [tiendas, ultimoPunto, enRutaSet, baseTienda, zonaFiltro]);

  const batchPreview = useMemo(() => {
    const lineas = batchText
      .split(/[\n,;→>]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return lineas.map((linea) => {
      const match = buscarTiendas(linea)[0];
      return { linea, tienda: match?.t || null };
    });
  }, [batchText, tiendas]);

  const offsetBase = ruta.baseInicio && baseTienda ? 1 : 0;

  return (
    <div className="flex flex-col gap-3">
      {/* ================= BARRA DE MODO OPERATIVO (ANTICIPO vs COMPROBACIÓN) ================= */}
      <div className="rounded-xl border border-border/80 bg-muted/20 p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">
            Control Semanal
          </span>
          <Badge variant="outline" className="text-[10px] font-medium bg-background/60 border-border/70">
            Semana {semanaInfo.semana} ({semanaInfo.anio})
          </Badge>
        </div>

        {/* Selector de modo estilo segmented pill */}
        <div className="grid grid-cols-2 p-0.5 rounded-lg bg-muted/60 border border-border/50">
          <button
            type="button"
            onClick={() => onSetModoOperativo?.('anticipo')}
            className={cn(
              'flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs transition-all cursor-pointer',
              modoOperativo === 'anticipo'
                ? 'bg-amber-600 text-white font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            <Receipt weight="duotone" className="h-3.5 w-3.5" />
            <span>📋 Anticipo</span>
          </button>
          <button
            type="button"
            onClick={() => onSetModoOperativo?.('comprobacion')}
            className={cn(
              'flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs transition-all cursor-pointer',
              modoOperativo === 'comprobacion'
                ? 'bg-blue-600 text-white font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            )}
          >
            <GasPump weight="duotone" className="h-3.5 w-3.5" />
            <span>⛽ Comprobación</span>
          </button>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5">
          <span className="truncate pr-2">
            {modoOperativo === 'anticipo'
              ? 'Planeación previa de visitas para presupuesto'
              : 'Bitácora real con odómetro y tickets para justificar gastos'}
          </span>
          <span className="font-mono font-semibold shrink-0 text-foreground">
            {kmAcumuladoSemana} km acum.
          </span>
        </div>

        {/* Tira interactiva de días de la semana */}
        <div className="pt-1.5 border-t border-border/40">
          <div className="flex items-center justify-between pb-1 text-[10px] text-muted-foreground">
            <span>Días de la semana</span>
            <span className="font-mono font-medium">
              {diasListosSemana.length} de {diasSemana.slice(0, 6).length} listos
            </span>
          </div>
          <div className="grid grid-cols-6 gap-1">
            {diasSemana.slice(0, 6).map((d) => {
              const esActivo = ruta.fecha === d.fecha;
              const guardado = mapaDiasHistorial[d.fecha];
              return (
                <button
                  key={d.fecha}
                  type="button"
                  onClick={() => {
                    if (guardado) {
                      onSelectDay?.(d.fecha, guardado);
                    } else {
                      onSelectDay?.(d.fecha, null);
                    }
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border text-center transition-all cursor-pointer',
                    esActivo
                      ? 'border-primary bg-primary/10 text-primary font-bold ring-2 ring-primary/40 shadow-xs'
                      : guardado
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20'
                      : 'border-border/60 bg-card/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                  title={`${d.diaNombre} ${d.diaMes} · ${guardado ? `${guardado.totalKm} km guardados` : 'Sin ruta'}`}
                >
                  <span className="text-[9px] uppercase font-bold tracking-tight">{d.diaNombre}</span>
                  <span className="text-xs font-semibold tabular-nums leading-none mt-0.5">{d.diaMes}</span>
                  <span className="text-[8px] mt-1 leading-none font-mono">
                    {guardado ? `${Math.round(guardado.totalKm)}k ✓` : esActivo ? 'En curso' : '—'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Banner de conveniencia si hay un Anticipo guardado para hoy y estamos en Comprobación */}
      {anticipoDisponibleParaImportar && (
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs animate-in fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <Lightning weight="fill" className="h-4 w-4 shrink-0 text-amber-500" />
            <div className="min-w-0">
              <span className="font-semibold block truncate">Anticipo planeado disponible</span>
              <span className="text-[10px] text-muted-foreground truncate block">
                {anticipoDisponibleParaImportar.paradas.length} tiendas · {anticipoDisponibleParaImportar.totalKm} km
              </span>
            </div>
          </div>
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="border-amber-500/40 bg-background/80 hover:bg-amber-500/20 text-xs shrink-0 font-medium"
            onClick={() => onCopyAnticipo?.(ruta.fecha)}
          >
            Importar tiendas
          </Button>
        </div>
      )}

      {/* ================= FILA FECHA + ETIQUETA + ACCIONES ================= */}
      <div className="flex items-center gap-1.5">
        <DatePicker
          value={ruta.fecha}
          onChange={(fecha) => onMutateRuta((r) => ({ ...r, fecha }))}
        />
        <Input
          type="text"
          size="sm"
          value={ruta.nombre}
          onChange={(e) => onMutateRuta((r) => ({ ...r, nombre: e.target.value }))}
          placeholder="Ruta o corredor (opcional)"
          className="flex-1"
        />
        <ActionTooltip label="Invertir orden de paradas">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={ruta.paradas.length < 2}
            onClick={() =>
              onMutateRuta((r) => ({
                ...r,
                paradas: [...r.paradas].reverse(),
              }))
            }
          >
            <ArrowsDownUp weight="bold" />
          </Button>
        </ActionTooltip>
        <ActionTooltip label="Deshacer último cambio" shortcut="Ctrl+Z">
          <Button variant="outline" size="icon-sm" disabled={!canUndo} onClick={onUndo}>
            <ArrowUUpLeft weight="bold" />
          </Button>
        </ActionTooltip>
        <ActionTooltip label="Limpiar ruta actual">
          <Button variant="ghost" size="sm" onClick={onNewRoute}>
            <Plus weight="bold" />
            Nueva
          </Button>
        </ActionTooltip>
      </div>

      {/* ================= BUSCADOR ================= */}
      <div className="relative">
        <div className="relative flex items-center">
          <MagnifyingGlass
            weight="bold"
            className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground"
          />
          <Input
            ref={searchInputRef}
            size="lg"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
              setDropdownOpen(true);
            }}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => setTimeout(() => setDropdownOpen(false), 160)}
            onPaste={(e) => {
              const txt = e.clipboardData?.getData('text') || '';
              const lote = extraerLote(txt);
              if (lote) {
                e.preventDefault();
                setQuery('');
                setDropdownOpen(false);
                onAddBatchStores(lote);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIdx((i) => (i + 1) % Math.max(resultados.length, 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIdx(
                  (i) => (i - 1 + Math.max(resultados.length, 1)) % Math.max(resultados.length, 1)
                );
              } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                if (resultados[activeIdx]) seleccionarResultado(resultados[activeIdx]);
              } else if (e.key === 'Escape') {
                setQuery('');
                setDropdownOpen(false);
              } else if (e.key === 'Backspace' && !query && ruta.paradas.length > 0) {
                onMutateRuta((r) => ({ ...r, paradas: r.paradas.slice(0, -1) }));
              }
            }}
            placeholder="Buscar tienda, ECO, ciudad o coordenadas…"
            className="pl-9 pr-24 rounded-lg"
          />
          <div className="absolute right-2 flex items-center gap-1">
            <ActionTooltip label="Pegar lista de tiendas desde Excel o texto">
              <Button
                type="button"
                variant="secondary"
                size="xs"
                className="h-6 px-2 text-[11px]"
                onClick={() => setBatchModalOpen(true)}
              >
                <ClipboardText weight="duotone" className="h-3.5 w-3.5" />
                Lote
              </Button>
            </ActionTooltip>
            <Kbd className="hidden sm:inline-flex">/</Kbd>
          </div>
        </div>

        {/* Resultados de búsqueda */}
        {dropdownOpen && query.trim() && (
          <Card className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-80 overflow-auto border-border bg-popover p-1 shadow-lg">
            {resultados.length === 0 ? (
              <div className="px-3 py-3.5 text-center">
                <TypographyMuted>
                  Sin coincidencias para <strong className="text-foreground">"{query}"</strong>.
                  Puedes agregarla en <strong className="text-foreground">Catálogo → Nueva tienda</strong>.
                </TypographyMuted>
              </div>
            ) : (
              resultados.map((r, i) => (
                <div
                  key={i}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    seleccionarResultado(r);
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs cursor-pointer transition-colors',
                    i === activeIdx ? 'bg-accent text-foreground' : 'hover:bg-accent/60'
                  )}
                >
                  {r.tipo === 'lote' ? (
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <TypographySmall className="text-primary">{r.label}</TypographySmall>
                      <TypographyMuted className="truncate">{r.sub}</TypographyMuted>
                    </div>
                  ) : r.tipo === 'desvio' ? (
                    <TypographySmall className="flex items-center gap-1.5">
                      <MapPinLine weight="duotone" className="h-3.5 w-3.5 text-muted-foreground" />
                      {r.label}
                    </TypographySmall>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 min-w-0">
                        {r.t.eco && r.t.eco !== '0' && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1 py-0 font-mono text-muted-foreground shrink-0"
                          >
                            {r.t.eco}
                          </Badge>
                        )}
                        <TypographySmall className="truncate font-medium">
                          {r.t.nombre}
                        </TypographySmall>
                        {r.enRuta && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            en ruta
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-muted-foreground">
                          {r.t.zona || r.zona.nombre}
                        </span>
                        <TypographyMono className="text-[11px] text-muted-foreground w-14 text-right tabular-nums">
                          {r.distKm < 1
                            ? `${Math.round(r.distKm * 1000)} m`
                            : `${Math.round(r.distKm)} km`}
                        </TypographyMono>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </Card>
        )}
      </div>

      {/* ================= SUGERENCIAS POR PROXIMIDAD O REGIÓN ================= */}
      <Card className="bg-muted/25 border-border/80">
        <CardContent className="p-2.5">
          <div className="mb-2 flex items-center gap-1 overflow-x-auto pb-0.5">
            <Button
              type="button"
              variant={zonaFiltro === 'cercanas' ? 'default' : 'ghost'}
              size="xs"
              className="h-6 px-2 text-[11px] shrink-0"
              onClick={() => setZonaFiltro('cercanas')}
            >
              Cercanas
            </Button>
            {zonas
              .filter((z) => z.id !== 'todas')
              .map((z) => (
                <Button
                  key={z.id}
                  type="button"
                  variant={zonaFiltro === z.id ? 'default' : 'ghost'}
                  size="xs"
                  className="h-6 px-2 text-[11px] shrink-0"
                  onClick={() => setZonaFiltro(z.id)}
                >
                  {z.nombre}
                </Button>
              ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {sugerencias.length === 0 ? (
              <TypographyMuted>
                No hay más tiendas disponibles en este filtro.
              </TypographyMuted>
            ) : (
              sugerencias.map(({ t, km }) => (
                <Button
                  key={t.nombre}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => onAddStore(t)}
                  className="h-6.5 gap-1.5 bg-card px-2 font-normal hover:border-foreground/30"
                >
                  <span className="font-medium text-foreground">{t.nombre}</span>
                  <TypographyMono className="text-[10px] text-muted-foreground tabular-nums">
                    {km < 1 ? `${Math.round(km * 1000)}m` : `${Math.round(km)}km`}
                  </TypographyMono>
                </Button>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* ================= SECUENCIA DE PARADAS ================= */}
      <div className="flex flex-col gap-1.5">
        {/* Salida de Base */}
        {baseTienda && (
          <Card className={cn('px-3 py-2 transition-opacity', !ruta.baseInicio && 'opacity-50')}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                  <Warehouse weight="duotone" className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <TypographyH4 className="truncate text-xs font-semibold">
                    {baseTienda.nombre}
                  </TypographyH4>
                  <TypographyMuted className="text-[10px]">Salida</TypographyMuted>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="switch-base-inicio"
                  className="text-[11px] font-normal text-muted-foreground cursor-pointer"
                >
                  Incluir salida
                </Label>
                <Switch
                  id="switch-base-inicio"
                  checked={ruta.baseInicio}
                  onCheckedChange={(v) => onMutateRuta((r) => ({ ...r, baseInicio: v }))}
                />
              </div>
            </div>
          </Card>
        )}

        {/* Paradas intermedias */}
        {ruta.paradas.length === 0 ? (
          <Card className="border-dashed bg-muted/15 px-4 py-6 text-center">
            <div className="flex flex-col items-center justify-center">
              <Path weight="duotone" className="mb-1.5 h-6 w-6 text-muted-foreground/60" />
              <TypographySmall className="text-muted-foreground">
                Sin paradas asignadas
              </TypographySmall>
              <TypographyMuted className="mt-0.5 text-[11px]">
                Selecciona tiendas en el buscador, en las sugerencias o directamente en el mapa.
              </TypographyMuted>
            </div>
          </Card>
        ) : (
          ruta.paradas.map((p, k) => {
            const idxTramo = offsetBase + k - 1;
            const tramo = idxTramo >= 0 ? tramos[idxTramo] : null;
            const tiendaCat = porNombre.get(p.nombre);
            const zona = !p.temporal && tiendaCat ? clasificarZona(tiendaCat) : null;

            return (
              <Card
                key={`${p.nombre}-${k}`}
                draggable
                onDragStart={(e) => {
                  setDragIdx(k);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragIdx === null || dragIdx === k) return;
                  setDropTarget(k);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIdx === null || dragIdx === k) return;
                  onMutateRuta((r) => {
                    const arr = [...r.paradas];
                    const [item] = arr.splice(dragIdx, 1);
                    arr.splice(k, 0, item);
                    return { ...r, paradas: arr };
                  });
                  setDragIdx(null);
                  setDropTarget(null);
                }}
                onDragEnd={() => {
                  setDragIdx(null);
                  setDropTarget(null);
                }}
                className={cn(
                  'group relative flex items-center gap-2 px-2.5 py-2 transition-all',
                  dragIdx === k && 'opacity-40',
                  dropTarget === k
                    ? 'border-primary ring-1 ring-primary/30'
                    : 'hover:border-foreground/25'
                )}
              >
                <DotsSixVertical
                  weight="bold"
                  className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/45 group-hover:text-muted-foreground"
                />
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
                    p.temporal
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-foreground text-background'
                  )}
                >
                  {k + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <TypographySmall className="truncate font-medium">{p.nombre}</TypographySmall>
                    {!p.temporal && tiendaCat?.verificada && (
                      <ActionTooltip label="Coordenada GPS verificada">
                        <CheckCircle
                          weight="fill"
                          className="h-3.5 w-3.5 text-emerald-500 shrink-0"
                        />
                      </ActionTooltip>
                    )}
                    {p.temporal && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        desvío
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    {zona && <TypographyMuted className="text-[11px]">{zona.nombre}</TypographyMuted>}
                    {tramo ? (
                      <TypographyMono className="text-[11px] text-muted-foreground tabular-nums">
                        +{tramo.km} km · {duracion(tramo.segundos)}
                        {tramo.fuente === 'estimado' ? ' (est.)' : ''}
                      </TypographyMono>
                    ) : calculando && idxTramo >= 0 ? (
                      <TypographyMuted className="text-[11px] animate-pulse">
                        calculando…
                      </TypographyMuted>
                    ) : null}
                  </div>
                </div>

                {/* Acciones discretas por parada */}
                <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                  {!p.temporal && tiendaCat && !tiendaCat.verificada && (
                    <ActionTooltip label="Pendiente de verificar: Ajustar ubicación en mapa">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        className="h-6 px-1.5 text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                        onClick={() => onJumpToAudit(p.nombre)}
                      >
                        <Crosshair weight="duotone" className="h-3 w-3" />
                        Verificar GPS
                      </Button>
                    </ActionTooltip>
                  )}
                  <ActionTooltip label="Subir">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      disabled={k === 0}
                      onClick={() =>
                        onMutateRuta((r) => {
                          const arr = [...r.paradas];
                          [arr[k - 1], arr[k]] = [arr[k], arr[k - 1]];
                          return { ...r, paradas: arr };
                        })
                      }
                    >
                      <CaretUp weight="bold" />
                    </Button>
                  </ActionTooltip>
                  <ActionTooltip label="Bajar">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      disabled={k === ruta.paradas.length - 1}
                      onClick={() =>
                        onMutateRuta((r) => {
                          const arr = [...r.paradas];
                          [arr[k + 1], arr[k]] = [arr[k], arr[k + 1]];
                          return { ...r, paradas: arr };
                        })
                      }
                    >
                      <CaretDown weight="bold" />
                    </Button>
                  </ActionTooltip>
                  <ActionTooltip label="Quitar">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        onMutateRuta((r) => ({
                          ...r,
                          paradas: r.paradas.filter((_, idx) => idx !== k),
                        }))
                      }
                    >
                      <Trash />
                    </Button>
                  </ActionTooltip>
                </div>
              </Card>
            );
          })
        )}

        {/* Regreso a Base */}
        {baseTienda && (
          <Card className={cn('px-3 py-2 transition-opacity', !ruta.baseFin && 'opacity-50')}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                  <FlagCheckered weight="duotone" className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <TypographyH4 className="truncate text-xs font-semibold">
                    {baseTienda.nombre}
                  </TypographyH4>
                  <TypographyMuted className="text-[10px]">
                    Regreso
                    {ruta.baseFin && ruta.paradas.length > 0 && tramos.at(-1)
                      ? ` · +${tramos.at(-1).km} km (${duracion(tramos.at(-1).segundos)})`
                      : ''}
                  </TypographyMuted>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="switch-base-fin"
                  className="text-[11px] font-normal text-muted-foreground cursor-pointer"
                >
                  Incluir regreso
                </Label>
                <Switch
                  id="switch-base-fin"
                  checked={ruta.baseFin}
                  onCheckedChange={(v) => onMutateRuta((r) => ({ ...r, baseFin: v }))}
                />
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* ================= RESUMEN DE MÉTRICAS ================= */}
      <div className="grid grid-cols-4 gap-1.5">
        <Card className="p-2.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] font-medium uppercase tracking-wider">Distancia</span>
            <Path weight="duotone" className="h-3.5 w-3.5" />
          </div>
          <TypographyLarge className={cn('mt-1 text-sm', calculando && 'opacity-50')}>
            {totales.km} <span className="text-[11px] font-normal text-muted-foreground">km</span>
          </TypographyLarge>
        </Card>
        <Card className="p-2.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] font-medium uppercase tracking-wider">Combustible</span>
            <GasPump weight="duotone" className="h-3.5 w-3.5" />
          </div>
          <TypographyLarge className={cn('mt-1 text-sm', calculando && 'opacity-50')}>
            {pesos(totales.costo).replace('.00', '')}
          </TypographyLarge>
        </Card>
        <Card className="p-2.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] font-medium uppercase tracking-wider">Tiempo</span>
            <Timer weight="duotone" className="h-3.5 w-3.5" />
          </div>
          <TypographyLarge className={cn('mt-1 text-sm', calculando && 'opacity-50')}>
            {totales.seg ? duracion(totales.seg) : '0 min'}
          </TypographyLarge>
        </Card>
        <Card className="p-2.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] font-medium uppercase tracking-wider">Litros</span>
            <Drop weight="duotone" className="h-3.5 w-3.5" />
          </div>
          <TypographyLarge className="mt-1 text-sm">
            {totales.litros.toFixed(1)}{' '}
            <span className="text-[11px] font-normal text-muted-foreground">L</span>
          </TypographyLarge>
        </Card>
      </div>

      {/* ================= BLOQUE 1: ACCIONES DE GUARDADO DEL DÍA ================= */}
      <div className="rounded-xl border border-border/80 bg-card p-3 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'h-2.5 w-2.5 rounded-full shrink-0',
                estaGuardado
                  ? 'bg-emerald-500'
                  : ruta.paradas.length > 0
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-muted-foreground/50'
              )}
            />
            <span className="font-semibold text-foreground">
              {nombreDiaActual} {diaMesActual}
            </span>
            <Badge
              variant={estaGuardado ? 'secondary' : 'outline'}
              className={cn(
                'text-[10px] px-1.5 py-0',
                estaGuardado &&
                  'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
              )}
            >
              {estaGuardado
                ? `✓ Guardado (${modoOperativo === 'anticipo' ? 'Anticipo' : 'Comprobación'})`
                : ruta.paradas.length > 0
                ? 'Sin guardar'
                : 'Ruta vacía'}
            </Badge>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            {totales.km} km · {pesos(totales.costo).replace('.00', '')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={estaGuardado ? 'outline' : 'default'}
            size="sm"
            disabled={ruta.paradas.length === 0}
            onClick={() => onSaveDay?.(modoOperativo)}
            className="font-medium text-xs h-9"
          >
            <FloppyDiskBack weight="duotone" className="h-4 w-4" />
            <span>{estaGuardado ? 'Actualizar día' : `Guardar ${nombreDiaActual}`}</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            disabled={ruta.paradas.length === 0}
            onClick={() => onSaveAndNext?.(modoOperativo)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs h-9"
          >
            <span className="truncate">Guardar y pasar a {siguienteDiaInfo.nombre}</span>
            <ArrowRight weight="bold" className="h-3.5 w-3.5 ml-1 shrink-0" />
          </Button>
        </div>
      </div>

      {/* ================= BLOQUE 2: CIERRE SEMANAL Y GENERACIÓN DE BITÁCORA ================= */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <FileXls weight="duotone" className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold text-foreground">
                Bitácora Semana {semanaInfo.semana} ({semanaInfo.anio})
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {diasListosSemana.length} de {diasSemana.slice(0, 6).length} días listos ·{' '}
              <span className="font-semibold text-foreground font-mono">{kmAcumuladoSemana} km</span> acumulados
            </p>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] uppercase border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
          >
            {modoOperativo === 'anticipo' ? 'Anticipo' : 'Comprobación'}
          </Badge>
        </div>

        <Button
          size="default"
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs text-xs h-9"
          onClick={() => onOpenBitacora?.(modoOperativo)}
        >
          <FileXls weight="bold" className="h-4 w-4" />
          <span>Generar Bitácora Oficial Neto (.xlsx)</span>
        </Button>
      </div>

      {/* ================= BLOQUE 3: HERRAMIENTAS DE RUTA Y PORTAPAPELES ================= */}
      <div className="grid grid-cols-2 gap-1.5">
        <ActionTooltip label="Copiar tramos para pegar directo en celdas de Excel o Sheets">
          <Button
            variant="outline"
            size="sm"
            disabled={filasExcel.length === 0}
            onClick={onCopyExcel}
            className="text-xs h-8"
          >
            <CopySimple weight="duotone" className="h-3.5 w-3.5" />
            <span>Copiar tramos Excel</span>
          </Button>
        </ActionTooltip>

        <ActionTooltip label="Reordenar paradas con algoritmo 2-Opt para menor kilometraje" shortcut="Alt+O">
          <Button
            variant="outline"
            size="sm"
            disabled={ruta.paradas.length < 3}
            onClick={onOptimize}
            className="text-xs h-8"
          >
            <CompassTool weight="duotone" className="h-3.5 w-3.5" />
            <span>Optimizar orden</span>
          </Button>
        </ActionTooltip>

        <ActionTooltip label="Copiar resumen estructurado con link a Google Maps">
          <Button
            variant="ghost"
            size="sm"
            disabled={filasExcel.length === 0}
            onClick={onCopyWhatsApp}
            className="text-xs h-8 text-muted-foreground hover:text-foreground"
          >
            <ShareNetwork weight="duotone" className="h-3.5 w-3.5" />
            <span>Copiar WhatsApp</span>
          </Button>
        </ActionTooltip>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowTablePreview((v) => !v)}
          className="text-xs h-8 text-muted-foreground hover:text-foreground"
        >
          <TableIcon weight="duotone" className="h-3.5 w-3.5" />
          <span>{showTablePreview ? 'Ocultar tabla' : 'Vista previa Excel'}</span>
        </Button>
      </div>

      {/* ================= VISTA PREVIA DE TABLA EXCEL ================= */}
      {showTablePreview && filasExcel.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border bg-muted/40 px-3 py-2">
            <CardTitle className="text-[11px] font-medium text-muted-foreground">
              Columnas para Excel
            </CardTitle>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {filasExcel.length} filas
            </span>
          </CardHeader>
          <div className="max-h-48 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Origen</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead className="text-right">KM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filasExcel.map((f, idx) => {
                  const cols = f.length === 4 ? f.slice(1) : f;
                  return (
                    <TableRow key={idx}>
                      <TableCell className="font-medium truncate max-w-35">
                        {cols[0]}
                      </TableCell>
                      <TableCell className="truncate max-w-35">{cols[1]}</TableCell>
                      <TableCell className="text-right font-mono font-semibold tabular-nums">
                        {cols[2]}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ================= MODAL DE PEGADO POR LOTE ================= */}
      <Dialog open={batchModalOpen} onOpenChange={setBatchModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar tiendas por lote</DialogTitle>
            <DialogDescription>
              Pega varias líneas desde Excel o texto (o sepáralas por comas).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="batch-textarea">Lista de tiendas</Label>
            <Textarea
              id="batch-textarea"
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              rows={5}
              placeholder={'Ejemplo:\ncoita centro\njiquipilas\nbarrio candelaria'}
              className="font-mono"
            />
          </div>
          {batchPreview.length > 0 && (
            <Card className="max-h-44 overflow-auto bg-muted/30 p-2 space-y-1">
              {batchPreview.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md bg-card border border-border/60"
                >
                  <TypographyMuted className="truncate max-w-[45%]">
                    "{item.linea}"
                  </TypographyMuted>
                  {item.tienda ? (
                    <Badge variant="secondary">{item.tienda.nombre}</Badge>
                  ) : (
                    <Badge variant="destructive">Sin coincidencia</Badge>
                  )}
                </div>
              ))}
            </Card>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBatchModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={batchPreview.filter((x) => x.tienda).length === 0}
              onClick={() => {
                const validas = batchPreview.filter((x) => x.tienda).map((x) => x.tienda);
                onAddBatchStores(validas);
                setBatchText('');
                setBatchModalOpen(false);
              }}
            >
              Agregar {batchPreview.filter((x) => x.tienda).length} tiendas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
