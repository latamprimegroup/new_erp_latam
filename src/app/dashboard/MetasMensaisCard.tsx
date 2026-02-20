'use client'

import { useEffect, useState } from 'react'

type MetasResult = {
  metaProducao: number
  metaVendas: number
  producaoAtual: number
  vendasAtual: number
  percentualProducao: number
  percentualVendas: number
  diasRestantes: number
  ritmoProducaoNecessario: number
  ritmoVendasNecessario: number
  noRitmoProducao: boolean
  noRitmoVendas: boolean
  alertaProducao: boolean
  alertaVendas: boolean
}

export function MetasMensaisCard({ isAdmin = false }: { isAdmin?: boolean }) {
  const [data, setData] = useState<MetasResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [metaProducao, setMetaProducao] = useState(10000)
  const [metaVendas, setMetaVendas] = useState(10000)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/metas-globais')
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setMetaProducao(d.metaProducao ?? 10000)
        setMetaVendas(d.metaVendas ?? 10000)
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/metas-globais', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metaProducao, metaVendas }),
      })
      const d = await res.json()
      if (res.ok) setData(d)
      setEditMode(false)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !data) {
    return (
      <div className="card animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="h-20 bg-gray-100 rounded" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-[#1F2937]">Meta mensal: 10k produção e 10k vendas</h2>
        {isAdmin && (
          editMode ? (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary text-sm py-1 px-3"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                onClick={() => setEditMode(false)}
                className="btn-secondary text-sm py-1 px-3"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button onClick={() => setEditMode(true)} className="text-sm text-primary-600 hover:underline">
              Editar metas
            </button>
          )
        )}
      </div>

      {editMode && isAdmin && (
        <div className="flex gap-4 p-3 bg-gray-50 rounded-lg">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">Meta produção/mês</span>
            <input
              type="number"
              value={metaProducao}
              onChange={(e) => setMetaProducao(parseInt(e.target.value, 10) || 0)}
              className="input w-32"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">Meta vendas/mês</span>
            <input
              type="number"
              value={metaVendas}
              onChange={(e) => setMetaVendas(parseInt(e.target.value, 10) || 0)}
              className="input w-32"
            />
          </label>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Produção */}
        <div
          className={`card transition-all ${
            data.alertaProducao ? 'ring-2 ring-amber-400 bg-amber-50/50' : ''
          }`}
        >
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-medium text-[#1F2937]/70 text-sm">Produção no mês</h3>
              <p className="text-2xl font-bold text-primary-600 mt-1">
                {data.producaoAtual.toLocaleString('pt-BR')} / {data.metaProducao.toLocaleString('pt-BR')}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {data.percentualProducao.toFixed(1)}% da meta
              </p>
            </div>
            <span
              className={`text-xs px-2 py-1 rounded ${
                data.noRitmoProducao ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {data.noRitmoProducao ? 'No ritmo' : 'Abaixo do ritmo'}
            </span>
          </div>
          <div className="mt-3 h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-600 to-primary-500 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, data.percentualProducao)}%` }}
            />
          </div>
          {data.diasRestantes > 0 && !data.noRitmoProducao && (
            <p className="text-xs text-amber-700 mt-2">
              Ritmo necessário: <strong>{data.ritmoProducaoNecessario.toLocaleString('pt-BR')}</strong>{' '}
              contas/dia para bater a meta
            </p>
          )}
        </div>

        {/* Vendas */}
        <div
          className={`card transition-all ${
            data.alertaVendas ? 'ring-2 ring-amber-400 bg-amber-50/50' : ''
          }`}
        >
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-medium text-[#1F2937]/70 text-sm">Vendas no mês</h3>
              <p className="text-2xl font-bold text-primary-600 mt-1">
                {data.vendasAtual.toLocaleString('pt-BR')} / {data.metaVendas.toLocaleString('pt-BR')}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {data.percentualVendas.toFixed(1)}% da meta
              </p>
            </div>
            <span
              className={`text-xs px-2 py-1 rounded ${
                data.noRitmoVendas ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {data.noRitmoVendas ? 'No ritmo' : 'Abaixo do ritmo'}
            </span>
          </div>
          <div className="mt-3 h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent-500 to-accent-400 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, data.percentualVendas)}%` }}
            />
          </div>
          {data.diasRestantes > 0 && !data.noRitmoVendas && (
            <p className="text-xs text-amber-700 mt-2">
              Ritmo necessário: <strong>{data.ritmoVendasNecessario.toLocaleString('pt-BR')}</strong>{' '}
              contas/dia para bater a meta
            </p>
          )}
        </div>
      </div>

      {(data.alertaProducao || data.alertaVendas) && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Atenção: metas abaixo de 80% no meio do mês. Ajuste o ritmo de produção e vendas.
        </div>
      )}
    </div>
  )
}
