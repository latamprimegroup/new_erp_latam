'use client'

import { useState, useEffect } from 'react'

type Goal = {
  id: string
  dailyTarget: number
  monthlyTarget: number
  productionCurrent: number
  bonus: { toString: () => string } | null
  status: string
  user: { id: string; name: string | null; email: string }
}

type Producer = {
  id: string
  name: string | null
  email: string
}

export function MetasClient() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [producers, setProducers] = useState<Producer[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showRelease, setShowRelease] = useState<string | null>(null)
  const [form, setForm] = useState({
    userId: '',
    dailyTarget: 20,
    monthlyTarget: 400,
    bonus: 0,
  })
  const [releaseValue, setReleaseValue] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    setLoading(true)
    const [goalsRes, prodRes] = await Promise.all([
      fetch('/api/metas'),
      fetch('/api/produtores'),
    ])
    const goalsData = await goalsRes.json()
    const prodData = await prodRes.json()
    if (goalsRes.ok) setGoals(goalsData)
    if (prodRes.ok) setProducers(prodData)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreateGoal(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await fetch('/api/metas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setShowForm(false)
      setForm({ userId: '', dailyTarget: 20, monthlyTarget: 400, bonus: 0 })
      load()
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao criar meta')
    }
    setSubmitting(false)
  }

  async function handleReleaseBonus(goalId: string) {
    setSubmitting(true)
    const res = await fetch('/api/metas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalId, value: releaseValue }),
    })
    if (res.ok) {
      setShowRelease(null)
      setReleaseValue(0)
      load()
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao liberar bônus')
    }
    setSubmitting(false)
  }

  return (
    <div>
      <h1 className="heading-1 mb-6">
        Metas & Bônus
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {goals.map((g) => {
          const pctDaily = g.dailyTarget > 0 ? Math.min(100, Math.round((g.productionCurrent / g.dailyTarget) * 100)) : 0
          const pctMonthly = g.monthlyTarget > 0 ? Math.min(100, Math.round((g.productionCurrent / g.monthlyTarget) * 100)) : 0
          return (
            <div key={g.id} className="card">
              <p className="text-sm font-medium text-[#1F2937]">
                {g.user.name || g.user.email}
              </p>
              <div className="mt-2 space-y-1">
                <div>
                  <span className="text-xs text-gray-500">Meta diária:</span>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mt-0.5">
                    <div
                      className="h-full bg-accent-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, pctDaily)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">{g.productionCurrent} / {g.dailyTarget}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Meta mensal:</span>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mt-0.5">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, pctMonthly)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">{g.productionCurrent} / {g.monthlyTarget} ({pctMonthly}%)</span>
                </div>
              </div>
              {g.bonus && (
                <p className="text-xs text-gray-500 mt-2">Bônus: R$ {Number(g.bonus).toLocaleString('pt-BR')}</p>
              )}
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          <h2 className="font-semibold">Tabela de Metas</h2>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            {showForm ? 'Cancelar' : 'Nova Meta'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreateGoal} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3 border border-primary-600/5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Produtor *</label>
                <select
                  value={form.userId}
                  onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                  className="input-field"
                  required
                >
                  <option value="">Selecione...</option>
                  {producers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name || p.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Meta diária</label>
                <input
                  type="number"
                  min={1}
                  value={form.dailyTarget}
                  onChange={(e) => setForm((f) => ({ ...f, dailyTarget: Number(e.target.value) || 1 }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Meta mensal</label>
                <input
                  type="number"
                  min={1}
                  value={form.monthlyTarget}
                  onChange={(e) => setForm((f) => ({ ...f, monthlyTarget: Number(e.target.value) || 1 }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Bônus (R$)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.bonus || ''}
                  onChange={(e) => setForm((f) => ({ ...f, bonus: Number(e.target.value) || 0 }))}
                  className="input-field"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? 'Salvando...' : 'Salvar'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          {loading ? (
            <p className="text-gray-500 py-4">Carregando...</p>
          ) : goals.length === 0 ? (
            <p className="text-gray-400 py-4">Nenhuma meta cadastrada. Adicione produtores e crie metas.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">Colaborador</th>
                  <th className="pb-2 pr-4">Meta diária</th>
                  <th className="pb-2 pr-4">Meta mensal</th>
                  <th className="pb-2 pr-4">Produção atual</th>
                  <th className="pb-2 pr-4">% meta</th>
                  <th className="pb-2 pr-4">Bônus</th>
                  <th className="pb-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {goals.map((g) => {
                  const pct = g.monthlyTarget > 0 ? Math.round((g.productionCurrent / g.monthlyTarget) * 100) : 0
                  return (
                    <tr key={g.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 pr-4">{g.user.name || g.user.email}</td>
                      <td className="py-3 pr-4">{g.dailyTarget}</td>
                      <td className="py-3 pr-4">{g.monthlyTarget}</td>
                      <td className="py-3 pr-4">{g.productionCurrent}</td>
                      <td className="py-3 pr-4">{pct}%</td>
                      <td className="py-3 pr-4">{g.bonus ? `R$ ${Number(g.bonus).toLocaleString()}` : '—'}</td>
                      <td className="py-3">
                        {showRelease === g.id ? (
                          <div className="flex gap-2 items-center">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={releaseValue || ''}
                              onChange={(e) => setReleaseValue(Number(e.target.value) || 0)}
                              className="input-field w-24 py-1 text-sm"
                              placeholder="Valor"
                            />
                            <button
                              onClick={() => handleReleaseBonus(g.id)}
                              disabled={submitting}
                              className="link-primary text-xs"
                            >
                              Liberar
                            </button>
                            <button
                              onClick={() => setShowRelease(null)}
                              className="text-gray-500 hover:underline text-xs"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowRelease(g.id)}
                            className="text-primary-600 hover:underline text-xs"
                          >
                            Liberar Bônus
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
