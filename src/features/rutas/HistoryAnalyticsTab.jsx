/**
 * @fileoverview Módulo de Historial y Estadísticas de Rutas (`HistoryAnalyticsTab.jsx`).
 *
 * Funcionalidades principales:
 * - Tarjetas de resumen ejecutivo (Total de rutas guardadas, Kilómetros acumulados,
 *   Inversión total estimada y Top de sucursales más visitadas).
 * - Buscador instantáneo por fecha, nombre de bitácora o sucursales incluidas.
 * - Acciones rápidas para re-abrir una ruta en el constructor (en modo edición o como
 *   plantilla duplicada para una nueva fecha) o eliminar registros obsoletos.
 */

import { useState, useMemo } from 'react';
import {
  CalendarCheck,
  ArrowClockwise,
  PencilSimpleLine,
  Trash,
  MagnifyingGlass,
  Path,
  GasPump,
  FolderOpen,
  FileXls,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ActionTooltip } from '@/components/ui/tooltip';
import {
  TypographyH4,
  TypographySmall,
  TypographyMuted,
  TypographyLarge,
} from '@/components/ui/typography';
import { norm, fechaLarga, pesos } from '@/lib/utils';

export function HistoryAnalyticsTab({
  historial,
  onLoadHistory,
  onDeleteHistory,
  onOpenBitacora,
}) {
  const [q, setQ] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos'); // 'todos' | 'anticipo' | 'comprobacion'

  const kpis = useMemo(() => {
    const totalRutas = historial.length;
    const totalKm = historial.reduce((s, h) => s + (h.totalKm || 0), 0);
    const totalCosto = historial.reduce((s, h) => s + (h.costo || 0), 0);
    const totalPeajes = historial.reduce((s, h) => s + (Number(h.peajes) || 0), 0);
    const conteo = new Map();
    historial.forEach((h) =>
      (h.paradas || []).forEach((p) => {
        if (!p.temporal) conteo.set(p.nombre, (conteo.get(p.nombre) || 0) + 1);
      })
    );
    const topTiendas = [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    return { totalRutas, totalKm, totalCosto, totalPeajes, topTiendas };
  }, [historial]);

  const filtrados = useMemo(() => {
    const nq = norm(q);
    return historial.filter((h) => {
      const tipoRuta = h.tipo || 'comprobacion';
      if (filtroTipo !== 'todos' && tipoRuta !== filtroTipo) return false;
      if (!nq) return true;
      return norm(
        `${h.fecha} ${fechaLarga(h.fecha)} ${h.nombre} ${(h.paradas || [])
          .map((p) => p.nombre)
          .join(' ')}`
      ).includes(nq);
    });
  }, [historial, q, filtroTipo]);

  return (
    <div className="flex flex-col gap-3">
      {/* ================= KPIS ACUMULADOS ================= */}
      <Button
        size="lg"
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
        onClick={onOpenBitacora}
      >
        <FileXls weight="duotone" className="h-4 w-4" />
        <span>Generar Bitácora Semanal Neto (.xlsx)</span>
      </Button>

      <div className="grid grid-cols-3 gap-1.5">
        <Card className="p-2.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] font-medium uppercase tracking-wider">Rutas</span>
            <CalendarCheck weight="duotone" className="h-3.5 w-3.5" />
          </div>
          <TypographyLarge className="mt-1 text-sm">{kpis.totalRutas}</TypographyLarge>
        </Card>
        <Card className="p-2.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] font-medium uppercase tracking-wider">Acumulado</span>
            <Path weight="duotone" className="h-3.5 w-3.5" />
          </div>
          <TypographyLarge className="mt-1 text-sm">{kpis.totalKm} km</TypographyLarge>
        </Card>
        <Card className="p-2.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[10px] font-medium uppercase tracking-wider">Combustible</span>
            <GasPump weight="duotone" className="h-3.5 w-3.5" />
          </div>
          <TypographyLarge className="mt-1 text-sm">
            {pesos(kpis.totalCosto).replace('.00', '')}
          </TypographyLarge>
        </Card>
      </div>

      {kpis.topTiendas.length > 0 && (
        <Card className="bg-muted/25 p-2.5">
          <TypographySmall className="text-[11px] text-muted-foreground block mb-1.5">
            Frecuentes
          </TypographySmall>
          <div className="flex flex-wrap gap-1">
            {kpis.topTiendas.map(([nombre, veces]) => (
              <Badge key={nombre} variant="secondary" className="font-normal">
                {nombre} · {veces}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* ================= BUSCADOR Y FILTROS ================= */}
      <div className="space-y-1.5">
        <div className="relative">
          <MagnifyingGlass
            weight="bold"
            className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
          />
          <Input
            size="sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrar por fecha, ruta o tienda…"
            className="pl-8"
          />
        </div>

        <div className="flex items-center gap-1">
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'comprobacion', label: 'Comprobación' },
            { id: 'anticipo', label: 'Anticipo' },
          ].map((f) => (
            <Button
              key={f.id}
              type="button"
              variant={filtroTipo === f.id ? 'default' : 'outline'}
              size="xs"
              onClick={() => setFiltroTipo(f.id)}
              className="text-[11px] h-6 px-2 font-medium"
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* ================= TARJETAS DE RUTAS GUARDADAS ================= */}
      {filtrados.length === 0 ? (
        <Card className="border-dashed bg-muted/15 px-4 py-8 text-center">
          <div className="flex flex-col items-center justify-center">
            <FolderOpen weight="duotone" className="mb-1.5 h-6 w-6 text-muted-foreground/60" />
            <TypographySmall className="text-muted-foreground">
              Sin rutas registradas
            </TypographySmall>
            <TypographyMuted className="mt-0.5 text-[11px]">
              Guarda una ruta desde la pestaña principal para consultarla o reutilizarla aquí.
            </TypographyMuted>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtrados.map((h) => (
            <Card
              key={h.id}
              className="transition-colors hover:border-foreground/25"
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <TypographyH4 className="capitalize truncate text-xs font-semibold">
                      {fechaLarga(h.fecha)}
                    </TypographyH4>
                    <Badge
                      variant="outline"
                      className={
                        h.tipo === 'anticipo'
                          ? 'text-[10px] text-amber-600 border-amber-500/40 bg-amber-500/10 px-1 py-0'
                          : 'text-[10px] text-blue-600 border-blue-500/40 bg-blue-500/10 px-1 py-0'
                      }
                    >
                      {h.tipo === 'anticipo' ? 'Anticipo' : 'Comprobación'}
                    </Badge>
                    {h.nombre && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 truncate max-w-28">
                        {h.nombre}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs font-mono text-muted-foreground tabular-nums shrink-0">
                    {h.totalKm} km · {pesos(h.costo || 0)}
                    {Number(h.peajes) > 0 && (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold ml-1">
                        + {pesos(h.peajes).replace('.00', '')} peajes
                      </span>
                    )}
                  </span>
                </div>
                <TypographyMuted className="mt-1.5 text-[11px] leading-relaxed">
                  {(h.paradas || []).map((p) => p.nombre).join(' → ')}
                </TypographyMuted>
                <div className="mt-2.5 flex items-center gap-1.5">
                  <Button size="xs" onClick={() => onLoadHistory(h, true)}>
                    <ArrowClockwise weight="bold" />
                    Usar hoy
                  </Button>
                  <Button variant="outline" size="xs" onClick={() => onLoadHistory(h, false)}>
                    <PencilSimpleLine weight="duotone" />
                    Editar
                  </Button>
                  <ActionTooltip label="Eliminar del historial">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="ml-auto text-muted-foreground hover:text-destructive"
                      onClick={() => onDeleteHistory(h)}
                    >
                      <Trash />
                    </Button>
                  </ActionTooltip>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
