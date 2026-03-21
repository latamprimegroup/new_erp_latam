'use client'

export function Skeleton({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gray-200 dark:bg-white/10 ${className}`}
      {...props}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-ads-dark-card p-5">
      <Skeleton className="h-4 w-2/3 mb-3" />
      <Skeleton className="h-8 w-1/2 mb-2" />
      <Skeleton className="h-3 w-full" />
    </div>
  )
}

export function SkeletonChart() {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-ads-dark-card p-5">
      <Skeleton className="h-4 w-1/3 mb-4" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  )
}
