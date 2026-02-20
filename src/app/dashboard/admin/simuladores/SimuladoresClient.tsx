'use client'

import { useState } from 'react'
import Link from 'next/link'

type SimExpansaoResult = {
  receitaProjetada12m: number
  margemProjetada: number
  roi: number
  breakEvenMeses: number
  custoAquisicao: number
  impactoValuation: number
}

export function SimuladoresClient() {
  const [form, setForm] = useState({
    pais: '',
    cac: 500,
    margem: 25,
    churn: 10,
    investimento: 50000,
    clientesAlvo: 100,
  })
  const [result, setResult] = useState<SimExpansaoResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSimular() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/simulador-expansao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok) setResult(data)
      else alert(data.error || 'Erro')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="flex gap-4 items-center mb-6">
        <Link href="/dashboard/admin" className="text-gray-500 hover:text-gray-700">← Admin</Link>
        <h1 className="heading-1">Simuladores</h1>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold text-slate-800 mb-4">Expansão Internacional</h2>
          <p className="text-sm text-gray-600 mb-4">
            Simule o impacto de entrar em um novo país.
          </p>
          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">País</label>
              <input
                type="text"
                value={form.pais}
                onChange={(e) => setForm((p) => ({ ...p, pais: e.target.value }))}
                placeholder="Ex: Argentina"
                className="w-full rounded border-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">CAC (R$)</label>
              <input
                type="number"
                value={form.cac}
                onChange={(e) => setForm((p) => ({ ...p, cac: Number(e.target.value) }))}
                className="w-full rounded border-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Margem (%)</label>
              <input
                type="number"
                value={form.margem}
                onChange={(e) => setForm((p) => ({ ...p, margem: Number(e.target.value) }))}
                min={0}
                max={100}
                className="w-full rounded border-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Churn mensal (%)</label>
              <input
                type="number"
                value={form.churn}
                onChange={(e) => setForm((p) => ({ ...p, churn: Number(e.target.value) }))}
                min={0}
                max={100}
                className="w-full rounded border-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Investimento (R$)</label>
              <input
                type="number"
                value={form.investimento}
                onChange={(e) => setForm((p) => ({ ...p, investimento: Number(e.target.value) }))}
                className="w-full rounded border-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Clientes alvo</label>
              <input
                type="number"
                value={form.clientesAlvo}
                onChange={(e) => setForm((p) => ({ ...p, clientesAlvo: Number(e.target.value) }))}
                className="w-full rounded border-gray-300"
              />
            </div>
          </div>
          <button onClick={handleSimular} disabled={loading} className="btn-primary">
            {loading ? 'Calculando...' : 'Simular'}
          </button>
        </div>

        {result && (
          <div className="card">
            <h2 className="font-semibold text-slate-800 mb-4">Resultado</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Receita projetada 12m</span>
                <span className="font-medium">R$ {result.receitaProjetada12m.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Margem projetada</span>
                <span>R$ {result.margemProjetada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">ROI</span>
                <span className={result.roi >= 0 ? 'text-green-600' : 'text-red-600'}>{result.roi}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Break-even (meses)</span>
                <span>{result.breakEvenMeses}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Impacto valuation</span>
                <span>R$ {result.impactoValuation.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
