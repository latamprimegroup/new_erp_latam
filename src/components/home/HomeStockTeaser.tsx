'use client'

import { useEffect, useState } from 'react'

type Snap = { enabled: boolean; available?: number; label?: string }

function textFor(s: Snap): string | null {
  if (!s.enabled || s.available === undefined) return null
  if (s.available === 0) {
    return 'Estoque sob consulta — fale com o time comercial após o cadastro.'
  }
  if (s.label === 'exact') {
    return `${s.available} conta(s) disponível(is) para entrega neste momento.`
  }
  if (s.label === 'amplo') {
    return 'Amplo estoque disponível agora — finalize seu pedido com segurança.'
  }
  return 'Alto volume de contas prontas — equipe comercial pode priorizar sua operação.'
}

export function HomeStockTeaser() {
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/public/stock-snapshot')
      .then((r) => r.json())
      .then((j: Snap) => {
        const t = textFor(j)
        setMsg(t)
      })
      .catch(() => setMsg(null))
  }, [])

  if (!msg) return null

  return (
    <div
      className="mt-8 mx-auto max-w-lg rounded-xl border border-primary-500/25 bg-primary-500/5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200"
      role="status"
    >
      <p className="text-[11px] uppercase tracking-wide text-primary-600 dark:text-primary-400 font-semibold mb-1">
        Disponibilidade
      </p>
      <p>{msg}</p>
    </div>
  )
}
