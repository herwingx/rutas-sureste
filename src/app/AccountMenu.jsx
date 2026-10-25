/**
 * @fileoverview Menú de cuenta: concentra las acciones secundarias de la cabecera
 * (ficha vehicular, configuración, tema, atajos y cierre de sesión) para mantener la
 * barra superior limpia en cualquier ancho de pantalla.
 */

import { useState } from 'react';
import {
  CarProfile,
  SlidersHorizontal,
  SunDim,
  MoonStars,
  Keyboard,
  SignOut,
  CaretDown,
  CrownSimple,
} from '@phosphor-icons/react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

function iniciales(texto) {
  const partes = String(texto || '?')
    .replace(/[^\p{L}\s.]/gu, ' ')
    .split(/[\s.]+/)
    .filter(Boolean);
  return ((partes[0]?.[0] || '?') + (partes[1]?.[0] || '')).toUpperCase();
}

function Fila({ icon: Icon, children, onClick, tone = 'default', aviso = false, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-11 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-9',
        tone === 'danger'
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-foreground hover:bg-accent',
        className
      )}
    >
      <Icon weight="duotone" className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {aviso && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-label="Pendiente" />}
    </button>
  );
}

export function AccountMenu({
  email,
  nombre,
  isAdmin,
  perfilCompleto,
  dark,
  onToggleTheme,
  onOpenProfile,
  onOpenSettings,
  onOpenShortcuts,
  onSignOut,
}) {
  const [open, setOpen] = useState(false);
  const visible = nombre || email?.split('@')[0] || 'Cuenta';
  const cerrarYEjecutar = (fn) => () => {
    setOpen(false);
    fn?.();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Menú de cuenta"
          className="flex h-10 max-w-48 items-center gap-2 rounded-full border border-border bg-background pl-1 pr-2.5 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className={cn(
              'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
              isAdmin ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-primary/15 text-primary'
            )}
          >
            {iniciales(visible)}
            {!perfilCompleto && (
              <span
                className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-amber-500"
                aria-label="Ficha vehicular incompleta"
              />
            )}
          </span>
          <span className="hidden min-w-0 truncate sm:block">{visible.split(' ')[0]}</span>
          <CaretDown weight="bold" className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(18rem,calc(100vw-1.5rem))] p-1.5">
        <div className="px-2.5 pb-2 pt-1.5">
          <div className="flex items-center gap-1.5">
            <p className="min-w-0 truncate text-sm font-semibold">{visible}</p>
            {isAdmin && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                <CrownSimple weight="fill" className="h-3 w-3" aria-hidden="true" />
                Admin
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
        <div className="my-1 h-px bg-border" />
        <Fila icon={CarProfile} onClick={cerrarYEjecutar(onOpenProfile)} aviso={!perfilCompleto}>
          Mi ficha y vehículo
        </Fila>
        <Fila icon={SlidersHorizontal} onClick={cerrarYEjecutar(onOpenSettings)}>
          Configuración
        </Fila>
        <Fila icon={dark ? SunDim : MoonStars} onClick={cerrarYEjecutar(onToggleTheme)}>
          {dark ? 'Tema claro' : 'Tema oscuro'}
        </Fila>
        <Fila icon={Keyboard} onClick={cerrarYEjecutar(onOpenShortcuts)} className="hidden lg:flex">
          Atajos de teclado
        </Fila>
        <div className="my-1 h-px bg-border" />
        <Fila icon={SignOut} tone="danger" onClick={cerrarYEjecutar(onSignOut)}>
          Cerrar sesión
        </Fila>
      </PopoverContent>
    </Popover>
  );
}
