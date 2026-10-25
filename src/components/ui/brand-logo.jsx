import { cn } from '@/lib/utils';

export function BrandLogo({ className, alt = 'Rutas Sureste · Tiendas Neto' }) {
  return (
    <img
      src="/logo-app.png"
      alt={alt}
      className={cn(
        'h-8 w-8 rounded-xl object-contain shadow-xs border border-border/40 bg-white p-0.5 shrink-0 transition-transform hover:scale-105',
        className
      )}
      loading="eager"
    />
  );
}
