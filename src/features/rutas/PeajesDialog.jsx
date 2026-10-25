/**
 * @fileoverview Modal Interactivo de Gestión y Desglose de Peajes y Casetas (`PeajesDialog.jsx`).
 *
 * Funcionalidades:
 * - Muestra las casetas automáticas detectadas en el recorrido con base en el catálogo oficial CAPUFE.
 * - Permite alternar cada caseta entre "Cuota" y "Vía Libre" (si el ingeniero tomó la carretera libre sin cobro).
 * - Permite añadir peajes o casetas personalizadas (puentes, desvíos, ferrys, etc.).
 * - Actualiza en tiempo real el costo total de peajes y se sincroniza con el dock y la bitácora semanal.
 */

import { useState } from 'react';
import {
  Coins,
  Ticket,
  Plus,
  Trash,
  CheckCircle,
  RoadHorizon,
  Info,
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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn, pesos } from '@/lib/utils';

export function PeajesDialog({
  open,
  onOpenChange,
  casetasDetectadas = [],
  casetasOmitidas = [],
  casetasPersonalizadas = [],
  onToggleCasetaOmitida,
  onAddCasetaPersonalizada,
  onRemoveCasetaPersonalizada,
  totalPeajes = 0,
}) {
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoCosto, setNuevoCosto] = useState('');

  const omitidasSet = new Set(casetasOmitidas || []);

  const handleAgregarPersonalizada = (e) => {
    e?.preventDefault();
    const costoNum = parseFloat(nuevoCosto);
    if (!nuevoNombre.trim() || isNaN(costoNum) || costoNum <= 0) return;

    onAddCasetaPersonalizada?.({
      id: `custom-${Date.now()}`,
      nombre: nuevoNombre.trim(),
      costo: Math.round(costoNum),
    });

    setNuevoNombre('');
    setNuevoCosto('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden border border-border shadow-2xl bg-card">
        <DialogHeader className="p-4 pb-3 border-b border-border/70 bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/20">
              <Ticket weight="duotone" className="h-4.5 w-4.5" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold text-foreground">
                Peajes y Casetas de la Ruta
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Tarifas oficiales CAPUFE del Sureste. Alterna libre/cuota o añade extras.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Casetas detectadas por catálogo */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <RoadHorizon weight="bold" className="h-3.5 w-3.5" />
                Casetas en el recorrido ({casetasDetectadas.length})
              </span>
              <span className="text-[10px] text-muted-foreground">
                Alterna si usaste vía libre
              </span>
            </div>

            {casetasDetectadas.length === 0 ? (
              <div className="p-3 text-center border border-dashed border-border/70 rounded-lg bg-muted/20 text-xs text-muted-foreground">
                No se detectaron autopistas de cuota en la secuencia de paradas actual.
              </div>
            ) : (
              <div className="space-y-2">
                {casetasDetectadas.map((c) => {
                  const estaOmitida = omitidasSet.has(c.tramoClave);
                  return (
                    <Card
                      key={c.tramoClave}
                      className={cn(
                        'p-2.5 transition-colors border',
                        estaOmitida
                          ? 'bg-muted/30 border-border/50 opacity-60'
                          : 'bg-card border-amber-500/30 dark:border-amber-500/20 shadow-sm'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={cn(
                              'text-xs font-semibold',
                              estaOmitida ? 'line-through text-muted-foreground' : 'text-foreground'
                            )}>
                              {c.nombre}
                            </span>
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-border">
                              {c.autopista}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {c.tramo}
                          </p>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <span
                            className={cn(
                              'text-xs font-bold tabular-nums',
                              estaOmitida
                                ? 'text-muted-foreground line-through'
                                : 'text-amber-600 dark:text-amber-400'
                            )}
                          >
                            {pesos(c.costo).replace('.00', '')}
                          </span>
                          <Switch
                            checked={!estaOmitida}
                            onCheckedChange={() => onToggleCasetaOmitida?.(c.tramoClave)}
                            aria-label={`Activar ${c.nombre}`}
                          />
                        </div>
                      </div>
                      {estaOmitida && (
                        <span className="text-[10px] text-muted-foreground font-medium block mt-1">
                          Vía libre seleccionada (sin cobro de peaje)
                        </span>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Peajes o casetas adicionales manuales */}
          <div className="space-y-2 pt-2 border-t border-border/70">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Plus weight="bold" className="h-3.5 w-3.5" />
              Peaje o gasto de caseta adicional
            </span>

            <form onSubmit={handleAgregarPersonalizada} className="flex gap-1.5">
              <Input
                placeholder="Ej. Puente Coatza II / Libramiento"
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                className="text-xs h-8 flex-1"
              />
              <div className="relative w-24 shrink-0">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  $
                </span>
                <Input
                  type="number"
                  placeholder="0"
                  min="1"
                  step="1"
                  value={nuevoCosto}
                  onChange={(e) => setNuevoCosto(e.target.value)}
                  className="text-xs h-8 pl-5"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                disabled={!nuevoNombre.trim() || !nuevoCosto}
                className="h-8 px-2.5 text-xs font-medium"
              >
                Agregar
              </Button>
            </form>

            {casetasPersonalizadas?.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {casetasPersonalizadas.map((cp) => (
                  <div
                    key={cp.id}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/40 border border-border text-xs"
                  >
                    <span className="font-medium text-foreground truncate mr-2">
                      {cp.nombre}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                        {pesos(cp.costo).replace('.00', '')}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => onRemoveCasetaPersonalizada?.(cp.id)}
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer con Total y Botón de cierre */}
        <DialogFooter className="p-3 border-t border-border/70 bg-muted/30 flex items-center justify-between sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">
              Total Peajes:
            </span>
            <span className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              {pesos(totalPeajes).replace('.00', '')}
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-8 font-medium"
          >
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
