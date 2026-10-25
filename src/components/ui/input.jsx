import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const inputVariants = cva(
  'flex w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 font-sans text-foreground shadow-2xs transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        default: 'h-9 text-xs pointer-coarse:h-11 pointer-coarse:text-base',
        sm: 'h-8 px-2.5 text-xs pointer-coarse:h-10 pointer-coarse:text-base',
        lg: 'h-10 rounded-lg px-3.5 text-sm font-medium pointer-coarse:h-12 pointer-coarse:text-base',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

const Input = React.forwardRef(({ className, type = 'text', size, ...props }, ref) => (
  <input
    type={type}
    className={cn(inputVariants({ size }), className)}
    ref={ref}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input, inputVariants };

