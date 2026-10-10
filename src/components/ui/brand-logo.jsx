import { cn } from '@/lib/utils';

export function BrandLogo({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      className={cn('h-7 w-7 shrink-0', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="brand-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#090d16" />
        </linearGradient>
        <linearGradient id="brand-route" x1="14" y1="48" x2="50" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#brand-bg)" />
      <rect
        x="1.5"
        y="1.5"
        width="61"
        height="61"
        rx="14.5"
        stroke="#ffffff"
        strokeOpacity="0.14"
        strokeWidth="1.5"
      />
      <path
        d="M17 47C17 35 26 35 32 32C38 29 47 29 47 17"
        stroke="url(#brand-route)"
        strokeWidth="5.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="47" r="6" fill="#0f172a" stroke="#38bdf8" strokeWidth="3.5" />
      <circle cx="17" cy="47" r="2" fill="#f8fafc" />
      <circle cx="32" cy="32" r="4" fill="#0f172a" stroke="#60a5fa" strokeWidth="3" />
      <circle cx="47" cy="17" r="7" fill="#10b981" />
      <circle cx="47" cy="17" r="3" fill="#ffffff" />
    </svg>
  );
}
