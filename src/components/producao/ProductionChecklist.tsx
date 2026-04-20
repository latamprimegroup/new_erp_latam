'use client'

import { useState, useEffect } from 'react'
import { PRODUCTION_CHECKLIST_LABELS } from '@/lib/production-checklist'

type ChecklistItem = {
  id: string
  stepType: string
  completed: boolean
  completedAt: string | null
}

export function ProductionChecklist({
  accountId,
  isProducer,
  compact = false,
}: {
  accountId: string
  isProducer: boolean
  compact?: boolean
}) {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    if (!accountId) return
    setLoading(true)
    fetch(`/api/producao/checklist?accountId=${accountId}`)
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d.checklist) ? d.checklist : []))
      .finally(() => setLoading(false))
  }, [accountId])

  async function toggle(stepType: string, completed: boolean) {
    if (!isProducer) return
    setUpdating(stepType)
    try {
      const res = await fetch('/api/producao/checklist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, stepType, completed }),
      })
      if (res.ok) {
        const data = await res.json()
        setItems((prev) =>
          prev.map((i) => (i.stepType === stepType ? { ...i, ...data } : i))
        )
      }
    } finally {
      setUpdating(null)
    }
  }

  if (compact) {
    if (loading) {
      return <span className="text-xs text-gray-500 dark:text-gray-400">…</span>
    }
    if (items.length === 0) {
      return <span className="text-xs text-gray-500 dark:text-gray-400">—</span>
    }

    const done = items.filter((i) => i.completed).length
    const total = items.length
    const pending = items.filter((i) => !i.completed)

    return (
      <div className="relative group inline-block max-w-[11rem]">
        <span
          className="cursor-help border-b border-dotted border-gray-500 dark:border-gray-400 text-xs text-gray-600 dark:text-gray-400"
          tabIndex={0}
        >
          Checklist: {done}/{total}
          {done === total && <span className="text-green-600 dark:text-green-400 font-medium ml-0.5">✓</span>}
        </span>
        <div
          className="invisible group-hover:visible group-focus-within:visible opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity absolute z-50 left-0 bottom-full mb-1 w-max max-w-[min(100vw-2rem,18rem)] rounded-md bg-slate-900 dark:bg-slate-950 text-white text-xs p-2.5 shadow-xl border border-white/10 pointer-events-none"
          role="tooltip"
        >
          {pending.length === 0 ? (
            <span>Todos os itens do checklist foram concluídos.</span>
          ) : (
            <>
              <p className="font-medium mb-1.5 text-white/90">Pendentes:</p>
              <ul className="list-disc pl-4 space-y-1 text-white/85">
                {pending.map((item) => (
                  <li key={item.stepType}>
                    {PRODUCTION_CHECKLIST_LABELS[item.stepType] || item.stepType}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    )
  }

  if (loading || items.length === 0) return null

  const done = items.filter((i) => i.completed).length
  const total = items.length

  return (
    <div className="mt-3 p-3 bg-gray-50 dark:bg-white/5 rounded-lg">
      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
        Checklist de qualidade ({done}/{total})
      </p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <label
            key={item.id}
            className={`flex items-center gap-2 text-sm cursor-pointer ${
              isProducer ? 'hover:bg-gray-100 dark:hover:bg-white/10 rounded px-1 -mx-1' : ''
            } ${item.completed ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}
          >
            <input
              type="checkbox"
              checked={item.completed}
              onChange={(e) => toggle(item.stepType, e.target.checked)}
              disabled={!isProducer || !!updating}
              className="rounded border-gray-300 text-green-600"
            />
            <span>{PRODUCTION_CHECKLIST_LABELS[item.stepType] || item.stepType}</span>
            {updating === item.stepType && (
              <span className="text-xs text-gray-400">...</span>
            )}
          </label>
        ))}
      </div>
    </div>
  )
}
