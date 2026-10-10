import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const TypographyH4 = forwardRef(({ className, ...props }, ref) => (
  <h4
    ref={ref}
    className={cn('scroll-m-20 text-xs font-bold tracking-tight text-foreground', className)}
    {...props}
  />
));
TypographyH4.displayName = 'TypographyH4';

const TypographyLarge = forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-lg font-extrabold tracking-tight tabular-nums text-foreground', className)}
    {...props}
  />
));
TypographyLarge.displayName = 'TypographyLarge';

const TypographySmall = forwardRef(({ className, ...props }, ref) => (
  <small
    ref={ref}
    className={cn('text-xs font-semibold leading-none text-foreground', className)}
    {...props}
  />
));
TypographySmall.displayName = 'TypographySmall';

const TypographyMuted = forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-[11px] text-muted-foreground leading-snug', className)} {...props} />
));
TypographyMuted.displayName = 'TypographyMuted';

const TypographyMono = forwardRef(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn('font-mono text-xs tabular-nums tracking-tight text-foreground', className)}
    {...props}
  />
));
TypographyMono.displayName = 'TypographyMono';

export {
  TypographyH4,
  TypographyLarge,
  TypographySmall,
  TypographyMuted,
  TypographyMono,
};
