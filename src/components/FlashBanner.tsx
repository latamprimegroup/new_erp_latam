'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

type FlashType = 'success' | 'error' | 'info'

export function FlashBanner({
  message,
  type = 'info',
  onDismiss,
  autoMs = 6000,
}: {
  message: string | null
  type?: FlashType
  onDismiss?: () => void
  /** 0 = sem auto-fechar */
  autoMs?: number
}) {
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  useEffect(() => {
    if (!message || autoMs <= 0) return
    const t = window.setTimeout(() => dismissRef.current?.(), autoMs)
    return () => window.clearTimeout(t)
  }, [message, autoMs])

  if (!message) return null

  const styles: Record<FlashType, string> = {
    success:
      'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 border-emerald-200 dark:border-emerald-800',
    error:
      'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800',
    info: 'bg-sky-50 dark:bg-sky-950/30 text-sky-900 dark:text-sky-100 border-sky-200 dark:border-sky-800',
  }

  return (
    <div
      role="status"
      className={`mb-4 p-3 rounded-lg border text-sm flex justify-between items-start gap-3 shadow-sm ${styles[type]}`}
    >
      <span className="flex-1 min-w-0">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10"
          aria-label="Fechar"
        >
          <X className="w-4 h-4 opacity-70" />
        </button>
      )}
    </div>
  )
}
