'use client'

export function Skeleton({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800 ${className}`}
      {...props}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <Skeleton className="h-4 w-2/3 mb-3" />
      <Skeleton className="h-8 w-1/2 mb-2" />
      <Skeleton className="h-3 w-full" />
    </div>
  )
}

export function SkeletonChart() {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <Skeleton className="h-4 w-1/3 mb-4" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  )
}
