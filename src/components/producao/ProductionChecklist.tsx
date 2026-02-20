'use client'

import { useState, useEffect } from 'react'

const STEP_LABELS: Record<string, string> = {
  EMAIL_OK: 'E-mail válido e configurado',
  CNPJ_OK: 'CNPJ vinculado e ativo',
  PAGAMENTO_OK: 'Perfil de pagamento configurado',
  PLATAFORMA_CRIADA: 'Conta criada na plataforma',
  DADOS_VERIFICADOS: 'Dados preenchidos corretamente',
}

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
    fetch(`/api/producao/checklist?accountId=${accountId}`)
      .then((r) => r.json())
      .then((d) => setItems(d.checklist || []))
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

  if (loading || items.length === 0) return null

  const done = items.filter((i) => i.completed).length
  const total = items.length

  if (compact) {
    return (
      <div className="flex items-center gap-1 text-xs text-gray-600">
        <span>
          Checklist: {done}/{total}
        </span>
        {done === total && (
          <span className="text-green-600 font-medium">✓</span>
        )}
      </div>
    )
  }

  return (
    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
      <p className="text-xs font-medium text-gray-600 mb-2">
        Checklist de qualidade ({done}/{total})
      </p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <label
            key={item.id}
            className={`flex items-center gap-2 text-sm cursor-pointer ${
              isProducer ? 'hover:bg-gray-100 rounded px-1 -mx-1' : ''
            } ${item.completed ? 'text-green-700' : 'text-gray-600'}`}
          >
            <input
              type="checkbox"
              checked={item.completed}
              onChange={(e) => toggle(item.stepType, e.target.checked)}
              disabled={!isProducer || !!updating}
              className="rounded border-gray-300 text-green-600"
            />
            <span>{STEP_LABELS[item.stepType] || item.stepType}</span>
            {updating === item.stepType && (
              <span className="text-xs text-gray-400">...</span>
            )}
          </label>
        ))}
      </div>
    </div>
  )
}
