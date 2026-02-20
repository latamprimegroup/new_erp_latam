'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Ticket = {
  id: string
  type: string
  status: string
  banReason: string | null
  description: string
  needsReplacement: boolean
  commercialOpsRequested: boolean
  accountReturned: boolean | null
  createdAt: string
  client: { user: { name: string | null; email: string } }
  account: { id: string; platform: string; type: string; status: string }
}

const TYPE_LABELS: Record<string, string> = {
  BAN_CONTESTATION: 'Conta banida',
  REPLACEMENT_REQUEST: 'Reposição',
  PAUSED_NEEDS_OPS: 'Pausada – ops comercial',
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberto',
  IN_REVIEW: 'Em análise',
  REPLACEMENT_APPROVED: 'Reposição aprovada',
  RESOLVED: 'Resolvido',
  REJECTED: 'Rejeitado',
}

const PLATFORM_LABELS: Record<string, string> = {
  GOOGLE_ADS: 'Google Ads',
  META_ADS: 'Meta Ads',
  KWAI_ADS: 'Kwai',
  TIKTOK_ADS: 'TikTok',
  OTHER: 'Outro',
}

export default function AdminContestacoesPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [updating, setUpdating] = useState<string | null>(null)
  const [editModal, setEditModal] = useState<{ id: string; status: string; accountReturned: boolean | null; resolutionNotes: string } | null>(null)

  function load() {
    const params = filterStatus ? `?status=${filterStatus}` : ''
    fetch(`/api/admin/contestacoes${params}`)
      .then((r) => r.json())
      .then(setTickets)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setLoading(true)
    load()
  }, [filterStatus])

  async function handleUpdate(id: string, data: { status?: string; accountReturned?: boolean; resolutionNotes?: string }) {
    setUpdating(id)
    try {
      const res = await fetch('/api/admin/contestacoes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...data }),
      })
      if (res.ok) {
        load()
        setEditModal(null)
      } else {
        const err = await res.json()
        alert(err.error || 'Erro ao atualizar')
      }
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div>
      <div className="flex gap-4 items-center mb-6">
        <Link href="/dashboard/admin" className="text-gray-500 hover:text-gray-700">← Admin</Link>
        <h1 className="heading-1">Contestações e Operações Comerciais</h1>
      </div>

      <div className="card">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          <h2 className="font-semibold">Tickets de clientes</h2>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field py-1.5 px-2 w-40 text-sm"
          >
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-gray-500 py-8">Carregando...</p>
        ) : tickets.length === 0 ? (
          <p className="text-gray-500 py-8">Nenhum ticket.</p>
        ) : (
          <div className="space-y-4">
            {tickets.map((t) => (
              <div
                key={t.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-primary-600/20 transition-colors"
              >
                <div className="flex flex-wrap justify-between items-start gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{TYPE_LABELS[t.type] || t.type}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        t.status === 'RESOLVED' ? 'bg-green-100 text-green-800' :
                        t.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {STATUS_LABELS[t.status]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {t.client.user.name || t.client.user.email} • {PLATFORM_LABELS[t.account.platform]} — {t.account.type}
                    </p>
                    <p className="text-sm text-gray-700 mt-2">{t.description}</p>
                    {(t.banReason || t.needsReplacement || t.commercialOpsRequested) && (
                      <div className="flex gap-4 mt-2 text-xs text-gray-500">
                        {t.banReason && <span>Ban: {t.banReason}</span>}
                        {t.needsReplacement && <span>Reposição</span>}
                        {t.commercialOpsRequested && <span>Op. comercial</span>}
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(t.createdAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  {t.status === 'OPEN' || t.status === 'IN_REVIEW' ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditModal({
                          id: t.id,
                          status: t.status,
                          accountReturned: t.accountReturned,
                          resolutionNotes: '',
                        })}
                        className="btn-primary text-sm py-1.5 px-3"
                      >
                        Resolver
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="font-semibold mb-4">Resolver ticket</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={editModal.status}
                  onChange={(e) => setEditModal((m) => m ? { ...m, status: e.target.value } : m)}
                  className="input-field w-full"
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Conta voltou?</label>
                <select
                  value={editModal.accountReturned === null ? '' : String(editModal.accountReturned)}
                  onChange={(e) => setEditModal((m) => m ? {
                    ...m,
                    accountReturned: e.target.value === '' ? null : e.target.value === 'true',
                  } : m)}
                  className="input-field w-full"
                >
                  <option value="">—</option>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Observações da resolução</label>
                <textarea
                  value={editModal.resolutionNotes}
                  onChange={(e) => setEditModal((m) => m ? { ...m, resolutionNotes: e.target.value } : m)}
                  className="input-field w-full min-h-[80px]"
                  placeholder="Detalhes da resolução..."
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => handleUpdate(editModal.id, {
                  status: editModal.status,
                  accountReturned: editModal.accountReturned ?? undefined,
                  resolutionNotes: editModal.resolutionNotes || undefined,
                })}
                disabled={!!updating}
                className="btn-primary"
              >
                {updating ? 'Salvando...' : 'Salvar'}
              </button>
              <button onClick={() => setEditModal(null)} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
