/**
 * @fileoverview Barra de navegación inferior (solo móvil, < lg).
 * Máximo 5 destinos, icono + etiqueta, objetivo táctil ≥ 48 px y zona segura inferior.
 */

import { cn } from '@/lib/utils';

export function BottomNav({ items, active, onSelect }) {
  return (
    <nav
      aria-label="Navegación principal"
      className="shrink-0 border-t border-border bg-card pb-safe lg:hidden"
    >
      <ul className="grid auto-cols-fr grid-flow-col">
        {items.map(({ id, label, icon: Icon }) => {
          const activo = active === id;
          return (
            <li key={id} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-current={activo ? 'page' : undefined}
                className={cn(
                  'relative flex h-14 w-full flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  activo ? 'text-primary' : 'text-muted-foreground active:bg-accent/60'
                )}
              >
                {activo && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-primary"
                  />
                )}
                <Icon weight={activo ? 'fill' : 'regular'} className="h-5 w-5" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
