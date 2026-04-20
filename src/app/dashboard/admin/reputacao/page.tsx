'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getReputationBadge, BADGE_LABELS, BADGE_STYLES } from '@/lib/reputation'

type Client = {
  id: string
  reputationScore: number | null
  refundCount: number
  nicheTag: string | null
  plugPlayErrorCount: number
  averageAccountLifetimeDays: number | null
  user: { name: string | null; email: string }
}

export default function ReputacaoPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState({
    reputationScore: 50,
    refundCount: 0,
    nicheTag: '' as string,
  })

  useEffect(() => {
    fetch('/api/clientes')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setClients(
            data.map((c: { id: string; reputationScore?: number | null; refundCount?: number; nicheTag?: string | null; user: { name: string | null; email: string } }) => ({
              id: c.id,
              reputationScore: c.reputationScore ?? null,
              refundCount: c.refundCount ?? 0,
              nicheTag: c.nicheTag ?? null,
              plugPlayErrorCount: (c as { plugPlayErrorCount?: number }).plugPlayErrorCount ?? 0,
              averageAccountLifetimeDays: (c as { averageAccountLifetimeDays?: number | null }).averageAccountLifetimeDays ?? null,
              user: c.user,
            }))
          )
        }
      })
      .finally(() => setLoading(false))
  }, [])

  async function saveReputation(clientId: string) {
    const res = await fetch(`/api/clientes/${clientId}/reputation`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reputationScore: form.reputationScore,
        refundCount: form.refundCount,
        nicheTag: form.nicheTag || null,
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? {
                ...c,
                reputationScore: updated.reputationScore,
                refundCount: updated.refundCount,
                nicheTag: updated.nicheTag,
              }
            : c
        )
      )
      setEditing(null)
    } else {
      alert((await res.json()).error || 'Erro ao salvar')
    }
  }

  if (loading) return <p className="text-gray-500 py-8">Carregando...</p>

  return (
    <div className="p-6">
      <Link href="/dashboard/admin" className="text-gray-500 hover:text-gray-700 mb-4 inline-block">
        ← Admin
      </Link>
      <h1 className="heading-1 mb-6">Perfil de Reputação de Clientes</h1>
      <p className="text-gray-600 mb-6 text-sm">
        Score 0–100: VIP (80+), Regular (50–79), High Risk (&lt;50). Clientes High Risk têm venda de G2 Premium bloqueada.
      </p>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2 pr-4">Cliente</th>
              <th className="pb-2 pr-4">Score</th>
              <th className="pb-2 pr-4">Badge</th>
              <th className="pb-2 pr-4">Saúde</th>
              <th className="pb-2 pr-4">Reembolsos</th>
              <th className="pb-2 pr-4">Nicho</th>
              <th className="pb-2">Ação</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const badge = getReputationBadge(c.reputationScore)
              const isEditing = editing === c.id
              return (
                <tr key={c.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-3 pr-4">{c.user?.name || c.user?.email}</td>
                  <td className="py-3 pr-4">
                    {isEditing ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={form.reputationScore}
                        onChange={(e) => setForm((f) => ({ ...f, reputationScore: Number(e.target.value) || 0 }))}
                        className="input-field w-20 text-sm"
                      />
                    ) : (
                      c.reputationScore ?? '—'
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {badge && (
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${BADGE_STYLES[badge]}`}>
                        {BADGE_LABELS[badge]}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 min-w-[220px]">
                    <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          (c.reputationScore ?? 50) >= 80
                            ? 'bg-emerald-500'
                            : (c.reputationScore ?? 50) >= 50
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.max(0, Math.min(100, c.reputationScore ?? 50))}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">
                      LTV ativo: {c.averageAccountLifetimeDays != null ? `${c.averageAccountLifetimeDays}d` : '—'} ·
                      Erros seguidos P&amp;P: {c.plugPlayErrorCount}
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    {isEditing ? (
                      <input
                        type="number"
                        min={0}
                        value={form.refundCount}
                        onChange={(e) => setForm((f) => ({ ...f, refundCount: Number(e.target.value) || 0 }))}
                        className="input-field w-16 text-sm"
                      />
                    ) : (
                      c.refundCount
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {isEditing ? (
                      <select
                        value={form.nicheTag}
                        onChange={(e) => setForm((f) => ({ ...f, nicheTag: e.target.value }))}
                        className="input-field w-28 text-sm"
                      >
                        <option value="">—</option>
                        <option value="WHITE">WHITE</option>
                        <option value="BLACK">BLACK</option>
                        <option value="NUTRA">NUTRA</option>
                        <option value="CASINO">CASINO</option>
                      </select>
                    ) : (
                      c.nicheTag ?? '—'
                    )}
                  </td>
                  <td className="py-3">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveReputation(c.id)}
                          className="text-primary-600 hover:underline text-sm"
                        >
                          Salvar
                        </button>
                        <button onClick={() => setEditing(null)} className="text-gray-500 hover:underline text-sm">
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditing(c.id)
                          setForm({
                            reputationScore: c.reputationScore ?? 50,
                            refundCount: c.refundCount,
                            nicheTag: c.nicheTag ?? '',
                          })
                        }}
                        className="text-primary-600 hover:underline text-sm"
                      >
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
