/**
 * @fileoverview Módulo Constructor de Rutas y Control Semanal (`RouteBuilderTab.jsx`).
 *
 * Diseño de 3 zonas sin doble scroll (Single-Viewport Flex Layout):
 * 1. ZONA SUPERIOR FIJA (`shrink-0`):
 *    - Selector de modo (1. Comprobación | 2. Anticipo) + selector de fecha compacto integrado.
 *    - Tira interactiva de días de la semana.
 *    - Buscador predictivo + barra compacta de herramientas (Salida/Regreso base, Optimizar, Invertir, Copiar, Limpiar).
 * 2. ZONA CENTRAL CON SCROLL ÚNICO (`flex-1 min-h-0 overflow-y-auto`):
 *    - Lista de sucursales del recorrido con soporte Drag & Drop. Es el único elemento que hace scroll.
 * 3. DOCK INFERIOR FIJO (`shrink-0`):
 *    - Cinta unificada de 4 métricas (Distancia, Combustible, Tiempo, Litros).
 *    - Acciones primarias de guardado diario y generación de Bitácora Oficial Neto (.xlsx).
 */

import { useState, useEffect, useMemo } from 'react';
import {
  MagnifyingGlass,
  CopySimple,
  FloppyDiskBack,
  ArrowUUpLeft,
  ArrowsDownUp,
  Trash,
  DotsSixVertical,
  Path,
  GasPump,
  Receipt,
  ClipboardText,
  ShareNetwork,
  CaretUp,
  CaretDown,
  Crosshair,
  Warehouse,
  FlagCheckered,
  CompassTool,
  MapPinLine,
  FileXls,
  CheckCircle,
  ArrowRight,
  Lightning,
  Ticket,
  Coins,
} from '@phosphor-icons/react';
import { PeajesDialog } from './PeajesDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Kbd } from '@/components/ui/kbd';
import { Card } from '@/components/ui/card';
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
  TypographySmall,
  TypographyMuted,
  TypographyMono,
} from '@/components/ui/typography';
import {
  cn,
  norm,
  expandirConsulta,
  pareceUbicacion,
  haversineM,
  clasificarZona,
  pesos,
  duracion,
  obtenerCicloOperativoNeto,
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
  peajesInfo = { detectadas: [], activas: [], personalizadas: [], omitidas: [], total: 0 },
  onToggleCasetaOmitida,
  onAddCasetaPersonalizada,
  onRemoveCasetaPersonalizada,
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
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [dragIdx, setDragIdx] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [peajesModalOpen, setPeajesModalOpen] = useState(false);

  const [varianteAnticipo, setVarianteAnticipo] = useState(() => {
    try {
      return localStorage.getItem('neto_variante_anticipo') || 'ciclo_neto';
    } catch {
      return 'ciclo_neto';
    }
  });

  const [incluirLunesOlvido, setIncluirLunesOlvido] = useState(() => {
    try {
      return localStorage.getItem('neto_incluir_lunes_olvido') === 'true';
    } catch {
      return false;
    }
  });

  const [fechaSemanaBase, setFechaSemanaBase] = useState(
    () => ruta.fecha || new Date().toISOString().slice(0, 10)
  );

  const cicloInfo = useMemo(() => {
    return obtenerCicloOperativoNeto(fechaSemanaBase, {
      modo: modoOperativo,
      variante: varianteAnticipo,
      incluirLunesOlvido,
    });
  }, [fechaSemanaBase, modoOperativo, varianteAnticipo, incluirLunesOlvido]);

  useEffect(() => {
    if (!ruta.fecha) return;
    const dentroDeCiclo =
      cicloInfo.dias.some((d) => d.fecha === ruta.fecha) ||
      ruta.fecha === cicloInfo.fechaLunesActual ||
      ruta.fecha === cicloInfo.fechaProximoLunes;
    if (!dentroDeCiclo) {
      setFechaSemanaBase(ruta.fecha);
    }
  }, [ruta.fecha, cicloInfo]);

  const semanaInfo = useMemo(() => calcularSemanaISO(fechaSemanaBase), [fechaSemanaBase]);
  const diasSemana = cicloInfo.dias;

  const handleCambiarVarianteAnticipo = (nueva) => {
    setVarianteAnticipo(nueva);
    try {
      localStorage.setItem('neto_variante_anticipo', nueva);
    } catch {}
  };

  const handleToggleLunesOlvido = () => {
    setIncluirLunesOlvido((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('neto_incluir_lunes_olvido', String(next));
      } catch {}
      return next;
    });
  };

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

  const nombreDiaCorto = useMemo(() => {
    const d = new Date(ruta.fecha + 'T12:00:00');
    const nombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const esProx = ruta.fecha === cicloInfo.fechaProximoLunes;
    if (esProx) return 'Lun+1';
    return nombres[d.getDay()] || 'Día';
  }, [ruta.fecha, cicloInfo.fechaProximoLunes]);

  const diaMesActual = useMemo(() => {
    if (!ruta.fecha) return '';
    const parts = ruta.fecha.split('-');
    return parts[2] || '';
  }, [ruta.fecha]);

  const siguienteDiaInfo = useMemo(() => {
    if (modoOperativo === 'anticipo' && varianteAnticipo === 'ciclo_neto') {
      const idx = cicloInfo.dias.findIndex((d) => d.fecha === ruta.fecha);
      if (idx >= 0 && idx < cicloInfo.dias.length - 1) {
        const sig = cicloInfo.dias[idx + 1];
        return {
          iso: sig.fecha,
          label: `${sig.diaNombre} ${sig.diaMes}`,
          nombre: sig.esProximoLunes ? 'Lun+1' : sig.diaNombre,
          esUltimo: false,
        };
      } else if (idx === cicloInfo.dias.length - 1) {
        return {
          iso: null,
          label: 'Anticipo completo',
          nombre: 'Bitácora',
          esUltimo: true,
        };
      }
    }

    const d = new Date(ruta.fecha + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    const nombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const diaNum = String(d.getDate()).padStart(2, '0');
    return {
      iso: `${y}-${m}-${diaNum}`,
      label: `${nombres[d.getDay()]} ${diaNum}`,
      nombre: nombres[d.getDay()],
      esUltimo: false,
    };
  }, [ruta.fecha, modoOperativo, varianteAnticipo, cicloInfo]);

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
    return cicloInfo.dias.filter(
      (d) => mapaDiasHistorial[d.fecha] || (ruta.fecha === d.fecha && ruta.paradas.length > 0)
    );
  }, [cicloInfo.dias, mapaDiasHistorial, ruta.fecha, ruta.paradas.length]);

  const kmAcumuladoSemana = useMemo(() => {
    let sum = 0;
    cicloInfo.dias.forEach((d) => {
      if (ruta.fecha === d.fecha) {
        sum += totales.km;
      } else if (mapaDiasHistorial[d.fecha]) {
        sum += Number(mapaDiasHistorial[d.fecha].totalKm) || 0;
      }
    });
    return Math.round(sum);
  }, [cicloInfo.dias, ruta.fecha, totales.km, mapaDiasHistorial]);

  const peajesAcumuladoSemana = useMemo(() => {
    let sum = 0;
    cicloInfo.dias.forEach((d) => {
      if (ruta.fecha === d.fecha) {
        sum += totales.peajes || 0;
      } else if (mapaDiasHistorial[d.fecha]) {
        sum += Number(mapaDiasHistorial[d.fecha].peajes) || 0;
      }
    });
    return Math.round(sum);
  }, [cicloInfo.dias, ruta.fecha, totales.peajes, mapaDiasHistorial]);

  const anticipoDisponibleParaImportar = useMemo(() => {
    if (modoOperativo !== 'comprobacion') return null;
    const ant = mapaAnticipos[ruta.fecha];
    if (ant && (ant.paradas || []).length > 0 && ruta.paradas.length === 0) {
      return ant;
    }
    return null;
  }, [modoOperativo, mapaAnticipos, ruta.fecha, ruta.paradas.length]);

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
    <div className="flex h-full min-h-0 flex-col justify-between gap-2.5 min-w-0">
      {/* ================= 1. ZONA SUPERIOR FIJA: SEMANA + BUSCADOR + HERRAMIENTAS ================= */}
      <div className="shrink-0 space-y-2 min-w-0">
        {/* Tarjeta compacta de Control Semanal */}
        <Card className="p-2.5 space-y-2 min-w-0">
          {/* Fila 1: Selector Comprobación / Anticipo + Calendario integrado */}
          <div className="flex items-center justify-between gap-1.5 min-w-0">
            <div className="grid grid-cols-2 flex-1 p-0.5 rounded-lg bg-muted border border-border/60 min-w-0">
              <button
                type="button"
                onClick={() => onSetModoOperativo?.('comprobacion')}
                className={cn(
                  'flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-xs transition-all cursor-pointer min-w-0',
                  modoOperativo === 'comprobacion'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <GasPump weight="duotone" className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">1. Comprobación</span>
              </button>
              <button
                type="button"
                onClick={() => onSetModoOperativo?.('anticipo')}
                className={cn(
                  'flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-xs transition-all cursor-pointer min-w-0',
                  modoOperativo === 'anticipo'
                    ? 'bg-amber-600 text-white font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Receipt weight="duotone" className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">2. Anticipo</span>
              </button>
            </div>

            <DatePicker
              value={ruta.fecha}
              onChange={(fecha) => onMutateRuta((r) => ({ ...r, fecha }))}
            />
          </div>

          {/* Opciones de periodo exclusivas de Anticipo */}
          {modoOperativo === 'anticipo' && (
            <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-border/50 text-[11px]">
              <div className="inline-flex items-center bg-muted p-0.5 rounded-md border border-border/60">
                <button
                  type="button"
                  onClick={() => handleCambiarVarianteAnticipo('ciclo_neto')}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer',
                    varianteAnticipo === 'ciclo_neto'
                      ? 'bg-card text-foreground font-semibold shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Mar–Lun
                </button>
                <button
                  type="button"
                  onClick={() => handleCambiarVarianteAnticipo('semana_natural')}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer',
                    varianteAnticipo === 'semana_natural'
                      ? 'bg-card text-foreground font-semibold shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Lun–Sáb
                </button>
              </div>

              {varianteAnticipo === 'ciclo_neto' && (
                <button
                  type="button"
                  onClick={handleToggleLunesOlvido}
                  className={cn(
                    'px-2 py-0.5 rounded-md text-[10px] border transition-all cursor-pointer shrink-0',
                    incluirLunesOlvido
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold'
                      : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {incluirLunesOlvido ? '✓ Lunes actual' : '+ Lunes actual'}
                </button>
              )}
            </div>
          )}

          {/* Tira interactiva de días */}
          <div
            className={cn(
              'grid gap-1',
              diasSemana.length === 7 ? 'grid-cols-7' : 'grid-cols-6'
            )}
          >
            {diasSemana.map((d) => {
              const esActivo = ruta.fecha === d.fecha;
              const guardado = mapaDiasHistorial[d.fecha];
              return (
                <button
                  key={d.fecha}
                  type="button"
                  onClick={() => onSelectDay?.(d.fecha, guardado || null)}
                  className={cn(
                    'flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg border text-center transition-all cursor-pointer min-w-0',
                    esActivo
                      ? 'border-primary bg-primary/15 text-primary font-bold ring-1 ring-primary/40'
                      : guardado
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20'
                      : d.esProximoLunes
                      ? 'border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20'
                      : 'border-border bg-muted/35 text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                  title={`${d.diaNombre} ${d.diaMes} · ${guardado ? `${guardado.totalKm} km guardados` : 'Sin guardar'}`}
                >
                  <span className="text-[9px] uppercase font-bold tracking-tight truncate max-w-full leading-none">
                    {d.esProximoLunes ? 'LUN+1' : d.diaNombre}
                  </span>
                  <span className="text-xs font-semibold tabular-nums leading-none mt-1">
                    {d.diaMes}
                  </span>
                  <span className="text-[8px] mt-0.5 leading-none font-mono truncate max-w-full">
                    {guardado ? `${Math.round(guardado.totalKm)}k` : esActivo ? '•' : '—'}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Banner de importación rápida de Anticipo -> Comprobación */}
        {anticipoDisponibleParaImportar && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Lightning weight="fill" className="h-4 w-4 shrink-0 text-amber-500" />
              <span className="truncate font-medium">
                Anticipo disponible ({anticipoDisponibleParaImportar.paradas.length} tiendas · {anticipoDisponibleParaImportar.totalKm} km)
              </span>
            </div>
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="border-amber-500/40 bg-card hover:bg-amber-500/20 text-[11px] h-6 px-2 shrink-0"
              onClick={() => onCopyAnticipo?.(ruta.fecha)}
            >
              Cargar
            </Button>
          </div>
        )}

        {/* Buscador Predictivo */}
        <div className="relative min-w-0">
          <div className="relative flex items-center min-w-0">
            <MagnifyingGlass
              weight="bold"
              className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground"
            />
            <Input
              ref={searchInputRef}
              size="default"
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
              placeholder="Buscar sucursal, ECO o pegar coordenadas…"
              className="pl-9 pr-20 rounded-xl bg-card"
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

          {/* Dropdown de resultados */}
          {dropdownOpen && query.trim() && (
            <Card className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-72 overflow-auto border-border bg-popover p-1 shadow-xl">
              {resultados.length === 0 ? (
                <div className="px-3 py-3 text-center">
                  <TypographyMuted>
                    Sin coincidencias para <strong className="text-foreground">"{query}"</strong>.
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
                      'flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-xs cursor-pointer transition-colors',
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
                          {r.t.nombre.includes('CEDIS') && (
                            <Badge className="bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30 text-[9px] px-1 py-0 font-bold shrink-0">
                              CEDIS
                            </Badge>
                          )}
                          {(r.t.nombre.includes('CROSS') || r.t.nombre.includes('DOCK')) && (
                            <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30 text-[9px] px-1 py-0 font-bold shrink-0">
                              CROSS DOCK
                            </Badge>
                          )}
                          {r.t.nombre.includes('RESGUARDO') && (
                            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[9px] px-1 py-0 font-bold shrink-0">
                              BASE
                            </Badge>
                          )}
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
                          <span className="text-[11px] text-muted-foreground hidden sm:inline">
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

        {/* Barra compacta de Base (Salida/Regreso) + Herramientas de Ruta */}
        <div className="flex items-center justify-between gap-1.5 px-0.5 min-w-0">
          {baseTienda ? (
            <div className="flex items-center gap-1 min-w-0">
              <ActionTooltip label={`Incluir salida desde ${baseTienda.nombre}`}>
                <button
                  type="button"
                  onClick={() => onMutateRuta((r) => ({ ...r, baseInicio: !r.baseInicio }))}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer',
                    ruta.baseInicio
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border bg-card/60 text-muted-foreground line-through opacity-70'
                  )}
                >
                  <Warehouse weight="duotone" className="h-3.5 w-3.5 shrink-0" />
                  <span>Salida</span>
                </button>
              </ActionTooltip>

              <ActionTooltip label={`Incluir regreso a ${baseTienda.nombre}`}>
                <button
                  type="button"
                  onClick={() => onMutateRuta((r) => ({ ...r, baseFin: !r.baseFin }))}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer',
                    ruta.baseFin
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border bg-card/60 text-muted-foreground line-through opacity-70'
                  )}
                >
                  <FlagCheckered weight="duotone" className="h-3.5 w-3.5 shrink-0" />
                  <span>Regreso</span>
                </button>
              </ActionTooltip>
            </div>
          ) : (
            <div />
          )}

          {/* Herramientas rápidas de ruta */}
          <div className="flex items-center gap-0.5 shrink-0">
            <ActionTooltip label="Optimizar orden (menor kilometraje)" shortcut="Alt+O">
              <Button
                variant="outline"
                size="icon-xs"
                disabled={ruta.paradas.length < 3}
                onClick={onOptimize}
                className="bg-card"
              >
                <CompassTool weight="duotone" />
              </Button>
            </ActionTooltip>
            <ActionTooltip label="Invertir orden de paradas">
              <Button
                variant="outline"
                size="icon-xs"
                disabled={ruta.paradas.length < 2}
                onClick={() =>
                  onMutateRuta((r) => ({
                    ...r,
                    paradas: [...r.paradas].reverse(),
                  }))
                }
                className="bg-card"
              >
                <ArrowsDownUp weight="bold" />
              </Button>
            </ActionTooltip>
            <ActionTooltip label="Deshacer último cambio" shortcut="Ctrl+Z">
              <Button
                variant="outline"
                size="icon-xs"
                disabled={!canUndo}
                onClick={onUndo}
                className="bg-card"
              >
                <ArrowUUpLeft weight="bold" />
              </Button>
            </ActionTooltip>
            <ActionTooltip label="Copiar tramos para pegar en celdas de Excel">
              <Button
                variant="outline"
                size="icon-xs"
                disabled={filasExcel.length === 0}
                onClick={onCopyExcel}
                className="bg-card"
              >
                <CopySimple weight="duotone" />
              </Button>
            </ActionTooltip>
            <ActionTooltip label="Copiar resumen con enlace a Google Maps">
              <Button
                variant="outline"
                size="icon-xs"
                disabled={filasExcel.length === 0}
                onClick={onCopyWhatsApp}
                className="bg-card"
              >
                <ShareNetwork weight="duotone" />
              </Button>
            </ActionTooltip>
            {ruta.paradas.length > 0 && (
              <ActionTooltip label="Limpiar paradas del día">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={onNewRoute}
                  className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-destructive"
                >
                  Limpiar
                </Button>
              </ActionTooltip>
            )}
          </div>
        </div>
      </div>

      {/* ================= 2. ZONA CENTRAL: LISTA DE PARADAS (SCROLL ÚNICO) ================= */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-1.5 pr-0.5 min-w-0">
        {ruta.paradas.length === 0 ? (
          <Card className="h-full min-h-36 flex flex-col items-center justify-center border-dashed bg-card/40 px-4 py-6 text-center">
            <Path weight="duotone" className="mb-1.5 h-7 w-7 text-muted-foreground/50" />
            <TypographySmall className="text-muted-foreground font-medium">
              Sin sucursales en {nombreDiaCorto} {diaMesActual}
            </TypographySmall>
            <TypographyMuted className="mt-0.5 text-[11px] max-w-60">
              Busca por nombre o ECO arriba, o toca cualquier sucursal en el mapa.
            </TypographyMuted>
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
                  'group relative flex items-center gap-2 px-2.5 py-2 transition-all min-w-0',
                  dragIdx === k && 'opacity-40',
                  dropTarget === k
                    ? 'border-primary ring-1 ring-primary/30'
                    : 'hover:border-primary/40'
                )}
              >
                <DotsSixVertical
                  weight="bold"
                  className="hidden sm:block h-4 w-4 shrink-0 cursor-grab text-muted-foreground/45 group-hover:text-muted-foreground"
                />
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
                    p.temporal
                      ? 'bg-secondary text-secondary-foreground'
                      : 'bg-primary text-primary-foreground'
                  )}
                >
                  {k + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <TypographySmall className="truncate font-semibold text-xs">
                      {p.nombre}
                    </TypographySmall>
                    {!p.temporal && tiendaCat?.verificada && (
                      <ActionTooltip label="Coordenada GPS verificada">
                        <CheckCircle
                          weight="fill"
                          className="h-3.5 w-3.5 text-emerald-500 shrink-0"
                        />
                      </ActionTooltip>
                    )}
                    {p.temporal && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                        desvío
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
                    {zona && <span className="truncate max-w-28">{zona.nombre}</span>}
                    {zona && (tramo || (calculando && idxTramo >= 0)) && <span>·</span>}
                    {tramo ? (
                      <TypographyMono className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                        +{tramo.km} km ({duracion(tramo.segundos)})
                      </TypographyMono>
                    ) : calculando && idxTramo >= 0 ? (
                      <span className="text-[11px] animate-pulse shrink-0">calculando…</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0 opacity-100 lg:opacity-75 lg:group-hover:opacity-100 transition-opacity">
                  {!p.temporal && tiendaCat && !tiendaCat.verificada && (
                    <ActionTooltip label="Verificar coordenada GPS en Catálogo">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        className="h-6 px-1.5 text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                        onClick={() => onJumpToAudit(p.nombre)}
                      >
                        <Crosshair weight="duotone" className="h-3 w-3" />
                        <span>GPS</span>
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
      </div>

      {/* Aviso interactivo si hay casetas en la ruta */}
      {peajesInfo?.detectadas?.length > 0 && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setPeajesModalOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setPeajesModalOpen(true);
          }}
          className="shrink-0 flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-200 cursor-pointer transition-colors shadow-xs"
        >
          <div className="flex items-center gap-1.5 truncate">
            <Ticket weight="fill" className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="truncate font-medium">
              {peajesInfo.activas.length} caseta(s) en ruta ({pesos(totales.peajes).replace('.00', '')})
            </span>
          </div>
          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 underline underline-offset-2 shrink-0 ml-2">
            Ver / Alternar libre
          </span>
        </div>
      )}

      {/* ================= 3. DOCK INFERIOR FIJO: MÉTRICAS + GUARDADO + BITÁCORA ================= */}
      <Card className="shrink-0 p-2.5 space-y-2 min-w-0">
        {/* Cinta unificada de 5 métricas */}
        <div className="grid grid-cols-5 divide-x divide-border rounded-lg border border-border/70 bg-muted/40 py-1.5 text-center">
          <div className="px-0.5">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block truncate">
              Distancia
            </span>
            <span className={cn('text-xs font-bold tabular-nums block truncate', calculando && 'opacity-50')}>
              {totales.km} km
            </span>
          </div>
          <div className="px-0.5">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block truncate">
              Gasolina
            </span>
            <span className={cn('text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400 block truncate', calculando && 'opacity-50')}>
              {pesos(totales.costo).replace('.00', '')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPeajesModalOpen(true)}
            className="px-0.5 hover:bg-amber-500/10 active:bg-amber-500/20 transition-colors rounded cursor-pointer group flex flex-col items-center justify-center focus:outline-hidden"
            title="Ver y configurar casetas y peajes"
          >
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 block truncate transition-colors">
              Peajes
            </span>
            <span
              className={cn(
                'text-xs font-bold tabular-nums block truncate transition-colors',
                totales.peajes > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-muted-foreground'
              )}
            >
              {pesos(totales.peajes || 0).replace('.00', '')}
            </span>
          </button>
          <div className="px-0.5">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block truncate">
              Tiempo
            </span>
            <span className={cn('text-xs font-bold tabular-nums block truncate', calculando && 'opacity-50')}>
              {totales.seg ? duracion(totales.seg) : '0m'}
            </span>
          </div>
          <div className="px-0.5">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground block truncate">
              Litros
            </span>
            <span className="text-xs font-bold tabular-nums block truncate">
              {totales.litros.toFixed(1)} L
            </span>
          </div>
        </div>

        {/* Botones de guardado del día */}
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant={estaGuardado ? 'outline' : 'secondary'}
            size="sm"
            disabled={ruta.paradas.length === 0}
            onClick={() => onSaveDay?.(modoOperativo)}
            className="text-xs h-8 font-medium"
          >
            <FloppyDiskBack weight="duotone" className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {estaGuardado
                ? `✓ ${nombreDiaCorto} ${diaMesActual} guardado`
                : `Guardar ${nombreDiaCorto} ${diaMesActual}`}
            </span>
          </Button>

          <Button
            variant="default"
            size="sm"
            disabled={ruta.paradas.length === 0}
            onClick={() => onSaveAndNext?.(modoOperativo)}
            className="text-xs h-8 font-semibold"
          >
            <span className="truncate">Guardar y pasar a {siguienteDiaInfo.nombre}</span>
            <ArrowRight weight="bold" className="h-3.5 w-3.5 shrink-0" />
          </Button>
        </div>

        {/* Botón compacto de Bitácora Semanal */}
        <Button
          size="sm"
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8.5 justify-between px-3"
          onClick={() => onOpenBitacora?.(modoOperativo)}
        >
          <span className="flex items-center gap-1.5 truncate">
            <FileXls weight="bold" className="h-4 w-4 shrink-0" />
            <span className="truncate">Bitácora Sem. {semanaInfo.semana} (.xlsx)</span>
          </span>
          <span className="font-mono text-[11px] bg-black/20 px-1.5 py-0.5 rounded shrink-0">
            {diasListosSemana.length}/{cicloInfo.dias.length} días · {kmAcumuladoSemana} km
            {peajesAcumuladoSemana > 0 && ` · ${pesos(peajesAcumuladoSemana).replace('.00', '')} peajes`}
          </span>
        </Button>
      </Card>

      {/* Modal de Casetas y Peajes */}
      <PeajesDialog
        open={peajesModalOpen}
        onOpenChange={setPeajesModalOpen}
        casetasDetectadas={peajesInfo?.detectadas || []}
        casetasOmitidas={peajesInfo?.omitidas || []}
        casetasPersonalizadas={peajesInfo?.personalizadas || []}
        onToggleCasetaOmitida={onToggleCasetaOmitida}
        onAddCasetaPersonalizada={onAddCasetaPersonalizada}
        onRemoveCasetaPersonalizada={onRemoveCasetaPersonalizada}
        totalPeajes={totales.peajes}
      />

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
