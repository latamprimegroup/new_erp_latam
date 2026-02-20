'use client'

import { useEffect, useState } from 'react'

type KpiItem = {
  key: string
  label: string
  value: number
  meta: number
  unit: string
}

export function DashboardExecutivo() {
  const [kpis, setKpis] = useState<KpiItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/executivo')
      .then((r) => r.json())
      .then((d) => setKpis(d.kpis || []))
      .catch(() => setKpis([]))
      .finally(() => setLoading(false))
  }, [])

  function getBarColor(percent: number): string {
    if (percent >= 100) return 'bg-green-500'
    if (percent >= 80) return 'bg-green-400'
    if (percent >= 50) return 'bg-amber-400'
    return 'bg-red-400'
  }

  function formatValue(val: number, unit: string): string {
    if (unit === 'R$') return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    return val.toLocaleString('pt-BR')
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="card animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
            <div className="h-8 bg-gray-100 rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      {kpis.map((k, i) => {
        const hasMeta = k.meta > 0
        const percent = hasMeta ? Math.min(100, (k.value / k.meta) * 100) : 0

        return (
          <div key={k.key} className="card group hover:-translate-y-1 animate-fade-in">
            <h3 className="font-medium text-slate-600 text-sm">{k.label}</h3>
            <p className="text-2xl font-bold text-primary-600 mt-1 tabular-nums">
              {formatValue(k.value, k.unit)}
            </p>
            {hasMeta && (
              <>
                <p className="text-xs text-slate-500 mt-1.5">
                  {percent.toFixed(0)}% da meta ({formatValue(k.meta, k.unit)})
                </p>
                <div className="mt-2.5 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${getBarColor(percent)}`}
                    style={{ width: `${Math.min(100, percent)}%` }}
                  />
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
