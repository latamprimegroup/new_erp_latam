'use client'

type ReputationCardProps = {
  score: number | null | undefined
  averageAccountLifetimeDays: number | null | undefined
  nicheTag: string | null | undefined
  refundCount: number | null | undefined
  plugPlayErrorCount: number | null | undefined
}

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

function tierLabel(score: number): string {
  if (score >= 80) return '🟢 VIP / Safe'
  if (score >= 50) return '🟡 Regular'
  return '🔴 High Risk'
}

export function ReputationCard({
  score,
  averageAccountLifetimeDays,
  nicheTag,
  refundCount,
  plugPlayErrorCount,
}: ReputationCardProps) {
  if (score == null) return null

  const safeScore = Math.max(0, Math.min(100, score))
  const blocked = safeScore < 50 || (plugPlayErrorCount ?? 0) >= 3

  return (
    <div className="rounded-lg border border-white/10 bg-white dark:bg-slate-900/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">Customer Health Score</p>
        <span className="text-xs font-medium">{tierLabel(safeScore)}</span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div className={`h-full ${scoreColor(safeScore)}`} style={{ width: `${safeScore}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
        <p>Score: <strong>{safeScore}/100</strong></p>
        <p>LTV ativo: <strong>{averageAccountLifetimeDays != null ? `${averageAccountLifetimeDays}d` : '—'}</strong></p>
        <p>Nicho: <strong>{nicheTag || '—'}</strong></p>
        <p>Reembolsos: <strong>{refundCount ?? 0}</strong></p>
      </div>
      {blocked && (
        <p className="mt-2 text-xs text-red-700 dark:text-red-300">
          Bloqueio ativo para compra de contas G2 Premium / Plug &amp; Play.
        </p>
      )}
      {(plugPlayErrorCount ?? 0) > 0 && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Substituições consecutivas Plug &amp; Play: {plugPlayErrorCount}
        </p>
      )}
    </div>
  )
}
