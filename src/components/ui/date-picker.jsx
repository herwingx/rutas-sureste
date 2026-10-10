/**
 * @fileoverview Selector de Fecha (`DatePicker`) basado en la composición oficial de shadcn/ui
 * (`Popover` + `Calendar` de `react-day-picker` v9 + `date-fns` con localización en español).
 *
 * Incluye:
 * - Conversión segura entre cadenas `YYYY-MM-DD` e instancias `Date` locales al mediodía
 *   (`12:00:00`) para evitar desfases de día por huso horario UTC.
 * - Botones de acceso rápido en el pie del calendario ("Hoy" y "Mañana").
 */

import { useState, useMemo } from 'react';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarDots } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Convierte una cadena ISO `YYYY-MM-DD` en un objeto `Date` local a las 12:00 hrs.
 * @param {string} iso - Fecha en formato `YYYY-MM-DD`.
 * @returns {Date|undefined}
 */
function parseIsoDate(iso) {
  if (!iso) return undefined;
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 12, 0, 0);
}

/**
 * Formatea un objeto `Date` a cadena ISO `YYYY-MM-DD`.
 * @param {Date} date
 * @returns {string}
 */
function toIsoDate(date) {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Componente `DatePicker` controlado por cadena `YYYY-MM-DD`.
 * @param {{ value: string, onChange: (iso: string) => void, className?: string }} props
 */
export function DatePicker({ value, onChange, className }) {
  const [open, setOpen] = useState(false);
  const selectedDate = useMemo(() => parseIsoDate(value), [value]);

  const handleSelect = (day) => {
    if (!day) return;
    onChange?.(toIsoDate(day));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-empty={!selectedDate}
          className={cn(
            'w-35.5 justify-start text-left font-medium tabular-nums data-[empty=true]:text-muted-foreground',
            className
          )}
        >
          <CalendarDots weight="duotone" className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate capitalize">
            {selectedDate ? format(selectedDate, 'dd MMM yyyy', { locale: es }) : 'Elegir fecha'}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          defaultMonth={selectedDate}
          onSelect={handleSelect}
        />
        <div className="flex items-center justify-between gap-1 border-t border-border bg-muted/30 px-2.5 py-2">
          {[
            { label: 'Ayer', offset: -1 },
            { label: 'Hoy', offset: 0 },
            { label: 'Mañana', offset: 1 },
          ].map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant="ghost"
              size="xs"
              className="flex-1 text-[11px]"
              onClick={() => handleSelect(addDays(new Date(), preset.offset))}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

