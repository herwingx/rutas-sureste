import { DayPicker } from 'react-day-picker';
import { es } from 'date-fns/locale';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

function Calendar({ className, classNames, showOutsideDays = true, ...props }) {
  return (
    <DayPicker
      locale={es}
      showOutsideDays={showOutsideDays}
      className={cn('p-2.5 select-none', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-2',
        month: 'flex flex-col gap-2.5',
        month_caption: 'relative flex items-center justify-center pt-0.5 h-7',
        caption_label: 'text-xs font-semibold capitalize text-foreground',
        nav: 'flex items-center gap-1',
        button_previous: cn(
          buttonVariants({ variant: 'outline', size: 'icon-xs' }),
          'absolute left-0 top-0 h-6.5 w-6.5 bg-transparent p-0 opacity-75 hover:opacity-100 z-10'
        ),
        button_next: cn(
          buttonVariants({ variant: 'outline', size: 'icon-xs' }),
          'absolute right-0 top-0 h-6.5 w-6.5 bg-transparent p-0 opacity-75 hover:opacity-100 z-10'
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday:
          'text-muted-foreground rounded-md w-8 font-medium text-[10px] uppercase text-center py-1',
        week: 'flex w-full mt-0.5',
        day: 'relative p-0 text-center text-xs focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent/60 [&:has([aria-selected].day-outside)]:bg-accent/30 rounded-md',
        day_button: cn(
          buttonVariants({ variant: 'ghost', size: 'icon-xs' }),
          'h-8 w-8 p-0 font-normal tabular-nums text-xs aria-selected:opacity-100 cursor-pointer'
        ),
        selected:
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:font-semibold [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground [&>button]:focus:bg-primary [&>button]:focus:text-primary-foreground rounded-md',
        today: '[&>button]:border [&>button]:border-primary/40 [&>button]:font-semibold',
        outside:
          'day-outside text-muted-foreground/45 aria-selected:bg-accent/40 aria-selected:text-muted-foreground',
        disabled: 'text-muted-foreground opacity-40',
        range_middle:
          'aria-selected:bg-accent aria-selected:text-accent-foreground',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <CaretLeft weight="bold" className="h-3.5 w-3.5" />
          ) : (
            <CaretRight weight="bold" className="h-3.5 w-3.5" />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };

