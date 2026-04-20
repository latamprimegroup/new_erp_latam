'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type Payload = {
  activeNiches: number
  cnpjsDisponiveisPool: number
  totalAtivos: number
  rgEstoque: { disponivel: number; emUso: number; utilizado: number }
  rgAlertaBaixo: boolean
  rgAlertaThreshold: number
}

export function AdsCoreGerenteInventoryBar() {
  const [data, setData] = useState<Payload | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setErr('')
    const res = await fetch('/api/ads-core/metrics/factory-inventory')
    const j = (await res.json()) as Payload & { error?: string }
    if (!res.ok) {
      setData(null)
      setErr(j.error || 'Não foi possível carregar inventário.')
      return
    }
    setData(j)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (err) {
    return (
      <div className="mb-6 rounded-xl border border-red-500/35 bg-red-950/25 px-4 py-3 text-sm text-red-100">
        {err}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mb-6 rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-3 text-sm text-gray-500">
        Carregando inventário da fábrica…
      </div>
    )
  }

  return (
    <div
      className={`mb-6 rounded-xl border px-4 py-4 space-y-3 ${
        data.rgAlertaBaixo
          ? 'border-amber-500/50 bg-amber-950/25'
          : 'border-primary-500/30 bg-primary-950/15'
      }`}
      role="region"
      aria-label="Inventário ADS CORE"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">
          Fábrica de contas — inventário em tempo real
        </p>
        <Link
          href="/dashboard/ads-core/rg-abastecimento"
          className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
          Abastecimento de RG →
        </Link>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <span className="text-gray-500 dark:text-gray-400">Nichos ativos</span>{' '}
          <strong className="font-mono text-gray-900 dark:text-gray-100 tabular-nums">{data.activeNiches}</strong>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">CNPJs no pool (sem colaborador)</span>{' '}
          <strong className="font-mono text-primary-600 dark:text-primary-400 tabular-nums">
            {data.cnpjsDisponiveisPool}
          </strong>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">Total de ativos cadastrados</span>{' '}
          <strong className="font-mono text-gray-800 dark:text-gray-200 tabular-nums">{data.totalAtivos}</strong>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">RGs em estoque (disponíveis)</span>{' '}
          <strong className="font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
            {data.rgEstoque.disponivel}
          </strong>
          <span className="text-gray-500 dark:text-gray-500 text-xs ml-1">
            · em uso {data.rgEstoque.emUso} · utilizados {data.rgEstoque.utilizado}
          </span>
        </div>
      </div>
      {data.rgAlertaBaixo && (
        <p className="text-xs font-medium text-amber-200 border border-amber-500/40 rounded-lg px-3 py-2 bg-amber-950/40">
          Atenção: estoque de pares RG abaixo de {data.rgAlertaThreshold}. Reforce o abastecimento para não travar a
          esteira dos colaboradores.
        </p>
      )}
    </div>
  )
}
