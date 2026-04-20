'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

type Goal = {
  id: string
  dailyTarget: number
  monthlyTarget: number
  productionCurrent: number
  bonus: number | null
  minApprovalRatePercent: number | null
  qualityBonus: number | null
  approvalRatePercent: number | null
  qualityEligible: boolean | null
  status: string
  periodStart: string
  periodEnd: string
  user: { id: string; name: string | null; email: string }
}

type TeamIncentive = {
  volumeTarget: number
  bonusAmount: number
  currentVolume: number
  percent: number
  costPerAccount: number | null
}

type Producer = {
  id: string
  name: string | null
  email: string
}

function metaPeriodLabel(periodStart: string) {
  const d = new Date(periodStart)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export function MetasClient() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'ADMIN'

  const [goalsCurrent, setGoalsCurrent] = useState<Goal[]>([])
  const [goalsPast, setGoalsPast] = useState<Goal[]>([])
  const [producers, setProducers] = useState<Producer[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingPast, setLoadingPast] = useState(false)
  const [tableTab, setTableTab] = useState<'vigente' | 'historico'>('vigente')
  const [team, setTeam] = useState<TeamIncentive | null>(null)
  const [teamEditOpen, setTeamEditOpen] = useState(false)
  const [teamForm, setTeamForm] = useState({ volumeTarget: 0, bonusAmount: 0 })
  const [teamSaving, setTeamSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showRelease, setShowRelease] = useState<string | null>(null)
  const [form, setForm] = useState({
    userId: '',
    dailyTarget: 20,
    monthlyTarget: 400,
    bonus: 0,
    minApprovalRatePercent: '' as number | '',
    qualityBonus: '' as number | '',
  })
  const [releaseValue, setReleaseValue] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    setLoading(true)
    const [goalsRes, prodRes, teamRes] = await Promise.all([
      fetch('/api/metas'),
      fetch('/api/produtores'),
      fetch('/api/metas/team'),
    ])
    const goalsData = await goalsRes.json()
    const prodData = await prodRes.json()
    if (goalsRes.ok) setGoalsCurrent(goalsData)
    if (prodRes.ok) setProducers(prodData)
    if (teamRes.ok) {
      const t = await teamRes.json()
      setTeam(t)
      setTeamForm({ volumeTarget: t.volumeTarget ?? 0, bonusAmount: t.bonusAmount ?? 0 })
    }
    setLoading(false)
  }

  async function loadPast() {
    setLoadingPast(true)
    try {
      const res = await fetch('/api/metas?historical=1')
      if (res.ok) setGoalsPast(await res.json())
    } finally {
      setLoadingPast(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (tableTab === 'historico') loadPast()
  }, [tableTab])

  async function saveTeamIncentive(e: React.FormEvent) {
    e.preventDefault()
    setTeamSaving(true)
    try {
      const res = await fetch('/api/metas/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          volumeTarget: teamForm.volumeTarget,
          bonusAmount: teamForm.bonusAmount,
        }),
      })
      if (res.ok) {
        setTeamEditOpen(false)
        const t = await fetch('/api/metas/team').then((r) => r.json())
        setTeam(t)
      } else {
        const err = await res.json()
        alert(err.error || 'Erro ao salvar meta coletiva')
      }
    } finally {
      setTeamSaving(false)
    }
  }

  async function handleCreateGoal(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await fetch('/api/metas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        minApprovalRatePercent:
          form.minApprovalRatePercent === '' ? null : Number(form.minApprovalRatePercent),
        qualityBonus: form.qualityBonus === '' ? null : Number(form.qualityBonus),
      }),
    })
    if (res.ok) {
      setShowForm(false)
      setForm({
        userId: '',
        dailyTarget: 20,
        monthlyTarget: 400,
        bonus: 0,
        minApprovalRatePercent: '',
        qualityBonus: '',
      })
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

      {team && team.volumeTarget > 0 && (
        <div className="card mb-6">
          <div className="flex flex-wrap justify-between items-start gap-4 mb-3">
            <div>
              <h2 className="font-semibold text-[#1F2937]">Meta coletiva (mês)</h2>
              <p className="text-sm text-gray-500 mt-1">
                Se a operação atingir o volume, o bônus de equipe configurado aplica-se ao programa de incentivos
                (acompanhamento centralizado).
              </p>
            </div>
            {isAdmin && (
              <button type="button" onClick={() => setTeamEditOpen(!teamEditOpen)} className="btn-secondary text-sm">
                {teamEditOpen ? 'Fechar' : 'Configurar'}
              </button>
            )}
          </div>
          {isAdmin && teamEditOpen && (
            <form onSubmit={saveTeamIncentive} className="mb-4 flex flex-wrap gap-3 items-end p-3 bg-gray-50 rounded-lg border border-primary-600/5">
              <div>
                <label className="block text-xs font-medium mb-1">Volume alvo (contas/mês)</label>
                <input
                  type="number"
                  min={0}
                  className="input-field w-36"
                  value={teamForm.volumeTarget}
                  onChange={(e) =>
                    setTeamForm((f) => ({ ...f, volumeTarget: parseInt(e.target.value, 10) || 0 }))
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Bônus (R$)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="input-field w-36"
                  value={teamForm.bonusAmount}
                  onChange={(e) =>
                    setTeamForm((f) => ({ ...f, bonusAmount: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
              <button type="submit" disabled={teamSaving} className="btn-primary text-sm">
                {teamSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </form>
          )}
          <p className="text-sm text-gray-600">
            Progresso: <strong>{team.currentVolume}</strong> / {team.volumeTarget} contas aprovadas (
            {team.percent}%)
          </p>
          {team.bonusAmount > 0 && team.costPerAccount != null && (
            <p className="text-xs text-gray-500 mt-2">
              Custo equivalente por conta no alvo:{' '}
              {team.costPerAccount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          )}
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-primary-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, team.percent)}%` }}
            />
          </div>
        </div>
      )}

      {isAdmin && team && team.volumeTarget === 0 && (
        <div className="card mb-6">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <p className="text-sm text-gray-600">
              Meta coletiva opcional: defina volume + bônus para o time no mês.
            </p>
            <button type="button" onClick={() => setTeamEditOpen(true)} className="btn-secondary text-sm">
              Configurar meta coletiva
            </button>
          </div>
          {teamEditOpen && (
            <form onSubmit={saveTeamIncentive} className="mt-4 flex flex-wrap gap-3 items-end p-3 bg-gray-50 rounded-lg border border-primary-600/5">
              <div>
                <label className="block text-xs font-medium mb-1">Volume alvo (contas/mês)</label>
                <input
                  type="number"
                  min={0}
                  className="input-field w-36"
                  value={teamForm.volumeTarget}
                  onChange={(e) =>
                    setTeamForm((f) => ({ ...f, volumeTarget: parseInt(e.target.value, 10) || 0 }))
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Bônus (R$)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="input-field w-36"
                  value={teamForm.bonusAmount}
                  onChange={(e) =>
                    setTeamForm((f) => ({ ...f, bonusAmount: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
              <button type="submit" disabled={teamSaving} className="btn-primary text-sm">
                {teamSaving ? 'Salvando...' : 'Salvar'}
              </button>
              <button type="button" onClick={() => setTeamEditOpen(false)} className="btn-secondary text-sm">
                Cancelar
              </button>
            </form>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {goalsCurrent.map((g) => {
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
              {g.bonus != null && g.bonus > 0 && (
                <p className="text-xs text-gray-500 mt-2">Bônus: R$ {g.bonus.toLocaleString('pt-BR')}</p>
              )}
              {g.approvalRatePercent != null && (
                <p className="text-xs text-gray-500 mt-1">Taxa aprovação (mês): {g.approvalRatePercent}%</p>
              )}
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">Tabela de Metas</h2>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setTableTab('vigente')}
                className={
                  tableTab === 'vigente'
                    ? 'px-3 py-1.5 bg-primary-600 text-white'
                    : 'px-3 py-1.5 bg-white text-gray-600 hover:bg-gray-50'
                }
              >
                Vigente
              </button>
              <button
                type="button"
                onClick={() => setTableTab('historico')}
                className={
                  tableTab === 'historico'
                    ? 'px-3 py-1.5 bg-primary-600 text-white'
                    : 'px-3 py-1.5 bg-white text-gray-600 hover:bg-gray-50'
                }
              >
                Histórico
              </button>
            </div>
          </div>
          {isAdmin && (
            <button onClick={() => setShowForm(!showForm)} className="btn-primary">
              {showForm ? 'Cancelar' : 'Nova Meta'}
            </button>
          )}
        </div>

        {isAdmin && showForm && (
          <form onSubmit={handleCreateGoal} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3 border border-primary-600/5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
                <label className="block text-sm font-medium mb-1">Bônus volume (R$)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.bonus || ''}
                  onChange={(e) => setForm((f) => ({ ...f, bonus: Number(e.target.value) || 0 }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Taxa aprovação mín. (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="ex: 90"
                  value={form.minApprovalRatePercent === '' ? '' : form.minApprovalRatePercent}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      minApprovalRatePercent: e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Bônus qualidade (R$)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="opcional"
                  value={form.qualityBonus === '' ? '' : form.qualityBonus}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      qualityBonus: e.target.value === '' ? '' : parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="input-field"
                />
              </div>
            </div>
            {form.monthlyTarget > 0 && form.bonus > 0 && (
              <p className="text-xs text-gray-500">
                Simulador: com bônus de {form.bonus.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}{' '}
                para {form.monthlyTarget} contas, o custo médio por conta aprovada fica ≈{' '}
                {(form.bonus / form.monthlyTarget).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
                .
              </p>
            )}
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
          {tableTab === 'vigente' && loading ? (
            <p className="text-gray-500 py-4">Carregando...</p>
          ) : tableTab === 'historico' && loadingPast ? (
            <p className="text-gray-500 py-4">Carregando histórico...</p>
          ) : (tableTab === 'vigente' ? goalsCurrent : goalsPast).length === 0 ? (
            <p className="text-gray-400 py-4">
              {tableTab === 'vigente'
                ? 'Nenhuma meta cadastrada. Adicione produtores e crie metas.'
                : 'Nenhuma meta encerrada encontrada nos últimos 12 meses.'}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">Nome da meta</th>
                  <th className="pb-2 pr-4">Colaborador</th>
                  <th className="pb-2 pr-4">Meta diária</th>
                  <th className="pb-2 pr-4">Volume exigido (contas/mês)</th>
                  <th className="pb-2 pr-4">Produção {tableTab === 'historico' ? '(período)' : 'atual'}</th>
                  <th className="pb-2 pr-4">% meta</th>
                  <th className="pb-2 pr-4">Taxa apr.</th>
                  <th className="pb-2 pr-4">Bônus vol.</th>
                  <th className="pb-2 pr-4">Qualidade</th>
                  {isAdmin && tableTab === 'vigente' && <th className="pb-2">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {(tableTab === 'vigente' ? goalsCurrent : goalsPast).map((g) => {
                  const pct = g.monthlyTarget > 0 ? Math.round((g.productionCurrent / g.monthlyTarget) * 100) : 0
                  return (
                    <tr key={g.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 pr-4">Meta {metaPeriodLabel(g.periodStart)}</td>
                      <td className="py-3 pr-4">{g.user.name || g.user.email}</td>
                      <td className="py-3 pr-4">{g.dailyTarget}</td>
                      <td className="py-3 pr-4">{g.monthlyTarget}</td>
                      <td className="py-3 pr-4">{g.productionCurrent}</td>
                      <td className="py-3 pr-4">{pct}%</td>
                      <td className="py-3 pr-4">
                        {g.approvalRatePercent != null ? `${g.approvalRatePercent}%` : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        {g.bonus != null && g.bonus > 0
                          ? `R$ ${g.bonus.toLocaleString('pt-BR')}`
                          : '—'}
                      </td>
                      <td className="py-3 pr-4 text-xs">
                        {g.minApprovalRatePercent != null || (g.qualityBonus != null && g.qualityBonus > 0) ? (
                          <>
                            {g.minApprovalRatePercent != null ? `≥${g.minApprovalRatePercent}%` : '—'}
                            {g.qualityBonus != null && g.qualityBonus > 0
                              ? ` · R$ ${g.qualityBonus.toLocaleString('pt-BR')}`
                              : ''}
                            <br />
                            {g.qualityEligible === true && (
                              <span className="text-green-600">Elegível</span>
                            )}
                            {g.qualityEligible === false && (
                              <span className="text-amber-600">Fora da meta qual.</span>
                            )}
                            {g.qualityEligible === null && g.minApprovalRatePercent != null && (
                              <span className="text-gray-400">—</span>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      {isAdmin && tableTab === 'vigente' && (
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
                      )}
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
