'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { whatsappHref } from '@/lib/manager-offer'
import { SUPPORT_WIKI_SNIPPETS } from '@/lib/support-quick-replies'

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
  updatedAt: string
  slaResponseAt: string | null
  slaResolveAt: string | null
  client: { user: { name: string | null; email: string } }
  account: {
    id: string
    platform: string
    type: string
    status: string
    manager: { user: { name: string | null; email: string } } | null
    supplier: { id: string; name: string; contact: string | null } | null
  }
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

function formatWaitingLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'agora'
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} h`
  const d = Math.floor(h / 24)
  return `${d} d`
}

async function copyWiki(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    alert('Não foi possível copiar')
  }
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
            className="input-field py-1.5 px-2 w-52 text-sm"
          >
            <option value="">Todos</option>
            <option value="PENDENTES">Pendentes (aberto + análise)</option>
            <option value="RESOLVIDOS">Resolvidos (+ reposição aprovada)</option>
            <optgroup label="Por status">
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-xs text-gray-500 self-center">Base rápida (copiar):</span>
          {SUPPORT_WIKI_SNIPPETS.map((w) => (
            <button
              key={w.label}
              type="button"
              onClick={() => void copyWiki(w.text)}
              className="btn-secondary text-xs py-1 px-2"
            >
              {w.label}
            </button>
          ))}
          <Link href="/dashboard/financeiro" className="btn-secondary text-xs py-1 px-2 inline-flex items-center">
            Financeiro (reembolso manual)
          </Link>
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
                    <p className="text-xs text-amber-800 dark:text-amber-200 mt-1 font-medium">
                      SLA visual: aberto há {formatWaitingLabel(t.createdAt)}
                      {t.slaResponseAt && (
                        <span className="block text-gray-600 dark:text-gray-400 font-normal">
                          Prazo 1ª resposta (meta): {new Date(t.slaResponseAt).toLocaleString('pt-BR')}
                        </span>
                      )}
                      {t.status === 'OPEN' || t.status === 'IN_REVIEW'
                        ? ' — meta operacional: responder o quanto antes'
                        : ''}
                    </p>
                    {(t.account.manager || t.account.supplier) && (
                      <div className="text-xs text-gray-600 dark:text-gray-300 mt-2 space-y-0.5 border-l-2 border-primary-500/40 pl-2">
                        <p className="font-medium text-gray-700 dark:text-gray-200">Origem do ativo</p>
                        {t.account.manager && (
                          <p>
                            Gestor: {t.account.manager.user.name || t.account.manager.user.email}
                          </p>
                        )}
                        {t.account.supplier && (
                          <p className="flex flex-wrap items-center gap-2">
                            <span>Fornecedor: {t.account.supplier.name}</span>
                            {whatsappHref(t.account.supplier.contact) && (
                              <a
                                href={whatsappHref(t.account.supplier.contact)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 hover:underline"
                              >
                                WhatsApp
                              </a>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                    <p className="text-sm text-gray-700 mt-2">{t.description}</p>
                    {(t.banReason || t.needsReplacement || t.commercialOpsRequested) && (
                      <div className="flex gap-4 mt-2 text-xs text-gray-500">
                        {t.banReason && <span>Ban: {t.banReason}</span>}
                        {t.needsReplacement && <span>Reposição</span>}
                        {t.commercialOpsRequested && <span>Op. comercial</span>}
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      Criado: {new Date(t.createdAt).toLocaleString('pt-BR')}
                      {t.updatedAt !== t.createdAt && (
                        <> · Atualizado: {new Date(t.updatedAt).toLocaleString('pt-BR')}</>
                      )}
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
