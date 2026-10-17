import type * as React from 'react';
import { cn } from '@/lib/utils';

/** A shimmering placeholder shaped like the content that is loading (design spec). */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        'rounded-md bg-[linear-gradient(90deg,rgb(255_255_255/0.05),rgb(255_255_255/0.12),rgb(255_255_255/0.05))] bg-[length:200%_100%] [animation:shimmer_1.4s_linear_infinite]',
        className,
      )}
      {...props}
    />
  );
}

/** Generic page skeleton: a few stat tiles, a chart and a table. Used by the routes' loading.tsx. */
function PageSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-6" aria-busy="true">
      <Skeleton className="h-7 w-48" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-56 rounded-xl" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export { PageSkeleton, Skeleton };
